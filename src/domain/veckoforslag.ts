// The suggested week report to a receiver (ADR 0012, skill tidsregler).
import type { DayTime } from './flex';
import type { FreeDays } from './helgdagar';
import { normMinutes } from './norm';
import { daysOfWeek } from './tid';
import type {
	Assignment,
	Id,
	IsoDate,
	IsoWeek,
	Minutes,
	Receiver,
	ReportLine,
	SuggestionMode,
	TimeCode
} from './types';

const QUARTER: Minutes = 15;

/** To the nearest quarter of an hour. Minutes are whole, so 7 rounds down and 8 up. */
export const roundToQuarter = (minutes: Minutes): Minutes =>
	Math.round(minutes / QUARTER) * QUARTER;

/**
 * One day's time per internal subject (code or absence type) as the suggestion reports it.
 * `actualQuarter`: each subject rounded to the nearest quarter. `fillNorm`: the same, then the
 * day is made to equal its norm by changing the internal codes with the most time; absence is
 * left as it is, and a day with norm 0 reports nothing.
 */
export const suggestDay = (
	bySubject: ReadonlyMap<Id, Minutes>,
	mode: SuggestionMode,
	norm: Minutes,
	codeIds: ReadonlySet<Id>
): Map<Id, Minutes> => {
	const day = new Map([...bySubject].map(([id, m]) => [id, roundToQuarter(m)] as const));
	if (mode === 'actualQuarter') return day;
	if (norm === 0) return new Map();
	const codes = [...day.keys()]
		.filter((id) => codeIds.has(id))
		.sort((a, b) => day.get(b)! - day.get(a)! || a.localeCompare(b));
	let diff = norm - [...day.values()].reduce((a, b) => a + b, 0);
	for (const id of codes) {
		if (diff === 0) break;
		const minutes = day.get(id)!;
		const changed = Math.max(0, minutes + diff);
		day.set(id, changed);
		diff -= changed - minutes;
	}
	return day;
};

export interface WeekSuggestionInput {
	assignment: Assignment;
	receiver: Receiver;
	week: IsoWeek;
	days: ReadonlyMap<IsoDate, DayTime>;
	freeDays: FreeDays;
	codes: readonly TimeCode[];
	mode?: SuggestionMode;
}

export interface WeekSuggestion {
	lines: ReportLine[];
	/** Internal codes and absence types with time but no mapping to the receiver; not reported. */
	unmapped: Id[];
}

/**
 * The week's suggested report: minutes per receiver code and day, in the receiver's code order.
 * Each internal subject is rounded or filled before it is mapped, so every receiver in the same
 * mode gets the same sum as long as every subject is mapped.
 */
export const suggestWeek = ({
	assignment,
	receiver,
	week,
	days,
	freeDays,
	codes,
	mode = receiver.suggestionMode
}: WeekSuggestionInput): WeekSuggestion => {
	const codeIds = new Set(codes.map((c) => c.id));
	const lines = new Map(
		receiver.codes.map((code) => [code.id, [0, 0, 0, 0, 0, 0, 0] as ReportLine['minutesPerDay']])
	);
	const unmapped = new Set<Id>();
	daysOfWeek(week).forEach((date, weekdayIndex) => {
		const norm = normMinutes(assignment, date, freeDays);
		const bySubject = days.get(date)?.bySubject ?? new Map<Id, Minutes>();
		for (const [subject, minutes] of suggestDay(bySubject, mode, norm, codeIds)) {
			if (minutes === 0) continue;
			const line = lines.get(receiver.mapping[subject] ?? '');
			if (line) line[weekdayIndex]! += minutes;
			else unmapped.add(subject);
		}
	});
	return {
		lines: [...lines]
			.filter(([, perDay]) => perDay.some((m) => m > 0))
			.map(([receiverCodeId, minutesPerDay]) => ({ receiverCodeId, minutesPerDay })),
		unmapped: [...unmapped].sort()
	};
};
