// Cloud Functions for Tidrapporten. They import the calculations from src/domain/ directly, and
// `npm run build:functions` bundles those into lib/ next to the npm packages listed in
// firebase-functions/package.json (decision 0014). Only the wiring to Google's clients lives here;
// the behaviour is in the files it imports, which run in Vitest.
import { CloudBillingClient } from '@google-cloud/billing';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
	absenceTypeCodec,
	assignmentCodec,
	deviceCodec,
	entryCodec,
	freeDayCodec,
	receiverCodec,
	reportCodec,
	settingsCodec,
	timerCodec,
	type Codec
} from '../../src/data/dokument.ts';
import { absenceCountings } from '../../src/domain/flex.ts';
import { freeDaysByDate } from '../../src/domain/helgdagar.ts';
import type { Receiver } from '../../src/domain/types.ts';
import { RefusedFile, restoreMissing, type RestoreEffects } from './aterstall.ts';
import { handleBudget, type BudgetEffects } from './budget.ts';
import { runReminders, sendTest, type ReminderEffects } from './paminnelser.ts';

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

const all = async <T>(path: string, codec: Codec<T>, parentId?: string): Promise<T[]> =>
	(await getFirestore().collection(path).get()).docs.map((d) =>
		codec.fromData(d.id, d.data(), parentId)
	);

/** Tokens Cloud Messaging answers that it no longer knows: the device is gone. */
const GONE = new Set([
	'messaging/registration-token-not-registered',
	'messaging/invalid-registration-token'
]);

const reminderEffects: ReminderEffects = {
	users: async () => {
		const devices = await getFirestore().collectionGroup('devices').select().get();
		return [
			...new Set(devices.docs.map((d) => d.ref.parent.parent?.id).filter((id) => id))
		] as string[];
	},
	settings: async (uid) =>
		settingsCodec.fromData('settings', (await userDoc(uid, 'state/settings').get()).data() ?? {}),
	handled: async (uid) => {
		const sent = (await userDoc(uid, 'state/reminders').get()).get('handled') as unknown;
		return typeof sent === 'object' && sent !== null ? (sent as Record<string, number>) : {};
	},
	saveHandled: async (uid, handled) => {
		await userDoc(uid, 'state/reminders').set({
			handled,
			schemaVersion: 1,
			updatedAt: FieldValue.serverTimestamp()
		});
	},
	load: async (uid, now) => {
		const base = `users/${uid}`;
		const [assignments, entries, reports, freeDays, absenceTypes, pauses, timer] =
			await Promise.all([
				all(`${base}/assignments`, assignmentCodec),
				all(`${base}/entries`, entryCodec),
				all(`${base}/reports`, reportCodec),
				all(`${base}/freeDays`, freeDayCodec),
				all(`${base}/absenceTypes`, absenceTypeCodec),
				getFirestore().collection(`${base}/pauses`).select().get(),
				userDoc(uid, 'state/timer').get()
			]);
		const receivers: Record<string, Receiver[]> = Object.fromEntries(
			await Promise.all(
				assignments.map(
					async (a) =>
						[a.id, await all(`${base}/assignments/${a.id}/receivers`, receiverCodec, a.id)] as const
				)
			)
		);
		return {
			assignments,
			receivers,
			entries,
			reports,
			freeDays: freeDaysByDate(freeDays),
			countings: absenceCountings(absenceTypes),
			timer: timer.exists ? timerCodec.fromData('timer', timer.data()!) : null,
			now,
			pauses: new Set(pauses.docs.map((d) => d.id))
		};
	},
	devices: (uid) => all(`users/${uid}/devices`, deviceCodec),
	send: async (tokens, notice) => {
		if (tokens.length === 0) return [];
		// A data message: the app's service worker draws it with its button (src/sw.ts). A reminder
		// that has waited an hour is no longer worth showing.
		const { responses } = await getMessaging().sendEach(
			tokens.map((token) => ({
				token,
				data: { title: notice.title, body: notice.body, url: notice.url, action: notice.action },
				webpush: { headers: { TTL: '3600', Urgency: 'high' } }
			}))
		);
		return tokens.filter((_, i) => {
			const code = responses[i]?.error?.code;
			return code !== undefined && GONE.has(code);
		});
	},
	removeDevices: async (uid, ids) => {
		const batch = getFirestore().batch();
		for (const id of ids) batch.delete(userDoc(uid, `devices/${id}`));
		await batch.commit();
	},
	info: (message, fields) => logger.info(message, fields),
	error: (message, fields) => logger.error(message, fields)
};

/**
 * The reminders (issue 22), every 15 minutes. Runs in drift (release.yml) as
 * tidrapporten-paminnelser: Cloud Datastore User and Firebase Cloud Messaging API Admin in drift,
 * nothing more (docs/drift.md).
 */
export const paminnelser = onSchedule(
	{
		schedule: 'every 15 minutes',
		timeZone: 'Europe/Stockholm',
		region: REGION,
		serviceAccount: 'tidrapporten-paminnelser@',
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
