// Connects the start page to Firestore (issues 18 and 19): follows the timer, the assignments with
// their codes and receivers, the entries, the reports, the absence types, the free days and
// today's pause mark, and gives the start page and the tab row's main button. The writes go
// through src/data/skrivning.ts and src/data/dag.ts.
import type { ToolbarAction } from '@kodhast/web-ui-react';
import type { Firestore } from 'firebase/firestore';
import { useEffect, useState, type ReactNode } from 'react';
import { newEntryId, setPause, watchPause } from '../../data/dag.ts';
import {
	absenceTypeCodec,
	assignmentCodec,
	employerCodec,
	freeDayCodec
} from '../../data/dokument.ts';
import {
	absenceTypesPath,
	assignmentsPath,
	employersPath,
	freeDaysPath,
	watchCollection
} from '../../data/installningar.ts';
import {
	moveTimerStart,
	pauseTimer,
	saveEntry,
	startTimer,
	stopPausedTimer,
	stopTimer,
	switchTimer
} from '../../data/skrivning.ts';
import { watchEntries, watchReports, watchTimer } from '../../data/timer.ts';
import { dayRows, entryName, isOnDay } from '../../domain/dag.ts';
import { billing } from '../../domain/debitering.ts';
import { absenceCountings } from '../../domain/flex.ts';
import { freeDaysByDate } from '../../domain/helgdagar.ts';
import { codeColour, wheelArc } from '../../domain/hjul.ts';
import { isTimerForgotten, suggestTimerEnd, type Span } from '../../domain/intervall.ts';
import { fullDayNorm, termsOn } from '../../domain/norm.ts';
import { overview } from '../../domain/oversikt.ts';
import { dateOf } from '../../domain/tid.ts';
import {
	choiceNames,
	elapsedLabel,
	entryBefore,
	isPaused,
	runningEntry as runningTimerEntry,
	startChoice,
	stopBlockedOffline,
	suggestStart,
	timerCodeGroups,
	type CodeChoice,
	type PauseKind
} from '../../domain/timer.ts';
import type {
	AbsenceType,
	Assignment,
	Entry,
	Employer,
	FreeDay,
	Id,
	Report,
	TimeCode,
	Timer,
	UtcMillis
} from '../../domain/types.ts';
import { useCodes, useNow, useReceivers } from '../lyssnare.ts';
import { IntervallArk } from '../dag/IntervallArk';
import type { HjulArc } from './Hjul';
import type { PendingShortcut } from '../genvagar';
import { PlayIcon, StopIcon } from '../ikoner';
import { AndraStart } from './AndraStart';
import { PausArk } from './PausArk';
import { StartVy, type StartDay, type TimerProblem } from './StartVy';

const MINUTE = 60_000;

export interface Start {
	view: ReactNode;
	/** The tab row's main button; none until there is something to start. */
	action: ToolbarAction | undefined;
}

export function useStart(
	db: Firestore,
	uid: Id,
	online: boolean,
	banner: ReactNode,
	/**
	 * The action from the app icon's shortcuts (issue 59), done once when the data has come and
	 * then emptied.
	 */
	shortcut: PendingShortcut | null = null
): Start {
	const now = useNow();
	const today = dateOf(now);
	const [timer, setTimer] = useState<Timer | null | undefined>(undefined);
	const [loadedAssignments, setAssignments] = useState<Assignment[] | null>(null);
	const assignments = loadedAssignments ?? [];
	const [entries, setEntries] = useState<Entry[] | null>(null);
	const [reports, setReports] = useState<Report[] | null>(null);
	const [absenceTypes, setAbsenceTypes] = useState<AbsenceType[] | null>(null);
	const [freeDays, setFreeDays] = useState<FreeDay[] | null>(null);
	const [employers, setEmployers] = useState<Employer[] | null>(null);
	const [pause, setPaused] = useState<{ date: string; paused: boolean } | null>(null);
	// A gap that is being filled in the interval sheet, as in the day view.
	const [filling, setFilling] = useState<{ gap: Span; newId: Id } | null>(null);
	// The running timer whose start is being moved in the dialog (issue 78).
	const [moving, setMoving] = useState<UtcMillis | null>(null);
	// The pause sheet (issue 95): a new lunch or errand, or 'change' for the pause the timer is in.
	const [pausing, setPausing] = useState<PauseKind | 'change' | null>(null);
	const [picked, setPicked] = useState<CodeChoice | null>(null);
	const [problem, setProblem] = useState<TimerProblem>(null);
	// The timer whose ten-hour question was answered "Jag jobbar fortfarande", until the app is
	// opened again.
	const [dismissed, setDismissed] = useState<UtcMillis | null>(null);

	// A listener that fails (a refused read, an ended session) leaves the page loading; the notice
	// says why.
	const failed = () => setProblem('failed');
	useEffect(() => watchTimer(db, uid, setTimer, failed), [db, uid]);
	useEffect(
		() => watchCollection(db, uid, assignmentsPath, assignmentCodec, setAssignments),
		[db, uid]
	);
	// All entries and reports: flex counts every week. Listening from the start, the reports of the
	// timer's weeks are known before the app goes offline.
	// A failed read leaves no entries rather than a page that waits for them, and the notice says why.
	useEffect(
		() =>
			watchEntries(db, uid, setEntries, () => {
				setEntries((known) => known ?? []);
				failed();
			}),
		[db, uid]
	);
	useEffect(() => watchReports(db, uid, setReports, failed), [db, uid]);
	useEffect(
		() => watchCollection(db, uid, absenceTypesPath, absenceTypeCodec, setAbsenceTypes),
		[db, uid]
	);
	useEffect(() => watchCollection(db, uid, freeDaysPath, freeDayCodec, setFreeDays), [db, uid]);
	useEffect(() => watchCollection(db, uid, employersPath, employerCodec, setEmployers), [db, uid]);
	useEffect(
		() => watchPause(db, uid, today, (paused) => setPaused({ date: today, paused }), failed),
		[db, uid, today]
	);
	useEffect(() => {
		const shown = () => {
			if (document.visibilityState === 'visible') setDismissed(null);
		};
		document.addEventListener('visibilitychange', shown);
		return () => document.removeEventListener('visibilitychange', shown);
	}, []);

	const assignmentIds = assignments.map((a) => a.id);
	const codes = useCodes(db, uid, assignmentIds);
	const receivers = useReceivers(db, uid, assignmentIds);
	const groups = timerCodeGroups(assignments, codes, today);
	// Until the timer, the assignments and their codes have come, nothing is offered: no empty
	// state that is not true, and no start with the wrong code.
	const loading =
		timer === undefined ||
		loadedAssignments === null ||
		reports === null ||
		entries === null ||
		assignments.some((a) => codes[a.id] === undefined);
	const next = picked && choiceNames(groups, picked) ? picked : startChoice(groups, entries ?? []);

	const write = (save: () => Promise<unknown>) => {
		setProblem(null);
		// Offline the promise waits for the server; a refusal comes later and is shown then.
		save().catch(() => setProblem('failed'));
	};

	const blocked = (running: Timer, end: UtcMillis) => {
		if (!stopBlockedOffline(running, end, reports ?? [], online)) return false;
		setProblem('blocked');
		return true;
	};

	// In a pause (issue 95) the interval before it is written, so the stop only empties the timer.
	const stopTimerAt = (running: Timer, end: UtcMillis, known: readonly Report[]) =>
		running.start > end ? stopPausedTimer(db, uid) : stopTimer(db, uid, running, end, known);

	const stopAt = (running: Timer, end: UtcMillis) => {
		if (blocked(running, end)) return;
		setDismissed(null);
		setPicked(null);
		write(() => stopTimerAt(running, end, reports ?? []));
	};

	const start = (choice: CodeChoice) => {
		setPicked(null);
		write(() =>
			startTimer(db, uid, {
				assignmentId: choice.assignmentId,
				subject: { kind: 'code', codeId: choice.codeId },
				start: Date.now()
			})
		);
	};

	const choose = (choice: CodeChoice) => {
		if (!timer) return setPicked(choice);
		// A forgotten timer asks when the work ended first, as the stop does.
		if (isTimerForgotten(timer, Date.now())) return setDismissed(null);
		const at = Date.now();
		if (blocked(timer, at)) return;
		write(() =>
			switchTimer(
				db,
				uid,
				timer,
				{ assignmentId: choice.assignmentId, subject: { kind: 'code', codeId: choice.codeId } },
				at,
				reports ?? []
			)
		);
	};

	const timerAssignment = timer && assignments.find((a) => a.id === timer.assignmentId);
	const forgotten = timer ? isTimerForgotten(timer, now) : false;
	const asking = timer && forgotten && dismissed !== timer.start;
	const terms = timerAssignment && termsOn(timerAssignment, dateOf(timer.start));
	const workday = terms ? fullDayNorm(terms) : 8 * 60;
	const names = timer && timerNames(assignments, codes, timer);

	// The running timer counts as an interval up to now: on the wheel, in today's list and in flex.
	// In a pause nothing runs (issue 95).
	const runningEntry = runningTimerEntry(timer ?? null, now);
	const paused = timer ? isPaused(timer, now) : false;
	const beforePause = timer && paused ? entryBefore(timer, entries ?? []) : null;
	const pauseFrom =
		beforePause?.time.kind === 'interval' ? beforePause.time.end : timer ? timer.start : now;
	const withTimer = [...(entries ?? []), ...(runningEntry ? [runningEntry] : [])];
	const known =
		!loading &&
		absenceTypes !== null &&
		freeDays !== null &&
		employers !== null &&
		assignments.every((a) => receivers[a.id] !== undefined);
	const summary =
		known &&
		overview({
			assignments,
			employers,
			receivers,
			entries: entries ?? [],
			reports: reports ?? [],
			freeDays: freeDaysByDate(freeDays),
			countings: absenceCountings(absenceTypes),
			timer: timer ?? null,
			now
		});
	// The billing rate (issue 23) needs the codes, which have come when the page is no longer loading.
	const billed =
		!loading && entries !== null
			? billing({ assignments, codes, entries, timer: timer ?? null, now })
			: null;
	const colourOf = (entry: Pick<Entry, 'assignmentId' | 'subject'>) => codeColour(entry, codes);
	const todays = withTimer.filter((e) => isOnDay(e, today));
	const day: StartDay | null = loading
		? null
		: {
				// Newest first, as the mockup shows the day.
				rows: dayRows(todays, today).reverse(),
				arcs: todays.flatMap((entry): HjulArc[] => {
					const arc = wheelArc(entry, today);
					return arc
						? [{ ...arc, colour: colourOf(entry), running: entry.id === runningEntry?.id }]
						: [];
				}),
				paused: pause?.date === today && pause.paused,
				runningId: runningEntry?.id ?? null,
				describe: (entry) => entryName(entry, assignments, codes, absenceTypes ?? []),
				accent: (entry) => `accent-kod-${colourOf(entry)}`
			};
	const chipColour = timer
		? colourOf(timer)
		: next &&
			colourOf({ assignmentId: next.assignmentId, subject: { kind: 'code', codeId: next.codeId } });

	// The shortcut does what the main button would do, once: it is marked done, so that neither a
	// rerender, StrictMode's second effect run nor a new sign-in in the same tab does it again. A forgotten timer is not stopped; its question shows as on any start. A
	// stop the network blocks waits for the network (the app starts as offline until it knows).
	useEffect(() => {
		const action = shortcut?.action;
		if (!shortcut || !action || loading) return;
		const at = Date.now();
		const known = reports ?? [];
		if (action === 'stoppa' && timer && stopBlockedOffline(timer, at, known, online)) return;
		shortcut.done();
		let save: (() => Promise<unknown>) | null = null;
		if (action === 'starta' && !timer && next) {
			const { assignmentId, codeId } = next;
			save = () =>
				startTimer(db, uid, { assignmentId, subject: { kind: 'code', codeId }, start: at });
		}
		if (action === 'stoppa' && timer && !isTimerForgotten(timer, at)) {
			save = () =>
				timer.start > at ? stopPausedTimer(db, uid) : stopTimer(db, uid, timer, at, known);
		}
		save?.().catch(() => setProblem('failed'));
	}, [db, uid, shortcut, loading, timer, next, reports, online]);

	const code = names?.code ?? '';
	const pauseArc =
		timer && paused
			? wheelArc(
					{
						id: 'paus',
						assignmentId: timer.assignmentId,
						subject: timer.subject,
						time: { kind: 'interval', start: pauseFrom, end: timer.start },
						note: ''
					},
					today
				)
			: null;

	let action: ToolbarAction | undefined;
	if (loading) {
		action = undefined;
	} else if (timer) {
		action = {
			label: 'Stoppa timern',
			icon: <StopIcon />,
			// A forgotten timer asks when the work ended instead of stopping now.
			onPress: () => (forgotten ? setDismissed(null) : stopAt(timer, Date.now()))
		};
	} else if (next) {
		action = { label: 'Starta timern', icon: <PlayIcon />, onPress: () => start(next) };
	}

	return {
		action,
		view: (
			<StartVy
				today={today}
				now={now}
				timer={timer ?? null}
				timerNames={names ?? null}
				groups={groups}
				loading={loading}
				next={next}
				online={online}
				// The block is about the network; once it is back the stop can be pressed again.
				problem={problem === 'blocked' && online ? null : problem}
				onChoose={choose}
				banner={banner}
				overview={summary || null}
				billing={billed}
				day={day}
				chipColour={chipColour}
				onPause={(on) => write(() => setPause(db, uid, today, on))}
				onFill={(gap) => setFilling({ gap, newId: newEntryId(db, uid) })}
				onMoveStart={() => timer && setMoving(timer.start)}
				onPauseTimer={timer && !paused && !forgotten ? setPausing : null}
				pause={
					timer && paused
						? {
								until: timer.start,
								shown:
									beforePause?.time.kind === 'interval'
										? elapsedLabel(beforePause.time.start, beforePause.time.end)
										: '0 min',
								arc: pauseArc,
								online,
								onResume: () => write(() => moveTimerStart(db, uid, timer, Date.now())),
								onChange: () => setPausing('change')
							}
						: null
				}
				sheet={
					timer && pausing && (pausing === 'change') === paused ? (
						<PausArk
							key={`${pausing}-${timer.start}`}
							kind={pausing === 'change' ? null : pausing}
							timer={timer}
							now={now}
							code={code}
							from={pausing === 'change' ? pauseFrom : null}
							online={online}
							onSave={(pause) => {
								if (pausing === 'change') {
									write(() => moveTimerStart(db, uid, timer, pause.until));
								} else if (!blocked(timer, pause.from)) {
									const marked = day?.paused === true && dateOf(pause.from) === today;
									write(() => pauseTimer(db, uid, timer, pause, reports ?? [], marked));
								}
							}}
							onClose={() => setPausing(null)}
						/>
					) : timer && moving === timer.start ? (
						<AndraStart
							timer={timer}
							now={now}
							name={names ? [names.assignment, names.code].filter(Boolean).join(' · ') : ''}
							suggestion={suggestStart(timer, entries ?? [])}
							entries={entries ?? []}
							online={online}
							onSave={(start) => write(() => moveTimerStart(db, uid, timer, start))}
							onClose={() => setMoving(null)}
						/>
					) : (
						filling && (
							<IntervallArk
								key={filling.newId}
								isOpen
								onOpenChange={(isOpen) => !isOpen && setFilling(null)}
								date={today}
								entry={null}
								newId={filling.newId}
								span={filling.gap}
								// The code of the interval before the gap, as the day view does.
								choice={startChoice(
									groups,
									(entries ?? []).filter(
										(e) => e.time.kind === 'interval' && e.time.end <= filling.gap.start
									)
								)}
								groups={groups}
								absenceTypes={(absenceTypes ?? [])
									.filter((t) => !t.archived)
									.sort((a, b) => a.order - b.order)}
								entries={todays}
								reports={reports ?? []}
								online={online}
								onSave={(before, after, reason) =>
									write(() => saveEntry(db, uid, before, after, reports ?? [], reason))
								}
							/>
						)
					)
				}
				forgotten={
					timer && asking
						? {
								name: names ? [names.assignment, names.code].filter(Boolean).join(' · ') : '',
								suggestion: timerAssignment
									? suggestTimerEnd(timer, timerAssignment, now)
									: Math.min(timer.start + workday * MINUTE, now),
								workday,
								onStop: (end) => stopAt(timer, end),
								onDismiss: () => setDismissed(timer.start)
							}
						: null
				}
			/>
		)
	};
}

/** The running timer's code and assignment, also when the code is archived or the assignment ended. */
const timerNames = (
	assignments: readonly Assignment[],
	codes: Readonly<Record<Id, readonly TimeCode[]>>,
	timer: Timer
): { code: string; assignment: string } => {
	const codeId = timer.subject.kind === 'code' ? timer.subject.codeId : '';
	return {
		assignment: assignments.find((a) => a.id === timer.assignmentId)?.name ?? '',
		code: (codes[timer.assignmentId] ?? []).find((c) => c.id === codeId)?.name ?? ''
	};
};
