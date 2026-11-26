import {
	signInWithCustomToken,
	updateProfile,
	type Auth,
	type User,
	type UserCredential
} from 'firebase/auth';

// Signing in is a page navigation (decision 0017): Cloudflare Access stands in front of
// /inloggning and may first send the browser to Google, which a fetch cannot follow. The Pages
// Function sends the browser back to /#token=<custom token>. Firebase keeps the session in
// IndexedDB, so Access is only needed for a new sign-in.
export const SIGN_IN_PATH = '/inloggning';
export const SIGN_IN_FAILED = 'Inloggningen gick inte. Försök igen.';

export function startSignIn(location: Pick<Location, 'assign'> = window.location): void {
	location.assign(SIGN_IN_PATH);
}

/** What /inloggning put in the fragment: the token, and the name and picture when Access had them. */
export interface SignInFragment {
	token: string;
	name?: string;
	photoUrl?: string;
}

/** The sign-in in the address, which is removed so that it is neither bookmarked nor shared. */
export function takeSignIn(
	location: Pick<Location, 'hash' | 'pathname' | 'search'>,
	history: Pick<History, 'replaceState'>
): SignInFragment | null {
	const fields = new URLSearchParams(location.hash.replace(/^#/, ''));
	const token = fields.get('token');
	if (!token) return null;
	history.replaceState(null, '', location.pathname + location.search);
	const name = fields.get('namn')?.trim();
	const photoUrl = fields.get('bild')?.trim();
	return { token, ...(name && { name }), ...(photoUrl && { photoUrl }) };
}

/** The profile is written only when the name or picture differs from what the user has. */
export function profileChange(
	user: Pick<User, 'displayName' | 'photoURL'>,
	{ name, photoUrl }: Omit<SignInFragment, 'token'>
): { displayName?: string; photoURL?: string } | null {
	const change = {
		...(name && name !== user.displayName && { displayName: name }),
		...(photoUrl && photoUrl !== user.photoURL && { photoURL: photoUrl })
	};
	return Object.keys(change).length > 0 ? change : null;
}

/** Signs in with a token from the address, if there is one; returns an error text or null. */
export async function finishSignIn(
	auth: Auth,
	location: Pick<Location, 'hash' | 'pathname' | 'search'> = window.location,
	history: Pick<History, 'replaceState'> = window.history,
	signIn: (auth: Auth, token: string) => Promise<UserCredential> = signInWithCustomToken,
	update: typeof updateProfile = updateProfile
): Promise<string | null> {
	const fragment = takeSignIn(location, history);
	if (!fragment) return null;
	let credential: UserCredential;
	try {
		credential = await signIn(auth, fragment.token);
	} catch {
		return SIGN_IN_FAILED;
	}
	const change = profileChange(credential.user, fragment);
	// Without the profile the avatar shows the initial; signing in still worked.
	if (change) await update(credential.user, change).catch(() => {});
	return null;
}
