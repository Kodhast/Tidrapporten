import { expect, test } from '@playwright/test';
import { seedAssignment, signIn, stored, uid } from './hjalp.ts';

// The standard day against the emulators (issue 24): it is set on the assignment and offered on
// an empty workday, which gets its intervals with one press. Tuesday 24 November 2026 is an
// ordinary workday in the past; the assignment and codes are made up.

test('a standard day is set on the assignment and added on an empty day', async ({
	page,
	request
}) => {
	const user = uid('standarddag');
	await seedAssignment(request, user, ['Utveckling', 'Möten']);
	await signIn(page, user);

	await page.goto('/#/installningar/uppdrag/a1');
	const addSlot = async (start: string, end: string, code: string) => {
		await page.getByRole('button', { name: 'Lägg till pass' }).click();
		const sheet = page.getByRole('dialog', { name: 'Pass i standarddagen' });
		await sheet.getByLabel('Start').fill(start);
		await sheet.getByLabel('Slut').fill(end);
		await sheet.getByRole('button', { name: code }).click();
		await sheet.getByRole('button', { name: 'Klar' }).click();
		await expect(sheet).toBeHidden();
	};
	await addSlot('08:00', '12:00', 'Utveckling');
	await addSlot('12:45', '16:45', 'Möten');
	await page.getByRole('button', { name: 'Spara' }).click();
	await expect(page.getByRole('button', { name: 'Spara' })).toBeDisabled();

	await page.goto('/#/dag/2026-11-24');
	await expect(page.getByText('FÖRSLAG · STANDARDDAG')).toBeVisible();
	await expect(page.getByText('Summa 8 h')).toBeVisible();
	await page.getByRole('button', { name: 'Lägg in' }).click();

	await expect(page.getByRole('button', { name: /08:00–12:00/ })).toBeVisible();
	await expect(page.getByRole('button', { name: /12:45–16:45/ })).toBeVisible();
	await expect(page.getByText('Lucka 12:00–12:45')).toBeVisible();
	await expect(page.getByText('FÖRSLAG · STANDARDDAG')).toBeHidden();
	await expect.poll(async () => (await stored(request, user, 'entries')).length).toBe(2);
});
