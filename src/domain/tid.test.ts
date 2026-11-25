import { describe, expect, it } from 'vitest';
import {
	addDays,
	atLocalTime,
	clockToMinutes,
	dateOf,
	dayLengthMinutes,
	daysBetween,
	daysOfWeek,
	isoWeekOf,
	minutesToClock,
	mondayOf,
	startOfDay,
	utcOffsetMinutes,
	weekday,
	weeksBetween
} from './tid.ts';

describe('local days in Europe/Stockholm', () => {
	it.each([
		// instant (UTC)              local day
		['2026-01-14T22:59:59Z', '2026-01-14'],
		['2026-01-14T23:00:00Z', '2026-01-15'], // winter: midnight is 23:00 UTC
		['2026-07-14T21:59:59Z', '2026-07-14'],
		['2026-07-14T22:00:00Z', '2026-07-15'] // summer: midnight is 22:00 UTC
	])('%s falls on %s', (instant, date) => {
		expect(dateOf(Date.parse(instant))).toBe(date);
	});

	it.each([
		['2026-01-15', '2026-01-14T23:00:00.000Z'],
		['2026-07-15', '2026-07-14T22:00:00.000Z'],
		['2026-03-29', '2026-03-28T23:00:00.000Z'], // the day summer time starts
		['2026-10-25', '2026-10-24T22:00:00.000Z'] // the day summer time ends
	])('%s starts at %s', (date, instant) => {
		expect(new Date(startOfDay(date)).toISOString()).toBe(instant);
	});

	it.each([
		['2026-03-28', 1440],
		['2026-03-29', 1380], // 23 hours
		['2026-03-30', 1440],
		['2026-10-24', 1440],
		['2026-10-25', 1500], // 25 hours
		['2025-03-30', 1380],
		['2025-10-26', 1500]
	])('%s is %i minutes long', (date, minutes) => {
		expect(dayLengthMinutes(date)).toBe(minutes);
	});

	it.each([
		['2026-01-15T12:00:00Z', 60],
		['2026-07-15T12:00:00Z', 120],
		['2026-03-29T00:59:00Z', 60],
		['2026-03-29T01:00:00Z', 120],
		['2026-10-25T00:59:00Z', 120],
		['2026-10-25T01:00:00Z', 60]
	])('the offset at %s is %i minutes', (instant, offset) => {
		expect(utcOffsetMinutes(Date.parse(instant))).toBe(offset);
	});
});

describe('atLocalTime', () => {
	it.each([
		['2026-01-15', '08:00', '2026-01-15T07:00:00.000Z'],
		['2026-07-15', '08:00', '2026-07-15T06:00:00.000Z'],
		['2026-03-29', '01:30', '2026-03-29T00:30:00.000Z'],
		['2026-03-29', '03:30', '2026-03-29T01:30:00.000Z'],
		// 02:30 does not exist when summer time starts; it is read as 03:30.
		['2026-03-29', '02:30', '2026-03-29T01:30:00.000Z'],
		// 02:30 happens twice when summer time ends; the first (summer time) is used.
		['2026-10-25', '02:30', '2026-10-25T00:30:00.000Z'],
		['2026-10-25', '03:30', '2026-10-25T02:30:00.000Z']
	])('%s %s is %s', (date, time, instant) => {
		expect(new Date(atLocalTime(date, time)).toISOString()).toBe(instant);
	});

	it('takes minutes after midnight as well as a clock time', () => {
		expect(atLocalTime('2026-01-15', 480)).toBe(atLocalTime('2026-01-15', '08:00'));
	});
});

describe('calendar arithmetic', () => {
	it.each([
		['2026-02-28', 1, '2026-03-01'],
		['2028-02-28', 1, '2028-02-29'],
		['2026-12-31', 1, '2027-01-01'],
		['2026-03-01', -1, '2026-02-28'],
		['2026-03-28', 2, '2026-03-30'] // across the change to summer time
	])('%s plus %i days is %s', (date, days, expected) => {
		expect(addDays(date, days)).toBe(expected);
		expect(daysBetween(date, expected)).toBe(days);
	});

	it.each([
		['2026-11-23', 1],
		['2026-11-25', 3],
		['2026-11-29', 7]
	])('%s is ISO weekday %i', (date, day) => {
		expect(weekday(date)).toBe(day);
	});

	it.each([
		['08:00', 480],
		['00:00', 0],
		['23:59', 1439]
	])('%s is %i minutes after midnight', (clock, minutes) => {
		expect(clockToMinutes(clock)).toBe(minutes);
		expect(minutesToClock(minutes)).toBe(clock);
	});
});

describe('ISO weeks', () => {
	it.each([
		['2026-11-25', '2026-W48'],
		['2026-01-01', '2026-W01'], // a Thursday
		['2026-12-31', '2026-W53'],
		['2027-01-01', '2026-W53'], // Friday belongs to the year before
		['2027-01-04', '2027-W01'],
		['2024-12-30', '2025-W01'], // Monday belongs to the year after
		['2025-12-28', '2025-W52'],
		['2026-03-29', '2026-W13'], // Sunday the clocks change
		['2026-03-30', '2026-W14']
	])('%s is in %s', (date, week) => {
		expect(isoWeekOf(date)).toBe(week);
	});

	it.each([
		['2026-W48', '2026-11-23'],
		['2026-W01', '2025-12-29'],
		['2026-W53', '2026-12-28'],
		['2025-W01', '2024-12-30']
	])('%s starts on Monday %s', (week, monday) => {
		expect(mondayOf(week)).toBe(monday);
	});

	it('lists the days of a week Monday to Sunday', () => {
		expect(daysOfWeek('2026-W13')).toEqual([
			'2026-03-23',
			'2026-03-24',
			'2026-03-25',
			'2026-03-26',
			'2026-03-27',
			'2026-03-28',
			'2026-03-29'
		]);
	});

	it('lists the weeks between two days, both ends included', () => {
		expect(weeksBetween('2026-12-30', '2027-01-12')).toEqual(['2026-W53', '2027-W01', '2027-W02']);
		expect(weeksBetween('2026-11-25', '2026-11-25')).toEqual(['2026-W48']);
	});
});
