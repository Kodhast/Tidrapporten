#!/usr/bin/env node
// SessionStart hook: makes a fresh cloud session ready to run checks and tests.
// Locally it does nothing, since a developer machine is already set up.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

if (process.env.CLAUDE_CODE_REMOTE !== 'true') process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const run = (command, args) =>
	spawnSync(command, args, { cwd: root, stdio: 'ignore' }).status === 0;

// The typescript-lsp plugin (.claude/settings.json) starts this server from PATH.
if (!run('typescript-language-server', ['--version'])) {
	if (!run('npm', ['install', '-g', 'typescript-language-server', 'typescript'])) {
		console.log('Tidrapporten: typescript-language-server gick inte att installera; LSP saknas.');
	}
}

// npm ci (about 20 s) runs only when something needs it: the push check installs
// dependencies itself (verify-before-push.mjs). In a project thread this hook runs
// even when the thread never touches the repo.
if (!existsSync(path.join(root, 'node_modules'))) {
	console.log(
		'Tidrapporten: node_modules saknas. Kör npm ci innan du testar; push-kontrollen gör det själv.'
	);
	process.exit(0);
}

// The image's preinstalled Chromium may be older than the Playwright version in
// package.json, so fetch the matching one, as CI does. If the download is blocked,
// PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium uses the preinstalled one.
if (!run('npx', ['playwright', 'install', 'chromium'])) {
	console.log(
		'Tidrapporten: playwright install chromium misslyckades. Kör e2e med PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium.'
	);
}
