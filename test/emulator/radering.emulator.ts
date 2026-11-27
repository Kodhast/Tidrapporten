// Emptying and deleting (issue 26) against the emulator: emptying takes everything below the
// user, the changeLog included, and nothing of anyone else; deleting an assignment takes what is
// its own, keeps the changeLog with a new entry, and refuses an assignment with a sent week.
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
	deleteAssignment,
	deletePart,
	emptyAccount,
	readPart,
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

	it('refuses an assignment with a sent or unlocked week, and one that does not exist', async () => {
		await seed(ME);
		await put(ME, 'reports/a1_r1_2026-W47', { assignmentId: 'a1', status: 'sent' });
		await expect(deleteAssignment(ME, 'a1')).rejects.toThrow(RefusedDelete);
		await put(ME, 'reports/a1_r1_2026-W47', { assignmentId: 'a1', status: 'unlocked' });
		await expect(deleteAssignment(ME, 'a1')).rejects.toThrow(RefusedDelete);
		await expect(deleteAssignment(ME, 'saknas')).rejects.toThrow(RefusedDelete);
		expect(await paths(ME)).toContain('assignments/a1/codes/c1');
	});
});

describe('deletePart (issue 80)', () => {
	const doc = async (path: string) => (await db().doc(`users/${ME}/${path}`).get()).data();
	const deletions = async () =>
		(await db().collection(`users/${ME}/changeLog`).where('action', '==', 'delete').get()).docs.map(
			(d) => d.data()
		);

	const parts = async () => {
		await put(ME, 'employers/g1', { name: 'Arbetsgivare A' });
		await put(ME, 'employers/g2', { name: 'Arbetsgivare B' });
		await put(ME, 'customers/k1', { name: 'Kund A' });
		await put(ME, 'absenceTypes/semester', { name: 'Semester' });
		await put(ME, 'absenceTypes/egen', { name: 'Egen frånvaro' });
		await put(ME, 'assignments/a1', {
			name: 'Uppdrag A',
			employerId: 'g1',
			customerId: null,
			standardDay: [{ start: '08:00', end: '12:00', codeId: 'c3' }]
		});
		await put(ME, 'assignments/a1/codes/c1', { name: 'Utveckling' });
		await put(ME, 'assignments/a1/codes/c2', { name: 'Oanvänd' });
		await put(ME, 'assignments/a1/codes/c3', { name: 'I standarddagen' });
		await put(ME, 'assignments/a1/receivers/r1', {
			name: 'Arbetsgivare B',
			position: 1,
			mapping: { c1: 'x1', c2: 'x2', egen: 'x3' },
			party: { kind: 'employer', id: 'g2' }
		});
		await put(ME, 'assignments/a1/receivers/r2', {
			name: 'Kund A',
			position: 2,
			mapping: { c2: 'y2' },
			party: { kind: 'customer', id: 'k1' }
		});
		await put(ME, 'entries/e1', {
			assignmentId: 'a1',
			subject: { kind: 'code', codeId: 'c1' }
		});
		await put(ME, 'entries/e2', {
			assignmentId: 'a1',
			subject: { kind: 'absence', absenceTypeId: 'semester' }
		});
	};

	it('reads only the parts a call may name', () => {
		expect(readPart({ kind: 'customer', id: 'k1' })).toEqual({ kind: 'customer', id: 'k1' });
		expect(readPart({ kind: 'code', id: 'c1', assignmentId: 'a1' })).toEqual({
			kind: 'code',
			id: 'c1',
			assignmentId: 'a1'
		});
		expect(readPart({ kind: 'code', id: 'c1' })).toBeNull();
		expect(readPart({ kind: 'customer', id: '../x' })).toBeNull();
		expect(readPart({ kind: 'assignment', id: 'a1' })).toBeNull();
		expect(readPart(null)).toBeNull();
	});

	it('deletes an unused code, takes it out of the mappings and logs it', async () => {
		await parts();
		expect(await deletePart(ME, { kind: 'code', id: 'c2', assignmentId: 'a1' })).toBe(1);
		expect(await doc('assignments/a1/codes/c2')).toBeUndefined();
		expect((await doc('assignments/a1/receivers/r1'))!.mapping).toEqual({ c1: 'x1', egen: 'x3' });
		expect((await doc('assignments/a1/receivers/r2'))!.mapping).toEqual({});
		expect(await deletions()).toMatchObject([
			{ path: 'assignments/a1/codes/c2', before: { name: 'Oanvänd' }, after: null, by: 'app' }
		]);
	});

	it('refuses a code with time, in the standard day or on the timer', async () => {
		await parts();
		await expect(deletePart(ME, { kind: 'code', id: 'c1', assignmentId: 'a1' })).rejects.toThrow(
			'Tidkoden används. Arkivera i stället.'
		);
		await expect(deletePart(ME, { kind: 'code', id: 'c3', assignmentId: 'a1' })).rejects.toThrow(
			RefusedDelete
		);
		await put(ME, 'state/timer', { assignmentId: 'a1', subject: { kind: 'code', codeId: 'c2' } });
		await expect(deletePart(ME, { kind: 'code', id: 'c2', assignmentId: 'a1' })).rejects.toThrow(
			RefusedDelete
		);
		expect(await doc('assignments/a1/codes/c1')).toBeDefined();
		expect(await deletions()).toEqual([]);
	});

	it('deletes an unused absence type from every mapping, and refuses one with time', async () => {
		await parts();
		await expect(deletePart(ME, { kind: 'absenceType', id: 'semester' })).rejects.toThrow(
			'Frånvarotypen används. Arkivera i stället.'
		);
		expect(await deletePart(ME, { kind: 'absenceType', id: 'egen' })).toBe(1);
		expect((await doc('assignments/a1/receivers/r1'))!.mapping).toEqual({ c1: 'x1', c2: 'x2' });
	});

	it('refuses an employer or customer with an assignment, and clears the party of an unused one', async () => {
		await parts();
		await expect(deletePart(ME, { kind: 'employer', id: 'g1' })).rejects.toThrow(
			'Arbetsgivaren har uppdrag. Arkivera i stället.'
		);
		expect(await deletePart(ME, { kind: 'employer', id: 'g2' })).toBe(1);
		const r1 = (await doc('assignments/a1/receivers/r1'))!;
		expect(r1.party).toBeNull();
		expect(r1.name).toBe('Arbetsgivare B');
		expect(await deletePart(ME, { kind: 'customer', id: 'k1' })).toBe(1);
		expect((await doc('assignments/a1/receivers/r2'))!.party).toBeNull();
		await put(ME, 'assignments/a1', { name: 'Uppdrag A', employerId: 'g1', customerId: 'k9' });
		await put(ME, 'customers/k9', { name: 'Kund B' });
		await expect(deletePart(ME, { kind: 'customer', id: 'k9' })).rejects.toThrow(
			'Kunden har uppdrag. Arkivera i stället.'
		);
	});

	it('deletes a receiver with its drafts, and refuses one with a sent or unlocked week', async () => {
		await parts();
		await put(ME, 'reports/a1_r2_2026-W48', {
			assignmentId: 'a1',
			receiverId: 'r2',
			status: 'draft'
		});
		await put(ME, 'reports/a1_r1_2026-W47', {
			assignmentId: 'a1',
			receiverId: 'r1',
			status: 'sent'
		});
		await expect(
			deletePart(ME, { kind: 'receiver', id: 'r1', assignmentId: 'a1' })
		).rejects.toThrow('Mottagaren har skickade veckor. Arkivera i stället.');
		await put(ME, 'reports/a1_r1_2026-W47', {
			assignmentId: 'a1',
			receiverId: 'r1',
			status: 'unlocked'
		});
		await expect(
			deletePart(ME, { kind: 'receiver', id: 'r1', assignmentId: 'a1' })
		).rejects.toThrow(RefusedDelete);
		expect(await deletePart(ME, { kind: 'receiver', id: 'r2', assignmentId: 'a1' })).toBe(2);
		expect(await doc('reports/a1_r2_2026-W48')).toBeUndefined();
		expect(await doc('reports/a1_r1_2026-W47')).toBeDefined();
		expect(await deletions()).toMatchObject([{ path: 'assignments/a1/receivers/r2' }]);
	});

	it('says in the log where the flex goes when the first receiver is deleted', async () => {
		await parts();
		expect(await deletePart(ME, { kind: 'receiver', id: 'r2', assignmentId: 'a1' })).toBe(1);
		expect(await deletePart(ME, { kind: 'receiver', id: 'r1', assignmentId: 'a1' })).toBe(1);
		await parts();
		expect(await deletePart(ME, { kind: 'receiver', id: 'r1', assignmentId: 'a1' })).toBe(1);
		expect((await deletions()).map((d) => [d.path, d.reason])).toEqual(
			expect.arrayContaining([
				['assignments/a1/receivers/r2', ''],
				['assignments/a1/receivers/r1', ''],
				['assignments/a1/receivers/r1', 'Första mottagaren raderad: flexen räknas nu mot Kund A.']
			])
		);
	});

	it('refuses what does not exist, and touches no one else', async () => {
		await parts();
		await expect(deletePart(ME, { kind: 'customer', id: 'saknas' })).rejects.toThrow(
			'Kunden finns inte.'
		);
		await put(OTHER, 'customers/k1', { name: 'Kund A' });
		await deletePart(ME, { kind: 'customer', id: 'k1' });
		expect((await db().doc(`users/${OTHER}/customers/k1`).get()).exists).toBe(true);
	});
});
