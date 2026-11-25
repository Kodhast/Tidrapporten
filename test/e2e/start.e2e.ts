import { expect, test } from '@playwright/test';

test('the start page shows the app name', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1, name: 'Tidrapporten' })).toBeVisible();
});

test('the button from web-ui-react has web-ui’s look', async ({ page }) => {
	await page.goto('/');
	const button = page.getByRole('button', { name: 'Starta timern' });
	await expect(button).toBeDisabled();
	// kh.css makes a button a pill at least 56 high; unstyled it would be the browser's default.
	await expect(button).toHaveCSS('min-height', '56px');
	await expect(button).toHaveCSS('border-radius', /^\d{3,}px$/);
});

test('the manifest makes the app installable', async ({ page, request }) => {
	await page.goto('/');
	const href = await page.locator('link[rel="manifest"]').getAttribute('href');
	expect(href).toBeTruthy();

	const response = await request.get(href!);
	expect(response.ok()).toBe(true);
	const manifest = await response.json();
	expect(manifest).toMatchObject({ name: 'Tidrapporten', lang: 'sv', display: 'standalone' });
	for (const size of ['192x192', '512x512']) {
		const icon = manifest.icons.find((i: { sizes: string }) => i.sizes === size);
		expect((await request.get(icon.src)).ok()).toBe(true);
	}
});

test('"Logga in" shows when nobody is signed in', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('button', { name: 'Logga in' })).toBeVisible();
});
