// The day view (mockup "Dagvy", issue 29): the day's intervals and gaps in order, the overlap
// warning, the day's sum and the button that adds an interval. Gets plain values; useDag connects
// it to Firestore.
import { Button, Notice, PeriodPicker, Pill, Row, TopBar } from '@kodhast/web-ui-react';
import type { ReactNode } from 'react';
import { dayName, minutesLabel, spanLabel, type DayRow, type DaySum } from '../../domain/dag.ts';
import type { Span } from '../../domain/intervall.ts';
import type { Entry, IsoDate } from '../../domain/types.ts';
import { OfflineIcon, WarningIcon } from '../ikoner';
import { href } from '../rutter.ts';

const MINUTE = 60_000;

export interface DagVyProps {
	date: IsoDate;
	rows: readonly DayRow[];
	/** The entries' names: "Uppdrag A · Möten" and "Semester · Uppdrag A". */
	describe: (entry: Entry) => string;
	assignmentName: (id: string) => string;
	overlap: [Span, Span] | null;
	sum: DaySum;
	/** The day's gaps are pauses. */
	paused: boolean;
	online: boolean;
	/** The last save failed. */
	failed: boolean;
	/** The day has not come yet. */
	loading?: boolean;
	onDay: (date: IsoDate) => void;
	previous: IsoDate;
	next: IsoDate;
	onOpen: (entry: Entry) => void;
	onFill: (gap: Span) => void;
	onPause: (paused: boolean) => void;
	onAdd: () => void;
	/** Nothing to add with yet: the day is loading, or there is no assignment with codes. */
	addDisabled?: boolean;
	/** The interval sheet, when open. */
	sheet?: ReactNode;
}

export function DagVy(props: DagVyProps) {
	const { date, rows, overlap, sum, loading = false } = props;
	return (
		<>
			<TopBar title="Dagen" backHref={href({ view: 'idag' })} />
			<div className="innehall dag">
				<PeriodPicker
					aria-label="Dag"
					label={dayName(date)}
					previousLabel="Föregående dag"
					nextLabel="Nästa dag"
					onPrevious={() => props.onDay(props.previous)}
					onNext={() => props.onDay(props.next)}
				/>
				{!props.online && (
					<Notice
						tone="ton-las"
						icon={<OfflineIcon />}
						title="Ingen anslutning"
						detail="Ändringar sparas i telefonen och skickas när nätet är tillbaka. En skickad vecka kan inte ändras förrän dess."
					/>
				)}
				{props.failed && (
					<Notice
						tone="ton-fel"
						icon={<WarningIcon />}
						title="Det gick inte att spara"
						detail="Det som visas är det senaste sparade läget."
					/>
				)}
				{overlap && (
					<Notice
						tone="ton-fel"
						icon={<WarningIcon />}
						title="Två intervall överlappar"
						detail={`${spanLabel(overlap[0])} och ${spanLabel(overlap[1])}. Tryck på ett av dem och rätta tiden.`}
					/>
				)}
				{loading ? null : rows.length === 0 ? (
					<p className="kh-text-body dampad">Ingen tid den här dagen.</p>
				) : (
					<>
						<div className="kh-card radlista">
							{rows.map((row) => (
								<DayRowView key={rowKey(row)} row={row} {...props} />
							))}
						</div>
						{sum.total > 0 && (
							<div className="kh-card summa">
								<span className="kh-text-caption dampad">SUMMA</span>
								<span className="kh-text-big-number">{minutesLabel(sum.total)}</span>
								<span className="kh-text-item-subtitle">
									{sum.perAssignment
										.map(([id, minutes]) => `${props.assignmentName(id)} ${minutesLabel(minutes)}`)
										.join(' · ')}
									{overlap ? '. Överlappet räknas två gånger tills det är rättat.' : ''}
								</span>
							</div>
						)}
					</>
				)}
			</div>
			<div className="dag-fot">
				<Button variant="primary" block isDisabled={props.addDisabled} onPress={props.onAdd}>
					Lägg till intervall
				</Button>
			</div>
			{props.sheet}
		</>
	);
}

const rowKey = (row: DayRow) => (row.kind === 'gap' ? `gap-${row.start}` : row.entry.id);

function DayRowView({
	row,
	paused,
	describe,
	onOpen,
	onFill,
	onPause
}: { row: DayRow } & DagVyProps) {
	if (row.kind === 'allDay') {
		return (
			<Row title="Hela dagen" subtitle={describe(row.entry)} onPress={() => onOpen(row.entry)} />
		);
	}
	if (row.kind === 'interval') {
		return (
			<Row
				title={<span className="tabular">{spanLabel(row)}</span>}
				subtitle={describe(row.entry)}
				accentClass={row.overlap ? 'accent-fel' : undefined}
				trailing={
					row.overlap ? (
						<Pill tone="ton-fel">Överlapp</Pill>
					) : (
						<span className="kh-text-item-subtitle tabular">
							{minutesLabel(Math.round((row.end - row.start) / MINUTE))}
						</span>
					)
				}
				onPress={() => onOpen(row.entry)}
			/>
		);
	}
	return (
		<Row
			tinted
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
