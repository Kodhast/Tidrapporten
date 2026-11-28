// Intervals within local days: splitting at midnight, gaps, overlaps and the forgotten timer.
import { fullDayNorm, termsOn } from './norm.ts';
import { addDays, dateOf, startOfDay } from './tid.ts';
import type { Assignment, Entry, Id, IsoDate, Minutes, Timer, UtcMillis } from './types.ts';

const MINUTE = 60_000;

export interface Span {
	start: UtcMillis;
	end: UtcMillis;
}

export interface DayPart extends Span {
	date: IsoDate;
	minutes: Minutes;
}

/** Whole minutes between two instants, counted on minute boundaries so that parts add up. */
const minutesBetween = (start: UtcMillis, end: UtcMillis): Minutes =>
	Math.round(end / MINUTE) - Math.round(start / MINUTE);

/** The span cut at each local midnight, so that an interval over midnight counts on both days. */
export const splitByDay = (span: Span): DayPart[] => {
	const parts: DayPart[] = [];
	let start = span.start;
	while (start < span.end) {
		const date = dateOf(start);
		const end = Math.min(span.end, startOfDay(addDays(date, 1)));
		parts.push({ date, start, end, minutes: minutesBetween(start, end) });
		start = end;
	}
	return parts;
};

/** The part of the span that falls on the local day, if any. */
export const clipToDay = (span: Span, date: IsoDate): Span | undefined => {
	const start = Math.max(span.start, startOfDay(date));
	const end = Math.min(span.end, startOfDay(addDays(date, 1)));
	return start < end ? { start, end } : undefined;
};

/** Interval entries as spans; whole-day absence has no clock time and is left out. */
export const intervalSpans = (entries: readonly Entry[]): (Span & { id: Id })[] =>
	entries.flatMap((entry) =>
		entry.time.kind === 'interval'
			? [{ id: entry.id, start: entry.time.start, end: entry.time.end }]
			: []
	);

/** Gaps on the day between the first start and the last end of its intervals. */
export const gapsOnDay = (entries: readonly Entry[], date: IsoDate): Span[] => {
	const spans = intervalSpans(entries)
		.flatMap((span) => clipToDay(span, date) ?? [])
		.sort((a, b) => a.start - b.start);
	const gaps: Span[] = [];
	let reached = spans[0]?.end ?? 0;
	for (const span of spans.slice(1)) {
		if (span.start > reached) gaps.push({ start: reached, end: span.start });
		reached = Math.max(reached, span.end);
	}
	return gaps;
};

/** Pairs of intervals that overlap; touching end to start is not an overlap. */
export const overlaps = (entries: readonly Entry[]): [Id, Id][] => {
	const spans = intervalSpans(entries).sort((a, b) => a.start - b.start);
	const pairs: [Id, Id][] = [];
	spans.forEach((a, i) => {
		for (const b of spans.slice(i + 1)) {
			if (b.start >= a.end) break;
			pairs.push([a.id, b.id]);
		}
	});
	return pairs;
};

export const FORGOTTEN_TIMER_AFTER: Minutes = 10 * 60;

/** Whether the timer has run longer than ten hours and the owner should be asked for the end. */
export const isTimerForgotten = (timer: Timer, now: UtcMillis): boolean =>
	now - timer.start > FORGOTTEN_TIMER_AFTER * MINUTE;

/**
 * The working day a forgotten timer is ended after: the assignment's daily norm on the date
 * (workday × scope), the whole workday at 0 % (ADR 0021), and 8 h without terms.
 */
export const timerWorkday = (assignment: Assignment, date: IsoDate): Minutes => {
	const terms = termsOn(assignment, date);
	if (!terms) return 8 * 60;
	return fullDayNorm(terms) || terms.workdayMinutes;
};

/**
 * A suggested end for a forgotten timer: the start plus the working day (timerWorkday), but
 * never past midnight or now.
 */
export const suggestTimerEnd = (
	timer: Timer,
	assignment: Assignment,
	now: UtcMillis
): UtcMillis => {
	const startDate = dateOf(timer.start);
	const workday = timerWorkday(assignment, startDate);
	return Math.min(timer.start + workday * MINUTE, startOfDay(addDays(startDate, 1)), now);
};
