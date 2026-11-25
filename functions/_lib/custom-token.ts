// Signs a Firebase custom token locally with WebCrypto (decision 0017): RS256 with the service
// account's private key, no call to Google. The same code runs in the Pages Function and in
// scripts/prova-custom-token.mjs.
import { decodeBytes, encodeBytes, encodeJson } from './base64url.ts';

// Written this way so that the type is the same under Workers' and Node's typings.
type Key = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

export const CUSTOM_TOKEN_AUDIENCE =
	'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';
const LIFETIME_S = 3600;

/** The fields used from Google's JSON key file. */
export interface Signer {
	projectId: string;
	clientEmail: string;
	privateKey: string;
}

/** Reads Google's JSON key file; throws when a field is missing. */
export function parseSigner(json: string | undefined): Signer {
	const key = JSON.parse(json ?? '') as Record<string, unknown>;
	const { project_id: projectId, client_email: clientEmail, private_key: privateKey } = key;
	if (typeof projectId !== 'string' || typeof clientEmail !== 'string') {
		throw new Error('The key file has no project_id or client_email');
	}
	if (typeof privateKey !== 'string' || !privateKey.includes('PRIVATE KEY')) {
		throw new Error('The key file has no private_key');
	}
	return { projectId, clientEmail, privateKey };
}

function importPrivateKey(pem: string): Promise<Key> {
	const base64 = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
	return crypto.subtle.importKey(
		'pkcs8',
		decodeBytes(base64),
		{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
		false,
		['sign']
	);
}

/** A custom token for `uid` without extra claims, valid for an hour from `now` (ms). */
export async function signCustomToken(
	signer: Signer,
	uid: string,
	now = Date.now()
): Promise<string> {
	const iat = Math.floor(now / 1000);
	const header = encodeJson({ alg: 'RS256', typ: 'JWT' });
	const payload = encodeJson({
		iss: signer.clientEmail,
		sub: signer.clientEmail,
		aud: CUSTOM_TOKEN_AUDIENCE,
		iat,
		exp: iat + LIFETIME_S,
		uid
	});
	const signature = await crypto.subtle.sign(
		'RSASSA-PKCS1-v1_5',
		await importPrivateKey(signer.privateKey),
		new TextEncoder().encode(`${header}.${payload}`)
	);
	return `${header}.${payload}.${encodeBytes(new Uint8Array(signature))}`;
}
