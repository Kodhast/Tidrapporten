import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import type { AccountInfo } from '@kodhast/web-ui-react';
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
import { DagRutt } from './vyer/dag/DagRutt';
import { KontoProvider } from './vyer/konto';
import { InstallningarRutt } from './vyer/installningar/InstallningarRutt';
import { KomIgangRutt } from './vyer/kom-igang/KomIgangRutt';
import { BudgetBanderoll } from './vyer/BudgetBanderoll';
import { useRoute } from './vyer/rutter';
import { pendingShortcut, takeShortcut } from './vyer/genvagar';
import { useStart } from './vyer/start/useStart';
import { RapportRutt, VeckaRutt } from './vyer/vecka/VeckaRutt';

const root = document.getElementById('root');
if (!root) throw new Error('index.html has no #root');

const { auth, db, functions } = startFirebase();
// Read once, before React, so that StrictMode's second effect run cannot sign in twice.
const signInError = finishSignIn(auth);
// The app icon's shortcut, read once for the same reason (issue 59); the start page empties it
// when it is done.
const shortcut = pendingShortcut(takeShortcut(window.location, window.history));

/** The account in the header (issue 66): the name and Google picture kept on the Firebase profile. */
const accountOf = (user: User | null): AccountInfo | null =>
	user && { name: user.displayName, email: user.email, photoUrl: user.photoURL };

/** A running timer goes on in Firestore; the next sign-in goes through Access as before. */
const onSignOut = () => void signOut(auth);

function Root() {
	const [uid, setUid] = useState<string | null | undefined>(undefined);
	const [account, setAccount] = useState<AccountInfo | null>(null);
	// Firebase reports "nobody" before a sign-in from the address is done; until it is, the
	// button stays hidden so that it cannot start a second sign-in.
	const [signingIn, setSigningIn] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [budget, setBudget] = useState<BudgetStatus | null>(null);
	useEffect(
		() =>
			onAuthStateChanged(auth, (user) => {
				setUid(user?.uid ?? null);
				setAccount(accountOf(user));
			}),
		[]
	);
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
			// The profile is written after Firebase reported the user, so it is read again here.
			setAccount(accountOf(auth.currentUser));
			setError(message);
			setSigningIn(false);
		});
	}, []);
	const shownUid = signingIn ? undefined : uid;
	const props: AppProps = { uid: shownUid, error, budget, route };
	const konto = { account: shownUid ? account : null, online, onSignOut };
	if (!shownUid)
		return (
			<KontoProvider value={konto}>
				<App {...props} />
			</KontoProvider>
		);
	return (
		<KontoProvider value={konto}>
			<SignedIn
				{...props}
				uid={shownUid}
				online={online}
				settings={
					route.view === 'dag' ? (
						<DagRutt db={db} uid={shownUid} date={route.date} online={online} />
					) : route.view === 'vecka' ? (
						<VeckaRutt db={db} uid={shownUid} week={route.week} />
					) : route.view === 'rapport' ? (
						// One key per report, so that a change stays from the report to its transcript.
						<RapportRutt
							key={`${route.week}_${route.assignmentId}_${route.receiverId}`}
							db={db}
							uid={shownUid}
							week={route.week}
							assignmentId={route.assignmentId}
							receiverId={route.receiverId}
							transcript={route.transcript}
							online={online}
						/>
					) : route.view === 'kom-igang' ? (
						<KomIgangRutt db={db} uid={shownUid} online={online} />
					) : route.view !== 'idag' && route.view !== 'om' ? (
						<InstallningarRutt
							db={db}
							functions={functions}
							uid={shownUid}
							route={route}
							online={online}
						/>
					) : null
				}
			/>
		</KontoProvider>
	);
}

/** The app for a signed-in user: the start page follows the timer in Firestore (issue 18). */
function SignedIn(props: AppProps & { uid: Id; online: boolean }) {
	const { uid, online, budget } = props;
	const start = useStart(db, uid, online, <BudgetBanderoll status={budget ?? null} />, shortcut);
	return <App {...props} start={start.view} timerAction={start.action} />;
}

createRoot(root).render(
	<StrictMode>
		<Root />
	</StrictMode>
);
