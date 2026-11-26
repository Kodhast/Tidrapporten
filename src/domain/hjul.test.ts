import { describe, expect, it } from 'vitest';
import { codeColour, wheelArc } from './hjul.ts';
import { absentAllDay, absentBetween, code, work } from './testdata.ts';

describe('wheelArc', () => {
	it('places an interval at 25 degrees per hour from 07:00', () => {
		// 09:00–11:45: 2 h from 07 → 50°, 2 h 45 → 68.75°.
		expect(wheelArc(work('2026-11-25', '09:00', '11:45'), '2026-11-25')).toEqual({
			from: 50,
			degrees: 68.75
		});
	});

	it('cuts an interval to 07–19', () => {
		expect(wheelArc(work('2026-11-25', '06:00', '08:00'), '2026-11-25')).toEqual({
			from: 0,
			degrees: 25
		});
		expect(wheelArc(work('2026-11-25', '18:00', '21:00'), '2026-11-25')).toEqual({
			from: 275,
			degrees: 25
		});
		// The evening before over midnight touches the day, but not 07–19.
		expect(
			wheelArc(work('2026-11-24', '22:00', '01:30', 'c1', '2026-11-25'), '2026-11-25')
		).toBeNull();
		expect(wheelArc(work('2026-11-25', '19:30', '20:00'), '2026-11-25')).toBeNull();
	});

	it('leaves out whole-day absence and draws absence by the hour', () => {
		expect(wheelArc(absentAllDay('2026-11-25', 'semester'), '2026-11-25')).toBeNull();
		expect(
			wheelArc(absentBetween('2026-11-25', '13:00', '15:00', 'semester'), '2026-11-25')
		).toEqual({
			from: 150,
			degrees: 50
		});
	});

	it('keeps 25 degrees per hour on the day summer time starts', () => {
		// 29 March 2026: 02:00 becomes 03:00, before the wheel starts.
		expect(wheelArc(work('2026-03-29', '08:00', '10:00'), '2026-03-29')).toEqual({
			from: 25,
			degrees: 50
		});
	});
});

describe('codeColour', () => {
	const codes = {
		a1: [
			code('c3', { order: 2 }),
			code('c1', { order: 0 }),
			code('c2', { order: 1 }),
			code('c4', { order: 3 })
		]
	};
	it('follows the codes order in turns of three', () => {
		expect(codeColour(work('2026-11-25', '08:00', '09:00', 'c1'), codes)).toBe(1);
		expect(codeColour(work('2026-11-25', '08:00', '09:00', 'c2'), codes)).toBe(2);
		expect(codeColour(work('2026-11-25', '08:00', '09:00', 'c3'), codes)).toBe(3);
		expect(codeColour(work('2026-11-25', '08:00', '09:00', 'c4'), codes)).toBe(1);
	});

	it('gives absence and an unknown code a colour too', () => {
		expect(codeColour(absentAllDay('2026-11-25', 'semester'), codes)).toBe(3);
		expect(codeColour(work('2026-11-25', '08:00', '09:00', 'okänd'), codes)).toBe(1);
	});
});
