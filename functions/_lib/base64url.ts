// JWTs use base64url without padding (RFC 7515). atob/btoa exist both in Workers and in Node.

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
