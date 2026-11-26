// The app's views live in the address after `#`, so Pages serves index.html for every view
// without a rewrite and the service worker needs no navigation rules.
import { useEffect, useState } from 'react';
import type { Id } from '../domain/types.ts';

export type Route =
	| { view: 'idag' }
	| { view: 'installningar' }
	| { view: 'uppdrag'; id: Id | null } // null: a new assignment
	| { view: 'mottagare'; assignmentId: Id; id: Id | null } // null: a new receiver
	| { view: 'franvaro' };

const ID = '([A-Za-z0-9-]+)';

/** The view for `location.hash`; anything unknown is the start page. */
export const parseRoute = (hash: string): Route => {
	const path = hash.replace(/^#/, '');
	if (path === '/installningar') return { view: 'installningar' };
	if (path === '/installningar/franvaro') return { view: 'franvaro' };
	let m = new RegExp(`^/installningar/uppdrag/${ID}$`).exec(path);
	if (m) return { view: 'uppdrag', id: m[1] === 'ny' ? null : m[1]! };
	m = new RegExp(`^/installningar/uppdrag/${ID}/mottagare/${ID}$`).exec(path);
	if (m) return { view: 'mottagare', assignmentId: m[1]!, id: m[2] === 'ny' ? null : m[2]! };
	return { view: 'idag' };
};

/** The address of a view, for links. */
export const href = (route: Route): string => {
	switch (route.view) {
		case 'idag':
			return '#/';
		case 'installningar':
			return '#/installningar';
		case 'franvaro':
			return '#/installningar/franvaro';
		case 'uppdrag':
			return `#/installningar/uppdrag/${route.id ?? 'ny'}`;
		case 'mottagare':
			return `#/installningar/uppdrag/${route.assignmentId}/mottagare/${route.id ?? 'ny'}`;
	}
};

/** Replaces the address without a new history entry, e.g. a new item's own address after save. */
export const replaceRoute = (route: Route) => location.replace(href(route));

/** The current view, following the address. */
export const useRoute = (): Route => {
	const [route, setRoute] = useState(() => parseRoute(location.hash));
	useEffect(() => {
		const update = () => setRoute(parseRoute(location.hash));
		window.addEventListener('hashchange', update);
		return () => window.removeEventListener('hashchange', update);
	}, []);
	return route;
};
