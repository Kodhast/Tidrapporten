// An employer or a customer (ADR 0019, mockup "Inställningar – arbetsgivare och kunder"): the
// name, and for the employer the suggestion its report starts with in a new assignment. A new
// name is not copied to receivers that already exist.
import { Button, SegmentedChoice, TextField, TopBar } from '@kodhast/web-ui-react';
import { useState } from 'react';
import { nameError, newId } from '../../domain/installningar.ts';
import type { Customer, Employer, SuggestionMode } from '../../domain/types.ts';
import { href } from '../rutter.ts';
import { ArchiveDelete, OfflineNotice, SaveFailed, useSave } from './delar';
import { SUGGESTION_LABELS } from './UppdragVy';

type PartyProps<T> = {
	value: T | null;
	/** The order a new one gets. */
	nextOrder: number;
	online: boolean;
	onSave: (before: T | null, after: T) => Promise<void>;
	/** Deletes it; gives the reason when it may not (it has assignments). */
	onDelete: (id: string) => Promise<string | null>;
};

export type PartVyProps =
	({ kind: 'employer' } & PartyProps<Employer>) | ({ kind: 'customer' } & PartyProps<Customer>);

const TITLES = {
	employer: {
		new: 'Ny arbetsgivare',
		label: 'Arbetsgivare',
		noun: 'arbetsgivaren',
		a: 'arbetsgivare',
		The: 'Arbetsgivaren'
	},
	customer: { new: 'Ny kund', label: 'Kund', noun: 'kunden', a: 'kund', The: 'Kunden' }
} as const;

export function PartVy(props: PartVyProps) {
	const { kind, value, nextOrder, online, onDelete } = props;
	const [name, setName] = useState(value?.name ?? '');
	const [mode, setMode] = useState<SuggestionMode>(
		props.kind === 'employer' ? (props.value?.suggestionMode ?? 'fillNorm') : 'fillNorm'
	);
	const save = useSave();

	const error = name !== (value?.name ?? '') ? nameError(name) : null;
	const base = {
		id: value?.id ?? newId(),
		name: name.trim(),
		archived: value?.archived ?? false,
		order: value?.order ?? nextOrder
	};
	const dirty =
		name.trim() !== (value?.name ?? '') ||
		(props.kind === 'employer' && mode !== (props.value?.suggestionMode ?? 'fillNorm'));
	const canSave = online && nameError(name) === null && dirty && !save.pending;

	const submit = () =>
		void save.run(() =>
			props.kind === 'employer'
				? props.onSave(props.value, { ...base, suggestionMode: mode })
				: props.onSave(props.value, base)
		);
	// Archiving saves what is stored with the flag turned, not what the form has.
	const toggleArchived = () =>
		void save.run(() =>
			props.kind === 'employer'
				? props.onSave(props.value, { ...props.value!, archived: !props.value!.archived })
				: props.onSave(props.value, { ...props.value!, archived: !props.value!.archived })
		);

	return (
		<>
			<TopBar
				title={value?.name ?? TITLES[kind].new}
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
						label={TITLES[kind].label}
						value={name}
						onChange={setName}
						errorMessage={error ?? undefined}
					/>
					{kind === 'employer' && (
						<>
							<h2 className="kh-text-section-title">Veckorapporten till arbetsgivaren</h2>
							<SegmentedChoice
								aria-label="Förslag i veckorapporten"
								options={(['fillNorm', 'actualQuarter'] as const).map((v) => ({
									value: v,
									label: SUGGESTION_LABELS[v]
								}))}
								value={mode}
								onChange={(v) => setMode(v as SuggestionMode)}
							/>
						</>
					)}
					<p className="kh-text-item-subtitle dampad">
						{kind === 'employer'
							? 'Arbetsgivaren blir första mottagare i varje nytt uppdrag, och flexen räknas mot den.'
							: 'En kund kan ha uppdrag via flera arbetsgivare.'}{' '}
						Ett nytt namn ändrar inte mottagare som redan finns.
					</p>
				</section>
				{value && (
					<section className="sektion">
						<ArchiveDelete
							noun={TITLES[kind].noun}
							archived={value.archived}
							hint={
								value.archived
									? `Arkiverad: ${TITLES[kind].noun} går inte att välja i ett nytt uppdrag.`
									: `En arkiverad ${TITLES[kind].a} går inte att välja i ett nytt uppdrag. Uppdragen som har den ändras inte.`
							}
							confirmText={`${TITLES[kind].The} raderas. Mottagare som gjorts av den behåller sitt namn. Det går inte att ångra. Har den uppdrag kan den bara arkiveras.`}
							enabled={online && !save.pending}
							onArchive={toggleArchived}
							onDelete={() => onDelete(value.id)}
						/>
					</section>
				)}
			</div>
		</>
	);
}
