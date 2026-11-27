// The cloud budget (decision 0010, issue 28): the function in firebase-functions/src/budget.ts
// writes the status from 90 %, and the app warns from it. Both count from here.
import { dateOf } from './tid.ts';
import type { UtcMillis } from './types.ts';

/** From here the app warns and the function writes the status. */
export const WARNING_PERCENT = 90;
/** From here the function turns billing off in the test project. Drift is never stopped. */
export const STOP_PERCENT = 100;

/** `system/budget` in the drift project, as the function writes it. */
export interface BudgetStatus {
	/** Cost as a share of the budget, in per cent, not rounded. */
	percent: number;
	cost: number;
	budget: number;
	/** ISO 4217, 'SEK' for this billing account. */
	currency: string;
	/** 'YYYY-MM': the budget month the figures belong to. */
	month: string;
}

/** Cost against budget in per cent; 0 when the budget is not a positive amount. */
export const budgetPercent = (cost: number, budget: number): number =>
	budget > 0 ? (cost / budget) * 100 : 0;

/** 'YYYY-MM' of the instant in Europe/Stockholm. */
export const monthOf = (at: UtcMillis): string => dateOf(at).slice(0, 7);

const MONTHS = [
	'januari',
	'februari',
	'mars',
	'april',
	'maj',
	'juni',
	'juli',
	'augusti',
	'september',
	'oktober',
	'november',
	'december'
];

/** `2026-11` → `november`. */
export const monthName = (month: string): string => MONTHS[Number(month.slice(5, 7)) - 1] ?? month;

const amount = (value: number, currency: string) =>
	`${Math.round(value)} ${currency === 'SEK' ? 'kr' : currency}`;

export interface BudgetNotice {
	title: string;
	detail: string;
}

/**
 * The warning at the top of Idag (mockup in issue 16), or null when there is nothing to warn
 * about: under 90 %, or a status from another month than the current one in Swedish time.
 */
export function budgetNotice(status: BudgetStatus | null, now: UtcMillis): BudgetNotice | null {
	if (!status || status.percent < WARNING_PERCENT || status.month !== monthOf(now)) return null;
	return {
		title: `Molnbudgeten är till ${Math.floor(status.percent)} % använd`,
		detail:
			`${amount(status.cost, status.currency)} av ${amount(status.budget, status.currency)} ` +
			`i ${monthName(status.month)}. Inget stoppas i drift, men se över användningen.`
	};
}
