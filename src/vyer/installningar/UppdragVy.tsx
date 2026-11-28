// An assignment (mockup "Uppdrag"): name, the periods of scope (ADR 0021), opening balance, the internal
// codes with billable, the employer and customer (ADR 0019), and the receivers in the chain.
import {
	BottomSheet,
	Button,
	buttonClass,
	Row,
	SwitchRow,
	TextField,
	TopBar
} from '@kodhast/web-ui-react';
import { useState } from 'react';
import {
	assignmentAfter,
	assignmentForm,
	nameError,
	newId,
	nextNumber,
	plural,
	readAssignmentForm,
	receiversForNewAssignment,
	unmappedCodes,
	type AssignmentForm
} from '../../domain/installningar.ts';
import { DEFAULT_WORKDAY_MINUTES } from '../../domain/norm.ts';
import { termsIn, type Periods } from '../../domain/perioder.ts';
import type {
	Assignment,
	Id,
	Customer,
	Employer,
	IsoDate,
	Receiver,
	StandardDaySlot,
	TimeCode
} from '../../domain/types.ts';
import type { CodeChange } from '../../data/installningar.ts';
import { href } from '../rutter.ts';
import { ArchiveDelete, ChoiceRow, OfflineNotice, SaveFailed, useSave } from './delar';
import { Perioder } from './Perioder';
import { Standarddag } from './Standarddag';

export const SUGGESTION_LABELS = {
	fillNorm: 'Fyll mot normen',
	actualQuarter: 'Faktisk tid'
} as const;

export interface UppdragVyProps {
	assignment: Assignment | null;
	codes: readonly TimeCode[];
	receivers: readonly Receiver[];
	employers: readonly Employer[];
	customers: readonly Customer[];
	/** The order a new assignment gets. */
	nextOrder: number;
	today: IsoDate;
	online: boolean;
	/** `receivers`: a new assignment's first receivers, from its employer and customer. */
	onSave: (
		before: Assignment | null,
		after: Assignment,
		codes: CodeChange[],
		receivers: Receiver[]
	) => Promise<void>;
	/** Deletes the assignment and all of it; gives the reason when it may not be deleted. */
	onDelete: (id: Id) => Promise<string | null>;
	/** Deletes a saved code that nothing uses (issue 80); gives the reason when it may not. */
	onDeleteCode: (id: Id) => Promise<string | null>;
}

const sameForm = (a: AssignmentForm, b: AssignmentForm) =>
	(Object.keys(a) as (keyof AssignmentForm)[]).every((k) => a[k] === b[k]);

export function UppdragVy({
	assignment,
	codes,
	receivers,
	employers,
	customers,
	nextOrder,
	today,
	online,
	onSave,
	onDelete,
	onDeleteCode
}: UppdragVyProps) {
	// Archived ones are not offered, except the one already chosen.
	const offered = <T extends { id: string; archived: boolean; order: number }>(
		items: readonly T[],
		chosen: string | null | undefined
	) => items.filter((i) => !i.archived || i.id === chosen).sort((a, b) => a.order - b.order);
	const employerOptions = offered(employers, assignment?.employerId);
	const customerOptions = offered(customers, assignment?.customerId);
	// A new assignment starts with the employer when there is only one to choose.
	const initialForm = assignmentForm(
		assignment,
		today,
		employerOptions.length === 1 ? employerOptions[0]!.id : ''
	);
	const [form, setForm] = useState(initialForm);
	const sortedCodes = [...codes].sort((a, b) => a.order - b.order);
	const [codeList, setCodeList] = useState<TimeCode[]>(sortedCodes);
	const initialSlots = assignment?.standardDay ?? [];
	const [slots, setSlots] = useState<StandardDaySlot[]>(initialSlots);
	// The periods of scope (ADR 0021). A new assignment starts today with the employer's workday.
	const chosenEmployer = employers.find((e) => e.id === initialForm.employerId);
	const initialPeriods: Periods = assignment
		? { terms: assignment.terms, endDate: assignment.endDate }
		: {
				terms: [
					{
						from: today,
						scopePercent: 100,
						workdayMinutes:
							(chosenEmployer && termsIn(chosenEmployer, today)?.workdayMinutes) ??
							DEFAULT_WORKDAY_MINUTES
					}
				],
				endDate: null
			};
	const [periods, setPeriods] = useState<Periods>(initialPeriods);
	// What the form and the list started from. The first values can come from the local cache and
	// the server's a moment later: what the user has not touched follows the newer values.
	const [shown, setShown] = useState({
		form: initialForm,
		codes: sortedCodes,
		slots: initialSlots,
		periods: initialPeriods
	});
	const formMoved = !sameForm(initialForm, shown.form);
	const codesMoved = JSON.stringify(sortedCodes) !== JSON.stringify(shown.codes);
	const slotsMoved = JSON.stringify(initialSlots) !== JSON.stringify(shown.slots);
	const periodsMoved = JSON.stringify(initialPeriods) !== JSON.stringify(shown.periods);
	if (formMoved || codesMoved || slotsMoved || periodsMoved) {
		if (formMoved && sameForm(form, shown.form)) setForm(initialForm);
		if (codesMoved && JSON.stringify(codeList) === JSON.stringify(shown.codes))
			setCodeList(sortedCodes);
		if (slotsMoved && JSON.stringify(slots) === JSON.stringify(shown.slots)) setSlots(initialSlots);
		if (periodsMoved && JSON.stringify(periods) === JSON.stringify(shown.periods))
			setPeriods(initialPeriods);
		setShown({
			form: initialForm,
			codes: sortedCodes,
			slots: initialSlots,
			periods: initialPeriods
		});
	}
	// The code sheet: a new code (id null) or one in the list being changed.
	const [codeSheet, setCodeSheet] = useState<{
		id: Id | null;
		name: string;
		billable: boolean;
	} | null>(null);
	const [customerReceives, setCustomerReceives] = useState(true);
	const save = useSave();

	// A new assignment needs an employer; one from before ADR 0019 may stay without.
	const read = readAssignmentForm(form, !assignment || assignment.employerId !== null);
	const changedCodes: CodeChange[] = codeList.flatMap((after) => {
		const before = codes.find((c) => c.id === after.id) ?? null;
		return before &&
			before.name === after.name &&
			before.billable === after.billable &&
			before.archived === after.archived
			? []
			: [{ before, after }];
	});
	const slotsChanged = JSON.stringify(slots) !== JSON.stringify(initialSlots);
	const periodsChanged = JSON.stringify(periods) !== JSON.stringify(initialPeriods);
	const dirty =
		!sameForm(form, initialForm) || changedCodes.length > 0 || slotsChanged || periodsChanged;
	const canSave = online && read.values !== null && dirty && !save.pending;
	const set = (field: keyof AssignmentForm) => (value: string) =>
		setForm((f) => ({ ...f, [field]: value }));
	// Errors show once a field differs from where it started, so a new form is not all red.
	const error = (field: keyof AssignmentForm) =>
		form[field] !== initialForm[field] ? read.errors?.[field] : undefined;

	const submit = () => {
		if (!read.values) return;
		const id = assignment?.id ?? newId();
		const after = {
			...assignmentAfter(assignment, { ...read.values, periods }, today, id, nextOrder),
			standardDay: slots
		};
		const withParent = changedCodes.map((c) => ({
			...c,
			after: { ...c.after, assignmentId: after.id }
		}));
		const employer = employers.find((e) => e.id === after.employerId);
		const customer = customers.find((c) => c.id === after.customerId);
		const firstReceivers =
			!assignment && employer
				? receiversForNewAssignment(
						after.id,
						withParent.map((c) => c.after),
						employer,
						customerReceives ? (customer ?? null) : null
					)
				: [];
		void save.run(() => onSave(assignment, after, withParent, firstReceivers));
	};

	const applyCode = () => {
		if (!codeSheet) return;
		const { id, billable } = codeSheet;
		const name = codeSheet.name.trim();
		setCodeList((list) =>
			id === null
				? [
						...list,
						{
							id: newId(),
							assignmentId: assignment?.id ?? '',
							name,
							billable,
							archived: false,
							order: nextNumber(list.map((c) => c.order))
						}
					]
				: list.map((c) => (c.id === id ? { ...c, name, billable } : c))
		);
		setCodeSheet(null);
	};
	const sheetCode = codeList.find((c) => c.id === codeSheet?.id);
	// Only a saved code can be archived or deleted; a new one is just not added.
	const savedCode = codes.find((c) => c.id === codeSheet?.id);
	const archiveCode = (id: Id) => {
		setCodeList((list) => list.map((c) => (c.id === id ? { ...c, archived: !c.archived } : c)));
		setCodeSheet(null);
	};
	const deleteCode = async (id: Id) => {
		const refused = await onDeleteCode(id);
		if (refused === null) {
			setCodeList((list) => list.filter((c) => c.id !== id));
			setSlots((list) => list.filter((s) => s.codeId !== id));
			setCodeSheet(null);
		}
		return refused;
	};
	const codeSheetDirty =
		codeSheet !== null &&
		(!sheetCode ||
			sheetCode.name !== codeSheet.name.trim() ||
			sheetCode.billable !== codeSheet.billable);

	// Archived ones too, so that they can be restored; the first still counts for flex.
	const sortedReceivers = [...receivers].sort((a, b) => a.position - b.position);

	return (
		<>
			<TopBar
				title={assignment?.name ?? 'Nytt uppdrag'}
				backHref={href({ view: 'installningar' })}
				actions={
					<Button
						variant="primary"
						compact
						isDisabled={!canSave}
						isPending={save.pending}
						onPress={submit}
					>
						Spara
					</Button>
				}
			/>
			<div className="innehall">
				<OfflineNotice online={online} />
				<SaveFailed failed={save.failed} />
				<section className="sektion">
					<TextField
						label="Namn"
						value={form.name}
						onChange={set('name')}
						errorMessage={error('name')}
					/>
					{employerOptions.length > 0 ? (
						<ChoiceRow
							label="Arbetsgivare"
							placeholder="Välj arbetsgivare"
							options={employerOptions}
							value={form.employerId}
							onChange={set('employerId')}
							error={error('employerId')}
						/>
					) : (
						<p className="kh-text-item-subtitle">
							Ett uppdrag hör till en arbetsgivare.{' '}
							<a href={href({ view: 'arbetsgivare', id: null })}>Lägg till arbetsgivaren först</a>.
						</p>
					)}
					<ChoiceRow
						label="Kund"
						options={customerOptions}
						value={form.customerId}
						onChange={set('customerId')}
						noneLabel="Ingen kund"
					/>
					<TextField
						label="Ingående flexsaldo"
						suffix="h"
						value={form.openingFlex}
						onChange={set('openingFlex')}
						description="Flex du hade innan du började med appen"
						errorMessage={error('openingFlex')}
					/>
					{assignment && read.values && dirty && (
						<p className="kh-text-item-subtitle dampad">
							Ändringar som påverkar flexen skrivs i ändringsloggen.
						</p>
					)}
				</section>

				<Perioder
					periods={periods}
					onChange={setPeriods}
					today={today}
					title="Omfattning"
					hint="Uppdraget gäller från första periodens start till sista periodens slut. Perioderna ligger kant i kant; ett uppehåll är en period med 0 %."
				/>

				<section className="sektion">
					<h2 className="kh-text-section-title">Tidkoder</h2>
					{codeList.length > 0 && (
						<div className="kh-card radlista">
							{codeList.map((c) => (
								<Row
									key={c.id}
									title={c.name}
									subtitle={[
										...(c.archived ? ['Arkiverad'] : []),
										c.billable ? 'Debiterbar' : 'Inte debiterbar'
									].join(' · ')}
									inactive={c.archived}
									navigates
									onPress={() => setCodeSheet({ id: c.id, name: c.name, billable: c.billable })}
								/>
							))}
						</div>
					)}
					<div>
						<Button
							variant="text"
							onPress={() => setCodeSheet({ id: null, name: '', billable: true })}
						>
							Lägg till tidkod
						</Button>
					</div>
				</section>

				<Standarddag slots={slots} codes={codeList} onChange={setSlots} />

				<section className="sektion">
					<h2 className="kh-text-section-title">Mottagare i ordning</h2>
					{!assignment ? (
						<>
							{form.customerId !== '' && (
								<div className="kh-card radlista">
									<SwitchRow
										title="Kunden får också veckorapporten"
										subtitle="Blir mottagare 2, efter arbetsgivaren"
										isSelected={customerReceives}
										onChange={setCustomerReceives}
									/>
								</div>
							)}
							<p className="kh-text-item-subtitle dampad">
								Arbetsgivaren blir mottagare 1, och flexen räknas mot den. Fler mottagare lägger du
								till när uppdraget är sparat.
							</p>
						</>
					) : (
						<>
							{sortedReceivers.length > 0 && (
								<div className="kh-card radlista">
									{sortedReceivers.map((r, i) => {
										const missing = unmappedCodes(codes, r).length;
										const parts: string[] = [SUGGESTION_LABELS[r.suggestionMode]];
										if (r.archived) parts.unshift('Arkiverad');
										if (i === 0) parts.push('flexen räknas härifrån');
										if (missing > 0) parts.push(plural(missing, 'omappad', 'omappade'));
										else parts.push(plural(r.codes.length, 'kod', 'koder'));
										return (
											<Row
												key={r.id}
												href={href({
													view: 'mottagare',
													assignmentId: assignment.id,
													id: r.id
												})}
												title={`${i + 1} · ${r.name}`}
												subtitle={parts.join(' · ')}
												inactive={r.archived}
												navigates
											/>
										);
									})}
								</div>
							)}
							<div>
								<a
									className={buttonClass({ variant: 'text' })}
									href={href({ view: 'mottagare', assignmentId: assignment.id, id: null })}
								>
									Lägg till mottagare
								</a>
							</div>
						</>
					)}
				</section>

				{assignment && (
					<section className="sektion">
						<ArchiveDelete
							noun="uppdraget"
							archived={assignment.archived}
							hint={
								assignment.archived
									? 'Arkiverat: uppdraget går inte att välja för ny tid.'
									: 'Ett arkiverat uppdrag går inte att välja för ny tid. Tiden och rapporterna finns kvar.'
							}
							confirmText="Uppdraget raderas med sina tidkoder, mottagare, tider och rapportutkast. Det går inte att ångra. Ett uppdrag med skickade veckor kan bara arkiveras."
							enabled={online && !save.pending}
							onArchive={() =>
								void save.run(() =>
									onSave(assignment, { ...assignment, archived: !assignment.archived }, [], [])
								)
							}
							onDelete={() => onDelete(assignment.id)}
						/>
					</section>
				)}
			</div>

			<BottomSheet
				title={codeSheet?.id ? 'Ändra tidkod' : 'Ny tidkod'}
				isOpen={codeSheet !== null}
				onOpenChange={(open) => !open && setCodeSheet(null)}
				footer={
					<Button
						variant="primary"
						block
						isDisabled={!codeSheet || nameError(codeSheet.name) !== null || !codeSheetDirty}
						onPress={applyCode}
					>
						{codeSheet?.id ? 'Klar' : 'Lägg till'}
					</Button>
				}
			>
				{codeSheet && (
					<>
						<TextField
							label="Namn"
							value={codeSheet.name}
							onChange={(name) => setCodeSheet({ ...codeSheet, name })}
						/>
						<SwitchRow
							title="Debiterbar"
							isSelected={codeSheet.billable}
							onChange={(billable) => setCodeSheet({ ...codeSheet, billable })}
						/>
						{codeSheet.id && (
							<p className="kh-text-item-subtitle dampad">
								Sparas med uppdraget. Mottagarnas koder ändras inte.
							</p>
						)}
						{savedCode && sheetCode && (
							<ArchiveDelete
								noun="tidkoden"
								archived={sheetCode.archived}
								hint={
									sheetCode.archived
										? 'Arkiverad: koden går inte att välja för ny tid.'
										: 'En arkiverad kod går inte att välja för ny tid. Tiden som har den finns kvar.'
								}
								confirmText="Tidkoden raderas och tas bort ur mottagarnas koppling. Det går inte att ångra. En kod med tid kan bara arkiveras."
								enabled={online && !save.pending}
								onArchive={() => archiveCode(savedCode.id)}
								onDelete={() => deleteCode(savedCode.id)}
							/>
						)}
					</>
				)}
			</BottomSheet>
		</>
	);
}
