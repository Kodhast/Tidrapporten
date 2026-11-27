import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { atLocalTime } from '../../src/domain/tid.ts';
import { seed, signIn, stored, uid, type StoredDoc } from './hjalp.ts';

// The week report against the emulators (issue 20): suggestion, change, send and lock, unlock
// with a reason and send again, each locked change in the log, and no send offline. A made-up
// assignment that ran only in week 47 of 2026 (16–22 November, without holidays), so that the
// week is the same whatever day the test runs.

const WEEK = '2026-W47';

const seedWeek = async (request: APIRequestContext, user: string) => {
	await seed(request, user, 'assignments/a1', {
		name: 'Uppdrag A',
		startDate: '2026-11-16',
		endDate: '2026-11-22',
		terms: [{ from: '2026-11-16', scopePercent: 100, workdayMinutes: 480 }],
		openingFlex: 0,
		standardDay: [],
		archived: false,
		order: 0,
		lastChangeId: null
	});
	await seed(request, user, 'assignments/a1/codes/c1', {
		name: 'Utveckling',
		billable: true,
		archived: false,
		order: 0
	});
	await seed(request, user, 'assignments/a1/receivers/r1', {
		name: 'Arbetsgivaren',
		position: 1,
		suggestionMode: 'fillNorm',
		codes: [{ id: 'A-1', name: '1001 Arbete' }],
		mapping: { c1: 'A-1' },
		archived: false
	});
	// 8 h 30 min a day, Monday to Friday: 42,5 h.
	for (const date of ['16', '17', '18', '19', '20'].map((d) => `2026-11-${d}`)) {
		await seed(request, user, `entries/${date}`, {
			assignmentId: 'a1',
			subject: { kind: 'code', codeId: 'c1' },
			time: {
				kind: 'interval',
				start: new Date(atLocalTime(date, '08:00')),
				end: new Date(atLocalTime(date, '16:30'))
			},
			note: '',
			schemaVersion: 1,
			createdAt: new Date(),
			updatedAt: new Date()
		});
	}
};

const openWeek = async (page: Page) => {
	await page.goto(`/#/vecka/${WEEK}`);
	await expect(page.getByRole('heading', { level: 1, name: 'Veckan' })).toBeVisible();
};

const reportOnServer = async (request: APIRequestContext, user: string) => {
	const [report] = await stored(request, user, 'reports');
	return report;
};

const status = (doc: StoredDoc | undefined) =>
	(doc?.fields.status as { stringValue: string } | undefined)?.stringValue;

/** The week's sum of the stored report's lines. */
const sum = (doc: StoredDoc | undefined) => {
	type Values = { arrayValue: { values?: Record<string, unknown>[] } };
	const lines = (doc?.fields.lines as Values).arrayValue.values ?? [];
	return lines
		.flatMap((line) =>
			(
				(line as { mapValue: { fields: { minutesPerDay: Values } } }).mapValue.fields.minutesPerDay
					.arrayValue.values ?? []
			).map((v) => Number((v as { integerValue: string }).integerValue))
		)
		.reduce((a, b) => a + b, 0);
};

test('suggest, send and lock, then unlock with a reason and send again', async ({
	page,
	request
}) => {
	const user = uid('vecka');
	await seedWeek(request, user);
	await signIn(page, user);
	await openWeek(page);
	await expect(page.getByText('1 rapport att skicka')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Uppdrag A · 42,5 h' })).toBeVisible();

	// Filled to the norm: 40 h, and a quarter more (ADR 0013).
	await page.getByRole('link', { name: /1 · Arbetsgivaren/ }).click();
	await expect(page.getByRole('heading', { name: 'Arbetsgivaren · vecka 47' })).toBeVisible();
	await expect(
		page.getByText('Normen för Uppdrag A är 40 h, så 2,5 h går till flexen.')
	).toBeVisible();
	await page.getByRole('button', { name: 'Öka 1001 Arbete' }).click();
	await page.getByRole('link', { name: 'Visa avskriften' }).click();
	await expect(page.getByRole('heading', { name: 'Avskrift · Arbetsgivaren' })).toBeVisible();
	await expect(page.getByRole('row', { name: /^Totalt/ })).toContainText('40,25');
	await page.getByRole('button', { name: 'Markera som skickad' }).click();
	await expect(page.getByText(/^Skickad .* · låst$/)).toBeVisible();
	await expect(page.getByRole('button', { name: 'Markera som skickad' })).toBeHidden();
	await expect.poll(async () => status(await reportOnServer(request, user))).toBe('sent');
	expect(sum(await reportOnServer(request, user))).toBe(40.25 * 60);
	expect(await stored(request, user, 'changeLog')).toHaveLength(0);

	// Unlock: a reason is required, and the unlock is logged.
	await page.getByRole('button', { name: 'Lås upp' }).click();
	const dialog = page.getByRole('alertdialog', { name: 'Lås upp rapporten?' });
	await expect(dialog.getByRole('button', { name: 'Lås upp' })).toBeDisabled();
	await dialog.getByRole('textbox', { name: 'Skäl' }).fill('Fel antal timmar');
	await dialog.getByRole('button', { name: 'Lås upp' }).click();
	await expect(page.getByRole('heading', { name: 'Arbetsgivaren · vecka 47' })).toBeVisible();
	await expect.poll(async () => status(await reportOnServer(request, user))).toBe('unlocked');
	expect(await stored(request, user, 'changeLog')).toHaveLength(1);

	// The change and the new send are logged too, with the unlock's reason.
	await page.getByRole('button', { name: 'Minska 1001 Arbete' }).click();
	await page.getByRole('link', { name: 'Visa avskriften' }).click();
	await page.getByRole('button', { name: 'Markera som skickad' }).click();
	await expect(page.getByText(/^Skickad .* · låst$/)).toBeVisible();
	await expect.poll(async () => status(await reportOnServer(request, user))).toBe('sent');
	expect(sum(await reportOnServer(request, user))).toBe(40 * 60);
	const log = await stored(request, user, 'changeLog');
	expect(log.map((e) => (e.fields.action as { stringValue: string }).stringValue).sort()).toEqual([
		'send',
		'unlock'
	]);
	for (const entry of log) {
		expect((entry.fields.reason as { stringValue: string }).stringValue).toBe('Fel antal timmar');
	}

	await page.getByRole('link', { name: 'Tillbaka' }).click();
	await expect(page.getByText('Inga rapporter att skicka')).toBeVisible();
	await expect(page.getByText('Låst')).toBeVisible();
});

test('offline a report cannot be sent', async ({ page, context, request }) => {
	const user = uid('vecka-offline');
	await seedWeek(request, user);
	await signIn(page, user);
	await expect(page.getByText('Ingen anslutning')).toBeHidden({ timeout: 10_000 });
	await page.goto(`/#/vecka/${WEEK}/a1/r1/avskrift`);
	await expect(page.getByRole('button', { name: 'Markera som skickad' })).toBeEnabled();

	await context.setOffline(true);
	await expect(page.getByText('Ingen anslutning')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Markera som skickad' })).toBeDisabled();
	expect(await stored(request, user, 'reports')).toHaveLength(0);
});

test('the basis for the week shows actual against reported and prints', async ({
	page,
	request
}) => {
	const user = uid('underlag');
	await seedWeek(request, user);
	await signIn(page, user);
	await openWeek(page);

	// Send the suggestion as it is: 40 h against 42,5 h actual.
	await page.getByRole('link', { name: /1 · Arbetsgivaren/ }).click();
	await page.getByRole('link', { name: 'Visa avskriften' }).click();
	await page.getByRole('button', { name: 'Markera som skickad' }).click();
	await expect(page.getByText(/^Skickad .* · låst$/)).toBeVisible();

	await openWeek(page);
	await page.getByRole('link', { name: 'Underlag för veckan' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Underlag' })).toBeVisible();
	await expect(page.getByText(/^Faktisk 42,5 h · rapporterad 40 h · skickad /)).toBeVisible();
	await expect(page.getByText('−2,5 h')).toBeVisible();
	await expect(page.getByText('Måndag 16 november · 8 h 30 min')).toBeVisible();
	await expect(page.getByText('Fredag 20 november · 8 h 30 min')).toBeVisible();
	await expect(page.getByText('Inga ändringar i loggen.')).toBeVisible();

	// The print dialog is replaced by a counter, since a test cannot press its buttons.
	type Printing = { printed: number; print: () => void };
	await page.evaluate(() => {
		const page = globalThis as unknown as Printing;
		page.printed = 0;
		page.print = () => {
			page.printed += 1;
		};
	});
	await page.getByRole('button', { name: 'Skriv ut' }).click();
	expect(await page.evaluate(() => (globalThis as unknown as Printing).printed)).toBe(1);

	// On paper the buttons and the week picker are gone, and the week is named in a heading.
	await page.emulateMedia({ media: 'print' });
	await expect(page.getByRole('button', { name: 'Skriv ut' })).toBeHidden();
	await expect(page.getByRole('button', { name: 'Föregående vecka' })).toBeHidden();
	await expect(page.getByRole('heading', { name: /^Underlag · Vecka 47/ })).toBeVisible();
});
