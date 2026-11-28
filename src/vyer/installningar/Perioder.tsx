// The periods of scope (ADR 0021, mockup "Omfattning per period"): a row per period and a sheet to
// add, change or remove one. Shared by the assignment and the employer; saved with their form.
import { BottomSheet, Button, Pill, Row, TextField } from '@kodhast/web-ui-react';
import { useState } from 'react';
import { formatHours } from '../../domain/installningar.ts';
import {
	periodForm,
	periodLabel,
	periodRows,
	putPeriod,
	removePeriod,
	termsIn,
	type PeriodForm,
	type Periods
} from '../../domain/perioder.ts';
import type { IsoDate, Minutes } from '../../domain/types.ts';

export interface PerioderProps {
	periods: Periods;
	onChange: (periods: Periods) => void;
	today: IsoDate;
	/** The section's title: "Omfattning" or "Anställningens omfattning". */
	title: string;
	/** Under the list. */
	hint: string;
	/** The workday a new period starts with when there are none. */
	defaultWorkday?: Minutes;
}

export function Perioder({ periods, onChange, today, title, hint, defaultWorkday }: PerioderProps) {
	const rows = periodRows(periods);
	const inForce = termsIn(periods, today);
	// The sheet: a new period (index null) or the period at `index` being changed.
	const [sheet, setSheet] = useState<{ index: number | null; form: PeriodForm } | null>(null);
	const result = sheet && putPeriod(periods, sheet.index, sheet.form);
	const isLastInSheet =
		sheet !== null &&
		(sheet.index === null
			? !rows.some((r) => r.from > sheet.form.from)
			: sheet.index === rows.length - 1);

	const openNew = () => {
		const last = rows.at(-1);
		// From today when that splits a period; otherwise the day after the last one starts.
		const from = last && today > last.from && (last.to === null || today <= last.to) ? today : '';
		const form = periodForm(null, from, periods, inForce?.workdayMinutes ?? defaultWorkday);
		const base = termsIn(periods, from) ?? last;
		setSheet({ index: null, form: base ? { ...form, scope: String(base.scopePercent) } : form });
	};
	const set = (field: keyof PeriodForm) => (value: string) =>
		sheet && setSheet({ ...sheet, form: { ...sheet.form, [field]: value } });
	const apply = () => {
		if (result?.periods) {
			onChange(result.periods);
			setSheet(null);
		}
	};

	return (
		<section className="sektion">
			<h2 className="kh-text-section-title">{title}</h2>
			{rows.length > 0 && (
				<div className="kh-card radlista">
					{rows.map((row, index) => (
						<Row
							key={row.from}
							title={periodLabel(row)}
							subtitle={`Arbetsdag ${formatHours(row.workdayMinutes)} h${
								inForce?.from === row.from ? ' · gäller nu' : ''
							}`}
							trailing={<Pill>{`${row.scopePercent} %`}</Pill>}
							navigates
							onPress={() => setSheet({ index, form: periodForm(row, row.from, periods) })}
						/>
					))}
				</div>
			)}
			<p className="kh-text-item-subtitle dampad">{hint}</p>
			<div>
				<Button variant="text" onPress={openNew}>
					Ny period
				</Button>
			</div>

			<BottomSheet
				title={sheet?.index === null ? 'Ny period' : 'Period'}
				isOpen={sheet !== null}
				onOpenChange={(open) => !open && setSheet(null)}
				footer={
					<Button variant="primary" block isDisabled={!result?.periods} onPress={apply}>
						{sheet?.index === null ? 'Lägg till' : 'Klar'}
					</Button>
				}
			>
				{sheet && (
					<>
						<TextField
							label="Från"
							type="date"
							value={sheet.form.from}
							onChange={set('from')}
							description={
								sheet.index === null || sheet.index > 0
									? 'Föregående period slutar dagen före.'
									: 'Flexen räknas från den dagen.'
							}
							errorMessage={sheet.form.from ? result?.errors?.from : undefined}
						/>
						{isLastInSheet && (
							<TextField
								label="Till"
								type="date"
								value={sheet.form.to}
								onChange={set('to')}
								description="Tomt: tills vidare. Bara sista perioden kan sluta."
								errorMessage={result?.errors?.to}
							/>
						)}
						<div className="falt-par">
							<TextField
								label="Omfattning"
								suffix="%"
								inputMode="numeric"
								value={sheet.form.scope}
								onChange={set('scope')}
								description="0–100"
								errorMessage={result?.errors?.scope}
							/>
							<TextField
								label="Arbetsdag"
								suffix="h"
								inputMode="decimal"
								value={sheet.form.workday}
								onChange={set('workday')}
								description="Vid 100 %"
								errorMessage={result?.errors?.workday}
							/>
						</div>
						<p className="kh-text-item-subtitle dampad">
							Flexen för veckorna i perioden räknas om. Ändringen skrivs i ändringsloggen när du
							sparar.
						</p>
						{sheet.index !== null && sheet.index > 0 && (
							<div>
								<Button
									variant="text"
									onPress={() => {
										onChange(removePeriod(periods, sheet.index!));
										setSheet(null);
									}}
								>
									Ta bort perioden
								</Button>
							</div>
						)}
					</>
				)}
			</BottomSheet>
		</section>
	);
}
