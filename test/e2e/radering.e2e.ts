import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { ExportFile } from '../../src/data/exportformat.ts';
import { seed, seedAssignment, signIn, stored, uid } from './hjalp.ts';

// Emptying the account and deleting an assignment (issue 26) against the emulators, the
// functions tomKonto and raderaUppdrag included. Made-up data.

const entry = (assignmentId: string) => ({
	assignmentId,
	subject: { kind: 'code', codeId: 'c1' },
	time: {
		kind: 'interval',
		start: new Date('2026-11-16T07:00:00Z'),
		end: new Date('2026-11-16T15:00:00Z')
	},
	note: '',
	schemaVersion: 1
});

test('emptying downloads a copy first, then leaves only the defaults', async ({
	page,
	request
}) => {
	const user = uid('tomning');
	await seedAssignment(request, user, ['Utveckling']);
	await seed(request, user, 'entries/e1', entry('a1'));
	await seed(request, user, 'changeLog/l1', { path: 'entries/e1', action: 'create' });
	await signIn(page, user);
	await page.goto('/#/installningar');
	await expect(page.getByText(/^6 frånvarotyper/)).toBeVisible();

	await page.getByRole('button', { name: 'Töm kontot' }).click();
	const dialog = page.getByRole('alertdialog', { name: 'Töm kontot?' });
	const confirm = dialog.getByRole('button', { name: 'Ladda ner och töm' });
	await expect(confirm).toBeDisabled();
	await dialog.getByLabel('Skriv TÖM').fill('TÖM');
	const [download] = await Promise.all([page.waitForEvent('download'), confirm.click()]);
	const file = JSON.parse(await readFile((await download.path())!, 'utf8')) as ExportFile;
	expect(Object.keys(file.documents)).toEqual(
		expect.arrayContaining(['assignments/a1', 'entries/e1', 'changeLog/l1'])
	);

	await expect(page.getByRole('heading', { level: 1, name: 'Idag' })).toBeVisible({
		timeout: 15_000
	});
	await expect(page.getByRole('link', { name: 'Kom igång' })).toBeVisible();
	for (const path of ['assignments', 'entries', 'changeLog'])
		expect(await stored(request, user, path)).toEqual([]);
	expect(await stored(request, user, 'absenceTypes')).toHaveLength(6);
});

test('an assignment is deleted with its time and logged; one with a sent week is not', async ({
	page,
	request
}) => {
	const user = uid('radera-uppdrag');
	await seedAssignment(request, user, ['Utveckling']);
	await seed(request, user, 'entries/e1', entry('a1'));
	await seedAssignment(request, user, ['Drift'], 'a2', 'Andra uppdraget');
	await seed(request, user, 'reports/a2_r1_2026-W47', {
		assignmentId: 'a2',
		receiverId: 'r1',
		week: '2026-W47',
		status: 'sent',
		mode: 'fillNorm',
		lines: [],
		lastChangeId: null
	});
	await signIn(page, user);

	const remove = async (id: string) => {
		await page.goto(`/#/installningar/uppdrag/${id}`);
		await page.getByRole('button', { name: 'Radera uppdraget' }).click();
		const dialog = page.getByRole('alertdialog', { name: 'Radera uppdraget?' });
		await dialog.getByRole('button', { name: 'Radera' }).click();
	};

	await remove('a2');
	await expect(
		page.getByText('Uppdraget har skickade veckor. Arkivera det i stället.')
	).toBeVisible({ timeout: 15_000 });

	await remove('a1');
	await expect(page.getByRole('heading', { level: 1, name: 'Inställningar' })).toBeVisible({
		timeout: 15_000
	});
	await expect(page.getByRole('link', { name: /Exempeluppdraget/ })).toHaveCount(0);
	await expect(page.getByRole('link', { name: /Andra uppdraget/ })).toBeVisible();
	expect((await stored(request, user, 'assignments')).map((d) => d.id)).toEqual(['a2']);
	expect(await stored(request, user, 'entries')).toEqual([]);
	const logs = await stored(request, user, 'changeLog');
	expect(logs.map((l) => [l.fields.path, l.fields.action])).toContainEqual([
		{ stringValue: 'assignments/a1' },
		{ stringValue: 'delete' }
	]);
});

test('a code with time is archived, an unused one deleted, both logged (#80)', async ({
	page,
	request
}) => {
	const user = uid('radera-del');
	await seedAssignment(request, user, ['Utveckling', 'Oanvänd']);
	await seed(request, user, 'entries/e1', entry('a1'));
	await signIn(page, user);
	await page.goto('/#/installningar/uppdrag/a1');
	const sheet = page.getByRole('dialog');
	const remove = async () => {
		await sheet.getByRole('button', { name: 'Radera tidkoden' }).click();
		await page
			.getByRole('alertdialog', { name: 'Radera tidkoden?' })
			.getByRole('button', { name: 'Radera' })
			.click();
	};

	await page.getByRole('button', { name: /^Utveckling/ }).click();
	await remove();
	await expect(sheet.getByText('Tidkoden används. Arkivera i stället.')).toBeVisible();
	await sheet.getByRole('button', { name: 'Arkivera tidkoden' }).click();
	await page.getByRole('button', { name: 'Spara', exact: true }).click();
	await expect
		.poll(async () => (await stored(request, user, 'assignments/a1/codes'))[0]?.fields.archived)
		.toEqual({ booleanValue: true });

	await page.getByRole('button', { name: /^Oanvänd/ }).click();
	await remove();
	await expect(page.getByRole('button', { name: /^Oanvänd/ })).toBeHidden();
	expect((await stored(request, user, 'assignments/a1/codes')).map((c) => c.id)).toEqual(['c1']);
	const log = await stored(request, user, 'changeLog');
	expect(log.map((e) => e.fields.path)).toContainEqual({
		stringValue: 'assignments/a1/codes/c2'
	});
});
