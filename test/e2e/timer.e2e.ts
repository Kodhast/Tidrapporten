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
	await expect(page.getByText('Timern står still')).toBeVisible();
	await startButton(page).click();
	await expect(page.getByText(/^Startad \d\d:\d\d · Exempeluppdraget$/)).toBeVisible();
	await stopButton(page).click();
	await expect(startButton(page)).toBeVisible();

	await expect.poll(async () => (await entriesOnServer(request, user)).length).toBe(1);
	const [entry] = await entriesOnServer(request, user);
	expect(entry!.id).toBe(`timer-${span(entry!).start}`);
	expect(span(entry!).end - span(entry!).start).toBeGreaterThanOrEqual(60_000);
});

test('a change of code ends the interval and goes on from its end', async ({ page, request }) => {
	const user = uid('byte');
	await seedAssignment(request, user, ['Utveckling', 'Möten']);
	await signIn(page, user);

	await startButton(page).click();
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

test('a start in one tab shows in the other', async ({ page, context, request }) => {
	const user = uid('synk');
	await seedAssignment(request, user, ['Utveckling']);
	await signIn(page, user);
	const other = await context.newPage();
	await signIn(other, user);
	await expect(startButton(other)).toBeVisible();

	await startButton(page).click();
	await expect(stopButton(other)).toBeVisible({ timeout: 5_000 });
	await stopButton(other).click();
	await expect(startButton(page)).toBeVisible({ timeout: 5_000 });
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
	const week = isoWeekOf(dateOf(Date.now()));
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
