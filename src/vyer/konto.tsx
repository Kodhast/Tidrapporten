// Kodhäst's header and account (issue 66, web-ui-react's AccountMenu): the clock with the two dots as
// the app's icon, the name and version, and the account's avatar with its menu at the end. The
// account comes from the Firebase user's profile through a context, so that every view's header
// shows the same without passing it down.
import { AccountMenu, Header, type AccountInfo } from '@kodhast/web-ui-react';
import { createContext, useContext, type ReactNode } from 'react';
import { href } from './rutter.ts';

export const APP_NAME = 'Tidrapporten';
export const APP_VERSION = __APP_VERSION__;

export interface Konto {
	/** The signed-in account; null when nobody is. */
	account: AccountInfo | null;
	/** Whether Firestore has a connection (the avatar's dot). */
	online: boolean;
	onSignOut: () => void;
}

const KontoContext = createContext<Konto>({ account: null, online: false, onSignOut: () => {} });

export const KontoProvider = ({ value, children }: { value: Konto; children: ReactNode }) => (
	<KontoContext.Provider value={value}>{children}</KontoContext.Provider>
);

export const useKonto = () => useContext(KontoContext);

/** Kodhäst's clock, the same as on the home page, the home screen and the favicon. */
export const AppIcon = ({ className }: { className?: string }) => (
	<img className={className} src="/favicon.svg" alt="" />
);

/** The account's avatar and Kodhäst's menu: Inställningar, Om Tidrapporten, Logga ut. */
export function KontoMeny() {
	const { account, online, onSignOut } = useKonto();
	return (
		<AccountMenu
			account={account}
			appName={APP_NAME}
			settingsHref={href({ view: 'installningar' })}
			aboutHref={href({ view: 'om' })}
			onSignOut={onSignOut}
			online={online}
		/>
	);
}

export interface SidhuvudProps {
	title: ReactNode;
	subtitle?: ReactNode;
	/** The dots bounce while the view fetches. */
	bouncing?: boolean;
}

/** The header of a tab's view (Idag, Veckan): Kodhäst's AppHeader with the account at the end. */
export const Sidhuvud = ({ title, subtitle, bouncing = false }: SidhuvudProps) => (
	<Header
		icon={<AppIcon />}
		name={APP_NAME}
		version={APP_VERSION}
		title={title}
		subtitle={subtitle}
		dots
		bouncing={bouncing}
		trailing={<KontoMeny />}
	/>
);
