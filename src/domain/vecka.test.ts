import { describe, expect, it } from 'vitest';
import { absenceCountings } from './flex.ts';
import { freeDaysByDate } from './helgdagar.ts';
import {
	absenceTypes,
	absentAllDay,
	assignment,
	at,
	code,
	hm,
	receiver,
	report,
	work
} from './testdata.ts';
import type { ReportLine } from './types.ts';
import {
	changeWeek,
	codeName,
	editableLines,
	hoursLabel,
	listNames,
	mappedFrom,
	otherWeek,
	sentLabel,
	sentReport,
	weekLabel,
	weekView,
	workdaysOf,
	type WeekInput
} from './vecka.ts';

// Made-up week 47 of 2026, Monday 16 to Sunday 22 November, without holidays. "Now" is Wednesday
// 25 November, so the week has ended.
const WEEK = '2026-W47';
const NOW = at('2026-11-25', '12:00');
const a1 = assignment({ startDate: '2026-11-02' });
const r1 = receiver();
const r2 = receiver({
	id: 'r2',
	name: 'Mottagare två',
	position: 2,
	suggestionMode: 'actualQuarter'
});

// Monday 8:30 on c1, Tuesday 8:10 on c2, Wednesday semester: 24:40 actual.
const entries = [
	work('2026-11-16', '08:00', '16:30', 'c1'),
	work('2026-11-17', '08:00', '16:10', 'c2'),
	absentAllDay('2026-11-18', 'semester')
];

const input = (overrides: Partial<WeekInput> = {}): WeekInput => ({
	week: WEEK,
	assignments: [a1],
	receivers: { a1: [r2, r1] },
	entries,
	reports: [],
	freeDays: freeDaysByDate([]),
	countings: absenceCountings(absenceTypes),
	now: NOW,
	...overrides
});

const line = (receiverCodeId: string, minutesPerDay: number[]): ReportLine => ({
	receiverCodeId,
	minutesPerDay: minutesPerDay as ReportLine['minutesPerDay']
});

describe('weekView', () => {
	it('counts the week and suggests a report per receiver in the chain order', () => {
		const view = weekView(input());
		expect(view.actual).toBe(hm('24:40'));
		expect(view.norm).toBe(hm('40:00'));
		// Open week that has ended: 24:40 − 40:00.
		expect(view.flex).toBe(hm('-15:20'));
		expect(view.toSend).toBe(2);
		const [a] = view.perAssignment;
		expect(a!.receivers.map((r) => r.receiver.id)).toEqual(['r1', 'r2']);
		// Filled to the norm: 8 + 8 + 8 (semester); Thursday and Friday have no time to fill.
		expect(a!.receivers[0]!.minutes).toBe(hm('24:00'));
		// Per quarter: 8:30 + 8:15 + 8:00.
		expect(a!.receivers[1]!.minutes).toBe(hm('24:45'));
		expect(a!.receivers[0]!.lines).toEqual([
			line('R-arbete', [480, 480, 0, 0, 0, 0, 0]),
			line('R-ledigt', [0, 0, 480, 0, 0, 0, 0])
		]);
	});

	it('shows a sent report as it was sent and counts flex against it', () => {
		const sent = report(WEEK, 'sent', [510, 495, 480, 0, 0, 0, 0]);
		const view = weekView(input({ reports: [sent] }));
		const [first, second] = view.perAssignment[0]!.receivers;
		expect(first!.report).toBe(sent);
		expect(first!.minutes).toBe(hm('24:45'));
		// 24:40 actual − 24:45 reported.
		expect(view.flex).toBe(-5);
		expect(second!.report).toBeNull();
		expect(view.toSend).toBe(1);
	});

	it('counts an unlocked report as one to send again', () => {
		const unlocked = report(WEEK, 'unlocked', [480, 480, 480, 0, 0, 0, 0]);
		const sent = report(WEEK, 'sent', [480, 480, 480, 0, 0, 0, 0], 'r2');
		expect(weekView(input({ reports: [unlocked, sent] })).toSend).toBe(1);
	});

	it('asks for no report in a week without time', () => {
		const view = weekView(input({ entries: [] }));
		expect(view.toSend).toBe(0);
		expect(view.perAssignment[0]!.hasTime).toBe(false);
	});

	it('shows an archived receiver only with a report that week', () => {
		const gone = receiver({ id: 'r3', position: 3, archived: true });
		const receivers = { a1: [r1, gone] };
		expect(weekView(input({ receivers })).perAssignment[0]!.receivers).toHaveLength(1);
		const old = report(WEEK, 'sent', [480, 0, 0, 0, 0, 0, 0], 'r3');
		const shown = weekView(input({ receivers, reports: [old] })).perAssignment[0]!.receivers;
		expect(shown.map((r) => r.receiver.id)).toEqual(['r1', 'r3']);
	});

	it('leaves out assignments that do not run in the week, and archived ones', () => {
		const ended = assignment({ id: 'a2', endDate: '2026-11-15' });
		const later = assignment({ id: 'a3', startDate: '2026-11-23' });
		const archived = assignment({ id: 'a4', archived: true });
		const view = weekView(input({ assignments: [later, ended, archived, a1] }));
		expect(view.perAssignment.map((a) => a.assignment.id)).toEqual(['a1']);
	});

	it('lists what the receiver has no code for', () => {
		const partial = receiver({ mapping: { c1: 'R-arbete' } });
		const [r] = weekView(input({ receivers: { a1: [partial] } })).perAssignment[0]!.receivers;
		expect(r!.unmapped).toEqual(['c2', 'semester']);
	});
});

describe('changeWeek', () => {
	const workdays = [0, 1, 2, 3, 4];

	it('puts more time on the fullest day', () => {
		const changed = changeWeek(line('x', [240, 480, 0, 0, 0, 0, 0]), 750, workdays);
		expect(changed.minutesPerDay).toEqual([240, 510, 0, 0, 0, 0, 0]);
	});

	it('puts time on a code without time on the first workday', () => {
		expect(changeWeek(line('x', [0, 0, 0, 0, 0, 0, 0]), 30, [1, 2]).minutesPerDay).toEqual([
			0, 30, 0, 0, 0, 0, 0
		]);
	});

	it('takes less time from the fullest day first, then the next', () => {
		const changed = changeWeek(line('x', [15, 30, 0, 0, 0, 0, 0]), 0, workdays);
		expect(changed.minutesPerDay).toEqual([0, 0, 0, 0, 0, 0, 0]);
		const partly = changeWeek(line('x', [20, 30, 0, 0, 0, 0, 0]), 20, workdays);
		// 30 off, all from Tuesday, the fullest.
		expect(partly.minutesPerDay).toEqual([20, 0, 0, 0, 0, 0, 0]);
	});

	it('never goes below zero', () => {
		expect(changeWeek(line('x', [30, 0, 0, 0, 0, 0, 0]), -30, workdays).minutesPerDay).toEqual([
			0, 0, 0, 0, 0, 0, 0
		]);
	});
});

describe('workdaysOf', () => {
	it('gives the weekdays with a norm', () => {
		expect(workdaysOf(a1, WEEK, freeDaysByDate([]))).toEqual([0, 1, 2, 3, 4]);
		// Week 52 of 2026: Christmas Eve (Thursday) and Christmas Day (Friday) are free.
		expect(workdaysOf(a1, '2026-W52', freeDaysByDate([]))).toEqual([0, 1, 2]);
	});
});

describe('editableLines', () => {
	it('gives every code in the receiver order, and an unknown code last', () => {
		const lines = editableLines(r1, [
			line('gammal', [60, 0, 0, 0, 0, 0, 0]),
			line('R-ledigt', [0, 480, 0, 0, 0, 0, 0])
		]);
		expect(lines.map((l) => l.receiverCodeId)).toEqual(['R-arbete', 'R-ledigt', 'gammal']);
		expect(lines[0]!.minutesPerDay).toEqual([0, 0, 0, 0, 0, 0, 0]);
	});

	it('copies the minutes, so that a change leaves the source alone', () => {
		const source = [line('R-arbete', [60, 0, 0, 0, 0, 0, 0])];
		editableLines(r1, source)[0]!.minutesPerDay[0] = 0;
		expect(source[0]!.minutesPerDay[0]).toBe(60);
	});
});

describe('names', () => {
	const codes = [code('c2', { name: 'Möten', order: 1 }), code('c1', { name: 'Utveckling' })];

	it('lists what maps to a receiver code, codes first in their order', () => {
		expect(mappedFrom(r1, 'R-arbete', codes, absenceTypes)).toEqual([
			'Utveckling',
			'Möten',
			'Utbildning'
		]);
		expect(listNames(['Utveckling', 'Möten', 'Utbildning'])).toBe(
			'Utveckling, Möten och Utbildning'
		);
		expect(listNames(['Utveckling', 'Möten'])).toBe('Utveckling och Möten');
		expect(listNames(['Utveckling'])).toBe('Utveckling');
	});

	it('takes a sent code name from the snapshot', () => {
		const sent = sentReport(
			report(WEEK, 'draft', [480, 0, 0, 0, 0, 0, 0]),
			a1,
			r1,
			hm('8:00'),
			NOW
		);
		const renamed = receiver({ codes: [{ id: 'R-arbete', name: 'Nytt namn' }] });
		expect(codeName(renamed, sent, 'R-arbete')).toBe('Arbete');
		expect(codeName(renamed, null, 'R-arbete')).toBe('Nytt namn');
	});
});

describe('sentReport', () => {
	it('keeps the lines with time and a snapshot of the names and the actual time', () => {
		const draft = {
			...report(WEEK, 'draft', [480, 0, 0, 0, 0, 0, 0]),
			lines: [line('R-arbete', [480, 0, 0, 0, 0, 0, 0]), line('R-ledigt', [0, 0, 0, 0, 0, 0, 0])]
		};
		const sent = sentReport(draft, a1, r1, hm('8:10'), NOW);
		expect(sent.status).toBe('sent');
		expect(sent.lines).toEqual([line('R-arbete', [480, 0, 0, 0, 0, 0, 0])]);
		expect(sent.snapshot).toEqual({
			sentAt: NOW,
			assignmentName: 'Exempeluppdraget',
			receiverName: 'Mottagare ett',
			codeNames: { 'R-arbete': 'Arbete' },
			actualMinutes: hm('8:10')
		});
	});
});

describe('labels', () => {
	it.each([
		['2026-W47', '2026-11-25', 'Vecka 47 · 16–22 nov'],
		['2026-W49', '2026-11-25', 'Vecka 49 · 30 nov–6 dec'],
		['2027-W01', '2026-12-28', 'Vecka 1 2027 · 4–10 jan']
	])('%s → %s', (week, today, label) => {
		expect(weekLabel(week, today)).toBe(label);
	});

	it('steps over the new year', () => {
		expect(otherWeek('2026-W53', 1)).toBe('2027-W01');
		expect(otherWeek('2027-W01', -1)).toBe('2026-W53');
		expect(otherWeek('2026-W47', 0)).toBe('2026-W47');
	});

	it('names the send time in Swedish time', () => {
		// 15:05 UTC is 16:05 in Stockholm in November.
		expect(sentLabel(Date.UTC(2026, 10, 20, 15, 5), true)).toBe('fre 20 nov 16:05');
		expect(sentLabel(Date.UTC(2026, 10, 20, 15, 5))).toBe('fre 20 nov');
	});

	it('gives hours with a decimal comma', () => {
		expect(hoursLabel(hm('34:30'))).toBe('34,5 h');
		expect(hoursLabel(hm('32:00'))).toBe('32 h');
	});
});
