import { describe, expect, it } from 'vitest';
import { isThisRepo, linkedIssues, planProblem } from '../.claude/hooks/plan-approved.mjs';

const labels =
	(byIssue: Record<number, string[]>) =>
	async (issue: number): Promise<string[]> =>
		byIssue[issue] ?? [];

describe('linkedIssues', () => {
	it('finds issues closed with a closing keyword, with or without a colon', () => {
		expect(linkedIssues('Closes #12\nFixes: #3. Resolved #12')).toEqual([12, 3]);
	});

	it('ignores issues that are only referenced', () => {
		expect(linkedIssues('Closes #19\nRefs #8')).toEqual([19]);
	});

	it('ignores bare issue numbers', () => {
		expect(linkedIssues('Se #12 och PR #13')).toEqual([]);
	});
});

describe('planProblem', () => {
	it('allows a PR whose issue has an approved plan', async () => {
		expect(await planProblem('Closes #7', labels({ 7: ['plan-godkänd'] }))).toBeNull();
	});

	it('blocks a PR whose issue has no approved plan', async () => {
		expect(await planProblem('Closes #7', labels({ 7: ['bugg'] }))).toContain('#7');
	});

	it('blocks when any linked issue lacks an approved plan', async () => {
		const problem = await planProblem('Closes #7\nCloses #8', labels({ 7: ['plan-godkänd'] }));
		expect(problem).toContain('#8');
		expect(problem).not.toContain('#7');
	});

	it('blocks a PR that links no issue', async () => {
		expect(await planProblem('Liten fix', labels({}))).toContain('Closes #N');
		expect(await planProblem(undefined, labels({}))).toContain('Closes #N');
	});

	it('allows a PR where the owner waived the plan', async () => {
		expect(await planProblem('Utan plan: "kör bara" (ägaren 12:00)', labels({}))).toBeNull();
	});

	it('does not count an empty waiver', async () => {
		expect(await planProblem('Utan plan:', labels({}))).not.toBeNull();
	});

	it('allows a small change that says why', async () => {
		expect(await planProblem('Liten ändring: stavfel i en knapptext', labels({}))).toBeNull();
	});

	it('does not count a small change without a reason', async () => {
		expect(await planProblem('Liten ändring:', labels({}))).not.toBeNull();
		expect(await planProblem('Det här är en liten ändring: x', labels({}))).not.toBeNull();
	});
});

describe('isThisRepo', () => {
	it('checks a PR for this repo or one without owner and repo', () => {
		expect(isThisRepo({ owner: 'Kodhast', repo: 'Tidrapporten' })).toBe(true);
		expect(isThisRepo({ owner: 'kodhast', repo: 'tidrapporten' })).toBe(true);
		expect(isThisRepo(undefined)).toBe(true);
	});

	it('leaves a PR for another repo to that repo', () => {
		expect(isThisRepo({ owner: 'Kodhast', repo: 'VeckansMat' })).toBe(false);
	});
});
