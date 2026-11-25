// Cloud Functions for Tidrapporten. They import the calculations from src/domain/ directly, and
// `npm run build:functions` bundles those into lib/ next to the npm packages listed in
// firebase-functions/package.json (decision 0014). Only the wiring to Google's clients lives here;
// the behaviour is in the files it imports, which run in Vitest.
import { CloudBillingClient } from '@google-cloud/billing';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { handleBudget, type BudgetEffects } from './budget.ts';

initializeApp();

const REGION = 'europe-west1';

let billing: CloudBillingClient | undefined;
const billingClient = () => (billing ??= new CloudBillingClient());

const budgetEffects: BudgetEffects = {
	ownProject: process.env.GCLOUD_PROJECT ?? '',
	writeStatus: async (status) => {
		await getFirestore()
			.doc('system/budget')
			.set({ ...status, schemaVersion: 1, updatedAt: FieldValue.serverTimestamp() });
	},
	billingEnabled: async (projectId) => {
		const [info] = await billingClient().getProjectBillingInfo({ name: `projects/${projectId}` });
		return info.billingEnabled === true;
	},
	disableBilling: async (projectId) => {
		// An empty billing account unlinks it, which turns billing off (Cloud Billing API).
		await billingClient().updateProjectBillingInfo({
			name: `projects/${projectId}`,
			projectBillingInfo: { billingAccountName: '' }
		});
	},
	info: (message, fields) => logger.info(message, fields),
	error: (message, fields) => logger.error(message, fields)
};

/**
 * Runs in the drift project only (release.yml), as tidrapporten-budget: Cloud Datastore User in
 * drift and Project Billing Manager in test, nothing more (docs/drift.md).
 */
export const budget = onMessagePublished(
	{
		topic: 'budget',
		region: REGION,
		// The account exists only in drift, so a deploy anywhere else fails.
		serviceAccount: 'tidrapporten-budget@',
		retry: false,
		maxInstances: 1
	},
	async (event) => {
		let json: unknown = null;
		try {
			json = event.data.message.json;
		} catch {
			// Not JSON: handleBudget logs it as an unknown message.
		}
		await handleBudget(json, budgetEffects);
	}
);
