// The billing rate (issue 23, ADR 0003): actual time on billable codes divided by actual time on
// all codes, for the current ISO week and the current calendar month in Swedish time. Absence
// counts in neither part. Archived codes count; their flag still says what the time was.
import { splitByDay } from './intervall.ts';
import { isWithinAssignment } from './norm.ts';
import { dateOf, isoWeekOf } from './tid.ts';
import { runningEntry } from './timer.ts';
import type { Assignment, Entry, Id, Minutes, TimeCode, Timer, UtcMillis } from './types.ts';

export interface BillingTime {
	billable: Minutes;
	worked: Minutes;
}

export interface AssignmentBilling {
	assignment: Assignment;
	week: BillingTime;
	month: BillingTime;
}

export interface Billing {
	week: BillingTime;
	month: BillingTime;
	/** The assignments with worked time this month, in their order. */
	perAssignment: AssignmentBilling[];
}

export interface BillingInput {
	assignments: readonly Assignment[];
	/** Each assignment's codes, archived ones too, by assignment id. */
	codes: Readonly<Record<Id, readonly TimeCode[]>>;
	entries: readonly Entry[];
	/** The running timer counts as time up to now, and nothing in a pause (issue 95). */
	timer: Timer | null;
	now: UtcMillis;
}

const none = (): BillingTime => ({ billable: 0, worked: 0 });

const add = (a: BillingTime, b: BillingTime): BillingTime => ({
	billable: a.billable + b.billable,
	worked: a.worked + b.worked
});

/** Whole percent, rounded to nearest; null when nothing was worked. */
export const billingPercent = ({ billable, worked }: BillingTime): number | null =>
	worked > 0 ? Math.round((billable / worked) * 100) : null;

/** `88 %`, or `–` without worked time. */
export const billingLabel = (time: BillingTime): string => {
	const percent = billingPercent(time);
	return percent === null ? '–' : `${percent} %`;
};

/**
 * The billing of this week and this month, over the assignments that are not archived and have
 * started, as the flex overview takes them. Intervals over midnight count on each day, so one over
 * the turn of the month splits between the months.
 */
export const billing = (input: BillingInput): Billing => {
	const today = dateOf(input.now);
	const week = isoWeekOf(today);
	const month = today.slice(0, 7);
	const running = runningEntry(input.timer, input.now);
	const entries = running ? [...input.entries, running] : input.entries;
	const perAssignment = input.assignments
		.filter((a) => !a.archived && a.startDate <= today)
		.sort((a, b) => a.order - b.order)
		.map((assignment): AssignmentBilling => {
			const billable = new Set(
				(input.codes[assignment.id] ?? []).filter((c) => c.billable).map((c) => c.id)
			);
			const result = { assignment, week: none(), month: none() };
			for (const entry of entries) {
				if (entry.assignmentId !== assignment.id || entry.subject.kind !== 'code') continue;
				if (entry.time.kind !== 'interval') continue;
				const counts = billable.has(entry.subject.codeId);
				for (const part of splitByDay(entry.time)) {
					if (!isWithinAssignment(assignment, part.date)) continue;
					const time = { billable: counts ? part.minutes : 0, worked: part.minutes };
					if (part.date.startsWith(month)) result.month = add(result.month, time);
					if (isoWeekOf(part.date) === week) result.week = add(result.week, time);
				}
			}
			return result;
		})
		.filter((a) => a.month.worked > 0 || a.week.worked > 0);
	return {
		week: perAssignment.reduce((sum, a) => add(sum, a.week), none()),
		month: perAssignment.reduce((sum, a) => add(sum, a.month), none()),
		perAssignment
	};
};
