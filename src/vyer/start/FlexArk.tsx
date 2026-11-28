// The flex per assignment (mockup "Flex per uppdrag"), opened from the flex in the header: the
// total, against the employment when it has periods (ADR 0021), and each assignment's balance
// with this week's time against the norm and its flex.
import { BottomSheet, Button, Pill, Row } from '@kodhast/web-ui-react';
import { minutesLabel } from '../../domain/dag.ts';
import {
	flexLabel,
	isFlexNegative,
	type EmploymentOverview,
	type Overview
} from '../../domain/oversikt.ts';

export interface FlexArkProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	overview: Overview;
}

const employmentText = (e: EmploymentOverview) =>
	e.scopePercent === null ? e.employer.name : `${e.employer.name} · ${e.scopePercent} %`;

function FlexPill({ minutes }: { minutes: number }) {
	return (
		<Pill tone={isFlexNegative(minutes) ? 'ton-varning' : 'ton-ok'}>
			<span className="tabular">{flexLabel(minutes)}</span>
		</Pill>
	);
}

export function FlexArk({ isOpen, onOpenChange, overview }: FlexArkProps) {
	const [first] = overview.employments;
	const onlyEmployment =
		overview.employments.length === 1 && first!.balance === overview.total ? first : undefined;
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
			{/* One employment that is the whole total names it; otherwise the total and a list. */}
			<div className="flex-totalt">
				<span className="kh-text-screen-title tabular">{flexLabel(overview.total)}</span>
				<span className="kh-text-item-subtitle">
					{onlyEmployment ? employmentText(onlyEmployment) : 'totalt'}
				</span>
			</div>
			{overview.employments.length > 0 && !onlyEmployment && (
				<div className="kh-card radlista">
					{overview.employments.map((e) => (
						<Row
							key={e.employer.id}
							title={e.employer.name}
							subtitle={e.scopePercent === null ? undefined : `Anställning ${e.scopePercent} %`}
							trailing={<FlexPill minutes={e.balance} />}
						/>
					))}
				</div>
			)}
			{overview.employments.length > 0 && <h3 className="kh-text-section-title">Per uppdrag</h3>}
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
						trailing={<FlexPill minutes={a.balance} />}
					/>
				))}
			</div>
			<span className="kh-text-item-subtitle dampad">
				{overview.employments.length > 0
					? 'Mot anställningen räknas all tid hos arbetsgivaren mot anställningens norm. Uppdragens flex visar fördelningen. Komptid tas ur flexen.'
					: 'Komptid tas ur flexen.'}
			</span>
		</BottomSheet>
	);
}
