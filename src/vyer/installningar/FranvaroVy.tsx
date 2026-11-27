// Absence types and the owner's free days (mockup "Frånvaro och lediga dagar"). Each change is
// saved at once: an absence type or a free day from its sheet, an eve with its switch.
import {
	BottomSheet,
	Button,
	Row,
	SegmentedChoice,
	SwitchRow,
	TextField,
	TopBar
} from '@kodhast/web-ui-react';
import { useState } from 'react';
import { freeDaysByDate } from '../../domain/helgdagar.ts';
import {
	COUNTING_LABELS,
	evesOf,
	freeDayErrors,
	isEve,
	longDate,
	nameError,
	newId,
	nextNumber
} from '../../domain/installningar.ts';
import type { AbsenceCounting, AbsenceType, FreeDay, IsoDate } from '../../domain/types.ts';
import { href } from '../rutter.ts';
import { ArchiveDelete, OfflineNotice, SaveFailed, useSave } from './delar';

export interface FranvaroVyProps {
	absenceTypes: readonly AbsenceType[];
	freeDays: readonly FreeDay[];
	today: IsoDate;
	online: boolean;
	onSaveAbsenceType: (before: AbsenceType | null, after: AbsenceType) => Promise<void>;
	onSaveFreeDay: (before: FreeDay | null, after: FreeDay | null) => Promise<void>;
	/** Deletes an absence type no time uses (issue 80); gives the reason when it may not. */
	onDeleteAbsenceType: (id: string) => Promise<string | null>;
}

const COUNTINGS: AbsenceCounting[] = ['fillsNorm', 'flexWithdrawal', 'worked'];

/** The sheet's state: which item it edits (null = a new one) and the fields. */
type AbsenceSheet = { before: AbsenceType | null; name: string; counting: AbsenceCounting };
type FreeDaySheet = { before: FreeDay | null; date: string; name: string };

export function FranvaroVy({
	absenceTypes,
	freeDays,
	today,
	online,
	onSaveAbsenceType,
	onSaveFreeDay,
	onDeleteAbsenceType
}: FranvaroVyProps) {
	const [absence, setAbsence] = useState<AbsenceSheet | null>(null);
	const [freeDay, setFreeDay] = useState<FreeDaySheet | null>(null);
	const save = useSave();

	const types = [...absenceTypes].sort((a, b) => a.order - b.order);
	const byDate = freeDaysByDate(freeDays);
	const year = Number(today.slice(0, 4));
	const eves = [...evesOf(year, byDate), ...evesOf(year + 1, byDate)].filter(
		(e) => e.date >= today
	);
	const ownDays = freeDays
		.filter((d) => d.free && !isEve(d.date))
		.sort((a, b) => a.date.localeCompare(b.date));

	const absenceValid = absence !== null && nameError(absence.name) === null;
	const absenceDirty =
		absence !== null &&
		(absence.before === null ||
			absence.before.name !== absence.name.trim() ||
			absence.before.counting !== absence.counting);
	const saveAbsence = async () => {
		if (!absence) return;
		const before = absence.before;
		const after: AbsenceType = {
			id: before?.id ?? newId(),
			name: absence.name.trim(),
			counting: absence.counting,
			archived: before?.archived ?? false,
			order: before?.order ?? nextNumber(absenceTypes.map((t) => t.order))
		};
		if (await save.run(() => onSaveAbsenceType(before, after))) setAbsence(null);
	};

	const taken = new Set(
		freeDays.map((d) => d.date).filter((date) => date !== freeDay?.before?.date)
	);
	const dayErrors = freeDay ? freeDayErrors(freeDay.date, freeDay.name, taken) : {};
	const dayDirty =
		freeDay !== null &&
		(freeDay.before === null ||
			freeDay.before.date !== freeDay.date ||
			freeDay.before.name !== freeDay.name.trim());
	const saveDay = async (after: FreeDay | null) => {
		if (!freeDay) return;
		if (await save.run(() => onSaveFreeDay(freeDay.before, after))) setFreeDay(null);
	};

	return (
		<>
			<TopBar title="Frånvaro och lediga dagar" backHref={href({ view: 'installningar' })} />
			<div className="innehall">
				<OfflineNotice online={online} />
				<SaveFailed failed={save.failed && absence === null && freeDay === null} />
				<section className="sektion">
					<h2 className="kh-text-section-title">Frånvarotyper</h2>
					<div className="kh-card radlista">
						{types.map((t) => (
							<Row
								key={t.id}
								title={t.name}
								subtitle={
									t.archived
										? `Arkiverad · ${COUNTING_LABELS[t.counting]}`
										: COUNTING_LABELS[t.counting]
								}
								inactive={t.archived}
								navigates
								onPress={() => setAbsence({ before: t, name: t.name, counting: t.counting })}
							/>
						))}
					</div>
					<div>
						<Button
							variant="text"
							onPress={() => setAbsence({ before: null, name: '', counting: 'fillsNorm' })}
						>
							Lägg till frånvarotyp
						</Button>
					</div>
				</section>

				<section className="sektion">
					<h2 className="kh-text-section-title">Lediga dagar utöver helgdagarna</h2>
					<div className="kh-card radlista">
						{eves.map((e) => (
							<SwitchRow
								key={e.date}
								title={`${e.name} ${e.date.slice(0, 4)}`}
								subtitle={e.free ? 'Ledig' : 'Arbetsdag'}
								isSelected={e.free}
								isDisabled={!online || save.pending}
								onChange={(free) =>
									void save.run(() =>
										onSaveFreeDay(
											byDate.get(e.date) ?? null,
											free ? null : { date: e.date, free: false, name: e.name }
										)
									)
								}
							/>
						))}
						{ownDays.map((d) => (
							<Row
								key={d.date}
								title={longDate(d.date)}
								subtitle={d.name || 'Ledig dag'}
								navigates
								onPress={() => setFreeDay({ before: d, date: d.date, name: d.name })}
							/>
						))}
					</div>
					<div>
						<Button onPress={() => setFreeDay({ before: null, date: '', name: '' })}>
							Lägg till ledig dag
						</Button>
					</div>
					<p className="kh-text-item-subtitle dampad">Svenska helgdagar räknas bort av appen.</p>
				</section>
			</div>

			<BottomSheet
				title={absence?.before ? absence.before.name : 'Ny frånvarotyp'}
				isOpen={absence !== null}
				onOpenChange={(open) => !open && setAbsence(null)}
				footer={
					<Button
						variant="primary"
						block
						isDisabled={!online || !absenceValid || !absenceDirty}
						isPending={save.pending}
						onPress={() => void saveAbsence()}
					>
						Spara
					</Button>
				}
			>
				{absence && (
					<>
						<SaveFailed failed={save.failed} />
						<TextField
							label="Namn"
							value={absence.name}
							onChange={(name) => setAbsence({ ...absence, name })}
						/>
						<span className="kh-text-caption dampad" id="rakning-rubrik">
							RÄKNAS SOM
						</span>
						<SegmentedChoice
							aria-labelledby="rakning-rubrik"
							options={COUNTINGS.map((c) => ({
								value: c,
								label: COUNTING_LABELS[c].replace('Räknas som a', 'A')
							}))}
							value={absence.counting}
							onChange={(counting) =>
								setAbsence({ ...absence, counting: counting as AbsenceCounting })
							}
						/>
						<p className="kh-text-item-subtitle dampad">
							Ändrad räkning ändrar flexen bakåt och skrivs i ändringsloggen.
						</p>
						{absence.before && (
							<ArchiveDelete
								noun="frånvarotypen"
								archived={absence.before.archived}
								hint={
									absence.before.archived
										? 'Arkiverad: typen går inte att välja för ny frånvaro.'
										: 'En arkiverad typ går inte att välja för ny frånvaro. Frånvaron som har den finns kvar.'
								}
								confirmText="Frånvarotypen raderas och tas bort ur mottagarnas koppling. Det går inte att ångra. En typ med frånvaro kan bara arkiveras."
								enabled={online && !save.pending}
								onArchive={() => {
									const before = absence.before!;
									void save
										.run(() => onSaveAbsenceType(before, { ...before, archived: !before.archived }))
										.then((ok) => ok && setAbsence(null));
								}}
								onDelete={async () => {
									const refused = await onDeleteAbsenceType(absence.before!.id);
									if (refused === null) setAbsence(null);
									return refused;
								}}
							/>
						)}
					</>
				)}
			</BottomSheet>

			<BottomSheet
				title={freeDay?.before ? longDate(freeDay.before.date) : 'Ny ledig dag'}
				isOpen={freeDay !== null}
				onOpenChange={(open) => !open && setFreeDay(null)}
				footer={
					<>
						{freeDay?.before && (
							<Button
								variant="destructiveText"
								isDisabled={!online || save.pending}
								onPress={() => void saveDay(null)}
							>
								Ta bort
							</Button>
						)}
						<Button
							variant="primary"
							isDisabled={
								!online || !dayDirty || dayErrors.date !== undefined || dayErrors.name !== undefined
							}
							isPending={save.pending}
							onPress={() =>
								freeDay &&
								void saveDay({ date: freeDay.date, free: true, name: freeDay.name.trim() })
							}
						>
							Spara
						</Button>
					</>
				}
			>
				{freeDay && (
					<>
						<SaveFailed failed={save.failed} />
						<TextField
							label="Datum"
							type="date"
							value={freeDay.date}
							onChange={(date) => setFreeDay({ ...freeDay, date })}
							errorMessage={freeDay.date === '' ? undefined : dayErrors.date}
						/>
						<TextField
							label="Namn"
							value={freeDay.name}
							onChange={(name) => setFreeDay({ ...freeDay, name })}
							description="Till exempel Klämdag"
							errorMessage={dayErrors.name}
						/>
					</>
				)}
			</BottomSheet>
		</>
	);
}
