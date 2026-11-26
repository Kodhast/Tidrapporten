import { describe, expect, it } from 'vitest';
import { freeDaysByDate } from './helgdagar.ts';
import {
	assignmentAfter,
	assignmentChangeIsLogged,
	assignmentForm,
	cleanMapping,
	DEFAULT_ABSENCE_TYPES,
	evesOf,
	formatHours,
	freeDayErrors,
	genitive,
	plural,
	isEve,
	isIsoDate,
	longDate,
	nameError,
	newId,
	nextNumber,
	parseHours,
	readAssignmentForm,
	termsAfter,
	unmappedCodes,
	type AssignmentValues
} from './installningar.ts';
import { assignment, code } from './testdata.ts';

describe('the default absence types', () => {
	it('are the interview’s six, counted as ADR 0012 says, with fixed ids', () => {
		expect(DEFAULT_ABSENCE_TYPES.map((t) => [t.id, t.name, t.counting])).toEqual([
			['semester', 'Semester', 'fillsNorm'],
			['sjukdom', 'Sjukdom', 'fillsNorm'],
			['tjanstledighet', 'Tjänstledighet', 'fillsNorm'],
			['banktid', 'Bänktid', 'fillsNorm'],
			['komptid', 'Komptid', 'flexWithdrawal'],
			['utbildning', 'Utbildning', 'worked']
		]);
		// The rules only allow ids of letters, digits and dashes.
		for (const t of DEFAULT_ABSENCE_TYPES) expect(t.id).toMatch(/^[A-Za-z0-9-]+$/);
	});
});

describe('parseHours and formatHours', () => {
	it.each([
		['8', 480],
		['7,5', 450],
		['7.5', 450],
		['7:30', 450],
		['2,25', 135],
		[' 0 ', 0],
		['10,1', 606]
	])('reads %s as %i minutes', (text, minutes) => {
		expect(parseHours(text)).toBe(minutes);
	});

	it.each([
		['+4', 240],
		['-2,25', -135],
		['−1:15', -75],
		['4,5', 270]
	])('reads the signed balance %s as %i minutes', (text, minutes) => {
		expect(parseHours(text, true)).toBe(minutes);
	});

	it.each(['', 'åtta', '7,555', '7:60', '-3', '1e3'])(
		'refuses %j without a sign allowed',
		(text) => {
			expect(parseHours(text)).toBeNull();
		}
	);

	it.each([
		[480, false, '8'],
		[450, false, '7,5'],
		[135, false, '2,25'],
		[270, true, '+4,5'],
		[-240, true, '-4'],
		[0, true, '0']
	])('writes %i minutes as %s', (minutes, signed, text) => {
		expect(formatHours(minutes, signed)).toBe(text);
		expect(parseHours(text, signed)).toBe(minutes);
	});
});

describe('names, ids and dates', () => {
	it('wants a name of 1–100 characters', () => {
		expect(nameError('  ')).toBe('Skriv ett namn');
		expect(nameError('x'.repeat(101))).toBe('Högst 100 tecken');
		expect(nameError(' Utveckling ')).toBeNull();
	});

	it('makes ids the rules accept, different each time', () => {
		const a = newId();
		expect(a).toMatch(/^[A-Za-z0-9]{20}$/);
		expect(newId()).not.toBe(a);
	});

	it('knows a real calendar day', () => {
		expect(isIsoDate('2027-02-28')).toBe(true);
		expect(isIsoDate('2027-02-29')).toBe(false);
		expect(isIsoDate('2028-02-29')).toBe(true);
		expect(isIsoDate('2027-13-01')).toBe(false);
	});

	it('writes a long Swedish date', () => {
		expect(longDate('2027-05-07')).toBe('Fredag 7 maj 2027');
	});

	it('makes the genitive the Swedish way', () => {
		expect(genitive('Kund A')).toBe('Kund A:s');
		expect(genitive('Arbetsgivaren')).toBe('Arbetsgivarens');
		expect(genitive('Konsultbolaget AB')).toBe('Konsultbolaget AB:s');
		expect(genitive('Mellanhands')).toBe('Mellanhands');
	});

	it('counts with the singular for one only', () => {
		expect(plural(1, 'kod', 'koder')).toBe('1 kod');
		expect(plural(0, 'kod', 'koder')).toBe('0 koder');
		expect(plural(3, 'omappad', 'omappade')).toBe('3 omappade');
	});

	it('takes the next number after the largest', () => {
		expect(nextNumber([])).toBe(0);
		expect(nextNumber([], 1)).toBe(1);
		expect(nextNumber([2, 0, 5])).toBe(6);
	});
});

const valid = {
	name: ' Exempeluppdraget ',
	scope: '80',
	workday: '8',
	openingFlex: '+4,5',
	startDate: '2026-11-02'
};

describe('readAssignmentForm', () => {
	it('reads a valid form into minutes', () => {
		expect(readAssignmentForm(valid)).toEqual({
			values: {
				name: 'Exempeluppdraget',
				scopePercent: 80,
				workdayMinutes: 480,
				openingFlex: 270,
				startDate: '2026-11-02'
			},
			errors: null
		});
	});

	it('reads an empty opening balance as 0', () => {
		expect(readAssignmentForm({ ...valid, openingFlex: '' }).values?.openingFlex).toBe(0);
	});

	it('names every field that is wrong', () => {
		expect(
			readAssignmentForm({
				name: '',
				scope: '0',
				workday: '25',
				openingFlex: 'mycket',
				startDate: ''
			}).errors
		).toEqual({
			name: 'Skriv ett namn',
			scope: 'Mellan 1 och 100 %',
			workday: 'Mellan 0 och 24 h',
			openingFlex: 'Till exempel 4, -2,5 eller 1:30',
			startDate: 'Välj ett datum'
		});
		expect(readAssignmentForm({ ...valid, scope: '101' }).errors).toEqual({
			scope: 'Mellan 1 och 100 %'
		});
		expect(readAssignmentForm({ ...valid, scope: '50,5' }).errors).toEqual({
			scope: 'Mellan 1 och 100 %'
		});
	});
});

describe('assignmentForm', () => {
	it('starts a new assignment at 100 %, 8 h, no balance, today', () => {
		expect(assignmentForm(null, '2026-11-26')).toEqual({
			name: '',
			scope: '100',
			workday: '8',
			openingFlex: '0',
			startDate: '2026-11-26'
		});
	});

	it('shows the terms in force today', () => {
		const a = assignment({
			openingFlex: -90,
			terms: [
				{ from: '2026-01-01', scopePercent: 100, workdayMinutes: 480 },
				{ from: '2026-09-01', scopePercent: 80, workdayMinutes: 450 }
			]
		});
		expect(assignmentForm(a, '2026-11-26')).toMatchObject({
			scope: '80',
			workday: '7,5',
			openingFlex: '-1,5'
		});
		expect(assignmentForm(a, '2026-06-01')).toMatchObject({ scope: '100', workday: '8' });
	});

	it('shows the first terms before the assignment starts', () => {
		const a = assignment({
			startDate: '2027-01-01',
			terms: [{ from: '2027-01-01', scopePercent: 60, workdayMinutes: 480 }]
		});
		expect(assignmentForm(a, '2026-11-26').scope).toBe('60');
	});
});

const values = (overrides: Partial<AssignmentValues> = {}): AssignmentValues => ({
	name: 'Exempeluppdraget',
	scopePercent: 100,
	workdayMinutes: 480,
	openingFlex: 0,
	startDate: '2026-01-01',
	...overrides
});

describe('termsAfter: a changed scope applies from today (ADR 0012)', () => {
	const start = [{ from: '2026-01-01', scopePercent: 100, workdayMinutes: 480 }];

	it('gives a new assignment one set of terms from its start', () => {
		expect(termsAfter([], values({ startDate: '2026-12-01' }), '2026-11-26')).toEqual([
			{ from: '2026-12-01', scopePercent: 100, workdayMinutes: 480 }
		]);
	});

	it('keeps the terms when scope and workday are the same', () => {
		expect(termsAfter(start, values(), '2026-11-26')).toEqual(start);
	});

	it('adds terms from today when the scope changes, so the days before keep their norm', () => {
		expect(termsAfter(start, values({ scopePercent: 80 }), '2026-11-26')).toEqual([
			...start,
			{ from: '2026-11-26', scopePercent: 80, workdayMinutes: 480 }
		]);
	});

	it('replaces terms from today when changed twice the same day', () => {
		const twice = termsAfter(
			[...start, { from: '2026-11-26', scopePercent: 80, workdayMinutes: 480 }],
			values({ scopePercent: 60 }),
			'2026-11-26'
		);
		expect(twice).toEqual([
			...start,
			{ from: '2026-11-26', scopePercent: 60, workdayMinutes: 480 }
		]);
	});

	it('changes the only terms when the assignment has not started yet', () => {
		expect(
			termsAfter(
				[{ from: '2027-01-01', scopePercent: 100, workdayMinutes: 480 }],
				values({ startDate: '2027-01-01', workdayMinutes: 450 }),
				'2026-11-26'
			)
		).toEqual([{ from: '2027-01-01', scopePercent: 100, workdayMinutes: 450 }]);
	});

	it('moves the first terms with the start date and drops terms before it', () => {
		const terms = [
			{ from: '2026-01-01', scopePercent: 100, workdayMinutes: 480 },
			{ from: '2026-06-01', scopePercent: 80, workdayMinutes: 480 },
			{ from: '2026-09-01', scopePercent: 50, workdayMinutes: 480 }
		];
		expect(
			termsAfter(terms, values({ startDate: '2026-07-01', scopePercent: 50 }), '2026-11-26')
		).toEqual([
			{ from: '2026-07-01', scopePercent: 80, workdayMinutes: 480 },
			{ from: '2026-09-01', scopePercent: 50, workdayMinutes: 480 }
		]);
	});
});

describe('assignmentAfter and the log', () => {
	it('makes a new assignment with the given id and order', () => {
		expect(assignmentAfter(null, values({ openingFlex: 270 }), '2026-11-26', 'ny1', 3)).toEqual({
			id: 'ny1',
			name: 'Exempeluppdraget',
			startDate: '2026-01-01',
			endDate: null,
			terms: [{ from: '2026-01-01', scopePercent: 100, workdayMinutes: 480 }],
			openingFlex: 270,
			standardDay: [],
			archived: false,
			order: 3
		});
	});

	it('keeps id, order, end, standard day and archive of an existing one', () => {
		const before = assignment({ order: 2, archived: true, endDate: '2027-06-30' });
		const after = assignmentAfter(before, values({ name: 'Nytt namn' }), '2026-11-26', 'x', 9);
		expect(after).toEqual({ ...before, name: 'Nytt namn' });
		expect(assignmentChangeIsLogged(before, after)).toBe(false);
	});

	it.each([
		['openingFlex', { openingFlex: 60 }],
		['startDate', { startDate: '2026-02-01' }],
		['endDate', { endDate: '2026-12-31' }],
		['terms', { terms: [{ from: '2026-01-01', scopePercent: 50, workdayMinutes: 480 }] }]
	])('logs a changed %s (ADR 0016)', (_field, change) => {
		const before = assignment();
		expect(assignmentChangeIsLogged(before, { ...before, ...change })).toBe(true);
	});

	it('does not log a new assignment', () => {
		expect(assignmentChangeIsLogged(null, assignment())).toBe(false);
	});
});

describe('the mapping check', () => {
	const codes = [code('c1', { name: 'Utveckling' }), code('c2'), code('c3', { archived: true })];
	const receiver = {
		codes: [
			{ id: 'r1', name: '1001 Utveckling' },
			{ id: 'r2', name: '1002 Möten' }
		],
		mapping: { c1: 'r1', c2: 'borta' }
	};

	it('finds the codes in use without a code the receiver has', () => {
		expect(unmappedCodes(codes, receiver).map((c) => c.id)).toEqual(['c2']);
		expect(unmappedCodes(codes, { ...receiver, mapping: { c1: 'r1', c2: 'r2' } })).toEqual([]);
	});

	it('drops targets the receiver no longer has', () => {
		expect(cleanMapping({ c1: 'r1', c2: 'borta', semester: 'r2' }, receiver.codes)).toEqual({
			c1: 'r1',
			semester: 'r2'
		});
	});
});

describe('eves and free days', () => {
	it('lists the year’s three eves, free unless made a workday', () => {
		const freeDays = freeDaysByDate([{ date: '2027-12-24', free: false, name: 'Julafton' }]);
		expect(evesOf(2027, freeDays)).toEqual([
			{ date: '2027-06-25', name: 'Midsommarafton', free: true },
			{ date: '2027-12-24', name: 'Julafton', free: false },
			{ date: '2027-12-31', name: 'Nyårsafton', free: true }
		]);
		expect(isEve('2027-06-25')).toBe(true);
		expect(isEve('2027-06-26')).toBe(false);
	});

	it('wants a free day on a real date that is not an eve or taken', () => {
		const taken = new Set(['2027-05-07']);
		expect(freeDayErrors('2027-05-14', 'Klämdag', taken)).toEqual({});
		expect(freeDayErrors('', '', taken)).toEqual({ date: 'Välj ett datum' });
		expect(freeDayErrors('2027-12-24', '', taken)).toEqual({ date: 'Aftnarna ställs in ovan' });
		expect(freeDayErrors('2027-05-07', '', taken)).toEqual({ date: 'Den dagen finns redan' });
		expect(freeDayErrors('2027-05-14', 'x'.repeat(101), taken)).toEqual({
			name: 'Högst 100 tecken'
		});
	});
});
