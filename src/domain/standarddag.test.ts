import { describe, expect, it } from 'vitest';
import { freeDaysByDate } from './helgdagar.ts';
import { slotProblem, standardDaySuggestion, type SuggestionInput } from './standarddag.ts';
import { absentAllDay, assignment, at, code, report, work } from './testdata.ts';

// Made-up days. Monday 23 November 2026 is an ordinary workday; "today" is Wednesday 25 November.
const MONDAY = '2026-11-23';
const day = [
	{ start: '08:00', end: '12:00', codeId: 'c1' },
	{ start: '12:45', end: '16:45', codeId: 'c2' }
];
const a1 = assignment({ standardDay: day });
const codes = { a1: [code('c1'), code('c2')] };

const input = (overrides: Partial<SuggestionInput> = {}): SuggestionInput => ({
	date: MONDAY,
	today: '2026-11-25',
	assignments: [a1],
	codes,
	entries: [],
	paused: false,
	freeDays: new Map(),
	reports: [],
	...overrides
});

describe('standardDaySuggestion', () => {
	it('suggests the standard day on an empty workday', () => {
		expect(standardDaySuggestion(input())).toEqual([
			{ assignmentId: 'a1', codeId: 'c1', start: at(MONDAY, '08:00'), end: at(MONDAY, '12:00') },
			{ assignmentId: 'a1', codeId: 'c2', start: at(MONDAY, '12:45'), end: at(MONDAY, '16:45') }
		]);
	});

	it('places the slots in Swedish summer time', () => {
		// Monday 15 June 2026: 08:00 summer time is 06:00 UTC.
		const [first] = standardDaySuggestion(input({ date: '2026-06-15' }));
		expect(new Date(first!.start).toISOString()).toBe('2026-06-15T06:00:00.000Z');
	});

	it.each([
		['a Saturday', '2026-11-21', '2026-11-25'],
		['a holiday', '2026-01-06', '2026-11-25'],
		['a free eve', '2026-12-24', '2026-12-31'],
		['a coming day', '2026-11-26', '2026-11-25']
	])('suggests nothing on %s', (_, date, today) => {
		expect(standardDaySuggestion(input({ date, today }))).toEqual([]);
	});

	it('suggests nothing on an extra day off, but on a worked eve', () => {
		const off = freeDaysByDate([{ date: MONDAY, free: true, name: 'Ledig' }]);
		expect(standardDaySuggestion(input({ freeDays: off }))).toEqual([]);
		const eve = '2026-12-24';
		const worked = freeDaysByDate([{ date: eve, free: false, name: 'Jobbar' }]);
		expect(standardDaySuggestion(input({ date: eve, today: eve, freeDays: worked }))).toHaveLength(
			2
		);
	});

	it('suggests nothing on a day with time, absence or a pause', () => {
		expect(standardDaySuggestion(input({ entries: [work(MONDAY, '09:00', '10:00')] }))).toEqual([]);
		expect(standardDaySuggestion(input({ entries: [absentAllDay(MONDAY, 'semester')] }))).toEqual(
			[]
		);
		expect(standardDaySuggestion(input({ paused: true }))).toEqual([]);
	});

	it('leaves out an assignment whose week is sent or unlocked', () => {
		for (const status of ['sent', 'unlocked'] as const) {
			const reports = [report('2026-W48', status, [0, 0, 0, 0, 0, 0, 0])];
			expect(standardDaySuggestion(input({ reports }))).toEqual([]);
		}
		const draft = [report('2026-W48', 'draft', [0, 0, 0, 0, 0, 0, 0])];
		expect(standardDaySuggestion(input({ reports: draft }))).toHaveLength(2);
	});

	it('leaves out archived, not started and ended assignments, and archived codes', () => {
		const archived = assignment({ id: 'a2', archived: true, standardDay: day });
		const later = assignment({ id: 'a3', startDate: '2026-12-01', standardDay: day });
		const ended = assignment({ id: 'a4', endDate: '2026-11-20', standardDay: day });
		const result = standardDaySuggestion(
			input({
				assignments: [a1, archived, later, ended],
				codes: { ...codes, a1: [code('c1'), code('c2', { archived: true })] }
			})
		);
		expect(result.map((s) => [s.assignmentId, s.codeId])).toEqual([['a1', 'c1']]);
	});

	it('takes the assignments in their order and the slots by start', () => {
		const a2 = assignment({
			id: 'a2',
			order: 0,
			standardDay: [{ start: '13:00', end: '15:00', codeId: 'k1' }]
		});
		const first = assignment({ order: 1, standardDay: [...day].reverse() });
		const result = standardDaySuggestion(
			input({
				assignments: [first, a2],
				codes: { ...codes, a2: [code('k1', { assignmentId: 'a2' })] }
			})
		);
		expect(result.map((s) => s.codeId)).toEqual(['k1', 'c1', 'c2']);
	});

	it('suggests nothing without a standard day', () => {
		expect(standardDaySuggestion(input({ assignments: [assignment()] }))).toEqual([]);
	});
});

describe('slotProblem', () => {
	const lunch = [{ start: '08:00', end: '12:00', codeId: 'c1' }];
	it('wants the end after the start', () => {
		expect(slotProblem({ start: '12:00', end: '12:00', codeId: 'c1' }, [])).toBe('order');
		expect(slotProblem({ start: '13:00', end: '12:00', codeId: 'c1' }, [])).toBe('order');
	});

	it('refuses an overlap but allows slots that meet', () => {
		expect(slotProblem({ start: '11:30', end: '13:00', codeId: 'c1' }, lunch)).toBe('overlap');
		expect(slotProblem({ start: '12:00', end: '13:00', codeId: 'c1' }, lunch)).toBeNull();
	});
});
