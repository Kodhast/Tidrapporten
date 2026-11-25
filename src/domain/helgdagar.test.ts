import { describe, expect, it } from 'vitest';
import { dayOffOn, daysOffOf, easterSunday, freeDaysByDate, isDayOff } from './helgdagar';

// Facit: the published dates of Easter Sunday, Midsummer Eve and All Saints' Day.
const facit: [year: number, easter: string, midsummerEve: string, allSaints: string][] = [
	[2024, '2024-03-31', '2024-06-21', '2024-11-02'],
	[2025, '2025-04-20', '2025-06-20', '2025-11-01'],
	[2026, '2026-04-05', '2026-06-19', '2026-10-31'],
	[2027, '2027-03-28', '2027-06-25', '2027-11-06'],
	[2028, '2028-04-16', '2028-06-23', '2028-11-04'],
	[2029, '2029-04-01', '2029-06-22', '2029-11-03'],
	[2030, '2030-04-21', '2030-06-21', '2030-11-02'],
	[2031, '2031-04-13', '2031-06-20', '2031-11-01'],
	[2032, '2032-03-28', '2032-06-25', '2032-11-06'],
	[2033, '2033-04-17', '2033-06-24', '2033-11-05'],
	[2034, '2034-04-09', '2034-06-23', '2034-11-04'],
	[2035, '2035-03-25', '2035-06-22', '2035-11-03']
];

describe('Swedish holidays', () => {
	it.each(facit)('%i: Easter %s, Midsummer Eve %s, All Saints %s', (year, easter, eve, saints) => {
		expect(easterSunday(year)).toBe(easter);
		expect(dayOffOn(eve)).toEqual({ date: eve, name: 'Midsommarafton', kind: 'eve' });
		expect(dayOffOn(saints)?.name).toBe('Alla helgons dag');
	});

	it('lists every day off in 2026 in date order', () => {
		expect(daysOffOf(2026).map((d) => `${d.date} ${d.name}`)).toEqual([
			'2026-01-01 Nyårsdagen',
			'2026-01-06 Trettondedag jul',
			'2026-04-03 Långfredagen',
			'2026-04-05 Påskdagen',
			'2026-04-06 Annandag påsk',
			'2026-05-01 Första maj',
			'2026-05-14 Kristi himmelsfärds dag',
			'2026-05-24 Pingstdagen',
			'2026-06-06 Sveriges nationaldag',
			'2026-06-19 Midsommarafton',
			'2026-06-20 Midsommardagen',
			'2026-10-31 Alla helgons dag',
			'2026-12-24 Julafton',
			'2026-12-25 Juldagen',
			'2026-12-26 Annandag jul',
			'2026-12-31 Nyårsafton'
		]);
	});

	it('marks the three eves as eves and the rest as holidays', () => {
		expect(
			daysOffOf(2027)
				.filter((d) => d.kind === 'eve')
				.map((d) => d.name)
		).toEqual(['Midsommarafton', 'Julafton', 'Nyårsafton']);
	});

	it('has no day off on an ordinary weekday', () => {
		expect(dayOffOn('2026-11-25')).toBeUndefined();
	});
});

describe('isDayOff', () => {
	const none = freeDaysByDate([]);

	it.each([
		['2026-11-25', false, 'an ordinary Wednesday'],
		['2026-11-28', true, 'Saturday'],
		['2026-11-29', true, 'Sunday'],
		['2026-04-06', true, 'Easter Monday'],
		['2026-05-14', true, 'Ascension Day'],
		['2026-06-19', true, 'Midsummer Eve'],
		['2026-12-24', true, 'Christmas Eve'],
		['2026-12-31', true, "New Year's Eve"]
	])('%s is off: %s (%s)', (date, off) => {
		expect(isDayOff(date, none)).toBe(off);
	});

	it('takes an extra day off from the owner', () => {
		const freeDays = freeDaysByDate([{ date: '2026-05-15', free: true, name: 'Klämdag' }]);
		expect(isDayOff('2026-05-15', freeDays)).toBe(true);
	});

	it('lets the owner work an eve', () => {
		const freeDays = freeDaysByDate([{ date: '2026-12-31', free: false, name: 'Nyårsafton' }]);
		expect(isDayOff('2026-12-31', freeDays)).toBe(false);
	});

	it('keeps a holiday free; only eves can be worked', () => {
		const freeDays = freeDaysByDate([{ date: '2026-12-25', free: false, name: 'Juldagen' }]);
		expect(isDayOff('2026-12-25', freeDays)).toBe(true);
	});

	it('shares a frozen list that callers cannot change', () => {
		expect(Object.isFrozen(daysOffOf(2026))).toBe(true);
		expect(Object.isFrozen(daysOffOf(2026)[0])).toBe(true);
	});

	it('keeps a weekend free whatever the exceptions say', () => {
		const freeDays = freeDaysByDate([{ date: '2026-12-26', free: false, name: 'Annandag jul' }]);
		expect(isDayOff('2026-12-26', freeDays)).toBe(true);
	});
});
