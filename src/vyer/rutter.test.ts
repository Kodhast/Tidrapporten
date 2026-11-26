import { describe, expect, it } from 'vitest';
import { href, parseRoute, type Route } from './rutter.ts';

describe('the routes', () => {
	const routes: [string, Route][] = [
		['#/', { view: 'idag' }],
		['#/installningar', { view: 'installningar' }],
		['#/kom-igang', { view: 'kom-igang' }],
		['#/om', { view: 'om' }],
		['#/installningar/franvaro', { view: 'franvaro' }],
		['#/installningar/paminnelser', { view: 'paminnelser' }],
		['#/dag/2026-11-24', { view: 'dag', date: '2026-11-24' }],
		['#/installningar/uppdrag/ny', { view: 'uppdrag', id: null }],
		['#/installningar/uppdrag/a1', { view: 'uppdrag', id: 'a1' }],
		[
			'#/installningar/uppdrag/a1/mottagare/ny',
			{ view: 'mottagare', assignmentId: 'a1', id: null }
		],
		[
			'#/installningar/uppdrag/a1/mottagare/r-2',
			{ view: 'mottagare', assignmentId: 'a1', id: 'r-2' }
		],
		['#/installningar/arbetsgivare/ny', { view: 'arbetsgivare', id: null }],
		['#/installningar/arbetsgivare/g1', { view: 'arbetsgivare', id: 'g1' }],
		['#/installningar/kund/ny', { view: 'kund', id: null }],
		['#/installningar/kund/k-2', { view: 'kund', id: 'k-2' }],
		['#/vecka', { view: 'vecka', week: null }],
		['#/vecka/2026-W53', { view: 'vecka', week: '2026-W53' }],
		[
			'#/vecka/2026-W47/a1/r1',
			{ view: 'rapport', week: '2026-W47', assignmentId: 'a1', receiverId: 'r1', transcript: false }
		],
		[
			'#/vecka/2026-W47/a1/r1/avskrift',
			{ view: 'rapport', week: '2026-W47', assignmentId: 'a1', receiverId: 'r1', transcript: true }
		]
	];

	it.each(routes)('reads %s and writes it back', (hash, route) => {
		expect(parseRoute(hash)).toEqual(route);
		expect(href(route)).toBe(hash);
	});

	it.each([
		'',
		'#',
		'#/okand',
		'#/installningar/uppdrag/a b',
		'#/installningar/uppdrag/',
		'#/installningar/kund/',
		'#/installningar/mellanhand/m1',
		'#/dag/2026-02-30',
		'#/dag/2026-13-45',
		'#/dag/igar',
		'#/vecka/2027-W53',
		'#/vecka/2026-W00',
		'#/vecka/2026-W47/a1'
	])('opens the start page for %j', (hash) => {
		expect(parseRoute(hash)).toEqual({ view: 'idag' });
	});
});
