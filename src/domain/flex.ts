// Actual time and flex per assignment and week (ADR 0012, skill tidsregler).
import type { FreeDays } from './helgdagar';
import { splitByDay } from './intervall';
import { isWithinAssignment, normMinutes } from './norm';
import { dateOf, daysOfWeek, weeksBetween } from './tid';
import type {
	AbsenceCounting,
	AbsenceType,
	Assignment,
	Entry,
	Id,
	IsoDate,
	IsoWeek,
	Minutes,
	Receiver,
	Report,
	UtcMillis
} from './types';

/** How each absence type counts, by id. An unknown id counts as `fillsNorm`. */
export type AbsenceCountings = ReadonlyMap<Id, AbsenceCounting>;

export const absenceCountings = (types: readonly AbsenceType[]): AbsenceCountings =>
	new Map(types.map((t) => [t.id, t.counting]));

export interface DayTime {
	/** Actual time for flex: worked time plus absence as its counting says. */
	actual: Minutes;
	/** Time per internal code or absence type id as a report shows it; whole-day absence = norm. */
	bySubject: Map<Id, Minutes>;
}

export const subjectId = (entry: Entry): Id =>
	entry.subject.kind === 'code' ? entry.subject.codeId : entry.subject.absenceTypeId;

/**
 * The assignment's time per local day, from its entries. Intervals over midnight count on each
 * day. Days outside the assignment are left out.
 */
export const timeByDay = (
	assignment: Assignment,
	entries: readonly Entry[],
	freeDays: FreeDays,
	countings: AbsenceCountings
): Map<IsoDate, DayTime> => {
	const days = new Map<IsoDate, DayTime>();
	const add = (date: IsoDate, subject: Id, reported: Minutes, actual: Minutes) => {
		if (!isWithinAssignment(assignment, date)) return;
		const day = days.get(date) ?? { actual: 0, bySubject: new Map() };
		day.actual += actual;
		day.bySubject.set(subject, (day.bySubject.get(subject) ?? 0) + reported);
		days.set(date, day);
	};
	for (const entry of entries) {
		if (entry.assignmentId !== assignment.id) continue;
		const subject = subjectId(entry);
		const counting =
			entry.subject.kind === 'code'
				? 'worked'
				: (countings.get(entry.subject.absenceTypeId) ?? 'fillsNorm');
		const counts = (minutes: Minutes) => (counting === 'flexWithdrawal' ? 0 : minutes);
		if (entry.time.kind === 'allDay') {
			const norm = normMinutes(assignment, entry.time.date, freeDays);
			add(entry.time.date, subject, norm, counts(norm));
		} else {
			for (const part of splitByDay(entry.time)) {
				add(part.date, subject, part.minutes, counts(part.minutes));
			}
		}
	}
	return days;
};

/** The first receiver in the chain (`position` 1, or the lowest), whose report counts for flex. */
export const firstReceiver = (receivers: readonly Receiver[]): Receiver | undefined =>
	receivers
		.filter((r) => !r.archived)
		.reduce<Receiver | undefined>((a, r) => (!a || r.position < a.position ? r : a), undefined);

export const isSent = (report: Report | undefined): report is Report =>
	report?.status === 'sent' || report?.status === 'unlocked';

export const reportedMinutes = (report: Report): Minutes =>
	report.lines.reduce((sum, line) => sum + line.minutesPerDay.reduce((a, b) => a + b, 0), 0);

export interface WeekFlexInput {
	assignment: Assignment;
	week: IsoWeek;
	days: ReadonlyMap<IsoDate, DayTime>;
	freeDays: FreeDays;
	/** The first receiver's report for the week, if it has been saved. */
	firstReport: Report | undefined;
	now: UtcMillis;
}

/**
 * Flex for one week. Sent (first receiver's report `sent` or `unlocked`): actual minus reported.
 * Open: actual minus the norm so far, where days before today count their whole norm and today
 * counts its norm only up to the actual time.
 */
export const weekFlex = ({
	assignment,
	week,
	days,
	freeDays,
	firstReport,
	now
}: WeekFlexInput): Minutes => {
	const dates = daysOfWeek(week);
	const actual = dates.reduce((sum, date) => sum + (days.get(date)?.actual ?? 0), 0);
	if (isSent(firstReport)) return actual - reportedMinutes(firstReport);
	const today = dateOf(now);
	const normSoFar = dates.reduce((sum, date) => {
		if (date > today) return sum;
		const norm = normMinutes(assignment, date, freeDays);
		return sum + (date < today ? norm : Math.min(norm, days.get(date)?.actual ?? 0));
	}, 0);
	return actual - normSoFar;
};

export interface FlexInput {
	assignment: Assignment;
	entries: readonly Entry[];
	freeDays: FreeDays;
	countings: AbsenceCountings;
	/** The first receiver's reports, by week. */
	firstReports: ReadonlyMap<IsoWeek, Report>;
	now: UtcMillis;
}

export interface AssignmentFlex {
	balance: Minutes;
	byWeek: Map<IsoWeek, Minutes>;
}

/** The opening balance plus each week's flex from the assignment's start up to now. */
export const assignmentFlex = (input: FlexInput): AssignmentFlex => {
	const { assignment, now } = input;
	const days = timeByDay(assignment, input.entries, input.freeDays, input.countings);
	const today = dateOf(now);
	const last =
		assignment.endDate !== null && assignment.endDate < today ? assignment.endDate : today;
	const byWeek = new Map<IsoWeek, Minutes>();
	let balance = assignment.openingFlex;
	for (const week of weeksBetween(assignment.startDate, last)) {
		const flex = weekFlex({
			assignment,
			week,
			days,
			freeDays: input.freeDays,
			firstReport: input.firstReports.get(week),
			now
		});
		byWeek.set(week, flex);
		balance += flex;
	}
	return { balance, byWeek };
};

/** The total over all assignments. */
export const totalFlex = (flexes: readonly AssignmentFlex[]): Minutes =>
	flexes.reduce((sum, f) => sum + f.balance, 0);

/**
 * Sent reports for the same week whose sum differs from the first receiver's. The app warns
 * about them; flex still follows the first receiver.
 */
export const reportsWithOtherSum = (
	firstReport: Report | undefined,
	reports: readonly Report[]
): Report[] => {
	if (!isSent(firstReport)) return [];
	const expected = reportedMinutes(firstReport);
	return reports.filter(
		(r) =>
			r.id !== firstReport.id &&
			r.week === firstReport.week &&
			isSent(r) &&
			reportedMinutes(r) !== expected
	);
};
