import type { ReactNode } from 'react';

/** The help or error line under the time wheels in a dialog, as web-ui's `.kh-field__support` (issue 93). */
export function Stodtext({ error, children }: { error?: string; children?: ReactNode }) {
	if (error !== undefined)
		return (
			<p className="kh-field__support kh-field__support--error" role="alert">
				{error}
			</p>
		);
	return children ? <p className="kh-field__support">{children}</p> : null;
}
