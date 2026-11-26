import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { atLocalTime } from '../../src/domain/tid.ts';
import { seed, seedAssignment, signIn, stored, uid } from './hjalp.ts';

// The day view against the emulators (issue 29): an interval is corrected, a gap becomes a pause,
// an overlap warns, and a correction in a sent week needs a reason and is logged. A fixed day in
// week 48 of 2026, with made-up assignments and codes.

const DAY = '2026-11-24';

const seedEntry = (
	request: APIRequestContext,
	user: string,
	id: string,
	start: string,
	end: string
) =>
	seed(request, user, `entries/${id}`, {
		assignmentId: 'a1',
		subject: { kind: 'code', codeId: 'c1' },
		time: {
			kind: 'interval',
			start: new Date(atLocalTime(DAY, start)),
			end: new Date(atLocalTime(DAY, end))
		},
		note: '',
		schemaVersion: 1,
		createdAt: new Date(),
		updatedAt: new Date()
	});

const openDay = async (page: Page) => {
	await page.goto(`/#/dag/${DAY}`);
	await expect(page.getByRole('button', { name: /Tisdag 24 november/ })).toBeVisible();
};

const endOnServer = async (request: APIRequestContext, user: string, id: string) => {
	const entry = (await stored(request, user, 'entries')).find((e) => e.id === id);
	const time = (entry?.fields.time as { mapValue: { fields: Record<string, unknown> } })?.mapValue
		.fields;
	return time ? Date.parse((time.end as { timestampValue: string }).timestampValue) : null;
};

test('an interval is corrected and a gap marked as a pause', async ({ page, request }) => {
	const user = uid('dag');
	await seedAssignment(request, user, ['Utveckling', 'Möten']);
	await seedEntry(request, user, 'e1', '08:00', '11:45');
	await seedEntry(request, user, 'e2', '12:30', '16:00');
	await signIn(page, user);
	await openDay(page);

	await expect(page.getByText('Lucka 11:45–12:30')).toBeVisible();
	await page.getByRole('button', { name: /08:00–11:45/ }).click();
	const sheet = page.getByRole('dialog', { name: 'Ändra intervall' });
	await sheet.getByLabel('Slut').fill('12:00');
	await sheet.getByRole('button', { name: 'Spara' }).click();
	await expect(sheet).toBeHidden();
	await expect(page.getByRole('button', { name: /08:00–12:00/ })).toBeVisible();
	await expect.poll(() => endOnServer(request, user, 'e1')).toBe(atLocalTime(DAY, '12:00'));

	await page.getByRole('button', { name: 'Paus', exact: true }).click();
	await expect(page.getByText('Paus 12:00–12:30')).toBeVisible();
	await expect(page.getByText(/^Lucka/)).toBeHidden();
	await expect
		.poll(async () => (await stored(request, user, 'pauses')).map((p) => p.id))
		.toEqual([DAY]);
});

test('two overlapping intervals warn but are saved', async ({ page, request }) => {
	const user = uid('overlapp');
	await seedAssignment(request, user, ['Utveckling']);
	await seedEntry(request, user, 'e1', '09:00', '10:00');
	await signIn(page, user);
	await openDay(page);

	await page.getByRole('button', { name: 'Lägg till intervall' }).click();
	const sheet = page.getByRole('dialog', { name: 'Nytt intervall' });
	await sheet.getByLabel('Start').fill('09:30');
	await sheet.getByLabel('Slut').fill('10:15');
	await expect(sheet.getByText('Överlappar 09:00–10:00')).toBeVisible();
	await sheet.getByRole('button', { name: 'Spara' }).click();

	await expect(page.getByText('Två intervall överlappar')).toBeVisible();
	await expect(page.getByText('Överlapp', { exact: true })).toHaveCount(2);
	await expect.poll(async () => (await stored(request, user, 'entries')).length).toBe(2);
});

test('a correction in a sent week needs a reason and is logged', async ({ page, request }) => {
	const user = uid('skickad');
	await seedAssignment(request, user, ['Utveckling']);
	await seedEntry(request, user, 'e1', '08:00', '16:00');
	await seed(request, user, 'reports/a1_r1_2026-W48', {
		assignmentId: 'a1',
		receiverId: 'r1',
		week: '2026-W48',
		status: 'sent',
		mode: 'fillNorm',
		lines: [],
		snapshot: null,
		lastChangeId: null
	});
	await signIn(page, user);
	await expect(page.getByText('Ingen anslutning')).toBeHidden({ timeout: 10_000 });
	await openDay(page);

	await page.getByRole('button', { name: /08:00–16:00/ }).click();
	const sheet = page.getByRole('dialog', { name: 'Ändra intervall' });
	await expect(sheet.getByText('Veckan är skickad')).toBeVisible();
	await sheet.getByLabel('Slut').fill('16:30');
	const save = sheet.getByRole('button', { name: 'Spara' });
	await expect(save).toBeDisabled();
	await sheet.getByLabel('Skäl').fill('Glömde stoppa timern');
	await save.click();

	await expect.poll(() => endOnServer(request, user, 'e1')).toBe(atLocalTime(DAY, '16:30'));
	await expect
		.poll(async () =>
			(await stored(request, user, 'changeLog')).map(
				(c) => (c.fields.reason as { stringValue: string }).stringValue
			)
		)
		.toEqual(['Glömde stoppa timern']);
});

test('an interval from the evening before shows on its second day and keeps its day', async ({
	page,
	request
}) => {
	const user = uid('natt');
	await seedAssignment(request, user, ['Utveckling']);
	await seed(request, user, 'entries/e1', {
		assignmentId: 'a1',
		subject: { kind: 'code', codeId: 'c1' },
		time: {
			kind: 'interval',
			start: new Date(atLocalTime('2026-11-23', '22:00')),
			end: new Date(atLocalTime(DAY, '01:30'))
		},
		note: '',
		schemaVersion: 1,
		createdAt: new Date(),
		updatedAt: new Date()
	});
	await signIn(page, user);
	await openDay(page);

	await page.getByRole('button', { name: /22:00–01:30/ }).click();
	const sheet = page.getByRole('dialog', { name: 'Ändra intervall' });
	await sheet.getByLabel('Slut').fill('02:00');
	await sheet.getByRole('button', { name: 'Spara' }).click();
	await expect(page.getByRole('button', { name: /22:00–02:00/ })).toBeVisible();
	await expect.poll(() => endOnServer(request, user, 'e1')).toBe(atLocalTime(DAY, '02:00'));
});
