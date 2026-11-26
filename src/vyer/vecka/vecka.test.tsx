// @vitest-environment jsdom
// The week and its reports (issue 20), with the data layer replaced: the listeners are fed
// made-up values and the writes are recorded. The same flows run against the emulators in
// test/e2e/vecka.e2e.ts.
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Firestore } from 'firebase/firestore';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { absenceTypes, assignment, at, code, receiver, work } from '../../domain/testdata.ts';
import type { Entry, Report } from '../../domain/types.ts';
import { RapportRutt, VeckaRutt } from './VeckaRutt';

const feeds = vi.hoisted(() => ({
	entries: (() => {}) as (entries: Entry[]) => void,
	reports: (() => {}) as (reports: Report[]) => void,
	collections: new Map<string, (values: unknown[]) => void>()
}));

vi.mock('../../data/dag.ts', () => ({
	watchEntriesIn: (...args: unknown[]) => {
		feeds.entries = args[4] as typeof feeds.entries;
		return () => {};
	}
}));

const writes = vi.hoisted(() => ({
	sendReport: vi.fn(),
	unlockReport: vi.fn(),
	watchWeekReports: (...args: unknown[]) => {
		feeds.reports = args[3] as (reports: Report[]) => void;
		return () => {};
	}
}));
vi.mock('../../data/reports.ts', () => writes);

vi.mock('../../data/installningar.ts', () => ({
	assignmentsPath: 'assignments',
	absenceTypesPath: 'absenceTypes',
	freeDaysPath: 'freeDays',
	codesPath: (id: string) => `assignments/${id}/codes`,
	receiversPath: (id: string) => `assignments/${id}/receivers`,
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

// Made-up week 47 of 2026 (16–22 November), seen on Wednesday 25 November.
const WEEK = '2026-W47';
const NOW = at('2026-11-25', '12:00');

beforeEach(() => {
	vi.spyOn(Date, 'now').mockReturnValue(NOW);
	writes.sendReport.mockReset().mockResolvedValue(undefined);
	writes.unlockReport.mockReset().mockResolvedValue(undefined);
	feeds.collections.clear();
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

const employer = receiver({ id: 'r1', name: 'Arbetsgivaren', position: 1 });
const customer = receiver({
	id: 'r2',
	name: 'Kund A',
	position: 2,
	suggestionMode: 'actualQuarter',
	codes: [
		{ id: 'K-utv', name: '1001 Utveckling' },
		{ id: 'K-mote', name: '1002 Möten' }
	],
	mapping: { c1: 'K-utv', c2: 'K-mote' }
});

// Monday 8:30 on Utveckling; Tuesday 6:00 on Utveckling and 2:00 on Möten: 16:30.
const entries = [
	work('2026-11-16', '08:00', '16:30', 'c1'),
	work('2026-11-17', '08:00', '14:00', 'c1'),
	work('2026-11-17', '14:00', '16:00', 'c2')
];

const sentToCustomer: Report = {
	id: `a1_r2_${WEEK}`,
	assignmentId: 'a1',
	receiverId: 'r2',
	week: WEEK,
	status: 'sent',
	mode: 'actualQuarter',
	lines: [{ receiverCodeId: 'K-utv', minutesPerDay: [510, 360, 0, 0, 0, 0, 0] }],
	snapshot: {
		sentAt: Date.UTC(2026, 10, 20, 15, 5),
		assignmentName: 'Uppdrag A',
		receiverName: 'Kund A',
		codeNames: { 'K-utv': '1001 Utv (då)' },
		actualMinutes: 990
	},
	lastChangeId: null
};

const feed = (reports: Report[] = []) => {
	act(() => {
		feeds.collections.get('assignments')?.([
			assignment({ id: 'a1', name: 'Uppdrag A', startDate: '2026-11-02' })
		]);
		feeds.collections.get('absenceTypes')?.(absenceTypes);
		feeds.collections.get('freeDays')?.([]);
		feeds.entries(entries);
		feeds.reports(reports);
	});
	act(() => {
		feeds.collections.get('assignments/a1/codes')?.([
			code('c1', { name: 'Utveckling', order: 0 }),
			code('c2', { name: 'Möten', order: 1 })
		]);
		feeds.collections.get('assignments/a1/receivers')?.([customer, employer]);
	});
};

const report = (props: { transcript?: boolean; online?: boolean } = {}) => (
	<RapportRutt
		db={{} as Firestore}
		uid="testperson-1"
		week={WEEK}
		assignmentId="a1"
		receiverId="r2"
		transcript={props.transcript ?? false}
		online={props.online ?? true}
	/>
);

describe('VeckaRutt', () => {
	it('shows the week, its numbers and each receiver in the chain order', () => {
		render(<VeckaRutt db={{} as Firestore} uid="testperson-1" week={WEEK} />);
		feed([sentToCustomer]);
		expect(screen.getByText('Vecka 47 · 16–22 nov')).toBeTruthy();
		expect(screen.getByText('1 rapport att skicka')).toBeTruthy();
		// 16:30 actual against a 40-hour norm: the open week has ended, −23,5 h.
		expect(screen.getByText('16,5 h')).toBeTruthy();
		expect(screen.getByText('40 h')).toBeTruthy();
		expect(screen.getByText('−23,5 h')).toBeTruthy();
		const rows = screen.getAllByRole('link', { name: /·/ });
		expect(rows.map((r) => r.textContent)).toEqual([
			'1 · Arbetsgivaren16 h föreslagetEj skickad',
			'2 · Kund A14,5 h · skickad fre 20 novLåst'
		]);
		expect(rows[1]!.getAttribute('href')).toBe(`#/vecka/${WEEK}/a1/r2/avskrift`);
	});
});

describe('RapportRutt', () => {
	it('suggests, takes changes, keeps them in the transcript and sends', async () => {
		const user = userEvent.setup();
		const { rerender } = render(report());
		feed();
		expect(screen.getByRole('heading', { name: 'Kund A · vecka 47' })).toBeTruthy();
		// Per quarter: 14,5 h on Utveckling, 2 h on Möten, but 16 h (filled) to the employer.
		expect(screen.getByText('16,5 h, men 16 h till Arbetsgivaren')).toBeTruthy();
		expect(screen.getByText('Från Utveckling')).toBeTruthy();

		await user.click(screen.getByRole('radio', { name: 'Fyll mot normen' }));
		expect(screen.getByText('16 h, samma som till Arbetsgivaren')).toBeTruthy();
		await user.click(screen.getByRole('button', { name: 'Öka 1002 Möten' }));
		expect(screen.getByText('16,25 h, men 16 h till Arbetsgivaren')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Visa avskriften' }).getAttribute('href')).toBe(
			`#/vecka/${WEEK}/a1/r2/avskrift`
		);

		rerender(report({ transcript: true }));
		const table = screen.getByRole('table');
		const cells = (name: string) =>
			within(within(table).getByRole('row', { name: new RegExp(`^${name}`) }))
				.getAllByRole('cell')
				.map((c) => c.textContent);
		// Filled: Monday 8, Tuesday 6; Möten 2 + the quarter on Tuesday.
		expect(cells('1001 Utveckling')).toEqual(['8', '6', '–', '–', '–', '14']);
		expect(cells('1002 Möten')).toEqual(['–', '2,25', '–', '–', '–', '2,25']);
		expect(cells('Totalt')).toEqual(['8', '8,25', '–', '–', '–', '16,25']);
		expect(screen.getByText('Lördag och söndag')).toBeTruthy();

		await user.click(screen.getByRole('button', { name: 'Markera som skickad' }));
		expect(writes.sendReport).toHaveBeenCalledOnce();
		const [, uid, sent, before] = writes.sendReport.mock.calls[0]!;
		expect(uid).toBe('testperson-1');
		expect(before).toBeNull();
		expect(sent).toMatchObject({
			id: `a1_r2_${WEEK}`,
			status: 'sent',
			mode: 'fillNorm',
			lines: [
				{ receiverCodeId: 'K-utv', minutesPerDay: [480, 360, 0, 0, 0, 0, 0] },
				{ receiverCodeId: 'K-mote', minutesPerDay: [0, 135, 0, 0, 0, 0, 0] }
			],
			snapshot: {
				assignmentName: 'Uppdrag A',
				receiverName: 'Kund A',
				codeNames: { 'K-utv': '1001 Utveckling', 'K-mote': '1002 Möten' },
				actualMinutes: 990
			}
		});
	});

	it('shows a sent report as it was sent and unlocks it with a reason', async () => {
		const user = userEvent.setup();
		render(report());
		feed([sentToCustomer]);
		expect(screen.getByText('Skickad fre 20 nov 16:05 · låst')).toBeTruthy();
		// The code's name as it was when sent.
		expect(screen.getByRole('rowheader', { name: '1001 Utv (då)' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Markera som skickad' })).toBeNull();

		await user.click(screen.getByRole('button', { name: 'Lås upp' }));
		const dialog = screen.getByRole('alertdialog', { name: 'Lås upp rapporten?' });
		const confirm = within(dialog).getByRole('button', { name: 'Lås upp' });
		expect(confirm.hasAttribute('disabled')).toBe(true);
		await user.type(within(dialog).getByRole('textbox', { name: 'Skäl' }), 'Fel tidkod');
		await user.click(confirm);
		expect(writes.unlockReport).toHaveBeenCalledWith(
			expect.anything(),
			'testperson-1',
			sentToCustomer,
			'Fel tidkod'
		);
		// Back to the report, now that it can be changed.
		await vi.waitFor(() => expect(window.location.hash).toBe(`#/vecka/${WEEK}/a1/r2`));
	});

	it('starts an unlocked report from what was sent and sends it again with the stored one', async () => {
		const user = userEvent.setup();
		const unlocked = { ...sentToCustomer, status: 'unlocked' as const, lastChangeId: 'log-1' };
		render(report({ transcript: true }));
		feed([unlocked]);
		expect(screen.getByText('Upplåst')).toBeTruthy();
		await user.click(screen.getByRole('button', { name: 'Markera som skickad' }));
		const [, , sent, before] = writes.sendReport.mock.calls[0]!;
		expect(before).toBe(unlocked);
		expect(sent).toMatchObject({
			lines: unlocked.lines,
			lastChangeId: 'log-1',
			mode: 'actualQuarter'
		});
	});

	it('does not send or unlock offline', () => {
		const { rerender } = render(report({ transcript: true, online: false }));
		feed();
		expect(screen.getByText('Ingen anslutning')).toBeTruthy();
		expect(
			screen.getByRole('button', { name: 'Markera som skickad' }).hasAttribute('disabled')
		).toBe(true);
		act(() => feeds.reports([sentToCustomer]));
		rerender(report({ transcript: true, online: false }));
		expect(screen.getByRole('button', { name: 'Lås upp' }).hasAttribute('disabled')).toBe(true);
	});

	it('says when a send fails', async () => {
		const user = userEvent.setup();
		writes.sendReport.mockRejectedValue(new Error('unavailable'));
		render(report({ transcript: true }));
		feed();
		await user.click(screen.getByRole('button', { name: 'Markera som skickad' }));
		expect(await screen.findByText('Det gick inte att skicka')).toBeTruthy();
	});
});
