import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Bundles firebase-functions/ for deploy (decision 0014): code from src/domain/ is inlined, npm packages
// stay external and are installed from firebase-functions/package.json in the cloud.
export default defineConfig({
	publicDir: false,
	// The codecs import the web SDK only for Timestamp; on the server it is the Admin SDK's.
	resolve: {
		alias: {
			'firebase/firestore': fileURLToPath(
				new URL('firebase-functions/src/firestore-shim.ts', import.meta.url)
			)
		}
	},
	build: {
		ssr: 'firebase-functions/src/index.ts',
		outDir: 'firebase-functions/lib',
		emptyOutDir: true,
		target: 'node24',
		rolldownOptions: { output: { format: 'es', entryFileNames: 'index.js' } }
	}
});
