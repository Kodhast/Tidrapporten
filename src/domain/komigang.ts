// The start at first use (issue 64): the answers of the four steps, and the documents they
// become – the employer, the customer, the assignment, its codes and its first receivers.
import {
	assignmentAfter,
	newId,
	readAssignmentForm,
	receiversForNewAssignment,
	type AssignmentForm,
	type AssignmentFormErrors
} from './installningar.ts';
import { addDays, weekday } from './tid.ts';
import type {
	Assignment,
	Customer,
	Employer,
	Id,
	IsoDate,
	Receiver,
	SuggestionMode,
	TimeCode
} from './types.ts';

export interface StartAnswers {
	employerName: string;
	suggestionMode: SuggestionMode;
	/** null: an internal assignment without a customer. */
	customerName: string | null;
	customerReceives: boolean;
	/** The assignment's fields; employerId and customerId are set from the steps. */
	assignment: Omit<AssignmentForm, 'employerId' | 'customerId'>;
	codes: readonly { name: string; billable: boolean }[];
}

export interface StartDocuments {
	employer: Employer;
	customer: Customer | null;
	assignment: Assignment;
	codes: TimeCode[];
	receivers: Receiver[];
}

/** Monday of the week the date is in: where a new assignment starts by default. */
export const mondayOfDate = (date: IsoDate): IsoDate => addDays(date, 1 - weekday(date));

/** The assignment step's errors, without the employer, which the first step gives. */
export const assignmentStepErrors = (
	assignment: StartAnswers['assignment']
): AssignmentFormErrors | null =>
	readAssignmentForm({ ...assignment, employerId: '', customerId: '' }).errors;

/**
 * The documents the answers become, or null while the answers are not complete: a name for the
 * employer and the customer, a valid assignment and at least one code.
 */
export const startDocuments = (
	answers: StartAnswers,
	today: IsoDate,
	makeId: () => Id = newId
): StartDocuments | null => {
	const employerName = answers.employerName.trim();
	const customerName = answers.customerName?.trim() ?? null;
	if (!employerName || customerName === '' || answers.codes.length === 0) return null;
	const employer: Employer = {
		id: makeId(),
		name: employerName,
		suggestionMode: answers.suggestionMode,
		archived: false,
		order: 0,
		// The employment's scope is not asked for at the start; until it is set, the
		// assignments' flex counts on its own (ADR 0021).
		terms: [],
		endDate: null,
		openingFlex: 0
	};
	const customer: Customer | null =
		customerName === null ? null : { id: makeId(), name: customerName, archived: false, order: 0 };
	const read = readAssignmentForm({
		...answers.assignment,
		employerId: employer.id,
		customerId: customer?.id ?? ''
	});
	if (!read.values) return null;
	const assignment = assignmentAfter(null, read.values, today, makeId(), 0);
	const codes: TimeCode[] = answers.codes.map((c, order) => ({
		id: makeId(),
		assignmentId: assignment.id,
		name: c.name.trim(),
		billable: c.billable,
		archived: false,
		order
	}));
	const receivers = receiversForNewAssignment(
		assignment.id,
		codes,
		employer,
		answers.customerReceives ? customer : null,
		makeId
	);
	return { employer, customer, assignment, codes, receivers };
};
