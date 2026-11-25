// Locking (ADR 0012): which changes touch a sent week and what must then be logged. The
// Firestore rules enforce the same for reports; this lets the app ask for a reason first.
import { dateOf, isoWeekOf } from './tid.ts';
import type { ChangeAction, Entry, Id, IsoWeek, Report } from './types.ts';

export type WeekStatus = 'open' | 'sent' | 'unlocked';

/**
 * A week is sent for an assignment when any of its reports that week is `sent` or `unlocked`;
 * `sent` wins over `unlocked`, since a sent report is the one that cannot change.
 */
export const weekStatus = (
	reports: readonly Report[],
	assignmentId: Id,
	week: IsoWeek
): WeekStatus => {
	const statuses = reports
		.filter((r) => r.assignmentId === assignmentId && r.week === week)
		.map((r) => r.status);
	if (statuses.includes('sent')) return 'sent';
	if (statuses.includes('unlocked')) return 'unlocked';
	return 'open';
};

/** The ISO weeks an entry falls in; an interval over Sunday midnight falls in two. */
export const weeksOfEntry = (entry: Entry): IsoWeek[] => {
	if (entry.time.kind === 'allDay') return [isoWeekOf(entry.time.date)];
	// The end is exclusive: an interval that ends at midnight belongs to the day before.
	const weeks = [isoWeekOf(dateOf(entry.time.start)), isoWeekOf(dateOf(entry.time.end - 1))];
	return [...new Set(weeks)];
};

export interface EntryLogNeed {
	/** The change touches a sent or unlocked week, so the app writes a log entry with it. */
	logged: boolean;
	action: ChangeAction;
	/** The first sent or unlocked week the change touches, for the log entry. */
	week: IsoWeek | null;
}

/**
 * Whether creating, changing or deleting an entry must be logged: it must when the entry before
 * or after falls in a week that is sent for its assignment. The reason may be empty.
 */
export const entryChange = (
	before: Entry | null,
	after: Entry | null,
	reports: readonly Report[]
): EntryLogNeed => {
	const action: ChangeAction = before === null ? 'create' : after === null ? 'delete' : 'update';
	const sentWeeks = [before, after]
		.filter((e): e is Entry => e !== null)
		.flatMap((e) =>
			weeksOfEntry(e).filter((week) => weekStatus(reports, e.assignmentId, week) !== 'open')
		)
		.sort();
	return { logged: sentWeeks.length > 0, action, week: sentWeeks[0] ?? null };
};

export type ReportChange =
	| { allowed: false }
	| {
			allowed: true;
			action: ChangeAction;
			/** A locked change: written with a new log entry and a reason that is not empty. */
			locked: boolean;
	  };

/**
 * What a report change is, as the rules see it. A draft changes freely and can be sent; a sent
 * report can only be unlocked; an unlocked report can be changed or sent again. A sent report
 * cannot be unlocked and changed in the same write.
 */
export const reportChange = (before: Report | null, after: Report | null): ReportChange => {
	const from = before?.status ?? null;
	const to = after?.status ?? null;
	if (to === null)
		return from === 'draft'
			? { allowed: true, action: 'delete', locked: false }
			: { allowed: false };
	if (from === null) {
		if (to === 'unlocked') return { allowed: false };
		return { allowed: true, action: to === 'sent' ? 'send' : 'create', locked: false };
	}
	if (from === 'draft') {
		if (to === 'unlocked') return { allowed: false };
		return { allowed: true, action: to === 'sent' ? 'send' : 'update', locked: false };
	}
	if (from === 'sent') {
		return to === 'unlocked' && sameContent(before!, after!)
			? { allowed: true, action: 'unlock', locked: true }
			: { allowed: false };
	}
	if (to === 'draft') return { allowed: false };
	return { allowed: true, action: to === 'sent' ? 'send' : 'update', locked: true };
};

/** A JSON form with sorted keys, so that key order does not count. */
const canonical = (value: unknown): string =>
	JSON.stringify(value, (_, v: unknown) =>
		v && typeof v === 'object' && !Array.isArray(v)
			? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
			: v
	);

/**
 * Everything but id, status, lastChangeId and the snapshot is the same. An unlock keeps the
 * stored snapshot, whose time the server set when the report was sent, so the caller's copy of it
 * does not count.
 */
const sameContent = (a: Report, b: Report): boolean => {
	const content = (r: Report) =>
		canonical({ ...r, id: null, status: null, lastChangeId: null, snapshot: null });
	return content(a) === content(b);
};
