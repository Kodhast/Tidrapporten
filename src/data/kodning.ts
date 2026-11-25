// Reading and writing Firestore fields tolerantly (ADR 0012): unknown fields are ignored, missing
// or malformed ones get a default, so an older or newer document never breaks the app.
import { serverTimestamp, Timestamp, type DocumentData } from 'firebase/firestore';
import type { UtcMillis } from '../domain/types.ts';

/** The version every document is written with. Raise it with a migration, never silently. */
export const SCHEMA_VERSION = 1;

/** The common fields of a new document; both times are set by the server. */
export const createMeta = (): DocumentData => ({
	schemaVersion: SCHEMA_VERSION,
	createdAt: serverTimestamp(),
	updatedAt: serverTimestamp()
});

/** The common fields of an update; createdAt is left as it is. */
export const updateMeta = (): DocumentData => ({
	schemaVersion: SCHEMA_VERSION,
	updatedAt: serverTimestamp()
});

type Raw = Record<string, unknown>;

/** A copy without the given keys: ids and parents that the path holds instead. */
export const without = <T extends object, K extends keyof T>(
	value: T,
	...keys: K[]
): Omit<T, K> => {
	const copy = { ...value };
	for (const key of keys) delete copy[key];
	return copy;
};

export const asRecord = (value: unknown): Raw =>
	typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Raw) : {};

export const str = (value: unknown, fallback = ''): string =>
	typeof value === 'string' ? value : fallback;

export const strOrNull = (value: unknown): string | null =>
	typeof value === 'string' ? value : null;

export const int = (value: unknown, fallback = 0): number =>
	typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;

export const bool = (value: unknown, fallback = false): boolean =>
	typeof value === 'boolean' ? value : fallback;

export const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
	allowed.includes(value as T) ? (value as T) : fallback;

/** A string-to-string map; other values are dropped. */
export const stringMap = (value: unknown): Record<string, string> =>
	Object.fromEntries(
		Object.entries(asRecord(value)).filter((e): e is [string, string] => typeof e[1] === 'string')
	);

/** A Firestore Timestamp (or plain milliseconds) as UTC milliseconds. */
export const millis = (value: unknown, fallback = 0): UtcMillis => {
	if (value instanceof Timestamp) return value.toMillis();
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	return fallback;
};

export const timestamp = (at: UtcMillis): Timestamp => Timestamp.fromMillis(at);
