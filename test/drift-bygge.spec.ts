import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'vite';
import { afterAll, describe, expect, it } from 'vitest';

// The test sign-in must never reach a drift build (issue 10). The claim name is the marker; the
// emulator build shows that the search would find it.
const marker = 'testSignIn';
const outDirs: string[] = [];

async function buildAndRead(mode: string, emulator: boolean): Promise<string> {
	const outDir = mkdtempSync(path.join(tmpdir(), 'tidrapporten-bygge-'));
	outDirs.push(outDir);
	const previous = process.env.VITE_FIREBASE_EMULATOR;
	if (emulator) process.env.VITE_FIREBASE_EMULATOR = 'true';
	else delete process.env.VITE_FIREBASE_EMULATOR;
	try {
		await build({ mode, logLevel: 'silent', build: { outDir, emptyOutDir: true } });
	} finally {
		if (previous === undefined) delete process.env.VITE_FIREBASE_EMULATOR;
		else process.env.VITE_FIREBASE_EMULATOR = previous;
	}
	return readdirSync(outDir, { recursive: true, encoding: 'utf8' })
		.filter((file) => file.endsWith('.js'))
		.map((file) => readFileSync(path.join(outDir, file), 'utf8'))
		.join('\n');
}

afterAll(() => {
	for (const dir of outDirs) rmSync(dir, { recursive: true, force: true });
});

describe('the drift build', { timeout: 120_000 }, () => {
	it('has no test sign-in', async () => {
		const code = await buildAndRead('drift', false);
		expect(code).not.toContain(marker);
	});

	it('lets the sign-in pass the service worker (decision 0017)', async () => {
		const code = await buildAndRead('drift', false);
		expect(code).toContain('/^\\/inloggning/');
		expect(code).toContain('/^\\/cdn-cgi\\//');
	});

	it('is compared with an emulator build that has it', async () => {
		expect(await buildAndRead('production', true)).toContain(marker);
	});
});
