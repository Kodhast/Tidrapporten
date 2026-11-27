// The basis for a week (issue 25, interview #3 point 7): actual against reported time per
// receiver, the intervals day by day and the week's change log, for the screen and for printing.
import { dayRows, daySum, spanLabel, type DayRow } from './dag.ts';
import { daysOfWeek } from './tid.ts';
import type {
	ChangeAction,
	ChangeLogEntry,
	Entry,
	IsoDate,
	IsoWeek,
	Minutes,
	UtcMillis
} from './types.ts';
import { linesMinutes, sentLabel, type WeekView } from './vecka.ts';

export interface ReceiverBasis {
	key: string;
	assignmentName: string;
	receiverName: string;
	actual: Minutes;
	/** The minutes of a sent or unlocked report; null while it is not sent. */
	reported: Minutes | null;
	sentAt: UtcMillis | null;
	/** Reported minus actual; null while the report is not sent. */
	difference: Minutes | null;
}

/**
 * Every receiver of an assignment with time in the week, or with a stored report, in the week's
 * order. A suggestion is not reported time, so only a sent or unlocked report has a difference.
 */
export const receiverBasis = (view: WeekView): ReceiverBasis[] =>
	view.perAssignment.flatMap((a) =>
		a.receivers
			.filter((r) => a.hasTime || r.report !== null)
			.map((r): ReceiverBasis => {
				const fixed = r.report?.status === 'sent' || r.report?.status === 'unlocked';
				const reported = fixed ? linesMinutes(r.report!.lines) : null;
				return {
					key: `${a.assignment.id}_${r.receiver.id}`,
					assignmentName: a.assignment.name,
					receiverName: r.receiver.name,
					actual: a.actual,
					reported,
					sentAt: fixed ? (r.report!.snapshot?.sentAt ?? null) : null,
					difference: reported === null ? null : reported - a.actual
				};
			})
	);

export interface DayBasis {
	date: IsoDate;
	/** The day's intervals and whole-day absence, without the gaps. */
	rows: Exclude<DayRow, { kind: 'gap' }>[];
	/** The interval time on the day, cut at midnight. */
	total: Minutes;
}

/** The days of the week that have any entry, Monday first. */
export const dayBasis = (entries: readonly Entry[], week: IsoWeek): DayBasis[] =>
	daysOfWeek(week).flatMap((date) => {
		const rows = dayRows(entries, date).filter(
			(r): r is DayBasis['rows'][number] => r.kind !== 'gap'
		);
		return rows.length === 0 ? [] : [{ date, rows, total: daySum(entries, date).total }];
	});

export type ChangeSubject = 'entry' | 'report' | 'assignment' | 'other';

/** What a log entry's path is about: `entries/…`, `reports/…`, `assignments/…`. */
export const changeSubject = (path: string): ChangeSubject => {
	const first = path.split('/')[0];
	if (first === 'entries') return 'entry';
	if (first === 'reports') return 'report';
	if (first === 'assignments') return 'assignment';
	return 'other';
};

const NOUNS: Record<ChangeSubject, string> = {
	entry: 'Tid',
	report: 'Rapport',
	assignment: 'Uppdrag',
	other: 'Inställning'
};

const VERBS: Record<ChangeAction, string> = {
	create: 'tillagd',
	update: 'ändrad',
	delete: 'raderad',
	send: 'skickad',
	unlock: 'upplåst',
	restore: 'återställd'
};

/** `Tid ändrad`, `Rapport skickad`. */
export const changeLabel = (log: Pick<ChangeLogEntry, 'path' | 'action'>): string => {
	const subject = changeSubject(log.path);
	const verb = VERBS[log.action];
	// "Uppdrag" is a neuter noun: "Uppdrag ändrat".
	return `${NOUNS[subject]} ${subject === 'assignment' ? verb.replace(/d$/, 't') : verb}`;
};

/** An interval or a whole day in the log's detail: `mån 16 nov 12:45–17:00`. */
const entryTime = (entry: Entry): string =>
	entry.time.kind === 'allDay'
		? `${sentLabel(Date.parse(`${entry.time.date}T12:00:00Z`))} hela dagen`
		: `${sentLabel(entry.time.start)} ${spanLabel(entry.time)}`;

/**
 * An entry change as before → after: `mån 16 nov 12:45–17:00 → 12:45–17:15`. The day is said
 * once when it is the same. Null when neither side could be read.
 */
export const entryChangeDetail = (before: Entry | null, after: Entry | null): string | null => {
	if (before && after) {
		const from = entryTime(before);
		const to = entryTime(after);
		const day = from.split(' ').slice(0, 3).join(' ');
		return to.startsWith(`${day} `) ? `${from} → ${to.slice(day.length + 1)}` : `${from} → ${to}`;
	}
	const one = after ?? before;
	return one ? entryTime(one) : null;
};

/** The week's log entries, oldest first. */
export const weekChanges = (log: readonly ChangeLogEntry[], week: IsoWeek): ChangeLogEntry[] =>
	log.filter((l) => l.week === week).sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
