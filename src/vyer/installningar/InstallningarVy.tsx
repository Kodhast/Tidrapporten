// The settings' first view (mockup "Inställningar"): the assignments, and the way to absence
// types and free days.
import { buttonClass, Header, Row } from '@kodhast/web-ui-react';
import { plural } from '../../domain/installningar.ts';
import type { Assignment, Id } from '../../domain/types.ts';
import { ClockIcon } from '../ikoner';
import { href } from '../rutter.ts';
import { OfflineNotice } from './delar';
import { Export, type RestoreResult } from './Export';
import type { ExportFile } from '../../data/exportformat.ts';

export interface AssignmentCounts {
	codes: number;
	receivers: number;
}

export interface InstallningarVyProps {
	assignments: readonly Assignment[];
	counts: Readonly<Record<Id, AssignmentCounts>>;
	absenceTypes: number;
	freeDays: number;
	scopeToday: Readonly<Record<Id, number>>;
	online: boolean;
	onExport: () => Promise<void>;
	onRestore: (file: ExportFile) => Promise<RestoreResult>;
}

export function InstallningarVy({
	assignments,
	counts,
	absenceTypes,
	freeDays,
	scopeToday,
	online,
	onExport,
	onRestore
}: InstallningarVyProps) {
	const sorted = [...assignments].sort(
		(a, b) => Number(a.archived) - Number(b.archived) || a.order - b.order
	);
	return (
		<>
			<Header icon={<ClockIcon />} name="Tidrapporten" title="Inställningar" />
			<div className="innehall">
				<OfflineNotice online={online} />
				<section className="sektion">
					<h2 className="kh-text-section-title">Uppdrag</h2>
					{sorted.length > 0 && (
						<div className="kh-card radlista">
							{sorted.map((a) => {
								const c = counts[a.id] ?? { codes: 0, receivers: 0 };
								const parts = [
									`${scopeToday[a.id] ?? 100} %`,
									plural(c.codes, 'tidkod', 'tidkoder'),
									plural(c.receivers, 'mottagare', 'mottagare')
								];
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
							})}
						</div>
					)}
					<div>
						<a className={buttonClass()} href={href({ view: 'uppdrag', id: null })}>
							Lägg till uppdrag
						</a>
					</div>
				</section>

				<section className="sektion">
					<h2 className="kh-text-section-title">Tid</h2>
					<div className="kh-card radlista">
						<Row
							href={href({ view: 'franvaro' })}
							title="Frånvaro och lediga dagar"
							subtitle={`${plural(absenceTypes, 'frånvarotyp', 'frånvarotyper')} · ${plural(freeDays, 'egen ledig dag', 'egna lediga dagar')}`}
							navigates
						/>
					</div>
				</section>

				<Export online={online} onExport={onExport} onRestore={onRestore} />
			</div>
		</>
	);
}
