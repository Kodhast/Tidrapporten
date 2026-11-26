// Emptying the account and deleting an assignment (issue 26): both go through functions
// (firebase-functions/src/radering.ts), since the rules let the app delete neither the change log
// nor a whole tree. They need the server, like the export.
import { FunctionsError, httpsCallable, type Functions } from 'firebase/functions';
import type { Id } from '../domain/types.ts';

/** Deletes everything below the user, the change log too; gives the number of documents. */
export const emptyAccount = async (functions: Functions): Promise<number> =>
	(await httpsCallable<void, { deleted: number }>(functions, 'tomKonto')()).data.deleted;

/**
 * Deletes the assignment with its codes, receivers, time and reports, and logs it. Gives the
 * function's reason when it refuses (a sent week, or an assignment that does not exist), else null.
 */
export async function deleteAssignment(
	functions: Functions,
	assignmentId: Id
): Promise<string | null> {
	try {
		await httpsCallable<{ assignmentId: Id }, { deleted: number }>(
			functions,
			'raderaUppdrag'
		)({ assignmentId });
		return null;
	} catch (error) {
		if (error instanceof FunctionsError && error.code === 'functions/failed-precondition')
			return error.message;
		throw error;
	}
}
