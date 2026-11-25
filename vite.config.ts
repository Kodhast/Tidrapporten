import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

// Brand colours live in src/tema.css; the manifest needs its own copy because it is read
// before any CSS. The look is provisional until the mockup in issue 16 settles it.
const background = '#f4f6f9';

export default defineConfig({
	plugins: [
		react(),
		VitePWA({
			registerType: 'autoUpdate',
			injectRegister: 'script-defer',
			includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
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
			include: ['src/**/*.{ts,tsx}'],
			// The entry point only mounts the app in a browser; Playwright covers it. testdata.ts is
			// made-up data for the tests and would only inflate the figure.
			exclude: ['src/main.tsx', 'src/**/*.test.{ts,tsx}', 'src/domain/testdata.ts'],
			thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 }
		}
	}
});
