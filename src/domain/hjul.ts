// The working day's wheel on the start page (issue 19, mockup "Arbetsdagens hjul"): the hours
// 07–19 as an arc of 300 degrees, 25 per hour, with the day's intervals on it in their code's
// colour. Only the geometry and the colour's number are here; the view draws the SVG.
import { atLocalTime } from './tid.ts';
import type { Entry, Id, IsoDate, TimeCode } from './types.ts';

const HOUR = 60 * 60_000;
export const WHEEL_HOURS = 12;
export const DEGREES_PER_HOUR = 25;

/** A part of the wheel: degrees from 07:00 and how many degrees it covers. */
export interface WheelArc {
	from: number;
	degrees: number;
}

/**
 * The part of the wheel an interval covers on the day, cut to 07–19; null for whole-day absence
 * and for an interval outside those hours. On a day when the clocks change, an hour is still 25
 * degrees from 07:00 local time.
 */
export const wheelArc = (entry: Entry, date: IsoDate): WheelArc | null => {
	if (entry.time.kind !== 'interval') return null;
	const first = atLocalTime(date, '07:00');
	const last = first + WHEEL_HOURS * HOUR;
	const start = Math.max(entry.time.start, first);
	const end = Math.min(entry.time.end, last);
	if (end <= start) return null;
	return {
		from: ((start - first) / HOUR) * DEGREES_PER_HOUR,
		degrees: ((end - start) / HOUR) * DEGREES_PER_HOUR
	};
};

/** One of the three code colours (`--kod-1..3`). */
export type CodeColour = 1 | 2 | 3;

/**
 * The colour of an entry: a code's place among its assignment's codes in their order, in turns
 * of three, so that a code keeps its colour everywhere; absence takes the third.
 */
export const codeColour = (
	entry: Pick<Entry, 'assignmentId' | 'subject'>,
	codes: Readonly<Record<Id, readonly TimeCode[]>>
): CodeColour => {
	if (entry.subject.kind !== 'code') return 3;
	const { codeId } = entry.subject;
	const sorted = [...(codes[entry.assignmentId] ?? [])].sort((a, b) => a.order - b.order);
	const place = Math.max(
		0,
		sorted.findIndex((c) => c.id === codeId)
	);
	return ((place % 3) + 1) as CodeColour;
};
