// The start at first use (issue 64, mockup "Startflödet vid första start"): four steps for the
// employer, the customer, the assignment and its codes. Nothing is saved before the last step,
// and going back keeps what was typed.
import {
	BottomSheet,
	Button,
	SegmentedChoice,
	SwitchRow,
	TextField,
	TopBar
} from '@kodhast/web-ui-react';
import { useState, type ReactNode } from 'react';
import {
	assignmentForm,
	nameError,
	type AssignmentFormErrors
} from '../../domain/installningar.ts';
import {
	assignmentStepErrors,
	mondayOfDate,
	startDocuments,
	type StartAnswers,
	type StartDocuments
} from '../../domain/komigang.ts';
import { dateOf } from '../../domain/tid.ts';
import type { IsoDate, SuggestionMode } from '../../domain/types.ts';
import { OfflineNotice, SaveFailed, useSave } from '../installningar/delar';
import { SUGGESTION_LABELS } from '../installningar/UppdragVy';
import { href } from '../rutter.ts';

export interface KomIgangVyProps {
	/** Today by default; the day when the view opened. */
	today?: IsoDate;
	online: boolean;
	onSave: (docs: StartDocuments) => Promise<void>;
}

const STEPS = ['Arbetsgivaren', 'Kunden', 'Uppdraget', 'Tidkoder'] as const;

const firstAnswers = (today: IsoDate): StartAnswers => {
	const { name, scope, workday, openingFlex } = assignmentForm(null, today);
	return {
		employerName: '',
		suggestionMode: 'fillNorm',
		customerName: '',
		customerReceives: true,
		assignment: { name, scope, workday, openingFlex, startDate: mondayOfDate(today) },
		codes: []
	};
};

export function KomIgangVy({ today: givenToday, online, onSave }: KomIgangVyProps) {
	const [today] = useState(() => givenToday ?? dateOf(Date.now()));
	const [step, setStep] = useState(0);
	const [answers, setAnswers] = useState(() => firstAnswers(today));
	const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
	const [adding, setAdding] = useState(false);
	const [newName, setNewName] = useState('');
	const [newBillable, setNewBillable] = useState(true);
	const save = useSave();

	const set = (change: Partial<StartAnswers>) => setAnswers((a) => ({ ...a, ...change }));
	const setField = (field: keyof StartAnswers['assignment']) => (value: string) => {
		setTouched((t) => new Set(t).add(field));
		set({ assignment: { ...answers.assignment, [field]: value } });
	};
	const assignmentErrors: AssignmentFormErrors = assignmentStepErrors(answers.assignment) ?? {};
	const shownError = (field: keyof StartAnswers['assignment']) =>
		touched.has(field) ? assignmentErrors[field] : undefined;
	const hasCustomer = answers.customerName !== null;

	const done = [
		nameError(answers.employerName) === null,
		!hasCustomer || nameError(answers.customerName ?? '') === null,
		Object.keys(assignmentErrors).length === 0,
		answers.codes.length > 0
	];
	const ready = done.every(Boolean);
	const submit = () => {
		const docs = startDocuments(answers, today);
		if (docs) void save.run(() => onSave(docs));
	};

	const next = (
		<Button variant="primary" block isDisabled={!done[step]} onPress={() => setStep(step + 1)}>
			Nästa
		</Button>
	);

	let body: ReactNode;
	switch (step) {
		case 0:
			body = (
				<>
					<section className="sektion">
						<p className="kh-text-body">
							Vem är du anställd hos? Arbetsgivaren kan ha flera uppdrag. Den blir första mottagare
							i vart och ett, och flexen räknas mot den.
						</p>
						<TextField
							label="Arbetsgivare"
							value={answers.employerName}
							onChange={(employerName) => set({ employerName })}
						/>
						<h2 className="kh-text-section-title">Veckorapporten till arbetsgivaren</h2>
						<SegmentedChoice
							aria-label="Förslag"
							options={(['fillNorm', 'actualQuarter'] as const).map((v) => ({
								value: v,
								label: SUGGESTION_LABELS[v]
							}))}
							value={answers.suggestionMode}
							onChange={(v) => set({ suggestionMode: v as SuggestionMode })}
						/>
					</section>
					{next}
				</>
			);
			break;
		case 1:
			body = (
				<>
					<section className="sektion">
						<p className="kh-text-body">Vem gör du uppdraget åt? En kund kan ha flera uppdrag.</p>
						<SegmentedChoice
							aria-label="Kund"
							options={[
								{ value: 'ny', label: 'Ny kund' },
								{ value: 'ingen', label: 'Ingen kund' }
							]}
							value={hasCustomer ? 'ny' : 'ingen'}
							onChange={(v) => set({ customerName: v === 'ny' ? '' : null })}
						/>
						{hasCustomer && (
							<>
								<TextField
									label="Kundens namn"
									value={answers.customerName ?? ''}
									onChange={(customerName) => set({ customerName })}
								/>
								<div className="kh-card radlista">
									<SwitchRow
										title="Kunden får också veckorapporten"
										subtitle="Blir mottagare 2, efter arbetsgivaren"
										isSelected={answers.customerReceives}
										onChange={(customerReceives) => set({ customerReceives })}
									/>
								</div>
							</>
						)}
						<p className="kh-text-item-subtitle dampad">Ingen kund passar för interna uppdrag.</p>
					</section>
					{next}
				</>
			);
			break;
		case 2:
			body = (
				<>
					<section className="sektion">
						<p className="kh-text-item-subtitle dampad">
							{[answers.employerName.trim(), answers.customerName?.trim() || 'Ingen kund'].join(
								' · '
							)}
						</p>
						<TextField
							label="Uppdragets namn"
							value={answers.assignment.name}
							onChange={setField('name')}
							errorMessage={shownError('name')}
						/>
						<TextField
							label="Omfattning"
							suffix="%"
							inputMode="numeric"
							value={answers.assignment.scope}
							onChange={setField('scope')}
							errorMessage={shownError('scope')}
						/>
						<TextField
							label="Startdatum"
							type="date"
							value={answers.assignment.startDate}
							onChange={setField('startDate')}
							errorMessage={shownError('startDate')}
						/>
						<TextField
							label="Ingående flexsaldo"
							suffix="h"
							value={answers.assignment.openingFlex}
							onChange={setField('openingFlex')}
							description="Flex du hade innan du började med appen"
							errorMessage={shownError('openingFlex')}
						/>
					</section>
					{next}
				</>
			);
			break;
		default:
			body = (
				<>
					<OfflineNotice online={online} />
					<SaveFailed failed={save.failed} />
					<section className="sektion">
						<p className="kh-text-body">
							Koderna du startar timern på. Minst en. Mottagarna får samma koder, och du kan byta
							deras namn sedan.
						</p>
						{answers.codes.length > 0 && (
							<div className="kh-card radlista">
								{answers.codes.map((c, i) => (
									<SwitchRow
										key={i}
										title={c.name}
										subtitle={c.billable ? 'Debiterbar' : 'Inte debiterbar'}
										isSelected={c.billable}
										onChange={(billable) =>
											set({
												codes: answers.codes.map((x, j) => (j === i ? { ...x, billable } : x))
											})
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
					<Button
						variant="primary"
						block
						isDisabled={!ready || !online || save.pending}
						isPending={save.pending}
						onPress={submit}
					>
						Spara och börja
					</Button>
				</>
			);
	}

	return (
		<>
			<TopBar
				title={STEPS[step]}
				{...(step === 0
					? { backHref: href({ view: 'idag' }) }
					: { onBack: () => setStep(step - 1) })}
				actions={
					<span className="kh-text-label steg-nummer">
						Steg {step + 1} av {STEPS.length}
					</span>
				}
			/>
			<div className="innehall">{body}</div>
			<BottomSheet
				title="Ny tidkod"
				isOpen={adding}
				onOpenChange={setAdding}
				footer={
					<Button
						variant="primary"
						block
						isDisabled={nameError(newName) !== null}
						onPress={() => {
							set({ codes: [...answers.codes, { name: newName.trim(), billable: newBillable }] });
							setAdding(false);
							setNewName('');
							setNewBillable(true);
						}}
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
