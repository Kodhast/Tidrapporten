// The start page (mockup "Idag – timern går"): the timer's code chip and running time where the
// wheel goes in issue 19, the offline notice and the forgotten-timer question. Gets plain values;
// useStart connects it to Firestore.
import { buttonClass, Chip, EmptyState, Header, Notice } from '@kodhast/web-ui-react';
import { useState, type ReactNode } from 'react';
import { longDate } from '../../domain/installningar.ts';
import { clockOf, isoWeekOf } from '../../domain/tid.ts';
import {
	choiceNames,
	elapsedLabel,
	timerChoice,
	type CodeChoice,
	type CodeGroup
} from '../../domain/timer.ts';
import type { IsoDate, Timer, UtcMillis } from '../../domain/types.ts';
import { ClockIcon, ExpandIcon, OfflineIcon, WarningIcon, WorkIcon } from '../ikoner';
import { href } from '../rutter.ts';
import { GlomdTimer, type GlomdTimerProps } from './GlomdTimer';
import { KodLista } from './KodLista';

/** Why the last press did not do what it should. */
export type TimerProblem = 'blocked' | 'failed' | null;

export interface StartVyProps {
	today: IsoDate;
	now: UtcMillis;
	/** The running timer; null when none runs. */
	timer: Timer | null;
	/** The running timer's code and assignment, also when the code is no longer in `groups`. */
	timerNames?: { code: string; assignment: string } | null;
	groups: readonly CodeGroup[];
	/** The timer, assignments and codes have not come yet: neither the timer nor the empty state. */
	loading?: boolean;
	/** The code a start uses. */
	next: CodeChoice | null;
	online: boolean;
	problem: TimerProblem;
	onChoose: (choice: CodeChoice) => void;
	/** The forgotten-timer question while the timer has run over ten hours; null otherwise. */
	forgotten: Omit<GlomdTimerProps, 'isOpen' | 'timer' | 'now'> | null;
	/** The budget banner (issue 28). */
	banner?: ReactNode;
}

/** `2026-11-25` → `Onsdag 25 november · vecka 48`. */
const daySubtitle = (date: IsoDate): string =>
	`${longDate(date).replace(/ \d{4}$/, '')} · vecka ${Number(isoWeekOf(date).slice(6))}`;

export function StartVy({
	today,
	now,
	timer,
	timerNames = null,
	groups,
	loading = false,
	next,
	online,
	problem,
	onChoose,
	forgotten,
	banner
}: StartVyProps) {
	const [choosing, setChoosing] = useState(false);
	const current = timer ? timerChoice(timer) : next;
	const names = timer ? timerNames : current && choiceNames(groups, current);
	return (
		<>
			<Header icon={<ClockIcon />} name="Tidrapporten" title="Idag" subtitle={daySubtitle(today)} />
			<div className="innehall">
				{!online && (
					<Notice
						tone="ton-las"
						icon={<OfflineIcon />}
						title="Ingen anslutning"
						detail="Timern går och sparas i telefonen. Resten visar det senast hämtade och kan inte ändras förrän nätet är tillbaka."
					/>
				)}
				{problem === 'blocked' && (
					<Notice
						tone="ton-las"
						icon={<WarningIcon />}
						title="Veckan är skickad"
						detail="Ett intervall i en skickad vecka sparas bara med nät, så att ändringen loggas. Försök igen när nätet är tillbaka."
					/>
				)}
				{problem === 'failed' && (
					<Notice
						tone="ton-fel"
						icon={<WarningIcon />}
						title="Det gick inte att spara timern"
						detail="Den kan ha startats eller stoppats på en annan enhet. Det som visas är det senaste läget."
					/>
				)}
				{banner}
				{loading ? null : groups.length === 0 && !timer ? (
					<EmptyState
						icon={<WorkIcon />}
						title="Inga uppdrag än"
						text="Lägg till ett uppdrag med omfattning och tidkoder. Sedan kan du starta timern."
						actions={
							<a
								className={buttonClass({ variant: 'primary' })}
								href={href({ view: 'uppdrag', id: null })}
							>
								Lägg till uppdrag
							</a>
						}
						note="Har du flex sedan tidigare anger du den som ingående saldo i uppdraget."
					/>
				) : (
					<div className="timer">
						<Chip
							trailing={<ExpandIcon />}
							onPress={() => setChoosing(true)}
							aria-label={`Byt tidkod, nu ${names ? `${names.code} i ${names.assignment}` : 'ingen'}`}
						>
							{names?.code || 'Välj tidkod'}
						</Chip>
						<span className="kh-text-big-number">
							{timer ? elapsedLabel(timer.start, now) : '0 min'}
						</span>
						<span className="kh-text-item-subtitle dampad">
							{timer
								? `Startad ${clockOf(timer.start)}${names?.assignment ? ` · ${names.assignment}` : ''}`
								: 'Timern står still'}
						</span>
					</div>
				)}
			</div>
			<KodLista
				isOpen={choosing}
				onOpenChange={setChoosing}
				groups={groups}
				current={current}
				running={timer !== null}
				onChoose={onChoose}
			/>
			{timer && forgotten && (
				<GlomdTimer key={timer.start} isOpen timer={timer} now={now} {...forgotten} />
			)}
		</>
	);
}
