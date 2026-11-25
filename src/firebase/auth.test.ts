import type { Auth, UserCredential } from 'firebase/auth';
import { describe, expect, it, vi } from 'vitest';
import { finishSignIn, SIGN_IN_FAILED, SIGN_IN_PATH, startSignIn, takeToken } from './auth';

const auth = {} as Auth;
const at = (hash: string) => ({ hash, pathname: '/', search: '?a=1' });

describe('startSignIn', () => {
	it('navigates to /inloggning, where Access stands', () => {
		const assign = vi.fn();
		startSignIn({ assign });
		expect(assign).toHaveBeenCalledWith(SIGN_IN_PATH);
	});
});

describe('takeToken', () => {
	it('reads #token= and removes it from the address', () => {
		const replaceState = vi.fn();
		expect(takeToken(at('#token=abc.def.ghi'), { replaceState })).toBe('abc.def.ghi');
		expect(replaceState).toHaveBeenCalledWith(null, '', '/?a=1');
	});

	it.each(['', '#', '#token=', '#annat=1'])('leaves the address alone for %j', (hash) => {
		const replaceState = vi.fn();
		expect(takeToken(at(hash), { replaceState })).toBeNull();
		expect(replaceState).not.toHaveBeenCalled();
	});
});

describe('finishSignIn', () => {
	it('signs in with the token from the address', async () => {
		const signIn = vi.fn(async () => ({}) as UserCredential);
		const history = { replaceState: vi.fn() };
		expect(await finishSignIn(auth, at('#token=t.o.k'), history, signIn)).toBeNull();
		expect(signIn).toHaveBeenCalledWith(auth, 't.o.k');
		expect(history.replaceState).toHaveBeenCalled();
	});

	it('does nothing without a token', async () => {
		const signIn = vi.fn();
		expect(await finishSignIn(auth, at(''), { replaceState: vi.fn() }, signIn)).toBeNull();
		expect(signIn).not.toHaveBeenCalled();
	});

	it('returns a Swedish error text when Firebase refuses', async () => {
		const signIn = vi.fn(async () => {
			throw new Error('auth/invalid-custom-token');
		});
		expect(await finishSignIn(auth, at('#token=x'), { replaceState: vi.fn() }, signIn)).toBe(
			SIGN_IN_FAILED
		);
	});
});
