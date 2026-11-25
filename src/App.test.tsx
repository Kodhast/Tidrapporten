import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from './App';

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
