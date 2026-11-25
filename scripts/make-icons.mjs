// Renders the PNG icons in public/ from the SVG sources with Playwright's chromium.
// Run with `npm run icons` after changing an SVG. Set PLAYWRIGHT_CHROMIUM_PATH to use a
// chromium that is installed somewhere else.
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

const publicDir = new URL('../public/', import.meta.url);

const icons = [
	{ out: 'icon-192.png', src: 'favicon.svg', size: 192, transparent: true },
	{ out: 'icon-512.png', src: 'favicon.svg', size: 512, transparent: true },
	{ out: 'icon-maskable-512.png', src: 'icon.svg', size: 512 },
	{ out: 'apple-touch-icon.png', src: 'icon.svg', size: 180 }
];

const browser = await chromium.launch({
	executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined
});
try {
	for (const { out, src, size, transparent } of icons) {
		const svg = await readFile(new URL(src, publicDir), 'utf8');
		const page = await browser.newPage({ viewport: { width: size, height: size } });
		await page.setContent(
			`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`
		);
		const png = await page.screenshot({ omitBackground: Boolean(transparent) });
		await writeFile(new URL(out, publicDir), png);
		await page.close();
	}
} finally {
	await browser.close();
}
