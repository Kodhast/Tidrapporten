// @vitest-environment jsdom
// How the start page joins Firestore and the timer's writes (issues 18 and 19), with the data
// layer replaced: the listeners are fed made-up values and the writes are recorded. The same flows
// run against the emulators in test/e2e/timer.e2e.ts and test/e2e/oversikt.e2e.ts.
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import type { Firestore } from 'firebase/firestore';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	absenceTypes,
	assignment,
	at,
	code,
	receiver,
	report,
	work
} from '../../domain/testdata.ts';
import type { Assignment, Entry, Report, TimeCode, Timer } from '../../domain/types.ts';
import { pendingShortcut, type PendingShortcut, type ShortcutAction } from '../genvagar';
import { useStart } from './useStart';

const listeners = vi.hoisted(() => ({
	timer: (() => {}) as (timer: Timer | null) => void,
	entries: (() => {}) as (entries: Entry[]) => void,
	reports: (() => {}) as (reports: Report[]) => void,
	pause: (() => {}) as (paused: boolean) => void,
	collections: new Map<string, (values: unknown[]) => void>()
}));

vi.mock('../../data/timer.ts', () => ({
	watchTimer: (_db: unknown, _uid: unknown, on: typeof listeners.timer) => {
		listeners.timer = on;
		return () => {};
	},
	watchEntries: (_db: unknown, _uid: unknown, on: typeof listeners.entries) => {
		listeners.entries = on;
		return () => {};
	},
	watchReports: (_db: unknown, _uid: unknown, on: typeof listeners.reports) => {
		listeners.reports = on;
		return () => {};
	}
}));

const pauses = vi.hoisted(() => ({ setPause: vi.fn() }));

vi.mock('../../data/dag.ts', () => ({
	watchPause: (_db: unknown, _uid: unknown, _date: string, on: typeof listeners.pause) => {
		listeners.pause = on;
		return () => {};
	},
	setPause: pauses.setPause,
	newEntryId: () => 'ny1'
}));

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
		listeners.collections.set(path, on);
		return () => {};
	}
}));

const writes = vi.hoisted(() => ({
	startTimer: vi.fn(),
	stopTimer: vi.fn(),
	stopPausedTimer: vi.fn(),
	switchTimer: vi.fn(),
	pauseTimer: vi.fn(),
	moveTimerStart: vi.fn(),
	saveEntry: vi.fn()
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
	pauses.setPause.mockReset().mockResolvedValue(undefined);
	listeners.collections.clear();
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

function Harness({
	online = true,
	shortcut = null
}: {
	online?: boolean;
	shortcut?: PendingShortcut | null;
}) {
	const start = useStart({} as Firestore, 'testperson-1', online, null, shortcut);
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
	entries?: Entry[];
	reports?: Report[];
}) => {
	act(() => {
		listeners.timer(values.timer ?? null);
		listeners.collections.get('assignments')?.(values.assignments ?? [a1]);
		listeners.collections.get('absenceTypes')?.(absenceTypes);
		listeners.collections.get('freeDays')?.([]);
		listeners.entries(values.entries ?? []);
		listeners.pause(false);
	});
	// The codes and receivers are followed once the assignments have come.
	act(() => {
		listeners.collections.get('assignments/a1/codes')?.(values.codes ?? codes);
		listeners.collections.get('assignments/a1/receivers')?.([receiver()]);
		listeners.reports(values.reports ?? []);
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
		expect(screen.queryByRole('button', { name: 'Starta timern' })).toBeNull();
		act(() => listeners.entries([]));
		expect(screen.getByRole('button', { name: 'Starta timern' })).toBeTruthy();
	});

	it('starts with the latest interval’s code', async () => {
		render(<Harness />);
		feed({ entries: [work('2026-11-24', '13:00', '16:00', 'c2')] });
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
		await user().click(screen.getByRole('button', { name: 'Stoppa timern' }));
		expect(writes.stopTimer).toHaveBeenCalledWith({}, 'testperson-1', timer, NOW, reports);
	});

	describe('a pause on the timer (issue 95)', () => {
		it('puts a lunch on the running timer from now and marks the day', async () => {
			const u = user();
			render(<Harness />);
			const timer = running(at('2026-11-25', '08:05'));
			feed({ timer });
			await u.click(screen.getByRole('button', { name: 'Lunch' }));
			await u.click(screen.getByRole('button', { name: 'Lunch 09:47–10:17' }));
			expect(writes.pauseTimer).toHaveBeenCalledWith(
				{},
				'testperson-1',
				timer,
				{ from: NOW, until: at('2026-11-25', '10:17') },
				[],
				false
			);
		});

		it('leaves a day already marked as paused as it is', async () => {
			const u = user();
			render(<Harness />);
			feed({ timer: running(at('2026-11-25', '08:05')) });
			act(() => listeners.pause(true));
			await u.click(screen.getByRole('button', { name: 'Ärende' }));
			await u.click(screen.getByRole('button', { name: 'Ärende 09:47–10:17' }));
			expect(writes.pauseTimer.mock.calls[0]![5]).toBe(true);
		});

		it('shows the pause, comes back now, and stops without an interval', async () => {
			const u = user();
			render(<Harness />);
			const timer = running(at('2026-11-25', '10:15'));
			feed({ timer, entries: [{ ...work('2026-11-25', '08:05', '09:45'), id: 'timer-1' }] });
			expect(screen.getByText('Paus till 10:15')).toBeTruthy();
			expect(screen.getByText('1 h 40')).toBeTruthy();
			expect(screen.queryByRole('button', { name: 'Lunch' })).toBeNull();
			await u.click(screen.getByRole('button', { name: 'Tillbaka nu' }));
			expect(writes.moveTimerStart).toHaveBeenCalledWith({}, 'testperson-1', timer, NOW);
			await u.click(screen.getByRole('button', { name: 'Ändra pausen' }));
			await u.click(screen.getByRole('radio', { name: '1 h' }));
			await u.click(screen.getByRole('button', { name: 'Paus 09:45–10:45' }));
			expect(writes.moveTimerStart).toHaveBeenLastCalledWith(
				{},
				'testperson-1',
				timer,
				at('2026-11-25', '10:45')
			);
			await u.click(screen.getByRole('button', { name: 'Stoppa timern' }));
			expect(writes.stopPausedTimer).toHaveBeenCalledWith({}, 'testperson-1');
			expect(writes.stopTimer).not.toHaveBeenCalled();
		});

		it('stops without an interval in the pause’s last minute, from the button and the shortcut', async () => {
			const u = user();
			const timer = running(NOW + 30_000);
			render(<Harness />);
			feed({ timer });
			await u.click(screen.getByRole('button', { name: 'Stoppa timern' }));
			expect(writes.stopPausedTimer).toHaveBeenCalledTimes(1);
			cleanup();
			render(<Harness shortcut={pendingShortcut('stoppa')} />);
			feed({ timer });
			expect(writes.stopPausedTimer).toHaveBeenCalledTimes(2);
			expect(writes.stopTimer).not.toHaveBeenCalled();
		});
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

	describe('the app icon’s shortcuts (issue 59)', () => {
		const holder = (action: ShortcutAction) => pendingShortcut(action);

		it('starts once with the main button’s code, after the data has come, also in StrictMode', () => {
			const shortcut = holder('starta');
			render(
				<StrictMode>
					<Harness shortcut={shortcut} />
				</StrictMode>
			);
			expect(writes.startTimer).not.toHaveBeenCalled();
			feed({ entries: [work('2026-11-24', '13:00', '16:00', 'c2')] });
			expect(writes.startTimer).toHaveBeenCalledTimes(1);
			expect(writes.startTimer.mock.calls[0]![2]).toMatchObject({
				subject: { kind: 'code', codeId: 'c2' },
				start: NOW
			});
			expect(shortcut.action).toBeNull();
			// A new mount, as after signing out and in again, does not start again.
			cleanup();
			const { rerender } = render(<Harness shortcut={shortcut} />);
			feed({ entries: [] });
			rerender(<Harness shortcut={shortcut} />);
			expect(writes.startTimer).toHaveBeenCalledTimes(1);
		});

		it('stops a running timer, and starts none when one runs', () => {
			const timer = running(at('2026-11-25', '08:05'));
			render(<Harness shortcut={holder('stoppa')} />);
			feed({ timer });
			expect(writes.stopTimer).toHaveBeenCalledWith({}, 'testperson-1', timer, NOW, []);
			cleanup();
			render(<Harness shortcut={holder('starta')} />);
			feed({ timer });
			expect(writes.startTimer).not.toHaveBeenCalled();
		});

		it('waits for the network before a stop into a sent week', () => {
			const timer = running(at('2026-11-25', '08:05'));
			const reports = [report('2026-W48', 'sent', [0, 0, 0, 0, 0, 0, 0])];
			const shortcut = holder('stoppa');
			const { rerender } = render(<Harness online={false} shortcut={shortcut} />);
			feed({ timer, reports });
			expect(writes.stopTimer).not.toHaveBeenCalled();
			expect(shortcut.action).toBe('stoppa');
			rerender(<Harness online shortcut={shortcut} />);
			expect(writes.stopTimer).toHaveBeenCalledTimes(1);
		});

		it('asks a forgotten timer when the work ended instead of stopping', () => {
			render(<Harness shortcut={holder('stoppa')} />);
			feed({ timer: running(at('2026-11-24', '22:05')) });
			expect(writes.stopTimer).not.toHaveBeenCalled();
			expect(screen.getByRole('alertdialog')).toBeTruthy();
		});

		it('does nothing to stop when no timer runs', () => {
			render(<Harness shortcut={holder('stoppa')} />);
			feed({});
			expect(writes.stopTimer).not.toHaveBeenCalled();
			expect(writes.startTimer).not.toHaveBeenCalled();
		});
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

describe('the overview', () => {
	const weekly = assignment({ id: 'a1', name: 'Uppdrag A', startDate: '2026-11-23' });

	it('shows flex, today against the norm and today’s intervals with the timer', async () => {
		const u = user();
		render(<Harness />);
		// Monday 8 h and Tuesday 9 h, and the timer since 08:05 today (1 h 42 min): 18 h 42 min
		// against 8 + 8 + 1 h 42 min of the norm so far gives +1 h.
		feed({
			assignments: [weekly],
			timer: running(at('2026-11-25', '08:05')),
			entries: [work('2026-11-23', '08:00', '16:00'), work('2026-11-24', '08:00', '17:00')]
		});
		expect(screen.getByText('1 h 42 min av 8 h idag')).toBeTruthy();
		expect(screen.getByText('08:05–')).toBeTruthy();
		expect(screen.getByText('Pågår')).toBeTruthy();
		await u.click(screen.getByRole('button', { name: 'Flex +1,0 h' }));
		const sheet = screen.getByRole('dialog', { name: 'Flex' });
		expect(sheet.textContent).toContain('Veckan 18 h 42 min av 40 h, +1,0 h');
	});

	it('marks today’s gap as a pause', async () => {
		render(<Harness />);
		feed({
			assignments: [weekly],
			timer: running(at('2026-11-25', '09:30')),
			entries: [work('2026-11-25', '08:00', '09:00')]
		});
		expect(screen.getByText('Lucka 09:00–09:30')).toBeTruthy();
		await user().click(screen.getByRole('button', { name: 'Paus' }));
		expect(pauses.setPause).toHaveBeenCalledWith({}, 'testperson-1', '2026-11-25', true);
	});

	it('fills today’s gap in the interval sheet with the code before it', async () => {
		const u = user();
		render(<Harness />);
		feed({
			assignments: [weekly],
			timer: running(at('2026-11-25', '09:30')),
			entries: [work('2026-11-25', '08:00', '09:00', 'c2')]
		});
		await u.click(screen.getByRole('button', { name: 'Fyll i' }));
		const sheet = screen.getByRole('dialog', { name: 'Nytt intervall' });
		await u.click(within(sheet).getByRole('button', { name: 'Spara' }));
		expect(writes.saveEntry).toHaveBeenCalledWith(
			{},
			'testperson-1',
			null,
			expect.objectContaining({
				id: 'ny1',
				subject: { kind: 'code', codeId: 'c2' },
				time: { kind: 'interval', start: at('2026-11-25', '09:00'), end: at('2026-11-25', '09:30') }
			}),
			[],
			''
		);
	});

	it('counts the reports not sent for ended weeks', () => {
		render(<Harness />);
		feed({
			assignments: [assignment({ id: 'a1', name: 'Uppdrag A', startDate: '2026-11-16' })],
			entries: [work('2026-11-17', '08:00', '16:00')]
		});
		expect(screen.getByText('1 rapport ej skickad')).toBeTruthy();
	});
});
