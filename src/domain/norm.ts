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

/** A workday's norm under the terms, ignoring whether the day is free. */
export const fullDayNorm = (terms: AssignmentTerms): Minutes =>
	Math.round((terms.workdayMinutes * terms.scopePercent) / 100);

/**
 * The norm for the day: workday × scope / 100, rounded to a whole minute. Zero on weekends,
 * holidays, free eves, extra days off and outside the assignment.
 */
export const normMinutes = (assignment: Assignment, date: IsoDate, freeDays: FreeDays): Minutes => {
	if (!isWithinAssignment(assignment, date) || isDayOff(date, freeDays)) return 0;
	const terms = termsOn(assignment, date);
	return terms ? fullDayNorm(terms) : 0;
};
