import { describe, expect, it } from 'vitest';
import { shownOf, urlOf } from './notis.ts';
import { deviceLabel } from './firebase/notiser.ts';

describe('shownOf', () => {
	it('draws a reminder from the data of a Cloud Messaging message, with its button', () => {
		const data = {
			title: 'Ingen timer igång',
			body: 'Klockan är 09:30.',
			url: '/?gor=starta',
			action: 'Starta timern'
		};
		expect(shownOf({ data, from: '946140173051' })).toEqual({
			title: 'Ingen timer igång',
			options: {
				body: 'Klockan är 09:30.',
				icon: '/icon-192.png',
				tag: 'Ingen timer igång',
				data: { url: '/?gor=starta' },
				actions: [{ action: 'open', title: 'Starta timern' }]
			}
		});
		expect(shownOf(data)?.title).toBe('Ingen timer igång');
		expect(shownOf({ data: { title: 'Utan knapp', url: '/' } })?.options.actions).toBeUndefined();
	});

	it('shows nothing without a title or with an address outside the app', () => {
		expect(shownOf(null)).toBeNull();
		expect(shownOf({ data: { url: '/' } })).toBeNull();
		expect(shownOf({ data: { title: 'X', url: 'https://example.com/' } })).toBeNull();
	});
});

describe('urlOf', () => {
	it("opens the notification's address in the app, else the start page", () => {
		expect(urlOf({ url: '/#/vecka/2026-W48' })).toBe('/#/vecka/2026-W48');
		expect(urlOf({ url: '//example.com' })).toBe('/');
		expect(urlOf({ url: 'https://example.com' })).toBe('/');
		expect(urlOf(null)).toBe('/');
	});
});

describe('deviceLabel', () => {
	it('names the device after its system', () => {
		expect(deviceLabel('Mozilla/5.0 (Linux; Android 16; Pixel) Chrome/140')).toBe(
			'Chrome på Android'
		);
		expect(deviceLabel('Mozilla/5.0 (X11; Linux x86_64) Chrome/140')).toBe('Chrome på dator');
	});
});
