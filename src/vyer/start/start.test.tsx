// @vitest-environment jsdom
// The start page's timer (issue 18) with made-up data, in jsdom with Testing Library. Start, stop,
// the change of code and offline run against the emulators in test/e2e/timer.e2e.ts.
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { assignment, at, code } from '../../domain/testdata.ts';
import { timerCodeGroups } from '../../domain/timer.ts';
import type { Timer } from '../../domain/types.ts';
import { StartVy, type StartVyProps } from './StartVy';

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
		expect(screen.getByText('Timern står still')).toBeTruthy();
	});

	it('shows the running time without seconds and when it started', () => {
		render(<StartVy {...props({ timer: running })} />);
		expect(screen.getByRole('button', { name: /^Byt tidkod, nu Utveckling/ })).toBeTruthy();
		expect(screen.getByText('1 h 42')).toBeTruthy();
		expect(screen.getByText('Startad 08:05 · Uppdrag A')).toBeTruthy();
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

	it('offers to add an assignment when there is none', () => {
		render(<StartVy {...props({ groups: [], next: null })} />);
		expect(screen.getByText('Inga uppdrag än')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Lägg till uppdrag' }).getAttribute('href')).toBe(
			'#/installningar/uppdrag/ny'
		);
	});

	it('shows neither the timer nor the empty state while loading', () => {
		render(<StartVy {...props({ groups: [], next: null, loading: true })} />);
		expect(screen.queryByText('Inga uppdrag än')).toBeNull();
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
