import { describe, expect, it } from 'vitest';
import { isTimerForgotten } from './intervall.ts';
import { assignment, at, code, report, work } from './testdata.ts';
import {
	choiceNames,
	durationLabel,
	elapsedLabel,
	entryBefore,
	isPaused,
	parseEnd,
	parsePause,
	pauseMinutes,
	parseStart,
	startChoice,
	stopBlockedOffline,
	suggestStart,
	runningEntry,
	timerCodeGroups,
	timerEntry
} from './timer.ts';
import type { Timer } from './types.ts';

const MINUTE = 60_000;

const a1 = assignment({ id: 'a1', name: 'Uppdrag A', order: 0 });
const a2 = assignment({ id: 'a2', name: 'Uppdrag B', order: 1 });
const codes = {
	a1: [
		code('c2', { name: 'Möten', order: 1 }),
		code('c1', { name: 'Utveckling', order: 0 }),
		code('c3', { name: 'Gammal', order: 2, archived: true })
	],
	a2: [code('c9', { assignmentId: 'a2', name: 'Förvaltning' })]
};

const timer = (start: number, codeId = 'c1'): Timer => ({
	assignmentId: 'a1',
	subject: { kind: 'code', codeId },
	start
});

describe('timerCodeGroups', () => {
	it('lists the codes per assignment in their order, without archived codes', () => {
		const groups = timerCodeGroups([a2, a1], codes, '2026-11-25');
		expect(groups.map((g) => [g.assignment.id, g.codes.map((c) => c.id)])).toEqual([
			['a1', ['c1', 'c2']],
			['a2', ['c9']]
		]);
	});

	it('leaves out archived and ended assignments and those without codes', () => {
		const groups = timerCodeGroups(
			[
				a1,
				{ ...a2, archived: true },
				assignment({ id: 'a3', endDate: '2026-11-24' }),
				assignment({ id: 'a4', endDate: '2026-11-25' }),
				assignment({ id: 'a5' })
			],
			{ ...codes, a3: [code('x')], a4: [code('y')] },
			'2026-11-25'
		);
		// a4 ends today and can still be worked on.
		expect(groups.map((g) => g.assignment.id)).toEqual(['a1', 'a4']);
	});
});

describe('startChoice', () => {
	const groups = timerCodeGroups([a1, a2], codes, '2026-11-25');

	it('takes the code of the latest interval', () => {
		const older = work('2026-11-24', '08:00', '12:00', 'c1');
		const newer = work('2026-11-24', '13:00', '16:00', 'c2');
		expect(startChoice(groups, [older, newer])).toEqual({ assignmentId: 'a1', codeId: 'c2' });
	});

	it('skips an interval whose code is archived', () => {
		const archived = work('2026-11-24', '13:00', '16:00', 'c3');
		const earlier = work('2026-11-24', '08:00', '12:00', 'c2');
		expect(startChoice(groups, [archived, earlier])).toEqual({ assignmentId: 'a1', codeId: 'c2' });
	});

	it('takes the first code of the first assignment without intervals', () => {
		expect(startChoice(groups, [])).toEqual({ assignmentId: 'a1', codeId: 'c1' });
	});

	it('is null without assignments', () => {
		expect(startChoice([], [])).toBeNull();
	});

	it('names the choice', () => {
		expect(choiceNames(groups, { assignmentId: 'a2', codeId: 'c9' })).toEqual({
			code: 'Förvaltning',
			assignment: 'Uppdrag B'
		});
		expect(choiceNames(groups, { assignmentId: 'a2', codeId: 'c1' })).toBeNull();
	});
});

describe('timerEntry', () => {
	const start = at('2026-11-25', '08:00');

	it('is named by the start and ends at the stop', () => {
		expect(timerEntry(timer(start), start + 90 * MINUTE)).toEqual({
			id: `timer-${start}`,
			assignmentId: 'a1',
			subject: { kind: 'code', codeId: 'c1' },
			time: { kind: 'interval', start, end: start + 90 * MINUTE },
			note: ''
		});
	});

	it('is at least a minute and at most 24 hours', () => {
		expect(timerEntry(timer(start), start - MINUTE).time).toMatchObject({ end: start + MINUTE });
		expect(timerEntry(timer(start), start + 30 * 60 * MINUTE).time).toMatchObject({
			end: start + 24 * 60 * MINUTE
		});
	});
});

describe('the ten-hour limit', () => {
	const start = at('2026-11-25', '08:00');

	it('asks after more than ten hours, not before', () => {
		expect(isTimerForgotten(timer(start), at('2026-11-25', '17:59'))).toBe(false);
		expect(isTimerForgotten(timer(start), at('2026-11-25', '18:00'))).toBe(false);
		expect(isTimerForgotten(timer(start), at('2026-11-25', '18:01'))).toBe(true);
	});
});

describe('stopBlockedOffline', () => {
	// Week 48 of 2026 is 23–29 November.
	const start = at('2026-11-25', '08:00');
	const end = at('2026-11-25', '16:00');

	it('blocks a stop into a sent week offline', () => {
		const reports = [report('2026-W48', 'sent', [480, 480, 480, 480, 480, 0, 0])];
		expect(stopBlockedOffline(timer(start), end, reports, false)).toBe(true);
	});

	it('blocks a stop into an unlocked week offline', () => {
		const reports = [report('2026-W48', 'unlocked', [0, 0, 0, 0, 0, 0, 0])];
		expect(stopBlockedOffline(timer(start), end, reports, false)).toBe(true);
	});

	it('allows the same stop online, where it is logged', () => {
		const reports = [report('2026-W48', 'sent', [0, 0, 0, 0, 0, 0, 0])];
		expect(stopBlockedOffline(timer(start), end, reports, true)).toBe(false);
	});

	it('allows a stop into an open week offline', () => {
		const reports = [
			report('2026-W48', 'draft', [0, 0, 0, 0, 0, 0, 0]),
			report('2026-W47', 'sent', [0, 0, 0, 0, 0, 0, 0])
		];
		expect(stopBlockedOffline(timer(start), end, reports, false)).toBe(false);
	});

	it('blocks a timer from Sunday night into a sent Monday week', () => {
		const sunday = at('2026-11-29', '22:00');
		const reports = [report('2026-W49', 'sent', [0, 0, 0, 0, 0, 0, 0])];
		expect(stopBlockedOffline(timer(sunday), at('2026-11-30', '01:00'), reports, false)).toBe(true);
		expect(stopBlockedOffline(timer(sunday), at('2026-11-29', '23:30'), reports, false)).toBe(
			false
		);
	});

	it('ignores another assignment’s sent week', () => {
		const other = { ...report('2026-W48', 'sent', [0, 0, 0, 0, 0, 0, 0]), assignmentId: 'a2' };
		expect(stopBlockedOffline(timer(start), end, [other], false)).toBe(false);
	});
});

describe('labels', () => {
	const start = at('2026-11-25', '08:05');

	it('shows running time without seconds', () => {
		expect(elapsedLabel(start, start + 59_999)).toBe('0 min');
		expect(elapsedLabel(start, start + 42 * MINUTE + 59_000)).toBe('42 min');
		expect(elapsedLabel(start, start + 102 * MINUTE)).toBe('1 h 42');
		expect(elapsedLabel(start, start + 665 * MINUTE)).toBe('11 h 05');
		expect(elapsedLabel(start, start - MINUTE)).toBe('0 min');
	});

	it('says a length in words', () => {
		expect(durationLabel(start, start + 680 * MINUTE)).toBe('11 h 20 min');
		expect(durationLabel(start, start + 600 * MINUTE)).toBe('10 h');
		expect(durationLabel(start, start + 45 * MINUTE)).toBe('45 min');
	});
});

describe('parseEnd', () => {
	const start = at('2026-11-25', '08:05');
	const now = at('2026-11-25', '19:25');

	it('reads a clock time on the start day', () => {
		for (const text of ['16:05', '16.05', '1605', ' 16:05 ']) {
			expect(parseEnd(text, timer(start), now)).toEqual({ end: at('2026-11-25', '16:05') });
		}
		expect(parseEnd('9:30', timer(start), now)).toEqual({ end: at('2026-11-25', '09:30') });
	});

	it('refuses what is not a time', () => {
		for (const text of ['', '25:00', '16:60', 'fyra', '16']) {
			expect(parseEnd(text, timer(start), now)).toEqual({ error: 'Skriv en tid som 16:05' });
		}
	});

	it('refuses an end at or before the start, and after now', () => {
		expect(parseEnd('08:05', timer(start), now)).toEqual({
			error: 'Sluttiden måste vara efter 08:05'
		});
		expect(parseEnd('19:30', timer(start), now)).toEqual({
			error: 'Sluttiden kan inte vara senare än nu'
		});
	});

	it('reads a time not after the start as the next day, for a timer over midnight', () => {
		const late = timer(at('2026-11-24', '22:05'));
		const morning = at('2026-11-25', '09:47');
		expect(parseEnd('01:30', late, morning)).toEqual({ end: at('2026-11-25', '01:30') });
		expect(parseEnd('00:00', late, morning)).toEqual({ end: at('2026-11-25', '00:00') });
		expect(parseEnd('23:30', late, morning)).toEqual({ end: at('2026-11-24', '23:30') });
		expect(parseEnd('10:00', late, morning)).toEqual({
			error: 'Sluttiden måste vara efter 22:05'
		});
	});

	it('counts the real hours on the day summer time ends', () => {
		// 25 October 2026: 03:00 summer time becomes 02:00 winter time, so the day has 25 hours.
		const autumn = at('2026-10-25', '01:00');
		const result = parseEnd('10:00', timer(autumn), at('2026-10-25', '20:00'));
		expect(result).toEqual({ end: at('2026-10-25', '10:00') });
		expect(((result as { end: number }).end - autumn) / MINUTE).toBe(10 * 60);
	});
});

describe('parseStart', () => {
	const now = at('2026-11-25', '12:40');
	const running = timer(at('2026-11-25', '12:30'));

	it('reads a clock time today, earlier or later than the old start', () => {
		for (const text of ['11:45', '11.45', '1145', ' 11:45 ']) {
			expect(parseStart(text, running, now)).toEqual({ start: at('2026-11-25', '11:45') });
		}
		expect(parseStart('12:35', running, now)).toEqual({ start: at('2026-11-25', '12:35') });
		expect(parseStart('12:40', running, now)).toEqual({ start: now });
	});

	it('refuses what is not a time', () => {
		for (const text of ['', '25:00', 'tolv']) {
			expect(parseStart(text, running, now)).toEqual({ error: 'Skriv en tid som 16:05' });
		}
	});

	it('refuses a start later than now on a timer from today', () => {
		expect(parseStart('14:10', running, now)).toEqual({
			error: 'Starttiden kan inte vara senare än nu'
		});
	});

	it('reads a later clock time as yesterday for a timer over midnight', () => {
		const late = timer(at('2026-11-24', '22:05'));
		const morning = at('2026-11-25', '00:10');
		expect(parseStart('21:30', late, morning)).toEqual({ start: at('2026-11-24', '21:30') });
		expect(parseStart('00:05', late, morning)).toEqual({ start: at('2026-11-25', '00:05') });
	});

	it('counts the real hours on the day summer time ends', () => {
		// 25 October 2026 has 25 hours: from 01:00 to 10:00 is ten hours.
		const autumn = timer(at('2026-10-25', '10:00'));
		const result = parseStart('01:00', autumn, at('2026-10-25', '10:30'));
		expect(result).toEqual({ start: at('2026-10-25', '01:00') });
		expect((at('2026-10-25', '10:00') - (result as { start: number }).start) / MINUTE).toBe(
			10 * 60
		);
	});
});

describe('suggestStart', () => {
	const running = timer(at('2026-11-25', '12:30'));

	it('suggests the end of the latest interval before the timer, to fill the gap', () => {
		const entries = [
			work('2026-11-25', '08:12', '09:00'),
			work('2026-11-25', '09:00', '11:45'),
			work('2026-11-24', '13:00', '17:00')
		];
		expect(suggestStart(running, entries)).toBe(at('2026-11-25', '11:45'));
	});

	it('keeps the start when no interval ended before it that day', () => {
		expect(suggestStart(running, [])).toBe(running.start);
		expect(suggestStart(running, [work('2026-11-24', '13:00', '17:00')])).toBe(running.start);
		expect(suggestStart(running, [work('2026-11-25', '12:00', '13:00')])).toBe(running.start);
	});
});

describe('a pause on the timer (issue 95)', () => {
	// The timer runs from 08:15; at 11:52 the owner takes 30 minutes of lunch.
	const running = timer(at('2026-11-25', '08:15'));
	const now = at('2026-11-25', '11:52');

	it('counts a length of one’s own from where the pause begins to the end’s clock time', () => {
		expect(pauseMinutes(at('2026-11-25', '11:52'), '12:40')).toBe(48);
		expect(pauseMinutes(at('2026-11-25', '11:52'), '11:52')).toBe(0);
		expect(pauseMinutes(at('2026-11-25', '11:52'), '11:30')).toBe(-22);
		// Over the change to winter time, 02:30 is the first of the two: an hour after 01:30.
		expect(pauseMinutes(at('2026-10-25', '01:30'), '02:30')).toBe(60);
	});

	it('ends the interval where the pause begins and starts the timer where it ends', () => {
		expect(parsePause('11:52', 30, running, now)).toEqual({
			pause: { from: at('2026-11-25', '11:52'), until: at('2026-11-25', '12:22') }
		});
	});

	it('takes a pause afterwards, already over', () => {
		const later = at('2026-11-25', '15:00');
		expect(parsePause('11:45', 45, running, later)).toEqual({
			pause: { from: at('2026-11-25', '11:45'), until: at('2026-11-25', '12:30') }
		});
	});

	it('refuses a pause that begins later than now or is not a time', () => {
		expect(parsePause('12:10', 30, running, now)).toEqual({
			error: 'Pausen kan inte börja senare än nu'
		});
		expect(parsePause('tolv', 30, running, now)).toEqual({ error: 'Skriv en tid som 16:05' });
	});

	it('refuses a pause within the timer’s first minute, which leaves no interval', () => {
		const fresh = timer(at('2026-11-25', '11:51') + 20_000);
		expect(parsePause('11:51', 15, fresh, now)).toEqual({
			error: 'Pausen kan börja tidigast 11:53'
		});
		expect(parsePause('08:00', 15, running, now)).toEqual({
			error: 'Pausen kan börja tidigast 08:16'
		});
	});

	it('counts the real hours on the day summer time ends', () => {
		// 25 October 2026: 01:30 to 03:30 local is three hours of interval; a pause of an hour
		// from 03:30 ends 04:30.
		const autumn = timer(at('2026-10-25', '01:30'));
		const result = parsePause('03:30', 60, autumn, at('2026-10-25', '04:00'));
		expect(result).toEqual({
			pause: { from: at('2026-10-25', '03:30'), until: at('2026-10-25', '04:30') }
		});
		const { pause } = result as { pause: { from: number } };
		expect(timerEntry(autumn, pause.from).time).toEqual({
			kind: 'interval',
			start: autumn.start,
			end: at('2026-10-25', '03:30')
		});
		expect((pause.from - autumn.start) / MINUTE).toBe(3 * 60);
	});

	it('is in a pause while the timer’s start is ahead, and nothing runs', () => {
		const inPause = timer(at('2026-11-25', '12:22'));
		expect(isPaused(inPause, at('2026-11-25', '12:00'))).toBe(true);
		expect(runningEntry(inPause, at('2026-11-25', '12:00'))).toBeNull();
		expect(isPaused(inPause, at('2026-11-25', '12:21'))).toBe(false);
		// A timer just started, seen before the minute's tick, runs.
		expect(isPaused(inPause, at('2026-11-25', '12:22') - 30_000)).toBe(false);
		expect(runningEntry(inPause, at('2026-11-25', '12:30'))?.time).toEqual({
			kind: 'interval',
			start: at('2026-11-25', '12:22'),
			end: at('2026-11-25', '12:30')
		});
		expect(runningEntry(null, now)).toBeNull();
	});

	it('finds the interval the pause was split from', () => {
		const inPause = timer(at('2026-11-25', '12:22'));
		const split = { ...work('2026-11-25', '08:15', '11:52'), id: 'timer-x' };
		const entries = [work('2026-11-25', '07:00', '08:00'), split];
		expect(entryBefore(inPause, entries)).toBe(split);
		expect(entryBefore(inPause, [])).toBeNull();
	});

	it('never blocks the stop of a timer in a pause, which writes no interval', () => {
		const reports = [report('2026-W48', 'sent', [0, 0, 0, 0, 0, 0, 0])];
		const inPause = timer(at('2026-11-25', '12:22'));
		expect(stopBlockedOffline(inPause, at('2026-11-25', '12:00'), reports, false)).toBe(false);
	});
});
