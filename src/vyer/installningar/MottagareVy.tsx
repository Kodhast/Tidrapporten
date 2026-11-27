// A receiver in the chain (mockup "Mottagare och kodmappning"): name, the week's suggestion, the
// receiver's own codes in their order, and which of them each internal code and absence type
// becomes.
import {
	BottomSheet,
	Button,
	Notice,
	ReorderList,
	Row,
	SegmentedChoice,
	TextField,
	TopBar
} from '@kodhast/web-ui-react';
import { useState } from 'react';
import {
	cleanMapping,
	genitive,
	nameError,
	newId,
	nextNumber,
	unmappedCodes
} from '../../domain/installningar.ts';
import type {
	AbsenceType,
	Id,
	Receiver,
	ReceiverCode,
	SuggestionMode,
	TimeCode
} from '../../domain/types.ts';
import { DropdownIcon, WarningIcon } from '../ikoner';
import { href } from '../rutter.ts';
import { ArchiveDelete, OfflineNotice, SaveFailed, useSave } from './delar';
import { SUGGESTION_LABELS } from './UppdragVy';

export interface MottagareVyProps {
	assignmentId: Id;
	receiver: Receiver | null;
	/** The assignment's receivers, for the position a new one gets. */
	receivers: readonly Receiver[];
	codes: readonly TimeCode[];
	absenceTypes: readonly AbsenceType[];
	online: boolean;
	onSave: (before: Receiver | null, after: Receiver) => Promise<void>;
	/** Deletes the receiver; gives the reason when it may not (it has sent weeks). */
	onDelete: (id: Id) => Promise<string | null>;
}

interface Choosing {
	id: Id;
	name: string;
	/** An absence type may be left out of the receiver's report. */
	optional: boolean;
}

export function MottagareVy({
	assignmentId,
	receiver,
	receivers,
	codes,
	absenceTypes,
	online,
	onSave,
	onDelete
}: MottagareVyProps) {
	const [name, setName] = useState(receiver?.name ?? '');
	const [mode, setMode] = useState<SuggestionMode>(receiver?.suggestionMode ?? 'fillNorm');
	const [ownCodes, setOwnCodes] = useState<ReceiverCode[]>(receiver?.codes ?? []);
	const [mapping, setMapping] = useState<Record<Id, Id>>(receiver?.mapping ?? {});
	// The sheet for one of the receiver's codes: a new one (id null) or one in the list.
	const [codeSheet, setCodeSheet] = useState<{ id: Id | null; name: string } | null>(null);
	const [choosing, setChoosing] = useState<Choosing | null>(null);
	const save = useSave();

	const shownName = name.trim() || 'Mottagaren';
	const owner = genitive(shownName);
	const activeCodes = [...codes].filter((c) => !c.archived).sort((a, b) => a.order - b.order);
	const activeAbsence = [...absenceTypes]
		.filter((t) => !t.archived)
		.sort((a, b) => a.order - b.order);
	const after: Receiver = {
		id: receiver?.id ?? '',
		assignmentId,
		name: name.trim(),
		position:
			receiver?.position ??
			nextNumber(
				receivers.map((r) => r.position),
				1
			),
		suggestionMode: mode,
		codes: ownCodes,
		mapping: cleanMapping(mapping, ownCodes),
		archived: receiver?.archived ?? false,
		party: receiver?.party ?? null
	};
	const dirty =
		receiver === null ||
		JSON.stringify({ ...receiver, mapping: cleanMapping(receiver.mapping, receiver.codes) }) !==
			JSON.stringify(after);
	const valid = nameError(name) === null;
	const canSave = online && valid && dirty && !save.pending;
	const missing = unmappedCodes(activeCodes, after);
	const codeName = (id: Id | undefined) => ownCodes.find((c) => c.id === id)?.name;

	const submit = () =>
		void save.run(() => onSave(receiver, { ...after, id: receiver?.id ?? newId() }));

	const applyCode = () => {
		if (!codeSheet) return;
		const { id } = codeSheet;
		const name = codeSheet.name.trim();
		setOwnCodes((list) =>
			id === null
				? [...list, { id: newId(), name }]
				: list.map((c) => (c.id === id ? { ...c, name } : c))
		);
		setCodeSheet(null);
	};
	// The mapping to it goes when saved (cleanMapping); sent weeks keep its name in their snapshot.
	const removeCode = (id: Id) => {
		setOwnCodes((list) => list.filter((c) => c.id !== id));
		setCodeSheet(null);
	};
	const sheetCode = ownCodes.find((c) => c.id === codeSheet?.id);

	const choose = (target: Id | null) => {
		if (!choosing) return;
		setMapping((m) => {
			const next = { ...m };
			if (target === null) delete next[choosing.id];
			else next[choosing.id] = target;
			return next;
		});
		setChoosing(null);
	};

	const mappingRow = (id: Id, title: string, optional: boolean) => {
		const target = codeName(after.mapping[id]);
		return (
			<Row
				key={id}
				title={title}
				subtitle={target ? `→ ${target}` : optional ? 'Rapporteras inte' : 'Ingen kod vald'}
				trailing={<DropdownIcon />}
				onPress={() => setChoosing({ id, name: title, optional })}
			/>
		);
	};

	return (
		<>
			<TopBar
				title={receiver?.name ?? 'Ny mottagare'}
				backHref={href({ view: 'uppdrag', id: assignmentId })}
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
						value={name}
						onChange={setName}
						errorMessage={receiver && !valid ? nameError(name) : undefined}
					/>
					<span className="kh-text-caption dampad" id="forslag-rubrik">
						FÖRSLAG FÖR VECKAN
					</span>
					<SegmentedChoice
						aria-labelledby="forslag-rubrik"
						options={[
							{ value: 'fillNorm', label: SUGGESTION_LABELS.fillNorm },
							{ value: 'actualQuarter', label: SUGGESTION_LABELS.actualQuarter }
						]}
						value={mode}
						onChange={(value) => setMode(value as SuggestionMode)}
					/>
					<p className="kh-text-item-subtitle dampad">Faktisk tid avrundas till kvart.</p>
				</section>

				<section className="sektion">
					<h2 className="kh-text-section-title">{owner} koder</h2>
					<p className="kh-text-item-subtitle dampad">
						I den ordning de står i {owner} system. Dra för att flytta.
					</p>
					{ownCodes.length > 0 ? (
						<ReorderList
							aria-label={`${owner} koder`}
							items={ownCodes.map((c) => ({ id: c.id, title: c.name, textValue: c.name }))}
							onReorder={(ids) => setOwnCodes(ids.map((id) => ownCodes.find((c) => c.id === id)!))}
							onAction={(id) => {
								const c = ownCodes.find((x) => x.id === id);
								if (c) setCodeSheet({ id: c.id, name: c.name });
							}}
						/>
					) : (
						<p className="kh-text-item-subtitle dampad">Inga koder än.</p>
					)}
					<div>
						<Button variant="text" onPress={() => setCodeSheet({ id: null, name: '' })}>
							Lägg till kod
						</Button>
					</div>
				</section>

				<section className="sektion">
					<h2 className="kh-text-section-title">Våra koder blir</h2>
					{missing.length > 0 && (
						<Notice
							tone="ton-varning"
							icon={<WarningIcon />}
							title={
								missing.length === 1
									? `${missing[0]!.name} saknar kod hos ${shownName}`
									: `${missing.length} koder saknar kod hos ${shownName}`
							}
							detail="Välj en kod för var och en nedan. Det går att spara ändå."
						/>
					)}
					{activeCodes.length > 0 ? (
						<div className="kh-card radlista">
							{activeCodes.map((c) => mappingRow(c.id, c.name, false))}
						</div>
					) : (
						<p className="kh-text-item-subtitle dampad">Uppdraget har inga tidkoder än.</p>
					)}
					<p className="kh-text-item-subtitle dampad">Tryck för att välja kod i en lista.</p>
				</section>

				<section className="sektion">
					<h2 className="kh-text-section-title">Frånvaro blir</h2>
					<div className="kh-card radlista">
						{activeAbsence.map((t) => mappingRow(t.id, t.name, true))}
					</div>
				</section>
				{receiver && (
					<section className="sektion">
						<ArchiveDelete
							noun="mottagaren"
							archived={receiver.archived}
							hint={
								receiver.archived
									? 'Arkiverad: mottagaren får inga nya veckorapporter.'
									: 'En arkiverad mottagare får inga nya veckorapporter. Skickade veckor finns kvar.'
							}
							confirmText="Mottagaren raderas med sina rapportutkast. Var den först i kedjan räknas flexen mot nästa. Det går inte att ångra. En mottagare med skickade veckor kan bara arkiveras."
							enabled={online && !save.pending}
							onArchive={() =>
								void save.run(() => onSave(receiver, { ...receiver, archived: !receiver.archived }))
							}
							onDelete={() => onDelete(receiver.id)}
						/>
					</section>
				)}
			</div>

			<BottomSheet
				title={codeSheet?.id ? 'Ändra kod' : 'Ny kod'}
				subtitle={`Som den heter hos ${shownName}`}
				isOpen={codeSheet !== null}
				onOpenChange={(open) => !open && setCodeSheet(null)}
				footer={
					<Button
						variant="primary"
						block
						isDisabled={
							!codeSheet ||
							nameError(codeSheet.name) !== null ||
							sheetCode?.name === codeSheet.name.trim()
						}
						onPress={applyCode}
					>
						{codeSheet?.id ? 'Klar' : 'Lägg till'}
					</Button>
				}
			>
				{codeSheet && (
					<>
						<TextField
							label="Kod och namn"
							value={codeSheet.name}
							onChange={(name) => setCodeSheet({ ...codeSheet, name })}
						/>
						{sheetCode && (
							<>
								<p className="kh-text-item-subtitle dampad">
									Sparas med mottagaren. Skickade veckor behåller namnet de skickades med.
								</p>
								<div>
									<Button variant="destructiveText" onPress={() => removeCode(sheetCode.id)}>
										Ta bort koden
									</Button>
								</div>
							</>
						)}
					</>
				)}
			</BottomSheet>

			<BottomSheet
				title={choosing ? `${choosing.name} blir` : ''}
				isOpen={choosing !== null}
				onOpenChange={(open) => !open && setChoosing(null)}
			>
				<div className="kh-card radlista">
					{ownCodes.map((c) => (
						<Row key={c.id} title={c.name} onPress={() => choose(c.id)} />
					))}
					{choosing?.optional && <Row title="Rapporteras inte" onPress={() => choose(null)} />}
				</div>
				{ownCodes.length === 0 && (
					<p className="kh-text-item-subtitle dampad">Lägg först till {owner} koder.</p>
				)}
			</BottomSheet>
		</>
	);
}
