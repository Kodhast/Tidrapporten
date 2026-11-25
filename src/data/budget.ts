// Reads the cloud budget's status, system/budget, which only the budget function writes
// (issue 28). Tolerant like the other documents (ADR 0012): a missing or malformed document
// means no status, never a broken app.
import { doc, onSnapshot, type DocumentData, type Firestore } from 'firebase/firestore';
import type { BudgetStatus } from '../domain/budget.ts';
import { str } from './kodning.ts';

const num = (value: unknown): number | null =>
	typeof value === 'number' && Number.isFinite(value) ? value : null;

/** The status, or null when the document lacks a field the warning needs. */
export function budgetFromData(data: DocumentData | undefined): BudgetStatus | null {
	if (!data) return null;
	const percent = num(data.percent);
	const cost = num(data.cost);
	const budget = num(data.budget);
	const month = str(data.month);
	if (percent === null || cost === null || budget === null || !/^\d{4}-\d{2}$/.test(month)) {
		return null;
	}
	return { percent, cost, budget, currency: str(data.currency, 'SEK'), month };
}

/** Follows the status; an error (offline, refused) counts as no status. Returns the unsubscribe. */
export const watchBudget = (db: Firestore, onChange: (status: BudgetStatus | null) => void) =>
	onSnapshot(
		doc(db, 'system', 'budget'),
		(snapshot) => onChange(budgetFromData(snapshot.data())),
		() => onChange(null)
	);
