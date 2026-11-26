// The sheet where an interval is changed, added or deleted (mockup "Ändra intervall"): start and
// end, the assignment as segments, the time code or absence type as chips, and "Hela dagen" for
// absence. In a sent week the change needs a reason and is logged (issue 29, ADR 0012).
import {
	BottomSheet,
	Button,
	FilterChips,
	Notice,
	SegmentedChoice,
	SwitchRow,
	TextField
} from '@kodhast/web-ui-react';
import { useState } from 'react';
import { dayName, overlapping, parseSpan, spanLabel } from '../../domain/dag.ts';
import type { Span } from '../../domain/intervall.ts';
import { entryChange } from '../../domain/lasning.ts';
import { clockOf } from '../../domain/tid.ts';
import type { CodeGroup } from '../../domain/timer.ts';
import type { AbsenceType, Entry, Id, IsoDate, Report } from '../../domain/types.ts';
import { OfflineIcon, WarningIcon } from '../ikoner';

export interface IntervallArkProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	date: IsoDate;
	/** The entry that is changed; null for a new one. */
	entry: Entry | null;
	/** A new entry's id, made by the caller. */
	newId: Id;
	/** A new entry's time, e.g. a gap that is filled. */
	span: Span | null;
	/** A new entry's assignment and code. */
	choice: { assignmentId: Id; codeId: Id } | null;
	groups: readonly CodeGroup[];
	absenceTypes: readonly AbsenceType[];
	/** The day's entries, for the overlap warning. */
	entries: readonly Entry[];
	reports: readonly Report[];
	online: boolean;
	onSave: (before: Entry | null, after: Entry | null, reason: string) => void;
}

const subjectKey = (entry: Entry) =>
	entry.subject.kind === 'code'
		? `code:${entry.subject.codeId}`
		: `absence:${entry.subject.absenceTypeId}`;

interface Form {
	assignmentId: Id;
	subject: string;
	allDay: boolean;
	start: string;
	end: string;
	reason: string;
}

const initialForm = ({ entry, span, choice, groups }: IntervallArkProps): Form => {
	if (entry) {
		const time = entry.time.kind === 'interval' ? entry.time : null;
		return {
			assignmentId: entry.assignmentId,
			subject: subjectKey(entry),
			allDay: time === null,
			start: time ? clockOf(time.start) : '',
			end: time ? clockOf(time.end) : '',
			reason: ''
		};
	}
	const group = groups[0];
	return {
		assignmentId: choice?.assignmentId ?? group?.assignment.id ?? '',
		subject: `code:${choice?.codeId ?? group?.codes[0]?.id ?? ''}`,
		allDay: false,
		start: span ? clockOf(span.start) : '',
		end: span ? clockOf(span.end) : '',
		reason: ''
	};
};

export function IntervallArk(props: IntervallArkProps) {
	const { isOpen, onOpenChange, date, entry, newId, groups, absenceTypes, entries } = props;
	const [form, setForm] = useState(() => initialForm(props));
	const set = <K extends keyof Form>(key: K, value: Form[K]) =>
		setForm((f) => ({ ...f, [key]: value }));

	const group = groups.find((g) => g.assignment.id === form.assignmentId);
	const absence = form.subject.startsWith('absence:');
	const allDay = absence && form.allDay;
	const subjectId = form.subject.slice(form.subject.indexOf(':') + 1);
	const parsed = allDay ? null : parseSpan(date, form.start, form.end);
	const span = parsed && 'span' in parsed ? parsed.span : null;
	const fieldError = (field: 'start' | 'end') =>
		parsed && 'error' in parsed && parsed.error.field === field ? parsed.error.message : undefined;
	const overlap = span && overlapping(entries, span, entry?.id ?? null);

	const after: Entry | null =
		group && subjectId && (allDay || span)
			? {
					id: entry?.id ?? newId,
					assignmentId: form.assignmentId,
					subject: absence
						? { kind: 'absence', absenceTypeId: subjectId }
						: { kind: 'code', codeId: subjectId },
					time: allDay ? { kind: 'allDay', date } : { kind: 'interval', ...span! },
					note: entry?.note ?? ''
				}
			: null;

	const logged = (target: Entry | null) => entryChange(entry, target, props.reports).logged;
	// A change in a sent week is logged with a reason, and needs the network so that the log goes
	// with it (the batch would otherwise be queued without anyone knowing).
	const locked = logged(after) || (entry !== null && logged(null));
	const blocked = locked && !props.online;
	const reasonMissing = locked && form.reason.trim() === '';

	const save = (target: Entry | null) => {
		props.onSave(entry, target, form.reason.trim());
		onOpenChange(false);
	};

	return (
		<BottomSheet
			isOpen={isOpen}
			onOpenChange={onOpenChange}
			title={entry ? 'Ändra intervall' : 'Nytt intervall'}
			subtitle={dayName(date)}
			footer={
				<div className="ark-fot">
					{entry ? (
						<Button
							variant="destructiveText"
							isDisabled={blocked || reasonMissing}
							onPress={() => save(null)}
						>
							Radera
						</Button>
					) : (
						<span />
					)}
					<Button
						variant="primary"
						isDisabled={!after || blocked || reasonMissing}
						onPress={() => save(after)}
					>
						Spara
					</Button>
				</div>
			}
		>
			{absence && (
				<SwitchRow
					title="Hela dagen"
					subtitle="Räknas som dagens norm"
					isSelected={form.allDay}
					onChange={(on) => set('allDay', on)}
				/>
			)}
			{!allDay && (
				<div className="falt-par">
					<TextField
						label="Start"
						inputMode="numeric"
						value={form.start}
						onChange={(v) => set('start', v)}
						errorMessage={
							fieldError('start') ?? (overlap ? `Överlappar ${spanLabel(overlap)}` : undefined)
						}
					/>
					<TextField
						label="Slut"
						inputMode="numeric"
						value={form.end}
						onChange={(v) => set('end', v)}
						errorMessage={fieldError('end')}
					/>
				</div>
			)}
			{groups.length > 1 && (
				<section className="sektion">
					<span className="kh-text-caption dampad" id="uppdrag-rubrik">
						UPPDRAG
					</span>
					<SegmentedChoice
						aria-labelledby="uppdrag-rubrik"
						options={groups.map((g) => ({ value: g.assignment.id, label: g.assignment.name }))}
						value={form.assignmentId}
						onChange={(id) => {
							const codes = groups.find((g) => g.assignment.id === id)?.codes ?? [];
							// The code belongs to the assignment; absence types belong to every one.
							setForm((f) => ({
								...f,
								assignmentId: id,
								subject: f.subject.startsWith('absence:') ? f.subject : `code:${codes[0]?.id ?? ''}`
							}));
						}}
					/>
				</section>
			)}
			<SubjectChips
				caption="TIDKOD"
				prefix="code:"
				options={(group?.codes ?? []).map((c) => ({ value: c.id, label: c.name }))}
				selected={form.subject}
				onChange={(key) => set('subject', key)}
			/>
			<SubjectChips
				caption="FRÅNVARO"
				prefix="absence:"
				options={absenceTypes.map((t) => ({ value: t.id, label: t.name }))}
				selected={form.subject}
				onChange={(key) => set('subject', key)}
			/>
			{locked && (
				<>
					<Notice
						tone="ton-las"
						icon={props.online ? <WarningIcon /> : <OfflineIcon />}
						title="Veckan är skickad"
						detail={
							props.online
								? 'Ändringen skrivs i ändringsloggen med skälet. Flexen ändras, rapporten inte.'
								: 'En ändring i en skickad vecka sparas bara med nät, så att den loggas.'
						}
					/>
					<TextField label="Skäl" value={form.reason} onChange={(v) => set('reason', v)} />
				</>
			)}
		</BottomSheet>
	);
}

/** One choice among codes and absence types, shown as two rows of chips. */
function SubjectChips({
	caption,
	prefix,
	options,
	selected,
	onChange
}: {
	caption: string;
	prefix: string;
	options: { value: Id; label: string }[];
	selected: string;
	onChange: (key: string) => void;
}) {
	if (options.length === 0) return null;
	const id = `${prefix.slice(0, -1)}-rubrik`;
	return (
		<section className="sektion">
			<span className="kh-text-caption dampad" id={id}>
				{caption}
			</span>
			<FilterChips
				aria-labelledby={id}
				options={options.map((o) => ({ value: prefix + o.value, label: o.label }))}
				selected={selected.startsWith(prefix) ? [selected] : []}
				// The chips allow several; a new press replaces the choice, and the chosen one stays.
				onChange={(keys) => {
					const pressed = keys.find((k) => k !== selected);
					if (pressed) onChange(pressed);
				}}
			/>
		</section>
	);
}
