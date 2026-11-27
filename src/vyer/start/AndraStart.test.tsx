// @vitest-environment jsdom
// The dialog that moves the running timer's start (issue 78), with made-up data in jsdom.
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { at, work } from '../../domain/testdata.ts';
import type { Timer } from '../../domain/types.ts';
import { turnWheels } from '../tidshjul.test-helper.ts';
import { AndraStart, type AndraStartProps } from './AndraStart';

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

afterEach(cleanup);

const running: Timer = {
	assignmentId: 'a1',
	subject: { kind: 'code', codeId: 'c1' },
	start: at('2026-11-25', '12:30')
};

const props = (overrides: Partial<AndraStartProps> = {}): AndraStartProps => ({
	timer: running,
	now: at('2026-11-25', '14:12'),
	name: 'Uppdrag A · Utveckling',
	suggestion: at('2026-11-25', '11:45'),
	entries: [work('2026-11-25', '09:00', '11:45')],
	online: true,
	onSave: () => {},
	onClose: () => {},
	...overrides
});

const wheel = (name: 'timme' | 'minut') =>
	screen.getByRole('spinbutton', { name: `Starttid, ${name}` });
const turnTo = (user: ReturnType<typeof userEvent.setup>, time: string) =>
	turnWheels(user, time, { hourName: 'Starttid, timme', minuteName: 'Starttid, minut' });

describe('AndraStart', () => {
	it('asks for the start with the suggestion and what the timer will show', () => {
		render(<AndraStart {...props()} />);
		const dialog = screen.getByRole('alertdialog', { name: 'Ändra starttid' });
		expect(
			within(dialog).getByText('Timern går i Uppdrag A · Utveckling sedan 12:30. När började du?')
		).toBeTruthy();
		expect(wheel('timme').getAttribute('aria-valuetext')).toBe('11');
		expect(wheel('minut').getAttribute('aria-valuetext')).toBe('45');
		expect(within(dialog).getByText('Timern visar då 2 h 27')).toBeTruthy();
		expect(within(dialog).queryByText(/Överlappar/)).toBeNull();
	});

	it('keeps the seconds of the suggestion, so that the timer meets the interval before it', async () => {
		const user = userEvent.setup();
		const onSave = vi.fn();
		const end = at('2026-11-25', '11:45') + 25_000;
		const before = {
			...work('2026-11-25', '09:00', '11:45'),
			time: { kind: 'interval' as const, start: at('2026-11-25', '09:00'), end }
		};
		render(<AndraStart {...props({ suggestion: end, entries: [before], onSave })} />);
		expect(screen.queryByText(/Överlappar/)).toBeNull();
		await user.click(screen.getByRole('button', { name: 'Spara 11:45' }));
		expect(onSave).toHaveBeenCalledWith(end);
	});

	it('saves the time turned to', async () => {
		const user = userEvent.setup();
		const onSave = vi.fn();
		render(<AndraStart {...props({ onSave })} />);
		await turnTo(user, '12:15');
		await user.click(screen.getByRole('button', { name: 'Spara 12:15' }));
		expect(onSave).toHaveBeenCalledWith(at('2026-11-25', '12:15'));
	});

	it('warns of an overlap but lets it be saved', async () => {
		const user = userEvent.setup();
		render(<AndraStart {...props()} />);
		await turnTo(user, '10:30');
		expect(screen.getByText('Överlappar 09:00–11:45')).toBeTruthy();
		expect(
			(screen.getByRole('button', { name: 'Spara 10:30' }) as HTMLButtonElement).disabled
		).toBe(false);
	});

	it('cannot save a start later than now', async () => {
		const user = userEvent.setup();
		render(<AndraStart {...props()} />);
		await turnTo(user, '14:30');
		expect(screen.getByText('Starttiden kan inte vara senare än nu')).toBeTruthy();
		expect((screen.getByRole('button', { name: 'Spara' }) as HTMLButtonElement).disabled).toBe(
			true
		);
	});

	it('cannot save onto the start of another interval from the timer', async () => {
		const user = userEvent.setup();
		const taken = at('2026-11-25', '10:00');
		const earlier = { ...work('2026-11-25', '10:00', '11:00'), id: `timer-${taken}` };
		render(<AndraStart {...props({ entries: [earlier] })} />);
		await turnTo(user, '10:00');
		expect(screen.getByText('Ett annat intervall från timern börjar på samma tid')).toBeTruthy();
	});

	it('cannot save without the network', () => {
		render(<AndraStart {...props({ online: false })} />);
		expect(screen.getByText('Ingen uppkoppling')).toBeTruthy();
		expect(
			(screen.getByRole('button', { name: 'Spara 11:45' }) as HTMLButtonElement).disabled
		).toBe(true);
	});

	it('closes on Avbryt', async () => {
		const user = userEvent.setup();
		const onClose = vi.fn();
		render(<AndraStart {...props({ onClose })} />);
		await user.click(screen.getByRole('button', { name: 'Avbryt' }));
		expect(onClose).toHaveBeenCalled();
	});
});
