import { defineConfig } from 'vite';

// Bundles functions/ for deploy (decision 0014): code from src/domain/ is inlined, npm packages
// stay external and are installed from functions/package.json in the cloud.
export default defineConfig({
	publicDir: false,
	build: {
		ssr: 'functions/src/index.ts',
		outDir: 'functions/lib',
		emptyOutDir: true,
		target: 'node22',
		rolldownOptions: { output: { format: 'es', entryFileNames: 'index.js' } }
	}
});
