// The basis for a week (mockup "Underlag för veckan", issue 25): actual against reported time per
// receiver, the intervals day by day and the week's changes, shown on screen and printed through
// the browser. Gets plain values; UnderlagRutt connects it to Firestore.
import { Button, Notice, PeriodPicker, Pill, Row, TopBar } from '@kodhast/web-ui-react';
import { dayName, minutesLabel, spanLabel } from '../../domain/dag.ts';
import { flexLabel } from '../../domain/oversikt.ts';
import type { ChangeLogEntry, Entry, IsoWeek } from '../../domain/types.ts';
import {
	changeLabel,
	dayBasis,
	entryChangeDetail,
	receiverBasis,
	weekChanges,
	type ReceiverBasis
} from '../../domain/underlag.ts';
import { hoursLabel, sentLabel, type WeekView } from '../../domain/vecka.ts';
import { WarningIcon } from '../ikoner';
import { href } from '../rutter.ts';

export interface Change {
	log: ChangeLogEntry;
	/** An entry change's sides read back as entries; null for other changes. */
	before: Entry | null;
	after: Entry | null;
}

export interface UnderlagVyProps {
	week: IsoWeek;
	/** `Vecka 47 · 16–22 nov`. */
	label: string;
	/** Null while the week loads. */
	view: WeekView | null;
	entries: readonly Entry[];
	/** The week's change log; null while it loads. */
	changes: readonly Change[] | null;
	failed: boolean;
	describe: (entry: Entry) => string;
	onWeek: (step: -1 | 1) => void;
	onPrint: () => void;
}

const receiverSubtitle = (r: ReceiverBasis): string =>
	[
		`Faktisk ${hoursLabel(r.actual)}`,
		r.reported === null ? 'inte skickad' : `rapporterad ${hoursLabel(r.reported)}`,
		...(r.sentAt === null ? [] : [`skickad ${sentLabel(r.sentAt)}`]),
		...(r.unlocked ? ['upplåst'] : [])
	].join(' · ');

export function UnderlagVy(props: UnderlagVyProps) {
	const { week, view, changes } = props;
	const receivers = view ? receiverBasis(view) : [];
	const days = view ? dayBasis(props.entries, week) : [];
	const logged = changes
		? weekChanges(
				changes.map((c) => c.log),
				week
			).map((log) => changes.find((c) => c.log === log)!)
		: [];
	return (
		<>
			<TopBar
				title="Underlag"
				backHref={href({ view: 'vecka', week })}
				actions={
					<Button variant="primary" compact isDisabled={!view} onPress={props.onPrint}>
						Skriv ut
					</Button>
				}
			/>
			<div className="innehall underlag">
				<div className="skarm">
					<PeriodPicker
						aria-label="Vecka"
						label={props.label}
						previousLabel="Föregående vecka"
						nextLabel="Nästa vecka"
						onPrevious={() => props.onWeek(-1)}
						onNext={() => props.onWeek(1)}
					/>
				</div>
				<h2 className="kh-text-section-title utskrift">{`Underlag · ${props.label}`}</h2>
				{props.failed && (
					<Notice
						tone="ton-fel"
						icon={<WarningIcon />}
						title="Det gick inte att läsa veckan"
						detail="Det som visas är det senaste kända läget."
					/>
				)}
				{view && (
					<>
						<section className="sektion">
							<h2 className="kh-text-section-title">Faktisk och rapporterad</h2>
							{receivers.length === 0 ? (
								<p className="kh-text-item-subtitle dampad">Ingen tid och inga rapporter.</p>
							) : (
								<div className="kh-card radlista">
									{receivers.map((r) => (
										<Row
											key={r.key}
											title={`${r.assignmentName} · ${r.receiverName}`}
											subtitle={receiverSubtitle(r)}
											trailing={
												<Pill>
													<span className="tabular">
														{r.difference === null ? '–' : flexLabel(r.difference)}
													</span>
												</Pill>
											}
										/>
									))}
								</div>
							)}
						</section>

						<section className="sektion">
							<h2 className="kh-text-section-title">Dag för dag</h2>
							{days.length === 0 && (
								<p className="kh-text-item-subtitle dampad">Ingen tid den här veckan.</p>
							)}
							{days.map((d) => (
								<div key={d.date} className="underlag-dag">
									<h3 className="kh-text-item-title">
										{d.total > 0
											? `${dayName(d.date)} · ${minutesLabel(d.total)}`
											: dayName(d.date)}
									</h3>
									<div className="kh-card radlista">
										{d.rows.map((row) => (
											<Row
												key={row.entry.id}
												title={
													<span className="tabular">
														{row.kind === 'allDay' ? 'Hela dagen' : spanLabel(row)}
													</span>
												}
												subtitle={props.describe(row.entry)}
												trailing={
													row.kind === 'interval' ? (
														<span className="kh-text-item-subtitle tabular">
															{minutesLabel(Math.round((row.end - row.start) / 60_000))}
														</span>
													) : undefined
												}
											/>
										))}
									</div>
								</div>
							))}
						</section>

						<section className="sektion">
							<h2 className="kh-text-section-title">Ändringar</h2>
							{changes === null ? null : logged.length === 0 ? (
								<p className="kh-text-item-subtitle dampad">Inga ändringar i loggen.</p>
							) : (
								<div className="kh-card radlista">
									{logged.map(({ log, before, after }) => (
										<Row
											key={log.id}
											title={`${sentLabel(log.at, true)} · ${changeLabel(log)}`}
											subtitle={[
												entryChangeDetail(before, after),
												log.reason ? `Skäl: ${log.reason}` : null
											]
												.filter(Boolean)
												.join(' · ')}
										/>
									))}
								</div>
							)}
						</section>
					</>
				)}
			</div>
		</>
	);
}
