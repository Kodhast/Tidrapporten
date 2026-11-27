// Cloud Functions for Tidrapporten. They import the calculations from src/domain/ directly, and
// `npm run build:functions` bundles those into lib/ next to the npm packages listed in
// firebase-functions/package.json (decision 0014). Only the wiring to Google's clients lives here;
// the behaviour is in the files it imports, which run in Vitest.
import { CloudBillingClient } from '@google-cloud/billing';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { RefusedFile, restoreMissing, type RestoreEffects } from './aterstall.ts';
import { handleBudget, type BudgetEffects } from './budget.ts';
import { reminderEffects } from './paminnelser-effekter.ts';
import { runReminders, sendTest } from './paminnelser.ts';
import { deleteAssignment, deletePart, emptyAccount, readPart, RefusedDelete } from './radering.ts';

initializeApp();

const REGION = 'europe-west1';

let billing: CloudBillingClient | undefined;
const billingClient = () => (billing ??= new CloudBillingClient());

const budgetEffects: BudgetEffects = {
	ownProject: process.env.GCLOUD_PROJECT ?? '',
	writeStatus: async (status) => {
		await getFirestore()
			.doc('system/budget')
			.set({ ...status, schemaVersion: 1, updatedAt: FieldValue.serverTimestamp() });
	},
	billingEnabled: async (projectId) => {
		const [info] = await billingClient().getProjectBillingInfo({ name: `projects/${projectId}` });
		return info.billingEnabled === true;
	},
	disableBilling: async (projectId) => {
		// An empty billing account unlinks it, which turns billing off (Cloud Billing API).
		await billingClient().updateProjectBillingInfo({
			name: `projects/${projectId}`,
			projectBillingInfo: { billingAccountName: '' }
		});
	},
	info: (message, fields) => logger.info(message, fields),
	error: (message, fields) => logger.error(message, fields)
};

/**
 * Runs in the drift project only (release.yml), as tidrapporten-budget: Cloud Datastore User in
 * drift and Project Billing Manager in test, nothing more (docs/drift.md).
 */
export const budget = onMessagePublished(
	{
		topic: 'budget',
		region: REGION,
		// The account exists only in drift, so a deploy anywhere else fails.
		serviceAccount: 'tidrapporten-budget@',
		retry: false,
		maxInstances: 1
	},
	async (event) => {
		let json: unknown = null;
		try {
			json = event.data.message.json;
		} catch {
			// Not JSON: handleBudget logs it as an unknown message.
		}
		await handleBudget(json, budgetEffects);
	}
);

const userDoc = (uid: string, path: string) => getFirestore().doc(`users/${uid}/${path}`);

const restoreEffects: RestoreEffects = {
	makeTime: (seconds, nanoseconds) => new Timestamp(Math.floor(seconds), nanoseconds),
	existing: async (uid, paths) => {
		const snapshots = await getFirestore().getAll(...paths.map((p) => userDoc(uid, p)));
		return new Set(paths.filter((_, i) => snapshots[i]!.exists));
	},
	create: async (uid, documents, logEntry) => {
		const db = getFirestore();
		const batch = db.batch();
		for (const { path, data } of documents) batch.create(userDoc(uid, path), data);
		const now = FieldValue.serverTimestamp();
		batch.create(db.collection(`users/${uid}/changeLog`).doc(), {
			...logEntry,
			at: now,
			schemaVersion: 1,
			createdAt: now,
			updatedAt: now
		});
		await batch.commit();
	},
	info: (message, fields) => logger.info(message, fields)
};

/**
 * Restores a JSON export for the signed-in user (issue 57): writes the documents that are
 * missing, never over one that exists. Runs in drift (release.yml) and in the emulators, as
 * tidrapporten-aterstall: Cloud Datastore User in drift, nothing more (docs/drift.md).
 */
export const aterstall = onCall(
	{ region: REGION, maxInstances: 1, serviceAccount: 'tidrapporten-aterstall@' },
	async (request) => {
		const uid = request.auth?.uid;
		if (!uid) throw new HttpsError('unauthenticated', 'Logga in först.');
		try {
			return await restoreMissing(uid, request.data, restoreEffects);
		} catch (error) {
			if (error instanceof RefusedFile) throw new HttpsError('invalid-argument', error.message);
			logger.error('aterstall: misslyckades', { uid });
			throw new HttpsError('internal', 'Återställningen misslyckades.');
		}
	}
);

/**
 * The reminders (issue 22), every 15 minutes. Runs in drift (release.yml) as
 * tidrapporten-paminnelser: Cloud Datastore User and Firebase Cloud Messaging API Admin in drift,
 * nothing more (docs/drift.md). The address is written out in full: the Firebase CLI expands the
 * short form 'name@' for the function but not for the Cloud Scheduler job, which then refuses it
 * (HTTP 400 at the release of 1.5.2). The CLI sets GCLOUD_PROJECT when it reads the functions.
 */
export const paminnelser = onSchedule(
	{
		schedule: 'every 15 minutes',
		timeZone: 'Europe/Stockholm',
		region: REGION,
		serviceAccount: `tidrapporten-paminnelser@${process.env.GCLOUD_PROJECT}.iam.gserviceaccount.com`,
		maxInstances: 1,
		retryCount: 0
	},
	async (event) => {
		await runReminders(Date.parse(event.scheduleTime) || Date.now(), reminderEffects);
	}
);

/** The test notification from the reminder settings, to the signed-in user's devices. */
export const provnotis = onCall(
	{ region: REGION, maxInstances: 1, serviceAccount: 'tidrapporten-paminnelser@' },
	async (request) => {
		const uid = request.auth?.uid;
		if (!uid) throw new HttpsError('unauthenticated', 'Logga in först.');
		try {
			return { devices: await sendTest(uid, reminderEffects) };
		} catch {
			logger.error('provnotis: misslyckades', { uid });
			throw new HttpsError('internal', 'Provnotisen gick inte att skicka.');
		}
	}
);

/**
 * Empties the signed-in user's account (issue 26, decision 0020): everything below the user, the
 * changeLog included. The app downloads the export first. Runs in drift (release.yml) as
 * tidrapporten-radering: Cloud Datastore User in drift, nothing more (docs/drift.md).
 */
export const tomKonto = onCall(
	{ region: REGION, maxInstances: 1, serviceAccount: 'tidrapporten-radering@' },
	async (request) => {
		const uid = request.auth?.uid;
		if (!uid) throw new HttpsError('unauthenticated', 'Logga in först.');
		try {
			const count = await emptyAccount(uid);
			logger.info('tomning', { uid, dokument: count });
			return { deleted: count };
		} catch {
			logger.error('tomning: misslyckades', { uid });
			throw new HttpsError(
				'internal',
				'Tömningen gick inte. Försök igen; det som finns kvar töms då.'
			);
		}
	}
);

/** Deletes one of the signed-in user's assignments (issue 26); the changeLog keeps it. */
export const raderaUppdrag = onCall(
	{ region: REGION, maxInstances: 1, serviceAccount: 'tidrapporten-radering@' },
	async (request) => {
		const uid = request.auth?.uid;
		if (!uid) throw new HttpsError('unauthenticated', 'Logga in först.');
		const id: unknown = (request.data as { assignmentId?: unknown } | null)?.assignmentId;
		if (typeof id !== 'string' || id === '' || id.includes('/'))
			throw new HttpsError('invalid-argument', 'Uppdraget finns inte.');
		try {
			const count = await deleteAssignment(uid, id);
			logger.info('raderaUppdrag', { uid, assignmentId: id, dokument: count });
			return { deleted: count };
		} catch (error) {
			if (error instanceof RefusedDelete)
				throw new HttpsError('failed-precondition', error.message, { reason: error.message });
			logger.error('raderaUppdrag: misslyckades', { uid, assignmentId: id });
			throw new HttpsError('internal', 'Uppdraget gick inte att radera.');
		}
	}
);

/**
 * Deletes an employer, customer, absence type, time code or receiver of the signed-in user when
 * nothing uses it (issue 80); otherwise the reason, and the app offers to archive it.
 */
export const raderaDel = onCall(
	{ region: REGION, maxInstances: 1, serviceAccount: 'tidrapporten-radering@' },
	async (request) => {
		const uid = request.auth?.uid;
		if (!uid) throw new HttpsError('unauthenticated', 'Logga in först.');
		const part = readPart(request.data);
		if (!part) throw new HttpsError('invalid-argument', 'Det finns inget sådant att radera.');
		try {
			const count = await deletePart(uid, part);
			logger.info('raderaDel', { uid, kind: part.kind, id: part.id, dokument: count });
			return { deleted: count };
		} catch (error) {
			if (error instanceof RefusedDelete)
				throw new HttpsError('failed-precondition', error.message, { reason: error.message });
			logger.error('raderaDel: misslyckades', { uid, kind: part.kind, id: part.id });
			throw new HttpsError('internal', 'Det gick inte att radera.');
		}
	}
);
