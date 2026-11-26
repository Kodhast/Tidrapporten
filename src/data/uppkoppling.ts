// Whether the app reaches the server. Browser only: it listens to the window's online events.
import { onSnapshot, type Firestore } from 'firebase/firestore';
import type { Id } from '../domain/types.ts';
import { userDoc, userPath } from './skrivning.ts';

/**
 * Whether the app can write settings: the browser has a network and Firestore has heard from the
 * server (ADR 0012: the listener on state/timer has `fromCache == false`). Returns the unsubscribe.
 */
export const watchOnline = (db: Firestore, uid: Id, onChange: (online: boolean) => void) => {
	let serverSeen = false;
	const report = () => onChange(navigator.onLine && serverSeen);
	const unsubscribe = onSnapshot(
		userDoc(db, uid, userPath('state', 'timer')),
		{ includeMetadataChanges: true },
		(snapshot) => {
			serverSeen = !snapshot.metadata.fromCache;
			report();
		},
		() => {
			serverSeen = false;
			report();
		}
	);
	window.addEventListener('online', report);
	window.addEventListener('offline', report);
	return () => {
		unsubscribe();
		window.removeEventListener('online', report);
		window.removeEventListener('offline', report);
	};
};
