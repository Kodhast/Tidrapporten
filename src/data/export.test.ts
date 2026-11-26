// The JSON export (issue 21): every collection in the rules is read, every field survives the
// round trip document → file → document, and times keep their nanoseconds.
import { Timestamp, type DocumentData } from 'firebase/firestore';
import { describe, expect, it, vi } from 'vitest';
import { at } from '../domain/testdata.ts';
import { changeLogCodec } from './dokument.ts';
import { readAll } from './export.ts';
import {
	ASSIGNMENT_COLLECTIONS,
	exportFile,
	exportFileName,
	fromJson as fromJsonWith,
	isUserPath,
	parseExportFile,
	STATE_DOCUMENTS,
	toJson,
	USER_COLLECTIONS,
	type ExportFile,
	type JsonValue
} from './exportformat.ts';
import rules from '../../firestore.rules?raw';
import { logEntry, roundTrips, stored } from './fixturer.ts';

const fromJson = (value: JsonValue) => fromJsonWith(value, (s, n) => new Timestamp(s, n));

const server = vi.hoisted(() => ({ docs: {} as Record<string, Record<string, DocumentData>> }));

vi.mock('firebase/firestore', async (importOriginal) => ({
	...(await importOriginal<typeof import('firebase/firestore')>()),
	collection: (_db: unknown, ...segments: string[]) => segments.slice(2).join('/'),
	doc: (_db: unknown, ...segments: string[]) => segments.slice(2).join('/'),
	getDocFromServer: async (path: string) => {
		const [parent, id] = [path.slice(0, path.lastIndexOf('/')), path.split('/').pop()!];
		const data = server.docs[parent]?.[id];
		return { exists: () => data !== undefined, data: () => data };
	},
	getDocsFromServer: async (path: string) => ({
		docs: Object.entries(server.docs[path] ?? {}).map(([id, data]) => ({ id, data: () => data }))
	})
}));

/** The collections the rules allow below users/{uid}, nested ones included. */
const below = rules.slice(rules.indexOf('match /users/{uid}') + 1);
const ruleCollections = new Set([...below.matchAll(/match \/(\w+)\//g)].map((m) => m[1]));
const ruleStateDocuments = [...below.matchAll(/match \/state\/(\w+) /g)].map((m) => m[1]);

/** Where each fixture is stored, by the codec's name in the round trips. */
const collectionOf: Record<string, string> = {
	assignment: 'assignments',
	employer: 'employers',
	customer: 'customers',
	'time code': 'assignments/a1/codes',
	receiver: 'assignments/a1/receivers',
	'absence type': 'absenceTypes',
	'free day': 'freeDays',
	'interval entry': 'entries',
	'whole-day entry': 'entries',
	timer: 'state',
	pause: 'pauses',
	'draft report': 'reports',
	'sent report': 'reports',
	settings: 'state',
	device: 'devices'
};

/** The draft and the sent report share an id; the draft is stored under another path. */
const pathOf = (name: string, id: string) =>
	`${collectionOf[name]}/${name === 'draft report' ? 'utkast' : id}`;

/** Writes the file as text and reads it back, as a download and a later restore would. */
const throughText = (file: ExportFile): ExportFile => JSON.parse(JSON.stringify(file, null, 2));

describe('export', () => {
	it('reads every collection the rules allow', () => {
		expect(new Set([...USER_COLLECTIONS, ...ASSIGNMENT_COLLECTIONS, 'state'])).toEqual(
			ruleCollections
		);
		expect(ruleStateDocuments).toEqual([...STATE_DOCUMENTS]);
	});

	it('keeps every field of every kind of document through the file', () => {
		const documents = roundTrips.map(([name, codec, value, id]) => ({
			path: pathOf(name, id),
			data: stored(codec.toData(value as never))
		}));
		const log = { ...stored(changeLogCodec.toData(logEntry)), at: Timestamp.fromMillis(1_000) };
		documents.push({ path: 'changeLog/logg-1', data: log });
		expect(Object.keys(collectionOf)).toEqual(roundTrips.map(([name]) => name));

		const file = throughText(exportFile(documents, at('2026-11-26', '10:00')));
		expect(Object.keys(file.documents)).toHaveLength(documents.length);
		for (const [name, codec, value, id, parent] of roundTrips) {
			const back = fromJson(file.documents[pathOf(name, id)]!) as DocumentData;
			expect(codec.fromData(id, back, parent)).toEqual(value);
		}
		expect(fromJson(file.documents['changeLog/logg-1']!)).toEqual(log);
		expect(
			changeLogCodec.fromData(
				'logg-1',
				fromJson(file.documents['changeLog/logg-1']!) as DocumentData
			)
		).toEqual({
			...logEntry,
			at: 1_000
		});
	});

	it('writes times as UTC text with their nanoseconds and reads them back exactly', () => {
		const time = new Timestamp(1_795_000_000, 123_456_789);
		expect(toJson({ at: time })).toEqual({ at: { $timestamp: '2026-11-18T11:06:40.123456789Z' } });
		expect(fromJson(toJson([time]))).toEqual([time]);
		expect(() => fromJson({ $timestamp: '2026-11-19' })).toThrow();
		expect(() => fromJson({ $timestamp: '2026-13-45T99:00:00.000000000Z' })).toThrow();
	});

	it('refuses a value the app never stores instead of losing it', () => {
		expect(() => toJson(new Date(0))).toThrow();
		expect(() => toJson(Number.NaN)).toThrow();
		expect(() => toJson(undefined)).toThrow();
	});

	it('sorts the documents by path and names the file after the Swedish date', () => {
		const now = at('2026-11-27', '00:30'); // 23:30 UTC the day before
		const file = exportFile(
			[
				{ path: 'reports/b', data: { n: 2 } },
				{ path: 'entries/a', data: { n: 1 } }
			],
			now
		);
		expect(file).toEqual({
			app: 'Tidrapporten',
			schemaVersion: 1,
			exportedAt: '2026-11-26T23:30:00.000Z',
			documents: { 'entries/a': { n: 1 }, 'reports/b': { n: 2 } }
		});
		expect(exportFileName(now)).toBe('tidrapporten-2026-11-27.json');
	});

	it('reads the codes and receivers below each assignment', async () => {
		server.docs = {
			assignments: { a1: { name: 'A' }, a2: { name: 'B' } },
			'assignments/a1/codes': { c1: { name: 'Kod' } },
			'assignments/a2/receivers': { r1: { name: 'Mottagare' } },
			changeLog: { l1: { action: 'unlock' } },
			state: { timer: { start: 1 } }
		};
		const all = await readAll({} as never, 'testperson-1');
		expect(all.map((d) => d.path).sort()).toEqual([
			'assignments/a1',
			'assignments/a1/codes/c1',
			'assignments/a2',
			'assignments/a2/receivers/r1',
			'changeLog/l1',
			'state/timer'
		]);
	});

	it('knows the paths the app stores, and nothing else', () => {
		for (const path of [
			'entries/e1',
			'changeLog/l1',
			'state/timer',
			'state/settings',
			'assignments/a1/codes/c1',
			'assignments/a1/receivers/r1'
		]) {
			expect(isUserPath(path), path).toBe(true);
		}
		for (const path of [
			'entries',
			'state/other',
			'system/budget',
			'other/x',
			'assignments/a1/other/x',
			'entries/e1/sub/x',
			'entries/..',
			'entries/__x__',
			'entries//e1'
		]) {
			expect(isUserPath(path), path).toBe(false);
		}
	});

	it('reads a file of this format and says why another is refused', () => {
		const file = exportFile([{ path: 'entries/e1', data: { n: 1 } }], 0);
		expect(parseExportFile(JSON.parse(JSON.stringify(file)))).toEqual(file);
		expect(parseExportFile(null)).toBe('Filen är ingen export från Tidrapporten.');
		expect(parseExportFile({ ...file, app: 'Annan' })).toBe(
			'Filen är ingen export från Tidrapporten.'
		);
		expect(parseExportFile({ ...file, schemaVersion: 2 })).toBe(
			'Filen har formatet 2, och appen läser 1.'
		);
		expect(parseExportFile({ ...file, exportedAt: 'igår' })).toBe('Filen saknar exportens tid.');
		expect(parseExportFile({ ...file, exportedAt: undefined })).toBe('Filen saknar exportens tid.');
		expect(parseExportFile({ ...file, documents: [] })).toBe('Filen saknar dokument.');
		expect(parseExportFile({ ...file, documents: { 'system/budget': {} } })).toBe(
			'Filen har ett dokument appen inte känner igen: system/budget.'
		);
		expect(parseExportFile({ ...file, documents: { 'entries/e1': 5 } })).toBe(
			'Filen har ett dokument appen inte känner igen: entries/e1.'
		);
	});
});
