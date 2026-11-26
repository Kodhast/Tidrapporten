// Deleting (issue 26): emptying the whole account and deleting one assignment. Both run with the
// Admin SDK, since the rules let no client delete the changeLog or a sent report. The emulator test
// (test/emulator/radering.emulator.ts) runs them as they run deployed; index.ts adds the sign-in
// check and the log.
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

/** A deletion the function refuses; the message is shown to the user. */
export class RefusedDelete extends Error {}

/**
 * Deletes everything below users/{uid}, the changeLog included (decision 0020). The Firebase user
 * stays, so the app starts over as at first use and can be emptied again. Returns how many
 * documents went.
 */
export async function emptyAccount(uid: string): Promise<number> {
	const db = getFirestore();
	let deleted = 0;
	const writer = db.bulkWriter();
	const user = db.doc(`users/${uid}`);
	// The user document itself does not exist; its delete is not counted.
	writer.onWriteResult((ref) => {
		if (ref.path !== user.path) deleted += 1;
	});
	await db.recursiveDelete(user, writer);
	return deleted;
}

/**
 * Deletes an assignment with its codes, receivers, entries, reports and a timer on it. The
 * changeLog keeps it: an entry with the assignment as it was is written first, so that a deletion
 * that stops halfway is logged and can be run again. An assignment with a sent week is refused,
 * since a locked week changes only through a logged unlock (CLAUDE.md); it can be archived.
 */
export async function deleteAssignment(uid: string, assignmentId: string): Promise<number> {
	const db = getFirestore();
	const user = db.doc(`users/${uid}`);
	const assignment = user.collection('assignments').doc(assignmentId);
	const snapshot = await assignment.get();
	if (!snapshot.exists) throw new RefusedDelete('Uppdraget finns inte.');
	const [entries, reports, timer] = await Promise.all([
		user.collection('entries').where('assignmentId', '==', assignmentId).get(),
		user.collection('reports').where('assignmentId', '==', assignmentId).get(),
		user.collection('state').doc('timer').get()
	]);
	if (reports.docs.some((r) => r.get('status') !== 'draft'))
		throw new RefusedDelete('Uppdraget har skickade veckor. Arkivera det i stället.');
	const before = { ...snapshot.data() };
	for (const meta of ['schemaVersion', 'createdAt', 'updatedAt']) delete before[meta];
	const now = FieldValue.serverTimestamp();
	await user.collection('changeLog').add({
		at: now,
		path: `assignments/${assignmentId}`,
		action: 'delete',
		week: null,
		before,
		after: null,
		reason: '',
		by: 'app',
		schemaVersion: 1,
		createdAt: now,
		updatedAt: now
	});
	let deleted = 0;
	const writer = db.bulkWriter();
	writer.onWriteResult(() => {
		deleted += 1;
	});
	for (const doc of [...entries.docs, ...reports.docs]) void writer.delete(doc.ref);
	if (timer.get('assignmentId') === assignmentId) void writer.delete(timer.ref);
	await db.recursiveDelete(assignment, writer);
	return deleted;
}
