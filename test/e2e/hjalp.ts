import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { EMULATOR_HOST, EMULATOR_PORTS, EMULATOR_PROJECT_ID } from '../../src/firebase/config.ts';

// What the e2e tests share: signing in against the emulators and made-up data written straight
// into the Firestore emulator. Made-up names only.

export const signIn = async (page: Page, uid: string) => {
	await page.goto('/');
	// Only emulator builds have it (src/firebase/app.ts); the test project has no DOM types.
	await page.waitForFunction('typeof window.testSignIn === "function"');
	await page.evaluate(
		(id) =>
			(globalThis as unknown as { testSignIn: (uid: string) => Promise<string> }).testSignIn(id),
		uid
	);
	await expect(page.getByRole('heading', { level: 1, name: 'Idag' })).toBeVisible();
};

/** A user of the test's own, so that the tests do not see each other's data. */
export const uid = (name: string) => `${name}-${test.info().project.name}-${Date.now()}`;

export const DOCUMENTS = `http://${EMULATOR_HOST}:${EMULATOR_PORTS.firestore}/v1/projects/${EMULATOR_PROJECT_ID}/databases/(default)/documents`;

/** The emulator lets this token past the rules, as an admin. */
const ADMIN = { Authorization: 'Bearer owner' };

type Value = Record<string, unknown>;

const toValue = (value: unknown): Value => {
	if (value === null) return { nullValue: null };
	if (typeof value === 'string') return { stringValue: value };
	if (typeof value === 'boolean') return { booleanValue: value };
	if (typeof value === 'number') return { integerValue: String(value) };
	if (value instanceof Date) return { timestampValue: value.toISOString() };
	if (Array.isArray(value)) return { arrayValue: { values: value.map(toValue) } };
	return { mapValue: { fields: toFields(value as Record<string, unknown>) } };
};

const toFields = (data: Record<string, unknown>) =>
	Object.fromEntries(Object.entries(data).map(([key, value]) => [key, toValue(value)]));

/** Writes a document below the user, past the rules. */
export const seed = async (
	request: APIRequestContext,
	user: string,
	path: string,
	data: Record<string, unknown>
) => {
	const response = await request.patch(`${DOCUMENTS}/users/${user}/${path}`, {
		headers: ADMIN,
		data: { fields: toFields(data) }
	});
	expect(response.ok(), await response.text()).toBe(true);
};

export interface StoredDoc {
	id: string;
	fields: Record<string, Value>;
}

/** The documents of a collection below the user, as the server has them. */
export const stored = async (
	request: APIRequestContext,
	user: string,
	path: string
): Promise<StoredDoc[]> => {
	const response = await request.get(`${DOCUMENTS}/users/${user}/${path}`, { headers: ADMIN });
	expect(response.ok(), await response.text()).toBe(true);
	const body = (await response.json()) as {
		documents?: { name: string; fields: Record<string, Value> }[];
	};
	return (body.documents ?? []).map((d) => ({ id: d.name.split('/').pop()!, fields: d.fields }));
};

/** The common fields, so that the app can update a seeded document under the rules. */
const meta = () => ({ schemaVersion: 1, createdAt: new Date(), updatedAt: new Date() });

/** A made-up assignment with codes, from 2026 on, at 100 % and an eight-hour day. */
export const seedAssignment = async (
	request: APIRequestContext,
	user: string,
	codes: string[],
	id = 'a1',
	name = 'Exempeluppdraget'
) => {
	await seed(request, user, `assignments/${id}`, {
		name,
		startDate: '2026-01-01',
		endDate: null,
		terms: [{ from: '2026-01-01', scopePercent: 100, workdayMinutes: 480 }],
		openingFlex: 0,
		standardDay: [],
		archived: false,
		order: 0,
		lastChangeId: null,
		...meta()
	});
	for (const [order, codeName] of codes.entries()) {
		await seed(request, user, `assignments/${id}/codes/c${order + 1}`, {
			name: codeName,
			billable: true,
			archived: false,
			order,
			...meta()
		});
	}
};

/** Turns a time wheel (a spinbutton) to `value` with the arrow keys, the short way round (issue 93). */
async function turnWheel(wheel: Locator, value: number) {
	const max = Number(await wheel.getAttribute('aria-valuemax'));
	const step = max === 23 ? 1 : 60 - max;
	const count = max === 23 ? 24 : 60 / step;
	const now = Number(await wheel.getAttribute('aria-valuenow')) / step;
	const target = Math.round(value / step);
	let delta = (((target - now) % count) + count) % count;
	if (delta > count / 2) delta -= count;
	await wheel.focus();
	for (let i = 0; i < Math.abs(delta); i++) await wheel.press(delta > 0 ? 'ArrowDown' : 'ArrowUp');
	await expect(wheel).toHaveAttribute('aria-valuenow', String(target * step));
}

/** Turns the wheels named `hourName` and `minuteName` in `scope` to "HH:MM". */
export async function turnWheels(
	scope: Locator,
	time: string,
	{ hourName = 'Timme', minuteName = 'Minut' } = {}
) {
	const [hour, minute] = time.split(':').map(Number) as [number, number];
	await turnWheel(scope.getByRole('spinbutton', { name: hourName }), hour);
	await turnWheel(scope.getByRole('spinbutton', { name: minuteName }), minute);
}

/** Opens the time field labelled `label` in `scope`, turns its wheels to "HH:MM" and presses OK. */
export async function pickTime(page: Page, scope: Locator, label: string, time: string) {
	await scope.getByRole('textbox', { name: label, exact: true }).click();
	const dialog = page.getByRole('dialog', { name: label, exact: true });
	await turnWheels(dialog, time);
	await dialog.getByRole('button', { name: 'OK' }).click();
	await expect(dialog).toBeHidden();
	await expect(scope.getByRole('textbox', { name: label, exact: true })).toHaveValue(time);
}
