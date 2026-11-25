import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
	handleBudget,
	parseBudgetMessage,
	stopTestProject,
	TEST_PROJECT,
	type BudgetEffects
} from '../firebase-functions/src/budget.ts';

// The project ids from .firebaserc, the file every deploy reads: drift must never be turned off.
const projects = (
	JSON.parse(readFileSync(new URL('../.firebaserc', import.meta.url), 'utf8')) as {
		projects: { test: string; drift: string };
	}
).projects;
const DRIFT_PROJECT = projects.drift;

/** Cloud Billing's notification with made-up figures; the budget is 100 kr (decision 0010). */
const message = (costAmount: number, overrides: Record<string, unknown> = {}) => ({
	budgetDisplayName: 'Påhittad budget',
	alertThresholdExceeded: 0.9,
	costAmount,
	costIntervalStart: '2026-11-01T07:00:00Z',
	budgetAmount: 100,
	budgetAmountType: 'SPECIFIED_AMOUNT',
	currencyCode: 'SEK',
	...overrides
});

const effects = (overrides: Partial<BudgetEffects> = {}) => {
	const fake = {
		ownProject: DRIFT_PROJECT,
		writeStatus: vi.fn(async () => {}),
		billingEnabled: vi.fn(async () => true),
		disableBilling: vi.fn(async () => {}),
		info: vi.fn(),
		error: vi.fn(),
		...overrides
	};
	return fake satisfies BudgetEffects;
};

describe('parseBudgetMessage', () => {
	it('reads the fields the function needs', () => {
		expect(parseBudgetMessage(message(92))).toEqual({
			costAmount: 92,
			budgetAmount: 100,
			currencyCode: 'SEK',
			costIntervalStart: '2026-11-01T07:00:00Z'
		});
	});

	it.each([
		['null', null],
		['a string', 'budget'],
		['no cost', message(92, { costAmount: undefined })],
		['a cost as text', message(92, { costAmount: '92' })],
		['no budget', message(92, { budgetAmount: undefined })],
		['no currency', message(92, { currencyCode: undefined })],
		['no month', message(92, { costIntervalStart: undefined })],
		['a month that is not a date', message(92, { costIntervalStart: 'november' })]
	])('refuses %s', (_, json) => {
		expect(parseBudgetMessage(json)).toBeNull();
	});
});

describe('handleBudget', () => {
	it('does nothing under 90 %', async () => {
		const fx = effects();
		expect(await handleBudget(message(89.99), fx)).toBe('none');
		expect(fx.writeStatus).not.toHaveBeenCalled();
		expect(fx.billingEnabled).not.toHaveBeenCalled();
		expect(fx.disableBilling).not.toHaveBeenCalled();
	});

	it('writes the status but stops nothing from 90 to 99 %', async () => {
		const fx = effects();
		expect(await handleBudget(message(92), fx)).toBe('warned');
		expect(fx.writeStatus).toHaveBeenCalledWith({
			percent: 92,
			cost: 92,
			budget: 100,
			currency: 'SEK',
			month: '2026-11'
		});
		expect(fx.disableBilling).not.toHaveBeenCalled();
		expect(fx.info).not.toHaveBeenCalled();
	});

	it('turns billing off for the test project from 100 %', async () => {
		const fx = effects();
		expect(await handleBudget(message(100), fx)).toBe('stopped');
		expect(fx.disableBilling).toHaveBeenCalledExactlyOnceWith(TEST_PROJECT);
		expect(fx.info).toHaveBeenCalledExactlyOnceWith('budget: betalningen avstängd', {
			projectId: TEST_PROJECT
		});
		expect(fx.writeStatus).toHaveBeenCalledWith(expect.objectContaining({ percent: 100 }));
	});

	it('does not call the turn-off again when billing is already off', async () => {
		const fx = effects({ billingEnabled: vi.fn(async () => false) });
		expect(await handleBudget(message(150), fx)).toBe('alreadyStopped');
		expect(fx.billingEnabled).toHaveBeenCalledWith(TEST_PROJECT);
		expect(fx.disableBilling).not.toHaveBeenCalled();
		expect(fx.info).not.toHaveBeenCalled();
	});

	it('logs a failed turn-off as an error and still writes the status', async () => {
		const fx = effects({
			disableBilling: vi.fn(async () => {
				throw new Error('PERMISSION_DENIED');
			})
		});
		expect(await handleBudget(message(120), fx)).toBe('failed');
		expect(fx.error).toHaveBeenCalledWith('budget: avstängningen misslyckades', {
			projectId: TEST_PROJECT,
			reason: 'PERMISSION_DENIED'
		});
		expect(fx.writeStatus).toHaveBeenCalled();
	});

	it('logs a failed write as an error and still stops', async () => {
		const fx = effects({ writeStatus: vi.fn().mockRejectedValue('UNAVAILABLE') });
		expect(await handleBudget(message(100), fx)).toBe('stopped');
		expect(fx.error).toHaveBeenCalledWith('budget: statusen kunde inte skrivas', {
			reason: 'UNAVAILABLE'
		});
	});

	it('logs an unknown message and does nothing', async () => {
		const fx = effects();
		expect(await handleBudget({ hej: 1 }, fx)).toBe('none');
		expect(fx.error).toHaveBeenCalledWith('budget: okänt meddelande', {});
		expect(fx.writeStatus).not.toHaveBeenCalled();
	});
});

describe('stopTestProject never stops drift', () => {
	it('refuses the drift project and logs it', async () => {
		const fx = effects();
		expect(await stopTestProject(DRIFT_PROJECT, fx)).toBe('refused');
		expect(fx.billingEnabled).not.toHaveBeenCalled();
		expect(fx.disableBilling).not.toHaveBeenCalled();
		expect(fx.error).toHaveBeenCalledWith('budget: vägrar stänga av betalningen', {
			projectId: DRIFT_PROJECT
		});
	});

	it('refuses the test project when it runs there itself', async () => {
		const fx = effects({ ownProject: TEST_PROJECT });
		expect(await stopTestProject(TEST_PROJECT, fx)).toBe('refused');
		expect(fx.disableBilling).not.toHaveBeenCalled();
	});

	it('names the test project in .firebaserc, which is not the drift project', () => {
		expect(TEST_PROJECT).toBe(projects.test);
		expect(TEST_PROJECT).not.toBe(DRIFT_PROJECT);
	});
});
