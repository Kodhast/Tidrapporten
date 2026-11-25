import { describe, expect, it } from 'vitest';
import { freeDaysByDate } from './helgdagar';
import { normMinutes, termsOn } from './norm';
import { assignment } from './testdata';

const none = freeDaysByDate([]);

describe('normMinutes', () => {
	it.each([
		[100, 480, 480],
		[50, 480, 240],
		[75, 480, 360],
		[80, 480, 390], // 384 = 6:24 rounds to 6:30
		[90, 480, 435], // 432 = 7:12 rounds to 7:15
		[100, 450, 450], // a shorter workday set on the assignment
		[33, 480, 165], // 158.4 rounds to 2:45
		[25, 450, 120], // 112.5 is exactly half a quarter and rounds up
		[10, 480, 45] // 48 rounds down
	])('%i %% of a %i-minute workday is %i minutes', (scopePercent, workdayMinutes, norm) => {
		const a = assignment({ terms: [{ from: '2026-01-01', scopePercent, workdayMinutes }] });
		expect(normMinutes(a, '2026-11-25', none)).toBe(norm);
	});

	it.each([
		['2026-11-28', 'Saturday'],
		['2026-11-29', 'Sunday'],
		['2026-12-25', 'Christmas Day'],
		['2026-12-24', 'Christmas Eve'],
		['2025-12-31', 'before the assignment starts']
	])('is 0 on %s (%s)', (date) => {
		expect(normMinutes(assignment(), date, none)).toBe(0);
	});

	it('is 0 after the assignment ends and full on its last day', () => {
		const a = assignment({ endDate: '2026-11-25' });
		expect(normMinutes(a, '2026-11-25', none)).toBe(480);
		expect(normMinutes(a, '2026-11-26', none)).toBe(0);
	});

	it('is 0 on an extra day off and full on an eve the owner works', () => {
		const freeDays = freeDaysByDate([
			{ date: '2026-11-27', free: true, name: 'Klämdag' },
			{ date: '2026-12-24', free: false, name: 'Julafton' }
		]);
		expect(normMinutes(assignment(), '2026-11-27', freeDays)).toBe(0);
		expect(normMinutes(assignment(), '2026-12-24', freeDays)).toBe(480);
	});

	it('follows the terms in force on each day, so a change does not rewrite earlier days', () => {
		const a = assignment({
			terms: [
				{ from: '2026-01-01', scopePercent: 100, workdayMinutes: 480 },
				{ from: '2026-11-25', scopePercent: 50, workdayMinutes: 480 }
			]
		});
		expect(normMinutes(a, '2026-11-24', none)).toBe(480);
		expect(normMinutes(a, '2026-11-25', none)).toBe(240);
		expect(termsOn(a, '2026-11-24')?.scopePercent).toBe(100);
	});

	it('is 0 when no terms are in force yet', () => {
		const a = assignment({
			terms: [{ from: '2026-12-01', scopePercent: 100, workdayMinutes: 480 }]
		});
		expect(normMinutes(a, '2026-11-25', none)).toBe(0);
	});
});
