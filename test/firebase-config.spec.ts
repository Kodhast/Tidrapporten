import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	EMULATOR_HOST,
	EMULATOR_PORTS,
	EMULATOR_PROJECT_ID,
	environmentFor,
	firebaseOptions
} from '../src/firebase/config.ts';

const readJson = (file: string) =>
	JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));

describe('environmentFor', () => {
	it.each([
		['production', false, 'test'],
		['development', false, 'test'],
		['production', true, 'emulator'],
		['development', true, 'emulator'],
		['drift', false, 'drift']
	] as const)('mode %s with emulator %s gives %s', (mode, emulator, expected) => {
		expect(environmentFor(mode, emulator)).toBe(expected);
	});

	it('refuses the emulator in a drift build', () => {
		expect(() => environmentFor('drift', true)).toThrow();
	});
});

describe('firebaseOptions', () => {
	const aliases = readJson('.firebaserc').projects;

	it.each(['test', 'drift'] as const)('%s matches its alias in .firebaserc', (environment) => {
		expect(firebaseOptions(environment).projectId).toBe(aliases[environment]);
	});

	it('keeps the emulator on a demo project', () => {
		expect(firebaseOptions('emulator').projectId).toBe(EMULATOR_PROJECT_ID);
		expect(EMULATOR_PROJECT_ID).toMatch(/^demo-/);
	});

	it('uses the emulator ports in firebase.json', () => {
		const { emulators } = readJson('firebase.json');
		for (const service of ['auth', 'firestore'] as const) {
			expect(emulators[service]).toEqual({ host: EMULATOR_HOST, port: EMULATOR_PORTS[service] });
		}
	});
});
