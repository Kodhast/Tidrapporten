// The app's icons as inline SVG (Material Symbols' shapes, as in the mockup), coloured by the
// text around them.

/** `className` lets the header give it `kh-header__icon`. */
export const ClockIcon = ({ className }: { className?: string }) => (
	<svg className={className} viewBox="0 0 24 24" aria-hidden="true">
		<path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
	</svg>
);

export const SettingsIcon = () => (
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z" />
	</svg>
);

export const DropdownIcon = () => (
	<svg className="kh-icon" viewBox="0 0 24 24" aria-hidden="true">
		<path d="M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z" />
	</svg>
);

export const OfflineIcon = () => (
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<path d="M19.35 10.04A7.49 7.49 0 0 0 12 4c-1.48 0-2.85.43-4.01 1.17l1.46 1.46A5.497 5.497 0 0 1 17.5 10.5v.5H19c1.66 0 3 1.34 3 3 0 1.13-.64 2.11-1.56 2.62l1.45 1.45C23.16 18.16 24 16.68 24 15c0-2.64-2.05-4.78-4.65-4.96zM3 5.27l2.75 2.74C2.56 8.15 0 10.77 0 14c0 3.31 2.69 6 6 6h11.73l2 2L21 20.73 4.27 4 3 5.27zM7.73 10l8 8H6c-2.21 0-4-1.79-4-4s1.79-4 4-4h1.73z" />
	</svg>
);

export const WarningIcon = () => (
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
	</svg>
);

/** The arrow after the code chip's text, which says the chip opens a choice. */
export const ExpandIcon = () => (
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<path d="M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z" />
	</svg>
);

export const PlayIcon = () => (
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<path d="M8 5v14l11-7z" />
	</svg>
);

export const StopIcon = () => (
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<path d="M6 6h12v12H6z" />
	</svg>
);

export const WorkIcon = () => (
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z" />
	</svg>
);
