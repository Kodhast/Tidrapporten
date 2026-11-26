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
 * Follows the entries on a local day: intervals that start from 24 hours before the day (an
 * interval is at most 24 hours, so one from the evening before is found) up to the day's end,
 * and the whole-day absence that day. Entries from the day before that end before the day are
 * in the list too; the view leaves them out.
 */
export const watchDayEntries = (
	db: Firestore,
	uid: Id,
	date: IsoDate,
	onChange: (entries: Entry[]) => void,
	onError?: () => void
) => {
	const entries = collection(db, 'users', uid, 'entries');
	const start = startOfDay(date);
	const end = startOfDay(addDays(date, 1));
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
				where('time.start', '>', Timestamp.fromMillis(start - DAY_BEFORE)),
				where('time.start', '<', Timestamp.fromMillis(end))
			),
			(snapshot) => {
				intervals = decode(snapshot.docs);
				emit();
			},
			onError
		),
		onSnapshot(
			query(entries, where('time.date', '==', date)),
			(snapshot) => {
				allDay = decode(snapshot.docs);
				emit();
			},
			onError
		)
	];
	return () => stops.forEach((stop) => stop());
};

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
