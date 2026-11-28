// The start page's overview (issue 19): flex in total and per assignment, the week against the
// norm, today's time against today's norm and the reports not yet sent. Everything is counted by
// the functions in flex.ts and norm.ts; this only gathers it for the view.
import { employmentFlex, type CountedAssignment } from './anstallning.ts';
import { assignmentFlex, firstReceiver, timeByDay, type AbsenceCountings } from './flex.ts';
import type { FreeDays } from './helgdagar.ts';
import { normMinutes } from './norm.ts';
import { termsIn } from './perioder.ts';
import { dateOf, daysOfWeek, isoWeekOf } from './tid.ts';
import { runningEntry } from './timer.ts';
import type {
	Assignment,
	Employer,
	Entry,
	Id,
	IsoWeek,
	Minutes,
	Receiver,
	Report,
	Timer,
	UtcMillis
} from './types.ts';

export interface OverviewInput {
	assignments: readonly Assignment[];
	/** The employers whose periods give a flex against the employment (ADR 0021). */
	employers?: readonly Employer[];
	/** Each assignment's receivers, by assignment id. */
	receivers: Readonly<Record<Id, readonly Receiver[]>>;
	entries: readonly Entry[];
	reports: readonly Report[];
	freeDays: FreeDays;
	countings: AbsenceCountings;
	/** The running timer counts as time up to now, and nothing in a pause (issue 95). */
	timer: Timer | null;
	now: UtcMillis;
}

export interface AssignmentOverview {
	assignment: Assignment;
	/** The flex balance: the opening balance plus each week's flex. */
	balance: Minutes;
	/** This week's flex. */
	weekFlex: Minutes;
	/** This week's actual time and the norm for the whole week. */
	weekActual: Minutes;
	weekNorm: Minutes;
}

export interface EmploymentOverview {
	employer: Employer;
	/** The flex against the employment: its opening balance plus each week's flex. */
	balance: Minutes;
	weekFlex: Minutes;
	/** The scope in force today, or null outside the employment. */
	scopePercent: number | null;
}

export interface Overview {
	/**
	 * The employments' flex, plus the balance of each assignment whose employer has no periods
	 * or that has no employer (ADR 0021).
	 */
	total: Minutes;
	employments: EmploymentOverview[];
	perAssignment: AssignmentOverview[];
	/** Today's actual time and norm over all assignments. */
	todayActual: Minutes;
	todayNorm: Minutes;
	/** Reports per receiver and ended week with time that are not sent. */
	unsent: number;
}

/**
 * The overview over the assignments that are not archived and have started. The running timer
 * counts as an interval up to now, so flex and today's time move while it runs.
 */
export const overview = (input: OverviewInput): Overview => {
	const { now, freeDays, countings } = input;
	const today = dateOf(now);
	const week = isoWeekOf(today);
	const running = runningEntry(input.timer, now);
	const entries = running ? [...input.entries, running] : input.entries;
	const counted = new Map<Id, CountedAssignment>(
		input.assignments.map((assignment) => {
			const receivers = input.receivers[assignment.id] ?? [];
			const first = firstReceiver(receivers);
			const firstReports = new Map<IsoWeek, Report>(
				input.reports
					.filter((r) => r.assignmentId === assignment.id && r.receiverId === first?.id)
					.map((r) => [r.week, r])
			);
			const { byWeek } = assignmentFlex({
				assignment,
				entries,
				freeDays,
				countings,
				firstReports,
				now
			});
			const days = timeByDay(assignment, entries, freeDays, countings);
			return [assignment.id, { assignment, days, byWeek }];
		})
	);
	let todayActual = 0;
	let todayNorm = 0;
	let unsent = 0;
	const perAssignment = input.assignments
		.filter((a) => !a.archived && a.startDate <= today)
		.sort((a, b) => a.order - b.order)
		.map((assignment): AssignmentOverview => {
			const receivers = input.receivers[assignment.id] ?? [];
			const own = input.reports.filter((r) => r.assignmentId === assignment.id);
			const { days, byWeek } = counted.get(assignment.id)!;
			const dates = daysOfWeek(week);
			todayActual += days.get(today)?.actual ?? 0;
			todayNorm += normMinutes(assignment, today, freeDays);
			// A week with time that has ended needs a sent report to every receiver in the chain.
			// Komptid counts no actual time but is still on the report, so any time counts.
			const workedWeeks = new Set(
				[...days].filter(([, d]) => d.bySubject.size > 0).map(([date]) => isoWeekOf(date))
			);
			for (const worked of workedWeeks) {
				if (worked >= week) continue;
				for (const receiver of receivers.filter((r) => !r.archived)) {
					// An unlocked report is being changed and must be sent again.
					const sent = own.some(
						(r) => r.receiverId === receiver.id && r.week === worked && r.status === 'sent'
					);
					if (!sent) unsent += 1;
				}
			}
			return {
				assignment,
				balance: [...byWeek.values()].reduce((sum, f) => sum + f, assignment.openingFlex),
				weekFlex: byWeek.get(week) ?? 0,
				weekActual: dates.reduce((sum, d) => sum + (days.get(d)?.actual ?? 0), 0),
				weekNorm: dates.reduce((sum, d) => sum + normMinutes(assignment, d, freeDays), 0)
			};
		});
	const employments: EmploymentOverview[] = [];
	const byEmployment = new Set<Id>();
	for (const employer of [...(input.employers ?? [])].sort((a, b) => a.order - b.order)) {
		const own = input.assignments.filter((a) => a.employerId === employer.id);
		const flex = employmentFlex({
			employer,
			assignments: own.map((a) => counted.get(a.id)!),
			freeDays,
			now
		});
		if (!flex) continue;
		for (const a of own) byEmployment.add(a.id);
		if (employer.archived && flex.balance === 0) continue;
		employments.push({
			employer,
			balance: flex.balance,
			weekFlex: flex.byWeek.get(week) ?? 0,
			scopePercent:
				termsIn({ terms: employer.terms, endDate: employer.endDate }, today)?.scopePercent ?? null
		});
	}
	return {
		total:
			employments.reduce((sum, e) => sum + e.balance, 0) +
			perAssignment
				.filter((a) => !byEmployment.has(a.assignment.id))
				.reduce((sum, a) => sum + a.balance, 0),
		employments,
		perAssignment,
		todayActual,
		todayNorm,
		unsent
	};
};

/** Whether a flex shows as below zero once rounded to tenths of an hour, as flexLabel shows it. */
export const isFlexNegative = (minutes: Minutes): boolean => Math.round(minutes / 6) < 0;

/** A flex in hours with one decimal and a sign: "+6,5 h", "−1,5 h", "0 h". */
export const flexLabel = (minutes: Minutes): string => {
	const tenths = Math.round(minutes / 6);
	if (tenths === 0) return '0 h';
	const text = (Math.abs(tenths) / 10).toFixed(1).replace('.', ',');
	return `${tenths > 0 ? '+' : '−'}${text} h`;
};
