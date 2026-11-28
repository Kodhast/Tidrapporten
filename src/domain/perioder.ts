// Periods of scope for an assignment or an employment (ADR 0021): terms edge to edge, each from
// its `from` to the day before the next one's, the last to `endDate` or until further notice.
import { isDayOff, type FreeDays } from './helgdagar.ts';
import { DEFAULT_WORKDAY_MINUTES, fullDayNorm } from './norm.ts';
import { formatHours, isIsoDate, parseHours } from './installningar.ts';
import { addDays } from './tid.ts';
import type { AssignmentTerms, IsoDate, Minutes } from './types.ts';

export interface Periods {
	terms: readonly AssignmentTerms[];
	endDate: IsoDate | null;
}

/** One period as the views show it. */
export interface PeriodRow extends AssignmentTerms {
	/** The last day, or null until further notice. */
	to: IsoDate | null;
}

const sorted = (terms: readonly AssignmentTerms[]): AssignmentTerms[] =>
	[...terms].sort((a, b) => a.from.localeCompare(b.from));

export const periodRows = ({ terms, endDate }: Periods): PeriodRow[] => {
	const list = sorted(terms);
	return list.map((t, i) => ({
		...t,
		to: i + 1 < list.length ? addDays(list[i + 1]!.from, -1) : endDate
	}));
};

/** The terms in force on the date, or undefined before the first period and after the end. */
export const termsIn = ({ terms, endDate }: Periods, date: IsoDate): AssignmentTerms | undefined =>
	endDate !== null && date > endDate ? undefined : sorted(terms).findLast((t) => t.from <= date);

/** The norm of a day under the periods: zero on a day off and outside them (as normMinutes). */
export const periodsNorm = (periods: Periods, date: IsoDate, freeDays: FreeDays): Minutes => {
	const terms = termsIn(periods, date);
	return terms && !isDayOff(date, freeDays) ? fullDayNorm(terms) : 0;
};

/** A period as typed in its sheet. */
export interface PeriodForm {
	from: string;
	/** '' = until further notice; only the last period has an end. */
	to: string;
	scope: string; // %
	workday: string; // hours at 100 %
}

export type PeriodErrors = Partial<Record<keyof PeriodForm, string>>;

/** The sheet's form for a period, or for a new one from `from` with the end the periods have. */
export const periodForm = (
	row: PeriodRow | null,
	from: IsoDate,
	periods: Periods,
	workdayMinutes: Minutes = DEFAULT_WORKDAY_MINUTES
): PeriodForm => {
	const hours = (minutes: Minutes) => formatHours(minutes);
	return row
		? {
				from: row.from,
				to: row.to ?? '',
				scope: String(row.scopePercent),
				workday: hours(row.workdayMinutes)
			}
		: { from, to: periods.endDate ?? '', scope: '100', workday: hours(workdayMinutes) };
};

/**
 * The periods with one period added (`index` null) or changed, or the errors per field. A new
 * period splits the one in force on its first day; a changed `from` moves where the one before
 * ends. Periods never overlap and never leave a gap; a break is a period with 0 %.
 */
/** As many as the rules allow in terms (firestore.rules). */
export const MAX_PERIODS = 50;

export const putPeriod = (
	periods: Periods,
	index: number | null,
	form: PeriodForm
): { periods: Periods; errors: null } | { periods: null; errors: PeriodErrors } => {
	const list = sorted(periods.terms);
	const errors: PeriodErrors = {};
	const scope = /^\d{1,3}$/.test(form.scope.trim()) ? Number(form.scope) : NaN;
	if (!(scope >= 0 && scope <= 100)) errors.scope = 'Mellan 0 och 100 %';
	const workday = parseHours(form.workday);
	if (workday === null || workday < 1 || workday > 24 * 60) errors.workday = 'Mellan 0 och 24 h';
	const from = form.from;
	if (!isIsoDate(from)) errors.from = 'Välj ett datum';
	else if (index === null) {
		if (list.length >= MAX_PERIODS) errors.from = `Högst ${MAX_PERIODS} perioder`;
		else if (list.some((t) => t.from === from))
			errors.from = 'Det finns redan en period från den dagen';
		else if (list.length > 0 && from < list[0]!.from)
			errors.from = 'Ändra första perioden i stället';
		else if (periods.endDate !== null && from > periods.endDate)
			errors.from = 'Efter sista periodens slut';
	} else {
		const before = list[index - 1];
		const after = list[index + 1];
		if (before && from <= before.from) errors.from = 'Efter föregående periods start';
		else if (after && from >= after.from) errors.from = 'Före nästa periods start';
	}
	const rest = list.filter((_, i) => i !== index);
	const isLast = !rest.some((t) => t.from > from);
	let endDate = periods.endDate;
	if (isLast) {
		if (form.to === '') endDate = null;
		else if (!isIsoDate(form.to)) errors.to = 'Välj ett datum';
		else if (isIsoDate(from) && form.to < from) errors.to = 'Tidigast periodens start';
		else endDate = form.to;
	}
	if (Object.keys(errors).length > 0) return { periods: null, errors };
	return {
		periods: {
			terms: sorted([...rest, { from, scopePercent: scope, workdayMinutes: workday! }]),
			endDate
		},
		errors: null
	};
};

/**
 * The periods without one: the one before covers its days. The first cannot be removed while
 * others follow, since it is where the assignment or employment starts; the only one can, which
 * leaves no periods and no end.
 */
export const removePeriod = (periods: Periods, index: number): Periods => {
	const list = sorted(periods.terms);
	if (index === 0)
		return list.length === 1
			? { terms: [], endDate: null }
			: { terms: list, endDate: periods.endDate };
	return { terms: list.filter((_, i) => i !== index), endDate: periods.endDate };
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

const dayMonth = (date: IsoDate) =>
	`${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;

/** `1 jan – 31 mar 2026`, `1 dec 2026 – 31 jan 2027`, `1 jul 2026 – tills vidare`. */
export const periodLabel = (row: Pick<PeriodRow, 'from' | 'to'>): string => {
	const fromYear = row.from.slice(0, 4);
	if (row.to === null) return `${dayMonth(row.from)} ${fromYear} – tills vidare`;
	const toYear = row.to.slice(0, 4);
	const start = fromYear === toYear ? dayMonth(row.from) : `${dayMonth(row.from)} ${fromYear}`;
	return `${start} – ${dayMonth(row.to)} ${toYear}`;
};
