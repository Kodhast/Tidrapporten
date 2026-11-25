import {
	assertFails,
	initializeTestEnvironment,
	type RulesTestEnvironment
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EMULATOR_HOST, EMULATOR_PORTS, EMULATOR_PROJECT_ID } from '../../src/firebase/config.ts';

let env: RulesTestEnvironment;

beforeAll(async () => {
	env = await initializeTestEnvironment({
		projectId: EMULATOR_PROJECT_ID,
		firestore: {
			host: EMULATOR_HOST,
			port: EMULATOR_PORTS.firestore,
			rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8')
		}
	});
});

afterAll(() => env.cleanup());

// The rules deny everything until issue 15 (made-up ids). assertFails resolves only on a denial.
describe.each([
	['a signed-out user', () => env.unauthenticatedContext()],
	['a signed-in user', () => env.authenticatedContext('testperson-1')]
])('%s', (_, context) => {
	it('cannot read', async () => {
		await expect(
			assertFails(getDoc(doc(context().firestore(), 'users/testperson-1')))
		).resolves.toBeDefined();
	});

	it('cannot write', async () => {
		await expect(
			assertFails(setDoc(doc(context().firestore(), 'users/testperson-1'), { name: 'Test' }))
		).resolves.toBeDefined();
	});
});
