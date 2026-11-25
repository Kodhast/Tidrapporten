import { defineConfig } from 'vitest/config';

// Tests against the Firestore and Auth emulators; run through `npm run test:rules`, which starts
// them. Kept apart from `npm test` so that verify needs no Java.
export default defineConfig({
	test: {
		environment: 'node',
		include: ['test/emulator/**/*.emulator.ts'],
		expect: { requireAssertions: true }
	}
});
