// Notifications on this device (issue 22): the permission, the Cloud Messaging token and the
// device's document. The token belongs to the app's own service worker (src/sw.ts), which draws
// the reminders, so Firebase's own messaging worker is never registered.
import type { FirebaseApp } from 'firebase/app';
import type { Firestore } from 'firebase/firestore';
import type { Functions } from 'firebase/functions';
import { httpsCallable } from 'firebase/functions';
import { deleteToken, getMessaging, getToken, isSupported } from 'firebase/messaging';
import { newId } from '../domain/installningar.ts';
import type { Id } from '../domain/types.ts';
import { removeDevice, saveDevice } from '../data/paminnelser.ts';

const DEVICE_KEY = 'tidrapporten.enhet';

/** This browser's device id, kept in the browser; null before notifications were turned on. */
export const deviceId = (): Id | null => {
	try {
		return localStorage.getItem(DEVICE_KEY);
	} catch {
		return null;
	}
};

/** A name for the device in the list: only Chrome is used (CLAUDE.md). */
export const deviceLabel = (userAgent: string): string =>
	/Android/i.test(userAgent) ? 'Chrome på Android' : 'Chrome på dator';

export type EnableResult = 'on' | 'denied' | 'unsupported';

export async function enableNotifications(
	app: FirebaseApp,
	db: Firestore,
	uid: Id,
	vapidKey: string
): Promise<EnableResult> {
	if (!('serviceWorker' in navigator) || !(await isSupported())) return 'unsupported';
	if ((await Notification.requestPermission()) !== 'granted') return 'denied';
	const token = await getToken(getMessaging(app), {
		vapidKey,
		serviceWorkerRegistration: await navigator.serviceWorker.ready
	});
	const id = deviceId() ?? newId();
	await saveDevice(db, uid, { id, fcmToken: token, label: deviceLabel(navigator.userAgent) });
	localStorage.setItem(DEVICE_KEY, id);
	return 'on';
}

export async function disableNotifications(
	app: FirebaseApp,
	db: Firestore,
	uid: Id
): Promise<void> {
	const id = deviceId();
	if (id) await removeDevice(db, uid, id);
	localStorage.removeItem(DEVICE_KEY);
	// The token is dropped too, so that a send that comes before the next run reaches nothing.
	if (await isSupported()) await deleteToken(getMessaging(app)).catch(() => {});
}

/** Asks the function for a test notification to the user's devices; how many it reached. */
export async function sendTestNotice(functions: Functions): Promise<number> {
	const result = await httpsCallable<void, { devices: number }>(functions, 'provnotis')();
	return result.data.devices;
}
