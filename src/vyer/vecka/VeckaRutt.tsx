// Connects the week and its reports to Firestore (issue 20). VeckaRutt shows the week; RapportRutt
// one receiver's report and its transcript. Both report routes render RapportRutt in the same
// place, so the changes made to a suggestion stay while going to the transcript and back. They are
// kept on the device until the report is sent: a draft is not stored, so that it cannot go stale
// when the week's time changes.
import { Notice, TopBar } from '@kodhast/web-ui-react';
import type { Firestore } from 'firebase/firestore';
import { useState } from 'react';
import { reportId } from '../../data/dokument.ts';
import { sendReport, unlockReport } from '../../data/reports.ts';
import { dateOf, isoWeekOf } from '../../domain/tid.ts';
import type { Id, IsoWeek, ReportLine, SuggestionMode } from '../../domain/types.ts';
import {
	changeWeek,
	codeName,
	editableLines,
	listNames,
	mappedFrom,
	otherWeek,
	sentReport,
	storedLines,
	subjectName,
	weekLabel,
	workdaysOf
} from '../../domain/vecka.ts';
import { suggestWeek } from '../../domain/veckoforslag.ts';
import { OfflineIcon, WarningIcon } from '../ikoner';
import { useNow } from '../lyssnare.ts';
import { href, replaceRoute } from '../rutter.ts';
import { AvskriftVy } from './AvskriftVy';
import { RapportVy } from './RapportVy';
import { useVecka } from './useVecka';
import { VeckaVy } from './VeckaVy';

export interface VeckaRuttProps {
	db: Firestore;
	uid: Id;
	/** Null: the current week. */
	week: IsoWeek | null;
}

export function VeckaRutt({ db, uid, week }: VeckaRuttProps) {
	const now = useNow();
	const today = dateOf(now);
	const shown = week ?? isoWeekOf(today);
	const data = useVecka(db, uid, shown, now);
	return (
		<VeckaVy
			week={shown}
			label={weekLabel(shown, today)}
			view={data.view}
			failed={data.failed}
			onWeek={(step) => replaceRoute({ view: 'vecka', week: otherWeek(shown, step) })}
		/>
	);
}

export interface RapportRuttProps {
	db: Firestore;
	uid: Id;
	week: IsoWeek;
	assignmentId: Id;
	receiverId: Id;
	transcript: boolean;
	online: boolean;
}

export function RapportRutt(props: RapportRuttProps) {
	const { db, uid, week, assignmentId, receiverId, online } = props;
	const now = useNow();
	const data = useVecka(db, uid, week, now);
	// The mode chosen here, and the lines once changed; null follows the suggestion or the
	// unlocked report.
	const [mode, setMode] = useState<SuggestionMode | null>(null);
	const [edits, setEdits] = useState<ReportLine[] | null>(null);
	const [busy, setBusy] = useState(false);
	const [problem, setProblem] = useState<'send' | 'unlock' | null>(null);

	const weekHref = href({ view: 'vecka', week });
	const a = data.view?.perAssignment.find((x) => x.assignment.id === assignmentId);
	const r = a?.receivers.find((x) => x.receiver.id === receiverId);
	if (!data.view || !a || !r) {
		return (
			<>
				<TopBar title="Rapporten" backHref={weekHref} />
				<div className="innehall">
					{data.view && <p className="kh-text-body">Rapporten finns inte.</p>}
				</div>
			</>
		);
	}

	const { assignment, days } = a;
	const { receiver, report } = r;
	const codes = data.codes[assignment.id] ?? [];
	const chosen = mode ?? (report?.status === 'unlocked' ? report.mode : receiver.suggestionMode);
	const base =
		report?.status === 'unlocked' && mode === null
			? report.lines
			: suggestWeek({ assignment, receiver, week, days, freeDays: data.freeDays, mode: chosen })
					.lines;
	const lines = edits ?? editableLines(receiver, base);
	const sent = report?.status === 'sent';
	const name = (line: ReportLine) => codeName(receiver, sent ? report : null, line.receiverCodeId);

	const save = (action: 'send' | 'unlock', write: () => Promise<void>) => {
		setBusy(true);
		setProblem(null);
		write()
			.catch(() => setProblem(action))
			.finally(() => setBusy(false));
	};
	const notices = (
		<>
			{!online && (
				<Notice
					tone="ton-las"
					icon={<OfflineIcon />}
					title="Ingen anslutning"
					detail="Rapporten kan markeras som skickad eller låsas upp när nätet är tillbaka."
				/>
			)}
			{problem && (
				<Notice
					tone="ton-fel"
					icon={<WarningIcon />}
					title={problem === 'send' ? 'Det gick inte att skicka' : 'Det gick inte att låsa upp'}
					detail="Inget har ändrats. Försök igen."
				/>
			)}
			{report?.status === 'unlocked' && (
				<Notice
					tone="ton-varning"
					icon={<WarningIcon />}
					title="Upplåst"
					detail="Ändringarna loggas när rapporten markeras som skickad igen."
				/>
			)}
		</>
	);

	const title = `${receiver.name} · vecka ${Number(week.slice(6))}`;
	if (props.transcript || sent) {
		const shownLines = storedLines(sent ? report.lines : lines);
		return (
			<AvskriftVy
				title={sent ? title : `Avskrift · ${receiver.name}`}
				backHref={
					sent
						? weekHref
						: href({ view: 'rapport', week, assignmentId, receiverId, transcript: false })
				}
				rows={shownLines.map((line) => ({ line, name: name(line) }))}
				sentAt={sent ? (report.snapshot?.sentAt ?? 0) : null}
				online={online}
				busy={busy}
				notices={notices}
				onSend={() =>
					save('send', () =>
						sendReport(
							db,
							uid,
							sentReport(
								{
									id: reportId(assignmentId, receiverId, week),
									assignmentId,
									receiverId,
									week,
									mode: chosen,
									lines,
									lastChangeId: report?.lastChangeId ?? null
								},
								assignment,
								receiver,
								a.actual,
								now
							),
							report
						)
					)
				}
				onUnlock={(reason) =>
					save('unlock', async () => {
						await unlockReport(db, uid, report!, reason);
						setMode(null);
						setEdits(null);
						replaceRoute({ view: 'rapport', week, assignmentId, receiverId, transcript: false });
					})
				}
			/>
		);
	}

	const first = a.receivers[0];
	const workdays = workdaysOf(assignment, week, data.freeDays);
	return (
		<RapportVy
			title={title}
			backHref={weekHref}
			receiverName={receiver.name}
			assignmentName={assignment.name}
			mode={chosen}
			onMode={(m) => {
				setMode(m);
				setEdits(null);
			}}
			rows={lines.map((line) => ({
				line,
				name: name(line),
				from: (() => {
					const names = mappedFrom(receiver, line.receiverCodeId, codes, data.absenceTypes);
					return names.length > 0 ? `Från ${listNames(names)}` : '';
				})()
			}))}
			onChange={(line, minutes) =>
				setEdits(
					lines.map((l) =>
						l.receiverCodeId === line.receiverCodeId ? changeWeek(l, minutes, workdays) : l
					)
				)
			}
			actual={a.actual}
			norm={a.norm}
			first={
				first && first.receiver.id !== receiverId
					? { name: first.receiver.name, minutes: first.minutes }
					: null
			}
			unmapped={r.unmapped.map((id) => subjectName(id, codes, data.absenceTypes))}
			transcriptHref={href({ view: 'rapport', week, assignmentId, receiverId, transcript: true })}
			notices={notices}
		/>
	);
}
