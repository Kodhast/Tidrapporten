// @vitest-environment jsdom
// The start at first use (issue 64) when the owner types and presses, in jsdom. The same flow runs
// against the emulators in test/e2e/komigang.e2e.ts.
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { KomIgangVy } from './KomIgangVy';

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

const next = () => screen.getByRole('button', { name: 'Nästa' }) as HTMLButtonElement;
const saveButton = () =>
	screen.getByRole('button', { name: 'Spara och börja' }) as HTMLButtonElement;

const addCode = async (user: ReturnType<typeof userEvent.setup>, name: string, billable = true) => {
	await user.click(screen.getByRole('button', { name: 'Lägg till tidkod' }));
	const sheet = screen.getByRole('dialog');
	await user.type(within(sheet).getByLabelText('Namn'), name);
	if (!billable) await user.click(within(sheet).getByRole('switch', { name: /Debiterbar/ }));
	await user.click(within(sheet).getByRole('button', { name: 'Lägg till' }));
};

describe('KomIgangVy', () => {
	it('goes through the four steps, keeps what was typed going back, and saves once at the end', async () => {
		const user = userEvent.setup();
		const onSave = vi.fn().mockResolvedValue(undefined);
		render(<KomIgangVy today="2026-11-26" online onSave={onSave} />);

		expect(screen.getByText('Steg 1 av 4')).toBeTruthy();
		expect(next().disabled).toBe(true);
		await user.type(screen.getByLabelText('Arbetsgivare'), 'Exempelkonsult AB');
		await user.click(screen.getByRole('radio', { name: 'Faktisk tid' }));
		await user.click(next());

		expect(screen.getByText('Steg 2 av 4')).toBeTruthy();
		expect(next().disabled).toBe(true);
		await user.type(screen.getByLabelText('Kundens namn'), 'Kund A');
		await user.click(next());

		expect(screen.getByText('Exempelkonsult AB · Kund A')).toBeTruthy();
		expect((screen.getByLabelText('Startdatum') as HTMLInputElement).value).toBe('2026-11-23');
		expect(next().disabled).toBe(true);
		await user.type(screen.getByLabelText('Uppdragets namn'), 'Uppdrag A');
		await user.click(screen.getByRole('button', { name: 'Tillbaka' }));
		expect((screen.getByLabelText('Kundens namn') as HTMLInputElement).value).toBe('Kund A');
		await user.click(next());
		expect((screen.getByLabelText('Uppdragets namn') as HTMLInputElement).value).toBe('Uppdrag A');
		await user.click(next());

		expect(screen.getByText('Steg 4 av 4')).toBeTruthy();
		expect(saveButton().disabled).toBe(true);
		await addCode(user, 'Utveckling');
		await addCode(user, 'Intern tid', false);
		expect(screen.getByText('Inte debiterbar')).toBeTruthy();
		expect(onSave).not.toHaveBeenCalled();
		await user.click(saveButton());

		expect(onSave).toHaveBeenCalledOnce();
		const docs = onSave.mock.calls[0]![0];
		expect(docs.employer).toMatchObject({
			name: 'Exempelkonsult AB',
			suggestionMode: 'actualQuarter'
		});
		expect(docs.customer).toMatchObject({ name: 'Kund A' });
		expect(docs.assignment).toMatchObject({ name: 'Uppdrag A', startDate: '2026-11-23' });
		expect(docs.codes.map((c: { name: string }) => c.name)).toEqual(['Utveckling', 'Intern tid']);
		expect(docs.receivers.map((r: { name: string }) => r.name)).toEqual([
			'Exempelkonsult AB',
			'Kund A'
		]);
	});

	it('takes an internal assignment without a customer, and shows a wrong scope', async () => {
		const user = userEvent.setup();
		const onSave = vi.fn().mockResolvedValue(undefined);
		render(<KomIgangVy today="2026-11-26" online onSave={onSave} />);
		await user.type(screen.getByLabelText('Arbetsgivare'), 'Exempelkonsult AB');
		await user.click(next());
		await user.click(screen.getByRole('radio', { name: 'Ingen kund' }));
		expect(screen.queryByLabelText('Kundens namn')).toBeNull();
		await user.click(next());
		expect(screen.getByText('Exempelkonsult AB · Ingen kund')).toBeTruthy();
		await user.type(screen.getByLabelText('Uppdragets namn'), 'Intern tid');
		await user.clear(screen.getByLabelText('Omfattning'));
		await user.type(screen.getByLabelText('Omfattning'), '120');
		expect(screen.getByText('Mellan 1 och 100 %')).toBeTruthy();
		expect(next().disabled).toBe(true);
		await user.clear(screen.getByLabelText('Omfattning'));
		await user.type(screen.getByLabelText('Omfattning'), '20');
		await user.click(next());
		await addCode(user, 'Intern tid', false);
		await user.click(saveButton());
		const docs = onSave.mock.calls[0]![0];
		expect(docs.customer).toBeNull();
		expect(docs.receivers).toHaveLength(1);
	});

	it('cannot save offline, and says when a save fails', async () => {
		const user = userEvent.setup();
		const onSave = vi.fn().mockRejectedValue(new Error('offline'));
		const { rerender } = render(<KomIgangVy today="2026-11-26" online={false} onSave={onSave} />);
		await user.type(screen.getByLabelText('Arbetsgivare'), 'Exempelkonsult AB');
		await user.click(next());
		await user.click(screen.getByRole('radio', { name: 'Ingen kund' }));
		await user.click(next());
		await user.type(screen.getByLabelText('Uppdragets namn'), 'Uppdrag A');
		await user.click(next());
		await addCode(user, 'Utveckling');
		expect(screen.getByText('Ingen anslutning')).toBeTruthy();
		expect(saveButton().disabled).toBe(true);
		rerender(<KomIgangVy today="2026-11-26" online onSave={onSave} />);
		await user.click(saveButton());
		await screen.findByText('Det gick inte att spara');
	});
});
