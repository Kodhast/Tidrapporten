// Emptying the account and deleting an assignment (issue 26) or a part of one (issue 80): all go
// through functions (firebase-functions/src/radering.ts), since the rules let the app delete neither
// the change log nor a whole tree, nor see what else uses a part. They need the server.
import { FunctionsError, httpsCallable, type Functions } from 'firebase/functions';
import type { Id } from '../domain/types.ts';

/** Deletes everything below the user, the change log too; gives the number of documents. */
export const emptyAccount = async (functions: Functions): Promise<number> =>
	(await httpsCallable<void, { deleted: number }>(functions, 'tomKonto')()).data.deleted;

/**
 * Deletes the assignment with its codes, receivers, time and reports, and logs it. Gives the
 * function's reason when it refuses (a sent week, or an assignment that does not exist), else null.
 */
export const deleteAssignment = (functions: Functions, assignmentId: Id): Promise<string | null> =>
	refusal(() => httpsCallable(functions, 'raderaUppdrag')({ assignmentId }));

/** What `deletePart` deletes (issue 80); a code or receiver is named with its assignment. */
export type Part =
	| { kind: 'employer' | 'customer' | 'absenceType'; id: Id }
	| { kind: 'code' | 'receiver'; id: Id; assignmentId: Id };

/**
 * Deletes an employer, customer, absence type, time code or receiver that nothing uses, and logs
 * it. Gives the function's reason when it refuses (the part is in use), else null.
 */
export const deletePart = (functions: Functions, part: Part): Promise<string | null> =>
	refusal(() => httpsCallable(functions, 'raderaDel')(part));

/** Null when the call went through, the reason when the function refused; other errors throw. */
async function refusal(call: () => Promise<unknown>): Promise<string | null> {
	try {
		await call();
		return null;
	} catch (error) {
		if (error instanceof FunctionsError && error.code === 'functions/failed-precondition')
			return error.message;
		throw error;
	}
}
