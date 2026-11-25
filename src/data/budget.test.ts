import { describe, expect, it, vi } from 'vitest';

const onSnapshot = vi.fn();
vi.mock('firebase/firestore', async (original) => ({
	...(await original<typeof import('firebase/firestore')>()),
	doc: (_db: unknown, ...path: string[]) => path.join('/'),
	onSnapshot: (...args: unknown[]) => onSnapshot(...args)
}));

const { budgetFromData, watchBudget } = await import('./budget.ts');

const data = {
	percent: 92,
	cost: 92,
	budget: 100,
	currency: 'SEK',
	month: '2026-11',
	schemaVersion: 1,
	updatedAt: null
};

describe('budgetFromData', () => {
	it('reads the status the function writes', () => {
		expect(budgetFromData(data)).toEqual({
			percent: 92,
			cost: 92,
			budget: 100,
			currency: 'SEK',
			month: '2026-11'
		});
	});

	it('takes SEK when the currency is missing', () => {
		expect(budgetFromData({ ...data, currency: undefined })?.currency).toBe('SEK');
	});

	it.each([
		['no document', undefined],
		['no per cent', { ...data, percent: undefined }],
		['a per cent as text', { ...data, percent: '92' }],
		['no cost', { ...data, cost: null }],
		['no budget', { ...data, budget: Number.NaN }],
		['a month that is not YYYY-MM', { ...data, month: 'november' }]
	])('is no status with %s', (_, value) => {
		expect(budgetFromData(value)).toBeNull();
	});
});

describe('watchBudget', () => {
	it('follows system/budget and treats an error as no status', () => {
		const statuses: unknown[] = [];
		watchBudget({} as never, (status) => statuses.push(status));
		const [path, next, error] = onSnapshot.mock.calls[0] as [
			string,
			(snapshot: { data(): unknown }) => void,
			() => void
		];
		expect(path).toBe('system/budget');
		next({ data: () => data });
		error();
		expect(statuses).toEqual([expect.objectContaining({ percent: 92 }), null]);
	});
});
