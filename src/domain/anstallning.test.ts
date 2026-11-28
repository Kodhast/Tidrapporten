import { describe, expect, it } from 'vitest';
import { employmentFlex, type CountedAssignment } from './anstallning.ts';
import { absenceCountings, assignmentFlex, timeByDay } from './flex.ts';
import { freeDaysByDate } from './helgdagar.ts';
import { absenceTypes, assignment, at, employer, hm, report, workFor } from './testdata.ts';
import type { Assignment, Employer, Entry, Report, UtcMillis } from './types.ts';

// Made-up weeks: week 47 of 2026 is 16–22 November without holidays. The employment starts on
// Monday 16 November with no opening balance.
const free = freeDaysByDate([]);
const countings = absenceCountings(absenceTypes);
const MONDAY_AFTER = at('2026-11-23', '07:00');
const DAYS = ['16', '17', '18', '19', '20'].map((d) => `2026-11-${d}`);

const employment = (overrides: Partial<Employer> = {}): Employer =>
	employer({
		terms: [{ from: '2026-11-16', scopePercent: 100, workdayMinutes: 480 }],
		...overrides
	});
const assignmentA = assignment({
	id: 'a1',
	startDate: '2026-11-16',
	terms: [{ from: '2026-11-16', scopePercent: 50, workdayMinutes: 480 }],
	employerId: 'g1'
});
const internal = assignment({
	id: 'a2',
	startDate: '2026-11-16',
	terms: [{ from: '2026-11-16', scopePercent: 0, workdayMinutes: 480 }],
	employerId: 'g1'
});

const counted = (
	a: Assignment,
	entries: readonly Entry[],
	now: UtcMillis,
	firstReport?: Report
): CountedAssignment => {
	const own = entries.map((e) => ({ ...e, assignmentId: a.id }));
	const { byWeek } = assignmentFlex({
		assignment: a,
		entries: own,
		freeDays: free,
		countings,
		firstReports: new Map(firstReport ? [[firstReport.week, firstReport]] : []),
		now
	});
	return { assignment: a, days: timeByDay(a, own, free, countings), byWeek };
};

describe('employmentFlex (ADR 0021)', () => {
	it('counts the worked example: +1 h against the employment', () => {
		// Assignment A at 50 %: 22 h worked, 20 h reported and sent → +2 h.
		const a = counted(
			assignmentA,
			DAYS.map((d, i) => workFor(d, i === 0 ? '6:00' : '4:00')),
			MONDAY_AFTER,
			report('2026-W47', 'sent', [240, 240, 240, 240, 240, 0, 0])
		);
		// An internal assignment at 0 %: 19 h worked → +19 h.
		const b = counted(
			internal,
			DAYS.map((d, i) => workFor(d, i === 4 ? '3:00' : '4:00')),
			MONDAY_AFTER
		);
		expect(a.byWeek.get('2026-W47')).toBe(hm('2:00'));
		expect(b.byWeek.get('2026-W47')).toBe(hm('19:00'));
		// Uncovered norm: 40 h for the employment − 20 h for A − 0 h = 20 h. 2 + 19 − 20 = +1 h,
		// which is 41 h worked against 20 h reported and 20 h uncovered.
		const flex = employmentFlex({
			employer: employment(),
			assignments: [a, b],
			freeDays: free,
			now: MONDAY_AFTER
		});
		expect(flex?.byWeek.get('2026-W47')).toBe(hm('1:00'));
		expect(flex?.balance).toBe(hm('1:00'));
	});

	it('equals the assignment when both are full time, but with its own opening balance', () => {
		const full = assignment({ startDate: '2026-11-16', employerId: 'g1', openingFlex: hm('4:00') });
		const a = counted(
			{ ...full, terms: [{ from: '2026-11-16', scopePercent: 100, workdayMinutes: 480 }] },
			DAYS.map((d) => workFor(d, '8:30')),
			MONDAY_AFTER
		);
		const flex = employmentFlex({
			employer: employment({ openingFlex: hm('-1:00') }),
			assignments: [a],
			freeDays: free,
			now: MONDAY_AFTER
		});
		expect(a.byWeek.get('2026-W47')).toBe(hm('2:30'));
		expect(flex?.balance).toBe(hm('1:30'));
	});

	it('takes the whole norm on the bench, where no assignment asks for any', () => {
		const flex = employmentFlex({
			employer: employment(),
			assignments: [counted(internal, [], MONDAY_AFTER)],
			freeDays: free,
			now: MONDAY_AFTER
		});
		expect(flex?.balance).toBe(hm('-40:00'));
	});

	it('gives plus when the assignments ask for more than the employment', () => {
		// Employment at 50 %, an assignment at 100 % worked to its norm: 20 h more than the employment.
		const a = counted(
			{ ...assignmentA, terms: [{ from: '2026-11-16', scopePercent: 100, workdayMinutes: 480 }] },
			DAYS.map((d) => workFor(d, '8:00')),
			MONDAY_AFTER
		);
		const flex = employmentFlex({
			employer: employment({
				terms: [{ from: '2026-11-16', scopePercent: 50, workdayMinutes: 480 }]
			}),
			assignments: [a],
			freeDays: free,
			now: MONDAY_AFTER
		});
		expect(flex?.balance).toBe(hm('20:00'));
	});

	it('counts a change of scope mid-week from its day, and stops at the end', () => {
		const flex = employmentFlex({
			employer: employment({
				terms: [
					{ from: '2026-11-16', scopePercent: 100, workdayMinutes: 480 },
					{ from: '2026-11-19', scopePercent: 0, workdayMinutes: 480 }
				],
				endDate: '2026-11-20'
			}),
			assignments: [],
			freeDays: free,
			now: at('2026-12-07', '12:00')
		});
		// Monday to Wednesday at 8 h, Thursday and Friday a break; no weeks after the end.
		expect([...flex!.byWeek]).toEqual([['2026-W47', hm('-24:00')]]);
	});

	it('counts today only up to the time worked, as an open week does', () => {
		// Monday 16 November at 12:00 with 3 h worked in the internal assignment.
		const now = at('2026-11-16', '12:00');
		const flex = employmentFlex({
			employer: employment(),
			assignments: [counted(internal, [workFor('2026-11-16', '3:00')], now)],
			freeDays: free,
			now
		});
		expect(flex?.balance).toBe(0);
	});

	it('leaves out holidays, and is null for an employer without periods', () => {
		const flex = employmentFlex({
			employer: employment({
				terms: [{ from: '2026-12-21', scopePercent: 100, workdayMinutes: 480 }]
			}),
			assignments: [],
			freeDays: free,
			now: at('2026-12-28', '07:00')
		});
		// Week 52: 21–23 December are workdays; julafton, juldagen and annandagen are not.
		expect(flex?.balance).toBe(hm('-24:00'));
		expect(
			employmentFlex({ employer: employer(), assignments: [], freeDays: free, now: MONDAY_AFTER })
		).toBeNull();
	});

	it('has only the opening balance before the employment starts', () => {
		expect(
			employmentFlex({
				employer: employment({
					terms: [{ from: '2027-01-04', scopePercent: 100, workdayMinutes: 480 }],
					openingFlex: hm('3:00')
				}),
				assignments: [],
				freeDays: free,
				now: MONDAY_AFTER
			})
		).toEqual({ balance: hm('3:00'), byWeek: new Map() });
	});
});
