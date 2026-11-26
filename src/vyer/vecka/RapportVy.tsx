// A receiver's report for the week (mockup "Rapport", issue 20): the suggestion's mode, the hours
// per receiver code with a stepper, what goes to flex and whether the sum is the same as to the
// first receiver. Gets plain values; RapportRutt keeps the changes and connects it to Firestore.
import { Notice, Row, SegmentedChoice, Stepper, TopBar, buttonClass } from '@kodhast/web-ui-react';
import type { ReactNode } from 'react';
import { genitive } from '../../domain/installningar.ts';
import type { Minutes, ReportLine, SuggestionMode } from '../../domain/types.ts';
import { hoursLabel, lineMinutes } from '../../domain/vecka.ts';
import { CheckIcon, WarningIcon } from '../ikoner';

export interface RapportRow {
	line: ReportLine;
	name: string;
	/** `Från Utveckling och Möten`, or empty when nothing maps to it. */
	from: string;
}

export interface RapportVyProps {
	/** `Kund A · vecka 47`. */
	title: string;
	backHref: string;
	receiverName: string;
	assignmentName: string;
	mode: SuggestionMode;
	onMode: (mode: SuggestionMode) => void;
	rows: readonly RapportRow[];
	onChange: (line: ReportLine, minutes: Minutes) => void;
	actual: Minutes;
	norm: Minutes;
	/** The first receiver's name and sum, when this is not the first receiver. */
	first: { name: string; minutes: Minutes } | null;
	/** Internal codes and absence types with time that have no code here. */
	unmapped: readonly string[];
	transcriptHref: string;
	/** The offline notice, the unlock notice and the like, above the rest. */
	notices?: ReactNode;
}

/** `så 2,5 h går till flexen`, `så 1 h tas från flexen`, `så inget går till flexen`. */
const toFlex = (minutes: Minutes): string =>
	minutes > 0
		? `så ${hoursLabel(minutes)} går till flexen`
		: minutes < 0
			? `så ${hoursLabel(-minutes)} tas från flexen`
			: 'så inget går till flexen';

export function RapportVy(props: RapportVyProps) {
	const sum = props.rows.reduce((total, r) => total + lineMinutes(r.line), 0);
	const flex = props.actual - sum;
	const explanation =
		sum === props.norm
			? `Faktisk tid ${hoursLabel(props.actual)}. Normen för ${props.assignmentName} är ${hoursLabel(props.norm)}, ${toFlex(flex)}.`
			: `Faktisk tid ${hoursLabel(props.actual)}. Rapporten är ${hoursLabel(sum)}, ${toFlex(flex)}.`;
	return (
		<>
			<TopBar title={props.title} backHref={props.backHref} />
			<div className="innehall dag">
				{props.notices}
				<section className="sektion">
					<h2 className="kh-text-caption dampad">FÖRSLAG</h2>
					<SegmentedChoice
						aria-label="Förslag"
						value={props.mode}
						onChange={(value) => props.onMode(value as SuggestionMode)}
						options={[
							{ value: 'fillNorm', label: 'Fyll mot normen' },
							{ value: 'actualQuarter', label: 'Faktisk tid' }
						]}
					/>
					<p className="kh-text-item-subtitle">{explanation}</p>
				</section>
				{props.unmapped.length > 0 && (
					<Notice
						tone="ton-varning"
						icon={<WarningIcon />}
						title={`Tid utan kod hos ${props.receiverName}`}
						detail={`${props.unmapped.join(', ')} kommer inte med. Koppla dem under Inställningar.`}
					/>
				)}
				<section className="sektion">
					<h2 className="kh-text-section-title">{`${genitive(props.receiverName)} koder`}</h2>
					<div className="kh-card radlista">
						{props.rows.map((row) => (
							<Row
								key={row.line.receiverCodeId}
								title={row.name}
								subtitle={row.from}
								trailing={
									<Stepper
										label={row.name}
										value={lineMinutes(row.line) / 60}
										onChange={(hours) => props.onChange(row.line, Math.round(hours * 60))}
										step={0.25}
										min={0}
										max={168}
										formatOptions={{ maximumFractionDigits: 2 }}
									/>
								}
							/>
						))}
					</div>
					<p className="kh-text-item-subtitle">Timmar för veckan, steg om en kvart.</p>
				</section>
				{props.first &&
					(props.first.minutes === sum ? (
						<Notice
							tone="ton-ok"
							icon={<CheckIcon />}
							title={`${hoursLabel(sum)}, samma som till ${props.first.name}`}
							detail="Alla mottagare i uppdraget får samma veckosumma."
						/>
					) : (
						<Notice
							tone="ton-varning"
							icon={<WarningIcon />}
							title={`${hoursLabel(sum)}, men ${hoursLabel(props.first.minutes)} till ${props.first.name}`}
							detail="Flexen räknas mot rapporten till den första mottagaren."
						/>
					))}
			</div>
			<div className="dag-fot">
				<a className={buttonClass({ variant: 'primary', block: true })} href={props.transcriptHref}>
					Visa avskriften
				</a>
			</div>
		</>
	);
}
