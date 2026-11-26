import { onAuthStateChanged } from 'firebase/auth';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@kodhast/web-ui/tokens.css';
import '@kodhast/web-ui/kh.css';
import './tema.css';
import { App, type AppProps } from './App';
import { watchBudget } from './data/budget';
import { ensureDefaultAbsenceTypes } from './data/installningar';
import { watchOnline } from './data/uppkoppling';
import type { BudgetStatus } from './domain/budget';
import type { Id } from './domain/types';
import { startFirebase } from './firebase/app';
import { finishSignIn } from './firebase/auth';
import { InstallningarRutt } from './vyer/installningar/InstallningarRutt';
import { BudgetBanderoll } from './vyer/BudgetBanderoll';
import { useRoute } from './vyer/rutter';
import { useStart } from './vyer/start/useStart';

const root = document.getElementById('root');
if (!root) throw new Error('index.html has no #root');

const { auth, db } = startFirebase();
// Read once, before React, so that StrictMode's second effect run cannot sign in twice.
const signInError = finishSignIn(auth);

function Root() {
	const [uid, setUid] = useState<string | null | undefined>(undefined);
	// Firebase reports "nobody" before a sign-in from the address is done; until it is, the
	// button stays hidden so that it cannot start a second sign-in.
	const [signingIn, setSigningIn] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [budget, setBudget] = useState<BudgetStatus | null>(null);
	useEffect(() => onAuthStateChanged(auth, (user) => setUid(user?.uid ?? null)), []);
	// The rules let only a signed-in user read the status.
	useEffect(() => {
		if (!uid) return;
		const unsubscribe = watchBudget(db, setBudget);
		return () => {
			unsubscribe();
			setBudget(null);
		};
	}, [uid]);
	const [online, setOnline] = useState(false);
	useEffect(() => {
		if (!uid) return;
		return watchOnline(db, uid, setOnline);
	}, [uid]);
	// The default absence types are made at the first sign-in (issue 17). Offline the transaction
	// fails and the next start tries again.
	useEffect(() => {
		if (uid) ensureDefaultAbsenceTypes(db, uid).catch(() => {});
	}, [uid]);
	const route = useRoute();
	useEffect(() => {
		void signInError.then((message) => {
			setError(message);
			setSigningIn(false);
		});
	}, []);
	const shownUid = signingIn ? undefined : uid;
	const props: AppProps = { uid: shownUid, error, budget, route };
	if (!shownUid) return <App {...props} />;
	return (
		<SignedIn
			{...props}
			uid={shownUid}
			online={online}
			settings={
				route.view !== 'idag' ? (
					<InstallningarRutt db={db} uid={shownUid} route={route} online={online} />
				) : null
			}
		/>
	);
}

/** The app for a signed-in user: the start page follows the timer in Firestore (issue 18). */
function SignedIn(props: AppProps & { uid: Id; online: boolean }) {
	const { uid, online, budget } = props;
	const start = useStart(db, uid, online, <BudgetBanderoll status={budget ?? null} />);
	return <App {...props} start={start.view} timerAction={start.action} />;
}

createRoot(root).render(
	<StrictMode>
		<Root />
	</StrictMode>
);
