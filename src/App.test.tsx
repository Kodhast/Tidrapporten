import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { monthOf } from './domain/budget';

describe('App', () => {
	it('shows the app name as the page heading', () => {
		expect(renderToStaticMarkup(<App />)).toContain(
			'<h1 class="kh-text-screen-title">Tidrapporten</h1>'
		);
	});

	it('shows the timer button from web-ui-react, not yet in use', () => {
		const markup = renderToStaticMarkup(<App />);
		expect(markup).toMatch(
			/<button[^>]*class="kh-btn kh-btn--primary"[^>]*disabled=""[^>]*>Starta timern<\/button>/
		);
	});
});

describe('App and the sign-in', () => {
	it('offers "Logga in" when nobody is signed in', () => {
		expect(renderToStaticMarkup(<App uid={null} />)).toMatch(/<button[^>]*>Logga in<\/button>/);
	});

	it('shows neither button nor uid while Firebase finds out', () => {
		const markup = renderToStaticMarkup(<App />);
		expect(markup).not.toContain('Logga in');
		expect(markup).not.toContain('Inloggad');
	});

	it('shows the uid when signed in, and the error after a failed sign-in', () => {
		const markup = renderToStaticMarkup(<App uid="testperson-1" error="Det gick inte." />);
		expect(markup).toContain('Inloggad som testperson-1');
		expect(markup).toContain('Det gick inte.');
		expect(markup).not.toContain('Logga in');
	});
});

describe('App and the cloud budget', () => {
	it('warns at the top from 90 % this month, and not without a status', () => {
		const month = monthOf(Date.now());
		const budget = { percent: 95, cost: 95, budget: 100, currency: 'SEK', month };
		expect(renderToStaticMarkup(<App budget={budget} />)).toMatch(
			/^<main class="kh-page start"><div class="kh-notice ton-varning">/
		);
		expect(renderToStaticMarkup(<App />)).not.toContain('kh-notice');
	});
});
