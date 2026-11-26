// The reminder settings and this device's registration for notifications (issue 22). The
// settings are one document, `state/settings`, written in a transaction like the other settings
// (they need the server); a device is `devices/{id}` with its Cloud Messaging token. What is due
// and when is decided by the scheduled function (firebase-functions/src/paminnelser.ts).
import {
	deleteDoc,
	onSnapshot,
	runTransaction,
	type DocumentData,
	type Firestore
} from 'firebase/firestore';
import type { Device, Id, Settings } from '../domain/types.ts';
import { DEFAULT_SETTINGS, deviceCodec, settingsCodec } from './dokument.ts';
import { createMeta, updateMeta } from './kodning.ts';
import { userDoc } from './skrivning.ts';

const SETTINGS = 'state/settings';

/** Follows the settings; a user who has not saved any gets the defaults. */
export const watchSettings = (db: Firestore, uid: Id, onChange: (settings: Settings) => void) =>
	onSnapshot(userDoc(db, uid, SETTINGS), (snapshot) =>
		onChange(
			snapshot.exists() ? settingsCodec.fromData('settings', snapshot.data()) : DEFAULT_SETTINGS
		)
	);

/** Creates the document, or updates it so that createdAt stays. */
const put = (db: Firestore, uid: Id, path: string, data: DocumentData): Promise<void> =>
	runTransaction(db, async (tx) => {
		const ref = userDoc(db, uid, path);
		if ((await tx.get(ref)).exists()) tx.update(ref, { ...data, ...updateMeta() });
		else tx.set(ref, { ...data, ...createMeta() });
	});

export const saveSettings = (db: Firestore, uid: Id, settings: Settings): Promise<void> =>
	put(db, uid, SETTINGS, settingsCodec.toData(settings));

const devicePath = (id: Id) => `devices/${id}`;

/** Follows one device; null when it is not registered (or was removed as gone). */
export const watchDevice = (
	db: Firestore,
	uid: Id,
	id: Id,
	onChange: (device: Device | null) => void
) =>
	onSnapshot(userDoc(db, uid, devicePath(id)), (snapshot) =>
		onChange(snapshot.exists() ? deviceCodec.fromData(snapshot.id, snapshot.data()) : null)
	);

/** Registers the device, or gives it the token it has now. */
export const saveDevice = (db: Firestore, uid: Id, device: Device): Promise<void> =>
	put(db, uid, devicePath(device.id), deviceCodec.toData(device));

export const removeDevice = (db: Firestore, uid: Id, id: Id): Promise<void> =>
	deleteDoc(userDoc(db, uid, devicePath(id)));
