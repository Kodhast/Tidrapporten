// JWT helpers shared by the Access check, the custom token, the emulator's test sign-in and the
// tests. JWTs use base64url without padding (RFC 7515); atob/btoa exist in Workers, Node and
// browsers.

export const RS256 = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } as const;
// Written this way so that the type is the same under Workers', Node's and the DOM's typings.
export type Key = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

export const CUSTOM_TOKEN_AUDIENCE =
	'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';

export function encodeBytes(bytes: Uint8Array): string {
	let text = '';
	for (const byte of bytes) text += String.fromCharCode(byte);
	return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const encodeJson = (value: object): string =>
	encodeBytes(new TextEncoder().encode(JSON.stringify(value)));

/** Throws on text that is not base64url. */
export function decodeBytes(part: string): Uint8Array<ArrayBuffer> {
	const text = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
	return Uint8Array.from(text, (char) => char.charCodeAt(0));
}

export const decodeJson = (part: string): unknown =>
	JSON.parse(new TextDecoder().decode(decodeBytes(part)));

/** `header.payload.signature`, signed with RS256. */
export async function signJwt(header: object, payload: object, key: Key): Promise<string> {
	const signed = `${encodeJson(header)}.${encodeJson(payload)}`;
	const signature = await crypto.subtle.sign(RS256, key, new TextEncoder().encode(signed));
	return `${signed}.${encodeBytes(new Uint8Array(signature))}`;
}
