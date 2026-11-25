// Calendar days, ISO weeks and clock times in Europe/Stockholm. Instants are stored in UTC
// (ADR 0005, 0012); every conversion to a local day goes through this file.
import type { ClockTime, IsoDate, IsoWeek, Minutes, UtcMillis } from './types.ts';

export const TIME_ZONE = 'Europe/Stockholm';

const MINUTE = 60_000;
const DAY = 86_400_000;

const partsFormat = new Intl.DateTimeFormat('en-US', {
	timeZone: TIME_ZONE,
	year: 'numeric',
	month: 'numeric',
	day: 'numeric',
	hour: 'numeric',
	minute: 'numeric',
	second: 'numeric',
	hourCycle: 'h23'
});

interface LocalParts {
	year: number;
	month: number; // 1–12
	day: number;
	hour: number;
	minute: number;
	second: number;
}

const localParts = (at: UtcMillis): LocalParts => {
	const parts: Record<string, number> = {};
	for (const part of partsFormat.formatToParts(at)) {
		if (part.type !== 'literal') parts[part.type] = Number(part.value);
	}
	return parts as unknown as LocalParts;
};

/** Minutes the local clock is ahead of UTC at the instant: 60 in winter, 120 in summer. */
export const utcOffsetMinutes = (at: UtcMillis): Minutes => {
	const p = localParts(at);
	const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
	return Math.round((asUtc - Math.floor(at / 1000) * 1000) / MINUTE);
};

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

const formatDate = (year: number, month: number, day: number): IsoDate =>
	`${pad(year, 4)}-${pad(month)}-${pad(day)}`;

const parseDate = (date: IsoDate) => {
	const [year, month, day] = date.split('-').map(Number) as [number, number, number];
	return { year, month, day };
};

/** The local calendar day the instant falls on. */
export const dateOf = (at: UtcMillis): IsoDate => {
	const p = localParts(at);
	return formatDate(p.year, p.month, p.day);
};

/** Days after `date`; negative goes back. */
export const addDays = (date: IsoDate, days: number): IsoDate => {
	const { year, month, day } = parseDate(date);
	const d = new Date(Date.UTC(year, month - 1, day) + days * DAY);
	return formatDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
};

/** Whole days from `from` to `to`. */
export const daysBetween = (from: IsoDate, to: IsoDate): number => {
	const a = parseDate(from);
	const b = parseDate(to);
	return Math.round(
		(Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / DAY
	);
};

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export const weekday = (date: IsoDate): number => {
	const { year, month, day } = parseDate(date);
	return ((new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7) + 1;
};

export const isWeekend = (date: IsoDate): boolean => weekday(date) >= 6;

/**
 * The instant a local clock time occurs on a local day. In the spring gap (02:00–03:00 does not
 * exist) the time is read with the winter offset, so 02:30 becomes 03:30 summer time. In the
 * autumn overlap the first of the two instants is returned.
 */
export const atLocalTime = (date: IsoDate, time: ClockTime | Minutes): UtcMillis => {
	const { year, month, day } = parseDate(date);
	const minutes = typeof time === 'number' ? time : clockToMinutes(time);
	const wall = Date.UTC(year, month - 1, day) + minutes * MINUTE;
	// Swedish time is UTC+2 in summer and UTC+1 in winter; the summer reading comes first in time.
	const match = [120, 60]
		.map((offset) => wall - offset * MINUTE)
		.find((at) => utcOffsetMinutes(at) * MINUTE === wall - at);
	return match ?? wall - 60 * MINUTE;
};

/** Local midnight at the start of the day. Midnight is never in a Swedish DST gap. */
export const startOfDay = (date: IsoDate): UtcMillis => atLocalTime(date, 0);

/** 1440 minutes, or 1380 and 1500 on the days summer time starts and ends. */
export const dayLengthMinutes = (date: IsoDate): Minutes =>
	(startOfDay(addDays(date, 1)) - startOfDay(date)) / MINUTE;

export const clockToMinutes = (time: ClockTime): Minutes => {
	const [hours, minutes] = time.split(':').map(Number) as [number, number];
	return hours * 60 + minutes;
};

export const minutesToClock = (minutes: Minutes): ClockTime =>
	`${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/** The ISO week a local day belongs to: weeks start on Monday, week 1 holds the first Thursday. */
export const isoWeekOf = (date: IsoDate): IsoWeek => {
	const thursday = addDays(date, 4 - weekday(date));
	const year = parseDate(thursday).year;
	const week = Math.floor(daysBetween(formatDate(year, 1, 1), thursday) / 7) + 1;
	return `${year}-W${pad(week)}`;
};

/** Monday of an ISO week. */
export const mondayOf = (week: IsoWeek): IsoDate => {
	const [year, w] = week.split('-W').map(Number) as [number, number];
	const jan4 = formatDate(year, 1, 4);
	return addDays(jan4, 1 - weekday(jan4) + (w - 1) * 7);
};

/** The seven local days of an ISO week, Monday to Sunday. */
export const daysOfWeek = (week: IsoWeek): IsoDate[] => {
	const monday = mondayOf(week);
	return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
};

/** ISO weeks from the one holding `from` to the one holding `to`, inclusive. */
export const weeksBetween = (from: IsoDate, to: IsoDate): IsoWeek[] => {
	const weeks: IsoWeek[] = [];
	for (let monday = mondayOf(isoWeekOf(from)); monday <= to; monday = addDays(monday, 7)) {
		weeks.push(isoWeekOf(monday));
	}
	return weeks;
};
