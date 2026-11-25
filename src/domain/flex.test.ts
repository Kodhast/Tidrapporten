import { describe, expect, it } from 'vitest';
import {
	absenceCountings,
	assignmentFlex,
	firstReceiver,
	reportsWithOtherSum,
	timeByDay,
	totalFlex,
	weekFlex
} from './flex.ts';
import { freeDaysByDate } from './helgdagar.ts';
import {
	absenceTypes,
	absentAllDay,
	absentBetween,
	assignment,
	at,
	hm,
	receiver,
	report,
	work,
	workFor
} from './testdata.ts';
import { weeksBetween } from './tid.ts';
import type { Entry, IsoWeek, Report, UtcMillis } from './types.ts';

const none = freeDaysByDate([]);
const countings = absenceCountings(absenceTypes);

const flexOf = (week: IsoWeek, entries: Entry[], now: UtcMillis, firstReport?: Report) => {
	const a = assignment();
	return weekFlex({
		assignment: a,
		week,
		days: timeByDay(a, entries, none, countings),
		freeDays: none,
		firstReport,
		now
	});
};

// The worked examples in ADR 0012. Week 2026-W48 runs Monday 23 to Sunday 29 November.
describe('the worked examples in ADR 0012', () => {
	it('1. open week, Wednesday 14:00: +0:15', () => {
		const entries = [
			workFor('2026-11-23', '8:30'),
			workFor('2026-11-24', '7:45'),
			workFor('2026-11-25', '5:00')
		];
		expect(flexOf('2026-W48', entries, at('2026-11-25', '14:00'))).toBe(hm('0:15'));
	});

	const example2 = () => [
		workFor('2026-11-23', '8:30'),
		workFor('2026-11-24', '9:00'),
		workFor('2026-11-25', '7:30'),
		workFor('2026-11-26', '8:15'),
		workFor('2026-11-27', '8:15')
	];

	it('2. sent week: 41:30 actual − 40:00 reported = +1:30', () => {
		const sent = report('2026-W48', 'sent', [480, 480, 480, 480, 480, 0, 0]);
		expect(flexOf('2026-W48', example2(), at('2026-12-01', '12:00'), sent)).toBe(hm('1:30'));
	});

	it('2. a second receiver with another sum is flagged, but flex still follows the first', () => {
		const first = report('2026-W48', 'sent', [480, 480, 480, 480, 480, 0, 0]);
		const second = report('2026-W48', 'sent', [480, 480, 480, 480, 360, 0, 0], 'r2');
		const same = report('2026-W48', 'sent', [480, 480, 480, 480, 480, 0, 0], 'r3');
		const draft = report('2026-W48', 'draft', [0, 0, 0, 0, 0, 0, 0], 'r4');
		expect(reportsWithOtherSum(first, [first, second, same, draft])).toEqual([second]);
		expect(flexOf('2026-W48', example2(), at('2026-12-01', '12:00'), first)).toBe(hm('1:30'));
	});

	// Example 3 needs a Thursday holiday: 2026-W20, where Ascension Day is Thursday 14 May.
	const example3 = () => [
		absentAllDay('2026-05-11', 'semester'),
		workFor('2026-05-12', '9:00'),
		workFor('2026-05-13', '8:30'),
		absentAllDay('2026-05-15', 'komptid')
	];

	it('3. open week after Friday with vacation, holiday and comp time: −6:30', () => {
		expect(flexOf('2026-W20', example3(), at('2026-05-16', '10:00'))).toBe(hm('-6:30'));
	});

	it('3. the same week sent with 32:00 to the first receiver: −6:30', () => {
		const sent = report('2026-W20', 'sent', [480, 480, 480, 0, 480, 0, 0]);
		expect(flexOf('2026-W20', example3(), at('2026-05-18', '10:00'), sent)).toBe(hm('-6:30'));
	});

	it('4. balance: opening +12:00 plus examples 2 and 3 = +7:00', () => {
		const a = assignment({
			startDate: '2026-05-11',
			endDate: '2026-11-29',
			openingFlex: hm('12:00')
		});
		// The weeks between the examples are sent with nothing reported and no time, so they add 0.
		const firstReports = new Map<IsoWeek, Report>(
			weeksBetween('2026-05-11', '2026-11-29').map((week) => [
				week,
				report(week, 'sent', [0, 0, 0, 0, 0, 0, 0])
			])
		);
		firstReports.set('2026-W20', report('2026-W20', 'sent', [480, 480, 480, 0, 480, 0, 0]));
		firstReports.set('2026-W48', report('2026-W48', 'sent', [480, 480, 480, 480, 480, 0, 0]));
		const result = assignmentFlex({
			assignment: a,
			entries: [...example3(), ...example2()],
			freeDays: none,
			countings,
			firstReports,
			now: at('2026-12-01', '12:00')
		});
		expect(result.byWeek.get('2026-W20')).toBe(hm('-6:30'));
		expect(result.byWeek.get('2026-W48')).toBe(hm('1:30'));
		expect(result.balance).toBe(hm('7:00'));
	});
});

describe('weekFlex, open week', () => {
	it('counts today only up to the actual time, so today gives plus but never minus', () => {
		const now = at('2026-11-25', '10:00');
		expect(flexOf('2026-W48', [workFor('2026-11-25', '2:00')], now)).toBe(
			hm('-16:00') // Monday and Tuesday without time; Wednesday 2:00 against 2:00
		);
		expect(flexOf('2026-W48', [workFor('2026-11-25', '9:00')], now)).toBe(hm('-15:00'));
	});

	it('does not count future days', () => {
		expect(flexOf('2026-W48', [], at('2026-11-23', '07:00'))).toBe(0);
	});

	it('treats a draft from the first receiver as an open week', () => {
		const draft = report('2026-W48', 'draft', [0, 0, 0, 0, 0, 0, 0]);
		expect(flexOf('2026-W48', [], at('2026-11-30', '10:00'), draft)).toBe(hm('-40:00'));
	});

	it('uses the reported time once the report is unlocked as well as sent', () => {
		const unlocked = report('2026-W48', 'unlocked', [480, 480, 480, 480, 480, 0, 0]);
		expect(flexOf('2026-W48', [], at('2026-11-30', '10:00'), unlocked)).toBe(hm('-40:00'));
		const lessReported = report('2026-W48', 'unlocked', [480, 480, 480, 480, 0, 0, 0]);
		expect(flexOf('2026-W48', [], at('2026-11-30', '10:00'), lessReported)).toBe(hm('-32:00'));
	});
});

describe('weekFlex over a change of summer time', () => {
	it('counts the real length of a night shift in 2026-W13, when the clocks go forward', () => {
		// Friday 22:00 to Saturday 06:00 is 8 hours; Saturday night to Sunday 06:00 only 7.
		const entries = [
			work('2026-03-27', '22:00', '06:00', 'c1', '2026-03-28'),
			work('2026-03-28', '22:00', '06:00', 'c1', '2026-03-29')
		];
		const now = at('2026-03-30', '10:00');
		expect(flexOf('2026-W13', entries, now)).toBe(hm('15:00') - hm('40:00'));
	});

	it('counts the extra hour in 2026-W43, when the clocks go back', () => {
		const entries = [work('2026-10-24', '22:00', '06:00', 'c1', '2026-10-25')];
		expect(flexOf('2026-W43', entries, at('2026-10-26', '10:00'))).toBe(hm('9:00') - hm('40:00'));
	});
});

describe('timeByDay and absence', () => {
	const a = assignment();
	const day = (entries: Entry[]) => timeByDay(a, entries, none, countings).get('2026-11-25');

	it.each([
		['semester', 'fillsNorm', 480, 480],
		['komptid', 'flexWithdrawal', 0, 480],
		['utbildning', 'worked', 480, 480]
	])('a whole day of %s (%s) counts %i actual and reports %i', (type, _counting, actual, shown) => {
		const result = day([absentAllDay('2026-11-25', type)]);
		expect(result?.actual).toBe(actual);
		expect(result?.bySubject.get(type)).toEqual({ kind: 'absence', clocked: 0, wholeDay: shown });
	});

	it.each([
		['semester', 240],
		['komptid', 0],
		['utbildning', 240]
	])('four hours of %s count %i actual', (type, actual) => {
		const result = day([absentBetween('2026-11-25', '08:00', '12:00', type)]);
		expect(result?.actual).toBe(actual);
		expect(result?.bySubject.get(type)).toEqual({ kind: 'absence', clocked: 240, wholeDay: 0 });
	});

	it('counts a whole day as the norm, rounded to a quarter', () => {
		const part = assignment({
			terms: [{ from: '2026-01-01', scopePercent: 80, workdayMinutes: 480 }]
		});
		const days = timeByDay(part, [absentAllDay('2026-11-25', 'semester')], none, countings);
		expect(days.get('2026-11-25')?.actual).toBe(390); // 80 % = 6:24, rounded to 6:30
	});

	it('counts an unknown absence type as filling the norm', () => {
		expect(day([absentAllDay('2026-11-25', 'okänd')])?.actual).toBe(480);
	});

	it('gives a whole day of absence on a weekend no time', () => {
		const weekend = timeByDay(a, [absentAllDay('2026-11-28', 'semester')], none, countings);
		expect(weekend.get('2026-11-28')?.actual).toBe(0);
	});

	it('counts an interval over midnight on both days', () => {
		const days = timeByDay(
			a,
			[work('2026-11-25', '22:00', '02:00', 'c1', '2026-11-26')],
			none,
			countings
		);
		expect(days.get('2026-11-25')?.actual).toBe(120);
		expect(days.get('2026-11-26')?.actual).toBe(120);
	});

	it('leaves out other assignments and days outside this one', () => {
		const other: Entry = { ...workFor('2026-11-25', '8:00'), assignmentId: 'a2' };
		const before = workFor('2025-12-30', '8:00');
		expect(timeByDay(a, [other, before], none, countings).size).toBe(0);
	});
});

describe('assignmentFlex and the total', () => {
	it('adds the opening balance and every week from the start', () => {
		const a = assignment({ startDate: '2026-11-23', openingFlex: hm('12:00') });
		const entries = [
			workFor('2026-11-23', '9:00'),
			workFor('2026-11-24', '9:00'),
			workFor('2026-11-30', '8:30')
		];
		const result = assignmentFlex({
			assignment: a,
			entries,
			freeDays: none,
			countings,
			firstReports: new Map(),
			now: at('2026-11-30', '17:00')
		});
		// W48: 18:00 actual − 40:00 norm = −22:00; W49 so far: 8:30 − 8:00 = +0:30.
		expect([...result.byWeek]).toEqual([
			['2026-W48', hm('-22:00')],
			['2026-W49', hm('0:30')]
		]);
		expect(result.balance).toBe(hm('12:00') - hm('22:00') + hm('0:30'));
	});

	it('counts the first week only from the start day', () => {
		const a = assignment({ startDate: '2026-11-25' });
		const result = assignmentFlex({
			assignment: a,
			entries: [workFor('2026-11-24', '8:00')],
			freeDays: none,
			countings,
			firstReports: new Map(),
			now: at('2026-11-28', '12:00')
		});
		expect(result.balance).toBe(hm('-24:00')); // Wednesday to Friday, Tuesday not counted
	});

	it('stops at the end date', () => {
		const a = assignment({ startDate: '2026-11-23', endDate: '2026-11-24' });
		const result = assignmentFlex({
			assignment: a,
			entries: [],
			freeDays: none,
			countings,
			firstReports: new Map(),
			now: at('2027-01-15', '12:00')
		});
		expect([...result.byWeek.keys()]).toEqual(['2026-W48']);
		expect(result.balance).toBe(hm('-16:00'));
	});

	it('sums the assignments', () => {
		expect(
			totalFlex([
				{ balance: 90, byWeek: new Map() },
				{ balance: -30, byWeek: new Map() }
			])
		).toBe(60);
	});
});

describe('firstReceiver', () => {
	it('is the receiver with the lowest position, archived or not', () => {
		const receivers = [
			receiver({ id: 'r2', position: 2 }),
			receiver({ id: 'r1', position: 1, archived: true })
		];
		expect(firstReceiver(receivers)?.id).toBe('r1');
		expect(firstReceiver([])).toBeUndefined();
	});
});

describe('reportsWithOtherSum', () => {
	it('flags nothing while the first report is not sent', () => {
		const other = report('2026-W48', 'sent', [60, 0, 0, 0, 0, 0, 0], 'r2');
		expect(reportsWithOtherSum(undefined, [other])).toEqual([]);
		expect(
			reportsWithOtherSum(report('2026-W48', 'draft', [0, 0, 0, 0, 0, 0, 0]), [other])
		).toEqual([]);
	});
});
