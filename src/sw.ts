/// <reference lib="webworker" />
// The app's service worker (issue 22): the same cache and navigation as vite-plugin-pwa's own
// worker gave before (the sign-in always reaches Access and the Pages Function, decision 0017),
// plus the reminders: a push is shown as a notification, and a click opens its address in the app.
import { clientsClaim } from 'workbox-core';
import {
	cleanupOutdatedCaches,
	createHandlerBoundToURL,
	precacheAndRoute
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { shownOf, urlOf } from './notis.ts';

declare const self: ServiceWorkerGlobalScope;

self.skipWaiting();
clientsClaim();
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(
	new NavigationRoute(createHandlerBoundToURL('index.html'), {
		denylist: [/^\/inloggning/, /^\/cdn-cgi\//]
	})
);

self.addEventListener('push', (event) => {
	let payload: unknown;
	try {
		payload = event.data?.json();
	} catch {
		return;
	}
	const shown = shownOf(payload);
	if (shown) event.waitUntil(self.registration.showNotification(shown.title, shown.options));
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url = new URL(urlOf(event.notification.data), self.location.origin).href;
	event.waitUntil(
		(async () => {
			// Only a window this worker controls can be navigated; any other gets a new window.
			const windows = await self.clients.matchAll({ type: 'window' });
			const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
			if (open) {
				await open.focus();
				await open.navigate(url);
			} else {
				await self.clients.openWindow(url);
			}
		})()
	);
});
