// The working day's wheel (issue 19, mockup "Arbetsdagens hjul"): 07–19 as an arc of 300 degrees
// with the day's intervals in their code's colour, and the running timer with a round end and a
// dot, and a pause the timer is in as a thin arc (issue 95). The centre (the code chip and the time)
// is the caller's.
import type { ReactNode } from 'react';
import type { CodeColour, WheelArc } from '../../domain/hjul.ts';
import { DEGREES_PER_HOUR, WHEEL_HOURS } from '../../domain/hjul.ts';

const CENTRE = 160;
const RADIUS = 128;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** 07:00 in the SVG's angles, where 0 is three o'clock: down to the left. */
const SEVEN = -240;

export interface HjulArc extends WheelArc {
	colour: CodeColour;
	running: boolean;
}

const dash = (degrees: number) =>
	`${((degrees / 360) * CIRCUMFERENCE).toFixed(1)} ${CIRCUMFERENCE.toFixed(1)}`;

function Arc({
	from,
	degrees,
	className,
	round,
	width = 22
}: WheelArc & { className: string; round: boolean; width?: number }) {
	return (
		<circle
			className={className}
			cx={CENTRE}
			cy={CENTRE}
			r={RADIUS}
			strokeWidth={width}
			strokeLinecap={round ? 'round' : undefined}
			strokeDasharray={dash(degrees)}
			transform={`rotate(${SEVEN + from} ${CENTRE} ${CENTRE})`}
		/>
	);
}

export function Hjul({
	arcs,
	pause = null,
	children
}: {
	arcs: readonly HjulArc[];
	/** The pause the timer is in (issue 95), drawn thin: it is not time. */
	pause?: WheelArc | null;
	children: ReactNode;
}) {
	const running = arcs.find((a) => a.running);
	const end = running && ((SEVEN + running.from + running.degrees) * Math.PI) / 180;
	return (
		<div className="hjul">
			<svg className="hjul__ring" width="320" height="320" viewBox="0 0 320 320" aria-hidden="true">
				<Arc className="spar" from={0} degrees={WHEEL_HOURS * DEGREES_PER_HOUR} round />
				{arcs.map((arc, index) => (
					<Arc
						key={index}
						className={`accent-kod-${arc.colour}`}
						from={arc.from}
						degrees={arc.degrees}
						round={arc.running}
					/>
				))}
				{pause && <Arc className="paus" {...pause} round width={6} />}
				{running && end !== undefined && (
					<circle
						className={`prick accent-kod-${running.colour}`}
						cx={(CENTRE + RADIUS * Math.cos(end)).toFixed(1)}
						cy={(CENTRE + RADIUS * Math.sin(end)).toFixed(1)}
						r={7}
						strokeWidth={3}
					/>
				)}
				<text x="85" y="294" textAnchor="middle">
					07
				</text>
				<text x="160" y="14" textAnchor="middle">
					13
				</text>
				<text x="235" y="294" textAnchor="middle">
					19
				</text>
			</svg>
			<div className="hjul__mitt">{children}</div>
		</div>
	);
}
