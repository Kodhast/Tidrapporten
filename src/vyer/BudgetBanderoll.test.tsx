import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { BudgetStatus } from '../domain/budget.ts';
import { BudgetBanderoll } from './BudgetBanderoll';

const status: BudgetStatus = {
	percent: 92,
	cost: 92,
	budget: 100,
	currency: 'SEK',
	month: '2026-11'
};
const NOV_15 = Date.parse('2026-11-15T12:00:00Z');

describe('BudgetBanderoll', () => {
	it('is a warning notice with the mockup text from 90 %', () => {
		const markup = renderToStaticMarkup(<BudgetBanderoll status={status} now={NOV_15} />);
		expect(markup).toMatch(/^<div class="kh-notice ton-varning"><svg/);
		expect(markup).toContain(
			'<span class="kh-notice__title">Molnbudgeten är till 92 % använd</span>'
		);
		expect(markup).toContain(
			'<span class="kh-notice__detail">92 kr av 100 kr i november. Inget stoppas i drift, men se över användningen.</span>'
		);
		expect(markup).not.toContain('style=');
	});

	it('shows nothing under 90 %, without a status or in another month', () => {
		expect(
			renderToStaticMarkup(<BudgetBanderoll status={{ ...status, percent: 89 }} now={NOV_15} />)
		).toBe('');
		expect(renderToStaticMarkup(<BudgetBanderoll status={null} now={NOV_15} />)).toBe('');
		expect(
			renderToStaticMarkup(
				<BudgetBanderoll status={{ ...status, month: '2026-10' }} now={NOV_15} />
			)
		).toBe('');
	});
});
