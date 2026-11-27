// The start page (mockup "Idag – arbetsdagens hjul", issue 19): the flex on the first row, the wheel
// round the timer's code chip and running time, today's time against the norm, today's intervals
// and gaps, the reports not yet sent, the offline notice and the forgotten-timer question. Gets
// plain values; useStart connects it to Firestore.
import { buttonClass, Chip, EmptyState, Notice, Pill } from '@kodhast/web-ui-react';
import { useState, type ReactNode } from 'react';
import { dayName, minutesLabel, type DayRow } from '../../domain/dag.ts';
import type { CodeColour } from '../../domain/hjul.ts';
import type { Span } from '../../domain/intervall.ts';
import { billingLabel, type Billing } from '../../domain/debitering.ts';
import { flexLabel, isFlexNegative, type Overview } from '../../domain/oversikt.ts';
import { isoWeekOf } from '../../domain/tid.ts';
import {
	choiceNames,
	elapsedLabel,
	timerChoice,
	type CodeChoice,
	type CodeGroup
} from '../../domain/timer.ts';
import type { Entry, Id, IsoDate, Timer, UtcMillis } from '../../domain/types.ts';
import { ExpandIcon, OfflineIcon, WarningIcon, WorkIcon } from '../ikoner';
import { DagRader } from '../dag/DagRader';
import { Sidhuvud } from '../konto';
import { href } from '../rutter.ts';
import { DebiteringArk } from './DebiteringArk';
import { FlexArk } from './FlexArk';
import { GlomdTimer, type GlomdTimerProps } from './GlomdTimer';
import { Hjul, type HjulArc } from './Hjul';
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
	/** Flex, the week, today's time and the unsent reports; null until everything has come. */
	overview?: Overview | null;
	/** This week's and month's billing rate (issue 23); null until the codes have come. */
	billing?: Billing | null;
	/** Today's intervals and gaps, newest first, and their arcs on the wheel. */
	day?: StartDay | null;
	/** The colour of the code the chip shows. */
	chipColour?: CodeColour | null;
	onPause?: (paused: boolean) => void;
	onFill?: (gap: Span) => void;
	/** A press on the running timer's row: the dialog that moves its start (issue 78). */
	onMoveStart?: () => void;
	/** The interval sheet for a gap that is filled, when open. */
	sheet?: ReactNode;
}

export interface StartDay {
	rows: readonly DayRow[];
	arcs: readonly HjulArc[];
	paused: boolean;
	/** The running timer's entry among the rows. */
	runningId: Id | null;
	describe: (entry: Entry) => string;
	accent: (entry: Entry) => string;
}

/** `2026-11-25` → `Onsdag 25 november · vecka 48`. */
const daySubtitle = (date: IsoDate): string =>
	`${dayName(date)} · vecka ${Number(isoWeekOf(date).slice(6))}`;

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
	banner,
	overview = null,
	billing = null,
	day = null,
	chipColour = null,
	onPause = () => {},
	onFill = () => {},
	onMoveStart,
	sheet
}: StartVyProps) {
	const [choosing, setChoosing] = useState(false);
	const [showingFlex, setShowingFlex] = useState(false);
	const [showingBilling, setShowingBilling] = useState(false);
	const billed = billing && billing.perAssignment.length > 0 ? billing : null;
	const current = timer ? timerChoice(timer) : next;
	const names = timer ? timerNames : current && choiceNames(groups, current);
	return (
		<>
			<Sidhuvud title="Idag" subtitle={daySubtitle(today)} bouncing={loading} />
			<div className="innehall">
				{/* The header's end is the account's (issue 66), so the flex is the content's first row. */}
				{((overview && overview.perAssignment.length > 0) || billed) && (
					<div className="flexrad">
						{overview && overview.perAssignment.length > 0 && (
							<Pill
								tone={isFlexNegative(overview.total) ? 'ton-varning' : 'ton-ok'}
								onPress={() => setShowingFlex(true)}
							>
								{`Flex ${flexLabel(overview.total)}`}
							</Pill>
						)}
						{/* Neutral: the app has no target rate (issue 23). */}
						{billed && (
							<Pill onPress={() => setShowingBilling(true)}>
								{`Debiterat ${billingLabel(billed.week)}`}
							</Pill>
						)}
					</div>
				)}
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
						title="Kom igång"
						text="Fyra steg: arbetsgivaren, kunden, uppdraget och dess tidkoder. Sedan kan du starta timern."
						actions={
							<a className={buttonClass({ variant: 'primary' })} href={href({ view: 'kom-igang' })}>
								Kom igång
							</a>
						}
						note="Allt går att ändra sedan under Inställningar."
					/>
				) : (
					<>
						<Hjul arcs={day?.arcs ?? []}>
							<Chip
								icon={
									chipColour && (
										<svg className={`kodprick accent-kod-${chipColour}`} viewBox="0 0 10 10">
											<circle cx="5" cy="5" r="5" />
										</svg>
									)
								}
								trailing={<ExpandIcon />}
								onPress={() => setChoosing(true)}
								aria-label={`Byt tidkod, nu ${names ? `${names.code} i ${names.assignment}` : 'ingen'}`}
							>
								{names?.code || 'Välj tidkod'}
							</Chip>
							<span className="kh-text-big-number tabular">
								{timer ? elapsedLabel(timer.start, now) : '0 min'}
							</span>
							{overview && (
								<span className="kh-text-item-subtitle dampad">
									{`${minutesLabel(overview.todayActual)} av ${minutesLabel(overview.todayNorm)} idag`}
								</span>
							)}
						</Hjul>
						{day && day.rows.length > 0 && (
							<DagRader
								rows={day.rows}
								describe={day.describe}
								accent={day.accent}
								paused={day.paused}
								runningId={day.runningId}
								open={(entry) =>
									entry.id === day.runningId && onMoveStart
										? { onPress: onMoveStart }
										: { href: href({ view: 'dag', date: today }) }
								}
								onFill={onFill}
								onPause={onPause}
							/>
						)}
						<a
							className={buttonClass({ variant: 'text' })}
							href={href({ view: 'dag', date: today })}
						>
							Visa dagen
						</a>
					</>
				)}
				{/* Also when every assignment has ended: their weeks may still need a report. */}
				{overview && overview.unsent > 0 && (
					<div className="kh-pills centrerad">
						<Pill tone="ton-varning">
							{overview.unsent === 1
								? '1 rapport ej skickad'
								: `${overview.unsent} rapporter ej skickade`}
						</Pill>
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
			{overview && (
				<FlexArk isOpen={showingFlex} onOpenChange={setShowingFlex} overview={overview} />
			)}
			{billed && (
				<DebiteringArk
					isOpen={showingBilling}
					onOpenChange={setShowingBilling}
					billing={billed}
					today={today}
				/>
			)}
			{sheet}
			{timer && forgotten && (
				<GlomdTimer key={timer.start} isOpen timer={timer} now={now} {...forgotten} />
			)}
		</>
	);
}
