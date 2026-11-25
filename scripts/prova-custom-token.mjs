// Proves that a custom token signed by functions/_lib/custom-token.ts is accepted by Firebase Auth
// in the test project (issue 11, decision 0017). Reads Google's JSON key from FIREBASE_SIGNER_TEST,
// signs a token for a made-up uid and signs in through Identity Toolkit's REST API with the test
// project's web key. Prints only the uid and the outcome; never the key or a token.
//
//     node scripts/prova-custom-token.mjs
import { readFileSync } from 'node:fs';
import { parseSigner, signCustomToken } from '../functions/_lib/custom-token.ts';
import { firebaseOptions } from '../src/firebase/config.ts';

const UID = 'prov-inloggning';
// The web key only allows some sites (docs/drift.md); the dev server's address is one of them.
const REFERER = 'http://localhost:5173/';

const aliases = JSON.parse(
	readFileSync(new URL('../.firebaserc', import.meta.url), 'utf8')
).projects;
const signer = parseSigner(process.env.FIREBASE_SIGNER_TEST);
if (signer.projectId === aliases.drift) {
	console.error('Vägrar: nyckeln hör till drift-projektet. Provet körs bara mot testprojektet.');
	process.exit(1);
}
const test = firebaseOptions('test');
if (signer.projectId !== test.projectId) {
	console.error(`Nyckeln hör till ${signer.projectId}, inte testprojektet ${test.projectId}.`);
	process.exit(1);
}

const token = await signCustomToken(signer, UID);
const response = await fetch(
	`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${test.apiKey}`,
	{
		method: 'POST',
		headers: { 'content-type': 'application/json', referer: REFERER },
		body: JSON.stringify({ token, returnSecureToken: true })
	}
);
const body = await response.json();
if (!response.ok) {
	console.error(`Nekad (${response.status}): ${body?.error?.message ?? 'okänt fel'}`);
	process.exit(1);
}
const [, payload = ''] = String(body.idToken).split('.');
const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
const ok = claims.user_id === UID && claims.firebase?.sign_in_provider === 'custom';
console.log(
	`uid: ${claims.user_id}, sign_in_provider: ${claims.firebase?.sign_in_provider} – ${ok ? 'godkänd' : 'FEL'}`
);
process.exit(ok ? 0 : 1);
