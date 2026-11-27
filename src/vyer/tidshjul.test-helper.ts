// Turning web-ui-react's time wheels in jsdom (issue 93): jsdom does not scroll, so the wheels are turned with the
// arrow keys, as a keyboard user does. Used by the views' tests only.
import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

/** Turns one wheel (a spinbutton) to `value`, the short way round. */
async function turn(user: UserEvent, wheel: HTMLElement, value: number) {
	const max = Number(wheel.getAttribute('aria-valuemax'));
	// The hour wheel is 0–23; a minute wheel 0, step … 60 − step.
	const step = max === 23 ? 1 : 60 - max;
	const count = max === 23 ? 24 : 60 / step;
	const now = Number(wheel.getAttribute('aria-valuenow')) / step;
	const target = Math.round(value / step);
	let delta = (((target - now) % count) + count) % count;
	if (delta > count / 2) delta -= count;
	wheel.focus();
	if (delta !== 0)
		await user.keyboard((delta > 0 ? '{ArrowDown}' : '{ArrowUp}').repeat(Math.abs(delta)));
}

/** Turns the hour and minute wheels named `hourName` and `minuteName` in `scope` to "HH:MM". */
export async function turnWheels(
	user: UserEvent,
	time: string,
	{ hourName = 'Timme', minuteName = 'Minut', scope = document.body } = {}
) {
	const [hour, minute] = time.split(':').map(Number) as [number, number];
	await turn(user, within(scope).getByRole('spinbutton', { name: hourName }), hour);
	await turn(user, within(scope).getByRole('spinbutton', { name: minuteName }), minute);
}

/** Opens the time field labelled `label`, turns its wheels to "HH:MM" and presses OK. */
export async function pickTime(user: UserEvent, label: string, time: string) {
	await user.click(screen.getByRole('textbox', { name: label }));
	const dialog = screen.getByRole('dialog', { name: label });
	await turnWheels(user, time, { scope: dialog });
	await user.click(within(dialog).getByRole('button', { name: 'OK' }));
}
