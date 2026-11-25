import { signInWithCustomToken, type Auth, type UserCredential } from 'firebase/auth';

// Only the Auth emulator accepts an unsigned custom token; real Firebase rejects it. The module is
// imported only behind VITE_FIREBASE_EMULATOR, so a drift build does not contain it (a test checks
// that through the claim below).
const AUDIENCE =
	'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';

const base64url = (value: object) =>
	btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function unsignedCustomToken(uid: string, now = Date.now()): string {
	const iat = Math.floor(now / 1000);
	const header = { alg: 'none', typ: 'JWT' };
	const payload = {
		iss: 'firebase-auth-emulator@example.com',
		sub: 'firebase-auth-emulator@example.com',
		aud: AUDIENCE,
		iat,
		exp: iat + 3600,
		uid,
		claims: { testSignIn: true }
	};
	return `${base64url(header)}.${base64url(payload)}.`;
}

export function signInForTest(auth: Auth, uid: string): Promise<UserCredential> {
	return signInWithCustomToken(auth, unsignedCustomToken(uid));
}
