import type { Auth, UserCredential } from 'firebase/auth';
import { describe, expect, it, vi } from 'vitest';
import {
	finishSignIn,
	profileChange,
	SIGN_IN_FAILED,
	SIGN_IN_PATH,
	startSignIn,
	takeSignIn
} from './auth';

const auth = {} as Auth;
const at = (hash: string) => ({ hash, pathname: '/', search: '?a=1' });

describe('startSignIn', () => {
	it('navigates to /inloggning, where Access stands', () => {
		const assign = vi.fn();
		startSignIn({ assign });
		expect(assign).toHaveBeenCalledWith(SIGN_IN_PATH);
	});
});

describe('takeSignIn', () => {
	it('reads #token= and removes it from the address', () => {
		const replaceState = vi.fn();
		expect(takeSignIn(at('#token=abc.def.ghi'), { replaceState })).toEqual({
			token: 'abc.def.ghi'
		});
		expect(replaceState).toHaveBeenCalledWith(null, '', '/?a=1');
	});

	it('reads the name and the picture beside the token', () => {
		const hash =
			'#token=a.b.c&namn=Testa+Testsson&bild=https%3A%2F%2Flh3.googleusercontent.com%2Fa%2Fx%3Ds96-c';
		expect(takeSignIn(at(hash), { replaceState: vi.fn() })).toEqual({
			token: 'a.b.c',
			name: 'Testa Testsson',
			photoUrl: 'https://lh3.googleusercontent.com/a/x=s96-c'
		});
	});

	it.each(['', '#', '#token=', '#annat=1'])('leaves the address alone for %j', (hash) => {
		const replaceState = vi.fn();
		expect(takeSignIn(at(hash), { replaceState })).toBeNull();
		expect(replaceState).not.toHaveBeenCalled();
	});
});

describe('profileChange', () => {
	const user = { displayName: 'Testa', photoURL: 'https://lh3.googleusercontent.com/a/1' };
	it('changes only what differs, and nothing that is missing', () => {
		expect(profileChange(user, { name: 'Testa' })).toBeNull();
		expect(profileChange(user, {})).toBeNull();
		expect(profileChange(user, { name: 'Testa T', photoUrl: user.photoURL })).toEqual({
			displayName: 'Testa T'
		});
		expect(
			profileChange({ displayName: null, photoURL: null }, { photoUrl: 'https://x/2' })
		).toEqual({ photoURL: 'https://x/2' });
	});
});

describe('finishSignIn', () => {
	const credential = (displayName: string | null = null) =>
		({ user: { displayName, photoURL: null } }) as unknown as UserCredential;

	it('keeps the name and picture on the profile when they changed', async () => {
		const signIn = vi.fn(async () => credential());
		const update = vi.fn(async () => {});
		const hash = '#token=t&namn=Testa&bild=https%3A%2F%2Flh3.googleusercontent.com%2Fa%2F1';
		await finishSignIn(auth, at(hash), { replaceState: vi.fn() }, signIn, update);
		expect(update).toHaveBeenCalledWith(credential().user, {
			displayName: 'Testa',
			photoURL: 'https://lh3.googleusercontent.com/a/1'
		});
		update.mockClear();
		signIn.mockImplementation(async () => credential('Testa'));
		await finishSignIn(auth, at('#token=t&namn=Testa'), { replaceState: vi.fn() }, signIn, update);
		expect(update).not.toHaveBeenCalled();
	});

	it('signs in even when the profile cannot be written', async () => {
		const update = vi.fn(async () => {
			throw new Error('nätet');
		});
		expect(
			await finishSignIn(
				auth,
				at('#token=t&namn=Testa'),
				{ replaceState: vi.fn() },
				async () => credential(),
				update
			)
		).toBeNull();
	});

	it('signs in with the token from the address', async () => {
		const signIn = vi.fn(async () => credential());
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
