import { initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import {
	connectFirestoreEmulator,
	initializeFirestore,
	persistentLocalCache,
	persistentMultipleTabManager,
	type Firestore
} from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';
import {
	EMULATOR_HOST,
	EMULATOR_PORTS,
	environmentFor,
	firebaseOptions,
	FUNCTIONS_REGION
} from './config';

export interface Firebase {
	app: FirebaseApp;
	auth: Auth;
	db: Firestore;
	functions: Functions;
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
	// The offline cache serves reads offline; which writes are allowed offline is the data
	// layer's choice (ADR 0012): reports go through transactions, which need the server.
	const db = initializeFirestore(app, {
		localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
	});
	const functions = getFunctions(app, FUNCTIONS_REGION);
	if (import.meta.env.VITE_FIREBASE_EMULATOR === 'true') {
		connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${EMULATOR_PORTS.auth}`, {
			disableWarnings: true
		});
		connectFirestoreEmulator(db, EMULATOR_HOST, EMULATOR_PORTS.firestore);
		connectFunctionsEmulator(functions, EMULATOR_HOST, EMULATOR_PORTS.functions);
		window.testSignIn = async (uid) => {
			const { signInForTest } = await import('./testinloggning');
			return (await signInForTest(auth, uid)).user.uid;
		};
	}
	return { app, auth, db, functions };
}
