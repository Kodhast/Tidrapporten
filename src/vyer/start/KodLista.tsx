// The list where the timer's code is chosen: a sheet with a row per code, per assignment. Not drawn
// in the mockup (issue 18); made only of web-ui-react's parts.
import { BottomSheet, Row } from '@kodhast/web-ui-react';
import type { CodeChoice, CodeGroup } from '../../domain/timer.ts';

export interface KodListaProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	groups: readonly CodeGroup[];
	/** The code the timer runs on, or would start with. */
	current: CodeChoice | null;
	/** Whether the timer runs: a choice then changes its code from now. */
	running: boolean;
	onChoose: (choice: CodeChoice) => void;
}

export function KodLista({
	isOpen,
	onOpenChange,
	groups,
	current,
	running,
	onChoose
}: KodListaProps) {
	return (
		<BottomSheet
			isOpen={isOpen}
			onOpenChange={onOpenChange}
			title="Välj tidkod"
			subtitle={
				running ? 'Timern fortsätter med den nya koden från nu.' : 'Timern startar med den.'
			}
		>
			{groups.map(({ assignment, codes }) => (
				<section key={assignment.id} className="sektion">
					{groups.length > 1 && <h3 className="kh-text-section-title">{assignment.name}</h3>}
					<div className="kh-card radlista">
						{codes.map((code) => {
							const chosen = current?.assignmentId === assignment.id && current.codeId === code.id;
							return (
								<Row
									key={code.id}
									title={code.name}
									subtitle={groups.length > 1 ? undefined : assignment.name}
									trailing={
										chosen ? <span className="kh-text-item-subtitle dampad">Vald</span> : undefined
									}
									onPress={() => {
										onOpenChange(false);
										if (!chosen) onChoose({ assignmentId: assignment.id, codeId: code.id });
									}}
								/>
							);
						})}
					</div>
				</section>
			))}
		</BottomSheet>
	);
}
