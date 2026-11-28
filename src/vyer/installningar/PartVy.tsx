// An employer or a customer (ADR 0019, mockup "Inställningar – arbetsgivare och kunder"): the
// name, and for the employer the suggestion its report starts with in a new assignment. A new
// name is not copied to receivers that already exist.
import { Button, SegmentedChoice, TextField, TopBar } from '@kodhast/web-ui-react';
import { useState } from 'react';
import { formatHours, nameError, newId, parseHours } from '../../domain/installningar.ts';
import type { Periods } from '../../domain/perioder.ts';
import { dateOf } from '../../domain/tid.ts';
import type { Customer, Employer, IsoDate, SuggestionMode } from '../../domain/types.ts';
import { href } from '../rutter.ts';
import { ArchiveDelete, OfflineNotice, SaveFailed, useSave } from './delar';
import { Perioder } from './Perioder';
import { SUGGESTION_LABELS } from './UppdragVy';

type PartyProps<T> = {
	value: T | null;
	/** The order a new one gets. */
	nextOrder: number;
	online: boolean;
	/** Today by default; where a new period of the employment starts. */
	today?: IsoDate;
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
	const [today] = useState(() => props.today ?? dateOf(Date.now()));
	const employer = props.kind === 'employer' ? props.value : null;
	// The employment (ADR 0021): its periods and opening balance.
	const initialPeriods: Periods = {
		terms: employer?.terms ?? [],
		endDate: employer?.endDate ?? null
	};
	const [periods, setPeriods] = useState<Periods>(initialPeriods);
	const initialOpening = formatHours(employer?.openingFlex ?? 0, true);
	const [opening, setOpening] = useState(initialOpening);
	const openingFlex = parseHours(opening === '' ? '0' : opening, true);
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
		(props.kind === 'employer' &&
			(mode !== (props.value?.suggestionMode ?? 'fillNorm') ||
				JSON.stringify(periods) !== JSON.stringify(initialPeriods) ||
				opening !== initialOpening));
	const canSave =
		online && nameError(name) === null && openingFlex !== null && dirty && !save.pending;

	const submit = () =>
		void save.run(() =>
			props.kind === 'employer'
				? props.onSave(props.value, {
						...base,
						suggestionMode: mode,
						terms: [...periods.terms],
						endDate: periods.endDate,
						openingFlex: openingFlex ?? 0
					})
				: props.onSave(props.value, base)
		);
	// Archiving saves what is stored with the flag turned, not what the form has.
	// The same call twice: the narrowing ties the value's type to its onSave.
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
							<TextField
								label="Ingående flexsaldo"
								suffix="h"
								value={opening}
								onChange={setOpening}
								description="Flexen hos arbetsgivaren när anställningen börjar i appen"
								errorMessage={openingFlex === null ? 'Till exempel 4, -2,5 eller 1:30' : undefined}
							/>
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
				{kind === 'employer' && (
					<Perioder
						periods={periods}
						onChange={setPeriods}
						today={today}
						title="Anställningens omfattning"
						hint={
							periods.terms.length === 0
								? 'Utan omfattning räknas flexen bara per uppdrag. Lägg till en period för att få flexen mot anställningen.'
								: 'Normen för hela anställningen. Det uppdragen inte täcker räknas också: tid i ett internt uppdrag eller frånvaro fyller ut det.'
						}
					/>
				)}
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
