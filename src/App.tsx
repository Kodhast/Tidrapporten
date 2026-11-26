import { Button, Toolbar, type ToolbarAction } from '@kodhast/web-ui-react';
import type { ReactNode } from 'react';
import type { BudgetStatus } from './domain/budget';
import { startSignIn } from './firebase/auth';
import { BudgetBanderoll } from './vyer/BudgetBanderoll';
import { OmVy } from './vyer/om/OmVy';
import { CalendarIcon, ClockIcon } from './vyer/ikoner';
import { href, type Route } from './vyer/rutter';

export interface AppProps {
	/** The signed-in user's uid, null when nobody is, undefined while Firebase finds out. */
	uid?: string | null;
	/** Why the last sign-in failed. */
	error?: string | null;
	/** The cloud budget's status (issue 28); null or undefined when there is none. */
	budget?: BudgetStatus | null;
	/** The view in the address; the start page when left out. */
	route?: Route;
	/** The view for a route below the start page, made by the caller, which has Firestore: the
	 * settings (issue 17), the day (issue 29) and the week (issue 20). */
	settings?: ReactNode;
	/** The start page with the timer for a signed-in user, made by the caller (issue 18). */
	start?: ReactNode;
	/** The tab row's main button: the timer's start or stop (issue 18). */
	timerAction?: ToolbarAction;
}

const TABS = [
	{ id: 'idag', label: 'Idag', icon: <ClockIcon />, href: href({ view: 'idag' }) },
	{
		id: 'vecka',
		label: 'Veckan',
		icon: <CalendarIcon />,
		href: href({ view: 'vecka', week: null })
	}
];
// Inställningar is no tab (issue 66): it opens from the account menu, as in every Kodhäst app.

const SignIn = ({ uid }: { uid?: string | null }) =>
	uid === null ? <Button onPress={() => startSignIn()}>Logga in</Button> : null;

export function App({
	uid,
	error,
	budget,
	route = { view: 'idag' },
	settings,
	start,
	timerAction
}: AppProps) {
	const onStart = route.view === 'idag';
	const banner = <BudgetBanderoll status={budget ?? null} />;
	let content: ReactNode;
	if (route.view === 'om') {
		content = (
			<main>
				<OmVy />
			</main>
		);
	} else if (onStart && uid && start) {
		content = <main>{start}</main>;
	} else if (onStart) {
		// Before the sign-in, and while Firebase finds out who it is.
		content = (
			<main className="kh-page start">
				{banner}
				<h1 className="kh-text-screen-title">Tidrapporten</h1>
				<SignIn uid={uid} />
				{error && <p className="kh-text-body">{error}</p>}
			</main>
		);
	} else {
		content = (
			<main>
				{uid ? (
					settings
				) : (
					<div className="innehall">
						<p className="kh-text-body">
							{route.view === 'dag'
								? 'Logga in för att se dagen.'
								: route.view === 'vecka' || route.view === 'rapport'
									? 'Logga in för att se veckan.'
									: 'Logga in för att se inställningarna.'}
						</p>
						<SignIn uid={uid} />
					</div>
				)}
			</main>
		);
	}
	return (
		<>
			{content}
			{/* The views below a tab have their own back arrow and no tab row, as in the mockup. */}
			{(onStart || route.view === 'vecka') && (
				<Toolbar
					tabs={TABS}
					selected={route.view}
					action={uid ? timerAction : undefined}
					fixed
					aria-label="Vyer"
				/>
			)}
		</>
	);
}
