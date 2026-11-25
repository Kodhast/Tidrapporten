import { Button } from '@kodhast/web-ui-react';
import { startSignIn } from './firebase/auth';

export interface AppProps {
	/** The signed-in user's uid, null when nobody is, undefined while Firebase finds out. */
	uid?: string | null;
	/** Why the last sign-in failed. */
	error?: string | null;
	onSignIn?: () => void;
}

/** The empty start page; the real one comes with issue 19. */
export function App({ uid, error, onSignIn = startSignIn }: AppProps) {
	return (
		<main className="kh-page start">
			<h1 className="kh-text-screen-title">Tidrapporten</h1>
			<p className="kh-text-body">Här kommer timern, dagen och veckan.</p>
			{/* Shows that web-ui-react is installed from its tag; the timer itself comes with issue 18. */}
			<Button variant="primary" isDisabled>
				Starta timern
			</Button>
			{/* Provisional until the views in issue 19. */}
			{uid === null && <Button onPress={() => onSignIn()}>Logga in</Button>}
			{uid && <p className="kh-text-body">Inloggad som {uid}</p>}
			{error && <p className="kh-text-body">{error}</p>}
		</main>
	);
}
