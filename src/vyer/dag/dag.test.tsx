// @vitest-environment jsdom
// The day view and the interval sheet (issue 29) with made-up data, in jsdom with Testing
// Library. The same flows run against the emulators in test/e2e/dag.e2e.ts.
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { dayRows, daySum, firstOverlap } from '../../domain/dag.ts';
import {
	absenceTypes,
	absentAllDay,
	assignment,
	at,
	code,
	report,
	work
} from '../../domain/testdata.ts';
import { timerCodeGroups } from '../../domain/timer.ts';
import type { Entry } from '../../domain/types.ts';
import { DagVy, type DagVyProps } from './DagVy';
import { IntervallArk, type IntervallArkProps } from './IntervallArk';

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

const DAY = '2026-11-24';

const groups = timerCodeGroups(
	[
		assignment({ id: 'a1', name: 'Uppdrag A', order: 0 }),
		assignment({ id: 'a2', name: 'Uppdrag B', order: 1 })
	],
	{
		a1: [code('c1', { name: 'Utveckling', order: 0 }), code('c2', { name: 'Möten', order: 1 })],
		a2: [code('c9', { assignmentId: 'a2', name: 'Förvaltning' })]
	},
	DAY
);

const names: Record<string, string> = {
	c1: 'Utveckling',
	c2: 'Möten',
	c9: 'Förvaltning',
	semester: 'Semester'
};
const describeEntry = (e: Entry) =>
	`${e.assignmentId === 'a1' ? 'Uppdrag A' : 'Uppdrag B'} · ${
		names[e.subject.kind === 'code' ? e.subject.codeId : e.subject.absenceTypeId]
	}`;

const day = (entries: Entry[], overrides: Partial<DagVyProps> = {}): DagVyProps => ({
	date: DAY,
	rows: dayRows(entries, DAY),
	describe: describeEntry,
	assignmentName: (id) => (id === 'a1' ? 'Uppdrag A' : 'Uppdrag B'),
	overlap: firstOverlap(entries, DAY),
	sum: daySum(entries, DAY),
	paused: false,
	online: true,
	failed: false,
	onDay: () => {},
	previous: '2026-11-23',
	next: '2026-11-25',
	onOpen: () => {},
	onFill: () => {},
	onPause: () => {},
	onAdd: () => {},
	...overrides
});

const mockupDay = () => [
	work(DAY, '08:05', '09:00', 'c2'),
	work(DAY, '09:00', '10:00'),
	{ ...work(DAY, '09:30', '10:15', 'c9'), assignmentId: 'a2' },
	work(DAY, '10:15', '11:45'),
	work(DAY, '12:30', '16:40')
];

describe('DagVy', () => {
	it('shows the mockup’s day: rows, the gap, the overlap and the sum', () => {
		render(<DagVy {...day(mockupDay())} />);
		expect(screen.getByRole('button', { name: /Tisdag 24 november/ })).toBeTruthy();
		expect(screen.getByText('Två intervall överlappar')).toBeTruthy();
		expect(screen.getByText(/09:00–10:00 och 09:30–10:15/)).toBeTruthy();
		expect(screen.getAllByText('Överlapp')).toHaveLength(2);
		expect(screen.getByText('Lucka 11:45–12:30')).toBeTruthy();
		expect(screen.getByText('45 min utan tid')).toBeTruthy();
		expect(screen.getByText('4 h 10 min')).toBeTruthy();
		expect(screen.getByText('8 h 20 min')).toBeTruthy();
		expect(
			screen.getByText(
				'Uppdrag A 7 h 35 min · Uppdrag B 45 min. Överlappet räknas två gånger tills det är rättat.'
			)
		).toBeTruthy();
	});

	it('shows the gaps as pauses when the day is marked, and can take the mark away', async () => {
		const onPause = vi.fn();
		const entries = [work(DAY, '08:00', '11:45'), work(DAY, '12:30', '16:00')];
		render(<DagVy {...day(entries, { paused: true, onPause })} />);
		expect(screen.queryByText(/^Lucka/)).toBeNull();
		expect(screen.getByText('Paus 11:45–12:30')).toBeTruthy();
		await userEvent.click(screen.getByRole('button', { name: 'Ångra paus' }));
		expect(onPause).toHaveBeenCalledWith(false);
	});

	it('marks a pause and fills a gap', async () => {
		const onPause = vi.fn();
		const onFill = vi.fn();
		const entries = [work(DAY, '08:00', '11:45'), work(DAY, '12:30', '16:00')];
		render(<DagVy {...day(entries, { onPause, onFill })} />);
		await userEvent.click(screen.getByRole('button', { name: 'Paus' }));
		expect(onPause).toHaveBeenCalledWith(true);
		await userEvent.click(screen.getByRole('button', { name: 'Fyll i' }));
		expect(onFill).toHaveBeenCalledWith(
			expect.objectContaining({ start: at(DAY, '11:45'), end: at(DAY, '12:30') })
		);
	});

	it('opens an interval and whole-day absence, steps the day and adds', async () => {
		const onOpen = vi.fn();
		const onDay = vi.fn();
		const onAdd = vi.fn();
		const absent = absentAllDay(DAY, 'semester');
		const entries = [absent, work(DAY, '08:00', '09:00')];
		render(<DagVy {...day(entries, { onOpen, onDay, onAdd })} />);
		await userEvent.click(screen.getByRole('button', { name: /Hela dagen/ }));
		expect(onOpen).toHaveBeenCalledWith(absent);
		await userEvent.click(screen.getByRole('button', { name: /08:00–09:00/ }));
		expect(onOpen).toHaveBeenLastCalledWith(entries[1]);
		await userEvent.click(screen.getByRole('button', { name: 'Föregående dag' }));
		expect(onDay).toHaveBeenCalledWith('2026-11-23');
		await userEvent.click(screen.getByRole('button', { name: 'Nästa dag' }));
		expect(onDay).toHaveBeenLastCalledWith('2026-11-25');
		await userEvent.click(screen.getByRole('button', { name: 'Lägg till intervall' }));
		expect(onAdd).toHaveBeenCalledOnce();
	});

	it('says an empty day, offline and a failed save, and nothing while loading', () => {
		const { rerender } = render(<DagVy {...day([], { online: false, failed: true })} />);
		expect(screen.getByText('Ingen tid den här dagen.')).toBeTruthy();
		expect(screen.getByText('Ingen anslutning')).toBeTruthy();
		expect(screen.getByText('Det gick inte att spara')).toBeTruthy();
		rerender(<DagVy {...day([], { loading: true })} />);
		expect(screen.queryByText('Ingen tid den här dagen.')).toBeNull();
	});
});

const sheet = (overrides: Partial<IntervallArkProps> = {}): IntervallArkProps => ({
	isOpen: true,
	onOpenChange: () => {},
	date: DAY,
	entry: null,
	newId: 'ny-1',
	span: null,
	choice: null,
	groups,
	absenceTypes,
	entries: [],
	reports: [],
	online: true,
	onSave: () => {},
	...overrides
});

describe('IntervallArk', () => {
	it('fills a gap with the code before it', async () => {
		const onSave = vi.fn();
		render(
			<IntervallArk
				{...sheet({
					span: { start: at(DAY, '11:45'), end: at(DAY, '12:30') },
					choice: { assignmentId: 'a1', codeId: 'c2' },
					onSave
				})}
			/>
		);
		const dialog = screen.getByRole('dialog', { name: 'Nytt intervall' });
		expect((within(dialog).getByLabelText('Start') as HTMLInputElement).value).toBe('11:45');
		expect(within(dialog).getByRole('button', { name: 'Möten' }).getAttribute('aria-pressed')).toBe(
			'true'
		);
		expect(within(dialog).queryByRole('button', { name: 'Radera' })).toBeNull();
		await userEvent.click(within(dialog).getByRole('button', { name: 'Spara' }));
		expect(onSave).toHaveBeenCalledWith(
			null,
			{
				id: 'ny-1',
				assignmentId: 'a1',
				subject: { kind: 'code', codeId: 'c2' },
				time: { kind: 'interval', start: at(DAY, '11:45'), end: at(DAY, '12:30') },
				note: ''
			},
			''
		);
	});

	it('changes the time, assignment and code of an interval, and keeps its note', async () => {
		const onSave = vi.fn();
		const entry = { ...work(DAY, '09:30', '10:15'), note: 'Anteckning' };
		render(<IntervallArk {...sheet({ entry, onSave })} />);
		const start = screen.getByLabelText('Start');
		await userEvent.clear(start);
		await userEvent.type(start, '0945');
		await userEvent.click(screen.getByRole('radio', { name: 'Uppdrag B' }));
		expect(screen.getByRole('button', { name: 'Förvaltning' }).getAttribute('aria-pressed')).toBe(
			'true'
		);
		await userEvent.click(screen.getByRole('button', { name: 'Spara' }));
		expect(onSave.mock.calls[0]![1]).toEqual({
			...entry,
			assignmentId: 'a2',
			subject: { kind: 'code', codeId: 'c9' },
			time: { kind: 'interval', start: at(DAY, '09:45'), end: at(DAY, '10:15') }
		});
	});

	it('warns of an overlap but saves, and refuses a time that is not one', async () => {
		const other = work(DAY, '09:00', '10:00');
		render(
			<IntervallArk
				{...sheet({ span: { start: at(DAY, '09:30'), end: at(DAY, '10:15') }, entries: [other] })}
			/>
		);
		expect(screen.getByText('Överlappar 09:00–10:00')).toBeTruthy();
		const save = screen.getByRole('button', { name: 'Spara' }) as HTMLButtonElement;
		expect(save.disabled).toBe(false);
		const end = screen.getByLabelText('Slut');
		await userEvent.clear(end);
		await userEvent.type(end, '25');
		expect(screen.getByText('Skriv en tid som 16:05')).toBeTruthy();
		expect(save.disabled).toBe(true);
	});

	it('registers absence for the whole day', async () => {
		const onSave = vi.fn();
		render(<IntervallArk {...sheet({ onSave })} />);
		await userEvent.click(screen.getByRole('button', { name: 'Semester' }));
		expect(screen.getByRole('button', { name: 'Utveckling' }).getAttribute('aria-pressed')).toBe(
			'false'
		);
		await userEvent.click(screen.getByRole('switch', { name: /Hela dagen/ }));
		expect(screen.queryByLabelText('Start')).toBeNull();
		await userEvent.click(screen.getByRole('button', { name: 'Spara' }));
		expect(onSave.mock.calls[0]![1]).toMatchObject({
			subject: { kind: 'absence', absenceTypeId: 'semester' },
			time: { kind: 'allDay', date: DAY }
		});
	});

	it('keeps the chosen code when it is pressed again', async () => {
		render(<IntervallArk {...sheet()} />);
		const chosen = screen.getByRole('button', { name: 'Utveckling' });
		await userEvent.click(chosen);
		expect(chosen.getAttribute('aria-pressed')).toBe('true');
	});

	it('needs a reason in a sent week and passes it on, also for a delete', async () => {
		const onSave = vi.fn();
		const entry = work(DAY, '08:00', '09:00');
		const reports = [report('2026-W48', 'sent', [0, 0, 0, 0, 0, 0, 0])];
		render(<IntervallArk {...sheet({ entry, reports, onSave })} />);
		expect(screen.getByText('Veckan är skickad')).toBeTruthy();
		const remove = screen.getByRole('button', { name: 'Radera' }) as HTMLButtonElement;
		expect(remove.disabled).toBe(true);
		await userEvent.type(screen.getByLabelText('Skäl'), 'Glömde mötet');
		await userEvent.click(remove);
		expect(onSave).toHaveBeenCalledWith(entry, null, 'Glömde mötet');
	});

	it('blocks a change in a sent week offline', () => {
		const entry = work(DAY, '08:00', '09:00');
		const reports = [report('2026-W48', 'sent', [0, 0, 0, 0, 0, 0, 0])];
		render(<IntervallArk {...sheet({ entry, reports, online: false })} />);
		expect(
			screen.getByText('En ändring i en skickad vecka sparas bara med nät, så att den loggas.')
		).toBeTruthy();
		expect((screen.getByRole('button', { name: 'Spara' }) as HTMLButtonElement).disabled).toBe(
			true
		);
	});

	it('starts empty for a new interval without a gap', () => {
		render(<IntervallArk {...sheet({ groups: groups.slice(0, 1) })} />);
		expect((screen.getByLabelText('Start') as HTMLInputElement).value).toBe('');
		expect(screen.queryByRole('radiogroup')).toBeNull();
		expect((screen.getByRole('button', { name: 'Spara' }) as HTMLButtonElement).disabled).toBe(
			true
		);
	});
});
