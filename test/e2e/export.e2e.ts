import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { seed, seedAssignment, signIn, stored, uid } from './hjalp.ts';

// The JSON export against the emulators (issue 21): the downloaded file holds every document the
// server has below the user, the changeLog and the nested codes and receivers included, with
// the times exact. Made-up data.

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

test('the export holds every document the server has', async ({ page, request }) => {
	const user = uid('export');
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

	await signIn(page, user);
	await page.goto('/#/installningar');
	const button = page.getByRole('button', { name: 'Exportera all data' });
	await expect(button).toBeEnabled({ timeout: 10_000 });
	const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
	expect(download.suggestedFilename()).toMatch(/^tidrapporten-\d{4}-\d{2}-\d{2}\.json$/);
	const file = JSON.parse(await readFile((await download.path())!, 'utf8')) as {
		app: string;
		schemaVersion: number;
		documents: Record<string, Record<string, unknown>>;
	};

	expect(file.app).toBe('Tidrapporten');
	expect(file.schemaVersion).toBe(1);
	const onServer: string[] = [];
	for (const path of COLLECTIONS) {
		for (const d of await stored(request, user, path)) onServer.push(`${path}/${d.id}`);
	}
	// The rules let the app read state document by document; the admin lists the collection.
	for (const d of await stored(request, user, 'state')) onServer.push(`state/${d.id}`);
	expect(Object.keys(file.documents).sort()).toEqual(onServer.sort());
	// The first sign-in wrote the default absence types; the seeded documents are all there.
	expect(onServer).toEqual(
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
