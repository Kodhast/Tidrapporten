// The settings' section for the JSON export (issue 21): one button that downloads all the user's
// data. It reads from the server, so it waits for the network like the rest of the settings.
import { Button, Notice } from '@kodhast/web-ui-react';
import { WarningIcon } from '../ikoner';
import { useSave } from './delar';

export interface ExportProps {
	online: boolean;
	/** Reads everything and starts the download. */
	onExport: () => Promise<void>;
}

export function Export({ online, onExport }: ExportProps) {
	const { pending, failed, run } = useSave();
	return (
		<section className="sektion">
			<h2 className="kh-text-section-title">Data</h2>
			<p className="kh-text-body">
				All din data som en JSON-fil: uppdrag, tid, rapporter och ändringsloggen.
			</p>
			{failed && (
				<Notice
					tone="ton-fel"
					icon={<WarningIcon />}
					title="Det gick inte att exportera"
					detail="Kontrollera anslutningen och försök igen."
				/>
			)}
			<div>
				<Button isDisabled={!online} isPending={pending} onPress={() => run(onExport)}>
					Exportera all data
				</Button>
			</div>
		</section>
	);
}
