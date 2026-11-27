#!/usr/bin/env node
// Claude's tool for real data (issue 27); skill db-access says when it may be used. Run with
// Node 24, which strips the types:
//   node tools/db/db.ts stats [--miljo test|drift]
//   node tools/db/db.ts query <samling> [--where fält==värde] [--limit n] [--uid u]
//   node tools/db/db.ts export [--ut fil] [--uid u]
//   node tools/db/db.ts fix <ändring.json> --skal "…" [--skriv] [--drift] [--uid u]
// Reads need the owner's ok; fix writes only with --skriv, and in drift only with --drift too.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import type { ExportFile } from '../../src/data/exportformat.ts';
import {
	exportUser,
	fix,
	openDatabase,
	parseChange,
	pickUser,
	query,
	stats,
	type Target
} from './lib.ts';

const FLAGS = new Set(['skriv', 'drift']);
const OPTIONS = new Set(['miljo', 'uid', 'where', 'limit', 'ut', 'skal', 'backup']);

/** The command, its positional arguments, options and flags. Unknown ones are refused. */
export const parseArgs = (argv: string[]) => {
	const positional: string[] = [];
	const options: Record<string, string> = {};
	const flags = new Set<string>();
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i]!;
		if (!arg.startsWith('--')) {
			positional.push(arg);
			continue;
		}
		const name = arg.slice(2);
		if (FLAGS.has(name)) flags.add(name);
		else if (OPTIONS.has(name) && i + 1 < argv.length) options[name] = argv[(i += 1)]!;
		else throw new Error(`Okänt eller ofullständigt argument: ${arg}`);
	}
	const target = options.miljo ?? 'test';
	if (target !== 'test' && target !== 'drift') throw new Error('--miljo är test eller drift.');
	const [command, ...rest] = positional;
	return { command, rest, options, flags, target: target as Target };
};

/** Writing in drift takes both --skriv and --drift, so that a write there is never by mistake. */
export const writeAllowed = (target: Target, flags: Set<string>): boolean => {
	if (!flags.has('skriv')) return false;
	if (target === 'drift' && !flags.has('drift')) {
		throw new Error('En skrivning i drift kräver --drift, och ägarens ok på just den ändringen.');
	}
	return true;
};

const backupTo = (dir: string) => async (file: ExportFile) => {
	await mkdir(dir, { recursive: true });
	const name = path.join(dir, `tidrapporten-${file.exportedAt.replace(/[:.]/g, '-')}.json`);
	await writeFile(name, JSON.stringify(file, null, '\t'));
	return name;
};

const print = (value: unknown) => console.log(JSON.stringify(value, null, 2));

const USAGE = 'Användning: node tools/db/db.ts stats|query|export|fix … (se filens början)';

const main = async (argv: string[]) => {
	const { command, rest, options, flags, target } = parseArgs(argv);
	if (!command || !['stats', 'query', 'export', 'fix'].includes(command)) throw new Error(USAGE);
	const write = command === 'fix' && writeAllowed(target, flags);
	const db = openDatabase(target);
	if (command === 'stats') return print(await stats(db));
	const uid = await pickUser(db, options.uid);
	if (command === 'query') {
		if (!rest[0]) throw new Error('Ange samlingen, till exempel entries.');
		const limit = options.limit ? Number(options.limit) : undefined;
		return print(await query(db, uid, rest[0], { where: options.where, limit }));
	}
	if (command === 'export') {
		const file = await exportUser(db, uid, Date.now());
		if (!options.ut) return print(file);
		await writeFile(options.ut, JSON.stringify(file, null, '\t'));
		return console.log(`${Object.keys(file.documents).length} dokument till ${options.ut}.`);
	}
	if (!rest[0]) throw new Error('Ange filen med ändringen.');
	const change = parseChange(JSON.parse(await readFile(rest[0], 'utf8')));
	const result = await fix(db, {
		uid,
		change,
		reason: options.skal ?? '',
		write,
		backup: backupTo(options.backup ?? path.join(homedir(), 'tidrapporten-backup'))
	});
	print(result);
	if (!write) console.log('Inget skrevs. Kör igen med --skriv när ägaren sagt ja.');
};

if (import.meta.url === `file://${process.argv[1]}`) {
	main(process.argv.slice(2)).then(
		() => process.exit(0),
		(error: unknown) => {
			console.error(error instanceof Error ? error.message : String(error));
			process.exit(1);
		}
	);
}
