import { expect, test } from '@playwright/test';
import { signIn, uid } from './hjalp.ts';

// On a wide screen the app sits in a card with a shadow, 600 wide (issue 82, web-ui's kh-frame);
// on the phone it fills the screen as before.

test('the app sits in a card on a computer and fills the phone', async ({ page }) => {
	await signIn(page, uid('ram'));
	const viewport = page.viewportSize()!;
	const frame = (await page.locator('#root').boundingBox())!;
	const bar = (await page.locator('kh-toolbar').boundingBox())!;
	const shadow = (await page.evaluate(
		"getComputedStyle(document.getElementById('root')).boxShadow"
	)) as string;
	// The test project has no DOM types, so the page is read with strings (as in hjalp.ts).
	// The page itself never scrolls when the card does.
	const pageScrolls = (await page.evaluate(
		'document.documentElement.scrollHeight > innerHeight'
	)) as boolean;

	if (test.info().project.name === 'dator') {
		expect(frame).toEqual({
			x: (viewport.width - 600) / 2,
			y: 32,
			width: 600,
			height: viewport.height - 64
		});
		expect(shadow).not.toBe('none');
		expect(bar.x).toBeGreaterThanOrEqual(frame.x);
		expect(bar.x + bar.width).toBeLessThanOrEqual(frame.x + frame.width);
		expect(bar.y + bar.height).toBeLessThanOrEqual(frame.y + frame.height);
		expect(pageScrolls).toBe(false);
	} else {
		expect(frame.x).toBe(0);
		expect(frame.width).toBe(viewport.width);
		expect(shadow).toBe('none');
		expect(bar.y + bar.height).toBeLessThanOrEqual(viewport.height);
	}
});
