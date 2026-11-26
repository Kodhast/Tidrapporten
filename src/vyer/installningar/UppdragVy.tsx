// An assignment (mockup "Uppdrag"): name, scope, workday, start and opening balance, the internal
// codes with billable, the employer and customer (ADR 0019), and the receivers in the chain.
import {
	BottomSheet,
	Button,
	buttonClass,
	ConfirmDialog,
	Notice,
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
import type {
	Assignment,
	Id,
	Customer,
	Employer,
	IsoDate,
	Receiver,
	TimeCode
} from '../../domain/types.ts';
import type { CodeChange } from '../../data/installningar.ts';
import { href } from '../rutter.ts';
import { WarningIcon } from '../ikoner';
import { ChoiceRow, OfflineNotice, SaveFailed, useSave } from './delar';

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
	onDelete
}: UppdragVyProps) {
	const removing = useSave();
	const [askDelete, setAskDelete] = useState(false);
	const [refused, setRefused] = useState<string | null>(null);
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
	const [adding, setAdding] = useState(false);
	const [newName, setNewName] = useState('');
	const [newBillable, setNewBillable] = useState(true);
	const [customerReceives, setCustomerReceives] = useState(true);
	const save = useSave();

	// A new assignment needs an employer; one from before ADR 0019 may stay without.
	const read = readAssignmentForm(form, !assignment || assignment.employerId !== null);
	const changedCodes: CodeChange[] = codeList.flatMap((after) => {
		const before = codes.find((c) => c.id === after.id) ?? null;
		return before && before.name === after.name && before.billable === after.billable
			? []
			: [{ before, after }];
	});
	const dirty = !sameForm(form, initialForm) || changedCodes.length > 0;
	const canSave = online && read.values !== null && dirty && !save.pending;
	const set = (field: keyof AssignmentForm) => (value: string) =>
		setForm((f) => ({ ...f, [field]: value }));
	// Errors show once a field differs from where it started, so a new form is not all red.
	const error = (field: keyof AssignmentForm) =>
		form[field] !== initialForm[field] ? read.errors?.[field] : undefined;

	const submit = () => {
		if (!read.values) return;
		const id = assignment?.id ?? newId();
		const after = assignmentAfter(assignment, read.values, today, id, nextOrder);
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

	const addCode = () => {
		setCodeList((list) => [
			...list,
			{
				id: newId(),
				assignmentId: assignment?.id ?? '',
				name: newName.trim(),
				billable: newBillable,
				archived: false,
				order: nextNumber(list.map((c) => c.order))
			}
		]);
		setAdding(false);
		setNewName('');
		setNewBillable(true);
	};

	const sortedReceivers = [...receivers]
		.filter((r) => !r.archived)
		.sort((a, b) => a.position - b.position);

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
					<div className="falt-par">
						<TextField
							label="Omfattning"
							suffix="%"
							inputMode="numeric"
							value={form.scope}
							onChange={set('scope')}
							errorMessage={error('scope')}
						/>
						<TextField
							label="Arbetsdag"
							suffix="h"
							inputMode="decimal"
							value={form.workday}
							onChange={set('workday')}
							description="Vid 100 %"
							errorMessage={error('workday')}
						/>
					</div>
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
						label="Startdatum"
						type="date"
						value={form.startDate}
						onChange={set('startDate')}
						description="Flexen räknas från den dagen"
						errorMessage={error('startDate')}
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
							Ändrad omfattning eller arbetsdag gäller från i dag. Ändringar som påverkar flexen
							skrivs i ändringsloggen.
						</p>
					)}
				</section>

				<section className="sektion">
					<h2 className="kh-text-section-title">Tidkoder</h2>
					{codeList.length > 0 && (
						<div className="kh-card radlista">
							{codeList.map((c) => (
								<SwitchRow
									key={c.id}
									title={c.name}
									subtitle={c.billable ? 'Debiterbar' : 'Inte debiterbar'}
									isSelected={c.billable}
									onChange={(billable) =>
										setCodeList((list) => list.map((x) => (x.id === c.id ? { ...x, billable } : x)))
									}
								/>
							))}
						</div>
					)}
					<div>
						<Button variant="text" onPress={() => setAdding(true)}>
							Lägg till tidkod
						</Button>
					</div>
				</section>

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
						<p className="kh-text-item-subtitle dampad">
							{assignment.archived
								? 'Arkiverat: uppdraget går inte att välja för ny tid.'
								: 'Ett arkiverat uppdrag går inte att välja för ny tid. Tiden och rapporterna finns kvar.'}
						</p>
						<div>
							<Button
								variant={assignment.archived ? 'tonal' : 'destructiveText'}
								isDisabled={!online || save.pending}
								onPress={() =>
									void save.run(() =>
										onSave(assignment, { ...assignment, archived: !assignment.archived }, [], [])
									)
								}
							>
								{assignment.archived ? 'Återställ uppdraget' : 'Arkivera uppdraget'}
							</Button>
						</div>
						{refused && (
							<Notice
								tone="ton-fel"
								icon={<WarningIcon />}
								title="Uppdraget kan inte raderas"
								detail={refused}
							/>
						)}
						{removing.failed && (
							<Notice
								tone="ton-fel"
								icon={<WarningIcon />}
								title="Det gick inte att radera"
								detail="Kontrollera anslutningen och försök igen."
							/>
						)}
						<div>
							<Button
								variant="destructiveText"
								isDisabled={!online || save.pending}
								isPending={removing.pending}
								onPress={() => setAskDelete(true)}
							>
								Radera uppdraget
							</Button>
						</div>
						<ConfirmDialog
							isOpen={askDelete}
							onOpenChange={setAskDelete}
							destructive
							title="Radera uppdraget?"
							text="Uppdraget raderas med sina tidkoder, mottagare, tider och rapportutkast. Det går inte att ångra. Ett uppdrag med skickade veckor kan bara arkiveras."
							confirmLabel="Radera"
							onConfirm={() => {
								setRefused(null);
								void removing.run(async () => setRefused(await onDelete(assignment.id)));
							}}
						/>
					</section>
				)}
			</div>

			<BottomSheet
				title="Ny tidkod"
				isOpen={adding}
				onOpenChange={setAdding}
				footer={
					<Button
						variant="primary"
						block
						isDisabled={nameError(newName) !== null}
						onPress={addCode}
					>
						Lägg till
					</Button>
				}
			>
				<TextField label="Namn" value={newName} onChange={setNewName} />
				<SwitchRow title="Debiterbar" isSelected={newBillable} onChange={setNewBillable} />
			</BottomSheet>
		</>
	);
}
