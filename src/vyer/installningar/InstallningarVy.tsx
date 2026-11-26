// The settings' first view (mockup "Inställningar – arbetsgivare och kunder"), opened from the
// account menu with a back arrow (issue 66): the assignments
// under their employer, the customers, and the way to absence types and free days.
import { AccountRow, buttonClass, Row, TopBar } from '@kodhast/web-ui-react';
import { plural } from '../../domain/installningar.ts';
import type { Assignment, Customer, Employer, Id } from '../../domain/types.ts';
import { useKonto } from '../konto';
import { href } from '../rutter.ts';
import { OfflineNotice } from './delar';
import { Export, type RestoreResult } from './Export';
import type { ExportFile } from '../../data/exportformat.ts';

export interface InstallningarVyProps {
	assignments: readonly Assignment[];
	employers: readonly Employer[];
	customers: readonly Customer[];
	absenceTypes: number;
	freeDays: number;
	scopeToday: Readonly<Record<Id, number>>;
	online: boolean;
	onExport: () => Promise<void>;
	onRestore: (file: ExportFile) => Promise<RestoreResult>;
	onEmpty: () => Promise<void>;
}

/** Archived last, otherwise in the user's order. */
const inOrder = <T extends { archived: boolean; order: number }>(items: readonly T[]): T[] =>
	[...items].sort((a, b) => Number(a.archived) - Number(b.archived) || a.order - b.order);

export function InstallningarVy({
	assignments,
	employers,
	customers,
	absenceTypes,
	freeDays,
	scopeToday,
	online,
	onExport,
	onRestore,
	onEmpty
}: InstallningarVyProps) {
	const { account } = useKonto();
	const sorted = inOrder(assignments);
	const customerName = new Map(customers.map((c) => [c.id, c.name]));
	const employerIds = new Set(employers.map((e) => e.id));
	// Assignments from before ADR 0019 have no employer until one is chosen.
	const withoutEmployer = sorted.filter((a) => !a.employerId || !employerIds.has(a.employerId));

	const assignmentRows = (list: readonly Assignment[]) =>
		list.map((a) => {
			const parts = [
				(a.customerId && customerName.get(a.customerId)) || 'Ingen kund',
				`${scopeToday[a.id] ?? 100} %`
			];
			if (employers.length > 0 && withoutEmployer.includes(a)) parts.unshift('Välj arbetsgivare');
			if (a.archived) parts.unshift('Arkiverat');
			return (
				<Row
					key={a.id}
					href={href({ view: 'uppdrag', id: a.id })}
					title={a.name}
					subtitle={parts.join(' · ')}
					inactive={a.archived}
					navigates
				/>
			);
		});

	const addAssignment = (
		<div>
			<a className={buttonClass()} href={href({ view: 'uppdrag', id: null })}>
				Lägg till uppdrag
			</a>
		</div>
	);

	return (
		<>
			<TopBar title="Inställningar" backHref={href({ view: 'idag' })} />
			<div className="innehall">
				<OfflineNotice online={online} />
				{account && (
					<div className="kh-card radlista">
						<AccountRow {...account} />
					</div>
				)}
				{inOrder(employers).map((e) => (
					<section key={e.id} className="sektion">
						<h2 className="kh-text-section-title">{e.name}</h2>
						<div className="kh-card radlista">
							<Row
								href={href({ view: 'arbetsgivare', id: e.id })}
								title="Arbetsgivaren"
								subtitle={e.archived ? 'Arkiverad' : 'Namn och förslag för rapporten'}
								inactive={e.archived}
								navigates
							/>
							{assignmentRows(sorted.filter((a) => a.employerId === e.id))}
						</div>
					</section>
				))}
				{(withoutEmployer.length > 0 || employers.length === 0) && (
					<section className="sektion">
						<h2 className="kh-text-section-title">
							{employers.length > 0 ? 'Uppdrag utan arbetsgivare' : 'Uppdrag'}
						</h2>
						{withoutEmployer.length > 0 && (
							<div className="kh-card radlista">{assignmentRows(withoutEmployer)}</div>
						)}
					</section>
				)}
				{addAssignment}

				<section className="sektion">
					<h2 className="kh-text-section-title">Kunder</h2>
					{customers.length > 0 && (
						<div className="kh-card radlista">
							{inOrder(customers).map((c) => {
								const count = assignments.filter(
									(a) => a.customerId === c.id && !a.archived
								).length;
								return (
									<Row
										key={c.id}
										href={href({ view: 'kund', id: c.id })}
										title={c.name}
										subtitle={count > 0 ? plural(count, 'uppdrag', 'uppdrag') : 'Inga uppdrag än'}
										inactive={c.archived}
										navigates
									/>
								);
							})}
						</div>
					)}
					<div>
						<a className={buttonClass({ variant: 'text' })} href={href({ view: 'kund', id: null })}>
							Lägg till kund
						</a>
					</div>
				</section>

				<div>
					<a
						className={buttonClass({ variant: 'text' })}
						href={href({ view: 'arbetsgivare', id: null })}
					>
						Lägg till arbetsgivare
					</a>
				</div>

				<section className="sektion">
					<h2 className="kh-text-section-title">Tid</h2>
					<div className="kh-card radlista">
						<Row
							href={href({ view: 'franvaro' })}
							title="Frånvaro och lediga dagar"
							subtitle={`${plural(absenceTypes, 'frånvarotyp', 'frånvarotyper')} · ${plural(freeDays, 'egen ledig dag', 'egna lediga dagar')}`}
							navigates
						/>
						<Row
							href={href({ view: 'paminnelser' })}
							title="Påminnelser"
							subtitle="Notiser om timer, dagar utan tid, veckorapport och flex"
							navigates
						/>
					</div>
				</section>

				<Export online={online} onExport={onExport} onRestore={onRestore} onEmpty={onEmpty} />
			</div>
		</>
	);
}
