import { describe, expect, it } from 'vitest';
import { href, parseRoute, type Route } from './rutter.ts';

describe('the routes', () => {
	const routes: [string, Route][] = [
		['#/', { view: 'idag' }],
		['#/installningar', { view: 'installningar' }],
		['#/installningar/franvaro', { view: 'franvaro' }],
		['#/installningar/uppdrag/ny', { view: 'uppdrag', id: null }],
		['#/installningar/uppdrag/a1', { view: 'uppdrag', id: 'a1' }],
		[
			'#/installningar/uppdrag/a1/mottagare/ny',
			{ view: 'mottagare', assignmentId: 'a1', id: null }
		],
		[
			'#/installningar/uppdrag/a1/mottagare/r-2',
			{ view: 'mottagare', assignmentId: 'a1', id: 'r-2' }
		]
	];

	it.each(routes)('reads %s and writes it back', (hash, route) => {
		expect(parseRoute(hash)).toEqual(route);
		expect(href(route)).toBe(hash);
	});

	it.each(['', '#', '#/okand', '#/installningar/uppdrag/a b', '#/installningar/uppdrag/'])(
		'opens the start page for %j',
		(hash) => {
			expect(parseRoute(hash)).toEqual({ view: 'idag' });
		}
	);
});
