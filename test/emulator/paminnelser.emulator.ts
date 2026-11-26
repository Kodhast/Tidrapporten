// The reminder function's Firestore side (issue 22) against the emulator: it finds the users with
// a device, reads their data with the app's codecs, remembers what it handled and forgets a device
// whose token is gone. Cloud Messaging has no emulator, so the send is stubbed.
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { reminderEffects } from '../../firebase-functions/src/paminnelser-effekter.ts';
import { runReminders, type ReminderEffects } from '../../firebase-functions/src/paminnelser.ts';
import { assignmentCodec, receiverCodec } from '../../src/data/dokument.ts';
import { assignment, at, receiver } from '../../src/domain/testdata.ts';
import { EMULATOR_HOST, EMULATOR_PORTS, EMULATOR_PROJECT_ID } from '../../src/firebase/config.ts';

const UID = 'testperson-1';
let app: App;

beforeAll(() => {
	process.env.FIRESTORE_EMULATOR_HOST ??= `${EMULATOR_HOST}:${EMULATOR_PORTS.firestore}`;
	// The effects use the default app, as in the deployed function.
	app = initializeApp({ projectId: EMULATOR_PROJECT_ID });
});

afterAll(() => deleteApp(app));

const db = () => getFirestore();

beforeEach(async () => {
	await db().recursiveDelete(db().collection('users'));
});

const put = (path: string, data: object) => db().doc(`users/${UID}/${path}`).set(data);

describe('the reminder function against Firestore', () => {
	it('reads the data, sends the due reminder once and forgets a gone device', async () => {
		await put('assignments/a1', assignmentCodec.toData(assignment()));
		await put('assignments/a1/receivers/r1', receiverCodec.toData(receiver()));
		await put('devices/d1', { fcmToken: 'token-1', label: 'Chrome på Android' });
		await put('devices/d2', { fcmToken: 'gone-2', label: 'Chrome på dator' });
		await put('state/timer', {
			assignmentId: 'a1',
			subject: { kind: 'code', codeId: 'c1' },
			start: Timestamp.fromMillis(at('2026-11-26', '08:12'))
		});
		const send = vi.fn<ReminderEffects['send']>(async (tokens) =>
			tokens.filter((t) => t.startsWith('gone'))
		);
		const effects = { ...reminderEffects, send, info: vi.fn(), error: vi.fn() };
		const now = at('2026-11-26', '19:05');
		expect(await runReminders(now, effects)).toBe(1);
		expect(effects.error).not.toHaveBeenCalled();
		expect(send).toHaveBeenCalledOnce();
		expect(send.mock.calls[0]![1]).toMatchObject({
			title: 'Timern går fortfarande',
			body: 'Startad 08:12.'
		});
		expect((await db().doc(`users/${UID}/devices/d2`).get()).exists).toBe(false);
		expect((await db().doc(`users/${UID}/state/reminders`).get()).get('handled')).toEqual({
			'timerRunning_2026-11-26': now
		});
		expect(await runReminders(at('2026-11-26', '19:20'), effects)).toBe(0);
	});
});
