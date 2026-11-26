// The one place where domain types become Firestore documents and back (ADR 0012). Ids and the
// parent assignment come from the path, not from the document.
import type { DocumentData } from 'firebase/firestore';
import type {
	AbsenceType,
	Assignment,
	AssignmentTerms,
	ChangeLogEntry,
	Device,
	Entry,
	EntrySubject,
	EntryTime,
	FreeDay,
	Id,
	PauseMark,
	Receiver,
	ReceiverCode,
	Report,
	ReportLine,
	ReportSnapshot,
	Settings,
	StandardDaySlot,
	TimeCode,
	Timer
} from '../domain/types.ts';
import {
	asRecord,
	bool,
	int,
	list,
	millis,
	oneOf,
	str,
	stringMap,
	strOrNull,
	timestamp,
	without
} from './kodning.ts';

/**
 * Settings whose changes alter the flex of weeks already counted carry the id of the changeLog
 * entry written with the latest such change (ADR 0016). The domain does not need it, so a plain
 * write stores null and a logged write sets it.
 */
const NO_LOG = { lastChangeId: null };

export interface Codec<T> {
	/** The document's own fields, without schemaVersion, createdAt and updatedAt. */
	toData(value: T): DocumentData;
	/** The value from a document; `parentId` is the assignment for codes and receivers. */
	fromData(id: Id, data: DocumentData, parentId?: Id): T;
}

const terms = (value: unknown): AssignmentTerms => {
	const t = asRecord(value);
	return {
		from: str(t.from),
		scopePercent: int(t.scopePercent, 100),
		workdayMinutes: int(t.workdayMinutes, 480)
	};
};

const slot = (value: unknown): StandardDaySlot => {
	const s = asRecord(value);
	return { start: str(s.start), end: str(s.end), codeId: str(s.codeId) };
};

export const assignmentCodec: Codec<Assignment> = {
	toData: (value) => ({ ...without(value, 'id'), ...NO_LOG }),
	fromData: (id, d) => ({
		id,
		name: str(d.name),
		startDate: str(d.startDate),
		endDate: strOrNull(d.endDate),
		terms: list(d.terms).map(terms),
		openingFlex: int(d.openingFlex),
		standardDay: list(d.standardDay).map(slot),
		archived: bool(d.archived),
		order: int(d.order)
	})
};

export const codeCodec: Codec<TimeCode> = {
	toData: (value) => without(value, 'id', 'assignmentId'),
	fromData: (id, d, parentId = '') => ({
		id,
		assignmentId: parentId,
		name: str(d.name),
		billable: bool(d.billable, true),
		archived: bool(d.archived),
		order: int(d.order)
	})
};

const receiverCode = (value: unknown): ReceiverCode => {
	const c = asRecord(value);
	return { id: str(c.id), name: str(c.name) };
};

export const receiverCodec: Codec<Receiver> = {
	toData: (value) => ({ ...without(value, 'id', 'assignmentId'), ...NO_LOG }),
	fromData: (id, d, parentId = '') => ({
		id,
		assignmentId: parentId,
		name: str(d.name),
		position: int(d.position, 1),
		suggestionMode: oneOf(d.suggestionMode, ['fillNorm', 'actualQuarter'], 'fillNorm'),
		codes: list(d.codes).map(receiverCode),
		mapping: stringMap(d.mapping),
		archived: bool(d.archived)
	})
};

export const absenceTypeCodec: Codec<AbsenceType> = {
	toData: (value) => ({ ...without(value, 'id'), ...NO_LOG }),
	fromData: (id, d) => ({
		id,
		name: str(d.name),
		counting: oneOf(d.counting, ['fillsNorm', 'flexWithdrawal', 'worked'], 'fillsNorm'),
		archived: bool(d.archived),
		order: int(d.order)
	})
};

export const freeDayCodec: Codec<FreeDay> = {
	toData: (value) => ({ ...without(value, 'date'), ...NO_LOG }),
	fromData: (id, d) => ({ date: id, free: bool(d.free, true), name: str(d.name) })
};

const subjectToData = (subject: EntrySubject): DocumentData => ({ ...subject });

const subjectFromData = (value: unknown): EntrySubject => {
	const s = asRecord(value);
	return s.kind === 'absence'
		? { kind: 'absence', absenceTypeId: str(s.absenceTypeId) }
		: { kind: 'code', codeId: str(s.codeId) };
};

const timeToData = (time: EntryTime): DocumentData =>
	time.kind === 'interval'
		? { kind: 'interval', start: timestamp(time.start), end: timestamp(time.end) }
		: { kind: 'allDay', date: time.date };

const timeFromData = (value: unknown): EntryTime => {
	const t = asRecord(value);
	return t.kind === 'allDay'
		? { kind: 'allDay', date: str(t.date) }
		: { kind: 'interval', start: millis(t.start), end: millis(t.end) };
};

export const entryCodec: Codec<Entry> = {
	toData: (e) => ({
		assignmentId: e.assignmentId,
		subject: subjectToData(e.subject),
		time: timeToData(e.time),
		note: e.note
	}),
	fromData: (id, d) => ({
		id,
		assignmentId: str(d.assignmentId),
		subject: subjectFromData(d.subject),
		time: timeFromData(d.time),
		note: str(d.note)
	})
};

export const timerCodec: Codec<Timer> = {
	toData: (t) => ({
		assignmentId: t.assignmentId,
		subject: subjectToData(t.subject),
		start: timestamp(t.start)
	}),
	fromData: (_id, d) => ({
		assignmentId: str(d.assignmentId),
		subject: subjectFromData(d.subject),
		start: millis(d.start)
	})
};

export const pauseCodec: Codec<PauseMark> = {
	toData: () => ({}),
	fromData: (id) => ({ date: id })
};

const line = (value: unknown): ReportLine => {
	const l = asRecord(value);
	const days = list(l.minutesPerDay).map((m) => int(m));
	return {
		receiverCodeId: str(l.receiverCodeId),
		minutesPerDay: Array.from({ length: 7 }, (_, i) => days[i] ?? 0) as ReportLine['minutesPerDay']
	};
};

const snapshotToData = (s: ReportSnapshot): DocumentData => ({ ...s, sentAt: timestamp(s.sentAt) });

const snapshotFromData = (value: unknown): ReportSnapshot | null => {
	if (value === null || typeof value !== 'object') return null;
	const s = asRecord(value);
	return {
		sentAt: millis(s.sentAt),
		assignmentName: str(s.assignmentName),
		receiverName: str(s.receiverName),
		codeNames: stringMap(s.codeNames),
		actualMinutes: int(s.actualMinutes)
	};
};

export const reportId = (assignmentId: Id, receiverId: Id, week: string): Id =>
	`${assignmentId}_${receiverId}_${week}`;

export const reportCodec: Codec<Report> = {
	toData: (value) => ({
		...without(value, 'id'),
		snapshot: value.snapshot ? snapshotToData(value.snapshot) : null
	}),
	fromData: (id, d) => ({
		id,
		assignmentId: str(d.assignmentId),
		receiverId: str(d.receiverId),
		week: str(d.week),
		// An unknown status is read as sent, the state that allows the least.
		status: oneOf(d.status, ['draft', 'sent', 'unlocked'], 'sent'),
		mode: oneOf(d.mode, ['fillNorm', 'actualQuarter'], 'fillNorm'),
		lines: list(d.lines).map(line),
		snapshot: snapshotFromData(d.snapshot),
		lastChangeId: strOrNull(d.lastChangeId)
	})
};

const plainMap = (value: unknown): Record<string, unknown> | null =>
	value === null || typeof value !== 'object' || Array.isArray(value) ? null : asRecord(value);

/** `at` is written by the data layer as the server time, so toData leaves it out. */
export const changeLogCodec: Codec<ChangeLogEntry> = {
	toData: (value) => without(value, 'id', 'at'),
	fromData: (id, d) => ({
		id,
		at: millis(d.at),
		path: str(d.path),
		action: oneOf(d.action, ['create', 'update', 'delete', 'send', 'unlock', 'restore'], 'update'),
		week: strOrNull(d.week),
		before: plainMap(d.before),
		after: plainMap(d.after),
		reason: str(d.reason),
		by: oneOf(d.by, ['app', 'claude'], 'app')
	})
};

export const DEFAULT_SETTINGS: Settings = {
	noTimerBy: '09:30',
	timerRunningAt: '19:00',
	remindEmptyDay: true,
	reportReminderFridayAt: '15:00',
	flexWarning: 1200
};

const clockOrNull = (value: unknown, fallback: string | null): string | null =>
	value === null ? null : typeof value === 'string' ? value : fallback;

export const settingsCodec: Codec<Settings> = {
	toData: (s) => ({ ...s }),
	fromData: (_id, d) => ({
		noTimerBy: clockOrNull(d.noTimerBy, DEFAULT_SETTINGS.noTimerBy),
		timerRunningAt: clockOrNull(d.timerRunningAt, DEFAULT_SETTINGS.timerRunningAt),
		remindEmptyDay: bool(d.remindEmptyDay, DEFAULT_SETTINGS.remindEmptyDay),
		reportReminderFridayAt: clockOrNull(
			d.reportReminderFridayAt,
			DEFAULT_SETTINGS.reportReminderFridayAt
		),
		flexWarning: int(d.flexWarning, DEFAULT_SETTINGS.flexWarning)
	})
};

export const deviceCodec: Codec<Device> = {
	toData: (value) => without(value, 'id'),
	fromData: (id, d) => ({ id, fcmToken: str(d.fcmToken), label: str(d.label) })
};
