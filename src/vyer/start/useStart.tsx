// Connects the start page to Firestore (issue 18): follows the timer, the assignments and their
// codes, the latest intervals and the reports of the timer's weeks, and gives the start page and
// the tab row's main button. The writes go through src/data/skrivning.ts.
import type { ToolbarAction } from '@kodhast/web-ui-react';
import type { Firestore } from 'firebase/firestore';
import { useEffect, useState, type ReactNode } from 'react';
import { codeCodec, assignmentCodec } from '../../data/dokument.ts';
import { assignmentsPath, codesPath, watchCollection } from '../../data/installningar.ts';
import { startTimer, stopTimer, switchTimer } from '../../data/skrivning.ts';
import { watchLatestEntries, watchReportsFrom, watchTimer } from '../../data/timer.ts';
import { isTimerForgotten, suggestTimerEnd } from '../../domain/intervall.ts';
import { fullDayNorm, termsOn } from '../../domain/norm.ts';
import { dateOf, isoWeekOf } from '../../domain/tid.ts';
import {
	choiceNames,
	startChoice,
	stopBlockedOffline,
	timerCodeGroups,
	type CodeChoice
} from '../../domain/timer.ts';
import type {
	Assignment,
	Entry,
	Id,
	Report,
	TimeCode,
	Timer,
	UtcMillis
} from '../../domain/types.ts';
import { PlayIcon, StopIcon } from '../ikoner';
import { StartVy, type TimerProblem } from './StartVy';

const MINUTE = 60_000;

/** The time, moved on at each whole minute and when the app is shown again. */
const useNow = (): UtcMillis => {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		let timeout: ReturnType<typeof setTimeout>;
		const tick = () => {
			setNow(Date.now());
			timeout = setTimeout(tick, MINUTE - (Date.now() % MINUTE));
		};
		timeout = setTimeout(tick, MINUTE - (Date.now() % MINUTE));
		const shown = () => {
			if (document.visibilityState === 'visible') setNow(Date.now());
		};
		document.addEventListener('visibilitychange', shown);
		return () => {
			clearTimeout(timeout);
			document.removeEventListener('visibilitychange', shown);
		};
	}, []);
	return now;
};

/** The codes of every assignment, by assignment id. */
const useCodes = (db: Firestore, uid: Id, assignmentIds: readonly Id[]) => {
	const [codes, setCodes] = useState<Record<Id, TimeCode[]>>({});
	const key = assignmentIds.join(',');
	useEffect(() => {
		const stops = key
			.split(',')
			.filter(Boolean)
			.map((id) =>
				watchCollection(
					db,
					uid,
					codesPath(id),
					codeCodec,
					(values) => setCodes((c) => ({ ...c, [id]: values })),
					id
				)
			);
		return () => stops.forEach((stop) => stop());
	}, [db, uid, key]);
	return codes;
};

export interface Start {
	view: ReactNode;
	/** The tab row's main button; none until there is something to start. */
	action: ToolbarAction | undefined;
}

export function useStart(db: Firestore, uid: Id, online: boolean, banner: ReactNode): Start {
	const now = useNow();
	const today = dateOf(now);
	const [timer, setTimer] = useState<Timer | null | undefined>(undefined);
	const [loadedAssignments, setAssignments] = useState<Assignment[] | null>(null);
	const assignments = loadedAssignments ?? [];
	const [latest, setLatest] = useState<Entry[]>([]);
	const [reports, setReports] = useState<Report[]>([]);
	const [picked, setPicked] = useState<CodeChoice | null>(null);
	const [problem, setProblem] = useState<TimerProblem>(null);
	// The timer whose ten-hour question was answered "Jag jobbar fortfarande", until the app is
	// opened again.
	const [dismissed, setDismissed] = useState<UtcMillis | null>(null);

	useEffect(() => watchTimer(db, uid, setTimer), [db, uid]);
	useEffect(
		() => watchCollection(db, uid, assignmentsPath, assignmentCodec, setAssignments),
		[db, uid]
	);
	useEffect(() => watchLatestEntries(db, uid, setLatest), [db, uid]);
	// From the week the timer started, or this week: listening from the start, the reports are
	// known before the app goes offline.
	const fromWeek = isoWeekOf(dateOf(timer ? Math.min(timer.start, now) : now));
	useEffect(() => watchReportsFrom(db, uid, fromWeek, setReports), [db, uid, fromWeek]);
	useEffect(() => {
		const shown = () => {
			if (document.visibilityState === 'visible') setDismissed(null);
		};
		document.addEventListener('visibilitychange', shown);
		return () => document.removeEventListener('visibilitychange', shown);
	}, []);

	const codes = useCodes(
		db,
		uid,
		assignments.map((a) => a.id)
	);
	const groups = timerCodeGroups(assignments, codes, today);
	// Until the timer, the assignments and their codes have come, nothing is offered: no empty
	// state that is not true, and no start with the wrong code.
	const loading =
		timer === undefined ||
		loadedAssignments === null ||
		assignments.some((a) => codes[a.id] === undefined);
	const next = picked && choiceNames(groups, picked) ? picked : startChoice(groups, latest);

	const write = (save: () => Promise<unknown>) => {
		setProblem(null);
		// Offline the promise waits for the server; a refusal comes later and is shown then.
		save().catch(() => setProblem('failed'));
	};

	const blocked = (running: Timer, end: UtcMillis) => {
		if (!stopBlockedOffline(running, end, reports, online)) return false;
		setProblem('blocked');
		return true;
	};

	const stopAt = (running: Timer, end: UtcMillis) => {
		if (blocked(running, end)) return;
		setDismissed(null);
		write(() => stopTimer(db, uid, running, end, reports));
	};

	const start = (choice: CodeChoice) =>
		write(() =>
			startTimer(db, uid, {
				assignmentId: choice.assignmentId,
				subject: { kind: 'code', codeId: choice.codeId },
				start: Date.now()
			})
		);

	const choose = (choice: CodeChoice) => {
		setPicked(choice);
		if (!timer) return;
		const at = Date.now();
		if (blocked(timer, at)) return;
		write(() =>
			switchTimer(
				db,
				uid,
				timer,
				{ assignmentId: choice.assignmentId, subject: { kind: 'code', codeId: choice.codeId } },
				at,
				reports
			)
		);
	};

	const timerAssignment = timer && assignments.find((a) => a.id === timer.assignmentId);
	const forgotten = timer ? isTimerForgotten(timer, now) : false;
	const asking = timer && forgotten && dismissed !== timer.start;
	const terms = timerAssignment && termsOn(timerAssignment, dateOf(timer.start));
	const workday = terms ? fullDayNorm(terms) : 8 * 60;
	const label = timer && timerLabel(assignments, codes, timer);

	let action: ToolbarAction | undefined;
	if (timer) {
		action = {
			label: 'Stoppa timern',
			icon: <StopIcon />,
			// A forgotten timer asks when the work ended instead of stopping now.
			onPress: () => (forgotten ? setDismissed(null) : stopAt(timer, Date.now()))
		};
	} else if (!loading && timer === null && next) {
		action = { label: 'Starta timern', icon: <PlayIcon />, onPress: () => start(next) };
	}

	return {
		action,
		view: (
			<StartVy
				today={today}
				now={now}
				timer={timer ?? null}
				groups={groups}
				loading={loading}
				next={next}
				online={online}
				problem={problem}
				onChoose={choose}
				banner={banner}
				forgotten={
					timer && asking
						? {
								name: label ?? '',
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

/** "Uppdrag A · Utveckling", also for an archived code that the list no longer shows. */
const timerLabel = (
	assignments: readonly Assignment[],
	codes: Readonly<Record<Id, readonly TimeCode[]>>,
	timer: Timer
): string => {
	const assignment = assignments.find((a) => a.id === timer.assignmentId);
	const codeId = timer.subject.kind === 'code' ? timer.subject.codeId : '';
	const code = (codes[timer.assignmentId] ?? []).find((c) => c.id === codeId);
	return [assignment?.name, code?.name].filter(Boolean).join(' · ');
};
