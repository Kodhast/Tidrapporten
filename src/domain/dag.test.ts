import { describe, expect, it } from 'vitest';
import {
	dayName,
	dayRows,
	daySum,
	firstOverlap,
	minutesLabel,
	overlapping,
	parseClock,
	parseSpan,
	spanLabel
} from './dag.ts';
import { absentAllDay, absentBetween, at, work } from './testdata.ts';
import type { Entry } from './types.ts';

const DAY = '2026-11-24';

const kinds = (entries: Entry[]) =>
	dayRows(entries, DAY).map((row) =>
		row.kind === 'allDay'
			? 'heldag'
			: row.kind === 'gap'
				? `lucka ${spanLabel(row)} ${row.minutes}`
				: `${spanLabel(row)}${row.overlap ? ' överlapp' : ''}`
	);

describe('dayRows', () => {
	it('lists the intervals by start with the gaps between them, whole-day absence first', () => {
		const entries = [
			work(DAY, '12:30', '16:40'),
			work(DAY, '08:05', '09:00', 'c2'),
			work(DAY, '09:00', '11:45'),
			absentAllDay(DAY, 'semester')
		];
		expect(kinds(entries)).toEqual([
			'heldag',
			'08:05–09:00',
			'09:00–11:45',
			'lucka 11:45–12:30 45',
			'12:30–16:40'
		]);
	});

	it('marks the intervals that overlap and gives no gap inside an overlap', () => {
		const entries = [
			work(DAY, '09:00', '10:00'),
			work(DAY, '09:30', '10:15'),
			work(DAY, '10:15', '11:00')
		];
		expect(kinds(entries)).toEqual(['09:00–10:00 överlapp', '09:30–10:15 överlapp', '10:15–11:00']);
	});

	it('shows an interval over midnight on both days with its real times', () => {
		const late = work('2026-11-23', '22:00', '01:30', 'c1', DAY);
		const morning = work(DAY, '08:00', '09:00');
		// The gap starts where the night's interval ends on this day.
		expect(kinds([late, morning])).toEqual(['22:00–01:30', 'lucka 01:30–08:00 390', '08:00–09:00']);
		expect(dayRows([late], '2026-11-23')).toHaveLength(1);
	});

	it('leaves out other days, and whole-day absence on another day', () => {
		expect(kinds([work('2026-11-25', '08:00', '09:00'), absentAllDay('2026-11-25', 'x')])).toEqual(
			[]
		);
	});
});

describe('firstOverlap', () => {
	it('names the first overlapping pair in order of start', () => {
		const pair = firstOverlap([work(DAY, '09:30', '10:15'), work(DAY, '09:00', '10:00')], DAY);
		expect(pair?.map(spanLabel)).toEqual(['09:00–10:00', '09:30–10:15']);
	});

	it('is null without overlap; touching end to start is not one', () => {
		expect(
			firstOverlap([work(DAY, '08:00', '09:00'), work(DAY, '09:00', '10:00')], DAY)
		).toBeNull();
	});
});

describe('daySum', () => {
	it('sums per assignment and counts an overlap twice', () => {
		const other = { ...work(DAY, '09:30', '10:15'), assignmentId: 'a2' };
		const sum = daySum(
			[
				work(DAY, '08:05', '09:00'),
				work(DAY, '09:00', '10:00'),
				other,
				work(DAY, '10:15', '11:45'),
				work(DAY, '12:30', '16:40')
			],
			DAY
		);
		// 55 + 60 + 90 + 250 = 455 min for a1, 45 for a2: the mockup's 8 h 20 min.
		expect(sum).toEqual({
			total: 500,
			perAssignment: [
				['a1', 455],
				['a2', 45]
			]
		});
	});

	it('counts only the part on the day and leaves out whole-day absence', () => {
		const late = work('2026-11-23', '22:00', '01:30', 'c1', DAY);
		expect(daySum([late, absentAllDay(DAY, 'semester')], DAY).total).toBe(90);
		expect(daySum([late], '2026-11-23').total).toBe(120);
	});

	it('counts absence with clock times as interval time', () => {
		expect(daySum([absentBetween(DAY, '13:00', '15:00', 'semester')], DAY).total).toBe(120);
	});
});

describe('labels', () => {
	it('says a length in hours and minutes', () => {
		expect(minutesLabel(55)).toBe('55 min');
		expect(minutesLabel(90)).toBe('1 h 30 min');
		expect(minutesLabel(480)).toBe('8 h');
		expect(minutesLabel(0)).toBe('0 min');
	});

	it('names the day without the year', () => {
		expect(dayName(DAY)).toBe('Tisdag 24 november');
	});
});

describe('parseClock', () => {
	it('reads 16:05, 16.05, 1605 and 9:30', () => {
		expect(['16:05', '16.05', '1605', ' 16:05 '].map(parseClock)).toEqual([
			'16:05',
			'16:05',
			'16:05',
			'16:05'
		]);
		expect(parseClock('9:30')).toBe('09:30');
	});

	it('refuses what is not a time', () => {
		for (const text of ['', '24:00', '16:60', 'fyra', '16']) expect(parseClock(text)).toBeNull();
	});
});

describe('parseSpan', () => {
	it('reads the start and end on the day', () => {
		expect(parseSpan(DAY, '08:05', '9.00')).toEqual({
			span: { start: at(DAY, '08:05'), end: at(DAY, '09:00') }
		});
	});

	it('reads an end not after the start as the next day', () => {
		expect(parseSpan(DAY, '22:00', '01:30')).toEqual({
			span: { start: at(DAY, '22:00'), end: at('2026-11-25', '01:30') }
		});
		expect(parseSpan(DAY, '22:00', '00:00')).toEqual({
			span: { start: at(DAY, '22:00'), end: at('2026-11-25', '00:00') }
		});
	});

	it('says which field is wrong', () => {
		expect(parseSpan(DAY, 'x', '09:00')).toEqual({
			error: { field: 'start', message: 'Skriv en tid som 16:05' }
		});
		expect(parseSpan(DAY, '08:00', '')).toEqual({
			error: { field: 'end', message: 'Skriv en tid som 16:05' }
		});
	});

	it('counts the real hours on the day summer time ends', () => {
		// 25 October 2026 has 25 hours: 01:00–10:00 is ten hours.
		const result = parseSpan('2026-10-25', '01:00', '10:00') as {
			span: { start: number; end: number };
		};
		expect((result.span.end - result.span.start) / 60_000).toBe(600);
	});
});

describe('overlapping', () => {
	const entries = [work(DAY, '09:00', '10:00'), absentAllDay(DAY, 'semester')];

	it('finds another interval the span overlaps', () => {
		const span = { start: at(DAY, '09:30'), end: at(DAY, '10:15') };
		expect(overlapping(entries, span, null)).toEqual({
			start: at(DAY, '09:00'),
			end: at(DAY, '10:00')
		});
	});

	it('ignores the interval itself and one that only touches', () => {
		const span = { start: at(DAY, '10:00'), end: at(DAY, '11:00') };
		expect(overlapping(entries, span, null)).toBeNull();
		const same = { start: at(DAY, '09:00'), end: at(DAY, '10:00') };
		expect(overlapping(entries, same, entries[0]!.id)).toBeNull();
	});
});
