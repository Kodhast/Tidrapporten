// The flex against the employment (ADR 0021, skill tidsregler): the flex of the employer's
// assignments, less the part of the employment's norm the assignments do not cover.
import type { DayTime } from './flex.ts';
import type { FreeDays } from './helgdagar.ts';
import { normMinutes } from './norm.ts';
import { periodsNorm } from './perioder.ts';
import { dateOf, daysOfWeek, weeksBetween } from './tid.ts';
import type { Assignment, Employer, IsoDate, IsoWeek, Minutes, UtcMillis } from './types.ts';

/** One of the employer's assignments with its counted time and weekly flex (flex.ts). */
export interface CountedAssignment {
	assignment: Assignment;
	days: ReadonlyMap<IsoDate, DayTime>;
	byWeek: ReadonlyMap<IsoWeek, Minutes>;
}

export interface EmploymentFlexInput {
	employer: Employer;
	/** The employer's assignments, archived ones too: their weeks still count. */
	assignments: readonly CountedAssignment[];
	freeDays: FreeDays;
	now: UtcMillis;
}

export interface EmploymentFlex {
	balance: Minutes;
	byWeek: Map<IsoWeek, Minutes>;
}

/**
 * A day's norm as far as it has gone: a past day its whole norm, today its norm up to the actual
 * time (as an open week counts it, flex.ts), a day ahead nothing.
 */
const normSoFar = (norm: Minutes, actual: Minutes, date: IsoDate, today: IsoDate): Minutes =>
	date < today ? norm : date === today ? Math.min(norm, actual) : 0;

/**
 * The employment's balance: its opening balance plus, for each week from its first period, the
 * assignments' week flex less the norm they leave uncovered. Uncovered norm on a day is the
 * employment's norm so far less the assignments' norm so far; it is negative when the assignments
 * ask for more than the employment, which then shows as plus. The assignments' flex counts for
 * whole weeks, also the first and the last, so the opening balance is the one at the start of
 * the first week. Null for an employer without periods, whose assignments count on their own
 * as before.
 */
export const employmentFlex = (input: EmploymentFlexInput): EmploymentFlex | null => {
	const { employer, assignments, freeDays, now } = input;
	const first = [...employer.terms].sort((a, b) => a.from.localeCompare(b.from))[0];
	if (!first) return null;
	const periods = { terms: employer.terms, endDate: employer.endDate };
	const today = dateOf(now);
	const last = employer.endDate !== null && employer.endDate < today ? employer.endDate : today;
	const byWeek = new Map<IsoWeek, Minutes>();
	let balance = employer.openingFlex;
	if (first.from > last) return { balance, byWeek };
	for (const week of weeksBetween(first.from, last)) {
		let flex = assignments.reduce((sum, a) => sum + (a.byWeek.get(week) ?? 0), 0);
		for (const date of daysOfWeek(week)) {
			if (date < first.from || date > last) continue;
			let actual = 0;
			let covered = 0;
			for (const a of assignments) {
				const dayActual = a.days.get(date)?.actual ?? 0;
				actual += dayActual;
				covered += normSoFar(normMinutes(a.assignment, date, freeDays), dayActual, date, today);
			}
			flex -= normSoFar(periodsNorm(periods, date, freeDays), actual, date, today) - covered;
		}
		byWeek.set(week, flex);
		balance += flex;
	}
	return { balance, byWeek };
};
