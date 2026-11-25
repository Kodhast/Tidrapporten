import { onAuthStateChanged } from 'firebase/auth';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@kodhast/web-ui/tokens.css';
import '@kodhast/web-ui/kh.css';
import './tema.css';
import { App } from './App';
import { watchBudget } from './data/budget';
import type { BudgetStatus } from './domain/budget';
import { startFirebase } from './firebase/app';
import { finishSignIn } from './firebase/auth';

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
	useEffect(() => {
		void signInError.then((message) => {
			setError(message);
			setSigningIn(false);
		});
	}, []);
	return <App uid={signingIn ? undefined : uid} error={error} budget={budget} />;
}

createRoot(root).render(
	<StrictMode>
		<Root />
	</StrictMode>
);
