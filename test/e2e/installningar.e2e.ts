import { expect, test, type Page } from '@playwright/test';
import { signIn, uid } from './hjalp.ts';

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

test('an assignment with two codes and two mapped receivers is still there after a reload', async ({
	page
}) => {
	await signIn(page, uid('installningar'));
	await page.getByRole('link', { name: 'Inställningar' }).click();
	await page.getByRole('link', { name: 'Lägg till uppdrag' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Nytt uppdrag' })).toBeVisible();

	await page.getByLabel('Namn').fill('Exempeluppdraget');
	await page.getByLabel('Omfattning').fill('80');
	await page.getByLabel('Ingående flexsaldo').fill('4,5');
	await addInSheet(page, 'Lägg till tidkod', 'Namn', 'Utveckling');
	await page.getByRole('button', { name: 'Lägg till tidkod' }).click();
	await page.getByRole('dialog').getByLabel('Namn').fill('Intern tid');
	await page.getByRole('dialog').getByRole('switch', { name: 'Debiterbar' }).uncheck();
	await page.getByRole('dialog').getByRole('button', { name: 'Lägg till', exact: true }).click();
	await save(page).click();
	await expect(page.getByRole('link', { name: 'Lägg till mottagare' })).toBeVisible();

	await addReceiver(page, 'Arbetsgivaren', '1001 Arbete');
	await addReceiver(page, 'Kund A', 'K-10 Utveckling');

	await page.reload();
	await expect(page.getByRole('heading', { level: 1, name: 'Exempeluppdraget' })).toBeVisible();
	await expect(page.getByLabel('Omfattning')).toHaveValue('80');
	await expect(page.getByLabel('Ingående flexsaldo')).toHaveValue('+4,5');
	await expect(page.getByRole('switch', { name: /Intern tid/ })).not.toBeChecked();
	await expect(page.getByRole('switch', { name: /Utveckling/ })).toBeChecked();
	await expect(page.getByRole('link', { name: /1 · Arbetsgivaren/ })).toContainText(
		'flexen räknas härifrån'
	);
	await page.getByRole('link', { name: /2 · Kund A/ }).click();
	await expect(page.getByRole('button', { name: /^Utveckling/ })).toContainText(
		'→ K-10 Utveckling'
	);
	await expect(page.getByRole('button', { name: /^Intern tid/ })).toContainText(
		'→ K-10 Utveckling'
	);

	await page.getByRole('link', { name: 'Tillbaka' }).click();
	await page.getByRole('link', { name: 'Tillbaka' }).click();
	await expect(page.getByRole('link', { name: /Exempeluppdraget/ })).toContainText(
		'80 % · 2 tidkoder · 2 mottagare'
	);
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
	await page.goto('/#/installningar/uppdrag/ny');
	await page.getByLabel('Namn').fill('Exempeluppdraget');
	await expect(save(page)).toBeEnabled();

	await context.setOffline(true);
	await expect(page.getByText('Ingen anslutning')).toBeVisible();
	await expect(save(page)).toBeDisabled();

	await context.setOffline(false);
	await expect(save(page)).toBeEnabled();
});
