import { initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { EMULATOR_HOST, EMULATOR_PORTS, environmentFor, firebaseOptions } from './config';

export interface Firebase {
	app: FirebaseApp;
	auth: Auth;
	db: Firestore;
}

declare global {
	interface Window {
		/** Signs in as `uid` against the Auth emulator; exists only in emulator builds. */
		testSignIn?: (uid: string) => Promise<string>;
	}
}

export function startFirebase(): Firebase {
	// Compared inline so that Vite replaces it with a constant and drops the branch below from
	// every build without the variable, drift included.
	const useEmulator = import.meta.env.VITE_FIREBASE_EMULATOR === 'true';
	const app = initializeApp(firebaseOptions(environmentFor(import.meta.env.MODE, useEmulator)));
	const auth = getAuth(app);
	const db = getFirestore(app);
	if (import.meta.env.VITE_FIREBASE_EMULATOR === 'true') {
		connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${EMULATOR_PORTS.auth}`, {
			disableWarnings: true
		});
		connectFirestoreEmulator(db, EMULATOR_HOST, EMULATOR_PORTS.firestore);
		window.testSignIn = async (uid) => {
			const { signInForTest } = await import('./testinloggning');
			return (await signInForTest(auth, uid)).user.uid;
		};
	}
	return { app, auth, db };
}
