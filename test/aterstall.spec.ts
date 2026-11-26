// The restore function (issue 57) with a made-up database in a Map: only missing documents are
// written, below the caller's uid, with exact times, and the restore is logged.
import { describe, expect, it, vi } from 'vitest';
import {
	RefusedFile,
	restoreMissing,
	type RestoreEffects
} from '../firebase-functions/src/aterstall.ts';
import { exportFile } from '../src/data/exportformat.ts';

class Time {
	readonly seconds: number;
	readonly nanoseconds: number;
	constructor(seconds: number, nanoseconds: number) {
		this.seconds = seconds;
		this.nanoseconds = nanoseconds;
	}
	toMillis() {
		return this.seconds * 1000 + this.nanoseconds / 1e6;
	}
}

const database = (initial: Record<string, object> = {}) => {
	const docs = new Map(Object.entries(initial));
	const logs: Array<{ uid: string; entry: Record<string, unknown> }> = [];
	const effects: RestoreEffects = {
		makeTime: (s, n) => new Time(s, n),
		existing: async (uid, paths) => new Set(paths.filter((p) => docs.has(`users/${uid}/${p}`))),
		create: async (uid, documents, entry) => {
			for (const { path } of documents) {
				if (docs.has(`users/${uid}/${path}`)) throw new Error(`exists: users/${uid}/${path}`);
			}
			for (const { path, data } of documents) docs.set(`users/${uid}/${path}`, data);
			logs.push({ uid, entry });
		},
		info: vi.fn()
	};
	return { docs, logs, effects };
};

const file = (documents: Record<string, object>) =>
	JSON.parse(
		JSON.stringify(
			exportFile(
				Object.entries(documents).map(([path, data]) => ({ path, data })),
				Date.UTC(2026, 10, 26, 9)
			)
		)
	) as unknown;

const exact = new Time(1_795_000_000, 123_456_789);

describe('restoreMissing', () => {
	it('writes every document to an empty user, with exact times, and logs it', async () => {
		const { docs, logs, effects } = database();
		const result = await restoreMissing(
			'testperson-1',
			file({
				'entries/e1': { time: { start: exact }, note: 'Påhittad' },
				'assignments/a1/codes/c1': { name: 'Kod' },
				'changeLog/l1': { at: exact, reason: 'Fel kod' }
			}),
			effects
		);
		expect(result).toEqual({ restored: 3, existed: 0 });
		expect(docs.get('users/testperson-1/entries/e1')).toEqual({
			time: { start: exact },
			note: 'Påhittad'
		});
		expect(docs.get('users/testperson-1/changeLog/l1')).toEqual({ at: exact, reason: 'Fel kod' });
		expect(logs).toEqual([
			{
				uid: 'testperson-1',
				entry: {
					path: '*',
					action: 'restore',
					week: null,
					before: null,
					after: {
						paths: ['assignments/a1/codes/c1', 'changeLog/l1', 'entries/e1'],
						exportedAt: '2026-11-26T09:00:00.000Z'
					},
					reason: 'Återställd från fil',
					by: 'app'
				}
			}
		]);
		expect(effects.info).toHaveBeenCalledWith('aterstall: klar', {
			uid: 'testperson-1',
			restored: 3,
			existed: 0
		});
	});

	it('never writes over a document that exists, and touches no other user', async () => {
		const { docs, logs, effects } = database({
			'users/testperson-1/entries/e1': { note: 'ändrad efter exporten' },
			'users/annan/entries/e2': { note: 'annan' }
		});
		const result = await restoreMissing(
			'testperson-1',
			file({ 'entries/e1': { note: 'gammal' }, 'entries/e2': { note: 'raderad' } }),
			effects
		);
		expect(result).toEqual({ restored: 1, existed: 1 });
		expect(docs.get('users/testperson-1/entries/e1')).toEqual({ note: 'ändrad efter exporten' });
		expect(docs.get('users/testperson-1/entries/e2')).toEqual({ note: 'raderad' });
		expect(docs.get('users/annan/entries/e2')).toEqual({ note: 'annan' });
		expect(logs).toHaveLength(1);
	});

	it('writes and logs nothing when everything is there', async () => {
		const { logs, effects } = database({ 'users/testperson-1/entries/e1': { n: 1 } });
		expect(await restoreMissing('testperson-1', file({ 'entries/e1': { n: 1 } }), effects)).toEqual(
			{ restored: 0, existed: 1 }
		);
		expect(logs).toEqual([]);
	});

	it('writes more than one batch', async () => {
		const { docs, effects } = database();
		const many = Object.fromEntries(
			Array.from({ length: 1201 }, (_, i) => [`entries/e${i}`, { n: i }])
		);
		const create = vi.spyOn(effects, 'create');
		expect(await restoreMissing('testperson-1', file(many), effects)).toEqual({
			restored: 1201,
			existed: 0
		});
		expect(create).toHaveBeenCalledTimes(3);
		expect(docs.size).toBe(1201);
	});

	it('keeps the batches already written, each with its log entry, when a later one fails', async () => {
		const { docs, logs, effects } = database();
		const many = Object.fromEntries(
			Array.from({ length: 600 }, (_, i) => [`entries/e${String(i).padStart(3, '0')}`, { n: i }])
		);
		const create = effects.create;
		let calls = 0;
		effects.create = async (uid, documents, entry) => {
			calls += 1;
			if (calls === 2) throw new Error('nätet');
			await create(uid, documents, entry);
		};
		await expect(restoreMissing('testperson-1', file(many), effects)).rejects.toThrow('nätet');
		expect(docs.size).toBe(499);
		expect(logs).toHaveLength(1);
		expect((logs[0]!.entry.after as { paths: string[] }).paths).toHaveLength(499);
	});

	it('refuses a file with a time it cannot read, before writing', async () => {
		const { docs, effects } = database();
		const bad = file({ 'entries/e1': { n: 1 } }) as { documents: Record<string, object> };
		bad.documents['entries/e2'] = { at: { $timestamp: 'igår' } };
		await expect(restoreMissing('testperson-1', bad, effects)).rejects.toThrow(RefusedFile);
		expect(docs.size).toBe(0);
	});

	it('refuses a file of another kind or with a path outside the app, before writing', async () => {
		const { docs, effects } = database();
		await expect(restoreMissing('testperson-1', { app: 'Annan' }, effects)).rejects.toThrow(
			RefusedFile
		);
		await expect(
			restoreMissing(
				'testperson-1',
				file({ 'entries/e1': { n: 1 }, 'system/budget': { percent: 0 } }),
				effects
			)
		).rejects.toThrow('system/budget');
		expect(docs.size).toBe(0);
	});
});
