// The question when the timer has run more than ten hours (mockup "Timern över 10 h").
import { ConfirmDialog, TimePicker } from '@kodhast/web-ui-react';
import { useState } from 'react';
import { ACTUAL_TIME_STEP } from '../../domain/dag.ts';
import { formatHours } from '../../domain/installningar.ts';
import { clockOf } from '../../domain/tid.ts';
import { durationLabel, parseEnd } from '../../domain/timer.ts';
import type { Minutes, Timer, UtcMillis } from '../../domain/types.ts';
import { Stodtext } from './Stodtext.tsx';

export interface GlomdTimerProps {
	isOpen: boolean;
	timer: Timer;
	now: UtcMillis;
	/** "Uppdrag A · Utveckling". */
	name: string;
	/** The suggested end, from suggestTimerEnd (issue 14). */
	suggestion: UtcMillis;
	/** The workday the suggestion is made of. */
	workday: Minutes;
	onStop: (end: UtcMillis) => void;
	/** "Jag jobbar fortfarande": no question again until the app is opened next time. */
	onDismiss: () => void;
}

export function GlomdTimer({
	isOpen,
	timer,
	now,
	name,
	suggestion,
	workday,
	onStop,
	onDismiss
}: GlomdTimerProps) {
	const [text, setText] = useState(() => clockOf(suggestion));
	const result = parseEnd(text, timer, now);
	const error = 'error' in result ? result.error : undefined;
	return (
		<ConfirmDialog
			isOpen={isOpen}
			onOpenChange={(open) => {
				if (!open) onDismiss();
			}}
			title={`Timern har gått i ${durationLabel(timer.start, now)}`}
			text={`Den startades ${clockOf(timer.start)} i ${name}. När slutade du?`}
			cancelLabel="Jag jobbar fortfarande"
			confirmLabel={'end' in result ? `Stoppa ${clockOf(result.end)}` : 'Stoppa'}
			isConfirmDisabled={error !== undefined}
			onConfirm={() => {
				if ('end' in result) onStop(result.end);
			}}
		>
			<TimePicker
				value={text}
				onChange={setText}
				step={ACTUAL_TIME_STEP}
				hourLabel="Sluttid, timme"
				minuteLabel="Sluttid, minut"
			/>
			<Stodtext error={error}>
				Förval: starten plus en arbetsdag ({formatHours(workday)} h)
			</Stodtext>
		</ConfirmDialog>
	);
}
