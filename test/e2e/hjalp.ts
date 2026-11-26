import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
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
		lastChangeId: null
	});
	for (const [order, codeName] of codes.entries()) {
		await seed(request, user, `assignments/${id}/codes/c${order + 1}`, {
			name: codeName,
			billable: true,
			archived: false,
			order
		});
	}
};
