// The norm: how many minutes an assignment expects on a day (ADR 0012, skill tidsregler).
import { type FreeDays, isDayOff } from './helgdagar';
import type { Assignment, AssignmentTerms, IsoDate, Minutes } from './types';

export const DEFAULT_WORKDAY_MINUTES: Minutes = 480;

/** Whether the date is within the assignment's start and end, both inclusive. */
export const isWithinAssignment = (assignment: Assignment, date: IsoDate): boolean =>
	date >= assignment.startDate && (assignment.endDate === null || date <= assignment.endDate);

/** The terms in force on the date: the last ones whose `from` is on or before it. */
export const termsOn = (assignment: Assignment, date: IsoDate): AssignmentTerms | undefined =>
	assignment.terms.findLast((terms) => terms.from <= date);

const QUARTER: Minutes = 15;

/** To the nearest quarter of an hour, the smallest step the owner reports in; half rounds up. */
export const roundToQuarter = (minutes: Minutes): Minutes =>
	Math.round(minutes / QUARTER) * QUARTER;

/**
 * A workday's norm under the terms, ignoring whether the day is free: workday × scope / 100,
 * rounded to the nearest quarter so that a filled report is whole quarters (ADR 0013).
 */
export const fullDayNorm = (terms: AssignmentTerms): Minutes =>
	roundToQuarter((terms.workdayMinutes * terms.scopePercent) / 100);

/**
 * The norm for the day: workday × scope / 100, rounded to the nearest quarter. Zero on weekends,
 * holidays, free eves, extra days off and outside the assignment.
 */
export const normMinutes = (assignment: Assignment, date: IsoDate, freeDays: FreeDays): Minutes => {
	if (!isWithinAssignment(assignment, date) || isDayOff(date, freeDays)) return 0;
	const terms = termsOn(assignment, date);
	return terms ? fullDayNorm(terms) : 0;
};
