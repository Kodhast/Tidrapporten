// What the settings views share: the offline notice, a failed save, the save state and a choice
// among named items.
import { BottomSheet, Notice, Row } from '@kodhast/web-ui-react';
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

export interface ChoiceRowProps {
	label: string;
	/** The items to choose among; `''` is "none" when `noneLabel` is given. */
	options: readonly { id: string; name: string }[];
	value: string;
	onChange: (id: string) => void;
	/** The choice that clears it, e.g. "Ingen kund"; without it a value must be chosen. */
	noneLabel?: string;
	/** Shown while nothing is chosen. */
	placeholder?: string;
	error?: string;
}

/** A row that shows the chosen item and opens a sheet with the others. */
export function ChoiceRow({
	label,
	options,
	value,
	onChange,
	noneLabel,
	placeholder = 'Välj',
	error
}: ChoiceRowProps) {
	const [open, setOpen] = useState(false);
	const all = noneLabel ? [...options, { id: '', name: noneLabel }] : options;
	const chosen = all.find((o) => o.id === value)?.name;
	const pick = (id: string) => {
		onChange(id);
		setOpen(false);
	};
	return (
		<>
			<div className="kh-card radlista">
				<Row
					title={label}
					subtitle={error ?? chosen ?? placeholder}
					accentClass={error ? 'accent-fel' : undefined}
					onPress={() => setOpen(true)}
					navigates
				/>
			</div>
			<BottomSheet title={label} isOpen={open} onOpenChange={setOpen}>
				<div className="radlista">
					{all.map((o) => (
						<Row key={o.id} title={o.name} tinted={o.id === value} onPress={() => pick(o.id)} />
					))}
				</div>
			</BottomSheet>
		</>
	);
}
