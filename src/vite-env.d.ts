interface ImportMetaEnv {
	/** "true" points the app at the local emulators and adds the test sign-in. */
	readonly VITE_FIREBASE_EMULATOR?: string;
}

/** The app's version from package.json (vite.config.ts). */
declare const __APP_VERSION__: string;
