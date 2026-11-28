// The reminder function's reach into Firestore and Cloud Messaging (issue 22), apart from
// index.ts so that the emulator test (test/emulator/paminnelser.emulator.ts) can run it against
// the Firestore emulator with Cloud Messaging stubbed. Documents are read with the app's codecs.
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions';
import {
	absenceTypeCodec,
	assignmentCodec,
	deviceCodec,
	employerCodec,
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
import type { ReminderEffects } from './paminnelser.ts';

const userDoc = (uid: string, path: string) => getFirestore().doc(`users/${uid}/${path}`);

const all = async <T>(path: string, codec: Codec<T>, parentId?: string): Promise<T[]> =>
	(await getFirestore().collection(path).get()).docs.map((d) =>
		codec.fromData(d.id, d.data(), parentId)
	);

/** Tokens Cloud Messaging answers that it no longer knows: the device is gone. */
const GONE = new Set([
	'messaging/registration-token-not-registered',
	'messaging/invalid-registration-token'
]);

export const reminderEffects: ReminderEffects = {
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
		const [assignments, entries, reports, freeDays, absenceTypes, pauses, timer, employers] =
			await Promise.all([
				all(`${base}/assignments`, assignmentCodec),
				all(`${base}/entries`, entryCodec),
				all(`${base}/reports`, reportCodec),
				all(`${base}/freeDays`, freeDayCodec),
				all(`${base}/absenceTypes`, absenceTypeCodec),
				getFirestore().collection(`${base}/pauses`).select().get(),
				userDoc(uid, 'state/timer').get(),
				all(`${base}/employers`, employerCodec)
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
			employers,
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
