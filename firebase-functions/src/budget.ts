// The budget function (issue 28, decision 0010). Cloud Billing publishes the status of the budget
// "Tidrapporten 100 kr" on the Pub/Sub topic `budget` in the drift project every half hour or so.
// From 90 % the status is written for the app's warning; from 100 % billing is turned off in the
// test project. Drift is never stopped: TEST_PROJECT is the only id stopTestProject accepts.
// The Google clients are injected (index.ts), so that this file runs in Vitest without them.
import {
	budgetPercent,
	monthOf,
	STOP_PERCENT,
	WARNING_PERCENT,
	type BudgetStatus
} from '../../src/domain/budget.ts';

/** The only project whose billing the function may turn off. */
export const TEST_PROJECT = 'dagboken-497114';

/** The fields of Cloud Billing's budget notification that the function reads. */
export interface BudgetMessage {
	costAmount: number;
	budgetAmount: number;
	currencyCode: string;
	/** RFC 3339, the start of the budget month (midnight Pacific time). */
	costIntervalStart: string;
}

export interface BudgetEffects {
	/** The project the function runs in. */
	ownProject: string;
	writeStatus(status: BudgetStatus): Promise<void>;
	billingEnabled(projectId: string): Promise<boolean>;
	disableBilling(projectId: string): Promise<void>;
	info(message: string, fields: Record<string, unknown>): void;
	error(message: string, fields: Record<string, unknown>): void;
}

export type StopResult = 'stopped' | 'alreadyStopped' | 'refused' | 'failed';

/** The notification, or null when it lacks a field the function needs. */
export function parseBudgetMessage(json: unknown): BudgetMessage | null {
	if (typeof json !== 'object' || json === null) return null;
	const m = json as Record<string, unknown>;
	const { costAmount, budgetAmount, currencyCode, costIntervalStart } = m;
	if (
		typeof costAmount !== 'number' ||
		typeof budgetAmount !== 'number' ||
		typeof currencyCode !== 'string' ||
		typeof costIntervalStart !== 'string' ||
		Number.isNaN(Date.parse(costIntervalStart))
	) {
		return null;
	}
	return { costAmount, budgetAmount, currencyCode, costIntervalStart };
}

const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Turns billing off for the test project, and only for it: any other id, and the function's own
 * project, is refused. Does nothing when billing is already off, so that the notifications that
 * keep coming after the stop change nothing.
 */
export async function stopTestProject(
	projectId: string,
	effects: BudgetEffects
): Promise<StopResult> {
	if (projectId !== TEST_PROJECT || projectId === effects.ownProject) {
		effects.error('budget: vägrar stänga av betalningen', { projectId });
		return 'refused';
	}
	try {
		if (!(await effects.billingEnabled(projectId))) return 'alreadyStopped';
		await effects.disableBilling(projectId);
		return 'stopped';
	} catch (e) {
		effects.error('budget: avstängningen misslyckades', { projectId, reason: reason(e) });
		return 'failed';
	}
}

export type BudgetAction = 'none' | 'warned' | StopResult;

/** Handles one notification; never throws, every failure is logged. */
export async function handleBudget(json: unknown, effects: BudgetEffects): Promise<BudgetAction> {
	const message = parseBudgetMessage(json);
	if (!message) {
		effects.error('budget: okänt meddelande', {});
		return 'none';
	}
	const percent = budgetPercent(message.costAmount, message.budgetAmount);
	if (percent < WARNING_PERCENT) return 'none';

	// The stop goes first: it matters more than the warning.
	const action: BudgetAction =
		percent >= STOP_PERCENT ? await stopTestProject(TEST_PROJECT, effects) : 'warned';
	try {
		await effects.writeStatus({
			percent,
			cost: message.costAmount,
			budget: message.budgetAmount,
			currency: message.currencyCode,
			month: monthOf(Date.parse(message.costIntervalStart))
		});
	} catch (e) {
		effects.error('budget: statusen kunde inte skrivas', { reason: reason(e) });
	}
	effects.info('budget: hanterat', { percent: Math.floor(percent), action });
	return action;
}
