// @vitest-environment jsdom
// How the day view joins Firestore (issue 29), with the data layer replaced: the listeners are fed
// made-up values and the writes are recorded. The same flows run against the emulators in
// test/e2e/dag.e2e.ts.
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Firestore } from 'firebase/firestore';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { absenceTypes, assignment, at, code, report, work } from '../../domain/testdata.ts';
import type { Entry, Report } from '../../domain/types.ts';
import { DagRutt } from './DagRutt';

const feeds = vi.hoisted(() => ({
	day: (() => {}) as (entries: Entry[]) => void,
	pause: (() => {}) as (paused: boolean) => void,
	reports: (() => {}) as (reports: Report[]) => void,
	reportsFrom: '' as string,
	collections: new Map<string, (values: unknown[]) => void>()
}));

vi.mock('../../data/dag.ts', () => ({
	watchDayEntries: (_db: unknown, _uid: unknown, _date: unknown, on: typeof feeds.day) => {
		feeds.day = on;
		return () => {};
	},
	watchPause: (_db: unknown, _uid: unknown, _date: unknown, on: typeof feeds.pause) => {
		feeds.pause = on;
		return () => {};
	},
	newEntryId: () => 'ny-1',
	setPause: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../../data/timer.ts', () => ({
	watchReportsFrom: (_db: unknown, _uid: unknown, week: string, on: typeof feeds.reports) => {
		feeds.reportsFrom = week;
		feeds.reports = on;
		return () => {};
	}
}));

vi.mock('../../data/installningar.ts', () => ({
	assignmentsPath: 'assignments',
	absenceTypesPath: 'absenceTypes',
	codesPath: (id: string) => `assignments/${id}/codes`,
	watchCollection: (
		_db: unknown,
		_uid: unknown,
		path: string,
		_codec: unknown,
		on: (values: unknown[]) => void
	) => {
		feeds.collections.set(path, on);
		return () => {};
	}
}));

const writes = vi.hoisted(() => ({ saveEntry: vi.fn() }));
vi.mock('../../data/skrivning.ts', () => writes);

const { setPause } = await import('../../data/dag.ts');

beforeAll(() => {
	HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
		this.setAttribute('open', '');
	};
	HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
		if (!this.hasAttribute('open')) return;
		this.removeAttribute('open');
		this.dispatchEvent(new Event('close'));
	};
});

beforeEach(() => {
	writes.saveEntry.mockReset().mockResolvedValue(undefined);
	vi.mocked(setPause).mockClear();
	feeds.collections.clear();
});

afterEach(cleanup);

const DAY = '2026-11-24';

const feed = (entries: Entry[], reports: Report[] = []) => {
	act(() => {
		feeds.collections.get('assignments')?.([assignment({ id: 'a1', name: 'Uppdrag A' })]);
		feeds.collections.get('absenceTypes')?.(absenceTypes);
		feeds.day(entries);
		feeds.pause(false);
		feeds.reports(reports);
	});
	act(() => {
		feeds.collections.get('assignments/a1/codes')?.([
			code('c1', { name: 'Utveckling', order: 0 }),
			code('c2', { name: 'Möten', order: 1 })
		]);
	});
};

const harness = (online = true) =>
	render(<DagRutt db={{} as Firestore} uid="testperson-1" date={DAY} online={online} />);

describe('DagRutt', () => {
	it('shows the day with names once everything has come', () => {
		harness();
		expect(screen.queryByText('Ingen tid den här dagen.')).toBeNull();
		// An interval from the day before that ends before the day is not on it.
		feed([work(DAY, '08:00', '09:00', 'c2'), work('2026-11-23', '08:00', '09:00')]);
		expect(screen.getByText('Uppdrag A · Möten')).toBeTruthy();
		expect(screen.getAllByRole('button', { name: /–/ })).toHaveLength(1);
	});

	it('fills a gap with the code before it and saves with the known reports', async () => {
		const reports = [report('2026-W48', 'draft', [0, 0, 0, 0, 0, 0, 0])];
		harness();
		feed([work(DAY, '08:00', '11:45', 'c2'), work(DAY, '12:30', '16:00')], reports);
		await userEvent.click(screen.getByRole('button', { name: 'Fyll i' }));
		await userEvent.click(screen.getByRole('button', { name: 'Spara' }));
		expect(writes.saveEntry).toHaveBeenCalledWith(
			{},
			'testperson-1',
			null,
			{
				id: 'ny-1',
				assignmentId: 'a1',
				subject: { kind: 'code', codeId: 'c2' },
				time: { kind: 'interval', start: at(DAY, '11:45'), end: at(DAY, '12:30') },
				note: ''
			},
			reports,
			''
		);
	});

	it('reads the reports from the week of the day before, for an interval from Sunday', () => {
		render(<DagRutt db={{} as Firestore} uid="testperson-1" date="2026-11-23" online />);
		// Monday 23 November is in week 48; Sunday the 22nd in week 47.
		expect(feeds.reportsFrom).toBe('2026-W47');
	});

	it('marks the day’s gaps as pauses', async () => {
		harness();
		feed([work(DAY, '08:00', '11:45'), work(DAY, '12:30', '16:00')]);
		await userEvent.click(screen.getByRole('button', { name: 'Paus' }));
		expect(setPause).toHaveBeenCalledWith({}, 'testperson-1', DAY, true);
	});

	it('opens an interval and adds one with the latest code', async () => {
		harness();
		feed([work(DAY, '08:00', '09:00', 'c2')]);
		await userEvent.click(screen.getByRole('button', { name: /08:00–09:00/ }));
		expect(screen.getByRole('dialog', { name: 'Ändra intervall' })).toBeTruthy();
		await userEvent.keyboard('{Escape}');
		await userEvent.click(screen.getByRole('button', { name: 'Lägg till intervall' }));
		expect(screen.getByRole('button', { name: 'Möten' }).getAttribute('aria-pressed')).toBe('true');
	});

	it('says so when a save fails', async () => {
		writes.saveEntry.mockRejectedValue(new Error('permission-denied'));
		harness();
		feed([work(DAY, '08:00', '11:45'), work(DAY, '12:30', '16:00')]);
		await userEvent.click(screen.getByRole('button', { name: 'Fyll i' }));
		await userEvent.click(screen.getByRole('button', { name: 'Spara' }));
		expect(await screen.findByText('Det gick inte att spara')).toBeTruthy();
	});

	it('steps to another day in the address', async () => {
		harness();
		feed([]);
		await userEvent.click(screen.getByRole('button', { name: 'Nästa dag' }));
		expect(location.hash).toBe('#/dag/2026-11-25');
	});
});
