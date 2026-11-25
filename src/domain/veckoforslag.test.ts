import { describe, expect, it } from 'vitest';
import { absenceCountings, timeByDay } from './flex';
import { freeDaysByDate } from './helgdagar';
import { absenceTypes, absentAllDay, assignment, receiver, workFor } from './testdata';
import type { SubjectTime } from './flex';
import type { Entry, Id, SuggestionMode } from './types';
import { roundToQuarter } from './norm';
import { suggestDay, suggestWeek } from './veckoforslag';

const none = freeDaysByDate([]);
const countings = absenceCountings(absenceTypes);

const suggest = (week: string, entries: Entry[], mode: SuggestionMode, r = receiver()) => {
	const a = assignment();
	return suggestWeek({
		assignment: a,
		receiver: r,
		week,
		days: timeByDay(a, entries, none, countings),
		freeDays: none,
		mode
	});
};

describe('roundToQuarter', () => {
	it.each([
		[0, 0],
		[7, 0], // just under half a quarter
		[8, 15], // just over half a quarter
		[22, 15],
		[23, 30],
		[480, 480],
		[517, 510],
		[518, 525]
	])('%i minutes round to %i', (minutes, rounded) => {
		expect(roundToQuarter(minutes)).toBe(rounded);
	});
});

describe('suggestDay', () => {
	// Codes are clocked time; the ids starting with a lower-case word are absence types.
	const subjects = (entries: [Id, number][], wholeDay: Id[] = []): Map<Id, SubjectTime> =>
		new Map(
			entries.map(([id, minutes]) => [
				id,
				id.startsWith('c')
					? { kind: 'code', clocked: minutes, wholeDay: 0 }
					: wholeDay.includes(id)
						? { kind: 'absence', clocked: 0, wholeDay: minutes }
						: { kind: 'absence', clocked: minutes, wholeDay: 0 }
			])
		);

	it('rounds each subject in actual mode', () => {
		const day = suggestDay(
			subjects([
				['c1', 247],
				['c2', 232]
			]),
			'actualQuarter',
			480
		);
		expect([...day]).toEqual([
			['c1', 240],
			['c2', 225]
		]);
	});

	it('fills the code with the most time up to the norm', () => {
		const day = suggestDay(
			subjects([
				['c1', 60],
				['c2', 300]
			]),
			'fillNorm',
			480
		);
		expect([...day]).toEqual([
			['c1', 60],
			['c2', 420]
		]);
	});

	it('takes the excess from the largest codes first, never below zero, absence untouched', () => {
		const day = suggestDay(
			subjects([
				['semester', 240],
				['c1', 120],
				['c2', 180]
			]),
			'fillNorm',
			240
		);
		expect([...day]).toEqual([
			['semester', 240],
			['c1', 0],
			['c2', 0]
		]);
	});

	it('picks the code with the lower id when two have the same time', () => {
		const day = suggestDay(
			subjects([
				['c2', 120],
				['c1', 120]
			]),
			'fillNorm',
			300
		);
		expect(day.get('c1')).toBe(180);
		expect(day.get('c2')).toBe(120);
	});

	it('reports nothing on a day without norm', () => {
		expect(suggestDay(subjects([['c1', 300]]), 'fillNorm', 0).size).toBe(0);
	});

	it('never rounds whole-day absence, which is already the norm', () => {
		const day = suggestDay(subjects([['semester', 390]], ['semester']), 'fillNorm', 390);
		expect([...day]).toEqual([['semester', 390]]);
		const actual = suggestDay(subjects([['semester', 390]], ['semester']), 'actualQuarter', 390);
		expect([...actual]).toEqual([['semester', 390]]);
	});

	it('leaves a day short when it has no internal code to fill', () => {
		const day = suggestDay(subjects([['semester', 240]]), 'fillNorm', 480);
		expect([...day]).toEqual([['semester', 240]]);
	});
});

describe('suggestWeek', () => {
	// Example 2 in ADR 0012: 41:30 actual, filled to 40:00 for the first receiver.
	const example2 = () => [
		workFor('2026-11-23', '8:30'),
		workFor('2026-11-24', '9:00'),
		workFor('2026-11-25', '7:30'),
		workFor('2026-11-26', '8:15'),
		workFor('2026-11-27', '8:15')
	];

	it('fills every workday to the norm', () => {
		expect(suggest('2026-W48', example2(), 'fillNorm')).toEqual({
			lines: [{ receiverCodeId: 'R-arbete', minutesPerDay: [480, 480, 480, 480, 480, 0, 0] }],
			unmapped: []
		});
	});

	it('reports the actual time rounded to the quarter', () => {
		expect(suggest('2026-W48', example2(), 'actualQuarter').lines).toEqual([
			{ receiverCodeId: 'R-arbete', minutesPerDay: [510, 540, 450, 495, 495, 0, 0] }
		]);
	});

	// Example 3 in ADR 0012, on 2026-W20 where Thursday is Ascension Day.
	it('reports a whole day of absence as the norm, comp time included', () => {
		const entries = [
			absentAllDay('2026-05-11', 'semester'),
			workFor('2026-05-12', '9:00'),
			workFor('2026-05-13', '8:30'),
			absentAllDay('2026-05-15', 'komptid')
		];
		expect(suggest('2026-W20', entries, 'fillNorm').lines).toEqual([
			{ receiverCodeId: 'R-arbete', minutesPerDay: [0, 480, 480, 0, 0, 0, 0] },
			{ receiverCodeId: 'R-ledigt', minutesPerDay: [480, 0, 0, 0, 480, 0, 0] }
		]);
	});

	it('maps several internal codes to one receiver code and keeps the receiver order', () => {
		const r = receiver({
			codes: [
				{ id: 'R-b', name: 'B' },
				{ id: 'R-a', name: 'A' }
			],
			mapping: { c1: 'R-a', c2: 'R-b' }
		});
		const entries = [workFor('2026-11-23', '3:00', 'c1'), workFor('2026-11-23', '5:00', 'c2')];
		expect(suggest('2026-W48', entries, 'actualQuarter', r).lines).toEqual([
			{ receiverCodeId: 'R-b', minutesPerDay: [300, 0, 0, 0, 0, 0, 0] },
			{ receiverCodeId: 'R-a', minutesPerDay: [180, 0, 0, 0, 0, 0, 0] }
		]);
	});

	it('lists internal codes without a mapping instead of reporting them', () => {
		const r = receiver({ mapping: { c1: 'R-arbete' } });
		const entries = [workFor('2026-11-23', '4:00', 'c1'), workFor('2026-11-23', '4:00', 'c2')];
		expect(suggest('2026-W48', entries, 'actualQuarter', r)).toEqual({
			lines: [{ receiverCodeId: 'R-arbete', minutesPerDay: [240, 0, 0, 0, 0, 0, 0] }],
			unmapped: ['c2']
		});
	});

	it('gives every receiver in the same mode the same sum', () => {
		const entries = [
			workFor('2026-11-23', '3:07', 'c1'),
			workFor('2026-11-23', '3:07', 'c2'),
			workFor('2026-11-24', '8:52', 'c1')
		];
		const merged = receiver({ id: 'r2', mapping: { c1: 'R-arbete', c2: 'R-arbete' } });
		const split = receiver({
			id: 'r3',
			codes: [
				{ id: 'X1', name: 'Ett' },
				{ id: 'X2', name: 'Två' }
			],
			mapping: { c1: 'X1', c2: 'X2' }
		});
		const sum = (r: typeof merged) =>
			suggest('2026-W48', entries, 'actualQuarter', r).lines.reduce(
				(total, line) => total + line.minutesPerDay.reduce((a, b) => a + b, 0),
				0
			);
		expect(sum(merged)).toBe(sum(split));
		expect(sum(merged)).toBe(180 + 180 + 525);
	});

	it("uses the receiver's own mode when none is given", () => {
		const a = assignment();
		const result = suggestWeek({
			assignment: a,
			receiver: receiver({ suggestionMode: 'actualQuarter' }),
			week: '2026-W48',
			days: timeByDay(a, [workFor('2026-11-23', '8:30')], none, countings),
			freeDays: none
		});
		expect(result.lines[0]?.minutesPerDay[0]).toBe(510);
	});
});
