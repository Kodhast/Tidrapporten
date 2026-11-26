// The week and its reports (issue 20, mockup "Vecka", "Rapport" and "Avskrift"): the week's
// actual time, norm and flex, each receiver's report or suggestion, the changes Mats makes to a
// suggestion and the snapshot that is saved when a report is sent. The suggestion itself is
// veckoforslag.ts's, and flex is flex.ts's.
import { firstReceiver, timeByDay, weekFlex, type AbsenceCountings, type DayTime } from './flex.ts';
import type { FreeDays } from './helgdagar.ts';
import { formatHours } from './installningar.ts';
import { normMinutes } from './norm.ts';
import { addDays, clockOf, dateOf, daysOfWeek, isoWeekOf, weekday } from './tid.ts';
import type {
	AbsenceType,
	Assignment,
	Entry,
	Id,
	IsoDate,
	IsoWeek,
	Minutes,
	Receiver,
	Report,
	ReportLine,
	ReportSnapshot,
	TimeCode,
	UtcMillis
} from './types.ts';
import { suggestWeek } from './veckoforslag.ts';

export type DayMinutes = ReportLine['minutesPerDay'];

export const noMinutes = (): DayMinutes => [0, 0, 0, 0, 0, 0, 0];

export const lineMinutes = (line: ReportLine): Minutes =>
	line.minutesPerDay.reduce((a, b) => a + b, 0);

export const linesMinutes = (lines: readonly ReportLine[]): Minutes =>
	lines.reduce((sum, line) => sum + lineMinutes(line), 0);

export interface WeekInput {
	week: IsoWeek;
	assignments: readonly Assignment[];
	/** Each assignment's receivers, by assignment id. */
	receivers: Readonly<Record<Id, readonly Receiver[]>>;
	/** The entries in and around the week; those outside it do not count. */
	entries: readonly Entry[];
	/** The week's reports. */
	reports: readonly Report[];
	freeDays: FreeDays;
	countings: AbsenceCountings;
	now: UtcMillis;
}

export interface ReceiverWeek {
	receiver: Receiver;
	/** The stored report, null when none is saved. */
	report: Report | null;
	/** The reported minutes of a sent or unlocked report, else the suggestion's. */
	minutes: Minutes;
	/** The report as it would be sent now: the stored one when sent or unlocked, else suggested. */
	lines: ReportLine[];
	/** Internal codes and absence types with time that the receiver has no code for. */
	unmapped: Id[];
}

export interface AssignmentWeek {
	assignment: Assignment;
	days: Map<IsoDate, DayTime>;
	actual: Minutes;
	norm: Minutes;
	flex: Minutes;
	/** Any time in the week, komptid included: then every receiver needs a report. */
	hasTime: boolean;
	receivers: ReceiverWeek[];
}

export interface WeekView {
	actual: Minutes;
	norm: Minutes;
	flex: Minutes;
	/** Reports to send: receivers of an assignment with time whose report is not sent. */
	toSend: number;
	perAssignment: AssignmentWeek[];
}

/** Whether a stored report is the one to show rather than a suggestion. */
const isFixed = (report: Report | null): report is Report =>
	report?.status === 'sent' || report?.status === 'unlocked';

/**
 * The week per assignment: the assignments that are not archived and run some day of the week, in
 * their order, and their receivers in the chain's order. An archived receiver shows only when it
 * has a report that week.
 */
export const weekView = (input: WeekInput): WeekView => {
	const { week, freeDays, countings, now } = input;
	const dates = daysOfWeek(week);
	const monday = dates[0]!;
	const sunday = dates[6]!;
	const perAssignment = input.assignments
		.filter(
			(a) => !a.archived && a.startDate <= sunday && (a.endDate === null || a.endDate >= monday)
		)
		.sort((a, b) => a.order - b.order)
		.map((assignment): AssignmentWeek => {
			const days = timeByDay(assignment, input.entries, freeDays, countings);
			const own = input.reports.filter((r) => r.assignmentId === assignment.id && r.week === week);
			const all = input.receivers[assignment.id] ?? [];
			const first = firstReceiver(all);
			const receivers = all
				.filter((r) => !r.archived || own.some((report) => report.receiverId === r.id))
				.sort((a, b) => a.position - b.position)
				.map((receiver): ReceiverWeek => {
					const report = own.find((r) => r.receiverId === receiver.id) ?? null;
					const suggestion = suggestWeek({ assignment, receiver, week, days, freeDays });
					const lines = isFixed(report) ? report.lines : suggestion.lines;
					return {
						receiver,
						report,
						minutes: linesMinutes(lines),
						lines,
						unmapped: suggestion.unmapped
					};
				});
			return {
				assignment,
				days,
				actual: dates.reduce((sum, d) => sum + (days.get(d)?.actual ?? 0), 0),
				norm: dates.reduce((sum, d) => sum + normMinutes(assignment, d, freeDays), 0),
				flex: weekFlex({
					assignment,
					week,
					days,
					freeDays,
					firstReport: own.find((r) => r.receiverId === first?.id),
					now
				}),
				hasTime: dates.some((d) => (days.get(d)?.bySubject.size ?? 0) > 0),
				receivers
			};
		});
	return {
		actual: perAssignment.reduce((sum, a) => sum + a.actual, 0),
		norm: perAssignment.reduce((sum, a) => sum + a.norm, 0),
		flex: perAssignment.reduce((sum, a) => sum + a.flex, 0),
		toSend: perAssignment
			.filter((a) => a.hasTime)
			.reduce((sum, a) => sum + a.receivers.filter((r) => r.report?.status !== 'sent').length, 0),
		perAssignment
	};
};

/**
 * Every code of the receiver in its order, with the minutes of `lines`; a code without time has
 * zeros, so that it can be raised. A line for a code the receiver no longer has comes last.
 */
export const editableLines = (receiver: Receiver, lines: readonly ReportLine[]): ReportLine[] => {
	const known = new Set(receiver.codes.map((c) => c.id));
	return [
		...receiver.codes.map(
			(code) =>
				lines.find((l) => l.receiverCodeId === code.id) ?? {
					receiverCodeId: code.id,
					minutesPerDay: noMinutes()
				}
		),
		...lines.filter((l) => !known.has(l.receiverCodeId))
	].map((l) => ({ ...l, minutesPerDay: [...l.minutesPerDay] as DayMinutes }));
};

/** The lines worth storing: those with time. */
export const storedLines = (lines: readonly ReportLine[]): ReportLine[] =>
	lines.filter((l) => lineMinutes(l) > 0);

/** The index of the day with the most minutes, the first of equals. */
const fullestDay = (days: DayMinutes): number =>
	days.reduce((best, m, i) => (m > days[best]! ? i : best), 0);

/**
 * A line changed to `minutes` for the week (the mockup's stepper per code and week). More time
 * goes to the code's fullest day, or the first workday when it has none; less time comes off the
 * fullest day first, then the next. `workdays` are the weekday indexes (0 = Monday) with a norm.
 */
export const changeWeek = (
	line: ReportLine,
	minutes: Minutes,
	workdays: readonly number[]
): ReportLine => {
	const days = [...line.minutesPerDay] as DayMinutes;
	let diff = Math.max(0, minutes) - lineMinutes(line);
	if (diff > 0) {
		const day = lineMinutes(line) > 0 ? fullestDay(days) : (workdays[0] ?? 0);
		days[day]! += diff;
	}
	while (diff < 0) {
		const day = fullestDay(days);
		const taken = Math.min(days[day]!, -diff);
		days[day]! -= taken;
		diff += taken;
	}
	return { ...line, minutesPerDay: days };
};

/** The weekday indexes (0 = Monday) where the assignment has a norm. */
export const workdaysOf = (assignment: Assignment, week: IsoWeek, freeDays: FreeDays): number[] =>
	daysOfWeek(week)
		.map((date, i) => (normMinutes(assignment, date, freeDays) > 0 ? i : -1))
		.filter((i) => i >= 0);

/** `Utveckling`, `Utveckling och Möten`, `Utveckling, Möten och Intern tid`. */
export const listNames = (names: readonly string[]): string =>
	names.length <= 1
		? (names[0] ?? '')
		: `${names.slice(0, -1).join(', ')} och ${names[names.length - 1]}`;

/** The names of the internal codes and absence types mapped to a receiver code, in that order. */
export const mappedFrom = (
	receiver: Receiver,
	receiverCodeId: Id,
	codes: readonly TimeCode[],
	absenceTypes: readonly AbsenceType[]
): string[] => {
	const names = [
		...[...codes].sort((a, b) => a.order - b.order),
		...[...absenceTypes].sort((a, b) => a.order - b.order)
	]
		.filter((s) => receiver.mapping[s.id] === receiverCodeId)
		.map((s) => s.name);
	return names;
};

/** The name of an internal code or absence type, or the id when it is gone. */
export const subjectName = (
	id: Id,
	codes: readonly TimeCode[],
	absenceTypes: readonly AbsenceType[]
): string =>
	codes.find((c) => c.id === id)?.name ?? absenceTypes.find((t) => t.id === id)?.name ?? id;

/**
 * The report as it is sent: its lines with time, and a snapshot of the names and the week's actual
 * time as they are now. `sentAt` is set by the server when it is stored.
 */
export const sentReport = (
	report: Omit<Report, 'status' | 'snapshot'>,
	assignment: Assignment,
	receiver: Receiver,
	actualMinutes: Minutes,
	now: UtcMillis
): Report => {
	const lines = storedLines(report.lines);
	const snapshot: ReportSnapshot = {
		sentAt: now,
		assignmentName: assignment.name,
		receiverName: receiver.name,
		codeNames: Object.fromEntries(
			lines.map((l) => [
				l.receiverCodeId,
				receiver.codes.find((c) => c.id === l.receiverCodeId)?.name ?? l.receiverCodeId
			])
		),
		actualMinutes
	};
	return { ...report, lines, status: 'sent', snapshot };
};

/** A receiver code's name: the snapshot's when the report was sent, else the receiver's. */
export const codeName = (receiver: Receiver, report: Report | null, receiverCodeId: Id): string =>
	report?.snapshot?.codeNames[receiverCodeId] ??
	receiver.codes.find((c) => c.id === receiverCodeId)?.name ??
	receiverCodeId;

/** Hours with a decimal comma and the unit: 2070 → `34,5 h`. */
export const hoursLabel = (minutes: Minutes): string => `${formatHours(minutes)} h`;

const WEEKDAYS = ['mån', 'tis', 'ons', 'tor', 'fre', 'lör', 'sön'];

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

const dayMonth = (date: IsoDate) =>
	[Number(date.slice(8, 10)), MONTHS[Number(date.slice(5, 7)) - 1]!] as const;

/**
 * `Vecka 47 · 16–22 nov`, `Vecka 49 · 30 nov–6 dec`; the year is added when it is not the year of
 * `today`: `Vecka 1 2027 · 4–10 jan`.
 */
export const weekLabel = (week: IsoWeek, today: IsoDate): string => {
	const dates = daysOfWeek(week);
	const [fromDay, fromMonth] = dayMonth(dates[0]!);
	const [toDay, toMonth] = dayMonth(dates[6]!);
	const year = week.slice(0, 4);
	const number = `Vecka ${Number(week.slice(6))}${year === today.slice(0, 4) ? '' : ` ${year}`}`;
	const span =
		fromMonth === toMonth
			? `${fromDay}–${toDay} ${toMonth}`
			: `${fromDay} ${fromMonth}–${toDay} ${toMonth}`;
	return `${number} · ${span}`;
};

/** The week `steps` weeks from `week`. */
export const otherWeek = (week: IsoWeek, steps: number): IsoWeek => {
	return isoWeekOf(addDays(daysOfWeek(week)[0]!, steps * 7));
};

/** `fre 20 nov 16:05`: when a report was sent, in Swedish time. */
export const sentLabel = (at: UtcMillis, withTime = false): string => {
	const date = dateOf(at);
	const weekdayName = WEEKDAYS[weekday(date) - 1]!;
	const [day, month] = dayMonth(date);
	return `${weekdayName} ${day} ${month}${withTime ? ` ${clockOf(at)}` : ''}`;
};
