// The flex per assignment (mockup "Flex per uppdrag"), opened from the flex in the header: the
// total, and each assignment's balance with this week's time against the norm and its flex.
import { BottomSheet, Button, Pill, Row } from '@kodhast/web-ui-react';
import { minutesLabel } from '../../domain/dag.ts';
import { flexLabel, isFlexNegative, type Overview } from '../../domain/oversikt.ts';

export interface FlexArkProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	overview: Overview;
}

export function FlexArk({ isOpen, onOpenChange, overview }: FlexArkProps) {
	return (
		<BottomSheet
			isOpen={isOpen}
			onOpenChange={onOpenChange}
			title="Flex"
			subtitle="Öppen vecka: faktisk tid minus normen hittills. Skickad vecka: faktisk minus rapporterad tid."
			footer={
				<Button variant="text" onPress={() => onOpenChange(false)}>
					Stäng
				</Button>
			}
		>
			<div className="flex-totalt">
				<span className="kh-text-screen-title tabular">{flexLabel(overview.total)}</span>
				<span className="kh-text-item-subtitle">totalt</span>
			</div>
			<div className="kh-card radlista">
				{overview.perAssignment.map((a) => (
					<Row
						key={a.assignment.id}
						title={a.assignment.name}
						// An assignment that has ended, or is free all week, has no week to show.
						subtitle={
							a.weekNorm === 0 && a.weekActual === 0
								? undefined
								: `Veckan ${minutesLabel(a.weekActual)} av ${minutesLabel(a.weekNorm)}, ${flexLabel(a.weekFlex)}`
						}
						trailing={
							<Pill tone={isFlexNegative(a.balance) ? 'ton-varning' : 'ton-ok'}>
								<span className="tabular">{flexLabel(a.balance)}</span>
							</Pill>
						}
					/>
				))}
			</div>
			<span className="kh-text-item-subtitle dampad">Komptid tas ur flexen.</span>
		</BottomSheet>
	);
}
