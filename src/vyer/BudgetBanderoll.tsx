import { Notice } from '@kodhast/web-ui-react';
import { useState } from 'react';
import { budgetNotice, type BudgetStatus } from '../domain/budget.ts';
import type { UtcMillis } from '../domain/types.ts';

export interface BudgetBanderollProps {
	status: BudgetStatus | null;
	/** Now, for the month; Date.now() unless a test sets it. */
	now?: UtcMillis;
}

/** The cloud budget's warning at the top of Idag (mockup in issue 16, artboard "Idag – budget"). */
export function BudgetBanderoll({ status, now }: BudgetBanderollProps) {
	// Read once when the view opens; the month it compares with does not need to tick.
	const [openedAt] = useState(() => now ?? Date.now());
	const notice = budgetNotice(status, now ?? openedAt);
	if (!notice) return null;
	return (
		<Notice
			tone="ton-varning"
			icon={
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
				</svg>
			}
			title={notice.title}
			detail={notice.detail}
		/>
	);
}
