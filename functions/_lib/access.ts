// Checks the Cloudflare Access JWT in front of /inloggning (decision 0017), ported from Husjakt.
// Only the signed token is trusted: Cf-Access-Authenticated-User-Email and similar headers are
// unsigned. The team's keys are kept while the isolate lives and fetched again when an unknown
// `kid` shows up (Cloudflare rotates them), at most once a minute so that made-up kids cannot
// make every request fetch.
import { decodeBytes, decodeJson, RS256, type Key } from './jwt.ts';

export const ACCESS_TEAM = 'kodhast';
export const teamUrl = (team: string) => `https://${team}.cloudflareaccess.com`;

const CLOCK_SKEW_S = 60;
const REFETCH_MS = 60_000;

interface Keys {
	byKid: Map<string, Key>;
	fetchedAt: number;
}
let cached: Keys | null = null;

/** The keys could not be fetched: a server fault, not a bad token. */
export class KeysUnavailable extends Error {}

export interface AccessPayload {
	email: string;
	[claim: string]: unknown;
}

interface Jwk {
	kty?: string;
	kid?: string;
	n?: string;
	e?: string;
}

async function fetchKeys(fetchFn: typeof fetch, now: number): Promise<Keys> {
	let response: Response;
	try {
		response = await fetchFn(`${teamUrl(ACCESS_TEAM)}/cdn-cgi/access/certs`);
	} catch {
		throw new KeysUnavailable('the keys could not be reached');
	}
	if (!response.ok) throw new KeysUnavailable(`the keys answered ${response.status}`);
	const body = (await response.json().catch(() => null)) as { keys?: Jwk[] } | null;
	const byKid = new Map<string, Key>();
	for (const jwk of body?.keys ?? []) {
		if (jwk?.kty !== 'RSA' || !jwk.kid) continue;
		try {
			byKid.set(
				jwk.kid,
				await crypto.subtle.importKey(
					'jwk',
					{ kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
					RS256,
					false,
					['verify']
				)
			);
		} catch {
			// A broken key is skipped; the others may still verify the token.
		}
	}
	if (!byKid.size) throw new KeysUnavailable('no keys in the answer');
	cached = { byKid, fetchedAt: now };
	return cached;
}

function split(jwt: string) {
	const parts = jwt.split('.');
	if (parts.length !== 3) return null;
	const [header = '', payload = '', signature = ''] = parts;
	try {
		return {
			header: decodeJson(header) as { alg?: unknown; kid?: unknown },
			payload: decodeJson(payload) as Record<string, unknown>,
			signed: new TextEncoder().encode(`${header}.${payload}`),
			signature: decodeBytes(signature)
		};
	} catch {
		return null;
	}
}

export interface VerifyOptions {
	aud: string;
	/** Milliseconds; replaceable so that the tests need no clock. */
	now?: number;
	fetchFn?: typeof fetch;
}

/**
 * The payload of an Access JWT that holds – right signature, issued by the team, for this
 * application (`aud`), within its validity and with an e-mail address – otherwise null.
 * Throws KeysUnavailable when the team's keys cannot be fetched.
 */
export async function verifyAccessJwt(
	jwt: string | null,
	{ aud, now = Date.now(), fetchFn = fetch }: VerifyOptions
): Promise<AccessPayload | null> {
	if (!jwt || !aud) return null;
	const parts = split(jwt);
	if (!parts || parts.header.alg !== 'RS256' || typeof parts.header.kid !== 'string') return null;
	const { kid } = parts.header;

	let keys = cached ?? (await fetchKeys(fetchFn, now));
	if (!keys.byKid.has(kid) && now - keys.fetchedAt >= REFETCH_MS) {
		keys = await fetchKeys(fetchFn, now);
	}
	const key = keys.byKid.get(kid);
	if (!key) return null;
	const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, parts.signature, parts.signed);
	if (!valid) return null;

	const p = parts.payload;
	if (p.iss !== teamUrl(ACCESS_TEAM)) return null;
	const audiences = Array.isArray(p.aud) ? p.aud : [p.aud];
	if (!audiences.includes(aud)) return null;
	const seconds = now / 1000;
	if (typeof p.exp !== 'number' || p.exp + CLOCK_SKEW_S <= seconds) return null;
	if (typeof p.nbf === 'number' && p.nbf - CLOCK_SKEW_S > seconds) return null;
	if (typeof p.email !== 'string' || !p.email.includes('@')) return null;
	return p as AccessPayload;
}

/** Only for the tests: forget the keys. */
export function forgetKeys(): void {
	cached = null;
}
