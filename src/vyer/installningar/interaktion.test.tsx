// @vitest-environment jsdom
// What the settings views do when the owner types and presses, in jsdom with Testing Library.
// The same flows run against the emulators in a real Chrome in test/e2e/installningar.e2e.ts.
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ABSENCE_TYPES } from '../../domain/installningar.ts';
import { assignment, code } from '../../domain/testdata.ts';
import type { Receiver } from '../../domain/types.ts';
import { useRoute } from '../rutter.ts';
import { FranvaroVy } from './FranvaroVy';
import { MottagareVy } from './MottagareVy';
import { UppdragVy } from './UppdragVy';

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

const spara = () => screen.getByRole('button', { name: 'Spara' });
const sheet = () => screen.getByRole('dialog');

const codes = [
	code('c1', { name: 'Utveckling', order: 0 }),
	code('c2', { name: 'Intern tid', billable: false, order: 1 })
];

describe('UppdragVy', () => {
	const base = {
		codes: [],
		receivers: [],
		nextOrder: 2,
		today: '2026-11-26',
		online: true
	};

	it('saves a new assignment with its new codes', async () => {
		const user = userEvent.setup();
		const onSave = vi.fn().mockResolvedValue(undefined);
		render(<UppdragVy {...base} assignment={null} onSave={onSave} />);
		expect((spara() as HTMLButtonElement).disabled).toBe(true);

		await user.type(screen.getByLabelText('Namn'), 'Exempeluppdraget');
		await user.clear(screen.getByLabelText('Omfattning'));
		await user.type(screen.getByLabelText('Omfattning'), '80');
		await user.click(screen.getByRole('button', { name: 'Lägg till tidkod' }));
		await user.type(within(sheet()).getByLabelText('Namn'), 'Utveckling');
		await user.click(within(sheet()).getByRole('switch', { name: /Debiterbar/ }));
		await user.click(within(sheet()).getByRole('button', { name: 'Lägg till' }));
		expect(screen.getByText('Inte debiterbar')).toBeTruthy();
		await user.click(spara());

		expect(onSave).toHaveBeenCalledOnce();
		const [before, after, codeChanges] = onSave.mock.calls[0]!;
		expect(before).toBeNull();
		expect(after).toMatchObject({
			name: 'Exempeluppdraget',
			startDate: '2026-11-26',
			terms: [{ from: '2026-11-26', scopePercent: 80, workdayMinutes: 480 }],
			order: 2
		});
		expect(codeChanges).toEqual([
			{
				before: null,
				after: expect.objectContaining({
					assignmentId: after.id,
					name: 'Utveckling',
					billable: false,
					order: 0
				})
			}
		]);
	});

	it('shows an error once a field is wrong, and Spara stays off', async () => {
		const user = userEvent.setup();
		render(<UppdragVy {...base} assignment={assignment()} codes={codes} onSave={vi.fn()} />);
		await user.clear(screen.getByLabelText('Omfattning'));
		await user.type(screen.getByLabelText('Omfattning'), '120');
		expect(screen.getByText('Mellan 1 och 100 %')).toBeTruthy();
		expect((spara() as HTMLButtonElement).disabled).toBe(true);
	});

	it('saves a changed billable flag and archives, and says when a save fails', async () => {
		const user = userEvent.setup();
		const onSave = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
		const a = assignment();
		render(<UppdragVy {...base} assignment={a} codes={codes} onSave={onSave} />);
		await user.click(screen.getByRole('switch', { name: /Intern tid/ }));
		expect(screen.getByText(/Ändrad omfattning eller arbetsdag gäller från i dag/)).toBeTruthy();
		await user.click(spara());
		await screen.findByText('Det gick inte att spara');
		expect(onSave.mock.calls[0]![2]).toEqual([
			{ before: codes[1], after: { ...codes[1], billable: true } }
		]);

		await user.click(screen.getByRole('button', { name: 'Arkivera uppdraget' }));
		await waitFor(() => expect(screen.queryByText('Det gick inte att spara')).toBeNull());
		expect(onSave.mock.calls[1]).toEqual([a, { ...a, archived: true }, []]);
	});
});

const kund: Receiver = {
	id: 'r1',
	assignmentId: 'a1',
	name: 'Kund A',
	position: 2,
	suggestionMode: 'fillNorm',
	codes: [
		{ id: 'k1', name: '1001 Utveckling' },
		{ id: 'k2', name: '1002 Möten' }
	],
	mapping: { c1: 'k1', semester: 'k2' },
	archived: false
};

describe('MottagareVy', () => {
	const base = {
		assignmentId: 'a1',
		codes,
		absenceTypes: DEFAULT_ABSENCE_TYPES,
		online: true
	};

	it('saves a new receiver last in the chain with its codes and mapping', async () => {
		const user = userEvent.setup();
		const onSave = vi.fn().mockResolvedValue(undefined);
		render(<MottagareVy {...base} receiver={null} receivers={[kund]} onSave={onSave} />);
		await user.type(screen.getByLabelText('Namn'), 'Mellanhanden');
		await user.click(screen.getByRole('radio', { name: 'Faktisk tid' }));
		await user.click(screen.getByRole('button', { name: 'Lägg till kod' }));
		await user.type(within(sheet()).getByLabelText('Kod och namn'), 'M-1 Konsult');
		await user.click(within(sheet()).getByRole('button', { name: 'Lägg till' }));
		await user.click(screen.getByRole('button', { name: /^Utveckling/ }));
		await user.click(within(sheet()).getByRole('button', { name: 'M-1 Konsult' }));
		expect(screen.getByText('Intern tid saknar kod hos Mellanhanden')).toBeTruthy();
		await user.click(spara());

		const [before, after] = onSave.mock.calls[0]!;
		expect(before).toBeNull();
		const own = after.codes[0];
		expect(after).toEqual({
			id: expect.stringMatching(/^[A-Za-z0-9]{20}$/),
			assignmentId: 'a1',
			name: 'Mellanhanden',
			position: 3,
			suggestionMode: 'actualQuarter',
			codes: [{ id: own.id, name: 'M-1 Konsult' }],
			mapping: { c1: own.id },
			archived: false
		});
	});

	it('leaves an absence type out of the report', async () => {
		const user = userEvent.setup();
		const onSave = vi.fn().mockResolvedValue(undefined);
		render(<MottagareVy {...base} receiver={kund} receivers={[kund]} onSave={onSave} />);
		expect((spara() as HTMLButtonElement).disabled).toBe(true);
		await user.click(screen.getByRole('button', { name: /^Semester/ }));
		await user.click(within(sheet()).getByRole('button', { name: 'Rapporteras inte' }));
		await user.click(spara());
		expect(onSave).toHaveBeenCalledWith(kund, { ...kund, mapping: { c1: 'k1' } });
	});
});

describe('FranvaroVy', () => {
	const base = {
		absenceTypes: DEFAULT_ABSENCE_TYPES,
		freeDays: [{ date: '2027-05-07', free: true, name: 'Klämdag' }],
		today: '2026-11-26',
		online: true
	};

	it('changes how an absence type counts, and adds a new one', async () => {
		const user = userEvent.setup();
		const onSaveAbsenceType = vi.fn().mockResolvedValue(undefined);
		render(<FranvaroVy {...base} onSaveAbsenceType={onSaveAbsenceType} onSaveFreeDay={vi.fn()} />);
		await user.click(screen.getByRole('button', { name: /^Bänktid/ }));
		await user.click(within(sheet()).getByRole('radio', { name: 'Arbetad tid' }));
		await user.click(within(sheet()).getByRole('button', { name: 'Spara' }));
		expect(onSaveAbsenceType).toHaveBeenLastCalledWith(DEFAULT_ABSENCE_TYPES[3], {
			...DEFAULT_ABSENCE_TYPES[3],
			counting: 'worked'
		});
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

		await user.click(screen.getByRole('button', { name: 'Lägg till frånvarotyp' }));
		await user.type(within(sheet()).getByLabelText('Namn'), 'Föräldramöte');
		await user.click(within(sheet()).getByRole('button', { name: 'Spara' }));
		expect(onSaveAbsenceType).toHaveBeenLastCalledWith(null, {
			id: expect.any(String),
			name: 'Föräldramöte',
			counting: 'fillsNorm',
			archived: false,
			order: 6
		});
	});

	it('makes an eve a workday with its switch', async () => {
		const user = userEvent.setup();
		const onSaveFreeDay = vi.fn().mockResolvedValue(undefined);
		render(<FranvaroVy {...base} onSaveAbsenceType={vi.fn()} onSaveFreeDay={onSaveFreeDay} />);
		await user.click(screen.getByRole('switch', { name: /Julafton 2026/ }));
		expect(onSaveFreeDay).toHaveBeenCalledWith(null, {
			date: '2026-12-24',
			free: false,
			name: 'Julafton'
		});
	});

	it('adds, renames and removes an own free day', async () => {
		const user = userEvent.setup();
		const onSaveFreeDay = vi.fn().mockResolvedValue(undefined);
		render(<FranvaroVy {...base} onSaveAbsenceType={vi.fn()} onSaveFreeDay={onSaveFreeDay} />);

		await user.click(screen.getByRole('button', { name: 'Lägg till ledig dag' }));
		await user.type(within(sheet()).getByLabelText('Datum'), '2027-05-07');
		expect(within(sheet()).getByText('Den dagen finns redan')).toBeTruthy();
		await user.clear(within(sheet()).getByLabelText('Datum'));
		await user.type(within(sheet()).getByLabelText('Datum'), '2027-05-14');
		await user.type(within(sheet()).getByLabelText('Namn'), 'Klämdag');
		await user.click(within(sheet()).getByRole('button', { name: 'Spara' }));
		expect(onSaveFreeDay).toHaveBeenLastCalledWith(null, {
			date: '2027-05-14',
			free: true,
			name: 'Klämdag'
		});
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

		await user.click(screen.getByRole('button', { name: /^Fredag 7 maj 2027/ }));
		await user.click(within(sheet()).getByRole('button', { name: 'Ta bort' }));
		expect(onSaveFreeDay).toHaveBeenLastCalledWith(base.freeDays[0], null);
	});
});

describe('useRoute', () => {
	function Shown() {
		const route = useRoute();
		return <p>{route.view}</p>;
	}

	it('follows the address after #', async () => {
		location.hash = '#/installningar';
		render(<Shown />);
		expect(screen.getByText('installningar')).toBeTruthy();
		act(() => {
			location.hash = '#/installningar/franvaro';
			window.dispatchEvent(new HashChangeEvent('hashchange'));
		});
		expect(screen.getByText('franvaro')).toBeTruthy();
	});
});
