import { Timestamp } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import { assignment, code, receiver, work } from '../domain/testdata.ts';
import {
	absenceTypeCodec,
	assignmentCodec,
	changeLogCodec,
	codeCodec,
	type Codec,
	DEFAULT_SETTINGS,
	deviceCodec,
	entryCodec,
	freeDayCodec,
	receiverCodec,
	reportCodec,
	reportId,
	settingsCodec,
	timerCodec
} from './dokument.ts';
import { logEntry, roundTrips, sent, stored } from './fixturer.ts';
import { createMeta, updateMeta, without } from './kodning.ts';

describe('round trip domain → document → domain', () => {
	it.each(roundTrips)('%s', (_, codec, value, id, parent) => {
		const data = codec.toData(value as never);
		expect(codec.fromData(id, stored(data), parent)).toEqual(value);
	});

	it('change log, whose time the server sets', () => {
		const data = changeLogCodec.toData(logEntry);
		expect(data).not.toHaveProperty('at');
		const back = changeLogCodec.fromData('logg-1', {
			...stored(data),
			at: Timestamp.fromMillis(1_000)
		});
		expect(back).toEqual({ ...logEntry, at: 1_000 });
	});
});

describe('stored documents', () => {
	it('keep ids and parents in the path, not in the document', () => {
		expect(codeCodec.toData(code('c1'))).not.toHaveProperty('id');
		expect(codeCodec.toData(code('c1'))).not.toHaveProperty('assignmentId');
		expect(freeDayCodec.toData({ date: '2026-12-24', free: true, name: 'X' })).toEqual({
			free: true,
			name: 'X',
			lastChangeId: null
		});
	});

	it('write the settings that alter the flex without a log entry, and read past the field', () => {
		const data = assignmentCodec.toData(assignment());
		expect(data.lastChangeId).toBeNull();
		expect(receiverCodec.toData(receiver()).lastChangeId).toBeNull();
		expect(assignmentCodec.fromData('a1', stored({ ...data, lastChangeId: 'logg-1' }))).toEqual(
			assignment()
		);
	});

	it('store instants as Firestore timestamps', () => {
		const data = entryCodec.toData(work('2026-11-25', '08:00', '09:00'));
		expect(data.time.start).toBeInstanceOf(Timestamp);
		expect(reportCodec.toData(sent).snapshot.sentAt).toBeInstanceOf(Timestamp);
	});

	it('get schemaVersion and server times from the meta helpers', () => {
		expect(createMeta()).toMatchObject({ schemaVersion: 1 });
		expect(Object.keys(createMeta()).sort()).toEqual(['createdAt', 'schemaVersion', 'updatedAt']);
		expect(Object.keys(updateMeta()).sort()).toEqual(['schemaVersion', 'updatedAt']);
	});

	it('build the report id from assignment, receiver and week', () => {
		expect(reportId('a1', 'r1', '2026-W48')).toBe('a1_r1_2026-W48');
	});

	it('copy without the given keys and leave the original', () => {
		const value = { id: 'x', name: 'y' };
		expect(without(value, 'id')).toEqual({ name: 'y' });
		expect(value).toEqual({ id: 'x', name: 'y' });
	});
});

describe('tolerant reading', () => {
	it('ignores unknown fields', () => {
		const data = { ...assignmentCodec.toData(assignment()), color: 'blue', schemaVersion: 2 };
		expect(assignmentCodec.fromData('a1', data)).toEqual(assignment());
	});

	it.each([
		['assignment', assignmentCodec as Codec<never>],
		['code', codeCodec as Codec<never>],
		['receiver', receiverCodec as Codec<never>],
		['absence type', absenceTypeCodec as Codec<never>],
		['free day', freeDayCodec as Codec<never>],
		['entry', entryCodec as Codec<never>],
		['timer', timerCodec as Codec<never>],
		['report', reportCodec as Codec<never>],
		['change log', changeLogCodec as Codec<never>],
		['settings', settingsCodec as Codec<never>],
		['device', deviceCodec as Codec<never>]
	])('reads an empty %s document with defaults', (_, codec) => {
		expect(() => codec.fromData('x', {}, 'a1')).not.toThrow();
	});

	it('fills in the defaults the domain expects', () => {
		expect(settingsCodec.fromData('settings', {})).toEqual(DEFAULT_SETTINGS);
		expect(receiverCodec.fromData('r1', {}, 'a1')).toMatchObject({
			assignmentId: 'a1',
			position: 1,
			suggestionMode: 'fillNorm',
			codes: [],
			mapping: {}
		});
		expect(freeDayCodec.fromData('2026-05-15', {})).toEqual({
			date: '2026-05-15',
			free: true,
			name: ''
		});
	});

	it('reads an unknown report status as sent, the state that allows least', () => {
		expect(reportCodec.fromData('x', { status: 'archived' }).status).toBe('sent');
	});

	it('replaces malformed values instead of failing', () => {
		const back = assignmentCodec.fromData('a1', {
			name: 42,
			terms: 'all',
			openingFlex: 'many',
			archived: 'yes'
		});
		expect(back).toMatchObject({ name: '', terms: [], openingFlex: 0, archived: false });
		const line = reportCodec.fromData('x', {
			lines: [{ receiverCodeId: 'R', minutesPerDay: [60, 'x'] }],
			snapshot: 'none'
		});
		expect(line.lines[0]?.minutesPerDay).toEqual([60, 0, 0, 0, 0, 0, 0]);
		expect(line.snapshot).toBeNull();
	});

	it('reads plain milliseconds as well as timestamps', () => {
		const back = entryCodec.fromData('e', {
			time: { kind: 'interval', start: 1000, end: Timestamp.fromMillis(2000) }
		});
		expect(back.time).toEqual({ kind: 'interval', start: 1000, end: 2000 });
	});

	it('drops non-string values from maps and keeps explicit nulls in settings', () => {
		expect(receiverCodec.fromData('r', { mapping: { c1: 'R', c2: 3 } }).mapping).toEqual({
			c1: 'R'
		});
		expect(settingsCodec.fromData('s', { noTimerBy: null }).noTimerBy).toBeNull();
		expect(changeLogCodec.fromData('l', { before: [1], after: 'x' })).toMatchObject({
			before: null,
			after: null
		});
	});

	it('reads a restore from a file in the change log (issue 57)', () => {
		expect(
			changeLogCodec.fromData('l', {
				path: '*',
				action: 'restore',
				after: { paths: ['entries/e1'], exportedAt: '2026-11-26T09:00:00.000Z' }
			})
		).toMatchObject({ action: 'restore', after: { paths: ['entries/e1'] } });
	});
});
