// The timer (issue 18): which code a start uses, the entry a stop writes, the block on writing
// into a sent week offline, and the end the owner types for a forgotten timer.
import { CLOCK_ERROR, parseClock } from './dag.ts';
import { entryChange } from './lasning.ts';
import { addDays, atLocalTime, clockOf, dateOf } from './tid.ts';
import type {
	Assignment,
	Entry,
	Id,
	IsoDate,
	Report,
	TimeCode,
	Timer,
	UtcMillis
} from './types.ts';

const MINUTE = 60_000;
const MAX_ENTRY = 24 * 60 * MINUTE;

export interface CodeChoice {
	assignmentId: Id;
	codeId: Id;
}

export interface CodeGroup {
	assignment: Assignment;
	codes: TimeCode[];
}

/**
 * The codes the timer can run on, per assignment: assignments that are not archived and have not
 * ended before `today`, and their codes that are not archived, both in their order. An assignment
 * without such codes is left out.
 */
export const timerCodeGroups = (
	assignments: readonly Assignment[],
	codes: Readonly<Record<Id, readonly TimeCode[]>>,
	today: IsoDate
): CodeGroup[] =>
	assignments
		.filter((a) => !a.archived && (a.endDate === null || a.endDate >= today))
		.sort((a, b) => a.order - b.order)
		.map((assignment) => ({
			assignment,
			codes: (codes[assignment.id] ?? [])
				.filter((c) => !c.archived)
				.sort((a, b) => a.order - b.order)
		}))
		.filter((group) => group.codes.length > 0);

const findCode = (groups: readonly CodeGroup[], choice: CodeChoice) =>
	groups
		.find((g) => g.assignment.id === choice.assignmentId)
		?.codes.find((c) => c.id === choice.codeId);

/**
 * The code a start uses: the code of the latest interval that still can be chosen, else the first
 * code of the first assignment. Null when there is none.
 */
export const startChoice = (
	groups: readonly CodeGroup[],
	latest: readonly Entry[]
): CodeChoice | null => {
	const byStart = [...latest].sort((a, b) => startOf(b) - startOf(a));
	for (const entry of byStart) {
		if (entry.subject.kind !== 'code') continue;
		const choice = { assignmentId: entry.assignmentId, codeId: entry.subject.codeId };
		if (findCode(groups, choice)) return choice;
	}
	const first = groups[0];
	return first ? { assignmentId: first.assignment.id, codeId: first.codes[0]!.id } : null;
};

const startOf = (entry: Entry): number =>
	entry.time.kind === 'interval' ? entry.time.start : -Infinity;

/** The name of the timer's code and its assignment, for the chip and the dialog. */
export const choiceNames = (
	groups: readonly CodeGroup[],
	choice: CodeChoice
): { code: string; assignment: string } | null => {
	const group = groups.find((g) => g.assignment.id === choice.assignmentId);
	const code = group?.codes.find((c) => c.id === choice.codeId);
	return group && code ? { code: code.name, assignment: group.assignment.name } : null;
};

/** The timer's code as a choice; null for absence, which the timer does not run on. */
export const timerChoice = (timer: Timer): CodeChoice | null =>
	timer.subject.kind === 'code'
		? { assignmentId: timer.assignmentId, codeId: timer.subject.codeId }
		: null;

/**
 * The entry a stopped timer becomes. Its id is `timer-<start>`, so two devices stopping the same
 * timer give one entry (ADR 0012). The end is kept between one minute and 24 hours after the
 * start, the limits of an entry, so that a forgotten timer or a device clock behind the start
 * can always be stopped.
 */
export const timerEntry = (timer: Timer, end: UtcMillis, note = ''): Entry => ({
	id: `timer-${timer.start}`,
	assignmentId: timer.assignmentId,
	subject: timer.subject,
	time: { kind: 'interval', start: timer.start, end: timerEnd(timer, end) },
	note
});

/** The end kept between one minute and 24 hours after the start. */
export const timerEnd = (timer: Timer, end: UtcMillis): UtcMillis =>
	Math.min(Math.max(end, timer.start + MINUTE), timer.start + MAX_ENTRY);

/**
 * Whether stopping the timer at `end` must wait for the network: offline, an entry in a week that
 * is sent or unlocked would be queued and could be written without its log entry once another
 * device has sent the week (ADR 0012). `reports` are the latest known, from the cache.
 */
export const stopBlockedOffline = (
	timer: Timer,
	end: UtcMillis,
	reports: readonly Report[],
	online: boolean
): boolean =>
	!online && !isPaused(timer, end) && entryChange(null, timerEntry(timer, end), reports).logged;

/**
 * Whether the timer is in a pause (issue 95): a pause splits the timer, so its start is the pause's
 * end, which is still ahead. Nothing runs until then. A start less than a minute ahead is a timer
 * just started or brought back, seen with a clock that ticks once a minute, and counts as running.
 */
export const isPaused = (timer: Timer, now: UtcMillis): boolean => timer.start - now > MINUTE;

/** The running timer as an entry up to now; null without a timer or in a pause. */
export const runningEntry = (timer: Timer | null, now: UtcMillis): Entry | null =>
	timer && !isPaused(timer, now) ? timerEntry(timer, now) : null;

export type PauseKind = 'lunch' | 'errand';

export const PAUSE_NAMES: Record<PauseKind, string> = { lunch: 'Lunch', errand: 'Ärende' };

/** The lengths offered, in minutes, and the one chosen when the owner has not chosen before. */
export const PAUSE_LENGTHS = [15, 30, 45, 60] as const;
export const DEFAULT_PAUSE: Record<PauseKind, number> = { lunch: 30, errand: 15 };

export interface Pause {
	from: UtcMillis;
	until: UtcMillis;
}

export type PauseResult = { pause: Pause } | { error: string };

/**
 * A pause on the running timer from the typed start and the length (issue 95): the start on today's
 * date, or yesterday's for a timer over midnight, as `parseStart`. It is not later than now, and
 * at least a minute after the timer's start, since the interval before it is at least a minute.
 */
export const parsePause = (
	text: string,
	minutes: number,
	timer: Timer,
	now: UtcMillis
): PauseResult => {
	const typed = parseStart(text, timer, now);
	if ('error' in typed) {
		return {
			error: typed.error === CLOCK_ERROR ? CLOCK_ERROR : 'Pausen kan inte börja senare än nu'
		};
	}
	const earliest = timer.start + MINUTE;
	if (typed.start < earliest) {
		return { error: `Pausen kan börja tidigast ${clockOf(Math.ceil(earliest / MINUTE) * MINUTE)}` };
	}
	return { pause: { from: typed.start, until: typed.start + minutes * MINUTE } };
};

/** Running time as the owner reads it, without seconds: `42 min`, `1 h 42`, `11 h 05`. */
export const elapsedLabel = (from: UtcMillis, to: UtcMillis): string => {
	const minutes = Math.max(0, Math.floor((to - from) / MINUTE));
	if (minutes < 60) return `${minutes} min`;
	return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
};

/** Length as a sentence: `11 h 20 min`, `10 h`, `45 min`. */
export const durationLabel = (from: UtcMillis, to: UtcMillis): string => {
	const minutes = Math.max(0, Math.floor((to - from) / MINUTE));
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	if (hours === 0) return `${rest} min`;
	return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
};

export type EndResult = { end: UtcMillis } | { error: string };

/**
 * The end of a forgotten timer from what the owner typed: a clock time, `16:05`, `16.05` or
 * `1605`, on the start day, or on the next day when that is not after the start (a timer over
 * midnight, and `00:00` for midnight). It must be after the start and not later than now.
 */
export const parseEnd = (text: string, timer: Timer, now: UtcMillis): EndResult => {
	const clock = parseClock(text);
	if (!clock) return { error: CLOCK_ERROR };
	const startDay = dateOf(timer.start);
	let end = atLocalTime(startDay, clock);
	if (end <= timer.start) {
		end = atLocalTime(addDays(startDay, 1), clock);
		if (end > now) return { error: `Sluttiden måste vara efter ${clockOf(timer.start)}` };
	}
	if (end > now) return { error: 'Sluttiden kan inte vara senare än nu' };
	return { end };
};

export type StartResult = { start: UtcMillis } | { error: string };

/**
 * The new start of the running timer from what the owner typed (issue 78): a clock time on today's
 * date, or on yesterday's when that would be later than now and the timer began before today (a
 * timer over midnight). It cannot be later than now; a typed time later than now on a timer from
 * today is an error rather than yesterday, which would surprise.
 */
export const parseStart = (text: string, timer: Timer, now: UtcMillis): StartResult => {
	const clock = parseClock(text);
	if (!clock) return { error: CLOCK_ERROR };
	const today = dateOf(now);
	let start = atLocalTime(today, clock);
	if (start > now && dateOf(timer.start) < today) start = atLocalTime(addDays(today, -1), clock);
	if (start > now) return { error: 'Starttiden kan inte vara senare än nu' };
	return { start };
};

/**
 * The latest interval that ended at or before the timer's start on the timer's day: the one the
 * gap before the timer follows, and in a pause (issue 95) the one the timer was split from, which
 * ends where the pause began. Null when there is none, as for a pause that ends after midnight:
 * the change of the pause then begins at the pause's end.
 */
export const entryBefore = (timer: Timer, entries: readonly Entry[]): Entry | null => {
	const day = dateOf(timer.start);
	let before: Entry | null = null;
	let end = -Infinity;
	for (const entry of entries) {
		if (entry.time.kind !== 'interval' || entry.time.end > timer.start) continue;
		if (dateOf(entry.time.end) !== day || entry.time.end <= end) continue;
		before = entry;
		end = entry.time.end;
	}
	return before;
};

/**
 * The start the dialog suggests: the end of the interval before the timer, which fills the gap
 * since then; else the timer's own start.
 */
export const suggestStart = (timer: Timer, entries: readonly Entry[]): UtcMillis => {
	const before = entryBefore(timer, entries);
	return before?.time.kind === 'interval' ? before.time.end : timer.start;
};
