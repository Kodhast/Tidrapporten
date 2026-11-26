import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { dateOf, isoWeekOf } from '../../src/domain/tid.ts';
import { seed, seedAssignment, signIn, stored, uid, type StoredDoc } from './hjalp.ts';

// The timer against the emulators (issue 18): start, stop, a change of code, the sync between
// two tabs and offline. Made-up assignments and codes, written straight into the emulator.

const startButton = (page: Page) => page.getByRole('button', { name: 'Starta timern' });
const stopButton = (page: Page) => page.getByRole('button', { name: 'Stoppa timern' });
const chip = (page: Page) => page.getByRole('button', { name: /^Byt tidkod/ });

const millis = (value: unknown): number =>
	Date.parse((value as { timestampValue: string }).timestampValue);

/** An entry's start and end as the server has them. */
const span = (doc: StoredDoc) => {
	const time = (doc.fields.time as { mapValue: { fields: Record<string, unknown> } }).mapValue
		.fields;
	return { start: millis(time.start), end: millis(time.end) };
};

const entriesOnServer = (request: APIRequestContext, user: string) =>
	stored(request, user, 'entries');

const waitOnline = async (page: Page) =>
	expect(page.getByText('Ingen anslutning')).toBeHidden({ timeout: 10_000 });

test('start and stop give an interval named by the start', async ({ page, request }) => {
	const user = uid('timer');
	await seedAssignment(request, user, ['Utveckling']);
	await signIn(page, user);

	await expect(chip(page)).toHaveText(/Utveckling/);
	await expect(page.getByText('0 min', { exact: true })).toBeVisible();
	await expect(page.getByText('Pågår')).toBeHidden();
	await startButton(page).click();
	await expect(page.getByText('Pågår')).toBeVisible();
	await stopButton(page).click();
	await expect(startButton(page)).toBeVisible();

	await expect.poll(async () => (await entriesOnServer(request, user)).length).toBe(1);
	const [entry] = await entriesOnServer(request, user);
	expect(entry!.id).toBe(`timer-${span(entry!).start}`);
	expect(span(entry!).end - span(entry!).start).toBeGreaterThanOrEqual(60_000);
});

test('the app icon’s shortcuts start and stop the timer once (issue 59)', async ({
	page,
	request
}) => {
	const user = uid('genvag');
	await seedAssignment(request, user, ['Utveckling']);
	await signIn(page, user);
	// The page has its data before it is left, so that the next one does not wait for the cache
	// that this one still holds.
	await expect(startButton(page)).toBeVisible();

	await page.goto('/?gor=starta');
	await expect(page.getByText('Pågår')).toBeVisible();
	await expect(page).toHaveURL(/\/$/);
	await expect
		.poll(async () => (await stored(request, user, 'state')).some((d) => d.id === 'timer'))
		.toBe(true);
	// A reload does not start again: the address has no action left.
	await page.reload();
	await expect(stopButton(page)).toBeVisible();

	await page.goto('/?gor=stoppa');
	await expect(startButton(page)).toBeVisible();
	await expect(page).toHaveURL(/\/$/);
	await expect.poll(async () => (await entriesOnServer(request, user)).length).toBe(1);
});

test('a change of code ends the interval and goes on from its end', async ({ page, request }) => {
	const user = uid('byte');
	await seedAssignment(request, user, ['Utveckling', 'Möten']);
	// Started ten minutes ago: within the first minute a change only renames the timer.
	await seed(request, user, 'state/timer', {
		assignmentId: 'a1',
		subject: { kind: 'code', codeId: 'c1' },
		start: new Date(Date.now() - 10 * 60_000),
		schemaVersion: 1,
		createdAt: new Date(),
		updatedAt: new Date()
	});
	await signIn(page, user);

	await expect(stopButton(page)).toBeVisible();
	await chip(page).click();
	const sheet = page.getByRole('dialog', { name: 'Välj tidkod' });
	await sheet.getByRole('button', { name: /^Möten/ }).click();
	await expect(sheet).toBeHidden();
	await expect(chip(page)).toHaveText(/Möten/);
	await stopButton(page).click();
	await expect(startButton(page)).toBeVisible();

	await expect.poll(async () => (await entriesOnServer(request, user)).length).toBe(2);
	const [first, second] = (await entriesOnServer(request, user))
		.map((e) => ({ ...span(e), code: JSON.stringify(e.fields.subject) }))
		.sort((a, b) => a.start - b.start);
	expect(first!.end).toBe(second!.start);
	expect(first!.code).toContain('c1');
	expect(second!.code).toContain('c2');
	// The next start uses the latest code.
	await expect(chip(page)).toHaveText(/Möten/);
});

// Two browser contexts, as two devices: two tabs share Firestore's cache, where a timer started
// in one tab can show in the other before the server has it and then vanish for a moment.
test('a start on one device shows on the other', async ({ page, browser, request }) => {
	const user = uid('synk');
	await seedAssignment(request, user, ['Utveckling']);
	await signIn(page, user);
	const device = await browser.newContext({ baseURL: test.info().project.use.baseURL });
	const other = await device.newPage();
	await signIn(other, user);
	await expect(startButton(other)).toBeVisible();

	await startButton(page).click();
	await expect(stopButton(other)).toBeVisible({ timeout: 5_000 });
	await stopButton(other).click();
	await expect(startButton(page)).toBeVisible({ timeout: 5_000 });
	await device.close();
});

test('start and stop offline reach Firestore once online', async ({ page, context, request }) => {
	const user = uid('offline');
	await seedAssignment(request, user, ['Utveckling']);
	await signIn(page, user);
	await waitOnline(page);
	await expect(startButton(page)).toBeVisible();

	await context.setOffline(true);
	await expect(page.getByText('Ingen anslutning')).toBeVisible();
	await startButton(page).click();
	await expect(stopButton(page)).toBeVisible();
	await stopButton(page).click();
	await expect(startButton(page)).toBeVisible();
	expect(await entriesOnServer(request, user)).toHaveLength(0);

	await context.setOffline(false);
	await expect
		.poll(async () => (await entriesOnServer(request, user)).length, { timeout: 15_000 })
		.toBe(1);
	expect(await stored(request, user, 'state')).toHaveLength(0);
});

test('offline the timer cannot be stopped into a sent week', async ({ page, context, request }) => {
	const user = uid('last');
	await seedAssignment(request, user, ['Utveckling']);
	// This week and the week a few minutes on, so that a run just before Monday midnight holds.
	const weeks = new Set([Date.now(), Date.now() + 5 * 60_000].map((t) => isoWeekOf(dateOf(t))));
	for (const week of weeks) {
		await seed(request, user, `reports/a1_r1_${week}`, {
			assignmentId: 'a1',
			receiverId: 'r1',
			week,
			status: 'sent',
			mode: 'fillNorm',
			lines: [],
			snapshot: null,
			lastChangeId: null
		});
	}
	await signIn(page, user);
	await waitOnline(page);
	await startButton(page).click();
	await expect(stopButton(page)).toBeVisible();

	await context.setOffline(true);
	await expect(page.getByText('Ingen anslutning')).toBeVisible();
	await stopButton(page).click();
	await expect(page.getByText('Veckan är skickad')).toBeVisible();
	await expect(stopButton(page)).toBeVisible();

	// Online the stop goes through, with a log entry since the week is sent.
	await context.setOffline(false);
	await waitOnline(page);
	await stopButton(page).click();
	await expect(startButton(page)).toBeVisible();
	await expect.poll(async () => (await entriesOnServer(request, user)).length).toBe(1);
	await expect.poll(async () => (await stored(request, user, 'changeLog')).length).toBe(1);
});
