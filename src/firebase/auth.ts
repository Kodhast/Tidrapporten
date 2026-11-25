import { signInWithCustomToken, type Auth, type UserCredential } from 'firebase/auth';

// Signing in is a page navigation (decision 0017): Cloudflare Access stands in front of
// /inloggning and may first send the browser to Google, which a fetch cannot follow. The Pages
// Function sends the browser back to /#token=<custom token>. Firebase keeps the session in
// IndexedDB, so Access is only needed for a new sign-in.
export const SIGN_IN_PATH = '/inloggning';
export const SIGN_IN_FAILED = 'Inloggningen gick inte. Försök igen.';

const TOKEN = /^#token=(.+)$/;

export function startSignIn(location: Pick<Location, 'assign'> = window.location): void {
	location.assign(SIGN_IN_PATH);
}

/** The token in the address, which is removed so that it is neither bookmarked nor shared. */
export function takeToken(
	location: Pick<Location, 'hash' | 'pathname' | 'search'>,
	history: Pick<History, 'replaceState'>
): string | null {
	const token = TOKEN.exec(location.hash)?.[1];
	if (!token) return null;
	history.replaceState(null, '', location.pathname + location.search);
	return decodeURIComponent(token);
}

/** Signs in with a token from the address, if there is one; returns an error text or null. */
export async function finishSignIn(
	auth: Auth,
	location: Pick<Location, 'hash' | 'pathname' | 'search'> = window.location,
	history: Pick<History, 'replaceState'> = window.history,
	signIn: (auth: Auth, token: string) => Promise<UserCredential> = signInWithCustomToken
): Promise<string | null> {
	const token = takeToken(location, history);
	if (!token) return null;
	try {
		await signIn(auth, token);
		return null;
	} catch {
		return SIGN_IN_FAILED;
	}
}
