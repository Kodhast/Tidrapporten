// Writes that must follow the locking rules (ADR 0012): reports with a log entry in the same
// transaction, entries with a log entry when their week is sent, and the timer.
import {
	collection,
	doc,
	runTransaction,
	serverTimestamp,
	setDoc,
	writeBatch,
	type DocumentData,
	type WriteBatch,
	type Firestore
} from 'firebase/firestore';
import { entryChange, reportChange } from '../domain/lasning.ts';
import { timerEnd, timerEntry } from '../domain/timer.ts';
import type {
	ChangeAction,
	Entry,
	Id,
	IsoWeek,
	Report,
	Timer,
	UtcMillis
} from '../domain/types.ts';
import { entryCodec, reportCodec, timerCodec } from './dokument.ts';
import { createMeta, updateMeta } from './kodning.ts';

/** The document path below the user, as the log stores it: `reports/a1_r1_2026-W48`. */
export const userPath = (...segments: string[]): string => segments.join('/');

export const userDoc = (db: Firestore, uid: Id, path: string) => doc(db, 'users', uid, path);

export class LockedChangeError extends Error {}

export interface LogInput {
	path: string;
	action: ChangeAction;
	week: IsoWeek | null;
	before: DocumentData | null;
	after: DocumentData | null;
	reason: string;
}

/** A new changeLog document; the rules require `at` to be the server time and `by` to be app. */
export const logData = (input: LogInput): DocumentData => ({
	...input,
	at: serverTimestamp(),
	by: 'app',
	...createMeta()
});

/** The stored report; when it is sent, the rules require the snapshot's time to be the server's. */
const reportData = (report: Report, action: ChangeAction): DocumentData => {
	const data = reportCodec.toData(report);
	return action === 'send'
		? { ...data, snapshot: { ...data.snapshot, sentAt: serverTimestamp() } }
		: data;
};

/**
 * Saves a report: creates it, changes it, sends it, unlocks it or deletes a draft (`after`
 * null). Runs as a transaction, so it fails offline instead of being queued. A locked change
 * (unlock, change of an unlocked report, sending it again) needs a reason and writes a new log
 * entry that the report's `lastChangeId` points to; the rules refuse it otherwise.
 */
export const saveReport = async (
	db: Firestore,
	uid: Id,
	id: Id,
	after: Report | null,
	reason = ''
): Promise<Report | null> =>
	runTransaction(db, async (tx) => {
		const ref = userDoc(db, uid, userPath('reports', id));
		const snap = await tx.get(ref);
		const before = snap.exists() ? reportCodec.fromData(id, snap.data()) : null;
		const change = reportChange(before, after);
		if (!change.allowed) throw new LockedChangeError(`Report ${id} cannot change like that`);
		if (change.locked && reason.trim() === '') {
			throw new LockedChangeError('A locked change needs a reason');
		}
		if (after === null) {
			tx.delete(ref);
			return null;
		}
		// An unlock keeps the stored snapshot, whose time the server set.
		let saved: Report =
			change.action === 'unlock' ? { ...after, id, snapshot: before!.snapshot } : { ...after, id };
		if (change.locked) {
			const logRef = doc(collection(db, 'users', uid, 'changeLog'));
			saved = { ...saved, lastChangeId: logRef.id };
			tx.set(
				logRef,
				logData({
					path: userPath('reports', id),
					action: change.action,
					week: after.week,
					before: before && reportCodec.toData(before),
					after: reportCodec.toData(saved),
					reason
				})
			);
		}
		if (change.action === 'unlock') {
			// The rules let an unlock change only these fields, so the stored report is not
			// rewritten from the decoded copy. The stored document must still pass the report
			// validator, so a schema change needs a migration before old reports can be unlocked.
			tx.update(ref, {
				status: saved.status,
				lastChangeId: saved.lastChangeId,
				updatedAt: serverTimestamp()
			});
		} else if (before) {
			tx.update(ref, { ...reportData(saved, change.action), ...updateMeta() });
		} else {
			tx.set(ref, { ...reportData(saved, change.action), ...createMeta() });
		}
		return saved;
	});

/**
 * Creates, changes or deletes an entry (`after` null). When the entry falls in a sent week a log
 * entry with before and after goes in the same batch; the reason may be empty. The rules do not
 * check this (ADR 0012), and a batch is queued offline, so the caller must not offer a
 * correction in a sent week while offline.
 */
export const saveEntry = async (
	db: Firestore,
	uid: Id,
	before: Entry | null,
	after: Entry | null,
	reports: readonly Report[],
	reason = ''
): Promise<void> => {
	const id = after?.id ?? before?.id;
	if (!id) throw new Error('An entry change needs an entry');
	if (before && after && before.id !== after.id) throw new Error('An entry keeps its id');
	const ref = userDoc(db, uid, userPath('entries', id));
	const batch = writeBatch(db);
	if (after === null) batch.delete(ref);
	else if (before === null) batch.set(ref, { ...entryCodec.toData(after), ...createMeta() });
	else batch.update(ref, { ...entryCodec.toData(after), ...updateMeta() });
	const change = entryChange(before, after, reports);
	if (change.logged) {
		batch.set(
			doc(collection(db, 'users', uid, 'changeLog')),
			logData({
				path: userPath('entries', id),
				action: change.action,
				week: change.week,
				before: before && entryCodec.toData(before),
				after: after && entryCodec.toData(after),
				reason
			})
		);
	}
	await batch.commit();
};

/**
 * The id of the entry a stopped timer becomes. Two devices stopping the same timer give the same
 * id; the second write is refused by the rules (it would change createdAt), so one entry remains
 * and the second device gets permission-denied.
 */
export const timerEntryId = (timer: Timer): Id => timerEntry(timer, timer.start).id;

/** Adds the stopped timer's entry to the batch, with a log entry when its week is sent. */
const addTimerEntry = (
	db: Firestore,
	uid: Id,
	batch: WriteBatch,
	timer: Timer,
	end: UtcMillis,
	reports: readonly Report[],
	note = ''
): Entry => {
	const entry = timerEntry(timer, end, note);
	batch.set(userDoc(db, uid, userPath('entries', entry.id)), {
		...entryCodec.toData(entry),
		...createMeta()
	});
	const change = entryChange(null, entry, reports);
	if (change.logged) {
		batch.set(
			doc(collection(db, 'users', uid, 'changeLog')),
			logData({
				path: userPath('entries', entry.id),
				action: 'create',
				week: change.week,
				before: null,
				after: entryCodec.toData(entry),
				reason: ''
			})
		);
	}
	return entry;
};

const timerPath = userPath('state', 'timer');

const MINUTE = 60_000;

/**
 * Starts the timer. A plain write, so it works offline and syncs later. When another device has
 * already started one, the rules refuse it (it would change createdAt), so a running timer is
 * never replaced.
 */
export const startTimer = (db: Firestore, uid: Id, timer: Timer): Promise<void> =>
	setDoc(userDoc(db, uid, timerPath), { ...timerCodec.toData(timer), ...createMeta() });

/**
 * Writes the timer's entry and empties `state/timer` in one batch, with a log entry when the
 * week is sent. The end is clamped as `timerEntry` says.
 */
export const stopTimer = async (
	db: Firestore,
	uid: Id,
	timer: Timer,
	end: UtcMillis,
	reports: readonly Report[] = [],
	note = ''
): Promise<Entry> => {
	const batch = writeBatch(db);
	const entry = addTimerEntry(db, uid, batch, timer, end, reports, note);
	batch.delete(userDoc(db, uid, timerPath));
	await batch.commit();
	return entry;
};

/**
 * Changes the running timer's code: the entry so far is written and the timer goes on with the
 * new code from the entry's end, in one batch, so that the two intervals meet. Within the first
 * minute there is nothing to write yet (an entry is at least a minute), so the code changes in
 * place and the start stays. If another device stopped or changed the timer first, the rules
 * refuse the whole batch.
 */
export const switchTimer = async (
	db: Firestore,
	uid: Id,
	timer: Timer,
	next: Pick<Timer, 'assignmentId' | 'subject'>,
	at: UtcMillis,
	reports: readonly Report[] = []
): Promise<Timer> => {
	const batch = writeBatch(db);
	let nextTimer: Timer = { ...next, start: timer.start };
	if (at >= timer.start + MINUTE) {
		addTimerEntry(db, uid, batch, timer, at, reports);
		nextTimer = { ...next, start: timerEnd(timer, at) };
	}
	batch.update(userDoc(db, uid, timerPath), {
		...timerCodec.toData(nextTimer),
		...updateMeta()
	});
	await batch.commit();
	return nextTimer;
};
