// Writes that must follow the locking rules (ADR 0012): reports with a log entry in the same
// transaction, entries with a log entry when their week is sent, and stopping the timer.
import {
	collection,
	doc,
	runTransaction,
	serverTimestamp,
	writeBatch,
	type DocumentData,
	type Firestore
} from 'firebase/firestore';
import { entryChange, reportChange } from '../domain/lasning.ts';
import type {
	ChangeAction,
	Entry,
	Id,
	IsoWeek,
	Report,
	Timer,
	UtcMillis
} from '../domain/types.ts';
import { entryCodec, reportCodec } from './dokument.ts';
import { createMeta, updateMeta } from './kodning.ts';

/** The document path below the user, as the log stores it: `reports/a1_r1_2026-W48`. */
export const userPath = (...segments: string[]): string => segments.join('/');

const userDoc = (db: Firestore, uid: Id, path: string) => doc(db, 'users', uid, path);

export class LockedChangeError extends Error {}

interface LogInput {
	path: string;
	action: ChangeAction;
	week: IsoWeek | null;
	before: DocumentData | null;
	after: DocumentData | null;
	reason: string;
}

/** A new changeLog document; the rules require `at` to be the server time and `by` to be app. */
const logData = (input: LogInput): DocumentData => ({
	...input,
	at: serverTimestamp(),
	by: 'app',
	...createMeta()
});

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
		let saved: Report = { ...after, id };
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
		const data = reportCodec.toData(saved);
		if (before) tx.update(ref, { ...data, ...updateMeta() });
		else tx.set(ref, { ...data, ...createMeta() });
		return saved;
	});

/**
 * Creates, changes or deletes an entry (`after` null). When the entry falls in a sent week a log
 * entry with before and after goes in the same batch; the reason may be empty. The rules do not
 * check this (ADR 0012), so it works offline too.
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

/** The id of the entry a stopped timer becomes, so two devices stopping it write one entry. */
export const timerEntryId = (timer: Timer): Id => `timer-${timer.start}`;

/** Writes the timer's entry and empties `state/timer` in one batch. */
export const stopTimer = async (
	db: Firestore,
	uid: Id,
	timer: Timer,
	end: UtcMillis,
	note = ''
): Promise<Entry> => {
	const entry: Entry = {
		id: timerEntryId(timer),
		assignmentId: timer.assignmentId,
		subject: timer.subject,
		time: { kind: 'interval', start: timer.start, end },
		note
	};
	const batch = writeBatch(db);
	batch.set(userDoc(db, uid, userPath('entries', entry.id)), {
		...entryCodec.toData(entry),
		...createMeta()
	});
	batch.delete(userDoc(db, uid, userPath('state', 'timer')));
	await batch.commit();
	return entry;
};
