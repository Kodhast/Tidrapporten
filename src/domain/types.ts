// Domain types from ADR 0012 (docs/beslut/0012-datamodell.md). Keep them in step with the ADR;
// schemaVersion, createdAt and updatedAt belong to the data layer in src/data/, not here.

export type Id = string;
export type UtcMillis = number; // instant, UTC
export type IsoDate = string; // 'YYYY-MM-DD', calendar day in Europe/Stockholm
export type IsoWeek = string; // 'YYYY-Www', ISO week in Europe/Stockholm
export type Minutes = number; // whole minutes
export type ClockTime = string; // 'HH:MM', Europe/Stockholm

export interface Assignment {
	id: Id;
	name: string;
	startDate: IsoDate; // flex is counted from this day
	endDate: IsoDate | null;
	terms: AssignmentTerms[]; // sorted by `from`, the first one starts at startDate
	openingFlex: Minutes; // signed, balance at startDate
	standardDay: StandardDaySlot[];
	archived: boolean;
	order: number;
	employerId: Id | null; // ADR 0019; null for assignments from before it
	customerId: Id | null; // null: an internal assignment, or one from before ADR 0019
}

/** The owner's employer (ADR 0019); one employer can have several assignments. */
export interface Employer {
	id: Id;
	name: string;
	suggestionMode: SuggestionMode; // for the employer's report in a new assignment
	archived: boolean;
	order: number;
	/** The employment's periods (ADR 0021), edge to edge; empty for employers from before it. */
	terms: AssignmentTerms[];
	endDate: IsoDate | null;
	openingFlex: Minutes; // signed, the employment's balance at the start of terms[0].from's week
}

/** A customer (ADR 0019); free of the employers, so one customer can come via several. */
export interface Customer {
	id: Id;
	name: string;
	archived: boolean;
	order: number;
}

export interface AssignmentTerms {
	from: IsoDate;
	scopePercent: number; // 0–100; 0 is a break (ADR 0021)
	workdayMinutes: Minutes; // full-time workday, 480 by default
}

export interface StandardDaySlot {
	start: ClockTime;
	end: ClockTime;
	codeId: Id;
}

export interface TimeCode {
	id: Id;
	assignmentId: Id;
	name: string;
	billable: boolean;
	archived: boolean;
	order: number;
}

export type SuggestionMode = 'fillNorm' | 'actualQuarter';

export interface Receiver {
	id: Id;
	assignmentId: Id;
	name: string;
	position: number; // 1 = first in the chain, counts for flex
	suggestionMode: SuggestionMode;
	codes: ReceiverCode[]; // in the receiver's order
	mapping: Record<Id, Id>; // internal code or absence type id -> receiver code id
	archived: boolean;
	/** The employer or customer the receiver was made from (ADR 0019); null for anyone else. */
	party: ReceiverParty | null;
}

export interface ReceiverParty {
	kind: 'employer' | 'customer';
	id: Id;
}

export interface ReceiverCode {
	id: Id;
	name: string;
}

export type AbsenceCounting = 'fillsNorm' | 'flexWithdrawal' | 'worked';

export interface AbsenceType {
	id: Id;
	name: string;
	counting: AbsenceCounting;
	archived: boolean;
	order: number;
}

export interface FreeDay {
	date: IsoDate;
	free: boolean; // true = extra day off, false = a default day off (an eve) is worked
	name: string;
}

export type EntrySubject = { kind: 'code'; codeId: Id } | { kind: 'absence'; absenceTypeId: Id };

export type EntryTime =
	| { kind: 'interval'; start: UtcMillis; end: UtcMillis } // end > start, at most 24 h
	| { kind: 'allDay'; date: IsoDate }; // only for absence

export interface Entry {
	id: Id;
	assignmentId: Id;
	subject: EntrySubject;
	time: EntryTime;
	note: string; // at most 500 characters
}

export interface Timer {
	assignmentId: Id;
	subject: EntrySubject;
	start: UtcMillis;
}

export interface PauseMark {
	date: IsoDate;
}

export type ReportStatus = 'draft' | 'sent' | 'unlocked';

export interface ReportLine {
	receiverCodeId: Id;
	minutesPerDay: [Minutes, Minutes, Minutes, Minutes, Minutes, Minutes, Minutes]; // Mon–Sun
}

export interface ReportSnapshot {
	sentAt: UtcMillis;
	assignmentName: string;
	receiverName: string;
	codeNames: Record<Id, string>;
	actualMinutes: Minutes; // actual time for the week when it was sent
}

export interface Report {
	id: Id; // `${assignmentId}_${receiverId}_${week}`
	assignmentId: Id;
	receiverId: Id;
	week: IsoWeek;
	status: ReportStatus;
	mode: SuggestionMode;
	lines: ReportLine[];
	snapshot: ReportSnapshot | null; // set when sent
	lastChangeId: Id | null; // the changeLog entry written with the latest locked change
}

export type ChangeAction = 'create' | 'update' | 'delete' | 'send' | 'unlock' | 'restore';

export interface ChangeLogEntry {
	id: Id;
	at: UtcMillis;
	path: string; // e.g. 'reports/a1_r1_2026-W48'
	action: ChangeAction;
	week: IsoWeek | null;
	before: Record<string, unknown> | null;
	after: Record<string, unknown> | null;
	reason: string;
	by: 'app' | 'claude';
}

export interface Settings {
	noTimerBy: ClockTime | null; // reminder: no timer running, default '09:30'
	timerRunningAt: ClockTime | null; // reminder: timer still running, default '19:00'
	remindEmptyDay: boolean;
	reportReminderFridayAt: ClockTime | null; // default '15:00'
	flexWarning: Minutes; // default 1200 (±20 h)
}

export interface Device {
	id: Id;
	fcmToken: string;
	label: string;
}
