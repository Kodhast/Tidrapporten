// What the day view reads and writes besides the entries' own writes in skrivning.ts (issue 29):
// the entries on a day and the day's pause mark. Both work offline; the pause is not locked.
import {
	collection,
	deleteDoc,
	doc,
	onSnapshot,
	query,
	setDoc,
	Timestamp,
	where,
	type Firestore
} from 'firebase/firestore';
import { addDays, startOfDay } from '../domain/tid.ts';
import type { Entry, Id, IsoDate } from '../domain/types.ts';
import { entryCodec } from './dokument.ts';
import { createMeta } from './kodning.ts';
import { userDoc, userPath } from './skrivning.ts';

const DAY_BEFORE = 24 * 60 * 60_000;

/**
 * Follows the entries from local day `from` up to, not including, `to`: intervals that start from
 * 24 hours before `from` (an interval is at most 24 hours, so one from the evening before is found)
 * and whole-day absence in the span. The caller leaves out what is not on its days.
 */
export const watchEntriesIn = (
	db: Firestore,
	uid: Id,
	from: IsoDate,
	to: IsoDate,
	onChange: (entries: Entry[]) => void,
	onError?: () => void
) => {
	const entries = collection(db, 'users', uid, 'entries');
	let intervals: Entry[] | null = null;
	let allDay: Entry[] | null = null;
	const emit = () => {
		if (intervals && allDay) onChange([...allDay, ...intervals]);
	};
	const decode = (docs: { id: string; data: () => object }[]) =>
		docs.map((d) => entryCodec.fromData(d.id, d.data()));
	const stops = [
		onSnapshot(
			query(
				entries,
				where('time.start', '>', Timestamp.fromMillis(startOfDay(from) - DAY_BEFORE)),
				where('time.start', '<', Timestamp.fromMillis(startOfDay(to)))
			),
			(snapshot) => {
				intervals = decode(snapshot.docs);
				emit();
			},
			onError
		),
		onSnapshot(
			query(entries, where('time.date', '>=', from), where('time.date', '<', to)),
			(snapshot) => {
				allDay = decode(snapshot.docs);
				emit();
			},
			onError
		)
	];
	return () => stops.forEach((stop) => stop());
};

/**
 * Follows the entries around a local day, up to the end of the next day, so that a new interval
 * over midnight is warned of an overlap there. The view leaves out what is not on the day.
 */
export const watchDayEntries = (
	db: Firestore,
	uid: Id,
	date: IsoDate,
	onChange: (entries: Entry[]) => void,
	onError?: () => void
) => watchEntriesIn(db, uid, date, addDays(date, 2), onChange, onError);

/** A new entry's id, made on the device so that it works offline. */
export const newEntryId = (db: Firestore, uid: Id): Id =>
	doc(collection(db, 'users', uid, 'entries')).id;

const pausePath = (date: IsoDate) => userPath('pauses', date);

/** Follows whether the day's gaps are pauses (ADR 0012: one mark per day). */
export const watchPause = (
	db: Firestore,
	uid: Id,
	date: IsoDate,
	onChange: (paused: boolean) => void,
	onError?: () => void
) =>
	onSnapshot(userDoc(db, uid, pausePath(date)), (snapshot) => onChange(snapshot.exists()), onError);

/** Marks the day's gaps as pauses, or takes the mark away. */
export const setPause = (db: Firestore, uid: Id, date: IsoDate, paused: boolean): Promise<void> =>
	paused
		? setDoc(userDoc(db, uid, pausePath(date)), createMeta())
		: deleteDoc(userDoc(db, uid, pausePath(date)));
