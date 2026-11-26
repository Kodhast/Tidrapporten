import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ABSENCE_TYPES } from '../../domain/installningar.ts';
import { assignment, code } from '../../domain/testdata.ts';
import type { Receiver } from '../../domain/types.ts';
import { FranvaroVy } from './FranvaroVy';
import { InstallningarVy } from './InstallningarVy';
import { MottagareVy } from './MottagareVy';
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
	...overrides
});

const codes = [
	code('c1', { name: 'Utveckling', order: 0 }),
	code('c2', { name: 'Intern tid', billable: false, order: 1 })
];

describe('InstallningarVy', () => {
	const props = {
		assignments: [
			assignment({ id: 'a2', name: 'Uppdrag B', order: 1 }),
			assignment({ id: 'a1', name: 'Uppdrag A', order: 0 }),
			assignment({ id: 'a3', name: 'Gamla uppdraget', archived: true, order: 2 })
		],
		counts: { a1: { codes: 3, receivers: 2 }, a2: { codes: 1, receivers: 1 } },
		absenceTypes: 6,
		freeDays: 1,
		scopeToday: { a1: 80, a2: 20 },
		online: true
	};

	it('lists the assignments in order, archived last, with scope and counts', () => {
		const markup = renderToStaticMarkup(<InstallningarVy {...props} />);
		expect(markup).toContain('Inställningar');
		const a = markup.indexOf('Uppdrag A');
		const b = markup.indexOf('Uppdrag B');
		const old = markup.indexOf('Gamla uppdraget');
		expect(a).toBeGreaterThan(-1);
		expect(a).toBeLessThan(b);
		expect(b).toBeLessThan(old);
		expect(markup).toContain('80 % · 3 tidkoder · 2 mottagare');
		expect(markup).toContain('20 % · 1 tidkod · 1 mottagare');
		expect(markup).toContain('Arkiverat · 100 % · 0 tidkoder · 0 mottagare');
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
		expect(markup).toContain('Spara uppdraget först');
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
