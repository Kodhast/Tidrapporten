import { describe, expect, it } from 'vitest';
import { gapsOnDay, isTimerForgotten, overlaps, splitByDay, suggestTimerEnd } from './intervall';
import { absentAllDay, assignment, at, work } from './testdata';
import type { Timer } from './types';

const HOUR = 3_600_000;

describe('splitByDay', () => {
	it('keeps an interval within a day whole', () => {
		expect(
			splitByDay({ start: at('2026-11-25', '08:00'), end: at('2026-11-25', '16:30') })
		).toEqual([
			{
				date: '2026-11-25',
				start: at('2026-11-25', '08:00'),
				end: at('2026-11-25', '16:30'),
				minutes: 510
			}
		]);
	});

	it('splits an interval over midnight per day', () => {
		const parts = splitByDay({ start: at('2026-11-25', '22:00'), end: at('2026-11-26', '01:30') });
		expect(parts.map((p) => [p.date, p.minutes])).toEqual([
			['2026-11-25', 120],
			['2026-11-26', 90]
		]);
	});

	it('counts the real length over the night summer time starts', () => {
		// 22:00 to 06:00 is 7 hours, since the clock skips 02:00–03:00.
		const parts = splitByDay({ start: at('2026-03-28', '22:00'), end: at('2026-03-29', '06:00') });
		expect(parts.map((p) => [p.date, p.minutes])).toEqual([
			['2026-03-28', 120],
			['2026-03-29', 300]
		]);
	});

	it('counts the real length over the night summer time ends', () => {
		// 22:00 to 06:00 is 9 hours, since 02:00–03:00 happens twice.
		const parts = splitByDay({ start: at('2026-10-24', '22:00'), end: at('2026-10-25', '06:00') });
		expect(parts.map((p) => [p.date, p.minutes])).toEqual([
			['2026-10-24', 120],
			['2026-10-25', 420]
		]);
	});

	it('gives nothing for an empty interval', () => {
		expect(
			splitByDay({ start: at('2026-11-25', '08:00'), end: at('2026-11-25', '08:00') })
		).toEqual([]);
	});
});

describe('gapsOnDay', () => {
	it('finds the gaps between the intervals, not before the first or after the last', () => {
		const entries = [
			work('2026-11-25', '13:00', '17:00'),
			work('2026-11-25', '08:00', '11:30'),
			work('2026-11-25', '12:00', '12:30'),
			absentAllDay('2026-11-25', 'semester')
		];
		expect(gapsOnDay(entries, '2026-11-25')).toEqual([
			{ start: at('2026-11-25', '11:30'), end: at('2026-11-25', '12:00') },
			{ start: at('2026-11-25', '12:30'), end: at('2026-11-25', '13:00') }
		]);
	});

	it('finds no gap when intervals touch or overlap', () => {
		const entries = [
			work('2026-11-25', '08:00', '12:00'),
			work('2026-11-25', '12:00', '14:00'),
			work('2026-11-25', '09:00', '10:00')
		];
		expect(gapsOnDay(entries, '2026-11-25')).toEqual([]);
	});

	it('uses only the part of an interval over midnight that falls on the day', () => {
		const entries = [
			work('2026-11-25', '22:00', '01:00', 'c1', '2026-11-26'),
			work('2026-11-26', '08:00', '12:00')
		];
		expect(gapsOnDay(entries, '2026-11-26')).toEqual([
			{ start: at('2026-11-26', '01:00'), end: at('2026-11-26', '08:00') }
		]);
		expect(gapsOnDay(entries, '2026-11-25')).toEqual([]);
	});

	it('finds no gap on a day without intervals', () => {
		expect(gapsOnDay([], '2026-11-25')).toEqual([]);
	});
});

describe('overlaps', () => {
	it('pairs the intervals that overlap', () => {
		const a = work('2026-11-25', '08:00', '12:00');
		const b = work('2026-11-25', '11:00', '13:00');
		const c = work('2026-11-25', '11:30', '11:45');
		const d = work('2026-11-25', '13:00', '14:00'); // touches b, does not overlap
		expect(overlaps([d, c, b, a])).toEqual([
			[a.id, b.id],
			[a.id, c.id],
			[b.id, c.id]
		]);
	});

	it('finds none when intervals only touch', () => {
		expect(
			overlaps([work('2026-11-25', '08:00', '12:00'), work('2026-11-25', '12:00', '13:00')])
		).toEqual([]);
	});
});

describe('forgotten timer', () => {
	const timer: Timer = {
		assignmentId: 'a1',
		subject: { kind: 'code', codeId: 'c1' },
		start: at('2026-11-25', '08:00')
	};

	it('is forgotten only after more than ten hours', () => {
		expect(isTimerForgotten(timer, timer.start + 10 * HOUR)).toBe(false);
		expect(isTimerForgotten(timer, timer.start + 10 * HOUR + 60_000)).toBe(true);
	});

	it('suggests the start plus a workday under the terms', () => {
		expect(suggestTimerEnd(timer, assignment(), at('2026-11-26', '07:00'))).toBe(
			at('2026-11-25', '16:00')
		);
		const half = assignment({
			terms: [{ from: '2026-01-01', scopePercent: 50, workdayMinutes: 480 }]
		});
		expect(suggestTimerEnd(timer, half, at('2026-11-26', '07:00'))).toBe(at('2026-11-25', '12:00'));
	});

	it('suggests 8 hours when no terms are in force', () => {
		const later = assignment({
			terms: [{ from: '2026-12-01', scopePercent: 50, workdayMinutes: 480 }]
		});
		expect(suggestTimerEnd(timer, later, at('2026-11-26', '07:00'))).toBe(
			at('2026-11-25', '16:00')
		);
	});

	it('never suggests past midnight or now', () => {
		const evening = { ...timer, start: at('2026-11-25', '20:00') };
		expect(suggestTimerEnd(evening, assignment(), at('2026-11-26', '07:00'))).toBe(
			at('2026-11-26', '00:00')
		);
		expect(suggestTimerEnd(timer, assignment(), at('2026-11-25', '10:00'))).toBe(
			at('2026-11-25', '10:00')
		);
	});
});
