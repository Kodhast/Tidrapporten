// /inloggning (decision 0017): Cloudflare Access stands in front of this path and signs the user
// in with Google. The function checks Access's JWT, looks the e-mail address up in ANVANDARE and
// redirects to /#token=<Firebase custom token>. The fragment never reaches a server; the app reads
// it and signs in with signInWithCustomToken.
import { KeysUnavailable, verifyAccessJwt } from './_lib/access.ts';
import { parseSigner, signCustomToken } from './_lib/custom-token.ts';

export interface Env {
	/** The Access application's audience tag. */
	ACCESS_AUD?: string;
	/** JSON object, e-mail address → uid. The uid stays when the address changes. */
	ANVANDARE?: string;
	/** Google's JSON key file for the service account that signs (no roles). */
	FIREBASE_SIGNER?: string;
}

export interface Deps {
	now?: number;
	fetchFn?: typeof fetch;
	/** One JSON line per event, with ids only: never an address, a JWT or a token (ADR 0008). */
	log?: (line: string) => void;
}

type Event =
	| { level: 'info'; event: 'inloggning'; uid: string }
	| { level: 'info'; event: 'inloggning-nekad'; reason: 'jwt' | 'okand-adress' }
	| { level: 'error'; event: 'inloggning-fel'; reason: 'nycklar' | 'konfiguration' | 'okant' };

function text(status: number, body: string): Response {
	return new Response(body, {
		status,
		headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
	});
}

function lookUpUid(users: string | undefined, email: string): string | null {
	const byEmail = JSON.parse(users ?? '') as Record<string, unknown>;
	const wanted = email.trim().toLowerCase();
	for (const [address, uid] of Object.entries(byEmail)) {
		if (address.trim().toLowerCase() === wanted && typeof uid === 'string' && uid) return uid;
	}
	return null;
}

export async function handleSignIn(request: Request, env: Env, deps: Deps = {}): Promise<Response> {
	const { now = Date.now(), fetchFn = fetch, log = console.log } = deps;
	const write = (event: Event) => log(JSON.stringify(event));
	const misconfigured = () => {
		write({ level: 'error', event: 'inloggning-fel', reason: 'konfiguration' });
		return text(500, 'Inloggningen är inte uppsatt rätt.');
	};
	if (!env.ACCESS_AUD) return misconfigured();

	let payload;
	try {
		payload = await verifyAccessJwt(request.headers.get('Cf-Access-Jwt-Assertion'), {
			aud: env.ACCESS_AUD,
			now,
			fetchFn
		});
	} catch (error) {
		const reason = error instanceof KeysUnavailable ? 'nycklar' : 'okant';
		write({ level: 'error', event: 'inloggning-fel', reason });
		if (reason === 'okant') throw error;
		return text(500, 'Inloggningen går inte att kontrollera just nu. Försök igen om en stund.');
	}
	if (!payload) {
		write({ level: 'info', event: 'inloggning-nekad', reason: 'jwt' });
		return text(401, 'Inloggningen gick inte att kontrollera. Försök igen.');
	}

	let uid: string | null;
	try {
		uid = lookUpUid(env.ANVANDARE, payload.email);
	} catch {
		return misconfigured();
	}
	if (!uid) {
		write({ level: 'info', event: 'inloggning-nekad', reason: 'okand-adress' });
		return text(403, 'Det här kontot har ingen åtkomst till Tidrapporten.');
	}
	let token: string;
	try {
		token = await signCustomToken(parseSigner(env.FIREBASE_SIGNER), uid, now);
	} catch {
		return misconfigured();
	}

	write({ level: 'info', event: 'inloggning', uid });
	const target = new URL('/', request.url);
	target.hash = `token=${token}`;
	return new Response(null, {
		status: 302,
		headers: { location: target.href, 'cache-control': 'no-store' }
	});
}

export const onRequestGet = ({ request, env }: { request: Request; env: Env }) =>
	handleSignIn(request, env);
