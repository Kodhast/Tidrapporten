import { describe, expect, it } from 'vitest';
import {
	assignmentStepErrors,
	mondayOfDate,
	startDocuments,
	type StartAnswers
} from './komigang.ts';

const answers = (overrides: Partial<StartAnswers> = {}): StartAnswers => ({
	employerName: ' Exempelkonsult AB ',
	suggestionMode: 'actualQuarter',
	customerName: 'Kund A',
	customerReceives: true,
	assignment: {
		name: 'Uppdrag A',
		scope: '80',
		workday: '8',
		openingFlex: '4,5',
		startDate: '2026-11-23'
	},
	codes: [
		{ name: 'Utveckling', billable: true },
		{ name: 'Intern tid', billable: false }
	],
	...overrides
});

const ids = () => {
	let n = 0;
	return () => `id${++n}`;
};

describe('the start at first use', () => {
	it('starts a new assignment on Monday of the week', () => {
		expect(mondayOfDate('2026-11-26')).toBe('2026-11-23'); // Thursday
		expect(mondayOfDate('2026-11-23')).toBe('2026-11-23');
		expect(mondayOfDate('2026-11-29')).toBe('2026-11-23'); // Sunday
		expect(mondayOfDate('2027-01-01')).toBe('2026-12-28'); // over the new year
	});

	it('makes the employer, the customer, the assignment, its codes and both receivers', () => {
		const docs = startDocuments(answers(), '2026-11-26', ids())!;
		expect(docs.employer).toEqual({
			id: 'id1',
			name: 'Exempelkonsult AB',
			suggestionMode: 'actualQuarter',
			archived: false,
			order: 0
		});
		expect(docs.customer).toEqual({ id: 'id2', name: 'Kund A', archived: false, order: 0 });
		expect(docs.assignment).toMatchObject({
			id: 'id3',
			name: 'Uppdrag A',
			startDate: '2026-11-23',
			terms: [{ from: '2026-11-23', scopePercent: 80, workdayMinutes: 480 }],
			openingFlex: 270,
			employerId: 'id1',
			customerId: 'id2',
			order: 0
		});
		expect(docs.codes).toEqual([
			{
				id: 'id4',
				assignmentId: 'id3',
				name: 'Utveckling',
				billable: true,
				archived: false,
				order: 0
			},
			{
				id: 'id5',
				assignmentId: 'id3',
				name: 'Intern tid',
				billable: false,
				archived: false,
				order: 1
			}
		]);
		expect(docs.receivers).toMatchObject([
			{
				name: 'Exempelkonsult AB',
				position: 1,
				suggestionMode: 'actualQuarter',
				party: { kind: 'employer', id: 'id1' }
			},
			{
				name: 'Kund A',
				position: 2,
				suggestionMode: 'fillNorm',
				party: { kind: 'customer', id: 'id2' }
			}
		]);
		const [first] = docs.receivers;
		expect(first!.codes.map((c) => c.name)).toEqual(['Utveckling', 'Intern tid']);
		expect(first!.mapping).toEqual({ id4: first!.codes[0]!.id, id5: first!.codes[1]!.id });
	});

	it('keeps the customer out of the receivers when it does not get the report', () => {
		const docs = startDocuments(answers({ customerReceives: false }), '2026-11-26', ids())!;
		expect(docs.customer?.name).toBe('Kund A');
		expect(docs.assignment.customerId).toBe(docs.customer!.id);
		expect(docs.receivers.map((r) => r.name)).toEqual(['Exempelkonsult AB']);
	});

	it('makes an internal assignment without a customer', () => {
		const docs = startDocuments(answers({ customerName: null }), '2026-11-26', ids())!;
		expect(docs.customer).toBeNull();
		expect(docs.assignment.customerId).toBeNull();
		expect(docs.receivers).toHaveLength(1);
	});

	it.each([
		['no employer name', { employerName: ' ' }],
		['an empty customer name', { customerName: '' }],
		['no codes', { codes: [] }],
		['no assignment name', { assignment: { ...answers().assignment, name: '' } }],
		['a scope over 100', { assignment: { ...answers().assignment, scope: '120' } }]
	])('makes nothing with %s', (_, overrides) => {
		expect(startDocuments(answers(overrides), '2026-11-26', ids())).toBeNull();
	});

	it('gives the assignment step its errors without asking for an employer', () => {
		expect(assignmentStepErrors(answers().assignment)).toBeNull();
		expect(assignmentStepErrors({ ...answers().assignment, scope: '0' })).toEqual({
			scope: 'Mellan 1 och 100 %'
		});
	});
});
