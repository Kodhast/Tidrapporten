// Follows what the week and its reports need (issue 20): the assignments with their codes and
// receivers, the week's entries and reports, the absence types and the free days.
import type { Firestore } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { watchEntriesIn } from '../../data/dag.ts';
import { absenceTypeCodec, assignmentCodec, freeDayCodec } from '../../data/dokument.ts';
import {
	absenceTypesPath,
	assignmentsPath,
	freeDaysPath,
	watchCollection
} from '../../data/installningar.ts';
import { watchWeekReports } from '../../data/reports.ts';
import { absenceCountings } from '../../domain/flex.ts';
import { freeDaysByDate } from '../../domain/helgdagar.ts';
import { addDays, daysOfWeek } from '../../domain/tid.ts';
import type {
	AbsenceType,
	Assignment,
	Entry,
	FreeDay,
	Id,
	IsoWeek,
	Report,
	TimeCode
} from '../../domain/types.ts';
import { weekView, type WeekView } from '../../domain/vecka.ts';
import { useCodes, useNow, useReceivers } from '../lyssnare.ts';

export interface Week {
	/** Null until everything has come. */
	view: WeekView | null;
	assignments: Assignment[];
	codes: Record<Id, TimeCode[]>;
	absenceTypes: AbsenceType[];
	freeDays: ReturnType<typeof freeDaysByDate>;
	/** A listener failed: what is shown is the latest known. */
	failed: boolean;
	now: number;
}

/** A value that belongs to one week, so that the last week's does not show for the next. */
interface Of<T> {
	week: IsoWeek;
	value: T;
}

export function useVecka(db: Firestore, uid: Id, week: IsoWeek): Week {
	const now = useNow();
	const [assignments, setAssignments] = useState<Assignment[] | null>(null);
	const [absenceTypes, setAbsenceTypes] = useState<AbsenceType[] | null>(null);
	const [freeDays, setFreeDays] = useState<FreeDay[] | null>(null);
	const [entries, setEntries] = useState<Of<Entry[]> | null>(null);
	const [reports, setReports] = useState<Of<Report[]> | null>(null);
	const [failed, setFailed] = useState(false);
	const fail = () => setFailed(true);

	useEffect(
		() => watchCollection(db, uid, assignmentsPath, assignmentCodec, setAssignments),
		[db, uid]
	);
	useEffect(
		() => watchCollection(db, uid, absenceTypesPath, absenceTypeCodec, setAbsenceTypes),
		[db, uid]
	);
	useEffect(() => watchCollection(db, uid, freeDaysPath, freeDayCodec, setFreeDays), [db, uid]);
	useEffect(() => {
		const monday = daysOfWeek(week)[0]!;
		return watchEntriesIn(
			db,
			uid,
			monday,
			addDays(monday, 7),
			(value) => setEntries({ week, value }),
			fail
		);
	}, [db, uid, week]);
	useEffect(
		() => watchWeekReports(db, uid, week, (value) => setReports({ week, value }), fail),
		[db, uid, week]
	);
	const ids = (assignments ?? []).map((a) => a.id);
	const codes = useCodes(db, uid, ids);
	const receivers = useReceivers(db, uid, ids);

	const known = (assignments ?? []).every((a) => receivers[a.id] !== undefined);
	const days = freeDaysByDate(freeDays ?? []);
	const view =
		assignments &&
		absenceTypes &&
		freeDays &&
		entries?.week === week &&
		reports?.week === week &&
		known
			? weekView({
					week,
					assignments,
					receivers,
					entries: entries.value,
					reports: reports.value,
					freeDays: days,
					countings: absenceCountings(absenceTypes),
					now
				})
			: null;
	return {
		view,
		assignments: assignments ?? [],
		codes,
		absenceTypes: absenceTypes ?? [],
		freeDays: days,
		failed,
		now
	};
}
