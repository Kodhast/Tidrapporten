#!/usr/bin/env node
// Restores a JSON export (src/data/export.ts, issue 21) to a user through Firestore's REST API,
// past the rules, as an admin. The test test/e2e/aterstallning.e2e.ts exports, empties and
// restores against the emulators. Against a real project, run it in Cloud Shell:
//   node scripts/aterstall.mjs tidrapporten-2026-11-26.json <uid> test
// Only an empty user is restored to, and drift also needs --drift (decision 0009: never write in
// drift without the owner having asked for exactly that).
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const PROJECTS = { test: 'dagboken-497114', drift: 'device-streaming-5b35f7b8' };
const TIME = '$timestamp';

/** A value from the file as a Firestore REST value; times keep their nine decimals. */
export const toValue = (value) => {
	if (value === null) return { nullValue: null };
	if (typeof value === 'boolean') return { booleanValue: value };
	if (typeof value === 'string') return { stringValue: value };
	if (typeof value === 'number') {
		return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
	}
	if (Array.isArray(value)) return { arrayValue: { values: value.map(toValue) } };
	const keys = Object.keys(value);
	if (keys.length === 1 && typeof value[TIME] === 'string') return { timestampValue: value[TIME] };
	return { mapValue: { fields: toFields(value) } };
};

const toFields = (data) =>
	Object.fromEntries(Object.entries(data).map(([key, value]) => [key, toValue(value)]));

/**
 * Writes every document of the file below users/{uid}. `base` is the documents URL of the
 * database and `token` the bearer token. Refuses a file of another format or a user with data.
 */
export const restore = async ({ file, uid, base, token }) => {
	if (file.app !== 'Tidrapporten' || file.schemaVersion !== 1) {
		throw new Error(`Okänt format: ${file.app} ${file.schemaVersion}`);
	}
	const headers = { Authorization: `Bearer ${token}`, 'content-type': 'application/json' };
	const existing = await fetch(`${base}/users/${uid}:listCollectionIds`, {
		method: 'POST',
		headers,
		body: '{}'
	});
	if (!existing.ok) throw new Error(`Kunde inte läsa ${uid}: ${await existing.text()}`);
	if (((await existing.json()).collectionIds ?? []).length > 0) {
		throw new Error(`Användaren ${uid} har redan data; återställer bara till en tom.`);
	}
	const database = base.slice(base.indexOf('projects/'), base.lastIndexOf('/documents'));
	const writes = Object.entries(file.documents).map(([path, data]) => ({
		update: { name: `${database}/documents/users/${uid}/${path}`, fields: toFields(data) }
	}));
	// A commit takes at most 500 writes.
	for (let i = 0; i < writes.length; i += 500) {
		const response = await fetch(`${base}:commit`, {
			method: 'POST',
			headers,
			body: JSON.stringify({ writes: writes.slice(i, i + 500) })
		});
		if (!response.ok) throw new Error(`Skrivningen misslyckades: ${await response.text()}`);
	}
	return writes.length;
};

if (import.meta.url === `file://${process.argv[1]}`) {
	const [path, uid, target, flag] = process.argv.slice(2);
	const project = PROJECTS[target];
	if (!path || !uid || !project || (target === 'drift' && flag !== '--drift')) {
		console.error('Användning: node scripts/aterstall.mjs <fil> <uid> test|drift [--drift]');
		process.exit(1);
	}
	const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
	const file = JSON.parse(await readFile(path, 'utf8'));
	const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
	const count = await restore({ file, uid, base, token });
	console.log(`${count} dokument återställda till ${uid} i ${target}.`);
}
