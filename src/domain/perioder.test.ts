import { describe, expect, it } from 'vitest';
import { freeDaysByDate } from './helgdagar.ts';
import { addDays } from './tid.ts';
import {
	periodForm,
	periodLabel,
	periodRows,
	MAX_PERIODS,
	periodsNorm,
	putPeriod,
	removePeriod,
	termsIn,
	type PeriodForm,
	type Periods
} from './perioder.ts';

// Made-up periods (ADR 0021): full time in the first quarter, a break in the second, 80 % after.
const periods: Periods = {
	terms: [
		{ from: '2026-01-01', scopePercent: 100, workdayMinutes: 480 },
		{ from: '2026-04-01', scopePercent: 0, workdayMinutes: 480 },
		{ from: '2026-07-01', scopePercent: 80, workdayMinutes: 480 }
	],
	endDate: null
};
const form = (overrides: Partial<PeriodForm> = {}): PeriodForm => ({
	from: '2026-09-01',
	to: '',
	scope: '60',
	workday: '8',
	...overrides
});

describe('periodRows and periodLabel', () => {
	it('ends each period the day before the next and the last at the end', () => {
		expect(periodRows(periods).map((r) => [r.from, r.to])).toEqual([
			['2026-01-01', '2026-03-31'],
			['2026-04-01', '2026-06-30'],
			['2026-07-01', null]
		]);
		expect(periodRows({ ...periods, endDate: '2026-12-31' }).at(-1)?.to).toBe('2026-12-31');
	});

	it('writes the year once when it does not change', () => {
		expect(periodLabel({ from: '2026-01-01', to: '2026-03-31' })).toBe('1 jan – 31 mar 2026');
		expect(periodLabel({ from: '2026-12-01', to: '2027-01-31' })).toBe('1 dec 2026 – 31 jan 2027');
		expect(periodLabel({ from: '2026-07-01', to: null })).toBe('1 jul 2026 – tills vidare');
	});
});

describe('termsIn and periodsNorm', () => {
	const free = freeDaysByDate([]);

	it('gives the terms in force, none before the first period or after the end', () => {
		expect(termsIn(periods, '2025-12-31')).toBeUndefined();
		expect(termsIn(periods, '2026-05-04')?.scopePercent).toBe(0);
		expect(termsIn({ ...periods, endDate: '2026-12-31' }, '2027-01-04')).toBeUndefined();
	});

	it('counts 6:30 on a weekday at 80 % of 8 h, and nothing on a day off', () => {
		// 480 × 80 / 100 = 384 min, to the nearest quarter 390 (ADR 0013).
		expect(periodsNorm(periods, '2026-09-01', free)).toBe(390);
		expect(periodsNorm(periods, '2026-05-04', free)).toBe(0); // the break
		expect(periodsNorm(periods, '2026-09-05', free)).toBe(0); // a Saturday
		expect(periodsNorm(periods, '2026-12-25', free)).toBe(0); // juldagen
	});
});

describe('putPeriod', () => {
	it('splits the period in force with a new one, which keeps no gap', () => {
		const result = putPeriod(periods, null, form());
		expect(result.errors).toBeNull();
		expect(periodRows(result.periods!).map((r) => [r.from, r.to, r.scopePercent])).toEqual([
			['2026-01-01', '2026-03-31', 100],
			['2026-04-01', '2026-06-30', 0],
			['2026-07-01', '2026-08-31', 80],
			['2026-09-01', null, 60]
		]);
	});

	it('sets the end from the last period, and clears it', () => {
		const ended = putPeriod(periods, 2, form({ from: '2026-07-01', to: '2027-06-30' }));
		expect(ended.periods?.endDate).toBe('2027-06-30');
		const open = putPeriod(ended.periods!, 2, form({ from: '2026-07-01', to: '' }));
		expect(open.periods?.endDate).toBeNull();
	});

	it('ignores the end of a period in the middle', () => {
		const result = putPeriod(periods, null, form({ from: '2026-05-01', to: '2026-05-31' }));
		expect(result.periods?.endDate).toBeNull();
	});

	it('moves where the period before ends when a start is changed', () => {
		const result = putPeriod(periods, 1, form({ from: '2026-05-01', scope: '0' }));
		expect(periodRows(result.periods!)[0]?.to).toBe('2026-04-30');
	});

	it('moves the first period, and with it the start', () => {
		const result = putPeriod(periods, 0, form({ from: '2025-12-01', scope: '100' }));
		expect(result.periods?.terms[0]?.from).toBe('2025-12-01');
	});

	it('refuses a start past the neighbours, a taken day and one before the first', () => {
		expect(putPeriod(periods, 1, form({ from: '2026-07-01' })).errors).toEqual({
			from: 'Före nästa periods start'
		});
		expect(putPeriod(periods, 2, form({ from: '2026-04-01' })).errors).toEqual({
			from: 'Efter föregående periods start'
		});
		expect(putPeriod(periods, null, form({ from: '2026-04-01' })).errors).toEqual({
			from: 'Det finns redan en period från den dagen'
		});
		expect(putPeriod(periods, null, form({ from: '2025-06-01' })).errors).toEqual({
			from: 'Ändra första perioden i stället'
		});
		expect(
			putPeriod({ ...periods, endDate: '2026-12-31' }, null, form({ from: '2027-01-04' })).errors
		).toEqual({ from: 'Efter sista periodens slut' });
	});

	it('accepts 0 % and refuses over 100 %, a bad workday and an end before the start', () => {
		expect(putPeriod(periods, null, form({ scope: '0' })).errors).toBeNull();
		expect(
			putPeriod(periods, null, form({ scope: '101', workday: '25', to: '2026-08-01' })).errors
		).toEqual({
			scope: 'Mellan 0 och 100 %',
			workday: 'Mellan 0 och 24 h',
			to: 'Tidigast periodens start'
		});
		expect(putPeriod(periods, null, form({ from: '' })).errors).toEqual({ from: 'Välj ett datum' });
		const full: Periods = {
			terms: Array.from({ length: MAX_PERIODS }, (_, i) => ({
				from: addDays('2026-01-01', i),
				scopePercent: 100,
				workdayMinutes: 480
			})),
			endDate: null
		};
		expect(putPeriod(full, null, form()).errors).toEqual({ from: 'Högst 50 perioder' });
	});

	it('makes the first period of an employment without any', () => {
		const result = putPeriod({ terms: [], endDate: null }, null, form({ from: '2026-01-05' }));
		expect(result.periods).toEqual({
			terms: [{ from: '2026-01-05', scopePercent: 60, workdayMinutes: 480 }],
			endDate: null
		});
	});
});

describe('removePeriod and periodForm', () => {
	it('lets the period before cover the removed one, and keeps the first', () => {
		expect(periodRows(removePeriod(periods, 1)).map((r) => [r.from, r.to])).toEqual([
			['2026-01-01', '2026-06-30'],
			['2026-07-01', null]
		]);
		expect(removePeriod(periods, 0).terms).toHaveLength(3);
		const only = { terms: periods.terms.slice(0, 1), endDate: '2026-12-31' };
		expect(removePeriod(only, 0)).toEqual({ terms: [], endDate: null });
	});

	it('fills the form from a row, or a new one with the end the periods have', () => {
		expect(periodForm(periodRows(periods)[2]!, '2026-07-01', periods)).toEqual({
			from: '2026-07-01',
			to: '',
			scope: '80',
			workday: '8'
		});
		expect(periodForm(null, '2026-09-01', { ...periods, endDate: '2026-12-31' }, 465)).toEqual({
			from: '2026-09-01',
			to: '2026-12-31',
			scope: '100',
			workday: '7,75'
		});
	});
});
