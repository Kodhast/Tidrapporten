// Swedish public holidays and the eves that are days off by default, computed from rules so that
// no table needs updating (ADR 0012). FreeDay documents only hold the owner's exceptions.
import { addDays, isWeekend, weekday } from './tid.ts';
import type { FreeDay, IsoDate } from './types.ts';

export interface DayOff {
	date: IsoDate;
	name: string;
	kind: 'holiday' | 'eve';
}

const pad = (n: number) => String(n).padStart(2, '0');
const on = (year: number, month: number, day: number): IsoDate =>
	`${year}-${pad(month)}-${pad(day)}`;

/** Easter Sunday in the Gregorian calendar (Meeus/Jones/Butcher). */
export const easterSunday = (year: number): IsoDate => {
	const a = year % 19;
	const b = Math.floor(year / 100);
	const c = year % 100;
	const d = Math.floor(b / 4);
	const e = b % 4;
	const f = Math.floor((b + 8) / 25);
	const g = Math.floor((b - f + 1) / 3);
	const h = (19 * a + b - d - g + 15) % 30;
	const i = Math.floor(c / 4);
	const k = c % 4;
	const l = (32 + 2 * e + 2 * i - h - k) % 7;
	const m = Math.floor((a + 11 * h + 22 * l) / 451);
	const month = Math.floor((h + l - 7 * m + 114) / 31);
	const day = ((h + l - 7 * m + 114) % 31) + 1;
	return on(year, month, day);
};

/** The first day from `date` that falls on the ISO weekday (1 = Monday … 7 = Sunday). */
const firstWeekdayFrom = (date: IsoDate, isoWeekday: number): IsoDate =>
	addDays(date, (isoWeekday - weekday(date) + 7) % 7);

const cache = new Map<number, readonly DayOff[]>();

/** Public holidays and the default free eves of a year, in date order. Frozen: it is shared. */
export const daysOffOf = (year: number): readonly DayOff[] => {
	const cached = cache.get(year);
	if (cached) return cached;
	const easter = easterSunday(year);
	const midsummerEve = firstWeekdayFrom(on(year, 6, 19), 5);
	const holiday = (date: IsoDate, name: string): DayOff => ({ date, name, kind: 'holiday' });
	const eve = (date: IsoDate, name: string): DayOff => ({ date, name, kind: 'eve' });
	const days = [
		holiday(on(year, 1, 1), 'Nyårsdagen'),
		holiday(on(year, 1, 6), 'Trettondedag jul'),
		holiday(addDays(easter, -2), 'Långfredagen'),
		holiday(easter, 'Påskdagen'),
		holiday(addDays(easter, 1), 'Annandag påsk'),
		holiday(on(year, 5, 1), 'Första maj'),
		holiday(addDays(easter, 39), 'Kristi himmelsfärds dag'),
		holiday(addDays(easter, 49), 'Pingstdagen'),
		holiday(on(year, 6, 6), 'Sveriges nationaldag'),
		eve(midsummerEve, 'Midsommarafton'),
		holiday(addDays(midsummerEve, 1), 'Midsommardagen'),
		holiday(firstWeekdayFrom(on(year, 10, 31), 6), 'Alla helgons dag'),
		eve(on(year, 12, 24), 'Julafton'),
		holiday(on(year, 12, 25), 'Juldagen'),
		holiday(on(year, 12, 26), 'Annandag jul'),
		eve(on(year, 12, 31), 'Nyårsafton')
	]
		.sort((x, y) => x.date.localeCompare(y.date))
		.map((d) => Object.freeze(d));
	Object.freeze(days);
	cache.set(year, days);
	return days;
};

/** The holiday or default free eve on the date, if any. */
export const dayOffOn = (date: IsoDate): DayOff | undefined =>
	daysOffOf(Number(date.slice(0, 4))).find((d) => d.date === date);

/** The owner's exceptions by date. */
export type FreeDays = ReadonlyMap<IsoDate, FreeDay>;

export const freeDaysByDate = (freeDays: readonly FreeDay[]): FreeDays =>
	new Map(freeDays.map((d) => [d.date, d]));

/**
 * Whether the date is a day without norm: Saturday, Sunday, a holiday, a free eve or an extra day
 * off. An exception with `free: false` makes an eve a workday (ADR 0012); weekends and holidays
 * stay free.
 */
export const isDayOff = (date: IsoDate, freeDays: FreeDays): boolean => {
	if (isWeekend(date)) return true;
	const dayOff = dayOffOn(date);
	const exception = freeDays.get(date);
	if (dayOff?.kind === 'eve' && exception?.free === false) return false;
	return dayOff !== undefined || exception?.free === true;
};
