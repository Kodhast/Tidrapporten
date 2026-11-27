// The sheet that puts a lunch or an errand on the running timer, or changes the pause the timer is
// in (issue 95, mockup "Paus på timern"): when it began, on the time wheels, and how long it is. The
// timer goes on by itself when the pause ends.
import { BottomSheet, Button, Notice, SegmentedChoice, TimeField } from '@kodhast/web-ui-react';
import { useState } from 'react';
import { ACTUAL_TIME_STEP } from '../../domain/dag.ts';
import { clockOf } from '../../domain/tid.ts';
import {
	DEFAULT_PAUSE,
	PAUSE_LENGTHS,
	PAUSE_NAMES,
	parsePause,
	type Pause,
	type PauseKind
} from '../../domain/timer.ts';
import type { Timer, UtcMillis } from '../../domain/types.ts';
import { OfflineIcon } from '../ikoner';

const MINUTE = 60_000;

const lengthLabel = (minutes: number) => (minutes === 60 ? '1 h' : `${minutes} min`);

const storageKey = (kind: PauseKind) => `tidrapporten.paus.${kind}`;

/** The length last chosen for the kind on this device; the default when none, or no storage. */
export const lastLength = (kind: PauseKind): number => {
	try {
		const stored = Number(localStorage.getItem(storageKey(kind)));
		return (PAUSE_LENGTHS as readonly number[]).includes(stored) ? stored : DEFAULT_PAUSE[kind];
	} catch {
		return DEFAULT_PAUSE[kind];
	}
};

const rememberLength = (kind: PauseKind, minutes: number) => {
	try {
		localStorage.setItem(storageKey(kind), String(minutes));
	} catch {
		// Without storage the default is chosen next time.
	}
};

/** The offered length nearest to `minutes`, for a pause that is changed. */
const nearestLength = (minutes: number): number =>
	PAUSE_LENGTHS.reduce((best, length) =>
		Math.abs(length - minutes) < Math.abs(best - minutes) ? length : best
	);

export interface PausArkProps {
	/** A new lunch or errand on the running timer; null to change the pause the timer is in. */
	kind: PauseKind | null;
	timer: Timer;
	now: UtcMillis;
	/** The timer's code, which the pause is taken from. */
	code: string;
	/** Where the pause the timer is in began; only when it is changed. */
	from?: UtcMillis | null;
	/** A change of the pause moves the timer in a transaction, so it needs the network. */
	online: boolean;
	onSave: (pause: Pause) => void;
	onClose: () => void;
}

export function PausArk({
	kind,
	timer,
	now,
	code,
	from = null,
	online,
	onSave,
	onClose
}: PausArkProps) {
	const changing = kind === null;
	const [start, setStart] = useState(() => clockOf(from ?? now));
	const [minutes, setMinutes] = useState(() =>
		kind ? lastLength(kind) : nearestLength(Math.round((timer.start - (from ?? now)) / MINUTE))
	);
	const result =
		changing && from !== null
			? { pause: { from, until: from + minutes * MINUTE } }
			: parsePause(start, minutes, timer, now);
	const name = kind ? PAUSE_NAMES[kind] : 'Paus';
	const blocked = changing && !online;

	return (
		<BottomSheet
			isOpen
			onOpenChange={(open) => !open && onClose()}
			title={changing ? 'Ändra pausen' : name}
			subtitle={`Räknas av från ${code || 'timern'}. Timern fortsätter själv när pausen är slut.`}
			footer={
				<div className="ark-fot">
					<span />
					<Button
						variant="primary"
						isDisabled={'error' in result || blocked}
						onPress={() => {
							if (!('pause' in result)) return;
							if (kind) rememberLength(kind, minutes);
							onSave(result.pause);
							onClose();
						}}
					>
						{'pause' in result
							? `${name} ${clockOf(result.pause.from)}–${clockOf(result.pause.until)}`
							: name}
					</Button>
				</div>
			}
		>
			{changing ? (
				<p className="kh-text-body">{`Började ${clockOf(from ?? timer.start)}`}</p>
			) : (
				<TimeField
					label="Började"
					step={ACTUAL_TIME_STEP}
					value={start}
					onChange={setStart}
					description="Nu, eller tidigare om du glömde trycka."
					errorMessage={'error' in result ? result.error : undefined}
				/>
			)}
			<section className="sektion">
				<span className="kh-text-caption dampad" id="paus-langd">
					LÄNGD
				</span>
				<SegmentedChoice
					aria-labelledby="paus-langd"
					options={PAUSE_LENGTHS.map((length) => ({
						value: String(length),
						label: lengthLabel(length)
					}))}
					value={String(minutes)}
					onChange={(value) => setMinutes(Number(value))}
				/>
			</section>
			{blocked && (
				<Notice
					icon={<OfflineIcon />}
					title="Ingen uppkoppling"
					detail="Pausen ändras bara med nät, så att ingen annan enhets ändring skrivs över."
				/>
			)}
		</BottomSheet>
	);
}
