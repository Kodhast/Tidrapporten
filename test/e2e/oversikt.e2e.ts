import { expect, test, type APIRequestContext } from '@playwright/test';
import { atLocalTime } from '../../src/domain/tid.ts';
import { seed, signIn, uid } from './hjalp.ts';

// The start page's flex and unsent reports against the emulators (issue 19). Two made-up
// assignments that ran only in week 47 of 2026 (16–22 November, without holidays), so that the
// flex is the same whatever day the test runs.

const seedEndedAssignment = (
	request: APIRequestContext,
	user: string,
	id: string,
	name: string,
	openingFlex: number,
	order: number
) =>
	seed(request, user, `assignments/${id}`, {
		name,
		startDate: '2026-11-16',
		endDate: '2026-11-22',
		terms: [{ from: '2026-11-16', scopePercent: 100, workdayMinutes: 480 }],
		openingFlex,
		standardDay: [],
		archived: false,
		order,
		lastChangeId: null
	});

test('the flex in total and per assignment, and the report not sent', async ({ page, request }) => {
	const user = uid('flex');
	await seedEndedAssignment(request, user, 'a1', 'Uppdrag A', 0, 0);
	await seedEndedAssignment(request, user, 'a2', 'Uppdrag B', 40 * 60 - 90, 1);
	await seed(request, user, 'assignments/a1/codes/c1', {
		name: 'Utveckling',
		billable: true,
		archived: false,
		order: 0
	});
	await seed(request, user, 'assignments/a1/receivers/r1', {
		name: 'Mottagare ett',
		position: 1,
		suggestionMode: 'fillNorm',
		codes: [],
		mapping: {},
		archived: false
	});
	// Uppdrag A: 8 h 30 min a day, Monday to Friday: 42 h 30 min against 40 h is +2,5 h.
	for (const date of ['16', '17', '18', '19', '20'].map((d) => `2026-11-${d}`)) {
		await seed(request, user, `entries/${date}`, {
			assignmentId: 'a1',
			subject: { kind: 'code', codeId: 'c1' },
			time: {
				kind: 'interval',
				start: new Date(atLocalTime(date, '08:00')),
				end: new Date(atLocalTime(date, '16:30'))
			},
			note: '',
			schemaVersion: 1,
			createdAt: new Date(),
			updatedAt: new Date()
		});
	}
	// Uppdrag B: no time in a week of 40 h, after an opening balance of 38 h 30 min: −1,5 h.
	await signIn(page, user);

	await page.getByRole('button', { name: 'Flex +1,0 h' }).click();
	const sheet = page.getByRole('dialog', { name: 'Flex' });
	await expect(sheet.getByRole('button', { name: 'Stäng' })).toBeVisible();
	await expect(sheet.getByText('+2,5 h')).toBeVisible();
	await expect(sheet.getByText('−1,5 h')).toBeVisible();
	await sheet.getByRole('button', { name: 'Stäng' }).click();
	await expect(page.getByText('1 rapport ej skickad')).toBeVisible();
});
