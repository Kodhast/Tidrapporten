// The week's reports (issue 20): following them, sending and unlocking. The writes go through
// saveReport, which runs as a transaction (so it fails offline instead of being queued) and logs
// every locked change (ADR 0012).
import { collection, getDoc, onSnapshot, query, where, type Firestore } from 'firebase/firestore';
import type { ChangeLogEntry, Id, IsoWeek, Report } from '../domain/types.ts';
import { changeLogCodec, reportCodec } from './dokument.ts';
import { saveReport, userDoc, userPath } from './skrivning.ts';

/** Follows the reports of one week. */
export const watchWeekReports = (
	db: Firestore,
	uid: Id,
	week: IsoWeek,
	onChange: (reports: Report[]) => void,
	onError?: () => void
) =>
	onSnapshot(
		query(collection(db, 'users', uid, 'reports'), where('week', '==', week)),
		(snapshot) => onChange(snapshot.docs.map((d) => reportCodec.fromData(d.id, d.data()))),
		onError
	);

/** Follows the change log's entries for the week (issue 25), in no particular order. */
export const watchWeekChangeLog = (
	db: Firestore,
	uid: Id,
	week: IsoWeek,
	onChange: (log: ChangeLogEntry[]) => void,
	onError?: () => void
) =>
	onSnapshot(
		query(collection(db, 'users', uid, 'changeLog'), where('week', '==', week)),
		(snapshot) => onChange(snapshot.docs.map((d) => changeLogCodec.fromData(d.id, d.data()))),
		onError
	);

/** Said in the log when the unlock's own reason cannot be read. */
export const CHANGED_AFTER_UNLOCK = 'Ändrad efter upplåsning';

/**
 * The reason of a report's latest locked change. Each change after an unlock is logged with it:
 * the mockup asks for the reason once, when the report is unlocked.
 */
const latestReason = async (db: Firestore, uid: Id, changeId: Id | null): Promise<string> => {
	if (!changeId) return CHANGED_AFTER_UNLOCK;
	const snap = await getDoc(userDoc(db, uid, userPath('changeLog', changeId)));
	const reason = snap.exists() ? changeLogCodec.fromData(snap.id, snap.data()).reason : '';
	return reason.trim() || CHANGED_AFTER_UNLOCK;
};

/**
 * Marks a report as sent, which locks it. `before` is the stored report: sending an unlocked one
 * again is a locked change, logged with the unlock's reason.
 */
export const sendReport = async (
	db: Firestore,
	uid: Id,
	report: Report,
	before: Report | null
): Promise<void> => {
	const reason =
		before?.status === 'unlocked' ? await latestReason(db, uid, before.lastChangeId) : '';
	await saveReport(db, uid, report.id, { ...report, status: 'sent' }, reason);
};

/** Unlocks a sent report with a reason; the log entry goes in the same transaction. */
export const unlockReport = async (
	db: Firestore,
	uid: Id,
	report: Report,
	reason: string
): Promise<void> => {
	await saveReport(db, uid, report.id, { ...report, status: 'unlocked' }, reason);
};
