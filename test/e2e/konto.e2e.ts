import { expect, test } from '@playwright/test';
import pkg from '../../package.json' with { type: 'json' };
import { signIn, uid } from './hjalp.ts';

// The account at the top right (issue 66): the avatar's menu, Inställningar from it, Om and Logga ut.

test('the avatar opens Kodhäst’s menu under it, which leads to the settings and back', async ({
	page
}) => {
	await signIn(page, uid('konto'));
	await expect(page.getByRole('link', { name: 'Inställningar' })).toHaveCount(0);
	const avatar = page.getByRole('button', { name: /^Konto och inställningar/ });
	await avatar.click();
	const menu = page.getByRole('menu', { name: 'Konto' });
	await expect(menu).toBeVisible();
	await expect(menu.getByRole('menuitem')).toHaveText([
		'Inställningar',
		'Om Tidrapporten',
		'Logga ut'
	]);
	// Anchored under the avatar and lined up with its end, without kh.js.
	const [a, m] = [await avatar.boundingBox(), await page.locator('.kh-menu').boundingBox()];
	expect(m!.y).toBeGreaterThanOrEqual(a!.y + a!.height - 1);
	expect(Math.abs(m!.x + m!.width - (a!.x + a!.width))).toBeLessThan(2);
	await page.keyboard.press('Escape');
	await expect(menu).toBeHidden();

	await avatar.click();
	await page.getByRole('menuitem', { name: 'Inställningar' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Inställningar' })).toBeVisible();
	await expect(page.locator('kh-toolbar')).toHaveCount(0);
	await page.getByRole('link', { name: 'Tillbaka' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Idag' })).toBeVisible();
});

test('Om Tidrapporten shows the version, and Logga ut asks first', async ({ page }) => {
	await signIn(page, uid('konto'));
	await expect(page.locator('.kh-header__version')).toHaveText(pkg.version);
	await page.getByRole('button', { name: /^Konto och inställningar/ }).click();
	await page.getByRole('menuitem', { name: 'Om Tidrapporten' }).click();
	await expect(page.getByText(`Version ${pkg.version}`)).toBeVisible();
	await page.getByRole('link', { name: 'Tillbaka' }).click();

	await page.getByRole('button', { name: /^Konto och inställningar/ }).click();
	await page.getByRole('menuitem', { name: 'Logga ut' }).click();
	const dialog = page.getByRole('alertdialog', { name: 'Logga ut?' });
	await dialog.getByRole('button', { name: 'Avbryt' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Idag' })).toBeVisible();

	await page.getByRole('button', { name: /^Konto och inställningar/ }).click();
	await page.getByRole('menuitem', { name: 'Logga ut' }).click();
	await page.getByRole('alertdialog').getByRole('button', { name: 'Logga ut' }).click();
	await expect(page.getByRole('button', { name: 'Logga in' })).toBeVisible();
});
