// The restore from a JSON export (issue 57): the app reads the file and the function `aterstall`
// writes what is missing (firebase-functions/src/aterstall.ts). It needs the server, like the
// export.
import { httpsCallable, type Functions } from 'firebase/functions';
import type { ExportFile } from './exportformat.ts';

export interface RestoreResult {
	restored: number;
	existed: number;
}

export const restoreFile = async (functions: Functions, file: ExportFile): Promise<RestoreResult> =>
	(await httpsCallable<ExportFile, RestoreResult>(functions, 'aterstall')(file)).data;
