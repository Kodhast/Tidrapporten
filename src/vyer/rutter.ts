// The app's views live in the address after `#`, so Pages serves index.html for every view
// without a rewrite and the service worker needs no navigation rules.
import { useEffect, useState } from 'react';
import { isoWeekOf, mondayOf } from '../domain/tid.ts';
import type { Id, IsoDate, IsoWeek } from '../domain/types.ts';

export type Route =
	| { view: 'idag' }
	| { view: 'installningar' }
	| { view: 'uppdrag'; id: Id | null } // null: a new assignment
	| { view: 'mottagare'; assignmentId: Id; id: Id | null } // null: a new receiver
	| { view: 'franvaro' }
	| { view: 'dag'; date: IsoDate }
	| { view: 'vecka'; week: IsoWeek | null } // null: the current week
	| {
			view: 'rapport';
			week: IsoWeek;
			assignmentId: Id;
			receiverId: Id;
			/** The transcript (mockup "Avskrift") rather than the report's suggestion. */
			transcript: boolean;
	  };

const ID = '([A-Za-z0-9-]+)';

/** A real calendar day, not 2026-02-30. */
const isValidDate = (date: string): boolean => {
	const day = new Date(`${date}T12:00:00Z`);
	return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === date;
};

/** A real ISO week, not week 54. */
const isValidWeek = (week: IsoWeek): boolean => isoWeekOf(mondayOf(week)) === week;

const WEEK = '(\\d{4})-W(\\d{2})';

/** The view for `location.hash`; anything unknown is the start page. */
export const parseRoute = (hash: string): Route => {
	const path = hash.replace(/^#/, '');
	if (path === '/installningar') return { view: 'installningar' };
	if (path === '/installningar/franvaro') return { view: 'franvaro' };
	const day = /^\/dag\/(\d{4}-\d{2}-\d{2})$/.exec(path);
	if (day && isValidDate(day[1]!)) return { view: 'dag', date: day[1]! };
	if (path === '/vecka') return { view: 'vecka', week: null };
	let m = new RegExp(`^/vecka/${WEEK}(?:/${ID}/${ID}(/avskrift)?)?$`).exec(path);
	if (m && isValidWeek(`${m[1]}-W${m[2]}`)) {
		const week = `${m[1]}-W${m[2]}`;
		if (!m[3]) return { view: 'vecka', week };
		return {
			view: 'rapport',
			week,
			assignmentId: m[3],
			receiverId: m[4]!,
			transcript: m[5] !== undefined
		};
	}
	m = new RegExp(`^/installningar/uppdrag/${ID}$`).exec(path);
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
		case 'dag':
			return `#/dag/${route.date}`;
		case 'vecka':
			return route.week ? `#/vecka/${route.week}` : '#/vecka';
		case 'rapport':
			return `#/vecka/${route.week}/${route.assignmentId}/${route.receiverId}${route.transcript ? '/avskrift' : ''}`;
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
