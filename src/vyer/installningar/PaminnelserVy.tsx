// The reminder settings (issue 22, mockup "Påminnelser"): this device's notifications, when to be
// reminded and a test notice. Each reminder has a switch; turning one off saves null, 0 or false
// and turning it on again saves its default. A time or a limit is changed from a sheet, opened by
// pressing the value. Saving needs the server like the other settings (ADR 0012).
import {
	BottomSheet,
	Button,
	Row,
	SwitchRow,
	Switch,
	TextField,
	TopBar
} from '@kodhast/web-ui-react';
import { useState } from 'react';
import { DEFAULT_SETTINGS } from '../../data/dokument.ts';
import { CLOCK_ERROR, parseClock } from '../../domain/dag.ts';
import { formatHours, parseHours, plural } from '../../domain/installningar.ts';
import type { Device, Settings } from '../../domain/types.ts';
import type { EnableResult } from '../../firebase/notiser.ts';
import { href } from '../rutter.ts';
import { OfflineNotice, SaveFailed, useSave } from './delar';

export interface PaminnelserVyProps {
	settings: Settings;
	/** This device's registration; null when notifications are off here. */
	device: Device | null;
	/** Whether the Web Push key is set up; without it the device switch stays off. */
	notificationsConfigured: boolean;
	online: boolean;
	onSave: (settings: Settings) => Promise<void>;
	onEnableDevice: () => Promise<EnableResult>;
	onDisableDevice: () => Promise<void>;
	/** Sends a test notice; how many devices it reached. */
	onTest: () => Promise<number>;
}

type TimeField = 'noTimerBy' | 'timerRunningAt' | 'reportReminderFridayAt';
type Field = TimeField | 'flexWarning';

const TITLES: Record<Field, string> = {
	noTimerBy: 'Ingen timer igång',
	timerRunningAt: 'Timern går sent',
	reportReminderFridayAt: 'Veckorapporten inte skickad',
	flexWarning: 'Flexsaldo över'
};

const FLEX_ERROR = 'Skriv timmar, till exempel 20 eller 12,5';

/** The sheet's state: the reminder it changes and the text typed. */
interface Sheet {
	field: Field;
	text: string;
}

/** The value as the row shows it; null while the reminder is off. */
const valueText = (settings: Settings, field: Field): string | null => {
	if (field === 'flexWarning')
		return settings.flexWarning > 0 ? `±${formatHours(settings.flexWarning)} h` : null;
	const clock = settings[field];
	if (clock === null) return null;
	return field === 'reportReminderFridayAt' ? `fredag ${clock}` : clock;
};

/** The text to start the sheet from. */
const initialText = (settings: Settings, field: Field): string =>
	field === 'flexWarning'
		? formatHours(settings.flexWarning > 0 ? settings.flexWarning : DEFAULT_SETTINGS.flexWarning)
		: (settings[field] ?? DEFAULT_SETTINGS[field]!);

/** The saved value for the text typed, or the error to show. */
const parseSheet = ({ field, text }: Sheet): { value: string | number } | { error: string } => {
	if (field === 'flexWarning') {
		const minutes = parseHours(text);
		return minutes !== null && minutes > 0 ? { value: minutes } : { error: FLEX_ERROR };
	}
	const clock = parseClock(text);
	return clock ? { value: clock } : { error: CLOCK_ERROR };
};

export function PaminnelserVy({
	settings,
	device,
	notificationsConfigured,
	online,
	onSave,
	onEnableDevice,
	onDisableDevice,
	onTest
}: PaminnelserVyProps) {
	const save = useSave();
	const [sheet, setSheet] = useState<Sheet | null>(null);
	const [blocked, setBlocked] = useState<EnableResult | null>(null);
	const [testNote, setTestNote] = useState<string | null>(null);
	const [testing, setTesting] = useState(false);

	const change = (next: Partial<Settings>) => save.run(() => onSave({ ...settings, ...next }));
	const disabled = !online || save.pending;

	const toggleDevice = (on: boolean) => {
		setBlocked(null);
		setTestNote(null);
		void save.run(async () => {
			if (!on) return onDisableDevice();
			const result = await onEnableDevice();
			if (result !== 'on') setBlocked(result);
		});
	};

	const test = async () => {
		setTesting(true);
		setTestNote(null);
		try {
			const devices = await onTest();
			setTestNote(
				devices > 0 ? `Skickad till ${plural(devices, 'enhet', 'enheter')}` : 'Ingen enhet nåddes'
			);
		} catch {
			setTestNote('Det gick inte att skicka provnotisen');
		} finally {
			setTesting(false);
		}
	};

	const deviceSubtitle = !notificationsConfigured
		? 'Notiser är inte inställda här än.'
		: blocked === 'denied'
			? 'Notiser är blockerade i Chrome'
			: blocked === 'unsupported'
				? 'Den här webbläsaren kan inte ta emot notiser'
				: device
					? device.label
					: 'Få påminnelserna även när appen är stängd';

	const parsed = sheet ? parseSheet(sheet) : null;
	const saveSheet = async () => {
		if (!sheet || !parsed || 'error' in parsed) return;
		if (await change({ [sheet.field]: parsed.value })) setSheet(null);
	};

	/** A reminder with a value: the switch turns it on and off, the value opens the sheet. */
	const reminder = (field: Field, defaultValue: Partial<Settings>, off: Partial<Settings>) => {
		const value = valueText(settings, field);
		return (
			<Row
				title={TITLES[field]}
				trailing={
					<>
						{value !== null && (
							<Button
								variant="text"
								compact
								isDisabled={disabled}
								aria-label={`Ändra ${TITLES[field].toLowerCase()}, nu ${value}`}
								onPress={() => setSheet({ field, text: initialText(settings, field) })}
							>
								{value}
							</Button>
						)}
						<Switch
							aria-label={TITLES[field]}
							isSelected={value !== null}
							isDisabled={disabled}
							onChange={(on) => void change(on ? defaultValue : off)}
						/>
					</>
				}
			/>
		);
	};

	return (
		<>
			<TopBar title="Påminnelser" backHref={href({ view: 'installningar' })} />
			<div className="innehall">
				<OfflineNotice online={online} />
				<SaveFailed failed={save.failed && sheet === null} />
				<div className="kh-card radlista">
					<SwitchRow
						title="Notiser på den här enheten"
						subtitle={deviceSubtitle}
						isSelected={device !== null}
						isDisabled={disabled || !notificationsConfigured}
						onChange={toggleDevice}
					/>
				</div>
				<section className="sektion">
					<h2 className="kh-text-section-title">Påminn mig när</h2>
					<div className="kh-card radlista">
						{reminder('noTimerBy', { noTimerBy: DEFAULT_SETTINGS.noTimerBy }, { noTimerBy: null })}
						{reminder(
							'timerRunningAt',
							{ timerRunningAt: DEFAULT_SETTINGS.timerRunningAt },
							{ timerRunningAt: null }
						)}
						<SwitchRow
							title="Dag utan tid"
							subtitle={`Dagen efter, kl. ${settings.noTimerBy ?? DEFAULT_SETTINGS.noTimerBy}`}
							isSelected={settings.remindEmptyDay}
							isDisabled={disabled}
							onChange={(on) => void change({ remindEmptyDay: on })}
						/>
						{reminder(
							'reportReminderFridayAt',
							{ reportReminderFridayAt: DEFAULT_SETTINGS.reportReminderFridayAt },
							{ reportReminderFridayAt: null }
						)}
						{reminder(
							'flexWarning',
							{ flexWarning: DEFAULT_SETTINGS.flexWarning },
							{ flexWarning: 0 }
						)}
					</div>
					{device !== null && (
						<div>
							<Button
								variant="tonal"
								isDisabled={!online || testing}
								isPending={testing}
								onPress={() => void test()}
							>
								Skicka en provnotis
							</Button>
						</div>
					)}
					{testNote && (
						<p className="kh-text-item-subtitle dampad" role="status">
							{testNote}
						</p>
					)}
					<p className="kh-text-item-subtitle dampad">
						Notiserna visar inga uppdrag eller mottagare, bara tider och antal.
					</p>
				</section>
			</div>

			<BottomSheet
				title={sheet ? TITLES[sheet.field] : ''}
				isOpen={sheet !== null}
				onOpenChange={(open) => !open && setSheet(null)}
				footer={
					<Button
						variant="primary"
						block
						isDisabled={!online || !parsed || 'error' in parsed}
						isPending={save.pending}
						onPress={() => void saveSheet()}
					>
						Spara
					</Button>
				}
			>
				{sheet && (
					<>
						<SaveFailed failed={save.failed} />
						<TextField
							label={sheet.field === 'flexWarning' ? 'Gräns i timmar (±)' : 'Klockslag'}
							inputMode={sheet.field === 'flexWarning' ? 'decimal' : 'numeric'}
							value={sheet.text}
							onChange={(text) => setSheet({ ...sheet, text })}
							errorMessage={
								parsed && 'error' in parsed && sheet.text.trim() !== '' ? parsed.error : undefined
							}
						/>
					</>
				)}
			</BottomSheet>
		</>
	);
}
