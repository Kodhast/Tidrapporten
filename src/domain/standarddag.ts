// The standard day (issue 24, ADR 0004 and 0012): an assignment's usual intervals, offered in the
// day view as a suggestion for a workday that has no time yet.
import { type FreeDays, isDayOff } from './helgdagar.ts';
import { weekStatus } from './lasning.ts';
import { isWithinAssignment } from './norm.ts';
import { atLocalTime, clockToMinutes, isoWeekOf } from './tid.ts';
import type {
	Assignment,
	Entry,
	Id,
	IsoDate,
	Report,
	StandardDaySlot,
	TimeCode,
	UtcMillis
} from './types.ts';

export interface SuggestedInterval {
	assignmentId: Id;
	codeId: Id;
	start: UtcMillis;
	end: UtcMillis;
}

export interface SuggestionInput {
	date: IsoDate;
	today: IsoDate;
	assignments: readonly Assignment[];
	/** Each assignment's codes, archived ones too, by assignment id. */
	codes: Readonly<Record<Id, readonly TimeCode[]>>;
	/** The entries on the day, absence included. */
	entries: readonly Entry[];
	/** The day's gaps are marked as a pause. */
	paused: boolean;
	freeDays: FreeDays;
	reports: readonly Report[];
}

/**
 * The standard days of the assignments that are active on the date, in their order, as
 * intervals. Empty unless the date is a workday up to today with no entries and no pause mark.
 * An assignment whose week is sent or unlocked is left out, and so is a slot on an archived code.
 */
export const standardDaySuggestion = (input: SuggestionInput): SuggestedInterval[] => {
	const { date } = input;
	if (date > input.today || input.paused || input.entries.length > 0) return [];
	if (isDayOff(date, input.freeDays)) return [];
	const week = isoWeekOf(date);
	return input.assignments
		.filter((a) => !a.archived && isWithinAssignment(a, date))
		.filter((a) => weekStatus(input.reports, a.id, week) === 'open')
		.sort((a, b) => a.order - b.order)
		.flatMap((a) => {
			const active = new Set((input.codes[a.id] ?? []).filter((c) => !c.archived).map((c) => c.id));
			return sortedSlots(a.standardDay)
				.filter((slot) => active.has(slot.codeId))
				.map((slot) => ({
					assignmentId: a.id,
					codeId: slot.codeId,
					start: atLocalTime(date, slot.start),
					end: atLocalTime(date, slot.end)
				}));
		});
};

export const sortedSlots = (slots: readonly StandardDaySlot[]): StandardDaySlot[] =>
	[...slots].sort((a, b) => a.start.localeCompare(b.start));

export type SlotProblem = 'order' | 'overlap';

/**
 * What is wrong with a slot among the others: it must end after it starts, within the day, and
 * must not overlap another slot. Null when it is fine.
 */
export const slotProblem = (
	slot: StandardDaySlot,
	others: readonly StandardDaySlot[]
): SlotProblem | null => {
	const start = clockToMinutes(slot.start);
	const end = clockToMinutes(slot.end);
	if (end <= start) return 'order';
	const overlaps = others.some(
		(o) => clockToMinutes(o.start) < end && start < clockToMinutes(o.end)
	);
	return overlaps ? 'overlap' : null;
};
