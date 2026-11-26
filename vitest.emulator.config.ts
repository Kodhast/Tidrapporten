import { defineConfig } from 'vitest/config';

// Tests against the Firestore and Auth emulators; run through `npm run test:rules`, which starts
// them. Kept apart from `npm test` so that verify needs no Java.
export default defineConfig({
	// The functions' code and the tests share one Admin SDK, also where firebase-functions/ has its
	// own node_modules (after `npm ci --prefix firebase-functions`).
	resolve: { dedupe: ['firebase-admin'] },
	test: {
		environment: 'node',
		include: ['test/emulator/**/*.emulator.ts'],
		// The files share one emulator, and the rules tests clear all of it between their tests.
		fileParallelism: false,
		expect: { requireAssertions: true }
	}
});
