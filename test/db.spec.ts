// The parts of Claude's data tool (issue 27) that need no database: arguments, the drift guard,
// the key, the change file and the week of a log entry.
import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { parseArgs, writeAllowed } from '../tools/db/db.ts';
import {
	KEY_NAME,
	openDatabase,
	parseChange,
	parseKey,
	parseWhere,
	weekOf
} from '../tools/db/lib.ts';

const SECRET = '-----BEGIN PRIVATE KEY-----påhittad-----END PRIVATE KEY-----';
const key = {
	type: 'service_account',
	project_id: 'demo-nyckel',
	client_email: 'claude@demo-nyckel.iam.gserviceaccount.com',
	private_key: SECRET
};

describe('parseArgs', () => {
	it('reads the command, options and flags, with test as the default target', () => {
		expect(parseArgs(['fix', 'a.json', '--skal', 'Fel tid', '--skriv'])).toMatchObject({
			command: 'fix',
			rest: ['a.json'],
			options: { skal: 'Fel tid' },
			target: 'test'
		});
		expect(parseArgs(['stats', '--miljo', 'drift']).target).toBe('drift');
	});

	it('refuses an unknown argument, an option without a value and an unknown target', () => {
		expect(() => parseArgs(['stats', '--force'])).toThrow('--force');
		expect(() => parseArgs(['fix', '--skal'])).toThrow('--skal');
		expect(() => parseArgs(['stats', '--miljo', 'prod'])).toThrow('test eller drift');
	});
});

describe('writeAllowed', () => {
	it('writes only with --skriv, and in drift only with --drift too', () => {
		expect(writeAllowed('test', new Set())).toBe(false);
		expect(writeAllowed('test', new Set(['skriv']))).toBe(true);
		expect(() => writeAllowed('drift', new Set(['skriv']))).toThrow('--drift');
		expect(writeAllowed('drift', new Set(['skriv', 'drift']))).toBe(true);
		expect(writeAllowed('drift', new Set(['drift']))).toBe(false);
	});
});

describe('parseKey', () => {
	it('takes the key as JSON or base64', () => {
		const json = JSON.stringify(key);
		expect(parseKey(json).project_id).toBe('demo-nyckel');
		expect(parseKey(Buffer.from(json).toString('base64')).client_email).toBe(key.client_email);
	});

	it('never puts the value in an error', () => {
		const bad = [undefined, '', 'inte en nyckel', JSON.stringify({ ...key, type: 'user' })];
		for (const value of bad) {
			try {
				parseKey(value);
				expect.unreachable();
			} catch (error) {
				expect((error as Error).message).toContain(KEY_NAME);
				expect((error as Error).message).not.toContain('påhittad');
			}
		}
	});

	it('is needed for a real project', () => {
		expect(() => openDatabase('test', {})).toThrow(`${KEY_NAME} saknas`);
	});
});

describe('parseChange', () => {
	it('takes a new document or a deletion', () => {
		expect(parseChange({ path: 'entries/e1', set: { note: '' } })).toEqual({
			path: 'entries/e1',
			set: { note: '' }
		});
		expect(parseChange({ path: 'assignments/a1/codes/c1', delete: true })).toMatchObject({
			delete: true
		});
	});

	it('refuses the change log, paths outside the export, and unclear changes', () => {
		expect(() => parseChange({ path: 'changeLog/l1', set: {} })).toThrow('går inte att rätta');
		expect(() => parseChange({ path: 'state/reminders', set: {} })).toThrow('går inte');
		expect(() => parseChange({ path: '../annan/entries/e1', set: {} })).toThrow('går inte');
		expect(() => parseChange({ path: 'entries/e1' })).toThrow('antingen');
		expect(() => parseChange({ path: 'entries/e1', set: {}, delete: true })).toThrow('antingen');
		expect(() => parseChange(null)).toThrow('path');
	});
});

describe('parseWhere', () => {
	it('reads JSON values and falls back to text', () => {
		expect(parseWhere('status==sent')).toEqual({ field: 'status', value: 'sent' });
		expect(parseWhere('order==2')).toEqual({ field: 'order', value: 2 });
		expect(parseWhere('archived==false')).toEqual({ field: 'archived', value: false });
		expect(() => parseWhere('status')).toThrow('fält==värde');
	});
});

describe('weekOf', () => {
	it("is a report's week, a paused day's week or the week an interval starts in", () => {
		expect(weekOf('reports/a1_r1_2026-W48', { week: '2026-W48' })).toBe('2026-W48');
		expect(weekOf('pauses/2026-11-22', {})).toBe('2026-W47');
		// Sunday 23:30 in Stockholm is Sunday 22:30 UTC: still week 47.
		const start = Timestamp.fromMillis(Date.UTC(2026, 10, 22, 22, 30));
		expect(weekOf('entries/e1', { time: { kind: 'interval', start } })).toBe('2026-W47');
		expect(weekOf('assignments/a1', { name: 'Uppdrag A' })).toBeNull();
		expect(weekOf('entries/e1', null)).toBeNull();
	});
});
