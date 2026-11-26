// The restore from a JSON export (issue 57). The app sends the file; the function writes, for the
// signed-in user only, the documents of the file that do not exist, with their times exact (the
// rules let the app itself write times only as the server's now). Nothing is overwritten and
// nothing is deleted (Mats 2026-11-26: "Lägg tillbaka det som saknas"). Each batch carries its own
// changeLog entry with the paths it restored, so a restore that stops halfway leaves every written
// document in the log. Firestore is injected (index.ts), so that this runs in Vitest.
import {
	fromJson,
	parseExportFile,
	type ExportFile,
	type MakeTime
} from '../../src/data/exportformat.ts';

export interface RestoreEffects {
	makeTime: MakeTime;
	/** Which of the paths below the user exist. */
	existing(uid: string, paths: readonly string[]): Promise<Set<string>>;
	/**
	 * Creates the documents below the user and adds the entry to the user's changeLog, with the
	 * server's time, in one batch: all or nothing. Fails if any of the documents exists.
	 */
	create(
		uid: string,
		documents: ReadonlyArray<{ path: string; data: object }>,
		logEntry: Record<string, unknown>
	): Promise<void>;
	info(message: string, fields: Record<string, unknown>): void;
}

export interface RestoreResult {
	restored: number;
	existed: number;
}

/** A file the function refuses; the message is shown to the user. */
export class RefusedFile extends Error {}

/** Firestore takes at most 500 writes in a batch; one of them is the log entry. */
const CHUNK = 499;

export async function restoreMissing(
	uid: string,
	input: unknown,
	effects: RestoreEffects
): Promise<RestoreResult> {
	const file: ExportFile | string = parseExportFile(input);
	if (typeof file === 'string') throw new RefusedFile(file);
	// Decode everything before writing anything, so that a bad value refuses the whole file.
	let decoded: Array<{ path: string; data: object }>;
	try {
		decoded = Object.entries(file.documents).map(([path, data]) => ({
			path,
			data: fromJson(data, effects.makeTime) as object
		}));
	} catch {
		throw new RefusedFile('Filen har ett värde appen inte kan läsa.');
	}
	let restored = 0;
	for (let i = 0; i < decoded.length; i += CHUNK) {
		const chunk = decoded.slice(i, i + CHUNK);
		const found = await effects.existing(
			uid,
			chunk.map((doc) => doc.path)
		);
		const missing = chunk.filter((doc) => !found.has(doc.path));
		if (missing.length === 0) continue;
		await effects.create(uid, missing, {
			path: '*',
			action: 'restore',
			week: null,
			before: null,
			after: { paths: missing.map((doc) => doc.path), exportedAt: file.exportedAt },
			reason: 'Återställd från fil',
			by: 'app'
		});
		restored += missing.length;
	}
	const result = { restored, existed: decoded.length - restored };
	effects.info('aterstall: klar', { uid, ...result });
	return result;
}
