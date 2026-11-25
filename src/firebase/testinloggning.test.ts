import { describe, expect, it } from 'vitest';
import { decodeJson } from '../../functions/_lib/jwt.ts';
import { unsignedCustomToken } from './testinloggning';

const decode = decodeJson;

describe('unsignedCustomToken', () => {
	// 2026-01-05 08:00 UTC, a made-up moment.
	const now = Date.UTC(2026, 0, 5, 8, 0);
	const [header = '', payload = '', signature] = unsignedCustomToken('testperson-1', now).split(
		'.'
	);

	it('is unsigned, which only the emulator accepts', () => {
		expect(decode(header)).toEqual({ alg: 'none', typ: 'JWT' });
		expect(signature).toBe('');
	});

	it('carries the uid, an hour of validity and the test claim', () => {
		expect(decode(payload)).toMatchObject({
			uid: 'testperson-1',
			iat: now / 1000,
			exp: now / 1000 + 3600,
			claims: { testSignIn: true }
		});
	});
});
