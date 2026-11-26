// Connects the reminder settings to Firestore (issue 22): follows the settings and this device's
// registration, and turns notifications on and off through the notification functions.
import type { FirebaseApp } from 'firebase/app';
import type { Firestore } from 'firebase/firestore';
import type { Functions } from 'firebase/functions';
import { useEffect, useState } from 'react';
import { watchDevice, watchSettings, saveSettings } from '../../data/paminnelser.ts';
import type { Device, Id, Settings } from '../../domain/types.ts';
import {
	deviceId,
	disableNotifications,
	enableNotifications,
	sendTestNotice
} from '../../firebase/notiser.ts';
import { PaminnelserVy } from './PaminnelserVy';

export interface PaminnelserRuttProps {
	db: Firestore;
	functions: Functions;
	app: FirebaseApp;
	/** The Web Push key; null where it is not set up. */
	vapidKey: string | null;
	uid: Id;
	online: boolean;
}

export function PaminnelserRutt({
	db,
	functions,
	app,
	vapidKey,
	uid,
	online
}: PaminnelserRuttProps) {
	const [settings, setSettings] = useState<Settings | null>(null);
	// The id is kept in the browser and appears when notifications are first turned on here.
	const [id, setId] = useState<Id | null>(() => deviceId());
	const [followed, setFollowed] = useState<{ id: Id; device: Device | null } | null>(null);
	useEffect(() => watchSettings(db, uid, setSettings), [db, uid]);
	useEffect(() => {
		if (id) return watchDevice(db, uid, id, (device) => setFollowed({ id, device }));
	}, [db, uid, id]);
	// A registration that was followed under another id (or removed here) is not shown.
	const device = id && followed?.id === id ? followed.device : null;

	if (!settings) return <p className="kh-text-body innehall">Hämtar …</p>;
	return (
		<PaminnelserVy
			settings={settings}
			device={device}
			notificationsConfigured={vapidKey !== null}
			online={online}
			onSave={(next) => saveSettings(db, uid, next)}
			onEnableDevice={async () => {
				const result = await enableNotifications(app, db, uid, vapidKey!);
				setId(deviceId());
				return result;
			}}
			onDisableDevice={async () => {
				await disableNotifications(app, db, uid);
				setId(null);
			}}
			onTest={() => sendTestNotice(functions)}
		/>
	);
}
