import {
	assertFails,
	assertSucceeds,
	initializeTestEnvironment,
	type RulesTestEnvironment
} from '@firebase/rules-unit-testing';
import {
	collection,
	deleteDoc,
	doc,
	getDoc,
	getDocs,
	serverTimestamp,
	setDoc,
	Timestamp,
	updateDoc,
	writeBatch,
	type DocumentData,
	type Firestore
} from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
	absenceTypeCodec,
	assignmentCodec,
	codeCodec,
	deviceCodec,
	entryCodec,
	freeDayCodec,
	receiverCodec,
	reportCodec,
	settingsCodec,
	timerCodec,
	DEFAULT_SETTINGS
} from '../../src/data/dokument.ts';
import { createMeta, updateMeta } from '../../src/data/kodning.ts';
import { LockedChangeError, saveEntry, saveReport, stopTimer } from '../../src/data/skrivning.ts';
import { assignment, code, receiver, report, work } from '../../src/domain/testdata.ts';
import type { Report } from '../../src/domain/types.ts';
import { EMULATOR_HOST, EMULATOR_PORTS, EMULATOR_PROJECT_ID } from '../../src/firebase/config.ts';

// Made-up users and data only.
const OWNER = 'testperson-1';
const OTHER = 'testperson-2';

let env: RulesTestEnvironment;

beforeAll(async () => {
	env = await initializeTestEnvironment({
		projectId: EMULATOR_PROJECT_ID,
		firestore: {
			host: EMULATOR_HOST,
			port: EMULATOR_PORTS.firestore,
			rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8')
		}
	});
});

beforeEach(() => env.clearFirestore());

afterAll(() => env.cleanup());

const owner = (): Firestore => env.authenticatedContext(OWNER).firestore() as unknown as Firestore;
const other = (): Firestore => env.authenticatedContext(OTHER).firestore() as unknown as Firestore;
const anonymous = (): Firestore => env.unauthenticatedContext().firestore() as unknown as Firestore;

const at = (db: Firestore, path: string, uid = OWNER) => doc(db, 'users', uid, path);
const create = (db: Firestore, path: string, data: DocumentData) =>
	setDoc(at(db, path), { ...data, ...createMeta() });

const denied = (promise: Promise<unknown>) => expect(assertFails(promise)).resolves.toBeDefined();

// A valid document of every kind, written as the data layer writes it.
const valid: [string, DocumentData][] = [
	['assignments/a1', assignmentCodec.toData(assignment())],
	['assignments/a1/codes/c1', codeCodec.toData(code('c1'))],
	['assignments/a1/receivers/r1', receiverCodec.toData(receiver())],
	[
		'absenceTypes/semester',
		absenceTypeCodec.toData({
			id: 'semester',
			name: 'Semester',
			counting: 'fillsNorm',
			archived: false,
			order: 0
		})
	],
	[
		'freeDays/2026-12-24',
		freeDayCodec.toData({ date: '2026-12-24', free: false, name: 'Julafton' })
	],
	['entries/e1', entryCodec.toData(work('2026-11-25', '08:00', '17:00'))],
	['pauses/2026-11-25', {}],
	[
		'reports/a1_r1_2026-W48',
		reportCodec.toData(report('2026-W48', 'draft', [60, 0, 0, 0, 0, 0, 0]))
	],
	['devices/d1', deviceCodec.toData({ id: 'd1', fcmToken: 'token-1', label: 'Telefon' })],
	[
		'state/timer',
		timerCodec.toData({
			assignmentId: 'a1',
			subject: { kind: 'code', codeId: 'c1' },
			start: Date.UTC(2026, 10, 25, 7)
		})
	],
	['state/settings', settingsCodec.toData(DEFAULT_SETTINGS)]
];

describe('only the owner', () => {
	it.each(valid)('can create, read and update %s', async (path, data) => {
		await expect(assertSucceeds(create(owner(), path, data))).resolves.toBeUndefined();
		await expect(assertSucceeds(getDoc(at(owner(), path)))).resolves.toBeDefined();
		await expect(
			assertSucceeds(updateDoc(at(owner(), path), { ...data, ...updateMeta() }))
		).resolves.toBeUndefined();
	});

	it.each(valid)(
		'is alone with %s: others and signed-out users are refused',
		async (path, data) => {
			await env.withSecurityRulesDisabled((ctx) =>
				setDoc(doc(ctx.firestore(), 'users', OWNER, path), { ...data, schemaVersion: 1 })
			);
			for (const db of [other(), anonymous()]) {
				await denied(getDoc(at(db, path)));
				await denied(setDoc(at(db, path), { ...data, ...createMeta() }));
				await denied(deleteDoc(at(db, path)));
			}
		}
	);

	it('cannot write into another user’s tree, even with valid data', async () => {
		await denied(
			setDoc(at(owner(), 'assignments/a1', OTHER), {
				...assignmentCodec.toData(assignment()),
				...createMeta()
			})
		);
	});

	it('cannot list another user’s entries', async () => {
		await denied(getDocs(collection(other(), 'users', OWNER, 'entries')));
		await expect(
			assertSucceeds(getDocs(collection(owner(), 'users', OWNER, 'entries')))
		).resolves.toBeDefined();
	});

	it('cannot use the user document itself', async () => {
		await denied(setDoc(doc(owner(), 'users', OWNER), { name: 'x' }));
		await denied(getDoc(doc(owner(), 'users', OWNER)));
	});
});

describe('field validation', () => {
	const entry = entryCodec.toData(work('2026-11-25', '08:00', '17:00'));
	const start = Timestamp.fromMillis(Date.UTC(2026, 10, 25, 7));

	it.each([
		['an extra field', 'entries/e1', { ...entry, extra: 'x' }],
		[
			'a missing field',
			'entries/e1',
			{ assignmentId: 'a1', subject: entry.subject, time: entry.time }
		],
		['a note over 500 characters', 'entries/e1', { ...entry, note: 'x'.repeat(501) }],
		[
			'an end before the start',
			'entries/e1',
			{
				...entry,
				time: { kind: 'interval', start, end: Timestamp.fromMillis(start.toMillis() - 60_000) }
			}
		],
		[
			'an interval over 24 hours',
			'entries/e1',
			{
				...entry,
				time: {
					kind: 'interval',
					start,
					end: Timestamp.fromMillis(start.toMillis() + 25 * 3_600_000)
				}
			}
		],
		[
			'a whole day on an internal code',
			'entries/e1',
			{ ...entry, time: { kind: 'allDay', date: '2026-11-25' } }
		],
		[
			'an unknown subject kind',
			'entries/e1',
			{ ...entry, subject: { kind: 'other', codeId: 'c1' } }
		],
		['a number as a name', 'assignments/a1', { ...assignmentCodec.toData(assignment()), name: 42 }],
		[
			'a name over 100 characters',
			'assignments/a1',
			{ ...assignmentCodec.toData(assignment()), name: 'x'.repeat(101) }
		],
		[
			'an end date before the start',
			'assignments/a1',
			{ ...assignmentCodec.toData(assignment()), endDate: '2025-12-31' }
		],
		[
			'a malformed day',
			'assignments/a1',
			{ ...assignmentCodec.toData(assignment()), startDate: '1 jan' }
		],
		['no terms', 'assignments/a1', { ...assignmentCodec.toData(assignment()), terms: [] }],
		[
			'a decimal flex balance',
			'assignments/a1',
			{ ...assignmentCodec.toData(assignment()), openingFlex: 1.5 }
		],
		[
			'position 0',
			'assignments/a1/receivers/r1',
			{ ...receiverCodec.toData(receiver()), position: 0 }
		],
		[
			'an unknown suggestion mode',
			'assignments/a1/receivers/r1',
			{ ...receiverCodec.toData(receiver()), suggestionMode: 'all' }
		],
		[
			'an unknown counting',
			'absenceTypes/x',
			{ name: 'X', counting: 'bonus', archived: false, order: 0 }
		],
		['a free day under a malformed id', 'freeDays/julafton', { free: true, name: 'Jul' }],
		['a pause with data', 'pauses/2026-11-25', { note: 'lunch' }],
		[
			'a malformed clock time',
			'state/settings',
			{ ...settingsCodec.toData(DEFAULT_SETTINGS), noTimerBy: '25:00' }
		],
		[
			'a negative flex warning',
			'state/settings',
			{ ...settingsCodec.toData(DEFAULT_SETTINGS), flexWarning: -1 }
		],
		['an empty device token', 'devices/d1', { fcmToken: '', label: 'Telefon' }]
	] as [string, string, DocumentData][])('refuses %s', async (_, path, data) => {
		await denied(create(owner(), path, data));
	});

	it('refuses a document without server times or schemaVersion', async () => {
		await denied(setDoc(at(owner(), 'entries/e1'), { ...entry, schemaVersion: 1 }));
		await denied(
			setDoc(at(owner(), 'entries/e1'), {
				...entry,
				schemaVersion: 1,
				createdAt: Timestamp.fromMillis(0),
				updatedAt: serverTimestamp()
			})
		);
		await denied(
			setDoc(at(owner(), 'entries/e1'), { ...entry, ...createMeta(), schemaVersion: 0 })
		);
	});

	it('keeps createdAt on update', async () => {
		await create(owner(), 'entries/e1', entry);
		await denied(updateDoc(at(owner(), 'entries/e1'), { note: 'x', createdAt: serverTimestamp() }));
		await expect(
			assertSucceeds(updateDoc(at(owner(), 'entries/e1'), { note: 'x', ...updateMeta() }))
		).resolves.toBeUndefined();
	});

	it('refuses an update that breaks a valid document', async () => {
		await create(owner(), 'entries/e1', entry);
		await denied(updateDoc(at(owner(), 'entries/e1'), { note: 'x'.repeat(501), ...updateMeta() }));
		await denied(updateDoc(at(owner(), 'entries/e1'), { extra: 1, ...updateMeta() }));
	});

	it('lets nobody delete assignments, codes, receivers, absence types or settings', async () => {
		for (const [path, data] of valid.filter(([p]) =>
			/^(assignments|absenceTypes|state\/settings)/.test(p)
		)) {
			await create(owner(), path, data);
			await denied(deleteDoc(at(owner(), path)));
		}
	});
});

describe('the change log', () => {
	const log = (overrides: DocumentData = {}) => ({
		at: serverTimestamp(),
		path: 'entries/e1',
		action: 'update',
		week: '2026-W48',
		before: { note: '' },
		after: { note: 'x' },
		reason: '',
		by: 'app',
		...createMeta(),
		...overrides
	});

	it('can be created', async () => {
		await expect(
			assertSucceeds(setDoc(at(owner(), 'changeLog/l1'), log()))
		).resolves.toBeUndefined();
	});

	it('can never be changed or deleted', async () => {
		await setDoc(at(owner(), 'changeLog/l1'), log());
		await denied(updateDoc(at(owner(), 'changeLog/l1'), { reason: 'ändrad', ...updateMeta() }));
		await denied(deleteDoc(at(owner(), 'changeLog/l1')));
	});

	it.each([
		['written by claude', { by: 'claude' }],
		['with its own time', { at: Timestamp.fromMillis(0) }],
		['with an unknown action', { action: 'drop' }],
		['with a reason over 500 characters', { reason: 'x'.repeat(501) }],
		['with an extra field', { extra: 1 }]
	])('refuses an entry %s', async (_, overrides) => {
		await denied(setDoc(at(owner(), 'changeLog/l1'), log(overrides)));
	});
});

describe('locking reports', () => {
	const id = 'a1_r1_2026-W48';
	const draft = (): Report => ({ ...report('2026-W48', 'draft', [480, 480, 480, 480, 480, 0, 0]) });
	const sent = (): Report => ({
		...draft(),
		status: 'sent',
		snapshot: {
			sentAt: Date.UTC(2026, 10, 27, 14),
			assignmentName: 'Exempeluppdraget',
			receiverName: 'Mottagare ett',
			codeNames: { 'R-arbete': 'Arbete' },
			actualMinutes: 2490
		}
	});
	const ref = () => at(owner(), `reports/${id}`);
	const write = (r: Report) => updateDoc(ref(), { ...reportCodec.toData(r), ...updateMeta() });

	/** A write of the report together with a log entry, as one batch. */
	const withLog = async (r: Report, logId: string, logOverrides: DocumentData = {}) => {
		const db = owner();
		const batch = writeBatch(db);
		batch.set(at(db, `changeLog/${logId}`), {
			at: serverTimestamp(),
			path: `reports/${id}`,
			action: 'unlock',
			week: '2026-W48',
			before: null,
			after: null,
			reason: 'Fel kod på fredag',
			by: 'app',
			...createMeta(),
			...logOverrides
		});
		batch.update(at(db, `reports/${id}`), {
			...reportCodec.toData({ ...r, lastChangeId: logId }),
			...updateMeta()
		});
		return batch.commit();
	};

	const sendIt = async () => {
		await saveReport(owner(), OWNER, id, draft());
		await saveReport(owner(), OWNER, id, sent());
	};

	it('lets a draft be changed, sent and deleted freely', async () => {
		await expect(saveReport(owner(), OWNER, id, draft())).resolves.toMatchObject({
			status: 'draft'
		});
		await expect(
			assertSucceeds(write({ ...draft(), mode: 'actualQuarter' }))
		).resolves.toBeUndefined();
		await expect(assertSucceeds(deleteDoc(ref()))).resolves.toBeUndefined();
		await sendIt();
		expect((await getDoc(ref())).data()?.status).toBe('sent');
	});

	it('refuses a sent report without a snapshot', async () => {
		await saveReport(owner(), OWNER, id, draft());
		await denied(write({ ...draft(), status: 'sent' }));
	});

	it('refuses a report under an id that does not match its fields', async () => {
		await denied(
			setDoc(at(owner(), 'reports/a1_r2_2026-W48'), {
				...reportCodec.toData(draft()),
				...createMeta()
			})
		);
	});

	it('refuses a new report that starts unlocked', async () => {
		await denied(
			setDoc(ref(), { ...reportCodec.toData({ ...sent(), status: 'unlocked' }), ...createMeta() })
		);
	});

	it('refuses any change to a sent report, and deleting it', async () => {
		await sendIt();
		await denied(write({ ...sent(), mode: 'actualQuarter' }));
		await denied(write({ ...sent(), status: 'draft' }));
		await denied(deleteDoc(ref()));
	});

	it('refuses an unlock without a log entry', async () => {
		await sendIt();
		await denied(write({ ...sent(), status: 'unlocked', lastChangeId: 'saknas' }));
		await denied(write({ ...sent(), status: 'unlocked' }));
	});

	it('allows an unlock with a new log entry', async () => {
		await sendIt();
		await expect(
			assertSucceeds(withLog({ ...sent(), status: 'unlocked' }, 'l1'))
		).resolves.toBeUndefined();
	});

	it.each([
		['an empty reason', { reason: '' }],
		['another report’s path', { path: 'reports/a1_r2_2026-W48' }]
	])('refuses an unlock whose log entry has %s', async (_, overrides) => {
		await sendIt();
		await denied(withLog({ ...sent(), status: 'unlocked' }, 'l1', overrides));
	});

	it('refuses an unlock that also changes the report', async () => {
		await sendIt();
		await denied(withLog({ ...sent(), status: 'unlocked', mode: 'actualQuarter' }, 'l1'));
	});

	it('refuses a change to an unlocked report without a new log entry', async () => {
		await sendIt();
		await withLog({ ...sent(), status: 'unlocked' }, 'l1');
		const unlocked = { ...sent(), status: 'unlocked' as const, lastChangeId: 'l1' };
		await denied(write({ ...unlocked, mode: 'actualQuarter' }));
		// Reusing the log entry from the unlock does not count either.
		await denied(write({ ...unlocked, mode: 'actualQuarter', lastChangeId: 'l1' }));
	});

	it('allows a change and a new send of an unlocked report, each with its own log entry', async () => {
		await sendIt();
		await withLog({ ...sent(), status: 'unlocked' }, 'l1');
		await expect(
			assertSucceeds(withLog({ ...sent(), status: 'unlocked', mode: 'actualQuarter' }, 'l2'))
		).resolves.toBeUndefined();
		await expect(
			assertSucceeds(withLog({ ...sent(), mode: 'actualQuarter' }, 'l3'))
		).resolves.toBeUndefined();
		expect((await getDoc(ref())).data()?.status).toBe('sent');
	});

	it('refuses deleting an unlocked report', async () => {
		await sendIt();
		await withLog({ ...sent(), status: 'unlocked' }, 'l1');
		await denied(deleteDoc(ref()));
	});
});

describe('the data layer’s writes pass the rules', () => {
	const id = 'a1_r1_2026-W48';
	const sent = (): Report => ({
		...report('2026-W48', 'sent', [480, 480, 480, 480, 480, 0, 0]),
		snapshot: {
			sentAt: Date.UTC(2026, 10, 27, 14),
			assignmentName: 'Exempeluppdraget',
			receiverName: 'Mottagare ett',
			codeNames: {},
			actualMinutes: 2400
		}
	});

	it('saveReport sends, unlocks, changes and sends again, logging the locked changes', async () => {
		const db = owner();
		await saveReport(db, OWNER, id, sent());
		const unlocked = await saveReport(db, OWNER, id, { ...sent(), status: 'unlocked' }, 'Fel kod');
		expect(unlocked?.lastChangeId).toBeTruthy();
		await saveReport(db, OWNER, id, { ...unlocked!, mode: 'actualQuarter' }, 'Rättad fredag');
		await saveReport(
			db,
			OWNER,
			id,
			{ ...unlocked!, mode: 'actualQuarter', status: 'sent' },
			'Skickad igen'
		);
		const logs = await getDocs(collection(db, 'users', OWNER, 'changeLog'));
		expect(logs.docs.map((d) => d.data().action).sort()).toEqual(['send', 'unlock', 'update']);
	});

	it('saveReport refuses a locked change without a reason, before writing', async () => {
		await saveReport(owner(), OWNER, id, sent());
		await expect(
			saveReport(owner(), OWNER, id, { ...sent(), status: 'unlocked' })
		).rejects.toBeInstanceOf(LockedChangeError);
		await expect(
			saveReport(owner(), OWNER, id, { ...sent(), mode: 'actualQuarter' }, 'x')
		).rejects.toBeInstanceOf(LockedChangeError);
	});

	it('saveEntry logs a correction in a sent week and not in an open one', async () => {
		const db = owner();
		const reports = [sent()];
		const open = { ...work('2026-11-18', '08:00', '17:00'), id: 'e-open' };
		const inSent = { ...work('2026-11-25', '08:00', '17:00'), id: 'e-sent' };
		await saveEntry(db, OWNER, null, open, reports);
		await saveEntry(db, OWNER, null, inSent, reports);
		await saveEntry(db, OWNER, inSent, { ...inSent, note: 'Rättad' }, reports, '');
		await saveEntry(db, OWNER, inSent, null, reports);
		const logs = await getDocs(collection(db, 'users', OWNER, 'changeLog'));
		expect(logs.docs.map((d) => d.data().action).sort()).toEqual(['create', 'delete', 'update']);
		expect(logs.docs.every((d) => d.data().path === 'entries/e-sent')).toBe(true);
	});

	it('stopTimer writes one entry and empties the timer; a second stop is refused', async () => {
		const db = owner();
		const timer = {
			assignmentId: 'a1',
			subject: { kind: 'code' as const, codeId: 'c1' },
			start: Date.UTC(2026, 10, 25, 7)
		};
		await create(db, 'state/timer', timerCodec.toData(timer));
		const entry = await stopTimer(db, OWNER, timer, Date.UTC(2026, 10, 25, 15));
		expect(entry.id).toBe(`timer-${timer.start}`);
		expect((await getDoc(at(db, 'state/timer'))).exists()).toBe(false);
		await denied(stopTimer(db, OWNER, timer, Date.UTC(2026, 10, 25, 16)));
		const entries = await getDocs(collection(db, 'users', OWNER, 'entries'));
		expect(entries.size).toBe(1);
	});
});
