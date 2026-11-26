// The settings' section for the data (issues 21, 57 and 26): one button that downloads all the
// user's data as a JSON file, one that puts back from such a file what is missing, and one that
// empties the account after a download. All need the server, so they wait for the network like
// the rest of the settings.
import { Button, ConfirmDialog, Notice, TextField } from '@kodhast/web-ui-react';
import { useRef, useState } from 'react';
import { parseExportFile, type ExportFile } from '../../data/exportformat.ts';
import { plural } from '../../domain/installningar.ts';
import { CheckIcon, WarningIcon } from '../ikoner';
import { useSave } from './delar';

export interface RestoreResult {
	restored: number;
	existed: number;
}

export interface ExportProps {
	online: boolean;
	/** Reads everything and starts the download. */
	onExport: () => Promise<void>;
	/** Writes the documents of the file that are missing. */
	onRestore: (file: ExportFile) => Promise<RestoreResult>;
	/** Downloads everything, then deletes all of the user's data. */
	onEmpty: () => Promise<void>;
}

/** What the owner types to empty the account. */
export const EMPTY_WORD = 'TÖM';

/** The file's export day in Swedish time, e.g. "26 nov 2026". */
const dayOf = (iso: string) =>
	new Date(iso).toLocaleDateString('sv-SE', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		timeZone: 'Europe/Stockholm'
	});

export function Export({ online, onExport, onRestore, onEmpty }: ExportProps) {
	const exporting = useSave();
	const restoring = useSave();
	const emptying = useSave();
	const [asking, setAsking] = useState(false);
	const [word, setWord] = useState('');
	const input = useRef<HTMLInputElement>(null);
	const [chosen, setChosen] = useState<ExportFile | null>(null);
	const [refused, setRefused] = useState<string | null>(null);
	const [result, setResult] = useState<RestoreResult | null>(null);

	const read = async (picked: File | undefined) => {
		setRefused(null);
		setResult(null);
		if (!picked) return;
		let parsed: ExportFile | string;
		try {
			parsed = parseExportFile(JSON.parse(await picked.text()));
		} catch {
			parsed = 'Filen är ingen export från Tidrapporten.';
		}
		if (typeof parsed === 'string') setRefused(parsed);
		else setChosen(parsed);
	};

	const count = chosen ? Object.keys(chosen.documents).length : 0;
	return (
		<section className="sektion">
			<h2 className="kh-text-section-title">Data</h2>
			<p className="kh-text-body">
				All din data som en JSON-fil: uppdrag, tid, rapporter och ändringsloggen. En sådan fil kan
				läggas tillbaka; det som saknas återställs, och inget skrivs över.
			</p>
			{exporting.failed && (
				<Notice
					tone="ton-fel"
					icon={<WarningIcon />}
					title="Det gick inte att exportera"
					detail="Kontrollera anslutningen och försök igen."
				/>
			)}
			{refused && (
				<Notice
					tone="ton-fel"
					icon={<WarningIcon />}
					title="Filen kan inte återställas"
					detail={refused}
				/>
			)}
			{restoring.failed && (
				<Notice
					tone="ton-fel"
					icon={<WarningIcon />}
					title="Det gick inte att återställa"
					detail="Det som hann läggas tillbaka står i ändringsloggen. Försök igen; det som redan finns hoppas över."
				/>
			)}
			{emptying.failed && (
				<Notice
					tone="ton-fel"
					icon={<WarningIcon />}
					title="Det gick inte att tömma kontot"
					detail="Försök igen; det som finns kvar töms då."
				/>
			)}
			{result && (
				<Notice
					tone="ton-ok"
					icon={<CheckIcon />}
					title={
						result.restored > 0
							? `${result.restored} dokument ${result.restored === 1 ? 'återställt' : 'återställda'}`
							: 'Inget saknades'
					}
					detail={`${result.existed} dokument fanns redan och lämnades ${result.existed === 1 ? 'orört' : 'orörda'}.`}
				/>
			)}
			<div className="knapprad">
				<Button
					isDisabled={!online}
					isPending={exporting.pending}
					onPress={() => exporting.run(onExport)}
				>
					Exportera all data
				</Button>
				<Button
					variant="outlined"
					isDisabled={!online}
					isPending={restoring.pending}
					onPress={() => input.current?.click()}
				>
					Återställ från fil
				</Button>
			</div>
			<div className="farozon" role="group" aria-labelledby="farozon-rubrik">
				<h3 id="farozon-rubrik" className="kh-text-item-title">
					Farozon
				</h3>
				<p className="kh-text-body">
					Raderar allt, skickade veckor och ändringsloggen också. Går inte att ångra utan kopian.
				</p>
				<Button
					variant="destructive"
					isDisabled={!online}
					isPending={emptying.pending}
					onPress={() => {
						setWord('');
						setAsking(true);
					}}
				>
					Töm kontot
				</Button>
			</div>
			<input
				ref={input}
				type="file"
				accept=".json,application/json"
				hidden
				aria-label="Fil att återställa"
				onChange={(event) => {
					void read(event.target.files?.[0]);
					event.target.value = '';
				}}
			/>
			<ConfirmDialog
				isOpen={chosen !== null}
				onOpenChange={(open) => !open && setChosen(null)}
				title="Återställa från filen?"
				text={
					chosen &&
					`Filen är exporterad ${dayOf(chosen.exportedAt)} och har ${plural(count, 'dokument', 'dokument')}. Det som saknas läggs tillbaka; inget som finns skrivs över. Återställningen loggas.`
				}
				confirmLabel="Återställ"
				onConfirm={() => {
					const file = chosen!;
					void restoring.run(async () => setResult(await onRestore(file)));
				}}
			/>
			<ConfirmDialog
				isOpen={asking}
				onOpenChange={setAsking}
				destructive
				title="Töm kontot?"
				text={`Allt du sparat raderas: uppdrag, tider, rapporter, inställningar och ändringsloggen. Först laddas en kopia ner som du kan återställa från. Skriv ${EMPTY_WORD} för att fortsätta.`}
				confirmLabel="Ladda ner och töm"
				isConfirmDisabled={word.trim().toLocaleUpperCase('sv-SE') !== EMPTY_WORD}
				onConfirm={() => void emptying.run(onEmpty)}
			>
				<TextField label={`Skriv ${EMPTY_WORD}`} value={word} onChange={setWord} />
			</ConfirmDialog>
		</section>
	);
}
