// Connects the day view to Firestore (issue 29): follows the day's entries and pause mark, the
// assignments with their codes, the absence types and the reports from the day's week, and saves
// through saveEntry, which logs a change in a sent week.
import type { Firestore } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { newEntryId, setPause, watchDayEntries, watchPause } from '../../data/dag.ts';
import { absenceTypeCodec, assignmentCodec } from '../../data/dokument.ts';
import { absenceTypesPath, assignmentsPath, watchCollection } from '../../data/installningar.ts';
import { saveEntry } from '../../data/skrivning.ts';
import { watchReportsFrom } from '../../data/timer.ts';
import { dayRows, daySum, firstOverlap, isOnDay } from '../../domain/dag.ts';
import type { Span } from '../../domain/intervall.ts';
import { addDays, isoWeekOf } from '../../domain/tid.ts';
import { startChoice, timerCodeGroups, type CodeChoice } from '../../domain/timer.ts';
import type {
	AbsenceType,
	Assignment,
	Entry,
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
	const [reports, setReports] = useState<{ week: IsoWeek; values: Report[] } | null>(null);
	const [sheet, setSheet] = useState<Sheet | null>(null);
	const [failed, setFailed] = useState(false);
	const fail = () => setFailed(true);

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
	// From the day's week: an interval over Sunday midnight also touches the next one.
	const week = isoWeekOf(date);
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
	const describe = (entry: Entry) => {
		const subject =
			entry.subject.kind === 'code'
				? (codes[entry.assignmentId] ?? []).find(
						(c) => c.id === (entry.subject as { codeId: Id }).codeId
					)?.name
				: absenceTypes.find((t) => t.id === (entry.subject as { absenceTypeId: Id }).absenceTypeId)
						?.name;
		return [assignmentName(entry.assignmentId), subject].filter(Boolean).join(' · ');
	};

	const open = (entry: Entry | null, span: Span | null, choice: CodeChoice | null) =>
		setSheet({ entry, span, choice, newId: newEntryId(db, uid), key: Date.now() });
	// A new interval takes the code of the one before it, else the start's choice.
	const choiceBefore = (at: number | null): CodeChoice | null =>
		startChoice(
			groups,
			shown.filter((e) => e.time.kind === 'interval' && (at === null || e.time.end <= at))
		);

	const write = (save: () => Promise<void>) => {
		setFailed(false);
		save().catch(fail);
	};

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
			entries={shown}
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
			assignmentName={assignmentName}
			overlap={firstOverlap(shown, date)}
			sum={daySum(shown, date)}
			paused={paused}
			online={online}
			failed={failed}
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
		/>
	);
}
