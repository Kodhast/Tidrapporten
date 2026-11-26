// The format of the JSON export (issues 21 and 57): every document below users/{uid}, the
// changeLog included, as it is stored. Times are kept exact, so a file can be read back without
// loss (the round trip in export.test.ts). When a collection is added, it is added here too; the
// test compares the list with firestore.rules. No Firebase import: the restore function on the
// server reads the same format with the Admin SDK's times.
import { dateOf } from '../domain/tid.ts';
import type { UtcMillis } from '../domain/types.ts';

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

/** A Firestore time, from the web SDK or the Admin SDK. */
interface StoredTime {
	seconds: number;
	nanoseconds: number;
	toMillis(): number;
}

const isTime = (value: object): value is StoredTime =>
	typeof (value as StoredTime).seconds === 'number' &&
	typeof (value as StoredTime).nanoseconds === 'number' &&
	typeof (value as StoredTime).toMillis === 'function';

/** A time as ISO 8601 in UTC with all nine decimals, so that no nanosecond is lost. */
const timeText = (t: StoredTime): string =>
	`${new Date(t.seconds * 1000).toISOString().slice(0, 19)}.${String(t.nanoseconds).padStart(9, '0')}Z`;

/** Makes the SDK's time from seconds and nanoseconds. */
export type MakeTime = (seconds: number, nanoseconds: number) => unknown;

const timeOf = (text: string, time: MakeTime): unknown => {
	const match = /^(.{19})\.(\d{9})Z$/.exec(text);
	const millis = match ? Date.parse(`${match[1]}Z`) : Number.NaN;
	if (!match || Number.isNaN(millis)) throw new Error(`Not a time: ${text}`);
	return time(millis / 1000, Number(match[2]));
};

/** A stored value as JSON. Anything the app never stores is refused rather than lost. */
export const toJson = (value: unknown): JsonValue => {
	if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) throw new Error(`Not a finite number: ${value}`);
		return value;
	}
	if (Array.isArray(value)) return value.map(toJson);
	if (typeof value === 'object' && value !== null && isTime(value)) {
		return { [TIME]: timeText(value) };
	}
	if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toJson(v)]));
	}
	throw new Error(`Cannot export the value ${String(value)}`);
};

/** The stored value back from JSON, with `time` making the SDK's times: the inverse of toJson. */
export const fromJson = (value: JsonValue, time: MakeTime): unknown => {
	if (Array.isArray(value)) return value.map((v) => fromJson(v, time));
	if (value !== null && typeof value === 'object') {
		const keys = Object.keys(value);
		const text = value[TIME];
		if (keys.length === 1 && typeof text === 'string') return timeOf(text, time);
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fromJson(v, time)]));
	}
	return value;
};

/** The file for the documents, sorted by path so that two exports can be compared. */
export const exportFile = (
	documents: ReadonlyArray<{ path: string; data: object }>,
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

/** Whether a path below the user is one the app stores, so that a file cannot write elsewhere. */
export const isUserPath = (path: string): boolean => {
	const parts = path.split('/');
	if (parts.some((p) => p === '' || p === '.' || p === '..' || p.startsWith('__'))) return false;
	const [first, id, sub, subId] = parts;
	if (parts.length === 2 && first === 'state')
		return (STATE_DOCUMENTS as readonly string[]).includes(id!);
	if (parts.length === 2) return (USER_COLLECTIONS as readonly string[]).includes(first!);
	return (
		parts.length === 4 &&
		first === 'assignments' &&
		(ASSIGNMENT_COLLECTIONS as readonly string[]).includes(sub!) &&
		subId !== undefined
	);
};

/** The file if it is an export this version can read, otherwise why not, in Swedish. */
export const parseExportFile = (value: unknown): ExportFile | string => {
	const file = value as Partial<ExportFile> | null;
	if (typeof file !== 'object' || file === null || file.app !== 'Tidrapporten') {
		return 'Filen är ingen export från Tidrapporten.';
	}
	if (file.schemaVersion !== EXPORT_VERSION) {
		return `Filen har formatet ${String(file.schemaVersion)}, och appen läser ${EXPORT_VERSION}.`;
	}
	if (typeof file.exportedAt !== 'string' || Number.isNaN(Date.parse(file.exportedAt))) {
		return 'Filen saknar exportens tid.';
	}
	const documents = file.documents;
	if (typeof documents !== 'object' || documents === null || Array.isArray(documents)) {
		return 'Filen saknar dokument.';
	}
	const bad = Object.entries(documents).find(
		([path, data]) =>
			!isUserPath(path) || typeof data !== 'object' || data === null || Array.isArray(data)
	);
	if (bad) return `Filen har ett dokument appen inte känner igen: ${bad[0]}.`;
	return file as ExportFile;
};
