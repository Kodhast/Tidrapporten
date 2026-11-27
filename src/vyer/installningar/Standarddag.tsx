// The standard day of an assignment (mockup "Uppdrag – standarddagen", issue 24): its slots as
// rows and a sheet for one slot. Changes go to the assignment's form and are saved with it.
import { BottomSheet, Button, FilterChips, Row, TimeField } from '@kodhast/web-ui-react';
import { useState } from 'react';
import { endWheelStart, parseClock, STANDARD_DAY_STEP } from '../../domain/dag.ts';
import { slotProblem, sortedSlots } from '../../domain/standarddag.ts';
import type { StandardDaySlot, TimeCode } from '../../domain/types.ts';

export interface StandarddagProps {
	slots: readonly StandardDaySlot[];
	/** The assignment's codes as in its form, archived ones too. */
	codes: readonly TimeCode[];
	onChange: (slots: StandardDaySlot[]) => void;
}

interface Sheet {
	/** The slot being changed, by its place in `slots`; null for a new one. */
	index: number | null;
	start: string;
	end: string;
	codeId: string;
}

const PROBLEMS = {
	order: 'Slutet ska vara efter starten',
	overlap: 'Överlappar ett annat pass'
} as const;

export function Standarddag({ slots, codes, onChange }: StandarddagProps) {
	const [sheet, setSheet] = useState<Sheet | null>(null);
	const active = codes.filter((c) => !c.archived);
	const codeName = (id: string) => codes.find((c) => c.id === id)?.name ?? 'Borttagen tidkod';

	const start = sheet && parseClock(sheet.start);
	const end = sheet && parseClock(sheet.end);
	const slot = start && end && sheet?.codeId ? { start, end, codeId: sheet.codeId } : null;
	const others = slots.filter((_, i) => i !== sheet?.index);
	const problem = slot && slotProblem(slot, others);

	const apply = () => {
		if (!slot || problem || !sheet) return;
		onChange(sortedSlots([...others, slot]));
		setSheet(null);
	};
	const remove = () => {
		onChange(others);
		setSheet(null);
	};

	return (
		<section className="sektion">
			<h2 className="kh-text-section-title">Standarddag</h2>
			{slots.length > 0 && (
				<div className="kh-card radlista">
					{slots.map((s, i) => (
						<Row
							key={`${s.start}-${s.end}`}
							title={<span className="tabular">{`${s.start}–${s.end}`}</span>}
							subtitle={codeName(s.codeId)}
							navigates
							onPress={() => setSheet({ index: i, ...s })}
						/>
					))}
				</div>
			)}
			<p className="kh-text-item-subtitle dampad">
				Föreslås i dagvyn på en arbetsdag utan tid. Luckan mellan passen är lunch.
			</p>
			<div>
				<Button
					variant="text"
					isDisabled={active.length === 0}
					onPress={() => setSheet({ index: null, start: '', end: '', codeId: active[0]?.id ?? '' })}
				>
					Lägg till pass
				</Button>
			</div>

			<BottomSheet
				title="Pass i standarddagen"
				isOpen={sheet !== null}
				onOpenChange={(open) => !open && setSheet(null)}
				footer={
					<div className="ark-fot">
						{sheet?.index != null ? (
							<Button variant="destructiveText" onPress={remove}>
								Ta bort
							</Button>
						) : (
							<span />
						)}
						<Button variant="primary" isDisabled={!slot || problem !== null} onPress={apply}>
							Klar
						</Button>
					</div>
				}
			>
				{sheet && (
					<>
						<div className="falt-par">
							<TimeField
								label="Start"
								step={STANDARD_DAY_STEP}
								value={sheet.start}
								onChange={(v) => setSheet({ ...sheet, start: v })}
								errorMessage={problem ? PROBLEMS[problem] : undefined}
							/>
							<TimeField
								label="Slut"
								step={STANDARD_DAY_STEP}
								pickerStart={endWheelStart(sheet.start)}
								value={sheet.end}
								onChange={(v) => setSheet({ ...sheet, end: v })}
							/>
						</div>
						<section className="sektion">
							<span className="kh-text-caption dampad" id="pass-kod-rubrik">
								TIDKOD
							</span>
							<FilterChips
								aria-labelledby="pass-kod-rubrik"
								options={active.map((c) => ({ value: c.id, label: c.name }))}
								selected={[sheet.codeId]}
								// The chips allow several; a new press replaces the choice.
								onChange={(ids) => {
									const pressed = ids.find((id) => id !== sheet.codeId);
									if (pressed) setSheet({ ...sheet, codeId: pressed });
								}}
							/>
						</section>
					</>
				)}
			</BottomSheet>
		</section>
	);
}
