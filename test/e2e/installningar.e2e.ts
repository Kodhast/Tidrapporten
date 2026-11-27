import { expect, test, type Page } from '@playwright/test';
import { seedAssignment, signIn, stored, uid } from './hjalp.ts';

// The settings against the emulators (issue 17). Made-up names only; every test signs in as a
// user of its own so that the tests do not see each other's data.

const save = (page: Page) => page.getByRole('button', { name: 'Spara', exact: true });

const addInSheet = async (page: Page, button: string, field: string, name: string) => {
	await page.getByRole('button', { name: button, exact: true }).click();
	const sheet = page.getByRole('dialog');
	await sheet.getByLabel(field).fill(name);
	await sheet.getByRole('button', { name: 'Lägg till', exact: true }).click();
	await expect(sheet).toBeHidden();
};

const mapCode = async (page: Page, internal: string, target: string) => {
	await page.getByRole('button', { name: new RegExp(`^${internal}`) }).click();
	await page.getByRole('dialog').getByRole('button', { name: target }).click();
	await expect(page.getByRole('dialog')).toBeHidden();
};

const addReceiver = async (page: Page, name: string, code: string) => {
	await page.getByRole('link', { name: 'Lägg till mottagare' }).click();
	// The assignment view has a Namn field too: wait until the receiver view is shown.
	await expect(page.getByRole('heading', { level: 1, name: 'Ny mottagare' })).toBeVisible();
	await page.getByLabel('Namn').fill(name);
	await addInSheet(page, 'Lägg till kod', 'Kod och namn', code);
	await mapCode(page, 'Utveckling', code);
	await mapCode(page, 'Intern tid', code);
	await save(page).click();
	await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
	await expect(save(page)).toBeDisabled();
	await page.getByRole('link', { name: 'Tillbaka' }).click();
};

const addParty = async (page: Page, link: string, field: string, name: string) => {
	await page.getByRole('link', { name: link }).click();
	await page.getByLabel(field).fill(name);
	await save(page).click();
	await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
	await page.getByRole('link', { name: 'Tillbaka' }).click();
};

test('an employer, a customer and an assignment that gets both as receivers (ADR 0019)', async ({
	page
}) => {
	await signIn(page, uid('installningar'));
	await page.getByRole('button', { name: /^Konto och inställningar/ }).click();
	await page.getByRole('menuitem', { name: 'Inställningar' }).click();
	await addParty(page, 'Lägg till arbetsgivare', 'Arbetsgivare', 'Exempelkonsult AB');
	await addParty(page, 'Lägg till kund', 'Kund', 'Kund A');
	await expect(page.getByRole('link', { name: /Kund A/ })).toContainText('Inga uppdrag än');

	await page.getByRole('link', { name: 'Lägg till uppdrag' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Nytt uppdrag' })).toBeVisible();
	await page.getByLabel('Namn').fill('Exempeluppdraget');
	await page.getByLabel('Omfattning').fill('80');
	await page.getByLabel('Ingående flexsaldo').fill('4,5');
	// The only employer is chosen from the start.
	await expect(page.getByRole('button', { name: /^Arbetsgivare/ })).toContainText(
		'Exempelkonsult AB'
	);
	await page.getByRole('button', { name: /^Kund/ }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Kund A' }).click();
	await expect(page.getByRole('switch', { name: /Kunden får också veckorapporten/ })).toBeChecked();
	await addInSheet(page, 'Lägg till tidkod', 'Namn', 'Utveckling');
	await page.getByRole('button', { name: 'Lägg till tidkod' }).click();
	await page.getByRole('dialog').getByLabel('Namn').fill('Intern tid');
	await page.getByRole('dialog').getByRole('switch', { name: 'Debiterbar' }).uncheck();
	await page.getByRole('dialog').getByRole('button', { name: 'Lägg till', exact: true }).click();
	await save(page).click();
	await expect(page.getByRole('link', { name: 'Lägg till mottagare' })).toBeVisible();

	await addReceiver(page, 'Mellanhanden', 'M-1 Konsult');

	await page.reload();
	await expect(page.getByRole('heading', { level: 1, name: 'Exempeluppdraget' })).toBeVisible();
	await expect(page.getByLabel('Omfattning')).toHaveValue('80');
	await expect(page.getByLabel('Ingående flexsaldo')).toHaveValue('+4,5');
	await expect(page.getByRole('button', { name: /^Intern tid/ })).toContainText('Inte debiterbar');
	await expect(page.getByRole('button', { name: /^Utveckling/ })).toContainText('Debiterbar');
	await expect(page.getByRole('link', { name: /1 · Exempelkonsult AB/ })).toContainText(
		'flexen räknas härifrån'
	);
	await expect(page.getByRole('link', { name: /3 · Mellanhanden/ })).toBeVisible();
	// The customer's codes are ours, mapped one to one.
	await page.getByRole('link', { name: /2 · Kund A/ }).click();
	await expect(page.getByRole('button', { name: /^Utveckling/ })).toContainText('→ Utveckling');
	await expect(page.getByRole('button', { name: /^Intern tid/ })).toContainText('→ Intern tid');

	await page.getByRole('link', { name: 'Tillbaka' }).click();
	await page.getByRole('link', { name: 'Tillbaka' }).click();
	await expect(page.getByRole('heading', { level: 2, name: 'Exempelkonsult AB' })).toBeVisible();
	await expect(page.getByRole('link', { name: /Exempeluppdraget/ })).toContainText('Kund A · 80 %');
	await expect(page.getByRole('link', { name: /^Kund A/ })).toContainText('1 uppdrag');
});

test('an end, terms from a day in the past and a renamed code, logged (#79)', async ({
	page,
	request
}) => {
	const user = uid('andra-uppdrag');
	await signIn(page, user);
	await seedAssignment(request, user, ['Utveckling']);
	await page.goto('/#/installningar/uppdrag/a1');
	await expect(page.getByRole('heading', { level: 1, name: 'Exempeluppdraget' })).toBeVisible();

	await page.getByLabel('Omfattning', { exact: true }).fill('80');
	await page.getByLabel('Omfattning och arbetsdag gäller från').fill('2026-10-05');
	await page.getByLabel('Slutdatum').fill('2027-06-30');
	await page.getByRole('button', { name: /^Utveckling/ }).click();
	const sheet = page.getByRole('dialog');
	await sheet.getByLabel('Namn').fill('Systemutveckling');
	await sheet.getByRole('button', { name: 'Klar' }).click();
	await expect(sheet).toBeHidden();
	await save(page).click();
	// Disabled also while the write is on its way: wait until the server has it.
	await expect
		.poll(async () => (await stored(request, user, 'assignments'))[0]?.fields.endDate)
		.toEqual({ stringValue: '2027-06-30' });

	await page.reload();
	await expect(page.getByLabel('Slutdatum')).toHaveValue('2027-06-30');
	await expect(page.getByRole('button', { name: /^Systemutveckling/ })).toBeVisible();
	const [a] = await stored(request, user, 'assignments');
	const terms = (
		a!.fields.terms as { arrayValue: { values: { mapValue: { fields: unknown } }[] } }
	).arrayValue.values.map((t) => t.mapValue.fields);
	expect(terms).toEqual([
		expect.objectContaining({ from: { stringValue: '2026-01-01' } }),
		expect.objectContaining({
			from: { stringValue: '2026-10-05' },
			scopePercent: { integerValue: '80' }
		})
	]);
	const log = await stored(request, user, 'changeLog');
	expect(log.map((e) => e.fields.path)).toContainEqual({ stringValue: 'assignments/a1' });
});

test('the default absence types are there at the first sign-in', async ({ page }) => {
	await signIn(page, uid('franvaro'));
	await page.goto('/#/installningar/franvaro');
	for (const name of [
		'Semester',
		'Sjukdom',
		'Tjänstledighet',
		'Bänktid',
		'Komptid',
		'Utbildning'
	]) {
		await expect(page.getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible();
	}
	await expect(page.getByRole('button', { name: /^Komptid/ })).toContainText('Tas ur flexen');
});

test('nothing can be saved offline, and the view says why', async ({ page, context }) => {
	await signIn(page, uid('offline'));
	await page.goto('/#/installningar/arbetsgivare/ny');
	await page.getByLabel('Arbetsgivare').fill('Exempelkonsult AB');
	await expect(save(page)).toBeEnabled();

	await context.setOffline(true);
	await expect(page.getByText('Ingen anslutning')).toBeVisible();
	await expect(save(page)).toBeDisabled();

	await context.setOffline(false);
	await expect(save(page)).toBeEnabled();
});

test('a reminder that is turned off stays off after a reload (issue 22)', async ({ page }) => {
	await signIn(page, uid('paminnelser'));
	await page.getByRole('button', { name: /^Konto och inställningar/ }).click();
	await page.getByRole('menuitem', { name: 'Inställningar' }).click();
	await page.getByRole('link', { name: /^Påminnelser/ }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Påminnelser' })).toBeVisible();
	const late = page.getByRole('switch', { name: 'Timern går sent' });
	await expect(late).toBeChecked();
	// Controlled by the saved value, so the state changes when the save is back.
	await late.click();
	await expect(late).not.toBeChecked();
	await page.reload();
	await expect(page.getByRole('switch', { name: 'Timern går sent' })).not.toBeChecked();
	await expect(page.getByRole('switch', { name: 'Ingen timer igång' })).toBeChecked();
});
