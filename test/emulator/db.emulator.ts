// Claude's tool for real data (issue 27) against the emulator, with made-up data: a correction is
// backed up first and logged by 'claude' with its reason, nothing is written without --skriv or
// without a reason, and the export is the app's format.
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { parseExportFile, type ExportFile } from '../../src/data/exportformat.ts';
import { EMULATOR_HOST, EMULATOR_PORTS, EMULATOR_PROJECT_ID } from '../../src/firebase/config.ts';
import { exportUser, fix, openDatabase, query, readUser, stats } from '../../tools/db/lib.ts';

const ME = 'db-1';
const OTHER = 'db-2';

beforeAll(() => {
	process.env.FIRESTORE_EMULATOR_HOST ??= `${EMULATOR_HOST}:${EMULATOR_PORTS.firestore}`;
	if (!getApps().some((app) => app.name === '[DEFAULT]')) {
		initializeApp({ projectId: EMULATOR_PROJECT_ID });
	}
});

const db = () => getFirestore();

const START = Timestamp.fromMillis(Date.UTC(2026, 10, 16, 7, 0));
const END = Timestamp.fromMillis(Date.UTC(2026, 10, 16, 15, 30));

beforeEach(async () => {
	for (const uid of [ME, OTHER]) await db().recursiveDelete(db().doc(`users/${uid}`));
	const put = (path: string, data: object) =>
		db()
			.doc(`users/${ME}/${path}`)
			.set({ schemaVersion: 1, createdAt: START, updatedAt: START, ...data });
	await put('assignments/a1', { name: 'Uppdrag A', archived: false });
	await put('assignments/a1/codes/c1', { name: 'Utveckling', billable: true });
	await put('entries/e1', {
		assignmentId: 'a1',
		time: { kind: 'interval', start: START, end: END },
		note: ''
	});
	await put('reports/a1_r1_2026-W47', { assignmentId: 'a1', week: '2026-W47', status: 'sent' });
	await db().doc(`users/${OTHER}/entries/x`).set({ assignmentId: 'b' });
});

/** A backup that keeps the file in memory, as the CLI writes it to disk. */
const memoryBackup = () => {
	const files: ExportFile[] = [];
	return {
		files,
		backup: async (file: ExportFile) => {
			files.push(file);
			return `minne-${files.length}`;
		}
	};
};

const log = async () =>
	(await db().collection(`users/${ME}/changeLog`).get()).docs.map((d): Record<string, unknown> => ({
		id: d.id,
		...d.data()
	}));

const correction = {
	path: 'entries/e1',
	set: {
		assignmentId: 'a1',
		time: {
			kind: 'interval',
			start: { $timestamp: '2026-11-16T07:00:00.000000000Z' },
			end: { $timestamp: '2026-11-16T15:45:00.000000000Z' }
		},
		note: ''
	}
};

describe('fix', () => {
	it('backs up first, then writes the change and a log entry by claude with the reason', async () => {
		const { files, backup } = memoryBackup();
		const result = await fix(db(), {
			uid: ME,
			change: correction,
			reason: 'Glömt kvart',
			write: true,
			locked: true,
			backup
		});
		expect(result).toMatchObject({
			action: 'update',
			week: '2026-W47',
			locked: ['reports/a1_r1_2026-W47'],
			backup: 'minne-1'
		});

		// The backup is the state before the change, in a format the app can restore.
		expect(files).toHaveLength(1);
		expect(typeof parseExportFile(JSON.parse(JSON.stringify(files[0])))).toBe('object');
		expect(files[0]!.documents['entries/e1']).toMatchObject({
			time: { end: { $timestamp: '2026-11-16T15:30:00.000000000Z' } }
		});

		const entry = (await db().doc(`users/${ME}/entries/e1`).get()).data()!;
		expect((entry.time.end as Timestamp).toMillis()).toBe(Date.UTC(2026, 10, 16, 15, 45));
		expect(entry.createdAt).toEqual(START);
		expect(entry.schemaVersion).toBe(1);

		const entries = await log();
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({
			id: result.logId,
			path: 'entries/e1',
			action: 'update',
			week: '2026-W47',
			reason: 'Glömt kvart',
			by: 'claude'
		});
		expect(entries[0]!.before).not.toHaveProperty('createdAt');
		expect(entries[0]!.at).toBeInstanceOf(Timestamp);
	});

	it('writes nothing without --skriv, and refuses an empty reason', async () => {
		const { files, backup } = memoryBackup();
		const plan = await fix(db(), {
			uid: ME,
			change: correction,
			reason: 'x',
			write: false,
			backup
		});
		expect(plan).toMatchObject({ action: 'update', backup: null, logId: null });
		await expect(
			fix(db(), { uid: ME, change: correction, reason: '  ', write: true, backup })
		).rejects.toThrow('skäl');
		expect(files).toHaveLength(0);
		expect(await log()).toHaveLength(0);
		const end = (await db().doc(`users/${ME}/entries/e1`).get()).get('time.end') as Timestamp;
		expect(end.toMillis()).toBe(END.toMillis());
	});

	it('points a report at its log entry, and deletes with the document kept in the log', async () => {
		const { backup } = memoryBackup();
		const report = await fix(db(), {
			uid: ME,
			change: {
				path: 'reports/a1_r1_2026-W47',
				set: { assignmentId: 'a1', week: '2026-W47', status: 'unlocked' }
			},
			reason: 'Fel status',
			write: true,
			locked: true,
			backup
		});
		expect((await db().doc(`users/${ME}/reports/a1_r1_2026-W47`).get()).get('lastChangeId')).toBe(
			report.logId
		);

		const gone = await fix(db(), {
			uid: ME,
			change: { path: 'entries/e1', delete: true },
			reason: 'Dubblett',
			write: true,
			backup
		});
		expect(gone).toMatchObject({ action: 'delete', week: '2026-W47', after: null });
		expect((await db().doc(`users/${ME}/entries/e1`).get()).exists).toBe(false);
		expect((await log()).find((e) => e.id === gone.logId)).toMatchObject({
			before: { assignmentId: 'a1' },
			after: null,
			by: 'claude'
		});
	});

	it('refuses when the document changed between the read and the write', async () => {
		const backup = async () => {
			await db().doc(`users/${ME}/entries/e1`).update({ note: 'ändrad i appen' });
			return 'minne';
		};
		await expect(
			fix(db(), { uid: ME, change: correction, reason: 'x', write: true, locked: true, backup })
		).rejects.toThrow('ändrades');
		expect(await log()).toHaveLength(0);
	});
});

describe('a locked week', () => {
	it('is written only with --last, and an unsent week without it', async () => {
		const { files, backup } = memoryBackup();
		await expect(
			fix(db(), { uid: ME, change: correction, reason: 'x', write: true, backup })
		).rejects.toThrow('låst av reports/a1_r1_2026-W47');
		expect(files).toHaveLength(0);

		// Another assignment's sent report does not lock this one's week.
		await db().doc(`users/${ME}/reports/a1_r1_2026-W47`).update({ assignmentId: 'a2' });
		const result = await fix(db(), {
			uid: ME,
			change: correction,
			reason: 'x',
			write: true,
			backup
		});
		expect(result.locked).toEqual([]);
		expect(await log()).toHaveLength(1);
	});

	it('gives a draft report no lastChangeId', async () => {
		const { backup } = memoryBackup();
		await fix(db(), {
			uid: ME,
			change: {
				path: 'reports/a1_r1_2026-W48',
				set: { assignmentId: 'a1', week: '2026-W48', status: 'draft' }
			},
			reason: 'Nytt utkast',
			write: true,
			backup
		});
		const report = (await db().doc(`users/${ME}/reports/a1_r1_2026-W48`).get()).data()!;
		expect(report).not.toHaveProperty('lastChangeId');
	});
});

describe('reading', () => {
	it('exports in the app format and counts without content', async () => {
		const file = await exportUser(db(), ME, Date.UTC(2026, 10, 27));
		expect(Object.keys(file.documents)).toEqual([
			'assignments/a1',
			'assignments/a1/codes/c1',
			'entries/e1',
			'reports/a1_r1_2026-W47'
		]);
		expect(await readUser(db(), OTHER)).toHaveLength(1);
		const counts = await stats(db());
		expect(counts[ME]).toEqual({
			assignments: 1,
			'assignments/*/codes': 1,
			entries: 1,
			reports: 1
		});
	});

	it('queries one collection with a filter, and refuses one outside the export', async () => {
		expect(Object.keys(await query(db(), ME, 'reports', { where: 'status==sent' }))).toEqual([
			'reports/a1_r1_2026-W47'
		]);
		expect(await query(db(), ME, 'reports', { where: 'status==draft' })).toEqual({});
		await expect(query(db(), ME, 'secrets')).rejects.toThrow('finns inte');
	});

	it('opens the emulator, never a real project, when the emulator host is set', async () => {
		const tool = openDatabase('drift', {
			FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST
		});
		expect(Object.keys(await query(tool, ME, 'entries'))).toEqual(['entries/e1']);
	});
});
