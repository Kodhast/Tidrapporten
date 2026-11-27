import { describe, expect, it } from 'vitest';
import { billing, billingLabel, billingPercent, type BillingInput } from './debitering.ts';
import { absentAllDay, absentBetween, assignment, at, code, hm, work } from './testdata.ts';

// Made-up time. Week 49 of 2026 is Monday 30 November to Sunday 6 December, so it spans two
// months. "Now" is Wednesday 2 December at 12:00. c1 is billable, c2 is internal.
const NOW = at('2026-12-02', '12:00');
const a1 = assignment({ startDate: '2026-11-01' });
const codes = { a1: [code('c1'), code('c2', { billable: false })] };

const input = (overrides: Partial<BillingInput> = {}): BillingInput => ({
	assignments: [a1],
	codes,
	entries: [],
	timer: null,
	now: NOW,
	...overrides
});

describe('billingPercent', () => {
	it('rounds to the nearest whole percent', () => {
		// 2 h of 3 h = 66,67 % → 67 %.
		expect(billingPercent({ billable: hm('2:00'), worked: hm('3:00') })).toBe(67);
		expect(billingPercent({ billable: hm('1:00'), worked: hm('3:00') })).toBe(33);
	});

	it('gives no rate without worked time', () => {
		expect(billingPercent({ billable: 0, worked: 0 })).toBeNull();
		expect(billingLabel({ billable: 0, worked: 0 })).toBe('–');
		expect(billingLabel({ billable: hm('6:00'), worked: hm('8:00') })).toBe('75 %');
	});
});

describe('billing', () => {
	it('divides billable time by all worked time', () => {
		// Tuesday 1 December: 6 h on c1 and 2 h on c2 → 6 of 8 = 75 %.
		const result = billing(
			input({
				entries: [
					work('2026-12-01', '08:00', '14:00', 'c1'),
					work('2026-12-01', '14:00', '16:00', 'c2')
				]
			})
		);
		expect(result.week).toEqual({ billable: hm('6:00'), worked: hm('8:00') });
		expect(result.month).toEqual({ billable: hm('6:00'), worked: hm('8:00') });
		expect(billingPercent(result.week)).toBe(75);
	});

	it('keeps absence out of both parts', () => {
		// 4 h on c1, then sick for the afternoon and on holiday the next day: still 100 %.
		const result = billing(
			input({
				entries: [
					work('2026-12-01', '08:00', '12:00', 'c1'),
					absentBetween('2026-12-01', '12:00', '16:00', 'sjuk'),
					absentAllDay('2026-12-02', 'semester')
				]
			})
		);
		expect(result.week).toEqual({ billable: hm('4:00'), worked: hm('4:00') });
	});

	it('counts the week across the turn of the month, the month only from the first', () => {
		// Monday 30 November 8 h on c2; Tuesday 1 December 8 h on c1.
		// The week: 8 of 16 h = 50 %. December: 8 of 8 h = 100 %.
		const result = billing(
			input({
				entries: [
					work('2026-11-30', '08:00', '16:00', 'c2'),
					work('2026-12-01', '08:00', '16:00', 'c1')
				]
			})
		);
		expect(billingPercent(result.week)).toBe(50);
		expect(billingPercent(result.month)).toBe(100);
	});

	it('splits an interval over midnight between the months', () => {
		// 30 November 22:00 to 1 December 02:00 on c1: 2 h in November, 2 h in December.
		const result = billing(
			input({ entries: [work('2026-11-30', '22:00', '02:00', 'c1', '2026-12-01')] })
		);
		expect(result.week.worked).toBe(hm('4:00'));
		expect(result.month).toEqual({ billable: hm('2:00'), worked: hm('2:00') });
	});

	it('counts an archived billable code', () => {
		const result = billing(
			input({
				codes: { a1: [code('c1', { archived: true }), code('c2', { billable: false })] },
				entries: [work('2026-12-01', '08:00', '12:00', 'c1')]
			})
		);
		expect(result.month).toEqual({ billable: hm('4:00'), worked: hm('4:00') });
	});

	it('counts the running timer up to now', () => {
		// The timer on c2 since 08:00 today: 4 h internal; with 4 h billable yesterday → 50 %.
		const result = billing(
			input({
				entries: [work('2026-12-01', '08:00', '12:00', 'c1')],
				timer: {
					assignmentId: 'a1',
					subject: { kind: 'code', codeId: 'c2' },
					start: at('2026-12-02', '08:00')
				}
			})
		);
		expect(result.week).toEqual({ billable: hm('4:00'), worked: hm('8:00') });
	});

	it('gives each assignment its own rate and sums the time, not the rates', () => {
		// a1: 2 of 2 h billable. a2: 0 of 6 h. Total: 2 of 8 h = 25 %, not the mean 50 %.
		const a2 = assignment({ id: 'a2', name: 'Andra uppdraget', startDate: '2026-11-01', order: 1 });
		const internal = { ...work('2026-12-01', '08:00', '14:00', 'k1'), assignmentId: 'a2' };
		const result = billing(
			input({
				assignments: [a2, a1],
				codes: { ...codes, a2: [code('k1', { assignmentId: 'a2', billable: false })] },
				entries: [work('2026-12-01', '14:00', '16:00', 'c1'), internal]
			})
		);
		expect(result.perAssignment.map((a) => [a.assignment.id, billingPercent(a.week)])).toEqual([
			['a1', 100],
			['a2', 0]
		]);
		expect(billingPercent(result.week)).toBe(25);
	});

	it('leaves out archived assignments, ones not started and ones without time', () => {
		const archived = assignment({ id: 'a2', archived: true, startDate: '2026-11-01' });
		const later = assignment({ id: 'a3', startDate: '2027-01-01' });
		const idle = assignment({ id: 'a4', startDate: '2026-11-01' });
		const result = billing(
			input({
				assignments: [a1, archived, later, idle],
				entries: [
					work('2026-12-01', '08:00', '12:00', 'c1'),
					{ ...work('2026-12-01', '12:00', '16:00', 'c1'), assignmentId: 'a2' }
				]
			})
		);
		expect(result.perAssignment.map((a) => a.assignment.id)).toEqual(['a1']);
		expect(result.month.worked).toBe(hm('4:00'));
	});

	it('ignores time before the assignment started', () => {
		const late = assignment({ startDate: '2026-12-01' });
		const result = billing(
			input({
				assignments: [late],
				entries: [
					work('2026-11-30', '08:00', '16:00', 'c1'),
					work('2026-12-01', '08:00', '10:00', 'c2')
				]
			})
		);
		expect(result.week).toEqual({ billable: 0, worked: hm('2:00') });
	});
});
