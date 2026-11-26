// The reminders (issue 22). Every 15 minutes the scheduled function in index.ts runs this for each
// user with a device: the reminders that are due (src/domain/paminnelser.ts) are marked handled
// first and then sent, so a send that fails is not repeated and none comes twice. One user's
// failure is logged and does not stop the others. Firestore and Cloud Messaging are injected
// (index.ts), so that this runs in Vitest. The log has the uid and the reminders' kinds, nothing
// of what they say.
import {
	dueChecks,
	flexSentKey,
	keepHandled,
	reminderNotice,
	type Notice,
	type ReminderData
} from '../../src/domain/paminnelser.ts';
import { dateOf, isoWeekOf } from '../../src/domain/tid.ts';
import type { Device, Settings, UtcMillis } from '../../src/domain/types.ts';

export interface ReminderEffects {
	/** The users with at least one device. */
	users(): Promise<string[]>;
	settings(uid: string): Promise<Settings>;
	/** The reminders already handled, by key, with when. */
	handled(uid: string): Promise<Record<string, UtcMillis>>;
	saveHandled(uid: string, handled: Record<string, UtcMillis>): Promise<void>;
	load(uid: string, now: UtcMillis): Promise<ReminderData>;
	devices(uid: string): Promise<Device[]>;
	/** Sends to each token; returns the tokens Cloud Messaging no longer knows. */
	send(tokens: readonly string[], notice: Notice): Promise<string[]>;
	removeDevices(uid: string, ids: readonly string[]): Promise<void>;
	info(message: string, fields: Record<string, unknown>): void;
	error(message: string, fields: Record<string, unknown>): void;
}

/** Sends a notice to all of a user's devices and forgets the devices whose token is gone. */
async function sendToDevices(uid: string, notices: readonly Notice[], effects: ReminderEffects) {
	const devices = await effects.devices(uid);
	const dead = new Set<string>();
	for (const notice of notices) {
		const gone = await effects.send(
			devices.map((d) => d.fcmToken),
			notice
		);
		for (const token of gone) dead.add(token);
	}
	const removed = devices.filter((d) => dead.has(d.fcmToken)).map((d) => d.id);
	if (removed.length > 0) await effects.removeDevices(uid, removed);
	return { devices: devices.length - removed.length, removed: removed.length };
}

export async function runReminders(now: UtcMillis, effects: ReminderEffects): Promise<number> {
	let sent = 0;
	for (const uid of await effects.users()) {
		try {
			const [settings, handled] = await Promise.all([effects.settings(uid), effects.handled(uid)]);
			const checks = dueChecks(now, settings, new Set(Object.keys(handled)));
			if (checks.length === 0) continue;
			const data = await effects.load(uid, now);
			const notices = checks
				.map((check) => reminderNotice(check, data, settings))
				.filter((notice): notice is Notice => notice !== null);
			const marks: Record<string, UtcMillis> = Object.fromEntries(checks.map((c) => [c.key, now]));
			if (notices.some((n) => n.kind === 'flex')) marks[flexSentKey(isoWeekOf(dateOf(now)))] = now;
			await effects.saveHandled(uid, keepHandled({ ...handled, ...marks }, now));
			if (notices.length === 0) continue;
			const result = await sendToDevices(uid, notices, effects);
			effects.info('paminnelser: skickade', {
				uid,
				kinds: notices.map((n) => n.kind),
				...result
			});
			sent += notices.length;
		} catch {
			effects.error('paminnelser: misslyckades', { uid });
		}
	}
	return sent;
}

/** The test notification from the reminder settings, to all of the user's devices. */
export const TEST_NOTICE: Notice = {
	kind: 'test',
	title: 'Provnotis',
	body: 'Så här kommer påminnelserna.',
	url: '/',
	action: 'Öppna'
};

export async function sendTest(uid: string, effects: ReminderEffects): Promise<number> {
	const { devices } = await sendToDevices(uid, [TEST_NOTICE], effects);
	effects.info('provnotis: skickad', { uid, devices });
	return devices;
}
