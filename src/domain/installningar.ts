// Rules for the settings (issue 17): the default absence types, reading hours as the owner types
// them, validating the forms, new terms from a chosen day and the receivers' code mapping.
import { daysOffOf, type FreeDays } from './helgdagar.ts';
import { DEFAULT_WORKDAY_MINUTES, termsOn } from './norm.ts';
import type {
	AbsenceCounting,
	AbsenceType,
	Assignment,
	AssignmentTerms,
	Customer,
	Employer,
	Id,
	IsoDate,
	Minutes,
	Receiver,
	ReceiverParty,
	SuggestionMode,
	TimeCode
} from './types.ts';
import type { Periods } from './perioder.ts';

/**
 * The absence types created at the first sign-in, from the interview (#2) and ADR 0012. The ids
 * are fixed so that two devices signing in at once create one set, not two.
 */
export const DEFAULT_ABSENCE_TYPES: readonly AbsenceType[] = [
	{ id: 'semester', name: 'Semester', counting: 'fillsNorm', archived: false, order: 0 },
	{ id: 'sjukdom', name: 'Sjukdom', counting: 'fillsNorm', archived: false, order: 1 },
	{
		id: 'tjanstledighet',
		name: 'Tjänstledighet',
		counting: 'fillsNorm',
		archived: false,
		order: 2
	},
	{ id: 'banktid', name: 'Bänktid', counting: 'fillsNorm', archived: false, order: 3 },
	{ id: 'komptid', name: 'Komptid', counting: 'flexWithdrawal', archived: false, order: 4 },
	{ id: 'utbildning', name: 'Utbildning', counting: 'worked', archived: false, order: 5 }
];

/** How a counting reads in the app, as the mockup words it. */
export const COUNTING_LABELS: Record<AbsenceCounting, string> = {
	fillsNorm: 'Fyller normen',
	flexWithdrawal: 'Tas ur flexen',
	worked: 'Räknas som arbetad tid'
};

export const MAX_NAME = 100;

/** Firestore-like random ids, made on the client (ADR 0012). */
export const newId = (): Id => {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	const bytes = crypto.getRandomValues(new Uint8Array(20));
	return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
};

/** A name error, or null: not empty and at most 100 characters, as the rules require. */
export const nameError = (name: string): string | null => {
	const trimmed = name.trim();
	if (trimmed === '') return 'Skriv ett namn';
	if (trimmed.length > MAX_NAME) return `Högst ${MAX_NAME} tecken`;
	return null;
};

/**
 * Hours as the owner types them, in whole minutes: `8`, `7,5`, `7.5`, `7:30`, and with a sign
 * when `signed`: `+4`, `-2,25`, `−1:15`. Null when it cannot be read.
 */
export const parseHours = (text: string, signed = false): Minutes | null => {
	const match = /^([+\-−]?)\s*(\d{1,4})(?:([.,])(\d{1,2})|:([0-5]\d))?$/.exec(text.trim());
	if (!match) return null;
	const [, sign = '', whole = '0', , fraction, clock] = match;
	if (sign !== '' && !signed) return null;
	const minutes =
		Number(whole) * 60 +
		(clock !== undefined
			? Number(clock)
			: fraction !== undefined
				? Math.round(Number(`0.${fraction}`) * 60)
				: 0);
	return sign === '-' || sign === '−' ? -minutes : minutes;
};

/** Minutes as hours with a decimal comma: 450 → `7,5`, 135 → `2,25`, −240 → `-4` (`+4` signed). */
export const formatHours = (minutes: Minutes, signed = false): string => {
	const hours = Math.round((Math.abs(minutes) / 60) * 100) / 100;
	const text = String(hours).replace('.', ',');
	if (minutes < 0) return `-${text}`;
	return signed && minutes > 0 ? `+${text}` : text;
};

export const isIsoDate = (text: string): boolean =>
	/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(text) &&
	new Date(`${text}T00:00:00Z`).toISOString().startsWith(text);

/** The assignment form as typed. */
export interface AssignmentForm {
	name: string;
	scope: string; // %
	workday: string; // hours at 100 %
	openingFlex: string; // signed hours
	startDate: IsoDate;
	employerId: Id; // '' = none chosen
	customerId: Id; // '' = no customer
	/** '' = runs until further notice; left out, the end is kept as it was. */
	endDate?: IsoDate | '';
	/** The day a changed scope or workday applies from; left out, from today. */
	termsFrom?: IsoDate;
}

export type AssignmentFormErrors = Partial<Record<keyof AssignmentForm, string>>;

export interface AssignmentValues {
	name: string;
	scopePercent: number;
	workdayMinutes: Minutes;
	openingFlex: Minutes;
	startDate: IsoDate;
	employerId: Id | null;
	customerId: Id | null;
	/** Left out, the end is kept as it was. */
	endDate?: IsoDate | null;
	/** Left out, a changed scope or workday applies from today. */
	termsFrom?: IsoDate;
	/**
	 * The periods as edited in the list (ADR 0021). Given, they replace the scope, workday, start,
	 * end and termsFrom: the start is the first period's day.
	 */
	periods?: Periods;
}

/**
 * The values of a valid form, or the errors per field. A new assignment needs an employer
 * (ADR 0019); one from before it may stay without.
 */
export const readAssignmentForm = (
	form: AssignmentForm,
	requireEmployer = false
): { values: AssignmentValues; errors: null } | { values: null; errors: AssignmentFormErrors } => {
	const errors: AssignmentFormErrors = {};
	if (requireEmployer && form.employerId === '') errors.employerId = 'Välj arbetsgivare';
	const name = nameError(form.name);
	if (name) errors.name = name;
	const scope = /^\d{1,3}$/.test(form.scope.trim()) ? Number(form.scope) : NaN;
	if (!(scope >= 0 && scope <= 100)) errors.scope = 'Mellan 0 och 100 %';
	const workday = parseHours(form.workday);
	if (workday === null || workday < 1 || workday > 24 * 60) errors.workday = 'Mellan 0 och 24 h';
	const openingFlex = parseHours(form.openingFlex === '' ? '0' : form.openingFlex, true);
	if (openingFlex === null) errors.openingFlex = 'Till exempel 4, -2,5 eller 1:30';
	if (!isIsoDate(form.startDate)) errors.startDate = 'Välj ett datum';
	if (form.endDate) {
		if (!isIsoDate(form.endDate)) errors.endDate = 'Välj ett datum';
		else if (isIsoDate(form.startDate) && form.endDate < form.startDate)
			errors.endDate = 'Tidigast startdatum';
	}
	if (form.termsFrom !== undefined && !isIsoDate(form.termsFrom))
		errors.termsFrom = 'Välj ett datum';
	if (Object.keys(errors).length > 0) return { values: null, errors };
	return {
		values: {
			name: form.name.trim(),
			scopePercent: scope,
			workdayMinutes: workday!,
			openingFlex: openingFlex!,
			startDate: form.startDate,
			employerId: form.employerId || null,
			customerId: form.customerId || null,
			...(form.endDate !== undefined && { endDate: form.endDate || null }),
			...(form.termsFrom !== undefined && { termsFrom: form.termsFrom })
		},
		errors: null
	};
};

/**
 * The form for an assignment, or for a new one starting today with `employerId`, the only
 * employer when there is one, chosen.
 */
export const assignmentForm = (
	assignment: Assignment | null,
	today: IsoDate,
	employerId: Id = ''
): AssignmentForm => {
	if (!assignment) {
		return {
			name: '',
			scope: '100',
			workday: formatHours(DEFAULT_WORKDAY_MINUTES),
			openingFlex: '0',
			startDate: today,
			employerId,
			customerId: '',
			endDate: '',
			termsFrom: today
		};
	}
	const terms = currentTerms(assignment, today);
	return {
		name: assignment.name,
		scope: String(terms.scopePercent),
		workday: formatHours(terms.workdayMinutes),
		openingFlex: formatHours(assignment.openingFlex, true),
		startDate: assignment.startDate,
		employerId: assignment.employerId ?? '',
		customerId: assignment.customerId ?? '',
		endDate: assignment.endDate ?? '',
		termsFrom: today
	};
};

/** The terms in force today, or the first ones when the assignment has not started yet. */
const currentTerms = (assignment: Assignment, today: IsoDate): AssignmentTerms =>
	termsOn(assignment, today) ??
	assignment.terms[0] ?? {
		from: assignment.startDate,
		scopePercent: 100,
		workdayMinutes: DEFAULT_WORKDAY_MINUTES
	};

/**
 * The terms after the form is saved. The first terms always start at the start date. A changed
 * scope or workday applies from `from` (today unless the owner chose another day), held between
 * the start and the end, so the norm of the days before does not change and neither does their
 * flex (ADR 0012); terms from that day on are replaced. A day in the past changes the flex of the
 * weeks after it, which the change log explains (ADR 0016).
 */
export const termsAfter = (
	before: readonly AssignmentTerms[],
	values: AssignmentValues,
	requested: IsoDate
): AssignmentTerms[] => {
	const { startDate, scopePercent, workdayMinutes } = values;
	const endDate = values.endDate ?? null;
	const sorted = [...before].sort((a, b) => a.from.localeCompare(b.from));
	// The terms in force on the start date become the first; earlier ones are dropped.
	const first = sorted.findLast((t) => t.from <= startDate) ?? sorted[0];
	// A new assignment: its terms start with it.
	if (!first) return [{ from: startDate, scopePercent, workdayMinutes }];
	let terms: AssignmentTerms[] = [
		{ ...first, from: startDate },
		...sorted.filter((t) => t.from > startDate)
	];
	let from = requested > startDate ? requested : startDate;
	if (endDate !== null && from > endDate) from = endDate > startDate ? endDate : startDate;
	const inForce = terms.findLast((t) => t.from <= from);
	if (inForce?.scopePercent === scopePercent && inForce.workdayMinutes === workdayMinutes) {
		return terms;
	}
	terms = terms.filter((t) => t.from < from);
	return [...terms, { from, scopePercent, workdayMinutes }];
};

/** The assignment after the form is saved; a new one gets `id`, the next order and no end. */
export const assignmentAfter = (
	before: Assignment | null,
	values: AssignmentValues,
	today: IsoDate,
	id: Id,
	order: number
): Assignment => ({
	id: before?.id ?? id,
	name: values.name,
	...(values.periods?.terms[0]
		? {
				startDate: values.periods.terms[0].from,
				endDate: values.periods.endDate,
				terms: [...values.periods.terms]
			}
		: {
				startDate: values.startDate,
				endDate: values.endDate !== undefined ? values.endDate : (before?.endDate ?? null),
				terms: termsAfter(before?.terms ?? [], values, values.termsFrom ?? today)
			}),
	openingFlex: values.openingFlex,
	standardDay: before?.standardDay ?? [],
	archived: before?.archived ?? false,
	order: before?.order ?? order,
	employerId: values.employerId,
	customerId: values.customerId
});

/**
 * The receivers a new assignment starts with (ADR 0019): the employer first, so that the flex
 * counts against it, and the customer second when it gets the report too. Each gets the
 * assignment's codes as its own, mapped one to one; absence is left for the owner to map.
 */
export const receiversForNewAssignment = (
	assignmentId: Id,
	codes: readonly TimeCode[],
	employer: Employer,
	customer: Customer | null,
	makeId: () => Id = newId
): Receiver[] => {
	const active = [...codes].filter((c) => !c.archived).sort((a, b) => a.order - b.order);
	const parties: [ReceiverParty, string, SuggestionMode][] = [
		[{ kind: 'employer', id: employer.id }, employer.name, employer.suggestionMode]
	];
	if (customer) parties.push([{ kind: 'customer', id: customer.id }, customer.name, 'fillNorm']);
	return parties.map(([party, name, suggestionMode], i) => {
		const own = active.map((c) => ({ id: makeId(), name: c.name }));
		return {
			id: makeId(),
			assignmentId,
			name,
			position: i + 1,
			suggestionMode,
			codes: own,
			mapping: Object.fromEntries(active.map((c, j) => [c.id, own[j]!.id])),
			archived: false,
			party
		};
	});
};

/** Whether a change of the assignment needs a log entry (ADR 0016). */
export const assignmentChangeIsLogged = (before: Assignment | null, after: Assignment): boolean =>
	before !== null &&
	(before.openingFlex !== after.openingFlex ||
		before.startDate !== after.startDate ||
		before.endDate !== after.endDate ||
		JSON.stringify(before.terms) !== JSON.stringify(after.terms));

/** Whether a change of the employer needs a log entry (ADR 0021): its periods, end or balance. */
export const employmentChangeIsLogged = (before: Employer | null, after: Employer): boolean =>
	before !== null &&
	(before.openingFlex !== after.openingFlex ||
		before.endDate !== after.endDate ||
		JSON.stringify(before.terms) !== JSON.stringify(after.terms));

/** The next free order or position: one more than the largest. */
export const nextNumber = (values: readonly number[], first = 0): number =>
	values.length === 0 ? first : Math.max(...values) + 1;

/**
 * The internal codes in use that the receiver has no code for: not mapped, or mapped to a code
 * the receiver no longer has. A warning, never a block (#17).
 */
export const unmappedCodes = (
	codes: readonly TimeCode[],
	receiver: Pick<Receiver, 'codes' | 'mapping'>
): TimeCode[] => {
	const own = new Set(receiver.codes.map((c) => c.id));
	return codes.filter((c) => !c.archived && !own.has(receiver.mapping[c.id] ?? ''));
};

/** The mapping without targets the receiver no longer has. */
export const cleanMapping = (mapping: Record<Id, Id>, codes: Receiver['codes']): Record<Id, Id> => {
	const own = new Set(codes.map((c) => c.id));
	return Object.fromEntries(Object.entries(mapping).filter(([, target]) => own.has(target)));
};

/** An eve that is a day off by default, and whether the owner has made it a workday. */
export interface EveRow {
	date: IsoDate;
	name: string;
	free: boolean;
}

/** The year's eves (midsommar-, jul- and nyårsafton) with the owner's exceptions. */
export const evesOf = (year: number, freeDays: FreeDays): EveRow[] =>
	daysOffOf(year)
		.filter((d) => d.kind === 'eve')
		.map((d) => ({ date: d.date, name: d.name, free: freeDays.get(d.date)?.free ?? true }));

/** Whether the date is one of the eves the app knows. */
export const isEve = (date: IsoDate): boolean =>
	daysOffOf(Number(date.slice(0, 4))).some((d) => d.date === date && d.kind === 'eve');

/** Errors of the free-day form: a valid date that is not an eve or already taken, and a name. */
export const freeDayErrors = (
	date: string,
	name: string,
	taken: ReadonlySet<IsoDate>
): { date?: string; name?: string } => {
	const errors: { date?: string; name?: string } = {};
	if (!isIsoDate(date)) errors.date = 'Välj ett datum';
	else if (isEve(date)) errors.date = 'Aftnarna ställs in ovan';
	else if (taken.has(date)) errors.date = 'Den dagen finns redan';
	if (name.trim().length > MAX_NAME) errors.name = `Högst ${MAX_NAME} tecken`;
	return errors;
};

/** `2027-05-07` → `Fredag 7 maj 2027`. */
export const longDate = (date: IsoDate): string => {
	const text = new Intl.DateTimeFormat('sv-SE', {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	}).format(new Date(`${date}T12:00:00Z`));
	return text.charAt(0).toUpperCase() + text.slice(1);
};

/** Swedish genitive: `Kund A` → `Kund A:s`, `Arbetsgivaren` → `Arbetsgivarens`, `Lars` → `Lars`. */
/** A count with its noun: `1 tidkod`, `3 tidkoder`. */
export const plural = (n: number, one: string, many: string): string =>
	`${n} ${n === 1 ? one : many}`;

export const genitive = (name: string): string => {
	if (/[sxz]$/i.test(name)) return name;
	if (/[A-ZÅÄÖ0-9]$/.test(name)) return `${name}:s`;
	return `${name}s`;
};
