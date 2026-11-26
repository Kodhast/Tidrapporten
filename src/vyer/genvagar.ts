// The app icon's shortcuts (issue 59): a long press on the installed app gives "Starta timern",
// "Stoppa timern" and "Idag", which open the app with `?gor=starta` or `?gor=stoppa`. The
// notification buttons of issue 22 use the same addresses.

export type ShortcutAction = 'starta' | 'stoppa';

const PARAM = 'gor';

/**
 * The action in the address, which is removed so that a reload does not do it again. Anything
 * unknown is ignored but still removed.
 */
export function takeShortcut(
	location: Pick<Location, 'hash' | 'pathname' | 'search'>,
	history: Pick<History, 'replaceState'>
): ShortcutAction | null {
	const params = new URLSearchParams(location.search);
	if (!params.has(PARAM)) return null;
	const action = params.get(PARAM);
	params.delete(PARAM);
	const search = params.size > 0 ? `?${params.toString()}` : '';
	history.replaceState(null, '', location.pathname + search + location.hash);
	return action === 'starta' || action === 'stoppa' ? action : null;
}

/** The shortcut until the start page has done it, so that it is done once per page load. */
export interface PendingShortcut {
	readonly action: ShortcutAction | null;
	done(): void;
}

export function pendingShortcut(action: ShortcutAction | null): PendingShortcut {
	let current = action;
	return {
		get action() {
			return current;
		},
		done() {
			current = null;
		}
	};
}
