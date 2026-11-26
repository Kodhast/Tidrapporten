import { expect, test } from '@playwright/test';
import { signIn, stored, uid } from './hjalp.ts';

// The start at first use against the emulators (issue 64): a new user goes through the four
// steps, and the start page has the code and starts the timer. Made-up names only.

test('a new user gets an employer, a customer, an assignment and both receivers in four steps', async ({
	page,
	request
}) => {
	const user = uid('komigang');
	await signIn(page, user);
	await page.getByRole('link', { name: 'Kom igång' }).click();

	await page.getByLabel('Arbetsgivare').fill('Exempelkonsult AB');
	await page.getByRole('button', { name: 'Nästa' }).click();
	await page.getByLabel('Kundens namn').fill('Kund A');
	await page.getByRole('button', { name: 'Nästa' }).click();
	await page.getByLabel('Uppdragets namn').fill('Uppdrag A');
	await page.getByRole('button', { name: 'Nästa' }).click();
	await page.getByRole('button', { name: 'Lägg till tidkod' }).click();
	await page.getByRole('dialog').getByLabel('Namn').fill('Utveckling');
	await page.getByRole('dialog').getByRole('button', { name: 'Lägg till', exact: true }).click();
	// Nothing is saved before the last step.
	expect(await stored(request, user, 'employers')).toHaveLength(0);
	await page.getByRole('button', { name: 'Spara och börja' }).click();

	await expect(page.getByRole('button', { name: /^Byt tidkod/ })).toHaveText(/Utveckling/);
	await page.getByRole('button', { name: 'Starta timern' }).click();
	await expect(page.getByText('Pågår')).toBeVisible();

	expect(await stored(request, user, 'employers')).toHaveLength(1);
	expect(await stored(request, user, 'customers')).toHaveLength(1);

	// With an assignment the flow is not offered again, so no second employer is made.
	await page.goto('/#/kom-igang');
	await expect(page.getByText('Du har redan uppdrag.')).toBeVisible();

	await page.goto('/#/vecka');
	await expect(page.getByRole('link', { name: /1 · Exempelkonsult AB/ })).toBeVisible();
	await expect(page.getByRole('link', { name: /2 · Kund A/ })).toBeVisible();
});
