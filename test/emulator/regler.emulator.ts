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
	customerCodec,
	deviceCodec,
	employerCodec,
	entryCodec,
	freeDayCodec,
	receiverCodec,
	reportCodec,
	settingsCodec,
	timerCodec,
	DEFAULT_SETTINGS
} from '../../src/data/dokument.ts';
import { createMeta, updateMeta, without } from '../../src/data/kodning.ts';
import {
	ensureDefaultAbsenceTypes,
	saveAbsenceType,
	saveAssignment,
	saveCustomer,
	saveEmployer,
	saveFreeDay,
	saveReceiver
} from '../../src/data/installningar.ts';
import {
	LockedChangeError,
	saveEntry,
	saveReport,
	startTimer,
	stopTimer,
	switchTimer
} from '../../src/data/skrivning.ts';
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
const allowed = (promise: Promise<unknown>) =>
	expect(assertSucceeds(promise)).resolves.toBeUndefined();

/** A changeLog entry as the data layer writes it. */
const logEntry = (overrides: DocumentData = {}): DocumentData => ({
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

let logCount = 0;

/**
 * Writes a setting together with a new log entry for it, as ADR 0016 requires for the changes
 * that alter the flex: a create, or an update when `update` is set.
 */
const logged = (
	db: Firestore,
	path: string,
	data: DocumentData,
	update = false,
	logOverrides: DocumentData = {}
) => {
	const logId = `l-${++logCount}`;
	const batch = writeBatch(db);
	batch.set(
		at(db, `changeLog/${logId}`),
		logEntry({
			path,
			action: update ? 'update' : 'create',
			week: null,
			before: update ? { before: true } : null,
			after: { after: true },
			...logOverrides
		})
	);
	const value = { ...data, lastChangeId: logId };
	if (update) batch.update(at(db, path), { ...value, ...updateMeta() });
	else batch.set(at(db, path), { ...value, ...createMeta() });
	return batch.commit();
};

/** Receivers and free days are logged when they are created (ADR 0016). */
const loggedOnCreate = (path: string) => /receivers|freeDays/.test(path);

/** Creates any valid document, with a log entry where the rules need one. */
const createAny = (db: Firestore, path: string, data: DocumentData) =>
	loggedOnCreate(path) ? logged(db, path, data) : create(db, path, data);

// A valid document of every kind, written as the data layer writes it.
const valid: [string, DocumentData][] = [
	['assignments/a1', assignmentCodec.toData(assignment({ employerId: 'g1', customerId: 'k1' }))],
	[
		'employers/g1',
		employerCodec.toData({
			id: 'g1',
			name: 'Exempelkonsult AB',
			suggestionMode: 'fillNorm',
			archived: false,
			order: 0
		})
	],
	['customers/k1', customerCodec.toData({ id: 'k1', name: 'Kund A', archived: false, order: 0 })],
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

/** The valid document at the path. */
const validAt = (path: string): DocumentData => valid.find(([p]) => p === path)![1];

describe('only the owner', () => {
	it.each(valid)('can create, read and update %s', async (path, data) => {
		await allowed(createAny(owner(), path, data));
		await expect(assertSucceeds(getDoc(at(owner(), path)))).resolves.toBeDefined();
		// A free day is logged on every write; the others keep the fields that need a log.
		await allowed(
			path.startsWith('freeDays')
				? logged(owner(), path, data, true)
				: updateDoc(at(owner(), path), { ...data, ...updateMeta() })
		);
	});

	it('still takes an assignment and a receiver from a 1.0 client without the new fields', async () => {
		const old = without(assignmentCodec.toData(assignment()), 'employerId', 'customerId');
		await allowed(createAny(owner(), 'assignments/a1', old));
		await allowed(updateDoc(at(owner(), 'assignments/a1'), { ...old, ...updateMeta() }));
		const oldReceiver = without(receiverCodec.toData(receiver()), 'party');
		await allowed(createAny(owner(), 'assignments/a1/receivers/r1', oldReceiver));
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

	it('is refused in its own tree when signed in some other way than the login Worker', async () => {
		const anonymousSignIn = env
			.authenticatedContext(OWNER, { firebase: { sign_in_provider: 'anonymous', identities: {} } })
			.firestore() as unknown as Firestore;
		await denied(create(anonymousSignIn, 'entries/e1', validAt('entries/e1')));
		await env.withSecurityRulesDisabled((ctx) =>
			setDoc(doc(ctx.firestore(), 'users', OWNER, 'entries/e1'), { ...validAt('entries/e1') })
		);
		await denied(getDoc(at(anonymousSignIn, 'entries/e1')));
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
		[
			'an interval before 2020',
			'entries/e1',
			{ ...entryCodec.toData(work('2019-12-31', '08:00', '17:00')) }
		],
		[
			'an interval more than a year ahead',
			'entries/e1',
			{ ...entryCodec.toData(work('2028-01-10', '08:00', '17:00')) }
		],
		[
			'a timer that starts days ahead',
			'state/timer',
			timerCodec.toData({
				assignmentId: 'a1',
				subject: { kind: 'code', codeId: 'c1' },
				start: Date.now() + 3 * 86_400_000
			})
		],
		['a number as a name', 'assignments/a1', { ...assignmentCodec.toData(assignment()), name: 42 }],
		[
			'an employer id that is no id',
			'assignments/a1',
			{ ...assignmentCodec.toData(assignment()), employerId: 'g/1' }
		],
		[
			'an employer without a name',
			'employers/g1',
			{ name: '', suggestionMode: 'fillNorm', archived: false, order: 0 }
		],
		[
			'an employer with an unknown suggestion',
			'employers/g1',
			{ name: 'Exempelkonsult AB', suggestionMode: 'gissa', archived: false, order: 0 }
		],
		[
			'a customer with an extra field',
			'customers/k1',
			{ name: 'Kund A', archived: false, order: 0, pris: 1 }
		],
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
		[
			'month 13',
			'assignments/a1',
			{ ...assignmentCodec.toData(assignment()), startDate: '2026-13-01' }
		],
		['an id with an underscore', 'entries/e1', { ...entry, assignmentId: 'a_1' }],
		['an empty id', 'entries/e1', { ...entry, assignmentId: '' }],
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
			'a receiver linked to an unknown kind of party',
			'assignments/a1/receivers/r1',
			{ ...receiverCodec.toData(receiver()), party: { kind: 'mellanhand', id: 'm1' } }
		],
		[
			'a receiver linked without an id',
			'assignments/a1/receivers/r1',
			{ ...receiverCodec.toData(receiver()), party: { kind: 'customer', id: null } }
		],
		[
			'a receiver link with an extra key',
			'assignments/a1/receivers/r1',
			{ ...receiverCodec.toData(receiver()), party: { kind: 'customer', id: 'k1', namn: 'x' } }
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
			await createAny(owner(), path, data);
			await denied(deleteDoc(at(owner(), path)));
		}
	});
});

describe('the change log', () => {
	const log = logEntry;

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
		['with week 54', { week: '2026-W54' }],
		['with week 00', { week: '2026-W00' }],
		[
			'with a before of more than 50 fields',
			{ before: Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`f${i}`, i])) }
		],
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
		batch.set(
			at(db, `changeLog/${logId}`),
			logEntry({
				path: `reports/${id}`,
				action: 'unlock',
				before: { status: 'sent' },
				after: { status: r.status },
				reason: 'Fel kod på fredag',
				...logOverrides
			})
		);
		const data = reportCodec.toData({ ...r, lastChangeId: logId });
		// Sending sets the server's time; otherwise the stored snapshot stays.
		const snapshot =
			r.status === 'sent'
				? { ...data.snapshot, sentAt: serverTimestamp() }
				: (await getDoc(ref())).data()?.snapshot;
		batch.update(at(db, `reports/${id}`), { ...data, snapshot, ...updateMeta() });
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
		['a reason of only spaces', { reason: '   ' }],
		['another report’s path', { path: 'reports/a1_r2_2026-W48' }],
		['another week', { week: '2026-W47' }],
		['another action', { action: 'update' }],
		['no before', { before: null }],
		['no after', { after: null }]
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
			assertSucceeds(
				withLog({ ...sent(), status: 'unlocked', mode: 'actualQuarter' }, 'l2', {
					action: 'update'
				})
			)
		).resolves.toBeUndefined();
		await expect(
			assertSucceeds(withLog({ ...sent(), mode: 'actualQuarter' }, 'l3', { action: 'send' }))
		).resolves.toBeUndefined();
		expect((await getDoc(ref())).data()?.status).toBe('sent');
	});

	it('refuses a change to an unlocked report logged as a send', async () => {
		await sendIt();
		await withLog({ ...sent(), status: 'unlocked' }, 'l1');
		await denied(
			withLog({ ...sent(), status: 'unlocked', mode: 'actualQuarter' }, 'l2', { action: 'send' })
		);
	});

	it('refuses a send whose snapshot time is not the server’s', async () => {
		await saveReport(owner(), OWNER, id, draft());
		await denied(write(sent()));
		await sendIt();
		expect((await getDoc(ref())).data()?.snapshot.sentAt).toBeInstanceOf(Timestamp);
	});

	it('refuses deleting an unlocked report', async () => {
		await sendIt();
		await withLog({ ...sent(), status: 'unlocked' }, 'l1');
		await denied(deleteDoc(ref()));
	});
});

describe('changes that alter the flex (ADR 0016)', () => {
	const changed: [string, string, DocumentData, DocumentData][] = [
		['openingFlex', 'assignments/a1', assignmentCodec.toData(assignment()), { openingFlex: 120 }],
		[
			'startDate',
			'assignments/a1',
			assignmentCodec.toData(assignment()),
			{ startDate: '2026-02-01' }
		],
		['endDate', 'assignments/a1', assignmentCodec.toData(assignment()), { endDate: '2026-12-31' }],
		[
			'terms',
			'assignments/a1',
			assignmentCodec.toData(assignment()),
			{ terms: [{ from: '2026-01-01', scopePercent: 80, workdayMinutes: 480 }] }
		],
		[
			'counting',
			'absenceTypes/komp',
			validAt('absenceTypes/semester'),
			{ counting: 'flexWithdrawal' }
		],
		['position', 'assignments/a1/receivers/r1', receiverCodec.toData(receiver()), { position: 2 }]
	];

	it.each(changed)(
		'%s: refused without a new log entry, allowed with one',
		async (_, path, data, change) => {
			await createAny(owner(), path, data);
			await denied(updateDoc(at(owner(), path), { ...data, ...change, ...updateMeta() }));
			await allowed(logged(owner(), path, { ...data, ...change }, true));
			// The entry just written cannot be used again, to change the field back.
			const lastChangeId = (await getDoc(at(owner(), path))).data()?.lastChangeId as string;
			await denied(updateDoc(at(owner(), path), { ...data, lastChangeId, ...updateMeta() }));
		}
	);

	it.each([
		['another path', { path: 'assignments/a2' }],
		['a week', { week: '2026-W48' }],
		['another action', { action: 'create' }],
		['no before', { before: null }],
		['no after', { after: null }]
	])('refuses a logged change whose log entry has %s', async (_, overrides) => {
		const data = assignmentCodec.toData(assignment());
		await create(owner(), 'assignments/a1', data);
		await denied(logged(owner(), 'assignments/a1', { ...data, openingFlex: 60 }, true, overrides));
	});

	it('lets names, archiving and order change without a log entry', async () => {
		for (const [path, data, change] of [
			['assignments/a1', assignmentCodec.toData(assignment()), { name: 'Nytt namn', order: 2 }],
			['absenceTypes/semester', validAt('absenceTypes/semester'), { archived: true }],
			['assignments/a1/receivers/r1', receiverCodec.toData(receiver()), { name: 'Ny mottagare' }]
		] as [string, DocumentData, DocumentData][]) {
			await createAny(owner(), path, data);
			await allowed(updateDoc(at(owner(), path), { ...data, ...change, ...updateMeta() }));
		}
	});

	it('needs a log entry for a new receiver and every new or changed free day', async () => {
		await denied(create(owner(), 'assignments/a1/receivers/r2', receiverCodec.toData(receiver())));
		await allowed(logged(owner(), 'assignments/a1/receivers/r2', receiverCodec.toData(receiver())));
		const day = validAt('freeDays/2026-12-24');
		await denied(create(owner(), 'freeDays/2026-12-24', day));
		await allowed(logged(owner(), 'freeDays/2026-12-24', day));
		await denied(updateDoc(at(owner(), 'freeDays/2026-12-24'), { ...day, ...updateMeta() }));
		// Deleting a free day cannot name a log entry; the app logs it.
		await allowed(deleteDoc(at(owner(), 'freeDays/2026-12-24')));
	});

	it('lets a new assignment and a new absence type be created without a log entry', async () => {
		await allowed(create(owner(), 'assignments/a1', assignmentCodec.toData(assignment())));
		await allowed(create(owner(), 'absenceTypes/semester', validAt('absenceTypes/semester')));
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

	it('startTimer starts a timer, and never replaces one that runs', async () => {
		const db = owner();
		const timer = {
			assignmentId: 'a1',
			subject: { kind: 'code' as const, codeId: 'c1' },
			start: Date.UTC(2026, 10, 25, 7)
		};
		await startTimer(db, OWNER, timer);
		expect((await getDoc(at(db, 'state/timer'))).data()).toMatchObject({ assignmentId: 'a1' });
		await denied(startTimer(db, OWNER, { ...timer, start: timer.start + 3_600_000 }));
	});

	it('switchTimer writes the entry so far and goes on with the new code from its end', async () => {
		const db = owner();
		const timer = {
			assignmentId: 'a1',
			subject: { kind: 'code' as const, codeId: 'c1' },
			start: Date.UTC(2026, 10, 25, 7)
		};
		await startTimer(db, OWNER, timer);
		const switchAt = Date.UTC(2026, 10, 25, 9);
		const next = await switchTimer(
			db,
			OWNER,
			timer,
			{ assignmentId: 'a1', subject: { kind: 'code', codeId: 'c2' } },
			switchAt
		);
		expect(next).toEqual({
			assignmentId: 'a1',
			subject: { kind: 'code', codeId: 'c2' },
			start: switchAt
		});
		const stored = await getDoc(at(db, 'state/timer'));
		expect(timerCodec.fromData('timer', stored.data()!)).toEqual(next);
		const entry = await getDoc(at(db, `entries/timer-${timer.start}`));
		expect(entry.data()?.subject).toEqual({ kind: 'code', codeId: 'c1' });
		// A device that had not seen the change cannot switch the same timer again.
		await denied(
			switchTimer(
				db,
				OWNER,
				timer,
				{ assignmentId: 'a1', subject: { kind: 'code', codeId: 'c3' } },
				switchAt + 60_000
			)
		);
	});

	it('a stop or change of an older timer cannot remove the one another device started', async () => {
		const db = owner();
		const code = (codeId: string) => ({ kind: 'code' as const, codeId });
		const queued = { assignmentId: 'a1', subject: code('c1'), start: Date.UTC(2026, 10, 25, 7) };
		const other = { assignmentId: 'a1', subject: code('c2'), start: Date.UTC(2026, 10, 25, 8) };
		await startTimer(db, OWNER, other);
		await denied(stopTimer(db, OWNER, queued, Date.UTC(2026, 10, 25, 9)));
		await denied(
			switchTimer(
				db,
				OWNER,
				queued,
				{ assignmentId: 'a1', subject: code('c3') },
				Date.UTC(2026, 10, 25, 9)
			)
		);
		await denied(deleteDoc(at(db, 'state/timer')));
		expect(timerCodec.fromData('timer', (await getDoc(at(db, 'state/timer'))).data()!)).toEqual(
			other
		);
		expect((await getDocs(collection(db, 'users', OWNER, 'entries'))).size).toBe(0);
	});

	it('switchTimer within the first minute changes the code and keeps the start', async () => {
		const db = owner();
		const timer = {
			assignmentId: 'a1',
			subject: { kind: 'code' as const, codeId: 'c1' },
			start: Date.UTC(2026, 10, 25, 7)
		};
		await startTimer(db, OWNER, timer);
		const next = await switchTimer(
			db,
			OWNER,
			timer,
			{ assignmentId: 'a1', subject: { kind: 'code', codeId: 'c2' } },
			timer.start + 20_000
		);
		expect(next.start).toBe(timer.start);
		expect(timerCodec.fromData('timer', (await getDoc(at(db, 'state/timer'))).data()!)).toEqual(
			next
		);
		expect((await getDocs(collection(db, 'users', OWNER, 'entries'))).size).toBe(0);
	});

	it('saveEntry refuses to change an entry’s id', async () => {
		const e = work('2026-11-25', '08:00', '12:00');
		await expect(saveEntry(owner(), OWNER, e, { ...e, id: 'annan' }, [])).rejects.toThrow(
			'An entry keeps its id'
		);
	});

	it('stopTimer gives at least one minute when the clock is behind the start', async () => {
		const db = owner();
		const timer = {
			assignmentId: 'a1',
			subject: { kind: 'code' as const, codeId: 'c1' },
			start: Date.UTC(2026, 10, 25, 7)
		};
		await create(db, 'state/timer', timerCodec.toData(timer));
		const entry = await stopTimer(db, OWNER, timer, timer.start - 3_600_000);
		expect(entry.time).toMatchObject({ end: timer.start + 60_000 });
	});

	it('stopTimer stops a timer left running for days, as 24 hours, logged in a sent week', async () => {
		const db = owner();
		const saved = await saveReport(db, OWNER, id, sent());
		const timer = {
			assignmentId: 'a1',
			subject: { kind: 'code' as const, codeId: 'c1' },
			start: Date.UTC(2026, 10, 23, 7)
		};
		await create(db, 'state/timer', timerCodec.toData(timer));
		const entry = await stopTimer(db, OWNER, timer, Date.UTC(2026, 10, 27, 7), [saved!]);
		expect(entry.time).toMatchObject({ end: timer.start + 24 * 3_600_000 });
		const logs = await getDocs(collection(db, 'users', OWNER, 'changeLog'));
		expect(logs.docs.map((d) => d.data().path)).toEqual([`entries/${entry.id}`]);
	});
});

describe('the settings’ writes pass the rules (issue 17)', () => {
	const logCount = async (db: Firestore) =>
		(await getDocs(collection(db, 'users', OWNER, 'changeLog'))).size;

	it('saveAssignment creates, changes the name freely and logs a changed balance', async () => {
		const db = owner();
		const a = assignment();
		await allowed(saveAssignment(db, OWNER, null, a, [{ before: null, after: code('c1') }]));
		await allowed(saveAssignment(db, OWNER, a, { ...a, name: 'Nytt namn', archived: true }));
		expect(await logCount(db)).toBe(0);
		const named = { ...a, name: 'Nytt namn', archived: true };
		await allowed(
			saveAssignment(db, OWNER, named, {
				...named,
				openingFlex: 270,
				terms: [...a.terms, { from: '2026-11-26', scopePercent: 80, workdayMinutes: 480 }]
			})
		);
		expect(await logCount(db)).toBe(1);
		const saved = await getDoc(at(db, 'assignments/a1'));
		expect(saved.data()).toMatchObject({ openingFlex: 270, name: 'Nytt namn' });
		expect((await getDoc(at(db, 'assignments/a1/codes/c1'))).exists()).toBe(true);
	});

	it('saveReceiver logs a new receiver and a moved one, not a new mapping', async () => {
		const db = owner();
		const r = receiver();
		await allowed(saveReceiver(db, OWNER, null, r));
		await allowed(saveReceiver(db, OWNER, r, { ...r, mapping: {} }));
		await allowed(saveReceiver(db, OWNER, r, { ...r, position: 2 }));
		expect(await logCount(db)).toBe(2);
	});

	it('saves employers and customers, and a new assignment with its receivers (ADR 0019)', async () => {
		const db = owner();
		const employer = {
			id: 'g1',
			name: 'Exempelkonsult AB',
			suggestionMode: 'fillNorm' as const,
			archived: false,
			order: 0
		};
		const customer = { id: 'k1', name: 'Kund A', archived: false, order: 0 };
		await allowed(saveEmployer(db, OWNER, null, employer));
		await allowed(saveEmployer(db, OWNER, employer, { ...employer, name: 'Nytt namn' }));
		await allowed(saveCustomer(db, OWNER, null, customer));
		await allowed(saveCustomer(db, OWNER, customer, { ...customer, name: 'Kund B' }));
		expect(await logCount(db)).toBe(0);
		const a = assignment({ employerId: 'g1', customerId: 'k1' });
		await allowed(
			saveAssignment(
				db,
				OWNER,
				null,
				a,
				[{ before: null, after: code('c1') }],
				[
					receiver({ id: 'r1', party: { kind: 'employer', id: 'g1' } }),
					receiver({ id: 'r2', position: 2, party: { kind: 'customer', id: 'k1' } })
				]
			)
		);
		expect(await logCount(db)).toBe(2);
		expect((await getDoc(at(db, 'assignments/a1/receivers/r2'))).data()).toMatchObject({
			party: { kind: 'customer', id: 'k1' }
		});
	});

	it('creates the default absence types once, and logs a changed counting', async () => {
		const db = owner();
		await expect(ensureDefaultAbsenceTypes(db, OWNER)).resolves.toBe(6);
		await expect(ensureDefaultAbsenceTypes(db, OWNER)).resolves.toBe(0);
		const semester = absenceTypeCodec.fromData(
			'semester',
			(await getDoc(at(db, 'absenceTypes/semester'))).data()!
		);
		await allowed(saveAbsenceType(db, OWNER, semester, { ...semester, name: 'Ledighet' }));
		await allowed(saveAbsenceType(db, OWNER, semester, { ...semester, counting: 'worked' }));
		expect(await logCount(db)).toBe(1);
	});

	it('saveFreeDay creates, renames, moves and removes a day, logging each', async () => {
		const db = owner();
		const day = { date: '2027-05-07', free: true, name: 'Klämdag' };
		await allowed(saveFreeDay(db, OWNER, null, day));
		await allowed(saveFreeDay(db, OWNER, day, { ...day, name: 'Ledig' }));
		const moved = { ...day, name: 'Ledig', date: '2027-05-14' };
		await allowed(saveFreeDay(db, OWNER, { ...day, name: 'Ledig' }, moved));
		await allowed(saveFreeDay(db, OWNER, moved, null));
		await allowed(
			saveFreeDay(db, OWNER, null, { date: '2026-12-24', free: false, name: 'Julafton' })
		);
		expect(await logCount(db)).toBe(6);
		expect(
			(await getDocs(collection(db, 'users', OWNER, 'freeDays'))).docs.map((d) => d.id)
		).toEqual(['2026-12-24']);
	});
});

describe('the budget status (issue 28)', () => {
	const budget = (db: Firestore) => doc(db, 'system', 'budget');
	const status = {
		percent: 92,
		cost: 92,
		budget: 100,
		currency: 'SEK',
		month: '2026-11',
		schemaVersion: 1,
		updatedAt: Timestamp.now()
	};
	const seed = () =>
		env.withSecurityRulesDisabled((ctx) =>
			setDoc(doc(ctx.firestore(), 'system', 'budget'), status)
		);

	it('can be read by the signed-in user', async () => {
		await seed();
		await expect(assertSucceeds(getDoc(budget(owner())))).resolves.toBeDefined();
	});

	it('cannot be created, changed or deleted by the user', async () => {
		await denied(setDoc(budget(owner()), status));
		await seed();
		await denied(updateDoc(budget(owner()), { percent: 10 }));
		await denied(deleteDoc(budget(owner())));
	});

	it('cannot be read signed out or signed in some other way than the login Worker', async () => {
		await seed();
		const anonymousSignIn = env
			.authenticatedContext(OTHER, { firebase: { sign_in_provider: 'anonymous', identities: {} } })
			.firestore() as unknown as Firestore;
		await denied(getDoc(budget(anonymousSignIn)));
		await denied(getDoc(budget(anonymous())));
	});
});
