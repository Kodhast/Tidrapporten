import { describe, expect, it } from 'vitest';
import { absenceCountings } from './flex.ts';
import { freeDaysByDate } from './helgdagar.ts';
import {
	absenceTypes,
	absentAllDay,
	assignment,
	at,
	hm,
	receiver,
	report,
	work
} from './testdata.ts';
import type { ChangeLogEntry, Entry } from './types.ts';
import {
	changeLabel,
	dayBasis,
	entryChangeDetail,
	receiverBasis,
	weekChanges
} from './underlag.ts';
import { weekView, type WeekInput } from './vecka.ts';

// Made-up week 47 of 2026, Monday 16 to Sunday 22 November. Monday 8:30 on c1, Tuesday 8:10 on
// c2 and Wednesday semester (counted as 8 h): 24:40 actual.
const WEEK = '2026-W47';
const entries = [
	work('2026-11-16', '08:00', '16:30', 'c1'),
	work('2026-11-17', '08:00', '16:10', 'c2'),
	absentAllDay('2026-11-18', 'semester')
];
const r2 = receiver({ id: 'r2', name: 'Kund A', position: 2 });

const input = (overrides: Partial<WeekInput> = {}): WeekInput => ({
	week: WEEK,
	assignments: [assignment({ name: 'Uppdrag A', startDate: '2026-11-02' })],
	receivers: { a1: [receiver({ name: 'Arbetsgivaren' }), r2] },
	entries,
	reports: [],
	freeDays: freeDaysByDate([]),
	countings: absenceCountings(absenceTypes),
	now: at('2026-11-25', '12:00'),
	...overrides
});

describe('receiverBasis', () => {
	it('compares a sent report with the actual time, and leaves an unsent one without', () => {
		const sent = {
			...report(WEEK, 'sent', [480, 480, 480, 0, 0, 0, 0]),
			snapshot: {
				sentAt: at('2026-11-20', '16:02'),
				assignmentName: 'Uppdrag A',
				receiverName: 'Arbetsgivaren',
				codeNames: {},
				actualMinutes: hm('24:40')
			}
		};
		expect(receiverBasis(weekView(input({ reports: [sent] })))).toEqual([
			{
				key: 'a1_r1',
				assignmentName: 'Uppdrag A',
				receiverName: 'Arbetsgivaren',
				actual: hm('24:40'),
				reported: hm('24:00'),
				sentAt: at('2026-11-20', '16:02'),
				// 24:00 reported − 24:40 actual.
				difference: -40
			},
			{
				key: 'a1_r2',
				assignmentName: 'Uppdrag A',
				receiverName: 'Kund A',
				actual: hm('24:40'),
				reported: null,
				sentAt: null,
				difference: null
			}
		]);
	});

	it('counts an unlocked report as reported, and leaves out a week without time', () => {
		const unlocked = report(WEEK, 'unlocked', [600, 0, 0, 0, 0, 0, 0]);
		// 10:00 reported − 24:40 actual.
		const [first] = receiverBasis(weekView(input({ reports: [unlocked] })));
		expect(first).toMatchObject({ reported: hm('10:00'), sentAt: null, difference: -880 });
		expect(receiverBasis(weekView(input({ entries: [] })))).toEqual([]);
	});
});

describe('dayBasis', () => {
	it('lists the days with entries, splits an interval over midnight and has no gaps', () => {
		const late: Entry = work('2026-11-19', '22:00', '02:00', 'c1', '2026-11-20');
		const days = dayBasis([...entries, work('2026-11-16', '17:00', '18:00'), late], WEEK);
		expect(days.map((d) => [d.date, d.total, d.rows.length])).toEqual([
			['2026-11-16', hm('9:30'), 2],
			['2026-11-17', hm('8:10'), 1],
			// Whole-day absence has no clock time.
			['2026-11-18', 0, 1],
			['2026-11-19', hm('2:00'), 1],
			['2026-11-20', hm('2:00'), 1]
		]);
		expect(days.flatMap((d) => d.rows).some((r) => (r.kind as string) === 'gap')).toBe(false);
	});
});

const log = (overrides: Partial<ChangeLogEntry>): ChangeLogEntry => ({
	id: 'l1',
	at: at('2026-11-23', '08:40'),
	path: 'entries/e1',
	action: 'update',
	week: WEEK,
	before: null,
	after: null,
	reason: '',
	by: 'app',
	...overrides
});

describe('the change log', () => {
	it('keeps the week’s entries, oldest first', () => {
		const result = weekChanges(
			[
				log({ id: 'b', at: at('2026-11-23', '09:00') }),
				log({ id: 'other', week: '2026-W46' }),
				log({ id: 'a', at: at('2026-11-20', '16:02'), path: 'reports/a1_r1_2026-W47' })
			],
			WEEK
		);
		expect(result.map((l) => l.id)).toEqual(['a', 'b']);
	});

	it('names what changed', () => {
		expect(changeLabel({ path: 'entries/e1', action: 'update' })).toBe('Tid ändrad');
		expect(changeLabel({ path: 'reports/a1_r1_2026-W47', action: 'send' })).toBe('Rapport skickad');
		expect(changeLabel({ path: 'reports/x', action: 'unlock' })).toBe('Rapport upplåst');
		expect(changeLabel({ path: 'entries/e1', action: 'delete' })).toBe('Tid raderad');
		expect(changeLabel({ path: 'assignments/a1', action: 'update' })).toBe('Uppdrag ändrat');
		expect(changeLabel({ path: 'freeDays/2026-11-16', action: 'create' })).toBe(
			'Inställning tillagd'
		);
	});

	it('says an interval change as before and after', () => {
		const before = work('2026-11-16', '12:45', '17:00');
		const after = { ...before, time: { ...before.time, end: at('2026-11-16', '17:15') } } as Entry;
		expect(entryChangeDetail(before, after)).toBe('mån 16 nov 12:45–17:00 → 12:45–17:15');
		const moved = work('2026-11-17', '08:00', '09:00');
		expect(entryChangeDetail(before, moved)).toBe(
			'mån 16 nov 12:45–17:00 → tis 17 nov 08:00–09:00'
		);
		expect(entryChangeDetail(null, absentAllDay('2026-11-18', 'semester'))).toBe(
			'ons 18 nov hela dagen'
		);
		expect(entryChangeDetail(null, null)).toBeNull();
	});
});
