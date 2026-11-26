// @vitest-environment jsdom
// How the start page joins Firestore and the timer's writes (issue 18), with the data layer
// replaced: the listeners are fed made-up values and the writes are recorded. The same flows run
// against the emulators in test/e2e/timer.e2e.ts.
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Firestore } from 'firebase/firestore';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { assignment, at, code, report, work } from '../../domain/testdata.ts';
import type { Assignment, Entry, Report, TimeCode, Timer } from '../../domain/types.ts';
import { useStart } from './useStart';

const listeners = vi.hoisted(() => ({
	timer: (() => {}) as (timer: Timer | null) => void,
	latest: (() => {}) as (entries: Entry[]) => void,
	reports: (() => {}) as (reports: Report[]) => void,
	collections: new Map<string, (values: unknown[]) => void>(),
	reportsFrom: [] as string[]
}));

vi.mock('../../data/timer.ts', () => ({
	watchTimer: (_db: unknown, _uid: unknown, on: typeof listeners.timer) => {
		listeners.timer = on;
		return () => {};
	},
	watchLatestEntries: (_db: unknown, _uid: unknown, on: typeof listeners.latest) => {
		listeners.latest = on;
		return () => {};
	},
	watchReportsFrom: (_db: unknown, _uid: unknown, week: string, on: typeof listeners.reports) => {
		listeners.reportsFrom.push(week);
		listeners.reports = on;
		return () => {};
	}
}));

vi.mock('../../data/installningar.ts', () => ({
	assignmentsPath: 'assignments',
	codesPath: (id: string) => `assignments/${id}/codes`,
	watchCollection: (
		_db: unknown,
		_uid: unknown,
		path: string,
		_codec: unknown,
		on: (values: unknown[]) => void
	) => {
		listeners.collections.set(path, on);
		return () => {};
	}
}));

const writes = vi.hoisted(() => ({
	startTimer: vi.fn(),
	stopTimer: vi.fn(),
	switchTimer: vi.fn()
}));

vi.mock('../../data/skrivning.ts', () => writes);

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

const NOW = at('2026-11-25', '09:47');

beforeEach(() => {
	// Only the clock stands still; the timers run, so that Testing Library's clicks can wait.
	vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
	for (const write of Object.values(writes)) write.mockReset().mockResolvedValue(undefined);
	listeners.collections.clear();
	listeners.reportsFrom = [];
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

function Harness({ online = true }: { online?: boolean }) {
	const start = useStart({} as Firestore, 'testperson-1', online, null);
	return (
		<>
			{start.view}
			{start.action && (
				<button type="button" onClick={start.action.onPress}>
					{start.action.label}
				</button>
			)}
		</>
	);
}

const a1 = assignment({ id: 'a1', name: 'Uppdrag A' });
const codes: TimeCode[] = [
	code('c1', { name: 'Utveckling', order: 0 }),
	code('c2', { name: 'Möten', order: 1 })
];

const feed = (values: {
	timer?: Timer | null;
	assignments?: Assignment[];
	codes?: TimeCode[];
	latest?: Entry[];
}) => {
	act(() => {
		listeners.timer(values.timer ?? null);
		listeners.collections.get('assignments')?.(values.assignments ?? [a1]);
		listeners.latest(values.latest ?? []);
	});
	// The codes are followed once the assignments have come.
	act(() => {
		listeners.collections.get('assignments/a1/codes')?.(values.codes ?? codes);
		listeners.reports([]);
	});
};

const running = (start: number, codeId = 'c1'): Timer => ({
	assignmentId: 'a1',
	subject: { kind: 'code', codeId },
	start
});

const user = () => userEvent.setup();

describe('useStart', () => {
	it('offers no start until the timer, assignments and codes have come', () => {
		render(<Harness />);
		expect(screen.queryByRole('button', { name: 'Starta timern' })).toBeNull();
		act(() => listeners.timer(null));
		act(() => listeners.collections.get('assignments')!([a1]));
		expect(screen.queryByRole('button', { name: 'Starta timern' })).toBeNull();
		act(() => listeners.collections.get('assignments/a1/codes')!(codes));
		expect(screen.queryByRole('button', { name: 'Starta timern' })).toBeNull();
		act(() => listeners.reports([]));
		expect(screen.getByRole('button', { name: 'Starta timern' })).toBeTruthy();
	});

	it('starts with the latest interval’s code', async () => {
		render(<Harness />);
		feed({ latest: [work('2026-11-24', '13:00', '16:00', 'c2')] });
		expect(screen.getByRole('button', { name: /^Byt tidkod, nu Möten/ })).toBeTruthy();
		await user().click(screen.getByRole('button', { name: 'Starta timern' }));
		expect(writes.startTimer).toHaveBeenCalledWith({}, 'testperson-1', {
			assignmentId: 'a1',
			subject: { kind: 'code', codeId: 'c2' },
			start: NOW
		});
	});

	it('starts with the code picked in the list', async () => {
		const u = user();
		render(<Harness />);
		feed({});
		await u.click(screen.getByRole('button', { name: /^Byt tidkod/ }));
		await u.click(screen.getByRole('button', { name: /^Möten/ }));
		expect(writes.switchTimer).not.toHaveBeenCalled();
		await u.click(screen.getByRole('button', { name: 'Starta timern' }));
		expect(writes.startTimer.mock.calls[0]![2]).toMatchObject({
			subject: { kind: 'code', codeId: 'c2' }
		});
	});

	it('stops a running timer now, with the known reports', async () => {
		render(<Harness />);
		const timer = running(at('2026-11-25', '08:05'));
		feed({ timer });
		const reports = [report('2026-W48', 'draft', [0, 0, 0, 0, 0, 0, 0])];
		act(() => listeners.reports(reports));
		expect(listeners.reportsFrom.at(-1)).toBe('2026-W48');
		await user().click(screen.getByRole('button', { name: 'Stoppa timern' }));
		expect(writes.stopTimer).toHaveBeenCalledWith({}, 'testperson-1', timer, NOW, reports);
	});

	it('changes the code of a running timer from now', async () => {
		const u = user();
		render(<Harness />);
		const timer = running(at('2026-11-25', '08:05'));
		feed({ timer });
		await u.click(screen.getByRole('button', { name: /^Byt tidkod/ }));
		await u.click(screen.getByRole('button', { name: /^Möten/ }));
		expect(writes.switchTimer).toHaveBeenCalledWith(
			{},
			'testperson-1',
			timer,
			{ assignmentId: 'a1', subject: { kind: 'code', codeId: 'c2' } },
			NOW,
			[]
		);
	});

	it('blocks a stop into a sent week offline, and says why', async () => {
		render(<Harness online={false} />);
		feed({ timer: running(at('2026-11-25', '08:05')) });
		act(() => listeners.reports([report('2026-W48', 'sent', [0, 0, 0, 0, 0, 0, 0])]));
		await user().click(screen.getByRole('button', { name: 'Stoppa timern' }));
		expect(writes.stopTimer).not.toHaveBeenCalled();
		expect(screen.getByText('Veckan är skickad')).toBeTruthy();
	});

	it('blocks a change of code into a sent week offline', async () => {
		const u = user();
		render(<Harness online={false} />);
		feed({ timer: running(at('2026-11-25', '08:05')) });
		act(() => listeners.reports([report('2026-W48', 'sent', [0, 0, 0, 0, 0, 0, 0])]));
		await u.click(screen.getByRole('button', { name: /^Byt tidkod/ }));
		await u.click(screen.getByRole('button', { name: /^Möten/ }));
		expect(writes.switchTimer).not.toHaveBeenCalled();
		expect(screen.getByText('Veckan är skickad')).toBeTruthy();
	});

	it('says so when a write is refused', async () => {
		writes.startTimer.mockRejectedValue(new Error('permission-denied'));
		render(<Harness />);
		feed({});
		await user().click(screen.getByRole('button', { name: 'Starta timern' }));
		expect(await screen.findByText('Det gick inte att spara timern')).toBeTruthy();
	});

	it('asks a forgotten timer when the work ended, and stops at the answer', async () => {
		render(<Harness />);
		// Started 11 h 42 min before NOW: the suggestion is the start plus the eight-hour day.
		const timer = running(at('2026-11-24', '22:05'));
		feed({ timer });
		const dialog = screen.getByRole('alertdialog', { name: 'Timern har gått i 11 h 42 min' });
		expect(dialog.textContent).toContain('Den startades 22:05 i Uppdrag A · Utveckling.');
		// The suggestion stops at midnight, the end of the start day.
		await user().click(screen.getByRole('button', { name: 'Stoppa 00:00' }));
		expect(writes.stopTimer.mock.calls[0]![3]).toBe(at('2026-11-25', '00:00'));
	});

	it('lets a forgotten timer run on until the stop button asks again', async () => {
		const u = user();
		render(<Harness />);
		feed({ timer: running(at('2026-11-24', '22:05')) });
		await u.click(screen.getByRole('button', { name: 'Jag jobbar fortfarande' }));
		expect(screen.queryByRole('alertdialog')).toBeNull();
		await u.click(screen.getByRole('button', { name: 'Stoppa timern' }));
		expect(writes.stopTimer).not.toHaveBeenCalled();
		expect(screen.getByRole('alertdialog')).toBeTruthy();
	});

	it('asks a forgotten timer when the work ended before a change of code', async () => {
		const u = user();
		render(<Harness />);
		feed({ timer: running(at('2026-11-24', '22:05')) });
		await u.click(screen.getByRole('button', { name: 'Jag jobbar fortfarande' }));
		await u.click(screen.getByRole('button', { name: /^Byt tidkod/ }));
		await u.click(screen.getByRole('button', { name: /^Möten/ }));
		expect(writes.switchTimer).not.toHaveBeenCalled();
		expect(screen.getByRole('alertdialog')).toBeTruthy();
	});

	it('names a running timer whose code is archived', () => {
		render(<Harness />);
		feed({
			timer: running(at('2026-11-25', '09:00'), 'c3'),
			codes: [...codes, code('c3', { name: 'Gammal kod', archived: true })]
		});
		expect(
			screen.getByRole('button', { name: 'Byt tidkod, nu Gammal kod i Uppdrag A' })
		).toBeTruthy();
	});

	it('takes the block away when the network is back', async () => {
		const { rerender } = render(<Harness online={false} />);
		feed({ timer: running(at('2026-11-25', '08:05')) });
		act(() => listeners.reports([report('2026-W48', 'sent', [0, 0, 0, 0, 0, 0, 0])]));
		await user().click(screen.getByRole('button', { name: 'Stoppa timern' }));
		expect(screen.getByText('Veckan är skickad')).toBeTruthy();
		rerender(<Harness online />);
		expect(screen.queryByText('Veckan är skickad')).toBeNull();
	});

	it('moves the time on at each whole minute', () => {
		vi.useFakeTimers({ now: NOW });
		render(<Harness />);
		feed({ timer: running(at('2026-11-25', '09:00')) });
		expect(screen.getByText('47 min')).toBeTruthy();
		act(() => vi.advanceTimersByTime(60_000));
		expect(screen.getByText('48 min')).toBeTruthy();
	});
});
