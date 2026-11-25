import { describe, expect, it } from 'vitest';
import { budgetNotice, budgetPercent, monthOf, type BudgetStatus } from './budget.ts';

// Made-up figures; the budget itself is 100 kr (decision 0010).
const status = (overrides: Partial<BudgetStatus> = {}): BudgetStatus => ({
	percent: 92,
	cost: 92,
	budget: 100,
	currency: 'SEK',
	month: '2026-11',
	...overrides
});

const NOV_15 = Date.parse('2026-11-15T12:00:00Z');

describe('budgetPercent', () => {
	it.each([
		// cost   budget  per cent
		[92, 100, 92],
		[150, 100, 150],
		[0, 100, 0],
		[89.99, 100, 89.99],
		[5, 0, 0] // no budget: nothing to warn about, and no division by zero
	])('%s of %s is %s %%', (cost, budget, percent) => {
		expect(budgetPercent(cost, budget)).toBeCloseTo(percent, 10);
	});
});

describe('monthOf', () => {
	it.each([
		['2026-10-31T22:59:59Z', '2026-10'], // 23:59:59 on 31 October in Sweden (winter time)
		['2026-10-31T23:00:00Z', '2026-11'], // midnight in Sweden, still October in UTC
		['2026-11-01T07:00:00Z', '2026-11'] // Google's costIntervalStart: midnight Pacific time
	])('%s is in %s', (instant, month) => {
		expect(monthOf(Date.parse(instant))).toBe(month);
	});
});

describe('budgetNotice', () => {
	it('is the mockup text at 92 kr of 100 kr in November', () => {
		expect(budgetNotice(status(), NOV_15)).toEqual({
			title: 'Molnbudgeten är till 92 % använd',
			detail: '92 kr av 100 kr i november. Inget stoppas i drift, men se över användningen.'
		});
	});

	it('rounds the per cent down and the amounts to whole kronor', () => {
		const notice = budgetNotice(status({ percent: 99.9, cost: 99.9, budget: 100 }), NOV_15);
		expect(notice?.title).toBe('Molnbudgeten är till 99 % använd');
		expect(notice?.detail).toMatch(/^100 kr av 100 kr i november\./);
	});

	it('also warns over the budget', () => {
		const notice = budgetNotice(status({ percent: 150, cost: 150 }), NOV_15);
		expect(notice?.title).toBe('Molnbudgeten är till 150 % använd');
		expect(notice?.detail).toMatch(/^150 kr av 100 kr/);
	});

	it('starts at 90 %', () => {
		expect(budgetNotice(status({ percent: 89.99 }), NOV_15)).toBeNull();
		expect(budgetNotice(status({ percent: 90 }), NOV_15)?.title).toContain('90 %');
	});

	it('is not shown without a status', () => {
		expect(budgetNotice(null, NOV_15)).toBeNull();
	});

	it('is not shown on 1 November 00:30 Swedish time for an October status', () => {
		const october = status({ month: '2026-10' });
		expect(budgetNotice(october, Date.parse('2026-10-31T23:30:00Z'))).toBeNull();
		expect(budgetNotice(october, Date.parse('2026-10-31T22:30:00Z'))?.detail).toContain(
			'i oktober'
		);
	});

	it('names another currency by its code', () => {
		expect(budgetNotice(status({ currency: 'EUR' }), NOV_15)?.detail).toMatch(/^92 EUR av 100 EUR/);
	});
});
