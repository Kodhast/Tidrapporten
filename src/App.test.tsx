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

	it('shows the start page it is given to a signed-in user, with the timer’s button', () => {
		const action = { label: 'Starta timern', icon: <svg />, onPress: () => {} };
		const markup = renderToStaticMarkup(
			<App uid="testperson-1" start={<p>Timern</p>} timerAction={action} />
		);
		expect(markup).toContain('<main><p>Timern</p></main>');
		expect(markup).toMatch(/<button[^>]*class="kh-toolbar__action"[^>]*aria-label="Starta timern"/);
	});

	it('has no timer button before the sign-in', () => {
		const action = { label: 'Starta timern', icon: <svg />, onPress: () => {} };
		expect(renderToStaticMarkup(<App uid={null} timerAction={action} />)).not.toContain(
			'Starta timern'
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

	it('shows the error after a failed sign-in', () => {
		const markup = renderToStaticMarkup(<App uid={null} error="Det gick inte." />);
		expect(markup).toContain('Det gick inte.');
	});

	it('offers no sign-in to a signed-in user', () => {
		const markup = renderToStaticMarkup(<App uid="testperson-1" />);
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

describe('App and the views', () => {
	it('has the tab row with Idag and Veckan on the start page, and no Inställningar (issue 66)', () => {
		const markup = renderToStaticMarkup(<App />);
		expect(markup).toContain('kh-toolbar--fixed');
		expect(markup).toMatch(/<a[^>]*href="#\/"[^>]*aria-current="page"/);
		expect(markup).toContain('href="#/vecka"');
		expect(markup).not.toContain('href="#/installningar"');
	});

	it('shows the settings it is given to a signed-in user', () => {
		const markup = renderToStaticMarkup(
			<App uid="testperson-1" route={{ view: 'installningar' }} settings={<p>Inställningarna</p>} />
		);
		expect(markup).toContain('<p>Inställningarna</p>');
		// Opened from the account menu, with its own back arrow and no tab row.
		expect(markup).not.toContain('kh-toolbar');
		expect(markup).not.toContain('Starta timern');
	});

	it('shows Om Tidrapporten with the version, signed in or not', () => {
		for (const uid of [null, 'testperson-1']) {
			const markup = renderToStaticMarkup(<App uid={uid} route={{ view: 'om' }} />);
			expect(markup).toContain('Om Tidrapporten');
			expect(markup).toContain(`Version ${__APP_VERSION__}`);
			expect(markup).toContain('href="#/"');
		}
	});

	it('asks for a sign-in before the settings', () => {
		const markup = renderToStaticMarkup(
			<App uid={null} route={{ view: 'franvaro' }} settings={<p>Inställningarna</p>} />
		);
		expect(markup).toContain('Logga in för att se inställningarna.');
		expect(markup).not.toContain('Inställningarna</p>');
	});

	it('shows the day it is given, and asks for a sign-in before it', () => {
		const route = { view: 'dag', date: '2026-11-24' } as const;
		expect(
			renderToStaticMarkup(<App uid="testperson-1" route={route} settings={<p>Dagen</p>} />)
		).toContain('<p>Dagen</p>');
		expect(renderToStaticMarkup(<App uid={null} route={route} />)).toContain(
			'Logga in för att se dagen.'
		);
	});

	it('has no tab row in a view below a tab, which has its back arrow', () => {
		const markup = renderToStaticMarkup(
			<App uid="testperson-1" route={{ view: 'uppdrag', id: null }} />
		);
		expect(markup).not.toContain('kh-toolbar');
	});
});
