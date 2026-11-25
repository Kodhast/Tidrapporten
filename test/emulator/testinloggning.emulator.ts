import { deleteApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { afterAll, describe, expect, it } from 'vitest';
import { EMULATOR_HOST, EMULATOR_PORTS, firebaseOptions } from '../../src/firebase/config.ts';
import { signInForTest } from '../../src/firebase/testinloggning.ts';

const app = initializeApp(firebaseOptions('emulator'), 'testinloggning');
const auth = getAuth(app);
connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${EMULATOR_PORTS.auth}`, {
	disableWarnings: true
});

afterAll(() => deleteApp(app));

describe('signInForTest', () => {
	it('signs in to the Auth emulator with the given uid', async () => {
		const { user } = await signInForTest(auth, 'testperson-1');
		expect(user.uid).toBe('testperson-1');
		expect((await user.getIdTokenResult()).claims.testinloggning).toBe(true);
	});
});
