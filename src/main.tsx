import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@kodhast/web-ui/tokens.css';
import '@kodhast/web-ui/kh.css';
import './tema.css';
import { App } from './App';
import { startFirebase } from './firebase/app';

const root = document.getElementById('root');
if (!root) throw new Error('index.html has no #root');

// Nothing reads data yet (issue 15); started here so that every build carries the right project.
startFirebase();

createRoot(root).render(
	<StrictMode>
		<App />
	</StrictMode>
);
