// The settings' writers with Firestore replaced by a recorder: which documents and which log
// entries a save writes (ADR 0016). That the rules accept them is tested against the emulator
// (test/emulator/regler.emulator.ts).
import type { Firestore } from 'firebase/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assignment, code } from '../domain/testdata.ts';
import type { Receiver } from '../domain/types.ts';

interface Write {
	op: 'set' | 'update' | 'delete';
	path: string;
	data?: Record<string, unknown>;
}

const recorded = vi.hoisted(() => ({ writes: [] as Write[], existing: new Set<string>(), ids: 0 }));

vi.mock('firebase/firestore', async (importOriginal) => {
	const real = await importOriginal<typeof import('firebase/firestore')>();
	const ref = (...segments: string[]) => ({ path: segments.join('/'), id: segments.at(-1)! });
	return {
		...real,
		doc: (parent: unknown, ...segments: string[]) =>
			segments.length === 0
				? ref((parent as { path: string }).path, `logg${++recorded.ids}`)
				: ref(...segments),
		collection: (_db: unknown, ...segments: string[]) => ref(...segments),
		serverTimestamp: () => 'SERVERTID',
		runTransaction: async (_db: unknown, run: (tx: unknown) => Promise<unknown>) =>
			run({
				get: async (r: { path: string }) => ({ exists: () => recorded.existing.has(r.path) }),
				set: (r: { path: string }, data: Record<string, unknown>) =>
					recorded.writes.push({ op: 'set', path: r.path, data }),
				update: (r: { path: string }, data: Record<string, unknown>) =>
					recorded.writes.push({ op: 'update', path: r.path, data }),
				delete: (r: { path: string }) => recorded.writes.push({ op: 'delete', path: r.path })
			})
	};
});

const { ensureDefaultAbsenceTypes, saveAbsenceType, saveAssignment, saveFreeDay, saveReceiver } =
	await import('./installningar.ts');

const db = {} as Firestore;
const U = 'users/testperson-1';
const paths = () => recorded.writes.map((w) => `${w.op} ${w.path.replace(`${U}/`, '')}`);
const log = () => recorded.writes.find((w) => w.path.includes('/changeLog/'))?.data;

beforeEach(() => {
	recorded.writes = [];
	recorded.existing = new Set();
	recorded.ids = 0;
});

describe('saveAssignment', () => {
	it('creates a new assignment and its codes without a log entry', async () => {
		await saveAssignment(db, 'testperson-1', null, assignment(), [
			{ before: null, after: code('c1') }
		]);
		expect(paths()).toEqual(['set assignments/a1', 'set assignments/a1/codes/c1']);
		expect(recorded.writes[0]!.data).toMatchObject({
			name: 'Exempeluppdraget',
			lastChangeId: null,
			schemaVersion: 1,
			createdAt: 'SERVERTID'
		});
		expect(recorded.writes[1]!.data).not.toHaveProperty('assignmentId');
	});

	it('logs a changed opening balance, and the assignment names the entry', async () => {
		const before = assignment();
		await saveAssignment(db, 'testperson-1', before, { ...before, openingFlex: 60 });
		expect(paths()).toEqual(['set changeLog/logg1', 'update assignments/a1']);
		expect(log()).toMatchObject({
			path: 'assignments/a1',
			action: 'update',
			week: null,
			reason: '',
			by: 'app',
			before: { openingFlex: 0 },
			after: { openingFlex: 60, lastChangeId: 'logg1' }
		});
		expect(recorded.writes[1]!.data).toMatchObject({ lastChangeId: 'logg1' });
		expect(recorded.writes[1]!.data).not.toHaveProperty('createdAt');
	});

	it('changes a name or archives without a log entry', async () => {
		const before = assignment();
		await saveAssignment(db, 'testperson-1', before, { ...before, name: 'Nytt', archived: true });
		expect(paths()).toEqual(['update assignments/a1']);
	});
});

const receiver: Receiver = {
	id: 'r1',
	assignmentId: 'a1',
	name: 'Kund A',
	position: 1,
	suggestionMode: 'fillNorm',
	codes: [{ id: 'k1', name: '1001' }],
	mapping: { c1: 'k1' },
	party: null,
	archived: false
};

describe('saveReceiver', () => {
	it('logs a new receiver, which may take position 1', async () => {
		await saveReceiver(db, 'testperson-1', null, receiver);
		expect(paths()).toEqual(['set changeLog/logg1', 'set assignments/a1/receivers/r1']);
		expect(log()).toMatchObject({
			path: 'assignments/a1/receivers/r1',
			action: 'create',
			before: null
		});
	});

	it('logs a moved receiver but not a new mapping', async () => {
		await saveReceiver(db, 'testperson-1', receiver, { ...receiver, mapping: {} });
		expect(paths()).toEqual(['update assignments/a1/receivers/r1']);
		recorded.writes = [];
		await saveReceiver(db, 'testperson-1', receiver, { ...receiver, position: 2 });
		expect(paths()).toEqual(['set changeLog/logg1', 'update assignments/a1/receivers/r1']);
	});
});

describe('saveAbsenceType', () => {
	const semester = {
		id: 'semester',
		name: 'Semester',
		counting: 'fillsNorm' as const,
		archived: false,
		order: 0
	};

	it('logs a changed counting only', async () => {
		await saveAbsenceType(db, 'testperson-1', semester, { ...semester, name: 'Ledighet' });
		expect(paths()).toEqual(['update absenceTypes/semester']);
		recorded.writes = [];
		await saveAbsenceType(db, 'testperson-1', semester, { ...semester, counting: 'worked' });
		expect(paths()).toEqual(['set changeLog/logg1', 'update absenceTypes/semester']);
		recorded.writes = [];
		await saveAbsenceType(db, 'testperson-1', null, { ...semester, id: 'ny' });
		expect(paths()).toEqual(['set absenceTypes/ny']);
	});
});

describe('saveFreeDay', () => {
	const day = { date: '2027-05-07', free: true, name: 'Klämdag' };

	it('logs a new day and a changed name', async () => {
		await saveFreeDay(db, 'testperson-1', null, day);
		expect(paths()).toEqual(['set changeLog/logg1', 'set freeDays/2027-05-07']);
		recorded.writes = [];
		await saveFreeDay(db, 'testperson-1', day, { ...day, name: 'Ledig' });
		expect(paths()).toEqual(['set changeLog/logg2', 'update freeDays/2027-05-07']);
		expect(log()).toMatchObject({ before: { name: 'Klämdag' }, action: 'update' });
	});

	it('logs a removal itself, which the rules cannot tie to an entry', async () => {
		await saveFreeDay(db, 'testperson-1', day, null);
		expect(paths()).toEqual(['delete freeDays/2027-05-07', 'set changeLog/logg1']);
		expect(log()).toMatchObject({
			path: 'freeDays/2027-05-07',
			action: 'delete',
			before: { free: true, name: 'Klämdag' },
			after: null
		});
	});

	it('moves a day as a removal and a new day', async () => {
		await saveFreeDay(db, 'testperson-1', day, { ...day, date: '2027-05-14' });
		expect(paths()).toEqual([
			'delete freeDays/2027-05-07',
			'set changeLog/logg1',
			'set changeLog/logg2',
			'set freeDays/2027-05-14'
		]);
	});
});

describe('ensureDefaultAbsenceTypes', () => {
	it('creates only the default types that are missing', async () => {
		recorded.existing = new Set([`${U}/absenceTypes/semester`, `${U}/absenceTypes/komptid`]);
		expect(await ensureDefaultAbsenceTypes(db, 'testperson-1')).toBe(4);
		expect(paths()).toEqual([
			'set absenceTypes/sjukdom',
			'set absenceTypes/tjanstledighet',
			'set absenceTypes/banktid',
			'set absenceTypes/utbildning'
		]);
	});
});
