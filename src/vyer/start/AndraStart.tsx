// The dialog that moves the running timer's start (issue 78, mockup "Ändra timerns starttid"). The
// same kind of dialog as the forgotten-timer question: the time wheels (issue 93), checked as they turn.
import { ConfirmDialog, Notice, TimePicker } from '@kodhast/web-ui-react';
import { useState } from 'react';
import { ACTUAL_TIME_STEP, overlapping, spanLabel } from '../../domain/dag.ts';
import { clockOf } from '../../domain/tid.ts';
import { elapsedLabel, parseStart } from '../../domain/timer.ts';
import type { Entry, Timer, UtcMillis } from '../../domain/types.ts';
import { OfflineIcon, WarningIcon } from '../ikoner';
import { Stodtext } from './Stodtext.tsx';

const MINUTE = 60_000;

export interface AndraStartProps {
	timer: Timer;
	now: UtcMillis;
	/** "Uppdrag A · Utveckling". */
	name: string;
	/** The suggested start, from suggestStart. */
	suggestion: UtcMillis;
	/** The stopped intervals, for the overlap warning. */
	entries: readonly Entry[];
	/** The move is a transaction, so it needs the network. */
	online: boolean;
	onSave: (start: UtcMillis) => void;
	onClose: () => void;
}

export function AndraStart({
	timer,
	now,
	name,
	suggestion,
	entries,
	online,
	onSave,
	onClose
}: AndraStartProps) {
	const [text, setText] = useState(() => clockOf(suggestion));
	const typed = parseStart(text, timer, now);
	// The field shows whole minutes; the suggestion left as it is keeps its seconds, so that the
	// timer meets the interval before it rather than overlapping it by a few seconds.
	const result =
		'start' in typed && typed.start === Math.floor(suggestion / MINUTE) * MINUTE
			? { start: suggestion }
			: typed;
	// The rules refuse a start that another timer's entry already is named by (`timer-<start>`).
	const taken = 'start' in result && entries.some((e) => e.id === `timer-${result.start}`);
	const error =
		'error' in result
			? result.error
			: taken
				? 'Ett annat intervall från timern börjar på samma tid'
				: undefined;
	const overlap =
		'start' in result && overlapping(entries, { start: result.start, end: now }, null);
	return (
		<ConfirmDialog
			isOpen
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
			title="Ändra starttid"
			text={`Timern går i ${name} sedan ${clockOf(timer.start)}. När började du?`}
			confirmLabel={'start' in result ? `Spara ${clockOf(result.start)}` : 'Spara'}
			isConfirmDisabled={error !== undefined || !online}
			onConfirm={() => {
				if ('start' in result) onSave(result.start);
			}}
		>
			<TimePicker
				value={text}
				onChange={setText}
				step={ACTUAL_TIME_STEP}
				hourLabel="Starttid, timme"
				minuteLabel="Starttid, minut"
			/>
			<Stodtext error={error}>
				{'start' in result && `Timern visar då ${elapsedLabel(result.start, now)}`}
			</Stodtext>
			{overlap && (
				<Notice
					tone="ton-varning"
					icon={<WarningIcon />}
					title={`Överlappar ${spanLabel(overlap)}`}
					detail="Det går att spara, och raden visas som överlapp."
				/>
			)}
			{!online && (
				<Notice
					icon={<OfflineIcon />}
					title="Ingen uppkoppling"
					detail="Starttiden ändras bara med nät, så att ingen annan enhets ändring skrivs över."
				/>
			)}
		</ConfirmDialog>
	);
}
