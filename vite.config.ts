import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import pkg from './package.json' with { type: 'json' };

// Brand colours live in src/tema.css; the manifest needs its own copy because it is read
// before any CSS. The look is provisional until the mockup in issue 16 settles it.
const background = '#fbf4ef';
const shortcutIcon = { src: '/icon-192.png', sizes: '192x192', type: 'image/png' };

export default defineConfig({
	// The version in the header and Om Tidrapporten (issue 66).
	define: { __APP_VERSION__: JSON.stringify(pkg.version) },
	plugins: [
		react(),
		VitePWA({
			registerType: 'autoUpdate',
			injectRegister: 'script-defer',
			includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
			// The app's own worker (issue 22): the cache as before and the reminders' notifications.
			// The sign-in must reach Cloudflare Access and the Pages Function, never the cached app
			// (decision 0017); src/sw.ts keeps that.
			strategies: 'injectManifest',
			srcDir: 'src',
			filename: 'sw.ts',
			manifest: {
				name: 'Tidrapporten',
				short_name: 'Tid',
				description: 'Faktisk tid, veckorapporter och flex',
				lang: 'sv',
				start_url: '/',
				scope: '/',
				display: 'standalone',
				theme_color: background,
				background_color: background,
				// A long press on the installed app's icon (issue 59). The notification buttons of
				// issue 22 open the same addresses.
				shortcuts: [
					{ name: 'Starta timern', url: '/?gor=starta', icons: [shortcutIcon] },
					{ name: 'Stoppa timern', url: '/?gor=stoppa', icons: [shortcutIcon] },
					{ name: 'Idag', url: '/', icons: [shortcutIcon] }
				],
				icons: [
					{ src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
					{ src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
					{
						src: '/icon-maskable-512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable'
					}
				]
			}
		})
	],
	preview: { port: 4173, strictPort: true },
	test: {
		environment: 'node',
		include: ['src/**/*.test.{ts,tsx}', 'test/**/*.spec.ts'],
		expect: { requireAssertions: true },
		coverage: {
			provider: 'v8',
			include: ['src/**/*.{ts,tsx}', 'functions/**/*.ts', 'firebase-functions/src/**/*.ts'],
			// The entry points only mount the app in a browser (Playwright) or wire Google's clients. testdata.ts is
			// made-up data for the tests and would only inflate the figure.
			exclude: [
				'src/main.tsx',
				'firebase-functions/src/index.ts',
				'firebase-functions/src/paminnelser-effekter.ts',
				'firebase-functions/src/radering.ts',
				'firebase-functions/src/firestore-shim.ts',
				'src/sw.ts',
				'src/**/*.test.{ts,tsx}',
				'src/domain/testdata.ts',
				'src/vyer/tidshjul.test-helper.ts',
				'src/data/fixturer.ts'
			],
			thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 }
		}
	}
});
