// @vitest-environment jsdom
// The start page's timer (issue 18) with made-up data, in jsdom with Testing Library. Start, stop,
// the change of code and offline run against the emulators in test/e2e/timer.e2e.ts.
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { dayRows } from '../../domain/dag.ts';
import type { Billing } from '../../domain/debitering.ts';
import type { Overview } from '../../domain/oversikt.ts';
import { assignment, at, code, work } from '../../domain/testdata.ts';
import { timerCodeGroups } from '../../domain/timer.ts';
import type { Timer } from '../../domain/types.ts';
import { StartVy, type StartDay, type StartVyProps } from './StartVy';

beforeAll(() => {
	// jsdom has <dialog> but not showModal() or close(), which the sheets use (web-ui-react 0002).
	HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
		this.setAttribute('open', '');
	};
	HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
		if (!this.hasAttribute('open')) return;
		this.removeAttribute('open');
		this.dispatchEvent(new Event('close'));
	};
});

afterEach(cleanup);

const groups = timerCodeGroups(
	[
		assignment({ id: 'a1', name: 'Uppdrag A', order: 0 }),
		assignment({ id: 'a2', name: 'Uppdrag B', order: 1 })
	],
	{
		a1: [code('c1', { name: 'Utveckling', order: 0 }), code('c2', { name: 'Möten', order: 1 })],
		a2: [code('c9', { assignmentId: 'a2', name: 'Förvaltning' })]
	},
	'2026-11-25'
);

const start = at('2026-11-25', '08:05');
const running: Timer = { assignmentId: 'a1', subject: { kind: 'code', codeId: 'c1' }, start };

const props = (overrides: Partial<StartVyProps> = {}): StartVyProps => ({
	today: '2026-11-25',
	now: at('2026-11-25', '09:47'),
	timer: null,
	timerNames: { code: 'Utveckling', assignment: 'Uppdrag A' },
	groups,
	next: { assignmentId: 'a1', codeId: 'c2' },
	online: true,
	problem: null,
	onChoose: () => {},
	forgotten: null,
	...overrides
});

describe('StartVy', () => {
	it('says the day and the week in the header', () => {
		render(<StartVy {...props()} />);
		expect(screen.getByRole('heading', { level: 1, name: 'Idag' })).toBeTruthy();
		expect(screen.getByText('Onsdag 25 november · vecka 48')).toBeTruthy();
	});

	it('shows the code a start uses while the timer stands still', () => {
		render(<StartVy {...props()} />);
		expect(screen.getByRole('button', { name: 'Byt tidkod, nu Möten i Uppdrag A' })).toBeTruthy();
		expect(screen.getByText('0 min')).toBeTruthy();
	});

	it('shows the running time without seconds', () => {
		render(<StartVy {...props({ timer: running })} />);
		expect(screen.getByRole('button', { name: /^Byt tidkod, nu Utveckling/ })).toBeTruthy();
		expect(screen.getByText('1 h 42')).toBeTruthy();
	});

	it('lists the codes per assignment and chooses another', async () => {
		const user = userEvent.setup();
		const onChoose = vi.fn();
		render(<StartVy {...props({ timer: running, onChoose })} />);
		await user.click(screen.getByRole('button', { name: /^Byt tidkod/ }));
		const sheet = screen.getByRole('dialog', { name: 'Välj tidkod' });
		expect(within(sheet).getByText('Timern fortsätter med den nya koden från nu.')).toBeTruthy();
		expect(within(sheet).getByRole('heading', { name: 'Uppdrag B' })).toBeTruthy();
		expect(within(sheet).getByRole('button', { name: /^Utveckling/ }).textContent).toContain(
			'Vald'
		);
		await user.click(within(sheet).getByRole('button', { name: /^Förvaltning/ }));
		expect(onChoose).toHaveBeenCalledWith({ assignmentId: 'a2', codeId: 'c9' });
	});

	it('does nothing when the chosen code is chosen again', async () => {
		const user = userEvent.setup();
		const onChoose = vi.fn();
		render(<StartVy {...props({ timer: running, onChoose })} />);
		await user.click(screen.getByRole('button', { name: /^Byt tidkod/ }));
		await user.click(screen.getByRole('button', { name: /^Utveckling/ }));
		expect(onChoose).not.toHaveBeenCalled();
	});

	it('offers the start at first use when there is no assignment (issue 64)', () => {
		render(<StartVy {...props({ groups: [], next: null })} />);
		expect(screen.getByText(/Fyra steg/)).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Kom igång' }).getAttribute('href')).toBe(
			'#/kom-igang'
		);
	});

	it('shows neither the timer nor the empty state while loading', () => {
		render(<StartVy {...props({ groups: [], next: null, loading: true })} />);
		expect(screen.queryByText(/Fyra steg/)).toBeNull();
		expect(screen.queryByRole('button', { name: /^Byt tidkod/ })).toBeNull();
	});

	it('says when it is offline, when a stop must wait and when a save failed', () => {
		const { rerender } = render(<StartVy {...props({ online: false })} />);
		expect(screen.getByText('Ingen anslutning')).toBeTruthy();
		rerender(<StartVy {...props({ problem: 'blocked' })} />);
		expect(screen.queryByText('Ingen anslutning')).toBeNull();
		expect(screen.getByText('Veckan är skickad')).toBeTruthy();
		rerender(<StartVy {...props({ problem: 'failed' })} />);
		expect(screen.getByText('Det gick inte att spara timern')).toBeTruthy();
	});
});

describe('the overview', () => {
	const a1 = groups[0]!.assignment;
	const a2 = groups[1]!.assignment;
	const overview = (total: number, unsent: number): Overview => ({
		total,
		perAssignment: [
			{ assignment: a1, balance: 480, weekFlex: 60, weekActual: 1122, weekNorm: 2400 },
			{ assignment: a2, balance: total - 480, weekFlex: 0, weekActual: 0, weekNorm: 0 }
		],
		todayActual: 315,
		todayNorm: 480,
		unsent
	});
	const earlier = work('2026-11-25', '08:12', '09:00', 'c2');
	const timerEntry = { ...work('2026-11-25', '09:00', '09:47'), id: 'timer-1' };
	const day = (paused = false): StartDay => ({
		rows: dayRows([earlier, timerEntry], '2026-11-25').reverse(),
		arcs: [
			{ from: 30, degrees: 20, colour: 2, running: false },
			{ from: 50, degrees: 19.6, colour: 1, running: true }
		],
		paused,
		runningId: 'timer-1',
		describe: (e) =>
			e.subject.kind === 'code' && e.subject.codeId === 'c2' ? 'Möten' : 'Utveckling',
		accent: () => 'accent-kod-1'
	});

	it('shows the flex on the first row (not in the header) and per assignment in a sheet', async () => {
		const user = userEvent.setup();
		render(<StartVy {...props({ overview: overview(390, 0) })} />);
		const pill = screen.getByRole('button', { name: 'Flex +6,5 h' });
		expect(pill.className).toContain('ton-ok');
		expect(pill.closest('kh-header')).toBeNull();
		expect(pill.closest('.innehall > .flexrad')).not.toBeNull();
		await user.click(pill);
		const sheet = screen.getByRole('dialog', { name: 'Flex' });
		expect(within(sheet).getByText('Veckan 18 h 42 min av 40 h, +1,0 h')).toBeTruthy();
		expect(within(sheet).getByText('−1,5 h')).toBeTruthy();
		// An ended assignment has no week to show.
		expect(within(sheet).queryByText(/Veckan 0 min/)).toBeNull();
		await user.click(within(sheet).getByRole('button', { name: 'Stäng' }));
		expect(screen.queryByRole('dialog', { name: 'Flex' })).toBeNull();
	});

	it('shows the week’s billing rate beside the flex and per assignment in a sheet (issue 23)', async () => {
		const user = userEvent.setup();
		const billing: Billing = {
			week: { billable: 1590, worked: 1800 },
			month: { billable: 5760, worked: 6720 },
			perAssignment: [
				{
					assignment: a1,
					week: { billable: 1590, worked: 1800 },
					month: { billable: 5520, worked: 6480 }
				},
				{ assignment: a2, week: { billable: 0, worked: 0 }, month: { billable: 240, worked: 240 } }
			]
		};
		render(<StartVy {...props({ overview: overview(390, 0), billing })} />);
		const pill = screen.getByRole('button', { name: 'Debiterat 88 %' });
		expect(pill.className).not.toMatch(/ton-/);
		expect(pill.closest('.flexrad')).toBe(
			screen.getByRole('button', { name: 'Flex +6,5 h' }).closest('.flexrad')
		);
		await user.click(pill);
		const sheet = screen.getByRole('dialog', { name: 'Debitering' });
		expect(within(sheet).getByText('vecka 48')).toBeTruthy();
		expect(within(sheet).getByText('86 %')).toBeTruthy();
		expect(
			within(sheet).getByText('Veckan 26 h 30 min av 30 h · november 92 h av 108 h')
		).toBeTruthy();
		expect(within(sheet).getByText('Veckan ingen tid · november 4 h av 4 h')).toBeTruthy();
		expect(within(sheet).getByText('–')).toBeTruthy();
		await user.click(within(sheet).getByRole('button', { name: 'Stäng' }));
		expect(screen.queryByRole('dialog', { name: 'Debitering' })).toBeNull();
	});

	it('leaves out the billing rate without worked time', () => {
		const none = { billable: 0, worked: 0 };
		render(
			<StartVy
				{...props({
					overview: overview(390, 0),
					billing: { week: none, month: none, perAssignment: [] }
				})}
			/>
		);
		expect(screen.queryByRole('button', { name: /Debiterat/ })).toBeNull();
	});

	it('warns of a negative flex and the reports not sent', () => {
		const { rerender } = render(<StartVy {...props({ overview: overview(-90, 2) })} />);
		expect(screen.getByRole('button', { name: 'Flex −1,5 h' }).className).toContain('ton-varning');
		expect(screen.getByText('2 rapporter ej skickade')).toBeTruthy();
		rerender(<StartVy {...props({ overview: overview(-90, 0) })} />);
		expect(screen.queryByText(/ej skickad/)).toBeNull();
	});

	it('shows today against the norm, the wheel and today’s rows newest first', () => {
		const { container } = render(
			<StartVy {...props({ timer: running, overview: overview(0, 0), day: day() })} />
		);
		expect(screen.getByText('5 h 15 min av 8 h idag')).toBeTruthy();
		// The track, two arcs and the running timer's dot.
		expect(container.querySelectorAll('.hjul__ring circle')).toHaveLength(4);
		const links = screen.getAllByRole('link');
		expect(links.map((l) => l.textContent)).toEqual([
			expect.stringContaining('09:00–'),
			expect.stringContaining('08:12–09:00'),
			'Visa dagen'
		]);
		expect(links[0]!.getAttribute('href')).toBe('#/dag/2026-11-25');
		expect(screen.getByText('Pågår')).toBeTruthy();
	});

	it('opens the start dialog from the running row when it can (issue 78)', async () => {
		const user = userEvent.setup();
		const onMoveStart = vi.fn();
		render(
			<StartVy {...props({ timer: running, overview: overview(0, 0), day: day(), onMoveStart })} />
		);
		const row = screen.getByRole('button', { name: /09:00–/ });
		await user.click(row);
		expect(onMoveStart).toHaveBeenCalledOnce();
		// The other rows still link to the day.
		expect(screen.getAllByRole('link').map((l) => l.textContent)).toEqual([
			expect.stringContaining('08:12–09:00'),
			'Visa dagen'
		]);
	});

	it('marks a gap as a pause and fills it', async () => {
		const user = userEvent.setup();
		const onPause = vi.fn();
		const onFill = vi.fn();
		const gappy: StartDay = {
			...day(),
			rows: dayRows(
				[
					earlier,
					{
						...timerEntry,
						time: {
							kind: 'interval',
							start: at('2026-11-25', '09:30'),
							end: at('2026-11-25', '09:47')
						}
					}
				],
				'2026-11-25'
			).reverse()
		};
		render(<StartVy {...props({ overview: overview(0, 0), day: gappy, onPause, onFill })} />);
		await user.click(screen.getByRole('button', { name: 'Paus' }));
		expect(onPause).toHaveBeenCalledWith(true);
		await user.click(screen.getByRole('button', { name: 'Fyll i' }));
		expect(onFill).toHaveBeenCalledWith(
			expect.objectContaining({ start: at('2026-11-25', '09:00') })
		);
	});
});

describe('the forgotten timer', () => {
	const now = at('2026-11-25', '19:25');
	const forgotten = (onStop = vi.fn(), onDismiss = vi.fn()) =>
		props({
			timer: running,
			now,
			forgotten: {
				name: 'Uppdrag A · Utveckling',
				suggestion: at('2026-11-25', '16:05'),
				workday: 480,
				onStop,
				onDismiss
			}
		});

	it('asks when the work ended, with the suggestion', () => {
		render(<StartVy {...forgotten()} />);
		const dialog = screen.getByRole('alertdialog', { name: 'Timern har gått i 11 h 20 min' });
		expect(
			within(dialog).getByText('Den startades 08:05 i Uppdrag A · Utveckling. När slutade du?')
		).toBeTruthy();
		expect((within(dialog).getByLabelText('Sluttid') as HTMLInputElement).value).toBe('16:05');
		expect(within(dialog).getByText('Förval: starten plus en arbetsdag (8 h)')).toBeTruthy();
	});

	it('stops at the time typed', async () => {
		const user = userEvent.setup();
		const onStop = vi.fn();
		render(<StartVy {...forgotten(onStop)} />);
		const field = screen.getByLabelText('Sluttid');
		await user.clear(field);
		await user.type(field, '17:30');
		await user.click(screen.getByRole('button', { name: 'Stoppa 17:30' }));
		expect(onStop).toHaveBeenCalledWith(at('2026-11-25', '17:30'));
	});

	it('cannot stop at a time that cannot be', async () => {
		const user = userEvent.setup();
		render(<StartVy {...forgotten()} />);
		const field = screen.getByLabelText('Sluttid');
		await user.clear(field);
		await user.type(field, '20:00');
		expect(screen.getByText('Sluttiden kan inte vara senare än nu')).toBeTruthy();
		expect((screen.getByRole('button', { name: 'Stoppa' }) as HTMLButtonElement).disabled).toBe(
			true
		);
	});

	it('lets the timer run on', async () => {
		const user = userEvent.setup();
		const onDismiss = vi.fn();
		render(<StartVy {...forgotten(vi.fn(), onDismiss)} />);
		await user.click(screen.getByRole('button', { name: 'Jag jobbar fortfarande' }));
		expect(onDismiss).toHaveBeenCalledOnce();
	});
});
