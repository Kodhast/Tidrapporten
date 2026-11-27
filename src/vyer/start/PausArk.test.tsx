// @vitest-environment jsdom
// The sheet that puts a lunch or an errand on the running timer (issue 95), with made-up data in jsdom.
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { at } from '../../domain/testdata.ts';
import type { Timer } from '../../domain/types.ts';
import { pickTime } from '../tidshjul.test-helper.ts';
import { lastLength, PausArk, type PausArkProps } from './PausArk';

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

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const running: Timer = {
	assignmentId: 'a1',
	subject: { kind: 'code', codeId: 'c1' },
	start: at('2026-11-25', '08:15')
};

const props = (overrides: Partial<PausArkProps> = {}): PausArkProps => ({
	kind: 'lunch',
	timer: running,
	now: at('2026-11-25', '11:52'),
	code: 'Utveckling',
	online: true,
	onSave: () => {},
	onClose: () => {},
	...overrides
});

const sheet = (name: string) => screen.getByRole('dialog', { name });

describe('PausArk', () => {
	it('starts a lunch now, 30 minutes long, and says what it does', async () => {
		const user = userEvent.setup();
		const onSave = vi.fn();
		const onClose = vi.fn();
		render(<PausArk {...props({ onSave, onClose })} />);
		const lunch = sheet('Lunch');
		expect(
			within(lunch).getByText(
				'Räknas av från Utveckling. Timern fortsätter själv när pausen är slut.'
			)
		).toBeTruthy();
		expect(within(lunch).getByRole('radio', { name: '30 min' }).getAttribute('aria-checked')).toBe(
			'true'
		);
		await user.click(within(lunch).getByRole('button', { name: 'Lunch 11:52–12:22' }));
		expect(onSave).toHaveBeenCalledWith({
			from: at('2026-11-25', '11:52'),
			until: at('2026-11-25', '12:22')
		});
		expect(onClose).toHaveBeenCalled();
	});

	it('starts an errand of 30 minutes, and remembers another length for next time', async () => {
		const user = userEvent.setup();
		const onSave = vi.fn();
		render(<PausArk {...props({ kind: 'errand', onSave })} />);
		const errand = sheet('Ärende');
		expect(within(errand).getByRole('button', { name: 'Ärende 11:52–12:22' })).toBeTruthy();
		await user.click(within(errand).getByRole('radio', { name: '45 min' }));
		await user.click(within(errand).getByRole('button', { name: 'Ärende 11:52–12:37' }));
		expect(lastLength('errand')).toBe(45);
		expect(lastLength('lunch')).toBe(30);
	});

	it('takes a pause afterwards, from the time wheels', async () => {
		const user = userEvent.setup();
		const onSave = vi.fn();
		render(<PausArk {...props({ now: at('2026-11-25', '14:30'), onSave })} />);
		await pickTime(user, 'Började', '11:40');
		await user.click(screen.getByRole('button', { name: 'Lunch 11:40–12:10' }));
		expect(onSave).toHaveBeenCalledWith({
			from: at('2026-11-25', '11:40'),
			until: at('2026-11-25', '12:10')
		});
	});

	it('takes a length of one’s own from the end’s wheels, and refuses an end before the start', async () => {
		const user = userEvent.setup();
		const onSave = vi.fn();
		render(<PausArk {...props({ kind: 'errand', onSave })} />);
		await pickTime(user, 'Slutar', '12:40');
		for (const radio of screen.getAllByRole('radio')) {
			expect(radio.getAttribute('aria-checked')).toBe('false');
		}
		await user.click(screen.getByRole('button', { name: 'Ärende 11:52–12:40' }));
		expect(onSave).toHaveBeenCalledWith({
			from: at('2026-11-25', '11:52'),
			until: at('2026-11-25', '12:40')
		});
		// A length that is not offered is not remembered.
		expect(lastLength('errand')).toBe(30);

		cleanup();
		render(<PausArk {...props()} />);
		await pickTime(user, 'Slutar', '11:30');
		expect(screen.getByText('Pausen måste sluta efter att den börjat')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Lunch' }).hasAttribute('disabled')).toBe(true);
	});

	it('changes a pause of a length of its own, with no button chosen', () => {
		const inPause: Timer = { ...running, start: at('2026-11-25', '12:29') };
		render(<PausArk {...props({ kind: null, timer: inPause, from: at('2026-11-25', '11:52') })} />);
		expect(screen.getByRole('button', { name: 'Paus 11:52–12:29' })).toBeTruthy();
		for (const radio of screen.getAllByRole('radio')) {
			expect(radio.getAttribute('aria-checked')).toBe('false');
		}
	});

	it('refuses a start before the timer’s first minute', async () => {
		const user = userEvent.setup();
		render(<PausArk {...props()} />);
		await pickTime(user, 'Började', '08:00');
		expect(screen.getByText('Pausen kan börja tidigast 08:16')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Lunch' }).hasAttribute('disabled')).toBe(true);
	});

	it('changes the pause the timer is in from where it began, with the network only', async () => {
		const user = userEvent.setup();
		const onSave = vi.fn();
		const inPause: Timer = { ...running, start: at('2026-11-25', '12:22') };
		const change = props({ kind: null, timer: inPause, from: at('2026-11-25', '11:52'), onSave });
		const { rerender } = render(<PausArk {...change} />);
		const changing = sheet('Ändra pausen');
		expect(within(changing).getByText('Började 11:52')).toBeTruthy();
		expect(
			within(changing).getByRole('radio', { name: '30 min' }).getAttribute('aria-checked')
		).toBe('true');
		await user.click(within(changing).getByRole('radio', { name: '1 h' }));
		await user.click(within(changing).getByRole('button', { name: 'Paus 11:52–12:52' }));
		expect(onSave).toHaveBeenCalledWith({
			from: at('2026-11-25', '11:52'),
			until: at('2026-11-25', '12:52')
		});

		rerender(<PausArk {...change} online={false} />);
		expect(screen.getByText('Ingen uppkoppling')).toBeTruthy();
		expect(screen.getByRole('button', { name: /^Paus / }).hasAttribute('disabled')).toBe(true);
	});
});
