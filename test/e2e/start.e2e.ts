import { expect, test } from '@playwright/test';

test('the start page shows the app name', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1, name: 'Tidrapporten' })).toBeVisible();
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
