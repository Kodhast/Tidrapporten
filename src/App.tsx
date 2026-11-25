import { Button } from '@kodhast/web-ui-react';

/** The empty start page; the real one comes with issue 19. */
export function App() {
	return (
		<main className="kh-page start">
			<h1 className="kh-text-screen-title">Tidrapporten</h1>
			<p className="kh-text-body">Här kommer timern, dagen och veckan.</p>
			{/* Shows that web-ui-react is installed from its tag; the timer itself comes with issue 18. */}
			<Button variant="primary" isDisabled>
				Starta timern
			</Button>
		</main>
	);
}
