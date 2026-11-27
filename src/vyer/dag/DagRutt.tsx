// Connects the day view to Firestore (issue 29): follows the day's entries and pause mark, the
// assignments with their codes, the absence types and the reports from the day's week, and saves
// through saveEntry, which logs a change in a sent week.
import type { Firestore } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { newEntryId, setPause, watchDayEntries, watchPause } from '../../data/dag.ts';
import { absenceTypeCodec, assignmentCodec, freeDayCodec } from '../../data/dokument.ts';
import {
	absenceTypesPath,
	assignmentsPath,
	freeDaysPath,
	watchCollection
} from '../../data/installningar.ts';
import { addEntries, saveEntry } from '../../data/skrivning.ts';
import { watchReportsFrom } from '../../data/timer.ts';
import { dayRows, daySum, entryName, firstOverlap, isOnDay } from '../../domain/dag.ts';
import { freeDaysByDate } from '../../domain/helgdagar.ts';
import { codeColour } from '../../domain/hjul.ts';
import type { Span } from '../../domain/intervall.ts';
import { standardDaySuggestion } from '../../domain/standarddag.ts';
import { addDays, dateOf, isoWeekOf } from '../../domain/tid.ts';
import { startChoice, timerCodeGroups, type CodeChoice } from '../../domain/timer.ts';
import type {
	AbsenceType,
	Assignment,
	Entry,
	FreeDay,
	Id,
	IsoDate,
	IsoWeek,
	Report
} from '../../domain/types.ts';
import { useCodes } from '../lyssnare.ts';
import { replaceRoute } from '../rutter.ts';
import { DagVy } from './DagVy';
import { IntervallArk } from './IntervallArk';

export interface DagRuttProps {
	db: Firestore;
	uid: Id;
	date: IsoDate;
	online: boolean;
}

interface Sheet {
	entry: Entry | null;
	span: Span | null;
	choice: CodeChoice | null;
	newId: Id;
	/** A new key for each opening, so the form starts over. */
	key: number;
}

export function DagRutt({ db, uid, date, online }: DagRuttProps) {
	const [day, setDay] = useState<{ date: IsoDate; entries: Entry[] } | null>(null);
	const [pause, setPaused] = useState<{ date: IsoDate; paused: boolean } | null>(null);
	const [assignments, setAssignments] = useState<Assignment[] | null>(null);
	const [absenceTypes, setAbsenceTypes] = useState<AbsenceType[]>([]);
	const [freeDays, setFreeDays] = useState<FreeDay[] | null>(null);
	const [reports, setReports] = useState<{ week: IsoWeek; values: Report[] } | null>(null);
	const [sheet, setSheet] = useState<Sheet | null>(null);
	const [today] = useState(() => dateOf(Date.now()));
	const [problem, setProblem] = useState<'read' | 'save' | null>(null);
	const fail = () => setProblem('read');

	useEffect(
		() => watchDayEntries(db, uid, date, (entries) => setDay({ date, entries }), fail),
		[db, uid, date]
	);
	useEffect(
		() => watchPause(db, uid, date, (paused) => setPaused({ date, paused }), fail),
		[db, uid, date]
	);
	useEffect(
		() => watchCollection(db, uid, assignmentsPath, assignmentCodec, setAssignments),
		[db, uid]
	);
	useEffect(
		() => watchCollection(db, uid, absenceTypesPath, absenceTypeCodec, setAbsenceTypes),
		[db, uid]
	);
	useEffect(() => watchCollection(db, uid, freeDaysPath, freeDayCodec, setFreeDays), [db, uid]);
	// From the week of the day before: an interval from Sunday evening shown on Monday touches the
	// week before, and one over Sunday midnight the week after (where >= reaches).
	const week = isoWeekOf(addDays(date, -1));
	useEffect(
		() => watchReportsFrom(db, uid, week, (values) => setReports({ week, values }), fail),
		[db, uid, week]
	);
	const codes = useCodes(
		db,
		uid,
		(assignments ?? []).map((a) => a.id)
	);

	const entries = day?.date === date ? day.entries.filter((e) => isOnDay(e, date)) : null;
	const knownReports = reports?.week === week ? reports.values : null;
	const loading = entries === null || assignments === null || knownReports === null;
	const shown = entries ?? [];
	const paused = pause?.date === date && pause.paused;

	const groups = timerCodeGroups(assignments ?? [], codes, date);
	const sheetGroups = (entry: Entry | null) => {
		// An entry on an ended or archived assignment can still be corrected.
		const own = entry && (assignments ?? []).find((a) => a.id === entry.assignmentId);
		if (!own || groups.some((g) => g.assignment.id === own.id)) return groups;
		return [...groups, { assignment: own, codes: codes[own.id] ?? [] }];
	};
	const assignmentName = (id: Id) => (assignments ?? []).find((a) => a.id === id)?.name ?? '';
	const describe = (entry: Entry) => entryName(entry, assignments ?? [], codes, absenceTypes);

	const open = (entry: Entry | null, span: Span | null, choice: CodeChoice | null) =>
		setSheet({ entry, span, choice, newId: newEntryId(db, uid), key: Date.now() });
	// A new interval takes the code of the one before it, else the start's choice.
	const choiceBefore = (at: number | null): CodeChoice | null =>
		startChoice(
			groups,
			shown.filter((e) => e.time.kind === 'interval' && (at === null || e.time.end <= at))
		);

	const write = (save: () => Promise<void>) => {
		setProblem(null);
		save().catch(() => setProblem('save'));
	};

	// The standard day as intervals, with their ids set when they are added.
	const suggested =
		loading || freeDays === null
			? []
			: standardDaySuggestion({
					date,
					today,
					assignments,
					codes,
					entries: shown,
					paused,
					freeDays: freeDaysByDate(freeDays),
					reports: knownReports
				}).map((s, i): Entry => ({
					id: `forslag-${i}`,
					assignmentId: s.assignmentId,
					subject: { kind: 'code', codeId: s.codeId },
					time: { kind: 'interval', start: s.start, end: s.end },
					note: ''
				}));
	const suggestion =
		suggested.length > 0
			? {
					rows: suggested.map((e) => ({
						span: e.time as Span,
						name: describe(e)
					})),
					sum: daySum(suggested, date).total
				}
			: null;
	const acceptSuggestion = () =>
		write(() =>
			addEntries(
				db,
				uid,
				suggested.map((e) => ({ ...e, id: newEntryId(db, uid) }))
			)
		);

	const sheetData = sheet && (
		<IntervallArk
			key={sheet.key}
			isOpen
			onOpenChange={(isOpen) => !isOpen && setSheet(null)}
			date={date}
			entry={sheet.entry}
			newId={sheet.newId}
			span={sheet.span}
			choice={sheet.choice}
			groups={sheetGroups(sheet.entry)}
			absenceTypes={absenceTypes.filter((t) => !t.archived).sort((a, b) => a.order - b.order)}
			entries={day?.date === date ? day.entries : []}
			reports={knownReports ?? []}
			online={online}
			onSave={(before, after, reason) =>
				write(() => saveEntry(db, uid, before, after, knownReports ?? [], reason))
			}
		/>
	);

	return (
		<DagVy
			date={date}
			rows={dayRows(shown, date)}
			describe={describe}
			accent={(entry) => `accent-kod-${codeColour(entry, codes)}`}
			assignmentName={assignmentName}
			overlap={firstOverlap(shown, date)}
			sum={daySum(shown, date)}
			paused={paused}
			online={online}
			problem={problem}
			loading={loading}
			previous={addDays(date, -1)}
			next={addDays(date, 1)}
			onDay={(other) => replaceRoute({ view: 'dag', date: other })}
			onOpen={(entry) => open(entry, null, null)}
			onFill={(gap) => open(null, gap, choiceBefore(gap.start))}
			onPause={(on) => write(() => setPause(db, uid, date, on))}
			onAdd={() => open(null, null, choiceBefore(null))}
			addDisabled={loading || groups.length === 0}
			sheet={sheetData}
			suggestion={suggestion}
			onAcceptSuggestion={acceptSuggestion}
		/>
	);
}
