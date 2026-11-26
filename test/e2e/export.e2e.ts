import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { restore } from '../../scripts/aterstall.mjs';
import type { ExportFile } from '../../src/data/exportformat.ts';
import { DOCUMENTS, seed, seedAssignment, signIn, stored, uid, type StoredDoc } from './hjalp.ts';

// The JSON export against the emulators (issue 21): the downloaded file holds every document the
// server has below the user, the changeLog and the nested codes and receivers included, with
// the times exact; and restored with scripts/aterstall.mjs to another user, it is the same data.
// Made-up data.

const COLLECTIONS = [
	'assignments',
	'assignments/a1/codes',
	'assignments/a1/receivers',
	'absenceTypes',
	'freeDays',
	'entries',
	'pauses',
	'reports',
	'changeLog',
	'devices'
];

/** Made-up documents in every collection below the user. */
const seedEverything = async (request: APIRequestContext, user: string) => {
	await seedAssignment(request, user, ['Utveckling']);
	await seed(request, user, 'assignments/a1/receivers/r1', {
		name: 'Arbetsgivaren',
		position: 1,
		suggestionMode: 'fillNorm',
		codes: [{ id: 'A-1', name: '1001 Arbete' }],
		mapping: { c1: 'A-1' },
		archived: false
	});
	await seed(request, user, 'entries/e1', {
		assignmentId: 'a1',
		subject: { kind: 'code', codeId: 'c1' },
		time: {
			kind: 'interval',
			start: new Date('2026-11-16T07:00:00Z'),
			end: new Date('2026-11-16T15:30:00Z')
		},
		note: 'Påhittad anteckning',
		schemaVersion: 1
	});
	await seed(request, user, 'pauses/2026-11-16', {});
	await seed(request, user, 'changeLog/l1', {
		path: 'reports/a1_r1_2026-W47',
		action: 'unlock',
		week: '2026-W47',
		before: { status: 'sent' },
		after: { status: 'unlocked' },
		reason: 'Fel kod',
		by: 'app',
		at: new Date('2026-11-20T15:00:00Z')
	});
	await seed(request, user, 'reports/a1_r1_2026-W47', {
		assignmentId: 'a1',
		receiverId: 'r1',
		week: '2026-W47',
		status: 'draft',
		mode: 'fillNorm',
		lines: [{ receiverCodeId: 'A-1', minutesPerDay: [480, 0, 0, 0, 0, 0, 0] }],
		lastChangeId: null
	});
	await seed(request, user, 'state/settings', { flexWarning: 600 });
	await seed(request, user, 'devices/d1', { fcmToken: 'token-1', label: 'Telefon' });
};

/** Signs in, presses the export button and returns the downloaded file. */
const exportAll = async (page: Page, user: string) => {
	await signIn(page, user);
	await page.goto('/#/installningar');
	// The first sign-in writes the default absence types; the export waits for them.
	await expect(page.getByText(/^6 frånvarotyper/)).toBeVisible();
	const button = page.getByRole('button', { name: 'Exportera all data' });
	await expect(button).toBeEnabled({ timeout: 10_000 });
	const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
	expect(download.suggestedFilename()).toMatch(/^tidrapporten-\d{4}-\d{2}-\d{2}\.json$/);
	return JSON.parse(await readFile((await download.path())!, 'utf8')) as ExportFile;
};

/** Every document's path below the user, as the server has them. */
const onServer = async (request: APIRequestContext, user: string) => {
	const docs: Record<string, StoredDoc['fields']> = {};
	// The rules let the app read state document by document; the admin lists the collection.
	for (const path of [...COLLECTIONS, 'state']) {
		for (const d of await stored(request, user, path)) docs[`${path}/${d.id}`] = d.fields;
	}
	return docs;
};

test('the export holds every document the server has', async ({ page, request }) => {
	const user = uid('export');
	await seedEverything(request, user);
	const file = await exportAll(page, user);
	expect(file.app).toBe('Tidrapporten');
	expect(file.schemaVersion).toBe(1);
	const paths = Object.keys(await onServer(request, user));
	expect(Object.keys(file.documents).sort()).toEqual(paths.sort());
	// The first sign-in wrote the default absence types; the seeded documents are all there.
	expect(paths).toEqual(
		expect.arrayContaining([
			'absenceTypes/semester',
			'assignments/a1/codes/c1',
			'assignments/a1/receivers/r1',
			'changeLog/l1',
			'devices/d1',
			'pauses/2026-11-16',
			'reports/a1_r1_2026-W47',
			'state/settings'
		])
	);
	expect(file.documents['entries/e1']).toMatchObject({
		note: 'Påhittad anteckning',
		time: {
			kind: 'interval',
			start: { $timestamp: '2026-11-16T07:00:00.000000000Z' },
			end: { $timestamp: '2026-11-16T15:30:00.000000000Z' }
		}
	});
	expect(file.documents['changeLog/l1']).toMatchObject({ reason: 'Fel kod', action: 'unlock' });
});

test('a restored export is the same data, and the app shows it', async ({ page, request }) => {
	const user = uid('aterstall-fran');
	await seedEverything(request, user);
	const file = await exportAll(page, user);

	// Restored to a new, empty user: every document comes back with the same fields.
	const restoredUser = uid('aterstall-till');
	const count = await restore({ file, uid: restoredUser, base: DOCUMENTS, token: 'owner' });
	expect(count).toBe(Object.keys(file.documents).length);
	expect(await onServer(request, restoredUser)).toEqual(await onServer(request, user));
	// A user with data is never restored over.
	await expect(
		restore({ file, uid: restoredUser, base: DOCUMENTS, token: 'owner' })
	).rejects.toThrow('har redan data');

	const other = await page.context().browser()!.newContext();
	const restoredPage = await other.newPage();
	await signIn(restoredPage, restoredUser);
	await restoredPage.goto('/#/installningar');
	await expect(restoredPage.getByRole('link', { name: /Exempeluppdraget/ })).toBeVisible();
	await other.close();
});

test('the app puts back what is missing from a file and leaves the rest', async ({
	page,
	request
}) => {
	const user = uid('aterstall-appen');
	await seedEverything(request, user);
	const file = await exportAll(page, user);
	const before = await onServer(request, user);

	// An interval is deleted and a device renamed after the export.
	const deleted = await request.delete(`${DOCUMENTS}/users/${user}/entries/e1`, {
		headers: { Authorization: 'Bearer owner' }
	});
	expect(deleted.ok()).toBe(true);
	await seed(request, user, 'devices/d1', { fcmToken: 'token-1', label: 'Ny telefon' });

	const path = test.info().outputPath('export.json');
	await writeFile(path, JSON.stringify(file));
	await page.getByLabel('Fil att återställa').setInputFiles(path);
	const dialog = page.getByRole('alertdialog', { name: 'Återställa från filen?' });
	await expect(dialog).toContainText(`${Object.keys(file.documents).length} dokument`);
	await dialog.getByRole('button', { name: 'Återställ' }).click();
	await expect(page.getByText('1 dokument återställt')).toBeVisible({ timeout: 15_000 });

	const after = await onServer(request, user);
	expect(after['entries/e1']).toEqual(before['entries/e1']);
	expect(after['devices/d1']!.label).toEqual({ stringValue: 'Ny telefon' });
	const logs = Object.entries(after).filter(([p]) => p.startsWith('changeLog/'));
	expect(logs).toHaveLength(2);
	expect(logs.map(([, f]) => f.action)).toContainEqual({ stringValue: 'restore' });
});
