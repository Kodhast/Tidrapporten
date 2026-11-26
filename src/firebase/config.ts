import type { FirebaseOptions } from 'firebase/app';

// The web config is not a secret (decision 0007): it only names the project, and the Firestore
// rules decide what anyone may do. The project ids are reused projects (issue 10), so they do not
// say "tidrapporten"; the aliases in .firebaserc do.
export type Environment = 'test' | 'drift' | 'emulator';

/** The demo- prefix makes the SDK and the emulators refuse to reach any real project. */
export const EMULATOR_PROJECT_ID = 'demo-tidrapporten';

/** Must match "emulators" in firebase.json; a test checks it. */
export const EMULATOR_HOST = '127.0.0.1';
export const EMULATOR_PORTS = { auth: 9099, firestore: 8080, functions: 5001 } as const;

/** Where the Cloud Functions run (decision 0015). */
export const FUNCTIONS_REGION = 'europe-west1';

const options: Record<Environment, FirebaseOptions> = {
	test: {
		apiKey: 'AIzaSyDie-FtsbeqFTPwZlI5wMI_qoOsiYcVqIs',
		authDomain: 'dagboken-497114.firebaseapp.com',
		projectId: 'dagboken-497114',
		storageBucket: 'dagboken-497114.firebasestorage.app',
		messagingSenderId: '946140173051',
		appId: '1:946140173051:web:368be82f87416b9b64d65e'
	},
	drift: {
		apiKey: 'AIzaSyCxOCeKIEB2h1B2-1A7s3eeVS2IBi7TGU4',
		authDomain: 'device-streaming-5b35f7b8.firebaseapp.com',
		projectId: 'device-streaming-5b35f7b8',
		storageBucket: 'device-streaming-5b35f7b8.firebasestorage.app',
		messagingSenderId: '324013256111',
		appId: '1:324013256111:web:355a6a017378caebd8935a'
	},
	emulator: {
		apiKey: 'demo-key',
		authDomain: `${EMULATOR_PROJECT_ID}.firebaseapp.com`,
		projectId: EMULATOR_PROJECT_ID,
		appId: 'demo-app'
	}
};

/**
 * Which project a build talks to. `vite build --mode drift` is the release build; every other
 * build, previews included, uses the test project. The emulator is never allowed in drift.
 */
export function environmentFor(mode: string, useEmulator: boolean): Environment {
	if (mode === 'drift') {
		if (useEmulator) throw new Error('The emulator cannot be used in a drift build');
		return 'drift';
	}
	return useEmulator ? 'emulator' : 'test';
}

export function firebaseOptions(environment: Environment): FirebaseOptions {
	return options[environment];
}

/**
 * The public half of each project's Web Push key pair (Firebase console → Project settings →
 * Cloud Messaging → Web Push certificates). Not a secret: browsers get it to subscribe. Null until
 * the owner has made the pair; the reminder settings then say that notifications are not set up.
 */
const vapidKeys: Record<Environment, string | null> = {
	test: null,
	drift: null,
	emulator: null
};

export function vapidKeyFor(environment: Environment): string | null {
	return vapidKeys[environment];
}
