// The day's rows (mockups "Dagvy" and "Idag"): an interval with its time and code, whole-day
// absence, and a gap with Paus and Fyll i. The day view opens an interval in its sheet; the start
// page links to the day view and shows the running timer as "Pågår".
import { Button, Pill, Row } from '@kodhast/web-ui-react';
import { minutesLabel, spanLabel, type DayRow } from '../../domain/dag.ts';
import type { Span } from '../../domain/intervall.ts';
import { clockOf } from '../../domain/tid.ts';
import type { Entry, Id } from '../../domain/types.ts';

const MINUTE = 60_000;

export interface DagRaderProps {
	rows: readonly DayRow[];
	/** The entries' names: "Uppdrag A · Möten" and "Semester · Uppdrag A". */
	describe: (entry: Entry) => string;
	/** The class that colours an entry's stripe (`accent-kod-1` …). */
	accent: (entry: Entry) => string;
	/** The day's gaps are pauses. */
	paused: boolean;
	/** What a press on an entry does: opens it, or links somewhere. */
	open: (entry: Entry) => { onPress: () => void } | { href: string };
	onFill: (gap: Span) => void;
	onPause: (paused: boolean) => void;
	/** The running timer's entry, shown without an end. */
	runningId?: Id | null;
}

export function DagRader(props: DagRaderProps) {
	return (
		<div className="kh-card radlista">
			{props.rows.map((row) => (
				<DayRowView
					key={row.kind === 'gap' ? `gap-${row.start}` : row.entry.id}
					row={row}
					{...props}
				/>
			))}
		</div>
	);
}

function DayRowView({
	row,
	paused,
	describe,
	accent,
	open,
	onFill,
	onPause,
	runningId = null
}: { row: DayRow } & DagRaderProps) {
	if (row.kind === 'allDay') {
		return (
			<Row
				title="Hela dagen"
				subtitle={describe(row.entry)}
				accentClass={accent(row.entry)}
				{...open(row.entry)}
			/>
		);
	}
	if (row.kind === 'interval') {
		const running = row.entry.id === runningId;
		return (
			<Row
				title={
					<span className="tabular">{running ? `${clockOf(row.start)}–` : spanLabel(row)}</span>
				}
				subtitle={describe(row.entry)}
				accentClass={row.overlap ? 'accent-fel' : accent(row.entry)}
				trailing={
					row.overlap ? (
						<Pill tone="ton-fel">Överlapp</Pill>
					) : running ? (
						<Pill>Pågår</Pill>
					) : (
						<span className="kh-text-item-subtitle tabular">
							{minutesLabel(Math.round((row.end - row.start) / MINUTE))}
						</span>
					)
				}
				{...open(row.entry)}
			/>
		);
	}
	return (
		<Row
			tinted
			accentClass="accent-lucka"
			title={<span className="tabular">{`${paused ? 'Paus' : 'Lucka'} ${spanLabel(row)}`}</span>}
			subtitle={paused ? minutesLabel(row.minutes) : `${minutesLabel(row.minutes)} utan tid`}
			trailing={
				<span className="knappar">
					<Button variant="text" compact onPress={() => onPause(!paused)}>
						{paused ? 'Ångra paus' : 'Paus'}
					</Button>
					<Button compact onPress={() => onFill(row)}>
						Fyll i
					</Button>
				</span>
			}
		/>
	);
}
