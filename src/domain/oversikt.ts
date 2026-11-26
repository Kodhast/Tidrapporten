// The start page's overview (issue 19): flex in total and per assignment, the week against the
// norm, today's time against today's norm and the reports not yet sent. Everything is counted by
// the functions in flex.ts and norm.ts; this only gathers it for the view.
import { assignmentFlex, firstReceiver, timeByDay, type AbsenceCountings } from './flex.ts';
import type { FreeDays } from './helgdagar.ts';
import { normMinutes } from './norm.ts';
import { dateOf, daysOfWeek, isoWeekOf } from './tid.ts';
import { timerEntry } from './timer.ts';
import type {
	Assignment,
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
	/** Each assignment's receivers, by assignment id. */
	receivers: Readonly<Record<Id, readonly Receiver[]>>;
	entries: readonly Entry[];
	reports: readonly Report[];
	freeDays: FreeDays;
	countings: AbsenceCountings;
	/** The running timer counts as time up to now. */
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

export interface Overview {
	total: Minutes;
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
	const entries = input.timer
		? [...input.entries, timerEntry(input.timer, Math.max(now, input.timer.start))]
		: input.entries;
	let todayActual = 0;
	let todayNorm = 0;
	let unsent = 0;
	const perAssignment = input.assignments
		.filter((a) => !a.archived && a.startDate <= today)
		.sort((a, b) => a.order - b.order)
		.map((assignment): AssignmentOverview => {
			const receivers = input.receivers[assignment.id] ?? [];
			const own = input.reports.filter((r) => r.assignmentId === assignment.id);
			const first = firstReceiver(receivers);
			const firstReports = new Map<IsoWeek, Report>(
				own.filter((r) => r.receiverId === first?.id).map((r) => [r.week, r])
			);
			const flex = assignmentFlex({
				assignment,
				entries,
				freeDays,
				countings,
				firstReports,
				now
			});
			const days = timeByDay(assignment, entries, freeDays, countings);
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
				balance: flex.balance,
				weekFlex: flex.byWeek.get(week) ?? 0,
				weekActual: dates.reduce((sum, d) => sum + (days.get(d)?.actual ?? 0), 0),
				weekNorm: dates.reduce((sum, d) => sum + normMinutes(assignment, d, freeDays), 0)
			};
		});
	return {
		total: perAssignment.reduce((sum, a) => sum + a.balance, 0),
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
