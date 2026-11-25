import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
	CUSTOM_TOKEN_AUDIENCE,
	decodeBytes,
	decodeJson,
	RS256,
	signJwt
} from '../functions/_lib/jwt.ts';
import { ACCESS_TEAM, forgetKeys, teamUrl, verifyAccessJwt } from '../functions/_lib/access.ts';
import { parseSigner, signCustomToken } from '../functions/_lib/custom-token.ts';
import { handleSignIn, type Env } from '../functions/inloggning.ts';

// Everything here is made up: keys are generated per run, addresses and uids are invented.
const generate = () =>
	crypto.subtle.generateKey(
		{ ...RS256, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) },
		true,
		['sign', 'verify']
	);

const AUD = 'aud-prov';
const KID = 'kid-1';
// 2026-01-05 08:00 UTC.
const NOW = Date.UTC(2026, 0, 5, 8, 0);
const NOW_S = NOW / 1000;
const CERTS = `${teamUrl(ACCESS_TEAM)}/cdn-cgi/access/certs`;

type KeyPair = Awaited<ReturnType<typeof generate>>;
let accessKeys: KeyPair;
let otherKeys: KeyPair;
let signerKeys: KeyPair;
let signerJson: string;

async function pem(key: KeyPair['privateKey']): Promise<string> {
	const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', key));
	const base64 = Buffer.from(der).toString('base64');
	return `-----BEGIN PRIVATE KEY-----\n${base64.match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----\n`;
}

beforeAll(async () => {
	[accessKeys, otherKeys, signerKeys] = await Promise.all([generate(), generate(), generate()]);
	signerJson = JSON.stringify({
		type: 'service_account',
		project_id: 'demo-tidrapporten',
		client_email: 'inloggning@demo-tidrapporten.iam.gserviceaccount.com',
		private_key: await pem(signerKeys.privateKey)
	});
});

async function accessJwt(
	payload: Record<string, unknown> = {},
	{ key = accessKeys.privateKey, header = {} as Record<string, unknown> } = {}
): Promise<string> {
	return signJwt(
		{ alg: 'RS256', kid: KID, typ: 'JWT', ...header },
		{
			iss: teamUrl(ACCESS_TEAM),
			aud: [AUD],
			email: 'person@example.com',
			iat: NOW_S - 10,
			nbf: NOW_S - 10,
			exp: NOW_S + 600,
			...payload
		},
		key
	);
}

/** A fake fetch serving the team's keys; counts calls. */
function certs(kid = KID) {
	const calls: string[] = [];
	const fetchFn = (async (url: string) => {
		calls.push(url);
		const jwk = await crypto.subtle.exportKey('jwk', accessKeys.publicKey);
		return Response.json({ keys: [{ kid, kty: 'RSA', n: jwk.n, e: jwk.e }] });
	}) as unknown as typeof fetch;
	return { fetchFn, calls };
}

beforeEach(() => forgetKeys());

describe('signCustomToken', () => {
	it('signs a token Firebase accepts: RS256, the service account, an hour, no claims', async () => {
		const signer = parseSigner(signerJson);
		const token = await signCustomToken(signer, 'testperson-1', NOW);
		const [header = '', payload = '', signature = ''] = token.split('.');
		expect(decodeJson(header)).toEqual({ alg: 'RS256', typ: 'JWT' });
		expect(decodeJson(payload)).toEqual({
			iss: signer.clientEmail,
			sub: signer.clientEmail,
			aud: CUSTOM_TOKEN_AUDIENCE,
			iat: NOW_S,
			exp: NOW_S + 3600,
			uid: 'testperson-1'
		});
		const valid = await crypto.subtle.verify(
			RS256,
			signerKeys.publicKey,
			decodeBytes(signature),
			new TextEncoder().encode(`${header}.${payload}`)
		);
		expect(valid).toBe(true);
	});

	it.each([
		['not JSON', 'nyckel'],
		['no client_email', JSON.stringify({ project_id: 'p', private_key: 'PRIVATE KEY' })],
		['no private key', JSON.stringify({ project_id: 'p', client_email: 'a@b' })]
	])('refuses a key file with %s', (_, json) => {
		expect(() => parseSigner(json)).toThrow();
	});
});

describe('verifyAccessJwt', () => {
	const verify = (jwt: string | null, fetchFn = certs().fetchFn, now = NOW) =>
		verifyAccessJwt(jwt, { aud: [AUD], now, fetchFn });

	it('accepts a valid token', async () => {
		expect(await verify(await accessJwt())).toMatchObject({ email: 'person@example.com' });
	});

	it('accepts a token from 50 s in the future, within the clock skew', async () => {
		expect(await verify(await accessJwt({ nbf: NOW_S + 50 }))).not.toBeNull();
	});

	it.each([
		['missing', async () => null],
		['malformed', async () => 'inte.en.jwt'],
		['signed with another key', () => accessJwt({}, { key: otherKeys.privateKey })],
		['an unknown kid', () => accessJwt({}, { header: { kid: 'kid-okand' } })],
		['alg other than RS256', () => accessJwt({}, { header: { alg: 'HS256' } })],
		['the wrong aud', () => accessJwt({ aud: ['annan-app'] })],
		['the wrong iss', () => accessJwt({ iss: 'https://annat.cloudflareaccess.com' })],
		['expired beyond the skew', () => accessJwt({ exp: NOW_S - 61 })],
		['not yet valid beyond the skew', () => accessJwt({ nbf: NOW_S + 61 })],
		['no e-mail', () => accessJwt({ email: undefined })]
	])('refuses a token that is %s', async (_, make) => {
		expect(await verify(await make())).toBeNull();
	});

	it('fetches the keys again for an unknown kid at most once a minute', async () => {
		const { fetchFn, calls } = certs();
		const unknown = await accessJwt({}, { header: { kid: 'kid-ny' } });
		await verify(unknown, fetchFn, NOW);
		await verify(unknown, fetchFn, NOW + 30_000);
		expect(calls).toHaveLength(1);
		await verify(unknown, fetchFn, NOW + 60_000);
		expect(calls).toEqual([CERTS, CERTS]);
	});

	it('keeps the cached keys, and tries at most once a minute, when a refetch fails', async () => {
		const { fetchFn } = certs();
		await verify(await accessJwt(), fetchFn, NOW);
		let failures = 0;
		const down = (async () => {
			failures++;
			throw new TypeError('nätet');
		}) as unknown as typeof fetch;
		const unknown = await accessJwt({}, { header: { kid: 'kid-ny' } });
		expect(await verify(unknown, down, NOW + 60_000)).toBeNull();
		expect(await verify(unknown, down, NOW + 90_000)).toBeNull();
		expect(failures).toBe(1);
		expect(await verify(await accessJwt({ exp: NOW_S + 3600 }), down, NOW + 90_000)).not.toBeNull();
	});

	it('fetches the keys again after an hour, so that a withdrawn key stops working', async () => {
		const { fetchFn, calls } = certs();
		const jwt = await accessJwt({ exp: NOW_S + 7200 });
		await verify(jwt, fetchFn, NOW);
		await verify(jwt, fetchFn, NOW + 59 * 60_000);
		expect(calls).toHaveLength(1);
		await verify(jwt, fetchFn, NOW + 60 * 60_000);
		expect(calls).toHaveLength(2);
	});
});

describe('/inloggning', () => {
	const logged: string[] = [];
	const env = (): Env => ({
		ACCESS_AUD: AUD,
		ANVANDARE: JSON.stringify({ 'Person@Example.com ': 'testperson-1' }),
		FIREBASE_SIGNER: signerJson
	});
	const request = (jwt?: string) =>
		new Request('https://tid.example.com/inloggning', {
			headers: jwt ? { 'Cf-Access-Jwt-Assertion': jwt } : {}
		});
	const signIn = (req: Request, e = env(), fetchFn = certs().fetchFn) =>
		handleSignIn(req, e, { now: NOW, fetchFn, log: (line) => logged.push(line) });

	afterEach(() => {
		// No address, JWT or token ever reaches the log (ADR 0008).
		for (const line of logged) {
			expect(line).not.toMatch(/@|eyJ/i);
			expect(JSON.parse(line)).toHaveProperty('event');
		}
		logged.length = 0;
	});

	it('redirects to /#token= on the same origin, uncached', async () => {
		const response = await signIn(request(await accessJwt()));
		expect(response.status).toBe(302);
		expect(response.headers.get('cache-control')).toBe('no-store');
		const location = new URL(response.headers.get('location')!);
		expect(location.origin).toBe('https://tid.example.com');
		expect(location.pathname).toBe('/');
		const token = location.hash.replace(/^#token=/, '');
		const [, payload = ''] = token.split('.');
		expect(decodeJson(payload)).toMatchObject({ uid: 'testperson-1' });
		expect(logged.map((line) => JSON.parse(line))).toEqual([
			{ level: 'info', event: 'inloggning', uid: 'testperson-1' }
		]);
	});

	it('matches the address regardless of case and blanks', async () => {
		const jwt = await accessJwt({ email: ' PERSON@example.COM' });
		expect((await signIn(request(jwt))).status).toBe(302);
	});

	it('answers 401 without a valid Access token', async () => {
		expect((await signIn(request())).status).toBe(401);
		const forged = await accessJwt({}, { key: otherKeys.privateKey });
		expect((await signIn(request(forged))).status).toBe(401);
	});

	it('accepts any of the comma-separated audience tags in ACCESS_AUD', async () => {
		const jwt = await accessJwt();
		const both = { ...env(), ACCESS_AUD: `forhandsvisning-aud, ${AUD}` };
		expect((await signIn(request(jwt), both)).status).toBe(302);
		const other = { ...env(), ACCESS_AUD: 'forhandsvisning-aud,annan-app' };
		expect((await signIn(request(jwt), other)).status).toBe(401);
	});

	it('answers 403 to an address that is not in ANVANDARE', async () => {
		const response = await signIn(request(await accessJwt({ email: 'annan@example.com' })));
		expect(response.status).toBe(403);
		expect(await response.text()).toContain('ingen åtkomst');
	});

	it('answers 500 when the keys cannot be reached', async () => {
		const down = (async () => {
			throw new TypeError('nätet');
		}) as unknown as typeof fetch;
		expect((await signIn(request(await accessJwt()), env(), down)).status).toBe(500);
		const broken = (async () => new Response('', { status: 503 })) as unknown as typeof fetch;
		expect((await signIn(request(await accessJwt()), env(), broken)).status).toBe(500);
	});

	it.each([
		['ACCESS_AUD', { ACCESS_AUD: undefined }],
		['ACCESS_AUD', { ACCESS_AUD: ' , ' }],
		['ANVANDARE', { ANVANDARE: 'inte json' }],
		['FIREBASE_SIGNER', { FIREBASE_SIGNER: undefined }]
	])('answers 500 when %s is missing or broken', async (_, change) => {
		const response = await signIn(request(await accessJwt()), { ...env(), ...change });
		expect(response.status).toBe(500);
	});
});
