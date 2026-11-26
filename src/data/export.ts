// The JSON export of all the user's data (issue 21): every document below users/{uid}, the
// changeLog included, as it is stored. Times are kept exact, so a file can be read back without
// loss (the round trip in export.test.ts). When a collection is added, it is added here too; the
// test compares the list with firestore.rules.
import {
	collection,
	doc,
	getDocFromServer,
	getDocsFromServer,
	Timestamp,
	type DocumentData,
	type Firestore
} from 'firebase/firestore';
import { dateOf } from '../domain/tid.ts';
import type { Id, UtcMillis } from '../domain/types.ts';

/** The version of the file's format. Raise it when the format changes, never silently. */
export const EXPORT_VERSION = 1;

/** The collections directly below the user, and those below each assignment. */
export const USER_COLLECTIONS = [
	'assignments',
	'absenceTypes',
	'freeDays',
	'entries',
	'pauses',
	'reports',
	'changeLog',
	'devices'
] as const;
export const ASSIGNMENT_COLLECTIONS = ['codes', 'receivers'] as const;
/** The rules allow `state` document by document, so it cannot be listed as a collection. */
export const STATE_DOCUMENTS = ['timer', 'settings'] as const;

export type JsonValue =
	null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface ExportFile {
	app: 'Tidrapporten';
	schemaVersion: number;
	exportedAt: string;
	/** Each document's data by its path below the user, such as `entries/abc`. */
	documents: Record<string, { [key: string]: JsonValue }>;
}

/** The key a time is written under; no field in the app starts with `$`. */
const TIME = '$timestamp';

/** A time as ISO 8601 in UTC with all nine decimals, so that no nanosecond is lost. */
const timeText = (t: Timestamp): string =>
	`${new Date(t.seconds * 1000).toISOString().slice(0, 19)}.${String(t.nanoseconds).padStart(9, '0')}Z`;

const timeOf = (text: string): Timestamp => {
	const match = /^(.{19})\.(\d{9})Z$/.exec(text);
	if (!match) throw new Error(`Not a time: ${text}`);
	return new Timestamp(Date.parse(`${match[1]}Z`) / 1000, Number(match[2]));
};

/** A stored value as JSON. Anything the app never stores is refused rather than lost. */
export const toJson = (value: unknown): JsonValue => {
	if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) throw new Error(`Not a finite number: ${value}`);
		return value;
	}
	if (value instanceof Timestamp) return { [TIME]: timeText(value) };
	if (Array.isArray(value)) return value.map(toJson);
	if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toJson(v)]));
	}
	throw new Error(`Cannot export the value ${String(value)}`);
};

/** The stored value back from JSON: the inverse of toJson. */
export const fromJson = (value: JsonValue): unknown => {
	if (Array.isArray(value)) return value.map(fromJson);
	if (value !== null && typeof value === 'object') {
		const keys = Object.keys(value);
		const time = value[TIME];
		if (keys.length === 1 && typeof time === 'string') return timeOf(time);
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fromJson(v)]));
	}
	return value;
};

/** The file for the documents, sorted by path so that two exports can be compared. */
export const exportFile = (
	documents: ReadonlyArray<{ path: string; data: DocumentData }>,
	now: UtcMillis
): ExportFile => ({
	app: 'Tidrapporten',
	schemaVersion: EXPORT_VERSION,
	exportedAt: new Date(now).toISOString(),
	documents: Object.fromEntries(
		[...documents]
			.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
			.map(({ path, data }) => [path, toJson(data) as { [key: string]: JsonValue }])
	)
});

export const exportFileName = (now: UtcMillis) => `tidrapporten-${dateOf(now)}.json`;

/**
 * Reads every document below the user from the server. Offline it fails rather than export what
 * the cache happens to hold.
 */
export const readAll = async (
	db: Firestore,
	uid: Id
): Promise<Array<{ path: string; data: DocumentData }>> => {
	const read = async (path: string) =>
		(await getDocsFromServer(collection(db, 'users', uid, path))).docs.map((d) => ({
			path: `${path}/${d.id}`,
			data: d.data()
		}));
	const top = (await Promise.all(USER_COLLECTIONS.map(read))).flat();
	const assignmentIds = top
		.filter((d) => d.path.startsWith('assignments/'))
		.map((d) => d.path.slice('assignments/'.length));
	const nested = await Promise.all(
		assignmentIds.flatMap((id) =>
			ASSIGNMENT_COLLECTIONS.map((sub) => read(`assignments/${id}/${sub}`))
		)
	);
	const state = await Promise.all(
		STATE_DOCUMENTS.map(async (id) => {
			const snapshot = await getDocFromServer(doc(db, 'users', uid, 'state', id));
			return snapshot.exists() ? [{ path: `state/${id}`, data: snapshot.data() }] : [];
		})
	);
	return [...top, ...nested.flat(), ...state.flat()];
};
