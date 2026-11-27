// The billing rate per assignment (mockup "Debitering per uppdrag", issue 23), opened from the
// rate beside the flex: this week and this month in total, and each assignment's time behind them.
import { BottomSheet, Button, Pill, Row } from '@kodhast/web-ui-react';
import { monthName } from '../../domain/budget.ts';
import { minutesLabel } from '../../domain/dag.ts';
import { billingLabel, type Billing, type BillingTime } from '../../domain/debitering.ts';
import { isoWeekOf } from '../../domain/tid.ts';
import type { IsoDate } from '../../domain/types.ts';

export interface DebiteringArkProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	billing: Billing;
	today: IsoDate;
}

/** `26 h 30 min av 30 h`, or `ingen tid`. */
const timeLabel = ({ billable, worked }: BillingTime): string =>
	worked > 0 ? `${minutesLabel(billable)} av ${minutesLabel(worked)}` : 'ingen tid';

export function DebiteringArk({ isOpen, onOpenChange, billing, today }: DebiteringArkProps) {
	const month = monthName(today.slice(0, 7));
	return (
		<BottomSheet
			isOpen={isOpen}
			onOpenChange={onOpenChange}
			title="Debitering"
			subtitle="Faktisk tid på debiterbara tidkoder delat med all arbetad tid. Frånvaro räknas inte."
			footer={
				<Button variant="text" onPress={() => onOpenChange(false)}>
					Stäng
				</Button>
			}
		>
			<div className="debitering-totalt">
				<div>
					<span className="kh-text-screen-title tabular">{billingLabel(billing.week)}</span>
					<span className="kh-text-item-subtitle">{`vecka ${Number(isoWeekOf(today).slice(6))}`}</span>
				</div>
				<div>
					<span className="kh-text-screen-title tabular">{billingLabel(billing.month)}</span>
					<span className="kh-text-item-subtitle">{month}</span>
				</div>
			</div>
			<div className="kh-card radlista">
				{billing.perAssignment.map((a) => (
					<Row
						key={a.assignment.id}
						title={a.assignment.name}
						subtitle={`Veckan ${timeLabel(a.week)} · ${month} ${timeLabel(a.month)}`}
						trailing={
							<Pill>
								<span className="tabular">{billingLabel(a.week)}</span>
							</Pill>
						}
					/>
				))}
			</div>
			<span className="kh-text-item-subtitle dampad">
				Debiterbar ställs in per tidkod under Inställningar.
			</span>
		</BottomSheet>
	);
}
