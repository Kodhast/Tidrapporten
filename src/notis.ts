// What the service worker (src/sw.ts) does with a reminder (issue 22), kept apart so that it runs
// in Vitest. A reminder comes as a Cloud Messaging data message with title, body, the address
// to open and the button's label (firebase-functions/src/index.ts).

export interface Shown {
	title: string;
	options: NotificationOptions & { actions?: Array<{ action: string; title: string }> };
}

const text = (value: unknown): string | null =>
	typeof value === 'string' && value.length > 0 ? value : null;

/** The notification for a push, or null for one that is not a reminder. */
export function shownOf(payload: unknown): Shown | null {
	const outer = typeof payload === 'object' && payload !== null ? payload : {};
	const data = 'data' in outer && typeof outer.data === 'object' && outer.data ? outer.data : outer;
	const fields = data as Record<string, unknown>;
	const title = text(fields.title);
	const url = text(fields.url);
	if (!title || !url || !url.startsWith('/')) return null;
	const action = text(fields.action);
	return {
		title,
		options: {
			body: text(fields.body) ?? '',
			icon: '/icon-192.png',
			// One of each reminder at a time: a new one replaces the old.
			tag: title,
			data: { url },
			...(action ? { actions: [{ action: 'open', title: action }] } : {})
		}
	};
}

/** The address a click on the notification or its button opens; only the app's own. */
export const urlOf = (data: unknown): string => {
	const url = typeof data === 'object' && data !== null ? (data as { url?: unknown }).url : null;
	return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : '/';
};
