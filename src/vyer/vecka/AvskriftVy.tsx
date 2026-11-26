// The transcript (mockup "Avskrift" and "Lås upp rapporten?", issue 20): the receiver's codes in
// their order with hours per day and sum, to type into the receiver's own system. An open report
// is marked as sent here; a sent one shows as it was sent and can be unlocked with a reason.
import { Button, ConfirmDialog, Notice, TextField, TopBar } from '@kodhast/web-ui-react';
import { useState, type ReactNode } from 'react';
import { formatHours } from '../../domain/installningar.ts';
import type { ReportLine } from '../../domain/types.ts';
import { lineMinutes, sentLabel } from '../../domain/vecka.ts';
import { LockIcon } from '../ikoner';

export interface AvskriftRow {
	line: ReportLine;
	name: string;
}

export interface AvskriftVyProps {
	title: string;
	backHref: string;
	rows: readonly AvskriftRow[];
	/** When the report was sent; null for one that is not sent. */
	sentAt: number | null;
	online: boolean;
	/** A send or unlock is on its way. */
	busy: boolean;
	onSend: () => void;
	onUnlock: (reason: string) => void;
	/** The offline notice and the failure notice, above the rest. */
	notices?: ReactNode;
}

const DAYS = ['Må', 'Ti', 'On', 'To', 'Fr', 'Lö', 'Sö'];

/** A cell's hours: `7,5`, or a dash for none. */
const cell = (minutes: number) => (minutes === 0 ? '–' : formatHours(minutes));

export function AvskriftVy(props: AvskriftVyProps) {
	const { rows } = props;
	const [unlocking, setUnlocking] = useState(false);
	const [reason, setReason] = useState('');
	// Saturday and Sunday get their own columns only when they have time.
	const weekend = rows.some((r) => r.line.minutesPerDay[5]! + r.line.minutesPerDay[6]! > 0);
	const days = weekend ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4];
	const total = (day: number) => rows.reduce((sum, r) => sum + r.line.minutesPerDay[day]!, 0);
	const locked = props.sentAt !== null;
	return (
		<>
			<TopBar title={props.title} backHref={props.backHref} />
			<div className="innehall dag">
				{props.notices}
				{locked ? (
					<Notice
						tone="ton-las"
						icon={<LockIcon />}
						title={`Skickad ${sentLabel(props.sentAt!, true)} · låst`}
						detail="Det här är rapporten som den såg ut när den skickades."
					/>
				) : (
					<p className="kh-text-item-subtitle">
						Skriv av i mottagarens system. Koderna står i deras ordning.
					</p>
				)}
				{rows.length === 0 ? (
					<p className="kh-text-body dampad">Ingen tid att rapportera den här veckan.</p>
				) : (
					<div className="kh-card avskrift-kort">
						<table className="avskrift">
							<thead>
								<tr>
									<th scope="col">Kod</th>
									{days.map((d) => (
										<th key={d} scope="col">
											{DAYS[d]}
										</th>
									))}
									<th scope="col">Sum</th>
								</tr>
							</thead>
							<tbody>
								{rows.map((r) => (
									<tr key={r.line.receiverCodeId}>
										<th scope="row">{r.name}</th>
										{days.map((d) => (
											<td key={d}>{cell(r.line.minutesPerDay[d]!)}</td>
										))}
										<td>{cell(lineMinutes(r.line))}</td>
									</tr>
								))}
							</tbody>
							<tfoot>
								<tr>
									<th scope="row">Totalt</th>
									{days.map((d) => (
										<td key={d}>{cell(total(d))}</td>
									))}
									<td>{cell(rows.reduce((sum, r) => sum + lineMinutes(r.line), 0))}</td>
								</tr>
							</tfoot>
						</table>
					</div>
				)}
				{!weekend && rows.length > 0 && (
					<div className="kh-card radlista">
						<div className="kh-row">
							<div className="kh-row__text">
								<span className="kh-row__title">Lördag och söndag</span>
								<span className="kh-row__subtitle">Ingen tid</span>
							</div>
						</div>
					</div>
				)}
			</div>
			<div className="dag-fot centrerad-fot">
				{locked ? (
					<Button
						variant="text"
						isDisabled={!props.online || props.busy}
						onPress={() => {
							setReason('');
							setUnlocking(true);
						}}
					>
						Lås upp
					</Button>
				) : (
					<Button
						variant="primary"
						block
						isDisabled={!props.online}
						isPending={props.busy}
						onPress={props.onSend}
					>
						Markera som skickad
					</Button>
				)}
			</div>
			<ConfirmDialog
				isOpen={unlocking}
				onOpenChange={setUnlocking}
				title="Lås upp rapporten?"
				text="Rapporten blir upplåst tills du markerar den som skickad igen. Varje ändring loggas med tid och skäl."
				confirmLabel="Lås upp"
				isConfirmDisabled={reason.trim() === ''}
				onConfirm={() => props.onUnlock(reason.trim())}
			>
				<TextField
					label="Skäl"
					description="Krävs"
					multiline
					value={reason}
					onChange={setReason}
					maxLength={500}
				/>
			</ConfirmDialog>
		</>
	);
}
