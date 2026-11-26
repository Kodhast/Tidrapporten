import { describe, expect, it } from 'vitest';
import { absenceCountings } from './flex.ts';
import { freeDaysByDate } from './helgdagar.ts';
import {
	dueChecks,
	flexSentKey,
	keepHandled,
	reminderNotice,
	type Check,
	type ReminderData
} from './paminnelser.ts';
import { absenceTypes, absentAllDay, assignment, at, receiver, report, work } from './testdata.ts';
import type { Settings } from './types.ts';

const settings: Settings = {
	noTimerBy: '09:30',
	timerRunningAt: '19:00',
	remindEmptyDay: true,
	reportReminderFridayAt: '15:00',
	flexWarning: 1200
};

const keys = (checks: Check[]) => checks.map((c) => c.key);

// 2026-11-26 is a Thursday, 2026-11-27 a Friday.
describe('dueChecks', () => {
	it('looks at no timer, the empty day and the flex from 09:30, for two hours', () => {
		expect(dueChecks(at('2026-11-26', '09:29'), settings, new Set())).toEqual([]);
		expect(keys(dueChecks(at('2026-11-26', '09:30'), settings, new Set()))).toEqual([
			'noTimer_2026-11-26',
			'emptyDay_2026-11-26',
			'flex_2026-11-26'
		]);
		expect(dueChecks(at('2026-11-26', '11:30'), settings, new Set())).toEqual([]);
	});

	it('leaves out what is handled, and the flex in a week it was sent', () => {
		const handled = new Set(['noTimer_2026-11-26', flexSentKey('2026-W48')]);
		expect(keys(dueChecks(at('2026-11-26', '09:45'), settings, handled))).toEqual([
			'emptyDay_2026-11-26'
		]);
	});

	it('looks at the running timer at 19:00 and the report on Friday at 15:00 only', () => {
		expect(keys(dueChecks(at('2026-11-26', '19:10'), settings, new Set()))).toEqual([
			'timerRunning_2026-11-26'
		]);
		expect(dueChecks(at('2026-11-26', '15:10'), settings, new Set())).toEqual([]);
		expect(keys(dueChecks(at('2026-11-27', '15:10'), settings, new Set()))).toEqual([
			'report_2026-W48'
		]);
	});

	it('takes nothing that is turned off, and the empty day at 09:30 without "no timer"', () => {
		const off: Settings = {
			noTimerBy: null,
			timerRunningAt: null,
			remindEmptyDay: false,
			reportReminderFridayAt: null,
			flexWarning: 0
		};
		expect(dueChecks(at('2026-11-27', '09:30'), off, new Set())).toEqual([]);
		expect(dueChecks(at('2026-11-27', '15:00'), off, new Set())).toEqual([]);
		expect(dueChecks(at('2026-11-27', '19:00'), off, new Set())).toEqual([]);
		expect(
			keys(dueChecks(at('2026-11-26', '09:40'), { ...off, remindEmptyDay: true }, new Set()))
		).toEqual(['emptyDay_2026-11-26']);
	});

	it('follows the local clock over summer time, in both directions', () => {
		// Summer time starts 2026-03-29 and ends 2026-10-25; the function runs in UTC.
		for (const day of ['2026-03-27', '2026-03-30', '2026-10-23', '2026-10-26']) {
			expect(keys(dueChecks(at(day, '09:30'), settings, new Set()))).toContain(`noTimer_${day}`);
			expect(dueChecks(at(day, '09:29'), settings, new Set())).toEqual([]);
		}
	});
});

const data = (overrides: Partial<ReminderData> = {}): ReminderData => ({
	assignments: [assignment()],
	receivers: { a1: [receiver()] },
	entries: [],
	reports: [],
	freeDays: freeDaysByDate([]),
	countings: absenceCountings(absenceTypes),
	timer: null,
	now: at('2026-11-26', '09:30'),
	pauses: new Set(),
	...overrides
});

const check = (kind: Check['kind']): Check => ({ kind, key: kind });

describe('reminderNotice', () => {
	it('no timer: on a workday without time, with the button to start it', () => {
		expect(reminderNotice(check('noTimer'), data(), settings)).toEqual({
			kind: 'noTimer',
			title: 'Ingen timer igång',
			body: 'Klockan är 09:30 och dagen har ingen tid än.',
			url: '/?gor=starta',
			action: 'Starta timern'
		});
	});

	it('no timer: not with a timer, time, absence or a pause, nor on a day off', () => {
		const timer = {
			assignmentId: 'a1',
			subject: { kind: 'code' as const, codeId: 'c1' },
			start: at('2026-11-26', '08:00')
		};
		const none = [
			data({ timer }),
			data({ entries: [work('2026-11-26', '07:00', '08:00')] }),
			data({ entries: [absentAllDay('2026-11-26', 'semester')] }),
			data({ pauses: new Set(['2026-11-26']) }),
			data({ now: at('2026-11-28', '09:30') }), // Saturday
			data({ now: at('2026-12-25', '09:30') }), // juldagen
			data({ assignments: [assignment({ archived: true })] }),
			data({ assignments: [assignment({ startDate: '2026-12-01' })] })
		];
		for (const d of none) expect(reminderNotice(check('noTimer'), d, settings)).toBeNull();
	});

	it('timer running: the start, with the day when it began another day', () => {
		const timer = (date: string, time: string) => ({
			assignmentId: 'a1',
			subject: { kind: 'code' as const, codeId: 'c1' },
			start: at(date, time)
		});
		const now = at('2026-11-26', '19:00');
		expect(
			reminderNotice(
				check('timerRunning'),
				data({ now, timer: timer('2026-11-26', '08:12') }),
				settings
			)
		).toMatchObject({
			title: 'Timern går fortfarande',
			body: 'Startad 08:12.',
			url: '/?gor=stoppa',
			action: 'Stoppa'
		});
		expect(
			reminderNotice(
				check('timerRunning'),
				data({ now, timer: timer('2026-11-25', '22:10') }),
				settings
			)?.body
		).toBe('Startad onsdag 25 november 22:10.');
		expect(reminderNotice(check('timerRunning'), data({ now }), settings)).toBeNull();
	});

	it('empty day: the latest workday, also Friday on a Monday', () => {
		expect(reminderNotice(check('emptyDay'), data(), settings)).toMatchObject({
			title: 'Onsdagen saknar tid',
			body: 'Fyll i eller markera frånvaro.',
			url: '/#/dag/2026-11-25',
			action: 'Öppna dagen'
		});
		expect(
			reminderNotice(check('emptyDay'), data({ now: at('2026-11-30', '09:30') }), settings)?.url
		).toBe('/#/dag/2026-11-27');
		const filled = [
			data({ entries: [work('2026-11-25', '08:00', '12:00')] }),
			data({ entries: [absentAllDay('2026-11-25', 'semester')] }),
			data({ pauses: new Set(['2026-11-25']) }),
			data({ assignments: [assignment({ startDate: '2026-11-26' })] })
		];
		for (const d of filled) expect(reminderNotice(check('emptyDay'), d, settings)).toBeNull();
	});

	it('report: the receivers without a sent report this week', () => {
		const now = at('2026-11-27', '15:00');
		const two = { a1: [receiver(), receiver({ id: 'r2', position: 2 })] };
		const days = [480, 480, 480, 480, 480, 0, 0];
		expect(reminderNotice(check('report'), data({ now, receivers: two }), settings)).toEqual({
			kind: 'report',
			title: 'Veckorapporten är inte skickad',
			body: '2 mottagare väntar.',
			url: '/#/vecka/2026-W48',
			action: 'Öppna veckan'
		});
		const oneSent = data({
			now,
			receivers: two,
			reports: [report('2026-W48', 'sent', days), report('2026-W48', 'unlocked', days, 'r2')]
		});
		expect(reminderNotice(check('report'), oneSent, settings)?.body).toBe('1 mottagare väntar.');
		const allSent = data({
			now,
			reports: [report('2026-W48', 'sent', days)]
		});
		expect(reminderNotice(check('report'), allSent, settings)).toBeNull();
		const archived = data({ now, receivers: { a1: [receiver({ archived: true })] } });
		expect(reminderNotice(check('report'), archived, settings)).toBeNull();
	});

	it('flex: over the limit on either side, not at it', () => {
		const opening = (openingFlex: number) =>
			data({
				assignments: [assignment({ startDate: '2026-11-26', openingFlex })],
				now: at('2026-11-26', '00:00')
			});
		expect(reminderNotice(check('flex'), opening(1260), settings)).toEqual({
			kind: 'flex',
			title: 'Flexsaldot är +21,0 h',
			body: 'Gränsen är ±20 h.',
			url: '/',
			action: 'Öppna'
		});
		expect(reminderNotice(check('flex'), opening(-1260), settings)?.title).toBe(
			'Flexsaldot är −21,0 h'
		);
		expect(reminderNotice(check('flex'), opening(1200), settings)).toBeNull();
	});
});

describe('keepHandled', () => {
	it('drops what was handled two weeks ago or more', () => {
		const now = at('2026-11-26', '09:30');
		const day = 24 * 60 * 60_000;
		expect(keepHandled({ a: now - day, b: now - 14 * day, c: now - 13 * day }, now)).toEqual({
			a: now - day,
			c: now - 13 * day
		});
	});
});
