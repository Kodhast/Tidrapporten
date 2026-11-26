// Following what the start page and the day view need (issues 18, 19 and 29): the running timer,
// the entries and the reports. Reading only; the writes are in skrivning.ts.
import { collection, onSnapshot, query, where, type Firestore } from 'firebase/firestore';
import type { Entry, Id, IsoWeek, Report, Timer } from '../domain/types.ts';
import { entryCodec, reportCodec, timerCodec } from './dokument.ts';
import { userDoc, userPath } from './skrivning.ts';

/** Follows `state/timer`: the running timer, or null when none runs. `onError` on a failed read. */
export const watchTimer = (
	db: Firestore,
	uid: Id,
	onChange: (timer: Timer | null) => void,
	onError?: () => void
) =>
	onSnapshot(
		userDoc(db, uid, userPath('state', 'timer')),
		(snapshot) =>
			onChange(snapshot.exists() ? timerCodec.fromData(snapshot.id, snapshot.data()) : null),
		onError
	);

/** Follows every entry: flex counts all of them, and the start page shows today's. */
export const watchEntries = (
	db: Firestore,
	uid: Id,
	onChange: (entries: Entry[]) => void,
	onError?: () => void
) =>
	onSnapshot(
		collection(db, 'users', uid, 'entries'),
		(snapshot) => onChange(snapshot.docs.map((d) => entryCodec.fromData(d.id, d.data()))),
		onError
	);

/** Follows every report: flex, the unsent reports and the lock of the timer's weeks. */
export const watchReports = (
	db: Firestore,
	uid: Id,
	onChange: (reports: Report[]) => void,
	onError?: () => void
) =>
	onSnapshot(
		collection(db, 'users', uid, 'reports'),
		(snapshot) => onChange(snapshot.docs.map((d) => reportCodec.fromData(d.id, d.data()))),
		onError
	);

/** Follows the reports from `week` on, which decide whether the timer's week is sent. */
export const watchReportsFrom = (
	db: Firestore,
	uid: Id,
	week: IsoWeek,
	onChange: (reports: Report[]) => void,
	onError?: () => void
) =>
	onSnapshot(
		query(collection(db, 'users', uid, 'reports'), where('week', '>=', week)),
		(snapshot) => onChange(snapshot.docs.map((d) => reportCodec.fromData(d.id, d.data()))),
		onError
	);
