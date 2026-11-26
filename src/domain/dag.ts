// The day view (issue 29): the day's intervals, whole-day absence and gaps in order, which
// intervals overlap, the day's sum per assignment, and the clock times typed in the interval sheet.
import { clipToDay, gapsOnDay, overlaps, splitByDay, type Span } from './intervall.ts';
import { longDate } from './installningar.ts';
import { addDays, atLocalTime, clockOf } from './tid.ts';
import type {
	AbsenceType,
	Assignment,
	ClockTime,
	Entry,
	Id,
	IsoDate,
	Minutes,
	TimeCode,
	UtcMillis
} from './types.ts';

const MINUTE = 60_000;

export type DayRow =
	| { kind: 'allDay'; entry: Entry }
	| { kind: 'interval'; entry: Entry; start: UtcMillis; end: UtcMillis; overlap: boolean }
	| { kind: 'gap'; start: UtcMillis; end: UtcMillis; minutes: Minutes };

/** Whether the entry is on the local day: whole-day absence that day, or an interval touching it. */
export const isOnDay = (entry: Entry, date: IsoDate): boolean =>
	entry.time.kind === 'allDay'
		? entry.time.date === date
		: clipToDay(entry.time, date) !== undefined;

/**
 * The day's rows: whole-day absence first, then the intervals by start with the gaps between
 * them. An interval keeps its real start and end, also over midnight. Whether a gap is a pause
 * is the day's mark (ADR 0012), which the view shows; the gaps are the same either way.
 */
export const dayRows = (entries: readonly Entry[], date: IsoDate): DayRow[] => {
	const onDay = entries.filter((e) => isOnDay(e, date));
	const overlapping = new Set(overlaps(onDay).flat());
	const allDay: DayRow[] = onDay
		.filter((e) => e.time.kind === 'allDay')
		.map((entry) => ({ kind: 'allDay', entry }));
	const intervals: DayRow[] = onDay.flatMap((entry) =>
		entry.time.kind === 'interval'
			? [
					{
						kind: 'interval' as const,
						entry,
						start: entry.time.start,
						end: entry.time.end,
						overlap: overlapping.has(entry.id)
					}
				]
			: []
	);
	const gaps: DayRow[] = gapsOnDay(onDay, date).map((gap) => ({
		kind: 'gap',
		...gap,
		minutes: Math.round((gap.end - gap.start) / MINUTE)
	}));
	// A gap comes after an interval with the same start; equal intervals keep their id order.
	const timed = [...intervals, ...gaps].sort(
		(a, b) =>
			startOf(a) - startOf(b) ||
			Number(a.kind === 'gap') - Number(b.kind === 'gap') ||
			idOf(a).localeCompare(idOf(b))
	);
	return [...allDay, ...timed];
};

const startOf = (row: DayRow): UtcMillis => (row.kind === 'allDay' ? 0 : row.start);
const idOf = (row: DayRow): string => (row.kind === 'gap' ? '' : row.entry.id);

/** The first pair of overlapping intervals on the day, as the warning names them. */
export const firstOverlap = (entries: readonly Entry[], date: IsoDate): [Span, Span] | null => {
	const onDay = entries.filter((e) => isOnDay(e, date));
	const pair = overlaps(onDay)[0];
	if (!pair) return null;
	const span = (id: Id) => {
		const time = onDay.find((e) => e.id === id)!.time as Span;
		return { start: time.start, end: time.end };
	};
	return [span(pair[0]), span(pair[1])].sort((a, b) => a.start - b.start) as [Span, Span];
};

export interface DaySum {
	total: Minutes;
	/** Per assignment id, in the order the assignments first appear on the day. */
	perAssignment: [Id, Minutes][];
}

/**
 * The interval time on the day, cut at midnight, per assignment and in total. Overlapping time
 * counts twice until it is corrected; whole-day absence has no clock time and is not in it.
 */
export const daySum = (entries: readonly Entry[], date: IsoDate): DaySum => {
	const per = new Map<Id, Minutes>();
	for (const entry of entries) {
		if (entry.time.kind !== 'interval') continue;
		const part = splitByDay(entry.time).find((p) => p.date === date);
		if (part) per.set(entry.assignmentId, (per.get(entry.assignmentId) ?? 0) + part.minutes);
	}
	const perAssignment = [...per];
	return { total: perAssignment.reduce((sum, [, m]) => sum + m, 0), perAssignment };
};

/** A length in words: "55 min", "1 h 30 min", "8 h". */
export const minutesLabel = (minutes: Minutes): string => {
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	if (h === 0) return `${m} min`;
	return m === 0 ? `${h} h` : `${h} h ${m} min`;
};

/** "08:05–09:00" in Swedish time. */
export const spanLabel = (span: Span): string => `${clockOf(span.start)}–${clockOf(span.end)}`;

/** A clock time typed as `16:05`, `16.05`, `1605` or `9:30`; null when it is not one. */
export const parseClock = (text: string): ClockTime | null => {
	const match = /^([01]?\d|2[0-3])[:.]?([0-5]\d)$/.exec(text.trim());
	return match ? `${match[1]!.padStart(2, '0')}:${match[2]}` : null;
};

export const CLOCK_ERROR = 'Skriv en tid som 16:05';

export type SpanResult = { span: Span } | { error: { field: 'start' | 'end'; message: string } };

/**
 * The interval typed in the sheet for a day: the start on the day, and the end on the day or, when
 * that is not after the start, on the next day (an interval over midnight; `00:00` is midnight).
 * At most 24 hours by construction; the same start and end is a whole day.
 */
export const parseSpan = (date: IsoDate, startText: string, endText: string): SpanResult => {
	const startClock = parseClock(startText);
	if (!startClock) return { error: { field: 'start', message: CLOCK_ERROR } };
	const endClock = parseClock(endText);
	if (!endClock) return { error: { field: 'end', message: CLOCK_ERROR } };
	const start = atLocalTime(date, startClock);
	let end = atLocalTime(date, endClock);
	if (end <= start) end = atLocalTime(addDays(date, 1), endClock);
	return { span: { start, end } };
};

/** The first other interval that overlaps the span, for the sheet's warning. */
export const overlapping = (
	entries: readonly Entry[],
	span: Span,
	exceptId: Id | null
): Span | null => {
	for (const entry of entries) {
		if (entry.id === exceptId || entry.time.kind !== 'interval') continue;
		if (entry.time.start < span.end && span.start < entry.time.end) {
			return { start: entry.time.start, end: entry.time.end };
		}
	}
	return null;
};

/** `2026-11-24` → `Tisdag 24 november`: the day without the year. */
export const dayName = (date: IsoDate): string => longDate(date).replace(/ \d{4}$/, '');

/** An entry's name in a row: "Uppdrag A · Möten", "Uppdrag A · Semester". */
export const entryName = (
	entry: Entry,
	assignments: readonly Assignment[],
	codes: Readonly<Record<Id, readonly TimeCode[]>>,
	absenceTypes: readonly AbsenceType[]
): string => {
	const subject =
		entry.subject.kind === 'code'
			? (codes[entry.assignmentId] ?? []).find(
					(c) => c.id === (entry.subject as { codeId: Id }).codeId
				)?.name
			: absenceTypes.find((t) => t.id === (entry.subject as { absenceTypeId: Id }).absenceTypeId)
					?.name;
	const assignment = assignments.find((a) => a.id === entry.assignmentId)?.name;
	return [assignment, subject].filter(Boolean).join(' · ');
};
