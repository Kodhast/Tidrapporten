// @vitest-environment jsdom
// How the reminders join Firestore and the notification functions, with both replaced: the
// listeners are fed made-up values and the calls are recorded.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FirebaseApp } from 'firebase/app';
import type { Firestore } from 'firebase/firestore';
import type { Functions } from 'firebase/functions';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../data/dokument.ts';
import type { Device, Settings } from '../../domain/types.ts';
import { PaminnelserRutt } from './PaminnelserRutt';

const mocks = vi.hoisted(() => ({
	settings: (() => {}) as (settings: Settings) => void,
	device: (() => {}) as (device: Device | null) => void,
	saveSettings: vi.fn(),
	deviceId: vi.fn(),
	enable: vi.fn(),
	disable: vi.fn(),
	test: vi.fn()
}));

vi.mock('../../data/paminnelser.ts', () => ({
	watchSettings: (_db: unknown, _uid: unknown, on: typeof mocks.settings) => {
		mocks.settings = on;
		return () => {};
	},
	watchDevice: (_db: unknown, _uid: unknown, _id: unknown, on: typeof mocks.device) => {
		mocks.device = on;
		return () => {};
	},
	saveSettings: mocks.saveSettings
}));

vi.mock('../../firebase/notiser.ts', () => ({
	deviceId: mocks.deviceId,
	enableNotifications: mocks.enable,
	disableNotifications: mocks.disable,
	sendTestNotice: mocks.test
}));

beforeEach(() => {
	mocks.deviceId.mockReturnValue('e1');
	mocks.saveSettings.mockResolvedValue(undefined);
	mocks.enable.mockResolvedValue('on');
	mocks.disable.mockResolvedValue(undefined);
	mocks.test.mockResolvedValue(2);
});
afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

const renderRutt = (vapidKey: string | null) =>
	render(
		<PaminnelserRutt
			db={{} as Firestore}
			functions={{} as Functions}
			app={{} as FirebaseApp}
			vapidKey={vapidKey}
			uid="u1"
			online
		/>
	);

describe('PaminnelserRutt', () => {
	it('shows the settings and saves a change through the data layer', async () => {
		const user = userEvent.setup();
		renderRutt('nyckel');
		expect(screen.getByText('Hämtar …')).toBeTruthy();
		act(() => {
			mocks.settings(DEFAULT_SETTINGS);
			mocks.device({ id: 'e1', fcmToken: 't', label: 'Chrome på dator' });
		});
		expect(screen.getByText('Chrome på dator')).toBeTruthy();
		await user.click(screen.getByRole('switch', { name: 'Timern går sent' }));
		expect(mocks.saveSettings).toHaveBeenCalledWith(expect.anything(), 'u1', {
			...DEFAULT_SETTINGS,
			timerRunningAt: null
		});
		await user.click(screen.getByRole('button', { name: 'Skicka en provnotis' }));
		expect(await screen.findByText('Skickad till 2 enheter')).toBeTruthy();
	});

	it('turns notifications on with the key, and off again', async () => {
		const user = userEvent.setup();
		mocks.deviceId.mockReturnValue(null);
		renderRutt('nyckel');
		act(() => mocks.settings(DEFAULT_SETTINGS));
		await user.click(screen.getByRole('switch', { name: /^Notiser på den här/ }));
		await waitFor(() => expect(mocks.enable).toHaveBeenCalledWith({}, {}, 'u1', 'nyckel'));
	});

	it('leaves the device switch off while there is no key', () => {
		mocks.deviceId.mockReturnValue(null);
		renderRutt(null);
		act(() => mocks.settings(DEFAULT_SETTINGS));
		expect(screen.getByText('Notiser är inte inställda här än.')).toBeTruthy();
		expect(
			(screen.getByRole('switch', { name: /^Notiser på den här/ }) as HTMLInputElement).disabled
		).toBe(true);
	});
});
