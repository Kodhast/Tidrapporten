// @vitest-environment jsdom
// What the settings views do when the owner types and presses, in jsdom with Testing Library.
// The same flows run against the emulators in a real Chrome in test/e2e/installningar.e2e.ts.
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ABSENCE_TYPES } from '../../domain/installningar.ts';
import { assignment, code, customer, employer } from '../../domain/testdata.ts';
import type { Receiver } from '../../domain/types.ts';
import { useRoute } from '../rutter.ts';
import { exportFile } from '../../data/exportformat.ts';
import { Export } from './Export';
import { FranvaroVy } from './FranvaroVy';
import { MottagareVy } from './MottagareVy';
import { PaminnelserVy } from './PaminnelserVy';
import { PartVy } from './PartVy';
import { DEFAULT_SETTINGS } from '../../data/dokument.ts';
import { CLOCK_ERROR } from '../../domain/dag.ts';
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
		employers: [employer()],
		customers: [customer(), customer({ id: 'k2', name: 'Kund B', order: 1 })],
		nextOrder: 2,
		today: '2026-11-26',
		online: true,
		onDelete: vi.fn()
	};

	it('saves a new assignment with its codes, under the only employer, with both receivers', async () => {
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
		expect(screen.getByText('Exempelkonsult AB')).toBeTruthy();
		await user.click(screen.getByRole('button', { name: /^Kund/ }));
		await user.click(within(sheet()).getByRole('button', { name: 'Kund B' }));
		expect(screen.getByRole('switch', { name: /Kunden får också veckorapporten/ })).toBeTruthy();
		await user.click(spara());

		expect(onSave).toHaveBeenCalledOnce();
		const [before, after, codeChanges, receivers] = onSave.mock.calls[0]!;
		expect(before).toBeNull();
		expect(after).toMatchObject({
			name: 'Exempeluppdraget',
			startDate: '2026-11-26',
			terms: [{ from: '2026-11-26', scopePercent: 80, workdayMinutes: 480 }],
			order: 2,
			employerId: 'g1',
			customerId: 'k2'
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
		expect(receivers).toMatchObject([
			{ name: 'Exempelkonsult AB', position: 1, party: { kind: 'employer', id: 'g1' } },
			{ name: 'Kund B', position: 2, party: { kind: 'customer', id: 'k2' } }
		]);
		expect(receivers[0].mapping).toEqual({ [codeChanges[0].after.id]: receivers[0].codes[0].id });
	});

	it('needs an employer chosen when there are several, and the customer as receiver is optional', async () => {
		const user = userEvent.setup();
		const onSave = vi.fn().mockResolvedValue(undefined);
		render(
			<UppdragVy
				{...base}
				employers={[employer(), employer({ id: 'g2', name: 'Annan konsult AB', order: 1 })]}
				assignment={null}
				onSave={onSave}
			/>
		);
		await user.type(screen.getByLabelText('Namn'), 'Internt');
		expect((spara() as HTMLButtonElement).disabled).toBe(true);
		await user.click(screen.getByRole('button', { name: /^Arbetsgivare/ }));
		await user.click(within(sheet()).getByRole('button', { name: 'Annan konsult AB' }));
		await user.click(screen.getByRole('button', { name: /^Kund/ }));
		await user.click(within(sheet()).getByRole('button', { name: 'Kund A' }));
		await user.click(screen.getByRole('switch', { name: /Kunden får också veckorapporten/ }));
		await user.click(spara());
		const [, after, , receivers] = onSave.mock.calls[0]!;
		expect(after).toMatchObject({ employerId: 'g2', customerId: 'k1' });
		expect(receivers).toMatchObject([{ name: 'Annan konsult AB', position: 1 }]);
		expect(receivers).toHaveLength(1);
	});

	it('shows an error once a field is wrong, and Spara stays off', async () => {
		const user = userEvent.setup();
		render(<UppdragVy {...base} assignment={assignment()} codes={codes} onSave={vi.fn()} />);
		await user.clear(screen.getByLabelText('Omfattning'));
		await user.type(screen.getByLabelText('Omfattning'), '120');
		expect(screen.getByText('Mellan 1 och 100 %')).toBeTruthy();
		expect((spara() as HTMLButtonElement).disabled).toBe(true);
	});

	it('saves a renamed code with a changed billable flag and archives, and says when a save fails', async () => {
		const user = userEvent.setup();
		const onSave = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
		const a = assignment();
		render(<UppdragVy {...base} assignment={a} codes={codes} onSave={onSave} />);
		await user.click(screen.getByRole('button', { name: /Intern tid/ }));
		expect(within(sheet()).getByText('Ändra tidkod')).toBeTruthy();
		const klar = () => within(sheet()).getByRole('button', { name: 'Klar' }) as HTMLButtonElement;
		expect(klar().disabled).toBe(true);
		await user.clear(within(sheet()).getByLabelText('Namn'));
		await user.type(within(sheet()).getByLabelText('Namn'), 'Interna möten');
		await user.click(within(sheet()).getByRole('switch', { name: /Debiterbar/ }));
		await user.click(klar());
		expect(screen.getByText('Interna möten')).toBeTruthy();
		expect(screen.getByText('Ändringar som påverkar flexen skrivs i ändringsloggen.')).toBeTruthy();
		await user.click(spara());
		await screen.findByText('Det gick inte att spara');
		expect(onSave.mock.calls[0]![2]).toEqual([
			{ before: codes[1], after: { ...codes[1], name: 'Interna möten', billable: true } }
		]);

		await user.click(screen.getByRole('button', { name: 'Arkivera uppdraget' }));
		await waitFor(() => expect(screen.queryByText('Det gick inte att spara')).toBeNull());
		expect(onSave.mock.calls[1]).toEqual([a, { ...a, archived: true }, [], []]);
	});

	it('sets an end, and applies a changed scope from the day chosen (#79)', async () => {
		const user = userEvent.setup();
		const onSave = vi.fn().mockResolvedValue(undefined);
		const a = assignment();
		render(<UppdragVy {...base} assignment={a} codes={codes} onSave={onSave} />);
		await user.clear(screen.getByLabelText('Omfattning'));
		await user.type(screen.getByLabelText('Omfattning'), '80');
		const from = screen.getByLabelText('Omfattning och arbetsdag gäller från') as HTMLInputElement;
		expect(from.value).toBe('2026-11-26');
		await user.clear(from);
		await user.type(from, '2026-10-05');
		await user.type(screen.getByLabelText('Slutdatum'), '2027-06-30');
		await user.click(spara());
		const [, after] = onSave.mock.calls[0]!;
		expect(after).toMatchObject({
			endDate: '2027-06-30',
			terms: [
				{ from: '2026-01-01', scopePercent: 100, workdayMinutes: 480 },
				{ from: '2026-10-05', scopePercent: 80, workdayMinutes: 480 }
			]
		});
	});

	it('moves the day the scope in force applies from, without changing the scope (#79)', async () => {
		const user = userEvent.setup();
		const onSave = vi.fn().mockResolvedValue(undefined);
		// 80 % from 2 November, but it really applied from 5 October.
		const a = assignment({
			terms: [
				{ from: '2026-01-01', scopePercent: 100, workdayMinutes: 480 },
				{ from: '2026-11-02', scopePercent: 80, workdayMinutes: 480 }
			]
		});
		render(<UppdragVy {...base} assignment={a} codes={codes} onSave={onSave} />);
		const from = screen.getByLabelText('Omfattning och arbetsdag gäller från');
		await user.clear(from);
		await user.type(from, '2026-10-05');
		await user.click(spara());
		expect(onSave.mock.calls[0]![1].terms).toEqual([
			{ from: '2026-01-01', scopePercent: 100, workdayMinutes: 480 },
			{ from: '2026-10-05', scopePercent: 80, workdayMinutes: 480 }
		]);
	});

	it('will not save an end before the start', async () => {
		const user = userEvent.setup();
		render(<UppdragVy {...base} assignment={assignment()} codes={codes} onSave={vi.fn()} />);
		await user.type(screen.getByLabelText('Slutdatum'), '2025-12-31');
		expect(screen.getByText('Tidigast startdatum')).toBeTruthy();
		expect((spara() as HTMLButtonElement).disabled).toBe(true);
	});

	it('deletes after the confirmation, and shows why when it may not', async () => {
		const user = userEvent.setup();
		const onDelete = vi
			.fn()
			.mockResolvedValueOnce('Uppdraget har skickade veckor. Arkivera det i stället.')
			.mockResolvedValue(null);
		render(<UppdragVy {...base} assignment={assignment()} onSave={vi.fn()} onDelete={onDelete} />);
		expect(screen.queryByRole('button', { name: 'Radera uppdraget' })).toBeTruthy();
		const remove = async () => {
			await user.click(screen.getByRole('button', { name: 'Radera uppdraget' }));
			const dialog = await screen.findByRole('alertdialog', { name: 'Radera uppdraget?' });
			await user.click(within(dialog).getByRole('button', { name: 'Radera' }));
		};
		await remove();
		expect(
			await screen.findByText('Uppdraget har skickade veckor. Arkivera det i stället.')
		).toBeTruthy();
		await remove();
		await waitFor(() => expect(screen.queryByText(/skickade veckor\. Arkivera/)).toBeNull());
		expect(onDelete).toHaveBeenCalledWith('a1');
		expect(onDelete).toHaveBeenCalledTimes(2);
	});

	it('offers no delete for a new assignment', () => {
		render(<UppdragVy {...base} assignment={null} onSave={vi.fn()} />);
		expect(screen.queryByRole('button', { name: 'Radera uppdraget' })).toBeNull();
	});
});

describe('PartVy', () => {
	it('saves a new employer with its suggestion for the report', async () => {
		const user = userEvent.setup();
		const onSave = vi.fn().mockResolvedValue(undefined);
		render(<PartVy kind="employer" value={null} nextOrder={3} online onSave={onSave} />);
		await user.type(screen.getByLabelText('Arbetsgivare'), '  Exempelkonsult AB ');
		await user.click(screen.getByRole('radio', { name: 'Faktisk tid' }));
		await user.click(spara());
		expect(onSave).toHaveBeenCalledWith(null, {
			id: expect.any(String),
			name: 'Exempelkonsult AB',
			suggestionMode: 'actualQuarter',
			archived: false,
			order: 3
		});
	});

	it('renames a customer, and Spara is off until the name changes', async () => {
		const user = userEvent.setup();
		const onSave = vi.fn().mockResolvedValue(undefined);
		const k = customer();
		render(<PartVy kind="customer" value={k} nextOrder={3} online onSave={onSave} />);
		expect((spara() as HTMLButtonElement).disabled).toBe(true);
		await user.clear(screen.getByLabelText('Kund'));
		await user.type(screen.getByLabelText('Kund'), 'Kund C');
		await user.click(spara());
		expect(onSave).toHaveBeenCalledWith(k, { ...k, name: 'Kund C' });
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
	archived: false,
	party: null
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
			archived: false,
			party: null
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

describe('Export', () => {
	const button = () => screen.getByRole('button', { name: 'Exportera all data' });
	const restoreButton = () => screen.getByRole('button', { name: 'Återställ från fil' });
	const noRestore = () => Promise.resolve({ restored: 0, existed: 0 });
	const exported = exportFile(
		[
			{ path: 'entries/e1', data: { note: 'Påhittad' } },
			{ path: 'entries/e2', data: { note: 'Påhittad' } }
		],
		Date.UTC(2026, 10, 26, 9)
	);
	const pick = (user: ReturnType<typeof userEvent.setup>, content: string) =>
		user.upload(
			screen.getByLabelText('Fil att återställa'),
			new File([content], 'tidrapporten-2026-11-26.json', { type: 'application/json' })
		);

	it('exports on a press and says when it fails', async () => {
		const user = userEvent.setup();
		const onExport = vi
			.fn()
			.mockRejectedValueOnce(new Error('unavailable'))
			.mockResolvedValue(undefined);
		render(<Export online onExport={onExport} onRestore={noRestore} onEmpty={vi.fn()} />);
		await user.click(button());
		expect(await screen.findByText('Det gick inte att exportera')).toBeTruthy();
		await user.click(button());
		await waitFor(() => expect(screen.queryByText('Det gick inte att exportera')).toBeNull());
		expect(onExport).toHaveBeenCalledTimes(2);
	});

	it('waits for the network, since both read from and write to the server', () => {
		render(<Export online={false} onExport={vi.fn()} onRestore={noRestore} onEmpty={vi.fn()} />);
		expect(button().hasAttribute('disabled')).toBe(true);
		expect(restoreButton().hasAttribute('disabled')).toBe(true);
	});

	it('restores a chosen file after the confirmation and says what came back', async () => {
		const user = userEvent.setup({ applyAccept: false });
		const onRestore = vi.fn().mockResolvedValue({ restored: 1, existed: 1 });
		render(<Export online onExport={vi.fn()} onRestore={onRestore} onEmpty={vi.fn()} />);
		const click = vi.spyOn(HTMLInputElement.prototype, 'click');
		await user.click(restoreButton());
		expect(click).toHaveBeenCalled();
		await pick(user, JSON.stringify(exported));
		const dialog = await screen.findByRole('alertdialog', { name: 'Återställa från filen?' });
		expect(dialog.textContent).toContain('exporterad 26 nov. 2026 och har 2 dokument');
		await user.click(within(dialog).getByRole('button', { name: 'Återställ' }));
		expect(onRestore).toHaveBeenCalledWith(exported);
		expect(await screen.findByText('1 dokument återställt')).toBeTruthy();
		expect(screen.getByText('1 dokument fanns redan och lämnades orört.')).toBeTruthy();
	});

	it('refuses a file that is no export, and says when the restore fails', async () => {
		const user = userEvent.setup({ applyAccept: false });
		const onRestore = vi.fn().mockRejectedValue(new Error('internal'));
		render(<Export online onExport={vi.fn()} onRestore={onRestore} onEmpty={vi.fn()} />);
		await pick(user, 'inte json');
		expect(await screen.findByText('Filen är ingen export från Tidrapporten.')).toBeTruthy();
		await pick(user, JSON.stringify({ ...exported, schemaVersion: 9 }));
		expect(await screen.findByText('Filen har formatet 9, och appen läser 1.')).toBeTruthy();
		expect(onRestore).not.toHaveBeenCalled();

		await pick(user, JSON.stringify(exported));
		await user.click(
			within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Återställ' })
		);
		expect(await screen.findByText('Det gick inte att återställa')).toBeTruthy();
	});

	it('says when nothing was missing', async () => {
		const user = userEvent.setup({ applyAccept: false });
		render(
			<Export
				online
				onExport={vi.fn()}
				onRestore={() => Promise.resolve({ restored: 0, existed: 2 })}
				onEmpty={vi.fn()}
			/>
		);
		await pick(user, JSON.stringify(exported));
		await user.click(
			within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Återställ' })
		);
		expect(await screen.findByText('Inget saknades')).toBeTruthy();
		expect(screen.getByText('2 dokument fanns redan och lämnades orörda.')).toBeTruthy();
	});

	it('empties the account only after TÖM is typed, and says when it fails', async () => {
		const user = userEvent.setup();
		const onEmpty = vi
			.fn()
			.mockRejectedValueOnce(new Error('internal'))
			.mockResolvedValue(undefined);
		render(<Export online onExport={vi.fn()} onRestore={noRestore} onEmpty={onEmpty} />);
		const ask = async () => {
			await user.click(screen.getByRole('button', { name: 'Töm kontot' }));
			return screen.findByRole('alertdialog', { name: 'Töm kontot?' });
		};
		let dialog = await ask();
		const confirm = () => within(dialog).getByRole('button', { name: 'Ladda ner och töm' });
		expect(confirm().hasAttribute('disabled')).toBe(true);
		await user.type(within(dialog).getByLabelText('Skriv TÖM'), 'TÖ');
		expect(confirm().hasAttribute('disabled')).toBe(true);
		await user.type(within(dialog).getByLabelText('Skriv TÖM'), 'M');
		await user.click(confirm());
		expect(await screen.findByText('Det gick inte att tömma kontot')).toBeTruthy();

		// The word is asked for again each time.
		dialog = await ask();
		expect(confirm().hasAttribute('disabled')).toBe(true);
		await user.type(within(dialog).getByLabelText('Skriv TÖM'), 'töm');
		await user.click(confirm());
		await waitFor(() => expect(screen.queryByText('Det gick inte att tömma kontot')).toBeNull());
		expect(onEmpty).toHaveBeenCalledTimes(2);
	});

	it('puts the emptying in its own danger zone', () => {
		render(<Export online onExport={vi.fn()} onRestore={noRestore} onEmpty={vi.fn()} />);
		const zone = screen.getByRole('group', { name: 'Farozon' });
		expect(zone.className).toBe('farozon');
		expect(within(zone).getByRole('button', { name: 'Töm kontot' })).toBeTruthy();
		expect(within(zone).queryByRole('button', { name: 'Exportera all data' })).toBeNull();
	});

	it('does not empty offline', () => {
		render(<Export online={false} onExport={vi.fn()} onRestore={noRestore} onEmpty={vi.fn()} />);
		expect(screen.getByRole('button', { name: 'Töm kontot' }).hasAttribute('disabled')).toBe(true);
	});
});

describe('PaminnelserVy', () => {
	const device = { id: 'e1', fcmToken: 't', label: 'Chrome på dator' };
	const setup = (overrides: Partial<React.ComponentProps<typeof PaminnelserVy>> = {}) => {
		const props = {
			settings: DEFAULT_SETTINGS,
			device,
			notificationsConfigured: true,
			online: true,
			onSave: vi.fn().mockResolvedValue(undefined),
			onEnableDevice: vi.fn().mockResolvedValue('on'),
			onDisableDevice: vi.fn().mockResolvedValue(undefined),
			onTest: vi.fn().mockResolvedValue(1),
			...overrides
		};
		render(<PaminnelserVy {...props} />);
		return props;
	};

	it('saves null, 0 and false when a reminder is turned off', async () => {
		const user = userEvent.setup();
		const { onSave } = setup();
		await user.click(screen.getByRole('switch', { name: 'Ingen timer igång' }));
		expect(onSave).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, noTimerBy: null });
		await user.click(screen.getByRole('switch', { name: 'Timern går sent' }));
		expect(onSave).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, timerRunningAt: null });
		await user.click(screen.getByRole('switch', { name: /^Dag utan tid/ }));
		expect(onSave).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, remindEmptyDay: false });
		await user.click(screen.getByRole('switch', { name: 'Veckorapporten inte skickad' }));
		expect(onSave).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, reportReminderFridayAt: null });
		await user.click(screen.getByRole('switch', { name: 'Flexsaldo över' }));
		expect(onSave).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, flexWarning: 0 });
	});

	it('saves the default when a reminder is turned on again', async () => {
		const user = userEvent.setup();
		const off = {
			noTimerBy: null,
			timerRunningAt: null,
			remindEmptyDay: false,
			reportReminderFridayAt: null,
			flexWarning: 0
		};
		const { onSave } = setup({ settings: off });
		await user.click(screen.getByRole('switch', { name: 'Timern går sent' }));
		expect(onSave).toHaveBeenLastCalledWith({ ...off, timerRunningAt: '19:00' });
		await user.click(screen.getByRole('switch', { name: 'Flexsaldo över' }));
		expect(onSave).toHaveBeenLastCalledWith({ ...off, flexWarning: 1200 });
		await user.click(screen.getByRole('switch', { name: 'Veckorapporten inte skickad' }));
		expect(onSave).toHaveBeenLastCalledWith({ ...off, reportReminderFridayAt: '15:00' });
		await user.click(screen.getByRole('switch', { name: /^Dag utan tid/ }));
		expect(onSave).toHaveBeenLastCalledWith({ ...off, remindEmptyDay: true });
	});

	it('saves a changed time, and says CLOCK_ERROR for a wrong one', async () => {
		const user = userEvent.setup();
		const { onSave } = setup();
		await user.click(screen.getByRole('button', { name: /^Ändra timern går sent/ }));
		const field = within(sheet()).getByLabelText('Klockslag');
		await user.clear(field);
		await user.type(field, '25:99');
		expect(within(sheet()).getByText(CLOCK_ERROR)).toBeTruthy();
		expect((spara() as HTMLButtonElement).disabled).toBe(true);
		await user.clear(field);
		await user.type(field, '18.30');
		await user.click(spara());
		expect(onSave).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, timerRunningAt: '18:30' });
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
	});

	it('saves a changed flex limit in minutes', async () => {
		const user = userEvent.setup();
		const { onSave } = setup();
		await user.click(screen.getByRole('button', { name: /^Ändra flexsaldo över/ }));
		const field = within(sheet()).getByLabelText('Gräns i timmar (±)');
		expect((field as HTMLInputElement).value).toBe('20');
		await user.clear(field);
		await user.type(field, '12,5');
		await user.click(spara());
		expect(onSave).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, flexWarning: 750 });
	});

	it('turns everything off offline', () => {
		setup({ online: false });
		for (const name of ['Ingen timer igång', /^Dag utan tid/, 'Flexsaldo över'])
			expect((screen.getByRole('switch', { name }) as HTMLInputElement).disabled).toBe(true);
		expect(
			(screen.getByRole('switch', { name: /^Notiser på den här/ }) as HTMLInputElement).disabled
		).toBe(true);
		expect(
			(screen.getByRole('button', { name: 'Skicka en provnotis' }) as HTMLButtonElement).disabled
		).toBe(true);
	});

	it('turns notifications on and off on the device, and says when Chrome blocks them', async () => {
		const user = userEvent.setup();
		const { onDisableDevice } = setup();
		await user.click(screen.getByRole('switch', { name: /^Notiser på den här/ }));
		expect(onDisableDevice).toHaveBeenCalledOnce();
		cleanup();

		const denied = setup({ device: null, onEnableDevice: vi.fn().mockResolvedValue('denied') });
		await user.click(screen.getByRole('switch', { name: /^Notiser på den här/ }));
		expect(denied.onEnableDevice).toHaveBeenCalledOnce();
		expect(await screen.findByText('Notiser är blockerade i Chrome')).toBeTruthy();
		cleanup();

		setup({ device: null, onEnableDevice: vi.fn().mockResolvedValue('unsupported') });
		await user.click(screen.getByRole('switch', { name: /^Notiser på den här/ }));
		expect(await screen.findByText('Den här webbläsaren kan inte ta emot notiser')).toBeTruthy();
	});

	it('sends a test notice and tells how many devices it reached', async () => {
		const user = userEvent.setup();
		const { onTest } = setup();
		await user.click(screen.getByRole('button', { name: 'Skicka en provnotis' }));
		expect(onTest).toHaveBeenCalledOnce();
		expect(await screen.findByText('Skickad till 1 enhet')).toBeTruthy();
	});
});
