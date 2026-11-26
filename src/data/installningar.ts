// Reading and writing the settings (issue 17): assignments with their codes and receivers,
// absence types and free days. Every write is a transaction, which needs the server and fails
// offline instead of being queued (ADR 0012), and the changes that alter the flex of weeks
// already counted write a new changeLog entry in the same transaction (ADR 0016).
import {
	collection,
	doc,
	onSnapshot,
	runTransaction,
	type DocumentData,
	type Firestore,
	type Transaction
} from 'firebase/firestore';
import { assignmentChangeIsLogged, DEFAULT_ABSENCE_TYPES } from '../domain/installningar.ts';
import type {
	AbsenceType,
	Assignment,
	ChangeAction,
	FreeDay,
	Id,
	Receiver,
	TimeCode
} from '../domain/types.ts';
import {
	absenceTypeCodec,
	assignmentCodec,
	codeCodec,
	freeDayCodec,
	receiverCodec,
	type Codec
} from './dokument.ts';
import { createMeta, updateMeta } from './kodning.ts';
import { logData, userDoc, userPath } from './skrivning.ts';

/** Follows a collection below the user; `parentId` is the assignment for codes and receivers. */
export const watchCollection = <T>(
	db: Firestore,
	uid: Id,
	path: string,
	codec: Codec<T>,
	onChange: (values: T[]) => void,
	parentId?: Id
) =>
	onSnapshot(collection(db, 'users', uid, path), (snapshot) =>
		onChange(snapshot.docs.map((d) => codec.fromData(d.id, d.data(), parentId)))
	);

export const assignmentsPath = 'assignments';
export const codesPath = (assignmentId: Id) => userPath('assignments', assignmentId, 'codes');
export const receiversPath = (assignmentId: Id) =>
	userPath('assignments', assignmentId, 'receivers');
export const absenceTypesPath = 'absenceTypes';
export const freeDaysPath = 'freeDays';

/**
 * Writes one document in the transaction: creates it, or updates it so that createdAt stays.
 * With `logged` a new changeLog entry with the document before and after goes along, and the
 * document's lastChangeId names it (ADR 0016); the reason is empty.
 */
const write = (
	db: Firestore,
	uid: Id,
	tx: Transaction,
	path: string,
	before: DocumentData | null,
	after: DocumentData,
	logged: boolean
) => {
	const ref = userDoc(db, uid, path);
	let data = after;
	if (logged) {
		const logRef = doc(collection(db, 'users', uid, 'changeLog'));
		data = { ...after, lastChangeId: logRef.id };
		tx.set(
			logRef,
			logData({
				path,
				action: before ? 'update' : 'create',
				week: null,
				before,
				after: data,
				reason: ''
			})
		);
	}
	if (before) tx.update(ref, { ...data, ...updateMeta() });
	else tx.set(ref, { ...data, ...createMeta() });
};

export interface CodeChange {
	before: TimeCode | null;
	after: TimeCode;
}

/**
 * Saves an assignment and its codes together. A change of the start, end, opening balance or
 * terms is logged (ADR 0016); a new assignment and the codes are not.
 */
export const saveAssignment = (
	db: Firestore,
	uid: Id,
	before: Assignment | null,
	after: Assignment,
	codes: readonly CodeChange[] = []
): Promise<void> =>
	runTransaction(db, async (tx) => {
		write(
			db,
			uid,
			tx,
			userPath(assignmentsPath, after.id),
			before && assignmentCodec.toData(before),
			assignmentCodec.toData(after),
			assignmentChangeIsLogged(before, after)
		);
		for (const code of codes) {
			write(
				db,
				uid,
				tx,
				userPath(codesPath(after.id), code.after.id),
				code.before && codeCodec.toData(code.before),
				codeCodec.toData(code.after),
				false
			);
		}
	});

/** Saves a receiver. A new one, or a moved one, may change who counts for flex: logged. */
export const saveReceiver = (
	db: Firestore,
	uid: Id,
	before: Receiver | null,
	after: Receiver
): Promise<void> =>
	runTransaction(db, async (tx) => {
		write(
			db,
			uid,
			tx,
			userPath(receiversPath(after.assignmentId), after.id),
			before && receiverCodec.toData(before),
			receiverCodec.toData(after),
			before === null || before.position !== after.position
		);
	});

/** Saves an absence type; a changed counting is logged. */
export const saveAbsenceType = (
	db: Firestore,
	uid: Id,
	before: AbsenceType | null,
	after: AbsenceType
): Promise<void> =>
	runTransaction(db, async (tx) => {
		write(
			db,
			uid,
			tx,
			userPath(absenceTypesPath, after.id),
			before && absenceTypeCodec.toData(before),
			absenceTypeCodec.toData(after),
			before !== null && before.counting !== after.counting
		);
	});

/**
 * Creates, changes or removes (`after` null) a free day; every change is logged. A changed date
 * is a removal and a new day. The rules cannot tie a removal to a log entry, so the app writes
 * that entry itself (ADR 0016).
 */
export const saveFreeDay = (
	db: Firestore,
	uid: Id,
	before: FreeDay | null,
	after: FreeDay | null
): Promise<void> =>
	runTransaction(db, async (tx) => {
		const moved = before !== null && after !== null && before.date !== after.date;
		if (before && (after === null || moved)) {
			const path = userPath(freeDaysPath, before.date);
			tx.delete(userDoc(db, uid, path));
			tx.set(
				doc(collection(db, 'users', uid, 'changeLog')),
				logData({
					path,
					action: 'delete' satisfies ChangeAction,
					week: null,
					before: freeDayCodec.toData(before),
					after: null,
					reason: ''
				})
			);
		}
		if (after) {
			write(
				db,
				uid,
				tx,
				userPath(freeDaysPath, after.date),
				moved || !before ? null : freeDayCodec.toData(before),
				freeDayCodec.toData(after),
				true
			);
		}
	});

/**
 * Creates the default absence types that are missing, by their fixed ids, so that the first
 * sign-in on two devices gives one set. A type the owner renamed is kept as it is.
 */
export const ensureDefaultAbsenceTypes = (db: Firestore, uid: Id): Promise<number> =>
	runTransaction(db, async (tx) => {
		const refs = DEFAULT_ABSENCE_TYPES.map((t) =>
			userDoc(db, uid, userPath(absenceTypesPath, t.id))
		);
		const snapshots = await Promise.all(refs.map((ref) => tx.get(ref)));
		let created = 0;
		snapshots.forEach((snapshot, i) => {
			if (snapshot.exists()) return;
			tx.set(refs[i]!, { ...absenceTypeCodec.toData(DEFAULT_ABSENCE_TYPES[i]!), ...createMeta() });
			created += 1;
		});
		return created;
	});
