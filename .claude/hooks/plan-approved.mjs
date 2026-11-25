#!/usr/bin/env node
// Blocks a pull request whose issue has no approved plan (docs/beslut/0011).
// Two entry points share the same check:
// - PreToolUse hook on the GitHub tool that creates a PR: exit code 2 blocks
//   the call and hands stderr back to Claude. If GitHub cannot be reached the
//   PR is let through with a warning, since the CI check decides anyway.
// - `node plan-approved.mjs --ci` in .github/workflows/plan.yml: reads the PR
//   from the Actions event and fails the job.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const APPROVED_LABEL = 'plan-godkänd';
const REPO = process.env.GITHUB_REPOSITORY ?? 'Kodhast/Tidrapporten';

/** Issue numbers the PR text closes with Closes/Fixes/Resolves #N (a colon after the keyword is allowed). */
export function linkedIssues(body) {
	const matches = (body ?? '').matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\s+#(\d+)/gi);
	return [...new Set([...matches].map((match) => Number(match[1])))];
}

/** Returns why the PR is not allowed, or null when it is. */
export async function planProblem(body, getLabels) {
	// The owner can waive the plan for a single change; the line keeps their words visible in the PR.
	if (/^Utan plan: \S/m.test(body ?? '')) return null;
	// A small change needs no plan (beslut 0011); the line makes Claude's judgement visible in the PR.
	if (/^Liten ändring: \S/m.test(body ?? '')) return null;

	const issues = linkedIssues(body);
	if (issues.length === 0) {
		return 'PR-texten länkar inget issue (Closes #N). En större ändring kräver ett issue med plan som ägaren godkänt; en liten skriver raden "Liten ändring: <varför>" (beslut 0011).';
	}
	const missing = [];
	for (const issue of issues) {
		if (!(await getLabels(issue)).includes(APPROVED_LABEL)) missing.push(`#${issue}`);
	}
	if (missing.length === 0) return null;
	return (
		`Planen i ${missing.join(', ')} är inte godkänd (etiketten ${APPROVED_LABEL} saknas). ` +
		'Visa planen för ägaren och vänta på ett ok innan PR:en skapas.'
	);
}

/** Reads the labels of an issue in `repo` (owner/name). */
const githubLabels = (repo) => async (issue) => {
	const headers = { accept: 'application/vnd.github+json' };
	if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
	const response = await fetch(`https://api.github.com/repos/${repo}/issues/${issue}/labels`, {
		headers,
		signal: AbortSignal.timeout(10_000)
	});
	if (!response.ok) throw new Error(`GitHub svarade ${response.status} för #${issue}`);
	return (await response.json()).map((label) => label.name);
};

/** True when the PR the tool creates is for this repo; other repos have their own check. */
export function isThisRepo(toolInput) {
	if (!toolInput?.owner || !toolInput?.repo) return true;
	return `${toolInput.owner}/${toolInput.repo}`.toLowerCase() === REPO.toLowerCase();
}

async function runHook() {
	const input = JSON.parse(readFileSync(0, 'utf8'));
	if (!isThisRepo(input.tool_input)) return;
	let problem;
	try {
		problem = await planProblem(input.tool_input?.body, githubLabels(REPO));
	} catch (error) {
		console.log(
			JSON.stringify({
				systemMessage: `Kunde inte kontrollera planens etikett (${error.message}). CI-kontrollen Plan godkänd avgör.`
			})
		);
		return;
	}
	if (problem) {
		process.stderr.write(`${problem}\n`);
		process.exit(2);
	}
}

async function runCi() {
	const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
	const problem = await planProblem(event.pull_request?.body, githubLabels(REPO));
	if (problem) {
		console.log(`::error::${problem}`);
		process.exit(1);
	}
	console.log('Planen är godkänd.');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	await (process.argv.includes('--ci') ? runCi() : runHook());
}
