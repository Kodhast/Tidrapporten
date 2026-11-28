// Made-up data for the domain tests. Imported only by tests; nothing here is real.
import { atLocalTime } from './tid.ts';
import type {
	AbsenceType,
	Assignment,
	ClockTime,
	Customer,
	Employer,
	Entry,
	Id,
	IsoDate,
	IsoWeek,
	Minutes,
	Receiver,
	Report,
	ReportStatus,
	TimeCode,
	UtcMillis
} from './types.ts';

export const at = (date: IsoDate, time: ClockTime): UtcMillis => atLocalTime(date, time);

/** `'8:30'` → 510, `'−6:30'` → −390. */
export const hm = (text: string): Minutes => {
	const negative = text.startsWith('-') || text.startsWith('−');
	const [hours, minutes] = text
		.replace(/^[-−+]/, '')
		.split(':')
		.map(Number) as [number, number];
	return (negative ? -1 : 1) * (hours * 60 + minutes);
};

export const assignment = (overrides: Partial<Assignment> = {}): Assignment => ({
	id: 'a1',
	name: 'Exempeluppdraget',
	startDate: '2026-01-01',
	endDate: null,
	terms: [{ from: '2026-01-01', scopePercent: 100, workdayMinutes: 480 }],
	openingFlex: 0,
	standardDay: [],
	archived: false,
	order: 0,
	employerId: null,
	customerId: null,
	...overrides
});

export const code = (id: Id, overrides: Partial<TimeCode> = {}): TimeCode => ({
	id,
	assignmentId: 'a1',
	name: `Kod ${id}`,
	billable: true,
	archived: false,
	order: 0,
	...overrides
});

export const absenceTypes: AbsenceType[] = [
	{ id: 'semester', name: 'Semester', counting: 'fillsNorm', archived: false, order: 0 },
	{ id: 'komptid', name: 'Komptid', counting: 'flexWithdrawal', archived: false, order: 1 },
	{ id: 'utbildning', name: 'Utbildning', counting: 'worked', archived: false, order: 2 }
];

let nextId = 0;

export const work = (
	date: IsoDate,
	start: ClockTime,
	end: ClockTime,
	codeId: Id = 'c1',
	endDate: IsoDate = date
): Entry => ({
	id: `e${++nextId}`,
	assignmentId: 'a1',
	subject: { kind: 'code', codeId },
	time: { kind: 'interval', start: at(date, start), end: at(endDate, end) },
	note: ''
});

/** Work of a given length starting at 08:00. */
export const workFor = (date: IsoDate, length: string, codeId: Id = 'c1'): Entry => {
	const start = at(date, '08:00');
	return {
		...work(date, '08:00', '08:00', codeId),
		time: { kind: 'interval', start, end: start + hm(length) * 60_000 }
	};
};

export const absentAllDay = (date: IsoDate, absenceTypeId: Id): Entry => ({
	id: `e${++nextId}`,
	assignmentId: 'a1',
	subject: { kind: 'absence', absenceTypeId },
	time: { kind: 'allDay', date },
	note: ''
});

export const absentBetween = (
	date: IsoDate,
	start: ClockTime,
	end: ClockTime,
	absenceTypeId: Id
): Entry => ({
	...absentAllDay(date, absenceTypeId),
	time: { kind: 'interval', start: at(date, start), end: at(date, end) }
});

export const receiver = (overrides: Partial<Receiver> = {}): Receiver => ({
	id: 'r1',
	assignmentId: 'a1',
	name: 'Mottagare ett',
	position: 1,
	suggestionMode: 'fillNorm',
	codes: [
		{ id: 'R-arbete', name: 'Arbete' },
		{ id: 'R-ledigt', name: 'Frånvaro' }
	],
	mapping: {
		c1: 'R-arbete',
		c2: 'R-arbete',
		semester: 'R-ledigt',
		komptid: 'R-ledigt',
		utbildning: 'R-arbete'
	},
	archived: false,
	party: null,
	...overrides
});

export const report = (
	week: IsoWeek,
	status: ReportStatus,
	minutesPerDay: number[],
	receiverId: Id = 'r1'
): Report => ({
	id: `a1_${receiverId}_${week}`,
	assignmentId: 'a1',
	receiverId,
	week,
	status,
	mode: 'fillNorm',
	lines: [
		{
			receiverCodeId: 'R-arbete',
			minutesPerDay: minutesPerDay as Report['lines'][number]['minutesPerDay']
		}
	],
	snapshot: null,
	lastChangeId: null
});

export const employer = (overrides: Partial<Employer> = {}): Employer => ({
	id: 'g1',
	name: 'Exempelkonsult AB',
	suggestionMode: 'fillNorm',
	archived: false,
	order: 0,
	terms: [],
	endDate: null,
	openingFlex: 0,
	...overrides
});

export const customer = (overrides: Partial<Customer> = {}): Customer => ({
	id: 'k1',
	name: 'Kund A',
	archived: false,
	order: 0,
	...overrides
});
