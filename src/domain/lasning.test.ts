import { describe, expect, it } from 'vitest';
import { entryChange, reportChange, weekStatus, weeksOfEntry } from './lasning.ts';
import { absentAllDay, report, work } from './testdata.ts';
import type { Report, ReportStatus } from './types.ts';

const r = (status: ReportStatus, receiverId = 'r1', week = '2026-W48'): Report =>
	report(week, status, [480, 480, 480, 480, 480, 0, 0], receiverId);

describe('weekStatus', () => {
	it.each([
		[[], 'open'],
		[[r('draft')], 'open'],
		[[r('draft'), r('unlocked', 'r2')], 'unlocked'],
		[[r('unlocked'), r('sent', 'r2')], 'sent'],
		[[r('sent', 'r1', '2026-W47')], 'open'], // another week
		[[{ ...r('sent'), assignmentId: 'a2' }], 'open'] // another assignment
	] as [Report[], string][])('%j is %s', (reports, status) => {
		expect(weekStatus(reports, 'a1', '2026-W48')).toBe(status);
	});
});

describe('weeksOfEntry', () => {
	it('is one week for an interval within a week and for a whole day', () => {
		expect(weeksOfEntry(work('2026-11-25', '08:00', '17:00'))).toEqual(['2026-W48']);
		expect(weeksOfEntry(absentAllDay('2026-11-29', 'semester'))).toEqual(['2026-W48']);
	});

	it('is two weeks for an interval over Sunday midnight', () => {
		const night = work('2026-11-29', '22:00', '02:00', 'c1', '2026-11-30');
		expect(weeksOfEntry(night)).toEqual(['2026-W48', '2026-W49']);
	});

	it('leaves out the next week when the interval ends exactly at midnight', () => {
		expect(weeksOfEntry(work('2026-11-29', '22:00', '00:00', 'c1', '2026-11-30'))).toEqual([
			'2026-W48'
		]);
	});
});

describe('entryChange', () => {
	const open = work('2026-11-18', '08:00', '17:00'); // 2026-W47
	const inSent = work('2026-11-25', '08:00', '17:00'); // 2026-W48
	const reports = [r('sent'), r('draft', 'r1', '2026-W47')];

	it('needs no log in an open week', () => {
		expect(entryChange(null, open, reports)).toEqual({
			logged: false,
			action: 'create',
			week: null
		});
	});

	it.each([
		['create', null, inSent],
		['update', inSent, { ...inSent, note: 'Rättad' }],
		['delete', inSent, null]
	] as const)('logs a %s in a sent week', (action, before, after) => {
		expect(entryChange(before, after, reports)).toEqual({
			logged: true,
			action,
			week: '2026-W48'
		});
	});

	it('logs a move from an open week into a sent one, and out of it', () => {
		const moved = { ...open, time: inSent.time };
		expect(entryChange(open, moved, reports).logged).toBe(true);
		expect(entryChange(moved, open, reports).logged).toBe(true);
	});

	it('logs in an unlocked week too', () => {
		expect(entryChange(null, inSent, [r('unlocked')]).logged).toBe(true);
	});
});

describe('reportChange', () => {
	const draft = r('draft');
	const sent = { ...r('sent'), lastChangeId: null };
	const unlocked = { ...r('unlocked'), lastChangeId: 'log1' };
	const snapshot = {
		sentAt: 1_000,
		assignmentName: 'Exempeluppdraget',
		receiverName: 'Mottagare ett',
		codeNames: {},
		actualMinutes: 2400
	};
	const changed = (x: Report): Report => ({
		...x,
		lines: [{ receiverCodeId: 'R-arbete', minutesPerDay: [480, 480, 480, 480, 420, 0, 0] }]
	});

	it.each([
		['new draft', null, draft, { allowed: true, action: 'create', locked: false }],
		['sent at once', null, sent, { allowed: true, action: 'send', locked: false }],
		['new unlocked', null, unlocked, { allowed: false }],
		['draft changed', draft, changed(draft), { allowed: true, action: 'update', locked: false }],
		['draft sent', draft, sent, { allowed: true, action: 'send', locked: false }],
		['draft deleted', draft, null, { allowed: true, action: 'delete', locked: false }],
		['draft to unlocked', draft, unlocked, { allowed: false }],
		[
			'sent unlocked',
			sent,
			{ ...sent, status: 'unlocked', lastChangeId: 'log1' },
			{ allowed: true, action: 'unlock', locked: true }
		],
		[
			'sent unlocked from a copy with the client’s send time',
			{ ...sent, snapshot: { ...snapshot, sentAt: 2_000 } },
			{ ...sent, snapshot: { ...snapshot, sentAt: 1_000 }, status: 'unlocked' },
			{ allowed: true, action: 'unlock', locked: true }
		],
		['sent changed', sent, changed(sent), { allowed: false }],
		[
			'sent unlocked and changed',
			sent,
			changed({ ...sent, status: 'unlocked' }),
			{ allowed: false }
		],
		['sent deleted', sent, null, { allowed: false }],
		['sent to draft', sent, draft, { allowed: false }],
		[
			'unlocked changed',
			unlocked,
			changed(unlocked),
			{ allowed: true, action: 'update', locked: true }
		],
		[
			'unlocked sent again',
			unlocked,
			{ ...unlocked, status: 'sent' },
			{ allowed: true, action: 'send', locked: true }
		],
		['unlocked to draft', unlocked, { ...unlocked, status: 'draft' }, { allowed: false }],
		['unlocked deleted', unlocked, null, { allowed: false }]
	] as [string, Report | null, Report | null, object][])('%s', (_, before, after, result) => {
		expect(reportChange(before, after)).toEqual(result);
	});
});
