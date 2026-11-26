import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ABSENCE_TYPES } from '../../domain/installningar.ts';
import { assignment, code, customer, employer } from '../../domain/testdata.ts';
import type { Receiver } from '../../domain/types.ts';
import { FranvaroVy } from './FranvaroVy';
import { InstallningarVy } from './InstallningarVy';
import { MottagareVy } from './MottagareVy';
import { PaminnelserVy } from './PaminnelserVy';
import { PartVy } from './PartVy';
import { DEFAULT_SETTINGS } from '../../data/dokument.ts';
import { UppdragVy } from './UppdragVy';

// The views' first render with made-up data; what the forms do is tested in the domain and in
// Playwright (test/e2e/installningar.e2e.ts).

const noSave = () => Promise.resolve();

const receiver = (overrides: Partial<Receiver> = {}): Receiver => ({
	id: 'r1',
	assignmentId: 'a1',
	name: 'Kund A',
	position: 2,
	suggestionMode: 'fillNorm',
	codes: [{ id: 'k1', name: '1001 Utveckling' }],
	mapping: { c1: 'k1' },
	archived: false,
	party: null,
	...overrides
});

const codes = [
	code('c1', { name: 'Utveckling', order: 0 }),
	code('c2', { name: 'Intern tid', billable: false, order: 1 })
];

describe('InstallningarVy', () => {
	const props = {
		assignments: [
			assignment({ id: 'a2', name: 'Uppdrag B', order: 1, employerId: 'g1' }),
			assignment({ id: 'a1', name: 'Uppdrag A', order: 0, employerId: 'g1', customerId: 'k1' }),
			assignment({ id: 'a3', name: 'Gamla uppdraget', archived: true, order: 2 })
		],
		employers: [employer()],
		customers: [customer(), customer({ id: 'k2', name: 'Kund B', order: 1 })],
		absenceTypes: 6,
		freeDays: 1,
		scopeToday: { a1: 80, a2: 20 },
		online: true,
		onExport: noSave,
		onRestore: () => Promise.resolve({ restored: 0, existed: 0 })
	};

	it('shows the assignments under one heading when there is no employer yet', () => {
		const markup = renderToStaticMarkup(<InstallningarVy {...props} employers={[]} />);
		expect(markup).toContain('>Uppdrag<');
		expect(markup).not.toContain('Uppdrag utan arbetsgivare');
	});

	it('lists the assignments under their employer in order, the rest after, and the customers', () => {
		const markup = renderToStaticMarkup(<InstallningarVy {...props} />);
		expect(markup).toContain('Inställningar');
		const employerAt = markup.indexOf('Exempelkonsult AB');
		const a = markup.indexOf('Uppdrag A');
		const b = markup.indexOf('Uppdrag B');
		const without = markup.indexOf('Uppdrag utan arbetsgivare');
		const old = markup.indexOf('Gamla uppdraget');
		expect(employerAt).toBeGreaterThan(-1);
		expect(employerAt).toBeLessThan(a);
		expect(a).toBeLessThan(b);
		expect(b).toBeLessThan(without);
		expect(without).toBeLessThan(old);
		expect(markup).toContain('Kund A · 80 %');
		expect(markup).toContain('Ingen kund · 20 %');
		expect(markup).toContain('Arkiverat · Välj arbetsgivare · Ingen kund · 100 %');
		expect(markup).toContain('href="#/installningar/arbetsgivare/g1"');
		expect(markup).toContain('href="#/installningar/kund/k1"');
		expect(markup).toContain('1 uppdrag');
		expect(markup).toContain('Inga uppdrag än');
		expect(markup).toContain('href="#/installningar/kund/ny"');
		expect(markup).toContain('href="#/installningar/arbetsgivare/ny"');
		expect(markup).toContain('href="#/installningar/uppdrag/a1"');
		expect(markup).toContain('href="#/installningar/uppdrag/ny"');
		expect(markup).toContain('6 frånvarotyper · 1 egen ledig dag');
		expect(markup).not.toContain('Ingen anslutning');
		expect(markup).not.toContain('style=');
	});

	it('says why nothing can be saved offline', () => {
		expect(renderToStaticMarkup(<InstallningarVy {...props} online={false} />)).toContain(
			'Ingen anslutning'
		);
	});
});

describe('UppdragVy', () => {
	const props = {
		codes,
		receivers: [
			receiver(),
			receiver({ id: 'r0', name: 'Arbetsgivaren', position: 1, mapping: {} })
		],
		employers: [employer()],
		customers: [customer()],
		nextOrder: 1,
		today: '2026-11-26',
		online: true,
		onSave: noSave
	};

	it('starts a new assignment with empty name and Spara off, and receivers after the save', () => {
		const markup = renderToStaticMarkup(
			<UppdragVy {...props} assignment={null} codes={[]} receivers={[]} />
		);
		expect(markup).toContain('Nytt uppdrag');
		expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Spara<\/button>/);
		expect(markup).toContain('value="100"');
		expect(markup).toContain('value="2026-11-26"');
		expect(markup).toContain('Exempelkonsult AB');
		expect(markup).toContain('Ingen kund');
		expect(markup).toContain('Arbetsgivaren blir mottagare 1');
		expect(markup).not.toContain('Kunden får också veckorapporten');
		expect(markup).not.toContain('Arkivera');
	});

	it('shows the codes with billable and the receivers in the chain', () => {
		const markup = renderToStaticMarkup(
			<UppdragVy {...props} assignment={assignment({ name: 'Uppdrag A', openingFlex: 270 })} />
		);
		expect(markup).toContain('value="Uppdrag A"');
		expect(markup).toContain('value="+4,5"');
		expect(markup).toContain('Debiterbar');
		expect(markup).toContain('Inte debiterbar');
		expect(markup.indexOf('1 · Arbetsgivaren')).toBeLessThan(markup.indexOf('2 · Kund A'));
		expect(markup).toContain('Fyll mot normen · flexen räknas härifrån · 2 omappade');
		expect(markup).toContain('Fyll mot normen · 1 omappad');
		expect(markup).toContain('href="#/installningar/uppdrag/a1/mottagare/ny"');
		expect(markup).toContain('Arkivera uppdraget');
		expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Spara<\/button>/);
	});

	it('asks for the employer of an assignment from before ADR 0019', () => {
		const markup = renderToStaticMarkup(
			<UppdragVy
				{...props}
				employers={[employer(), employer({ id: 'g2', name: 'Annan konsult AB', order: 1 })]}
				assignment={assignment()}
			/>
		);
		expect(markup).toContain('Välj arbetsgivare');
	});

	it('asks for an employer first when there is none', () => {
		const markup = renderToStaticMarkup(
			<UppdragVy {...props} employers={[]} assignment={null} codes={[]} receivers={[]} />
		);
		expect(markup).toContain('href="#/installningar/arbetsgivare/ny"');
	});

	it('offers to restore an archived assignment, not offline', () => {
		const markup = renderToStaticMarkup(
			<UppdragVy {...props} assignment={assignment({ archived: true })} online={false} />
		);
		expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Återställ uppdraget<\/button>/);
		expect(markup).toContain('Ingen anslutning');
	});
});

describe('MottagareVy', () => {
	const props = {
		assignmentId: 'a1',
		receivers: [receiver()],
		codes,
		absenceTypes: DEFAULT_ABSENCE_TYPES,
		online: true,
		onSave: noSave
	};

	it('shows the receiver’s codes and what each of ours becomes, and warns about the rest', () => {
		const markup = renderToStaticMarkup(<MottagareVy {...props} receiver={receiver()} />);
		expect(markup).toContain('Kund A:s koder');
		expect(markup).toContain('→ 1001 Utveckling');
		expect(markup).toContain('Intern tid saknar kod hos Kund A');
		expect(markup).toContain('Ingen kod vald');
		expect(markup).toContain('Rapporteras inte');
		expect(markup).toContain('aria-checked="true"');
		expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Spara<\/button>/);
	});

	it('starts a new receiver without codes', () => {
		const markup = renderToStaticMarkup(<MottagareVy {...props} receiver={null} />);
		expect(markup).toContain('Ny mottagare');
		expect(markup).toContain('Inga koder än.');
		expect(markup).toContain('2 koder saknar kod hos Mottagaren');
	});
});

describe('FranvaroVy', () => {
	const props = {
		absenceTypes: DEFAULT_ABSENCE_TYPES,
		freeDays: [
			{ date: '2026-12-24', free: false, name: 'Julafton' },
			{ date: '2027-05-07', free: true, name: 'Klämdag' }
		],
		today: '2026-11-26',
		online: true,
		onSaveAbsenceType: noSave,
		onSaveFreeDay: noSave
	};

	it('lists the absence types with how they count', () => {
		const markup = renderToStaticMarkup(<FranvaroVy {...props} />);
		expect(markup).toContain('Semester');
		expect(markup).toContain('Tas ur flexen');
		expect(markup).toContain('Räknas som arbetad tid');
	});

	it('lists the coming eves with their switch, and the own free days', () => {
		const markup = renderToStaticMarkup(<FranvaroVy {...props} />);
		expect(markup).not.toContain('Midsommarafton 2026');
		expect(markup).toContain('Julafton 2026');
		expect(markup).toContain('Arbetsdag');
		expect(markup).toContain('Midsommarafton 2027');
		expect(markup).toContain('Fredag 7 maj 2027');
		expect(markup).toContain('Klämdag');
	});

	it('turns the eves’ switches off offline', () => {
		const markup = renderToStaticMarkup(<FranvaroVy {...props} online={false} />);
		expect(markup).toMatch(/role="switch"[^>]*disabled=""|disabled=""[^>]*role="switch"/);
	});
});

describe('PartVy', () => {
	it('shows an employer with its suggestion for the report', () => {
		const markup = renderToStaticMarkup(
			<PartVy kind="employer" value={employer()} nextOrder={1} online onSave={noSave} />
		);
		expect(markup).toContain('value="Exempelkonsult AB"');
		expect(markup).toContain('Veckorapporten till arbetsgivaren');
		expect(markup).toContain('Fyll mot normen');
	});

	it('starts a new customer empty, without the suggestion', () => {
		const markup = renderToStaticMarkup(
			<PartVy kind="customer" value={null} nextOrder={1} online onSave={noSave} />
		);
		expect(markup).toContain('Ny kund');
		expect(markup).not.toContain('Veckorapporten till arbetsgivaren');
		expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Spara<\/button>/);
	});
});

describe('PaminnelserVy', () => {
	const props = {
		settings: DEFAULT_SETTINGS,
		device: { id: 'e1', fcmToken: 't', label: 'Chrome på Android' },
		notificationsConfigured: true,
		online: true,
		onSave: noSave,
		onEnableDevice: () => Promise.resolve('on' as const),
		onDisableDevice: noSave,
		onTest: () => Promise.resolve(1)
	};

	it('shows the device and the values of the settings', () => {
		const markup = renderToStaticMarkup(<PaminnelserVy {...props} />);
		expect(markup).toContain('Notiser på den här enheten');
		expect(markup).toContain('Chrome på Android');
		expect(markup).toContain('>09:30<');
		expect(markup).toContain('>19:00<');
		expect(markup).toContain('Dagen efter, kl. 09:30');
		expect(markup).toContain('fredag 15:00');
		expect(markup).toContain('±20 h');
		expect(markup).toContain('Skicka en provnotis');
		expect(markup).toContain('Notiserna visar inga uppdrag eller mottagare, bara tider och antal.');
	});

	it('shows a reminder that is off without a value, and no test button without a device', () => {
		const markup = renderToStaticMarkup(
			<PaminnelserVy
				{...props}
				device={null}
				settings={{ ...DEFAULT_SETTINGS, timerRunningAt: null, flexWarning: 0 }}
			/>
		);
		expect(markup).not.toContain('>19:00<');
		expect(markup).not.toContain('±');
		expect(markup).toContain('Få påminnelserna även när appen är stängd');
		expect(markup).not.toContain('Skicka en provnotis');
	});

	it('keeps the device switch off without a key', () => {
		const markup = renderToStaticMarkup(
			<PaminnelserVy {...props} device={null} notificationsConfigured={false} />
		);
		expect(markup).toContain('Notiser är inte inställda här än.');
		expect(markup).toMatch(/role="switch"[^>]*disabled=""|disabled=""[^>]*role="switch"/);
	});
});
