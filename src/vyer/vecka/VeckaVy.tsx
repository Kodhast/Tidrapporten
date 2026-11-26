// The week (mockup "Vecka", issue 20): the week picker, the week's actual time, norm and flex, and
// per assignment its receivers in the chain's order with each report's state. Gets plain values;
// VeckaRutt connects it to Firestore.
import { Notice, PeriodPicker, Pill, Row } from '@kodhast/web-ui-react';
import { plural } from '../../domain/installningar.ts';
import { flexLabel } from '../../domain/oversikt.ts';
import type { IsoWeek } from '../../domain/types.ts';
import { hoursLabel, sentLabel, type ReceiverWeek, type WeekView } from '../../domain/vecka.ts';
import { WarningIcon } from '../ikoner';
import { Sidhuvud } from '../konto';
import { href } from '../rutter.ts';

export interface VeckaVyProps {
	week: IsoWeek;
	/** `Vecka 47 · 16–22 nov`. */
	label: string;
	/** Null while the week loads. */
	view: WeekView | null;
	failed: boolean;
	onWeek: (step: -1 | 1) => void;
}

const STATUS = {
	sent: <Pill tone="ton-las">Låst</Pill>,
	unlocked: <Pill tone="ton-varning">Upplåst</Pill>,
	open: <Pill tone="ton-varning">Ej skickad</Pill>
};

const subtitle = ({ report, minutes }: ReceiverWeek): string => {
	if (report?.status === 'sent' && report.snapshot) {
		return `${hoursLabel(minutes)} · skickad ${sentLabel(report.snapshot.sentAt)}`;
	}
	if (report?.status === 'unlocked') return `${hoursLabel(minutes)} · upplåst`;
	return `${hoursLabel(minutes)} föreslaget`;
};

export function VeckaVy({ week, label, view, failed, onWeek }: VeckaVyProps) {
	return (
		<>
			<Sidhuvud
				title="Veckan"
				bouncing={view === null && !failed}
				subtitle={
					view &&
					(view.toSend === 0
						? 'Inga rapporter att skicka'
						: `${plural(view.toSend, 'rapport', 'rapporter')} att skicka`)
				}
			/>
			<div className="innehall">
				<PeriodPicker
					aria-label="Vecka"
					label={label}
					previousLabel="Föregående vecka"
					nextLabel="Nästa vecka"
					onPrevious={() => onWeek(-1)}
					onNext={() => onWeek(1)}
				/>
				{failed && (
					<Notice
						tone="ton-fel"
						icon={<WarningIcon />}
						title="Det gick inte att läsa veckan"
						detail="Det som visas är det senaste kända läget."
					/>
				)}
				{view && (
					<div className="kh-card veckosiffror">
						<div className="summa">
							<span className="kh-text-caption dampad">FAKTISK</span>
							<span className="kh-text-big-number">{hoursLabel(view.actual)}</span>
						</div>
						<div className="summa">
							<span className="kh-text-caption dampad">NORM</span>
							<span className="kh-text-big-number">{hoursLabel(view.norm)}</span>
						</div>
						<div className="summa">
							<span className="kh-text-caption dampad">FLEX</span>
							<span className="kh-text-big-number">{flexLabel(view.flex)}</span>
						</div>
					</div>
				)}
				{view?.perAssignment.length === 0 && (
					<p className="kh-text-body dampad">Inget uppdrag den här veckan.</p>
				)}
				{view?.perAssignment.map((a) => (
					<section key={a.assignment.id} className="sektion">
						<h2 className="kh-text-section-title">{`${a.assignment.name} · ${hoursLabel(a.actual)}`}</h2>
						{a.receivers.length === 0 ? (
							<p className="kh-text-item-subtitle dampad">
								Uppdraget har inga mottagare. Lägg till dem under Inställningar.
							</p>
						) : (
							<div className="kh-card radlista">
								{a.receivers.map((r) => (
									<Row
										key={r.receiver.id}
										title={`${r.receiver.position} · ${r.receiver.name}`}
										subtitle={subtitle(r)}
										trailing={
											r.report?.status === 'sent'
												? STATUS.sent
												: r.report?.status === 'unlocked'
													? STATUS.unlocked
													: a.hasTime
														? STATUS.open
														: null
										}
										href={href({
											view: 'rapport',
											week,
											assignmentId: a.assignment.id,
											receiverId: r.receiver.id,
											transcript: r.report?.status === 'sent'
										})}
									/>
								))}
							</div>
						)}
					</section>
				))}
			</div>
		</>
	);
}
