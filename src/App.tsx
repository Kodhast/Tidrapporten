import { Button, Toolbar } from '@kodhast/web-ui-react';
import type { ReactNode } from 'react';
import type { BudgetStatus } from './domain/budget';
import { startSignIn } from './firebase/auth';
import { BudgetBanderoll } from './vyer/BudgetBanderoll';
import { ClockIcon, SettingsIcon } from './vyer/ikoner';
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
	/** The settings view for the route, made by the caller, which has Firestore (issue 17). */
	settings?: ReactNode;
}

// The week (issue 20) and the timer's button (issue 18) join the tab row when they exist.
const TABS = [
	{ id: 'idag', label: 'Idag', icon: <ClockIcon />, href: href({ view: 'idag' }) },
	{
		id: 'installningar',
		label: 'Inställningar',
		icon: <SettingsIcon />,
		href: href({ view: 'installningar' })
	}
];

const SignIn = ({ uid }: { uid?: string | null }) =>
	uid === null ? <Button onPress={() => startSignIn()}>Logga in</Button> : null;

export function App({ uid, error, budget, route = { view: 'idag' }, settings }: AppProps) {
	const onStart = route.view === 'idag';
	return (
		<>
			{onStart ? (
				<main className="kh-page start">
					<BudgetBanderoll status={budget ?? null} />
					<h1 className="kh-text-screen-title">Tidrapporten</h1>
					<p className="kh-text-body">Här kommer timern, dagen och veckan.</p>
					{/* Shows that web-ui-react is installed from its tag; the timer itself comes with issue 18. */}
					<Button variant="primary" isDisabled>
						Starta timern
					</Button>
					{/* Provisional until the views in issue 19. */}
					<SignIn uid={uid} />
					{uid && <p className="kh-text-body">Inloggad som {uid}</p>}
					{error && <p className="kh-text-body">{error}</p>}
				</main>
			) : (
				<main>
					{uid ? (
						settings
					) : (
						<div className="innehall">
							<p className="kh-text-body">Logga in för att se inställningarna.</p>
							<SignIn uid={uid} />
						</div>
					)}
				</main>
			)}
			{/* The views below a tab have their own back arrow and no tab row, as in the mockup. */}
			{(onStart || route.view === 'installningar') && (
				<Toolbar tabs={TABS} selected={route.view} fixed aria-label="Vyer" />
			)}
		</>
	);
}
