import { describe, expect, it } from 'vitest';
import { absenceCountings } from './flex.ts';
import { freeDaysByDate } from './helgdagar.ts';
import { flexLabel, isFlexNegative, overview, type OverviewInput } from './oversikt.ts';
import {
	absenceTypes,
	absentAllDay,
	assignment,
	at,
	hm,
	receiver,
	report,
	work
} from './testdata.ts';
import type { Entry } from './types.ts';

// Made-up weeks: week 47 of 2026 is 16–22 November and week 48 is 23–29 November, without
// holidays. "Now" is Wednesday 25 November at 12:00.
const NOW = at('2026-11-25', '12:00');
const a1 = assignment({ startDate: '2026-11-16' });

const week47: Entry[] = ['16', '17', '18', '19', '20'].map((d) =>
	work(`2026-11-${d}`, '08:00', '16:30')
);
const week48: Entry[] = [
	work('2026-11-23', '08:00', '16:00'),
	work('2026-11-24', '08:00', '17:00')
];

const input = (overrides: Partial<OverviewInput> = {}): OverviewInput => ({
	assignments: [a1],
	receivers: { a1: [receiver()] },
	entries: [...week47, ...week48],
	reports: [],
	freeDays: freeDaysByDate([]),
	countings: absenceCountings(absenceTypes),
	// The timer has run since 08:00 today.
	timer: {
		assignmentId: 'a1',
		subject: { kind: 'code', codeId: 'c1' },
		start: at('2026-11-25', '08:00')
	},
	now: NOW,
	...overrides
});

describe('overview', () => {
	it('counts flex, the week and today with the running timer', () => {
		// Week 47 open: 5 × 8:30 = 42:30 against 40:00 → +2:30.
		// Week 48 so far: 8 + 9 + 4 (the timer) = 21:00 against 8 + 8 + min(8, 4) = 20:00 → +1:00.
		const result = overview(input());
		expect(result.perAssignment).toHaveLength(1);
		const [a] = result.perAssignment;
		expect(a!.balance).toBe(hm('3:30'));
		expect(a!.weekFlex).toBe(hm('1:00'));
		expect(a!.weekActual).toBe(hm('21:00'));
		expect(a!.weekNorm).toBe(hm('40:00'));
		expect(result.total).toBe(hm('3:30'));
		expect(result.todayActual).toBe(hm('4:00'));
		expect(result.todayNorm).toBe(hm('8:00'));
	});

	it('counts a sent week as actual minus reported', () => {
		// Week 47 sent with 42:00: 42:30 − 42:00 = +0:30; with week 48's +1:00 → +1:30.
		const sent = report('2026-W47', 'sent', [504, 504, 504, 504, 504, 0, 0]);
		const [a] = overview(input({ reports: [sent] })).perAssignment;
		expect(a!.balance).toBe(hm('1:30'));
	});

	it('adds the opening balance and sums the assignments', () => {
		const a2 = assignment({
			id: 'a2',
			name: 'Andra',
			startDate: '2026-11-23',
			openingFlex: -90,
			order: 1
		});
		const result = overview(input({ assignments: [a2, a1], receivers: { a1: [receiver()] } }));
		// a2 has no time: −1:30 opening, and week 48 open with Monday and Tuesday's norm missing
		// (−16:00); today counts its norm only up to the actual time, which is none.
		expect(result.perAssignment.map((p) => p.assignment.id)).toEqual(['a1', 'a2']);
		expect(result.perAssignment[1]!.balance).toBe(hm('-17:30'));
		expect(result.total).toBe(hm('3:30') + hm('-17:30'));
		// Today's norm is both assignments' norm; the actual time is the timer's on a1.
		expect(result.todayNorm).toBe(hm('16:00'));
		expect(result.todayActual).toBe(hm('4:00'));
	});

	it('leaves out archived assignments and those that have not started', () => {
		const archived = assignment({ id: 'a2', archived: true });
		const later = assignment({ id: 'a3', startDate: '2026-12-01' });
		const result = overview(input({ assignments: [a1, archived, later] }));
		expect(result.perAssignment.map((p) => p.assignment.id)).toEqual(['a1']);
	});

	it('counts the unsent reports per receiver and ended week with time', () => {
		const r2 = receiver({ id: 'r2', name: 'Mottagare två', position: 2 });
		const gone = receiver({ id: 'r3', position: 3, archived: true });
		const receivers = { a1: [receiver(), r2, gone] };
		// Week 47 needs r1 and r2; week 48 has not ended; the archived receiver is not asked for.
		expect(overview(input({ receivers })).unsent).toBe(2);
		const sent = report('2026-W47', 'sent', [480, 480, 480, 480, 480, 0, 0]);
		const draft = report('2026-W47', 'draft', [480, 480, 480, 480, 480, 0, 0], 'r2');
		expect(overview(input({ receivers, reports: [sent, draft] })).unsent).toBe(1);
		const sentToo = { ...draft, status: 'sent' as const };
		expect(overview(input({ receivers, reports: [sent, sentToo] })).unsent).toBe(0);
		// An unlocked report is being changed and must be sent again.
		const unlocked = { ...draft, status: 'unlocked' as const };
		expect(overview(input({ receivers, reports: [sent, unlocked] })).unsent).toBe(1);
	});

	it('counts a week of only komptid as needing a report', () => {
		const komp = absentAllDay('2026-11-17', 'komptid');
		expect(overview(input({ entries: [komp, ...week48] })).unsent).toBe(1);
	});

	it('does not count a week without time as unsent', () => {
		expect(overview(input({ entries: week48 })).unsent).toBe(0);
	});

	it('counts nothing for the timer when none runs', () => {
		const result = overview(input({ timer: null }));
		expect(result.todayActual).toBe(0);
		// Week 48: 17:00 against 16:00 so far; today's norm counts only up to the actual time.
		expect(result.perAssignment[0]!.weekFlex).toBe(hm('1:00'));
	});

	it('counts only the interval before a pause the timer is in (issue 95)', () => {
		// The timer ran 08:00–11:30 and is in a lunch until 12:30; it is 12:00.
		const result = overview(
			input({
				entries: [...week47, ...week48, work('2026-11-25', '08:00', '11:30')],
				timer: {
					assignmentId: 'a1',
					subject: { kind: 'code', codeId: 'c1' },
					start: at('2026-11-25', '12:30')
				}
			})
		);
		expect(result.todayActual).toBe(hm('3:30'));
	});
});

describe('flexLabel', () => {
	it.each([
		[hm('6:30'), '+6,5 h'],
		[hm('-1:30'), '−1,5 h'],
		[0, '0 h'],
		[2, '0 h'],
		[3, '+0,1 h'],
		[hm('-20:00'), '−20,0 h']
	])('%i min → %s', (minutes, label) => {
		expect(flexLabel(minutes)).toBe(label);
	});
});

describe('isFlexNegative', () => {
	it('follows the rounded label', () => {
		expect(isFlexNegative(-2)).toBe(false);
		expect(isFlexNegative(-3)).toBe(false);
		expect(isFlexNegative(-4)).toBe(true);
		expect(isFlexNegative(hm('-1:30'))).toBe(true);
	});
});
