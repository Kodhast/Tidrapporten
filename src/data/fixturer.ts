// Made-up documents with every field set, for the round trips in dokument.test.ts and
// export.test.ts. Test data only.
import { Timestamp } from 'firebase/firestore';
import { absentAllDay, assignment, code, receiver, report, work } from '../domain/testdata.ts';
import type { ChangeLogEntry, Settings, Timer } from '../domain/types.ts';
import {
	absenceTypeCodec,
	assignmentCodec,
	codeCodec,
	type Codec,
	customerCodec,
	employerCodec,
	DEFAULT_SETTINGS,
	deviceCodec,
	entryCodec,
	freeDayCodec,
	pauseCodec,
	receiverCodec,
	reportCodec,
	settingsCodec,
	timerCodec
} from './dokument.ts';

export const sent = {
	...report('2026-W48', 'sent', [480, 480, 480, 480, 480, 0, 0]),
	snapshot: {
		sentAt: Date.UTC(2026, 10, 27, 14, 0),
		assignmentName: 'Exempeluppdraget',
		receiverName: 'Mottagare ett',
		codeNames: { 'R-arbete': 'Arbete' },
		actualMinutes: 2490
	},
	lastChangeId: 'logg-1'
};

export const logEntry: ChangeLogEntry = {
	id: 'logg-1',
	at: 0,
	path: 'reports/a1_r1_2026-W48',
	action: 'unlock',
	week: '2026-W48',
	before: { status: 'sent' },
	after: { status: 'unlocked' },
	reason: 'Fel kod på fredag',
	by: 'app'
};

export const timer: Timer = {
	assignmentId: 'a1',
	subject: { kind: 'code', codeId: 'c1' },
	start: Date.UTC(2026, 10, 25, 7, 0)
};

export const settings: Settings = { ...DEFAULT_SETTINGS, noTimerBy: null, flexWarning: 600 };

// [name, codec, value, id, parent id]
export const roundTrips: [string, Codec<never>, unknown, string, string?][] = [
	[
		'assignment',
		assignmentCodec as Codec<never>,
		assignment({
			endDate: '2026-12-31',
			standardDay: [{ start: '08:00', end: '17:00', codeId: 'c1' }],
			employerId: 'g1',
			customerId: 'k1'
		}),
		'a1'
	],
	[
		'employer',
		employerCodec as Codec<never>,
		{
			id: 'g1',
			name: 'Exempelkonsult AB',
			suggestionMode: 'actualQuarter',
			archived: true,
			order: 2,
			terms: [
				{ from: '2026-01-05', scopePercent: 100, workdayMinutes: 480 },
				{ from: '2026-09-01', scopePercent: 80, workdayMinutes: 465 }
			],
			endDate: '2027-03-31',
			openingFlex: -150
		},
		'g1'
	],
	[
		'customer',
		customerCodec as Codec<never>,
		{ id: 'k1', name: 'Kund A', archived: true, order: 1 },
		'k1'
	],
	['time code', codeCodec as Codec<never>, code('c1', { billable: false, order: 2 }), 'c1', 'a1'],
	[
		'receiver',
		receiverCodec as Codec<never>,
		receiver({ party: { kind: 'customer', id: 'k1' } }),
		'r1',
		'a1'
	],
	[
		'absence type',
		absenceTypeCodec as Codec<never>,
		{ id: 'komptid', name: 'Komptid', counting: 'flexWithdrawal', archived: false, order: 1 },
		'komptid'
	],
	[
		'free day',
		freeDayCodec as Codec<never>,
		{ date: '2026-12-24', free: false, name: 'Julafton' },
		'2026-12-24'
	],
	[
		'interval entry',
		entryCodec as Codec<never>,
		{ ...work('2026-11-25', '08:00', '17:00'), id: 'e1', note: 'Möte' },
		'e1'
	],
	[
		'whole-day entry',
		entryCodec as Codec<never>,
		{ ...absentAllDay('2026-11-25', 'semester'), id: 'e2' },
		'e2'
	],
	['timer', timerCodec as Codec<never>, timer, 'timer'],
	['pause', pauseCodec as Codec<never>, { date: '2026-11-25' }, '2026-11-25'],
	[
		'draft report',
		reportCodec as Codec<never>,
		report('2026-W48', 'draft', [60, 0, 0, 0, 0, 0, 0]),
		'a1_r1_2026-W48'
	],
	['sent report', reportCodec as Codec<never>, sent, 'a1_r1_2026-W48'],
	['settings', settingsCodec as Codec<never>, settings, 'settings'],
	['device', deviceCodec as Codec<never>, { id: 'd1', fcmToken: 'token-1', label: 'Telefon' }, 'd1']
];

/** What Firestore gives back: the stored fields plus the common ones. */
export const stored = (data: object) => ({
	...data,
	schemaVersion: 1,
	createdAt: Timestamp.fromMillis(0),
	updatedAt: Timestamp.fromMillis(0)
});
