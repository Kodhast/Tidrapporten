// The reminder function (issue 22) with made-up users in memory: what is due is marked before it
// is sent, nothing comes twice, dead tokens are forgotten and one user's error stops nobody else.
import { describe, expect, it, vi } from 'vitest';
import {
	runReminders,
	sendTest,
	TEST_NOTICE,
	type ReminderEffects
} from '../firebase-functions/src/paminnelser.ts';
import { absenceCountings } from '../src/domain/flex.ts';
import { freeDaysByDate } from '../src/domain/helgdagar.ts';
import type { Notice, ReminderData } from '../src/domain/paminnelser.ts';
import { absenceTypes, assignment, at, receiver } from '../src/domain/testdata.ts';
import type { Device, Settings } from '../src/domain/types.ts';

const settings: Settings = {
	noTimerBy: '09:30',
	timerRunningAt: '19:00',
	remindEmptyDay: false,
	reportReminderFridayAt: '15:00',
	flexWarning: 0
};

const world = (devices: Record<string, Device[]>) => {
	const handled: Record<string, Record<string, number>> = {};
	const sends: Array<{ tokens: readonly string[]; notice: Notice; order: number }> = [];
	const saves: number[] = [];
	let step = 0;
	const effects: ReminderEffects = {
		users: async () => Object.keys(devices),
		settings: async () => settings,
		handled: async (uid) => handled[uid] ?? {},
		saveHandled: async (uid, value) => {
			handled[uid] = value;
			saves.push(++step);
		},
		load: async (_uid, now): Promise<ReminderData> => ({
			assignments: [assignment()],
			receivers: { a1: [receiver()] },
			entries: [],
			reports: [],
			freeDays: freeDaysByDate([]),
			countings: absenceCountings(absenceTypes),
			timer: null,
			now,
			pauses: new Set()
		}),
		devices: async (uid) => devices[uid] ?? [],
		send: async (tokens, notice) => {
			sends.push({ tokens, notice, order: ++step });
			return tokens.filter((t) => t.startsWith('dead'));
		},
		removeDevices: async (uid, ids) => {
			devices[uid] = (devices[uid] ?? []).filter((d) => !ids.includes(d.id));
		},
		info: vi.fn(),
		error: vi.fn()
	};
	return { effects, handled, sends, saves, devices };
};

const phone = (id: string, fcmToken: string): Device => ({ id, fcmToken, label: 'Telefon' });

describe('runReminders', () => {
	it('marks the reminder handled before it sends it, and sends it once', async () => {
		const w = world({ u1: [phone('d1', 'token-1'), phone('d2', 'token-2')] });
		const now = at('2026-11-26', '09:31');
		expect(await runReminders(now, w.effects)).toBe(1);
		expect(w.sends).toHaveLength(1);
		expect(w.sends[0]!.tokens).toEqual(['token-1', 'token-2']);
		expect(w.sends[0]!.notice.title).toBe('Ingen timer igång');
		expect(w.saves[0]).toBeLessThan(w.sends[0]!.order);
		expect(w.handled.u1).toEqual({ 'noTimer_2026-11-26': now });
		expect(await runReminders(at('2026-11-26', '09:46'), w.effects)).toBe(0);
		expect(w.sends).toHaveLength(1);
		expect(w.effects.info).toHaveBeenCalledWith('paminnelser: skickade', {
			uid: 'u1',
			kinds: ['noTimer'],
			devices: 2,
			removed: 0
		});
	});

	it('reads no data when nothing is due', async () => {
		const w = world({ u1: [phone('d1', 'token-1')] });
		const load = vi.spyOn(w.effects, 'load');
		expect(await runReminders(at('2026-11-26', '12:00'), w.effects)).toBe(0);
		expect(load).not.toHaveBeenCalled();
	});

	it('marks a reminder with nothing to say handled without sending', async () => {
		const w = world({ u1: [phone('d1', 'token-1')] });
		// A Saturday: no workday, so "no timer" is handled and says nothing.
		expect(await runReminders(at('2026-11-28', '09:31'), w.effects)).toBe(0);
		expect(w.sends).toEqual([]);
		expect(Object.keys(w.handled.u1!)).toEqual(['noTimer_2026-11-28']);
	});

	it('forgets devices whose token is gone', async () => {
		const w = world({ u1: [phone('d1', 'token-1'), phone('d2', 'dead-2')] });
		await runReminders(at('2026-11-26', '09:31'), w.effects);
		expect(w.devices.u1!.map((d) => d.id)).toEqual(['d1']);
	});

	it('logs a user that fails, with the uid only, and goes on with the next', async () => {
		const w = world({ u1: [phone('d1', 'token-1')], u2: [phone('d2', 'token-2')] });
		const load = w.effects.load;
		w.effects.load = async (uid, now) => {
			if (uid === 'u1') throw new Error('Firestore svarar inte');
			return load(uid, now);
		};
		expect(await runReminders(at('2026-11-26', '09:31'), w.effects)).toBe(1);
		expect(w.effects.error).toHaveBeenCalledWith('paminnelser: misslyckades', { uid: 'u1' });
		expect(w.sends[0]!.tokens).toEqual(['token-2']);
	});

	it('marks the week of a flex reminder, so it comes once a week', async () => {
		const w = world({ u1: [phone('d1', 'token-1')] });
		const effects = {
			...w.effects,
			settings: async () => ({ ...settings, noTimerBy: null, flexWarning: 60 }),
			load: async (uid: string, now: number) => ({
				...(await w.effects.load(uid, now)),
				assignments: [assignment({ startDate: '2026-11-26', openingFlex: 600 })]
			})
		};
		await runReminders(at('2026-11-26', '09:31'), effects);
		expect(w.sends.map((s) => s.notice.kind)).toEqual(['flex']);
		expect(Object.keys(w.handled.u1!).sort()).toEqual(['flexSent_2026-W48', 'flex_2026-11-26']);
		await runReminders(at('2026-11-27', '09:31'), effects);
		expect(w.sends).toHaveLength(1);
	});
});

describe('sendTest', () => {
	it('sends the test notification to every device', async () => {
		const w = world({ u1: [phone('d1', 'token-1'), phone('d2', 'dead-2')] });
		expect(await sendTest('u1', w.effects)).toBe(1);
		expect(w.sends).toEqual([{ tokens: ['token-1', 'dead-2'], notice: TEST_NOTICE, order: 1 }]);
		expect(w.devices.u1!.map((d) => d.id)).toEqual(['d1']);
	});
});
