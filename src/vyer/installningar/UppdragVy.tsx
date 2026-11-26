// An assignment (mockup "Uppdrag"): name, scope, workday, start and opening balance, the internal
// codes with billable, and the receivers in the chain.
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
	unmappedCodes,
	type AssignmentForm
} from '../../domain/installningar.ts';
import type { Assignment, IsoDate, Receiver, TimeCode } from '../../domain/types.ts';
import type { CodeChange } from '../../data/installningar.ts';
import { href } from '../rutter.ts';
import { OfflineNotice, SaveFailed, useSave } from './delar';

export const SUGGESTION_LABELS = {
	fillNorm: 'Fyll mot normen',
	actualQuarter: 'Faktisk tid'
} as const;

export interface UppdragVyProps {
	assignment: Assignment | null;
	codes: readonly TimeCode[];
	receivers: readonly Receiver[];
	/** The order a new assignment gets. */
	nextOrder: number;
	today: IsoDate;
	online: boolean;
	onSave: (before: Assignment | null, after: Assignment, codes: CodeChange[]) => Promise<void>;
}

const sameForm = (a: AssignmentForm, b: AssignmentForm) =>
	(Object.keys(a) as (keyof AssignmentForm)[]).every((k) => a[k] === b[k]);

export function UppdragVy({
	assignment,
	codes,
	receivers,
	nextOrder,
	today,
	online,
	onSave
}: UppdragVyProps) {
	const initialForm = assignmentForm(assignment, today);
	const [form, setForm] = useState(initialForm);
	const sortedCodes = [...codes].sort((a, b) => a.order - b.order);
	const [codeList, setCodeList] = useState<TimeCode[]>(sortedCodes);
	const [adding, setAdding] = useState(false);
	const [newName, setNewName] = useState('');
	const [newBillable, setNewBillable] = useState(true);
	const save = useSave();

	const read = readAssignmentForm(form);
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
		void save.run(() => onSave(assignment, after, withParent));
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
						<p className="kh-text-item-subtitle dampad">
							Spara uppdraget först, sedan lägger du till mottagarna.
						</p>
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
										onSave(assignment, { ...assignment, archived: !assignment.archived }, [])
									)
								}
							>
								{assignment.archived ? 'Återställ uppdraget' : 'Arkivera uppdraget'}
							</Button>
						</div>
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
