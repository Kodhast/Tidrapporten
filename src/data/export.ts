// Reads the JSON export (issue 21) from Firestore with the web SDK; the format is in
// exportformat.ts.
import {
	collection,
	doc,
	getDocFromServer,
	getDocsFromServer,
	type DocumentData,
	type Firestore
} from 'firebase/firestore';
import type { Id } from '../domain/types.ts';
import { ASSIGNMENT_COLLECTIONS, STATE_DOCUMENTS, USER_COLLECTIONS } from './exportformat.ts';

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
