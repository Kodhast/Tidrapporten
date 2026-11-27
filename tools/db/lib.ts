// Claude reads and corrects real data (issue 27, decisions 0009 and 0012) with the Admin SDK and
// its own service account. The CLI is db.ts; the emulator test (test/emulator/db.emulator.ts) runs
// these functions as the CLI does. Real data never goes into the repo: backups are written outside it.
import { cert, initializeApp } from 'firebase-admin/app';
import {
	FieldValue,
	getFirestore,
	Timestamp,
	type DocumentData,
	type DocumentReference,
	type Firestore
} from 'firebase-admin/firestore';
import {
	ASSIGNMENT_COLLECTIONS,
	exportFile,
	fromJson,
	isUserPath,
	STATE_DOCUMENTS,
	toJson,
	USER_COLLECTIONS,
	type ExportFile,
	type JsonValue
} from '../../src/data/exportformat.ts';
import { dateOf, isoWeekOf } from '../../src/domain/tid.ts';
import { EMULATOR_PROJECT_ID, firebaseOptions } from '../../src/firebase/config.ts';

/** The environment variable that holds the service account's key (JSON, or base64 of it). */
export const KEY_NAME = 'TIDRAPPORTEN_CLAUDE_KEY';

export type Target = 'test' | 'drift';

interface ServiceAccount {
	project_id: string;
	client_email: string;
	private_key: string;
}

/** The key as an object. The value is never part of an error, so that it cannot reach a log. */
export const parseKey = (value: string | undefined): ServiceAccount => {
	const trimmed = (value ?? '').trim();
	if (!trimmed) throw new Error(`${KEY_NAME} saknas i miljön.`);
	let account: Partial<ServiceAccount> & { type?: string };
	try {
		const json = trimmed.startsWith('{')
			? trimmed
			: Buffer.from(trimmed, 'base64').toString('utf8');
		account = JSON.parse(json) as typeof account;
	} catch {
		throw new Error(`${KEY_NAME} är varken JSON eller base64-kodad JSON.`);
	}
	if (
		account?.type !== 'service_account' ||
		!account.project_id ||
		!account.client_email ||
		!account.private_key
	) {
		throw new Error(`${KEY_NAME} är ingen nyckel för ett tjänstekonto.`);
	}
	return account as ServiceAccount;
};

/**
 * Firestore for the target. With FIRESTORE_EMULATOR_HOST set everything goes to the emulator's
 * demo project and the key is not read, so a test can never reach a real project.
 */
export const openDatabase = (target: Target, env: NodeJS.ProcessEnv = process.env): Firestore => {
	if (env.FIRESTORE_EMULATOR_HOST) {
		return getFirestore(initializeApp({ projectId: EMULATOR_PROJECT_ID }, 'tools-db'));
	}
	const account = parseKey(env[KEY_NAME]);
	const projectId = firebaseOptions(target).projectId!;
	const app = initializeApp(
		{
			projectId,
			credential: cert({
				projectId: account.project_id,
				clientEmail: account.client_email,
				privateKey: account.private_key
			})
		},
		'tools-db'
	);
	return getFirestore(app);
};

/** The users that have data; a user has no document of its own, only collections below it. */
export const users = async (db: Firestore): Promise<string[]> =>
	(await db.collection('users').listDocuments()).map((ref) => ref.id).sort();

/** The given user, or the only one in the project. */
export const pickUser = async (db: Firestore, uid: string | undefined): Promise<string> => {
	if (uid) return uid;
	const found = await users(db);
	if (found.length === 1) return found[0]!;
	throw new Error(
		found.length === 0
			? 'Projektet har inga användare.'
			: `Projektet har ${found.length} användare; välj en med --uid.`
	);
};

/** Every document below the user that the JSON export holds, as the app reads them. */
export const readUser = async (
	db: Firestore,
	uid: string
): Promise<Array<{ path: string; data: DocumentData }>> => {
	const user = db.doc(`users/${uid}`);
	const read = async (path: string) =>
		(await user.collection(path).get()).docs.map((d) => ({
			path: `${path}/${d.id}`,
			data: d.data()
		}));
	const top = (await Promise.all(USER_COLLECTIONS.map(read))).flat();
	const nested = await Promise.all(
		top
			.filter((d) => d.path.startsWith('assignments/'))
			.flatMap((d) => ASSIGNMENT_COLLECTIONS.map((sub) => read(`${d.path}/${sub}`)))
	);
	const state = await Promise.all(
		STATE_DOCUMENTS.map(async (id) => {
			const snapshot = await user.collection('state').doc(id).get();
			return snapshot.exists ? [{ path: `state/${id}`, data: snapshot.data()! }] : [];
		})
	);
	return [...top, ...nested.flat(), ...state.flat()];
};

/** The user in the app's export format, which the app's restore and scripts/aterstall.mjs read. */
export const exportUser = async (db: Firestore, uid: string, now: number): Promise<ExportFile> =>
	exportFile(await readUser(db, uid), now);

/** The number of documents per collection for each user; no content. */
export const stats = async (db: Firestore): Promise<Record<string, Record<string, number>>> => {
	const result: Record<string, Record<string, number>> = {};
	for (const uid of await users(db)) {
		const counts: Record<string, number> = {};
		for (const { path } of await readUser(db, uid)) {
			const parts = path.split('/');
			const collection = parts.length === 4 ? `assignments/*/${parts[2]}` : parts[0]!;
			counts[collection] = (counts[collection] ?? 0) + 1;
		}
		result[uid] = counts;
	}
	return result;
};

/** A filter as `field==value`; the value is JSON when it parses, else text. */
export const parseWhere = (text: string): { field: string; value: unknown } => {
	const at = text.indexOf('==');
	if (at < 1) throw new Error(`Filtret ska vara fält==värde: ${text}`);
	const raw = text.slice(at + 2);
	let value: unknown = raw;
	try {
		value = JSON.parse(raw);
	} catch {
		// Text, such as an id.
	}
	return { field: text.slice(0, at), value };
};

/** The documents of one collection below the user, by path, as JSON. */
export const query = async (
	db: Firestore,
	uid: string,
	collection: string,
	options: { where?: string; limit?: number } = {}
): Promise<Record<string, JsonValue>> => {
	const isState = collection === 'state';
	if (!isState && !isUserPath(`${collection}/x`)) {
		throw new Error(`Samlingen ${collection} finns inte i exporten.`);
	}
	let ref: FirebaseFirestore.Query = db.doc(`users/${uid}`).collection(collection);
	if (options.where) {
		const { field, value } = parseWhere(options.where);
		ref = ref.where(field, '==', value);
	}
	if (options.limit) ref = ref.limit(options.limit);
	const docs = (await ref.get()).docs.filter((d) => !isState || isUserPath(`state/${d.id}`));
	return Object.fromEntries(docs.map((d) => [`${collection}/${d.id}`, toJson(d.data())]));
};

/** A correction: the document's whole new data, or its deletion. */
export type Change =
	{ path: string; set: { [key: string]: JsonValue } } | { path: string; delete: true };

/** The change in a file, or why it cannot be one. */
export const parseChange = (value: unknown): Change => {
	const change = value as { path?: unknown; set?: unknown; delete?: unknown } | null;
	if (typeof change !== 'object' || change === null || typeof change.path !== 'string') {
		throw new Error('Ändringen saknar path.');
	}
	if (!isUserPath(change.path) || change.path.startsWith('changeLog/')) {
		throw new Error(`Sökvägen ${change.path} går inte att rätta.`);
	}
	const hasSet =
		typeof change.set === 'object' && change.set !== null && !Array.isArray(change.set);
	if (hasSet === (change.delete === true)) {
		throw new Error('Ändringen ska ha antingen set med dokumentets data eller "delete": true.');
	}
	return change as Change;
};

const META = ['schemaVersion', 'createdAt', 'updatedAt'];

const withoutMeta = (data: DocumentData | null | undefined): DocumentData | null => {
	if (!data) return null;
	const copy = { ...data };
	for (const key of META) delete copy[key];
	return copy;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The week a change belongs to, for the log: a report's week, a paused day's week (its id is the
 * date), or the week an interval starts in. Null for what has no week.
 */
export const weekOf = (path: string, data: DocumentData | null): string | null => {
	if (!data) return null;
	if (typeof data.week === 'string') return data.week;
	const [collection, id] = path.split('/');
	if (collection === 'pauses' && id && DATE.test(id)) return isoWeekOf(id);
	const start = (data.time as { start?: unknown } | undefined)?.start;
	if (start instanceof Timestamp) return isoWeekOf(dateOf(start.toMillis()));
	return null;
};

export interface FixPlan {
	path: string;
	action: 'create' | 'update' | 'delete';
	week: string | null;
	before: JsonValue;
	after: JsonValue;
}

export interface FixResult extends FixPlan {
	/** Where the backup went and the log entry's id; both null when nothing was written. */
	backup: string | null;
	logId: string | null;
}

/**
 * Shows a correction and, with `write`, makes it: the whole user is backed up through `backup`
 * first, then the change and a changeLog entry by 'claude' with the reason are written in one
 * transaction, which refuses if the document changed after it was read. A report gets the entry
 * as its lastChangeId, as when the app changes a locked week.
 */
export const fix = async (
	db: Firestore,
	options: {
		uid: string;
		change: Change;
		reason: string;
		write: boolean;
		backup: (file: ExportFile) => Promise<string>;
		now?: number;
	}
): Promise<FixResult> => {
	const { uid, change } = options;
	const reason = options.reason.trim();
	if (!reason) throw new Error('Ett skäl krävs (--skal).');
	const user = db.doc(`users/${uid}`);
	const ref: DocumentReference = db.doc(`${user.path}/${change.path}`);
	const snapshot = await ref.get();
	if ('delete' in change && !snapshot.exists) throw new Error(`${change.path} finns inte.`);
	const action = 'delete' in change ? 'delete' : snapshot.exists ? 'update' : 'create';
	const data =
		'set' in change
			? (fromJson(change.set, (s, ns) => new Timestamp(s, ns)) as DocumentData)
			: null;
	const logRef = user.collection('changeLog').doc();
	const isReport = change.path.startsWith('reports/');
	const after =
		data && isReport ? { ...withoutMeta(data), lastChangeId: logRef.id } : withoutMeta(data);
	const before = withoutMeta(snapshot.data());
	const plan: FixPlan = {
		path: change.path,
		action,
		week: weekOf(change.path, after) ?? weekOf(change.path, before),
		before: before === null ? null : toJson(before),
		after: after === null ? null : toJson(after)
	};
	if (!options.write) return { ...plan, backup: null, logId: null };

	const backup = await options.backup(await exportUser(db, uid, options.now ?? Date.now()));
	await db.runTransaction(async (tx) => {
		const current = await tx.get(ref);
		const same =
			current.exists === snapshot.exists &&
			(!current.exists || current.updateTime!.isEqual(snapshot.updateTime!));
		if (!same) throw new Error(`${change.path} ändrades medan rättningen förbereddes; kör om.`);
		const now = FieldValue.serverTimestamp();
		if (after === null) tx.delete(ref);
		else {
			tx.set(ref, {
				...after,
				schemaVersion: data!.schemaVersion ?? snapshot.get('schemaVersion') ?? 1,
				createdAt: snapshot.get('createdAt') ?? now,
				updatedAt: now
			});
		}
		tx.create(logRef, {
			at: now,
			path: change.path,
			action,
			week: plan.week,
			before,
			after,
			reason,
			by: 'claude',
			schemaVersion: 1,
			createdAt: now,
			updatedAt: now
		});
	});
	return { ...plan, backup, logId: logRef.id };
};
