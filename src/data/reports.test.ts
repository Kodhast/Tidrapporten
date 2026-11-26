// Sending and unlocking a report (issue 20), with Firestore replaced: which reason goes with each
// locked change. The transaction itself is saveReport's, run against the emulators in the e2e tests.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase/firestore';
import { report } from '../domain/testdata.ts';

const store = vi.hoisted(() => ({ log: new Map<string, Record<string, unknown>>() }));

vi.mock('firebase/firestore', async (importOriginal) => ({
	...(await importOriginal<typeof import('firebase/firestore')>()),
	getDoc: async (ref: { path: string }) => {
		const id = ref.path.split('/').pop()!;
		const data = store.log.get(id);
		return { id, exists: () => data !== undefined, data: () => data };
	}
}));

const saveReport = vi.hoisted(() => vi.fn());
vi.mock('./skrivning.ts', () => ({
	saveReport,
	userPath: (...parts: string[]) => parts.join('/'),
	userDoc: (_db: unknown, uid: string, path: string) => ({ path: `users/${uid}/${path}` })
}));

const { sendReport, unlockReport, CHANGED_AFTER_UNLOCK } = await import('./reports.ts');

const db = {} as Firestore;
const draft = report('2026-W47', 'draft', [480, 0, 0, 0, 0, 0, 0]);

beforeEach(() => {
	saveReport.mockReset().mockResolvedValue(null);
	store.log.clear();
});

describe('sendReport', () => {
	it('sends a new or draft report without a reason', async () => {
		await sendReport(db, 'u1', draft, null);
		expect(saveReport).toHaveBeenCalledWith(db, 'u1', draft.id, { ...draft, status: 'sent' }, '');
	});

	it("sends an unlocked report again with the unlock's reason", async () => {
		store.log.set('log-1', { reason: 'Fel tidkod', action: 'unlock' });
		const unlocked = { ...draft, status: 'unlocked' as const, lastChangeId: 'log-1' };
		await sendReport(db, 'u1', draft, unlocked);
		expect(saveReport.mock.calls[0]![4]).toBe('Fel tidkod');
	});

	it('says why when the reason cannot be read', async () => {
		const unlocked = { ...draft, status: 'unlocked' as const, lastChangeId: 'saknas' };
		await sendReport(db, 'u1', draft, unlocked);
		expect(saveReport.mock.calls[0]![4]).toBe(CHANGED_AFTER_UNLOCK);
	});
});

describe('unlockReport', () => {
	it('unlocks with the reason given', async () => {
		const sent = { ...draft, status: 'sent' as const };
		await unlockReport(db, 'u1', sent, 'Fel tidkod');
		expect(saveReport).toHaveBeenCalledWith(
			db,
			'u1',
			sent.id,
			{ ...sent, status: 'unlocked' },
			'Fel tidkod'
		);
	});
});
