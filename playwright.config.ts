import { defineConfig, devices } from '@playwright/test';

// A built app behind `vite preview`, so the test sees what is deployed: the manifest and the
// service worker only exist in a build. The build talks to the Auth and Firestore emulators,
// which `npm run test:e2e` starts around the run, and has the test sign-in (issue 10). Set
// PLAYWRIGHT_CHROMIUM_PATH to use a chromium that is installed somewhere else, e.g. the one
// preinstalled in a cloud session.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

export default defineConfig({
	testDir: 'test/e2e',
	testMatch: '**/*.e2e.ts',
	webServer: {
		command: 'npm run build && npm run preview',
		env: { VITE_FIREBASE_EMULATOR: 'true' },
		port: 4173,
		reuseExistingServer: !process.env.CI
	},
	forbidOnly: !!process.env.CI,
	reporter: process.env.CI ? 'github' : 'list',
	use: { baseURL: 'http://localhost:4173', launchOptions: { executablePath } },
	// Chrome on a computer and on Android are the only browsers the app supports (decision 0008).
	projects: [
		{ name: 'dator', use: { ...devices['Desktop Chrome'] } },
		{ name: 'android', use: { ...devices['Pixel 7'] } }
	]
});
