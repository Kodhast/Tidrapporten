// Emptying and deleting (issue 26) against the emulator: emptying takes everything below the
// user, the changeLog included, and nothing of anyone else; deleting an assignment takes what is
// its own, keeps the changeLog with a new entry, and refuses an assignment with a sent week.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
	deleteAssignment,
	emptyAccount,
	RefusedDelete
} from '../../firebase-functions/src/radering.ts';
import { EMULATOR_HOST, EMULATOR_PORTS, EMULATOR_PROJECT_ID } from '../../src/firebase/config.ts';

// Own users, since the emulator test files run side by side against one database.
const ME = 'radering-1';
const OTHER = 'radering-2';

beforeAll(() => {
	process.env.FIRESTORE_EMULATOR_HOST ??= `${EMULATOR_HOST}:${EMULATOR_PORTS.firestore}`;
	initializeApp({ projectId: EMULATOR_PROJECT_ID });
});

const db = () => getFirestore();

beforeEach(async () => {
	for (const uid of [ME, OTHER]) await db().recursiveDelete(db().doc(`users/${uid}`));
});

const put = (uid: string, path: string, data: object = {}) =>
	db()
		.doc(`users/${uid}/${path}`)
		.set({ schemaVersion: 1, ...data });

const paths = async (uid: string) => {
	const found: string[] = [];
	const walk = async (ref: FirebaseFirestore.DocumentReference) => {
		for (const collection of await ref.listCollections()) {
			for (const doc of (await collection.get()).docs) {
				found.push(doc.ref.path.replace(`users/${uid}/`, ''));
				await walk(doc.ref);
			}
		}
	};
	await walk(db().doc(`users/${uid}`));
	return found.sort();
};

const seed = async (uid: string) => {
	await put(uid, 'assignments/a1', { name: 'Uppdrag A' });
	await put(uid, 'assignments/a1/codes/c1', { name: 'Kod' });
	await put(uid, 'assignments/a1/receivers/r1', { name: 'Mottagare' });
	await put(uid, 'assignments/a2', { name: 'Uppdrag B' });
	await put(uid, 'entries/e1', { assignmentId: 'a1' });
	await put(uid, 'entries/e2', { assignmentId: 'a2' });
	await put(uid, 'reports/a1_r1_2026-W48', { assignmentId: 'a1', status: 'draft' });
	await put(uid, 'changeLog/l1', { path: 'entries/e1' });
	await put(uid, 'state/timer', { assignmentId: 'a1' });
	await put(uid, 'state/settings', { flexWarning: 1200 });
	await put(uid, 'state/reminders', { handled: {} });
};

describe('emptyAccount', () => {
	it("deletes everything of the user's, the changeLog too, and can run again", async () => {
		await seed(ME);
		await seed(OTHER);
		expect(await emptyAccount(ME)).toBe(11);
		expect(await paths(ME)).toEqual([]);
		expect(await paths(OTHER)).toHaveLength(11);
		expect(await emptyAccount(ME)).toBe(0);
	});
});

describe('deleteAssignment', () => {
	it("deletes the assignment's own documents and logs it", async () => {
		await seed(ME);
		expect(await deleteAssignment(ME, 'a1')).toBe(6);
		const left = await paths(ME);
		expect(left.filter((p) => !p.startsWith('changeLog/'))).toEqual([
			'assignments/a2',
			'entries/e2',
			'state/reminders',
			'state/settings'
		]);
		const log = await db()
			.collection(`users/${ME}/changeLog`)
			.where('action', '==', 'delete')
			.get();
		expect(log.docs).toHaveLength(1);
		expect(log.docs[0]!.data()).toMatchObject({
			path: 'assignments/a1',
			before: { name: 'Uppdrag A' },
			after: null,
			by: 'app'
		});
		expect(log.docs[0]!.get('before')).not.toHaveProperty('schemaVersion');
		expect(left.filter((p) => p.startsWith('changeLog/'))).toHaveLength(2);
	});

	it('refuses an assignment with a sent week, and one that does not exist', async () => {
		await seed(ME);
		await put(ME, 'reports/a1_r1_2026-W47', { assignmentId: 'a1', status: 'sent' });
		await expect(deleteAssignment(ME, 'a1')).rejects.toThrow(RefusedDelete);
		await expect(deleteAssignment(ME, 'saknas')).rejects.toThrow(RefusedDelete);
		expect(await paths(ME)).toContain('assignments/a1/codes/c1');
	});
});
