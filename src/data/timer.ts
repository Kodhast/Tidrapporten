// Following what the timer needs (issue 18): the running timer, the latest intervals for the
// code a start uses, and the reports from the timer's week for the lock. Reading only; the
// writes are in skrivning.ts.
import {
	collection,
	limit,
	onSnapshot,
	orderBy,
	query,
	where,
	type Firestore
} from 'firebase/firestore';
import type { Entry, Id, IsoWeek, Report, Timer } from '../domain/types.ts';
import { entryCodec, reportCodec, timerCodec } from './dokument.ts';
import { userDoc, userPath } from './skrivning.ts';

/** Follows `state/timer`: the running timer, or null when none runs. */
export const watchTimer = (db: Firestore, uid: Id, onChange: (timer: Timer | null) => void) =>
	onSnapshot(userDoc(db, uid, userPath('state', 'timer')), (snapshot) =>
		onChange(snapshot.exists() ? timerCodec.fromData(snapshot.id, snapshot.data()) : null)
	);

/** How many of the latest intervals are read to find the code a start uses. */
export const LATEST_ENTRIES = 10;

/** Follows the latest intervals by start; whole-day absence has no start and is left out. */
export const watchLatestEntries = (db: Firestore, uid: Id, onChange: (entries: Entry[]) => void) =>
	onSnapshot(
		query(
			collection(db, 'users', uid, 'entries'),
			orderBy('time.start', 'desc'),
			limit(LATEST_ENTRIES)
		),
		(snapshot) => onChange(snapshot.docs.map((d) => entryCodec.fromData(d.id, d.data())))
	);

/** Follows the reports from `week` on, which decide whether the timer's week is sent. */
export const watchReportsFrom = (
	db: Firestore,
	uid: Id,
	week: IsoWeek,
	onChange: (reports: Report[]) => void
) =>
	onSnapshot(
		query(collection(db, 'users', uid, 'reports'), where('week', '>=', week)),
		(snapshot) => onChange(snapshot.docs.map((d) => reportCodec.fromData(d.id, d.data())))
	);
