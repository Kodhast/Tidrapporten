// What the settings views share: the offline notice, a failed save and the save state.
import { Notice } from '@kodhast/web-ui-react';
import { useState } from 'react';
import { OfflineIcon, WarningIcon } from '../ikoner';

/** Shown while offline: everything in the settings needs the network (#4 point 3, ADR 0012). */
export const OfflineNotice = ({ online }: { online: boolean }) =>
	online ? null : (
		<Notice
			tone="ton-las"
			icon={<OfflineIcon />}
			title="Ingen anslutning"
			detail="Inställningarna visar det senast hämtade och kan inte sparas förrän nätet är tillbaka."
		/>
	);

export const SaveFailed = ({ failed }: { failed: boolean }) =>
	failed ? (
		<Notice
			tone="ton-fel"
			icon={<WarningIcon />}
			title="Det gick inte att spara"
			detail="Kontrollera anslutningen och försök igen."
		/>
	) : null;

/** Runs a save once at a time; `failed` stays until the next try. */
export const useSave = () => {
	const [pending, setPending] = useState(false);
	const [failed, setFailed] = useState(false);
	const run = async (save: () => Promise<void>): Promise<boolean> => {
		setPending(true);
		setFailed(false);
		try {
			await save();
			return true;
		} catch {
			setFailed(true);
			return false;
		} finally {
			setPending(false);
		}
	};
	return { pending, failed, run };
};
