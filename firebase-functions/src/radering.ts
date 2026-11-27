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
	// Not in one transaction with the deletion: a week sent from another device in the moment
	// between is deleted too. Accepted for one owner; a transaction would cap the size.
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

/** What `deletePart` deletes: a code or receiver lives below its assignment. */
export type Part =
	| { kind: 'employer' | 'customer' | 'absenceType'; id: string }
	| { kind: 'code' | 'receiver'; id: string; assignmentId: string };

const PART_NAMES: Record<Part['kind'], string> = {
	employer: 'Arbetsgivaren',
	customer: 'Kunden',
	absenceType: 'Frånvarotypen',
	code: 'Tidkoden',
	receiver: 'Mottagaren'
};

/** The part's document below the user. */
export const partPath = (part: Part): string => {
	switch (part.kind) {
		case 'employer':
			return `employers/${part.id}`;
		case 'customer':
			return `customers/${part.id}`;
		case 'absenceType':
			return `absenceTypes/${part.id}`;
		case 'code':
			return `assignments/${part.assignmentId}/codes/${part.id}`;
		case 'receiver':
			return `assignments/${part.assignmentId}/receivers/${part.id}`;
	}
};

/**
 * Deletes an employer, a customer, an absence type, a time code or a receiver (issue 80) when
 * nothing uses it, and refuses with the reason otherwise: what is in use is archived instead, so
 * that no time loses its code and no locked week changes. What only pointed at the part goes in the
 * same batch: the receivers' mapping of a code or absence type, the `party` of receivers made from
 * an employer or customer (their names stay, ADR 0019), and a receiver's draft reports. A log
 * entry with the part as it was goes with it, so the deletion is in the changeLog (ADR 0016); a
 * deleted first receiver moves the flex to the next, and the entry's reason says so. Everything is
 * read in one transaction, so a timer or time started meanwhile on another device stops it. Gives the number of documents deleted.
 */
export async function deletePart(uid: string, part: Part): Promise<number> {
	const db = getFirestore();
	const user = db.doc(`users/${uid}`);
	const path = partPath(part);
	const ref = user.collection(path.slice(0, path.lastIndexOf('/'))).doc(part.id);
	return db.runTransaction(async (tx) => {
		const snapshot = await tx.get(ref);
		const name = PART_NAMES[part.kind];
		if (!snapshot.exists) throw new RefusedDelete(`${name} finns inte.`);
		const archive = `${name} används. Arkivera i stället.`;

		const now = FieldValue.serverTimestamp();
		const deletes: FirebaseFirestore.DocumentReference[] = [ref];
		const assignments = await tx.get(user.collection('assignments'));
		// Receivers of the assignments `part` can be mapped in or made from.
		const receiversOf = async (assignmentIds: string[]) =>
			(
				await Promise.all(
					assignmentIds.map((id) => tx.get(user.collection(`assignments/${id}/receivers`)))
				)
			).flatMap((q) => q.docs);
		const timer = await tx.get(user.collection('state').doc('timer'));
		// Writes after every read, as a transaction wants them.
		const writes: ((tx: FirebaseFirestore.Transaction) => void)[] = [];
		let reason = '';

		switch (part.kind) {
			case 'employer':
			case 'customer': {
				const field = part.kind === 'employer' ? 'employerId' : 'customerId';
				if (assignments.docs.some((a) => a.get(field) === part.id))
					throw new RefusedDelete(`${name} har uppdrag. Arkivera i stället.`);
				for (const r of await receiversOf(assignments.docs.map((a) => a.id))) {
					const party = r.get('party') as { kind?: string; id?: string } | null | undefined;
					if (party?.kind === part.kind && party.id === part.id)
						writes.push((w) => w.update(r.ref, { party: null, updatedAt: now }));
				}
				break;
			}
			case 'code':
			case 'absenceType': {
				const key = part.kind === 'code' ? 'codeId' : 'absenceTypeId';
				const used = await tx.get(
					user.collection('entries').where(`subject.${key}`, '==', part.id).limit(1)
				);
				const onTimer = timer.get(`subject.${key}`) === part.id;
				const inStandardDay =
					part.kind === 'code' &&
					assignments.docs
						.find((a) => a.id === part.assignmentId)
						?.get('standardDay')
						?.some((slot: { codeId?: string }) => slot.codeId === part.id);
				if (!used.empty || onTimer || inStandardDay) throw new RefusedDelete(archive);
				const scope =
					part.kind === 'code' ? [part.assignmentId] : assignments.docs.map((a) => a.id);
				for (const r of await receiversOf(scope)) {
					const mapping = (r.get('mapping') ?? {}) as Record<string, string>;
					if (part.id in mapping)
						writes.push((w) =>
							w.update(r.ref, { [`mapping.${part.id}`]: FieldValue.delete(), updatedAt: now })
						);
				}
				break;
			}
			case 'receiver': {
				const reports = await tx.get(user.collection('reports').where('receiverId', '==', part.id));
				const own = reports.docs.filter((r) => r.get('assignmentId') === part.assignmentId);
				if (own.some((r) => r.get('status') !== 'draft'))
					throw new RefusedDelete('Mottagaren har skickade veckor. Arkivera i stället.');
				deletes.push(...own.map((r) => r.ref));
				// The first receiver's reports count for flex (flex.ts firstReceiver): say where it goes.
				const all = await receiversOf([part.assignmentId]);
				const position = (d: FirebaseFirestore.DocumentSnapshot) => Number(d.get('position'));
				const first = all.reduce<FirebaseFirestore.DocumentSnapshot | undefined>(
					(a, r) => (!a || position(r) < position(a) ? r : a),
					undefined
				);
				const next = all
					.filter((r) => r.id !== part.id)
					.reduce<FirebaseFirestore.DocumentSnapshot | undefined>(
						(a, r) => (!a || position(r) < position(a) ? r : a),
						undefined
					);
				if (first?.id === part.id && next)
					reason = `Första mottagaren raderad: flexen räknas nu mot ${String(next.get('name'))}.`;
				break;
			}
		}

		const before = { ...snapshot.data() };
		for (const meta of ['schemaVersion', 'createdAt', 'updatedAt']) delete before[meta];
		for (const write of writes) write(tx);
		tx.set(user.collection('changeLog').doc(), {
			at: now,
			path,
			action: 'delete',
			week: null,
			before,
			after: null,
			reason,
			by: 'app',
			schemaVersion: 1,
			createdAt: now,
			updatedAt: now
		});
		for (const d of deletes) tx.delete(d);
		return deletes.length;
	});
}

const ID = /^[A-Za-z0-9_-]{1,100}$/;

/** The part a call names, or null when it names none: ids as the rules allow them. */
export function readPart(data: unknown): Part | null {
	const { kind, id, assignmentId } = (data ?? {}) as Record<string, unknown>;
	if (typeof id !== 'string' || !ID.test(id)) return null;
	if (kind === 'employer' || kind === 'customer' || kind === 'absenceType') return { kind, id };
	if ((kind === 'code' || kind === 'receiver') && typeof assignmentId === 'string')
		return ID.test(assignmentId) ? { kind, id, assignmentId } : null;
	return null;
}
