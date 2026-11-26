// The reminders (issue 22): which of them are due, and what each one says. Pure, so that the
// scheduled function in firebase-functions/ and Vitest share it (decision 0014). The function runs
// every 15 minutes; a reminder is looked at once, in the first run after its time on its day, and
// is then handled whether or not it was sent, so a timer started at 09:40 does not bring a
// "no timer" reminder at 09:45. The texts name no assignment, code or receiver: they show on the
// lock screen.
import { dayName, isOnDay } from './dag.ts';
import type { FreeDays } from './helgdagar.ts';
import { formatHours } from './installningar.ts';
import { isWithinAssignment, normMinutes } from './norm.ts';
import { flexLabel, overview, type OverviewInput } from './oversikt.ts';
import { addDays, clockOf, clockToMinutes, dateOf, daysOfWeek, isoWeekOf, weekday } from './tid.ts';
import type { Assignment, ClockTime, IsoDate, Minutes, Settings, UtcMillis } from './types.ts';

export type ReminderKind = 'noTimer' | 'timerRunning' | 'emptyDay' | 'report' | 'flex';

/** A reminder to look at now; `key` marks it handled, once per day (the report once per week). */
export interface Check {
	kind: ReminderKind;
	key: string;
}

/** What the notification shows, and the address its button and the notification itself open. */
export interface Notice {
	/** `test` is the test notification from the settings. */
	kind: ReminderKind | 'test';
	title: string;
	body: string;
	url: string;
	action: string;
}

/**
 * A reminder whose time passed longer ago than this is not sent late: after a stop of the
 * function, "Ingen timer igång" at 14:00 would only be noise.
 */
export const REMINDER_WINDOW: Minutes = 120;

/** The empty day and the flex are looked at with "no timer", or at this time when it is off. */
const MORNING: ClockTime = '09:30';

/** The flex reminder comes at most once a week while the balance stays over the limit. */
export const flexSentKey = (week: string): string => `flexSent_${week}`;

const minutesOfDay = (at: UtcMillis): Minutes => clockToMinutes(clockOf(at));

const inWindow = (now: UtcMillis, time: ClockTime | null): time is ClockTime => {
	if (time === null) return false;
	const since = minutesOfDay(now) - clockToMinutes(time);
	return since >= 0 && since < REMINDER_WINDOW;
};

/** The reminders that are due now and not yet handled. */
export function dueChecks(
	now: UtcMillis,
	settings: Settings,
	handled: ReadonlySet<string>
): Check[] {
	const today = dateOf(now);
	const week = isoWeekOf(today);
	const morning = settings.noTimerBy ?? MORNING;
	const candidates: Array<[ReminderKind, ClockTime | null, string]> = [
		['noTimer', settings.noTimerBy, `noTimer_${today}`],
		['timerRunning', settings.timerRunningAt, `timerRunning_${today}`],
		['emptyDay', settings.remindEmptyDay ? morning : null, `emptyDay_${today}`],
		['report', weekday(today) === 5 ? settings.reportReminderFridayAt : null, `report_${week}`],
		[
			'flex',
			settings.flexWarning > 0 && !handled.has(flexSentKey(week)) ? morning : null,
			`flex_${today}`
		]
	];
	return candidates
		.filter(([, time, key]) => inWindow(now, time) && !handled.has(key))
		.map(([kind, , key]) => ({ kind, key }));
}

/** What a reminder looks at: the user's data, as the start page has it, and the pause marks. */
export interface ReminderData extends OverviewInput {
	pauses: ReadonlySet<IsoDate>;
}

const activeOn = (assignments: readonly Assignment[], date: IsoDate) =>
	assignments.filter((a) => !a.archived && isWithinAssignment(a, date));

const isWorkday = (data: ReminderData, date: IsoDate, freeDays: FreeDays = data.freeDays) =>
	activeOn(data.assignments, date).some((a) => normMinutes(a, date, freeDays) > 0);

/** A day with an entry or a pause mark has been seen to. */
const hasTime = (data: ReminderData, date: IsoDate) =>
	data.pauses.has(date) || data.entries.some((entry) => isOnDay(entry, date));

const DEFINITE_DAY = [
	'Måndagen',
	'Tisdagen',
	'Onsdagen',
	'Torsdagen',
	'Fredagen',
	'Lördagen',
	'Söndagen'
];

/** The latest workday before today, up to a week back. */
const lastWorkday = (data: ReminderData, today: IsoDate): IsoDate | undefined =>
	Array.from({ length: 7 }, (_, i) => addDays(today, -1 - i)).find((d) => isWorkday(data, d));

/** The non-archived receivers this week without a sent report, over assignments with a workday. */
const unsentThisWeek = (data: ReminderData, today: IsoDate): number => {
	const week = isoWeekOf(today);
	const dates = daysOfWeek(week);
	let count = 0;
	for (const assignment of data.assignments.filter((a) => !a.archived)) {
		const works = dates.some(
			(d) => isWithinAssignment(assignment, d) && normMinutes(assignment, d, data.freeDays) > 0
		);
		if (!works) continue;
		for (const receiver of (data.receivers[assignment.id] ?? []).filter((r) => !r.archived)) {
			const sent = data.reports.some(
				(r) =>
					r.assignmentId === assignment.id &&
					r.receiverId === receiver.id &&
					r.week === week &&
					r.status === 'sent'
			);
			if (!sent) count += 1;
		}
	}
	return count;
};

/** The notification for a due reminder, or null when there is nothing to remind of. */
export function reminderNotice(
	check: Check,
	data: ReminderData,
	settings: Settings
): Notice | null {
	const today = dateOf(data.now);
	switch (check.kind) {
		case 'noTimer':
			if (data.timer || !isWorkday(data, today) || hasTime(data, today)) return null;
			return {
				kind: check.kind,
				title: 'Ingen timer igång',
				body: `Klockan är ${settings.noTimerBy ?? MORNING} och dagen har ingen tid än.`,
				url: '/?gor=starta',
				action: 'Starta timern'
			};
		case 'timerRunning': {
			if (!data.timer) return null;
			const start = data.timer.start;
			const when =
				dateOf(start) === today
					? clockOf(start)
					: `${dayName(dateOf(start)).toLowerCase()} ${clockOf(start)}`;
			return {
				kind: check.kind,
				title: 'Timern går fortfarande',
				body: `Startad ${when}.`,
				url: '/?gor=stoppa',
				action: 'Stoppa'
			};
		}
		case 'emptyDay': {
			const day = lastWorkday(data, today);
			if (!day || hasTime(data, day)) return null;
			return {
				kind: check.kind,
				title: `${DEFINITE_DAY[weekday(day) - 1]} saknar tid`,
				body: 'Fyll i eller markera frånvaro.',
				url: `/#/dag/${day}`,
				action: 'Öppna dagen'
			};
		}
		case 'report': {
			const count = unsentThisWeek(data, today);
			if (count === 0) return null;
			return {
				kind: check.kind,
				title: 'Veckorapporten är inte skickad',
				body: `${count} mottagare väntar.`,
				url: `/#/vecka/${isoWeekOf(today)}`,
				action: 'Öppna veckan'
			};
		}
		case 'flex': {
			const total = overview(data).total;
			if (Math.abs(total) <= settings.flexWarning) return null;
			return {
				kind: check.kind,
				title: `Flexsaldot är ${flexLabel(total)}`,
				body: `Gränsen är ±${formatHours(settings.flexWarning)} h.`,
				url: '/',
				action: 'Öppna'
			};
		}
	}
}

/** Handled keys older than this are dropped, so the document stays small. */
export const HANDLED_DAYS = 14;

/** The handled keys to keep: those marked within the last two weeks. */
export const keepHandled = (
	handled: Readonly<Record<string, UtcMillis>>,
	now: UtcMillis
): Record<string, UtcMillis> =>
	Object.fromEntries(
		Object.entries(handled).filter(([, at]) => now - at < HANDLED_DAYS * 24 * 60 * 60_000)
	);
