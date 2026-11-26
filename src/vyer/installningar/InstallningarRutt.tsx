// Connects the settings views to Firestore: follows what each view shows and saves through the
// data layer. The views themselves get plain values and can be tested without Firebase.
import type { Firestore } from 'firebase/firestore';
import type { Functions } from 'firebase/functions';
import { restoreFile } from '../../data/aterstall.ts';
import { useEffect, useState } from 'react';
import {
	absenceTypesPath,
	assignmentsPath,
	codesPath,
	customersPath,
	employersPath,
	ensureDefaultAbsenceTypes,
	freeDaysPath,
	receiversPath,
	saveAbsenceType,
	saveAssignment,
	saveCustomer,
	saveEmployer,
	saveFreeDay,
	saveReceiver,
	watchCollection
} from '../../data/installningar.ts';
import {
	absenceTypeCodec,
	assignmentCodec,
	codeCodec,
	customerCodec,
	employerCodec,
	freeDayCodec,
	receiverCodec,
	type Codec
} from '../../data/dokument.ts';
import { readAll } from '../../data/export.ts';
import { deleteAssignment, emptyAccount } from '../../data/radering.ts';
import { exportFile, exportFileName } from '../../data/exportformat.ts';
import { nextNumber } from '../../domain/installningar.ts';
import { termsOn } from '../../domain/norm.ts';
import { dateOf } from '../../domain/tid.ts';
import type { Id } from '../../domain/types.ts';
import { replaceRoute, type Route } from '../rutter.ts';
import { FranvaroVy } from './FranvaroVy';
import { InstallningarVy } from './InstallningarVy';
import { MottagareVy } from './MottagareVy';
import { PartVy } from './PartVy';
import { UppdragVy } from './UppdragVy';

type SettingsRoute = Extract<
	Route,
	{
		view: 'installningar' | 'uppdrag' | 'mottagare' | 'franvaro' | 'arbetsgivare' | 'kund';
	}
>;

export interface InstallningarRuttProps {
	db: Firestore;
	functions: Functions;
	uid: Id;
	route: SettingsRoute;
	online: boolean;
}

/** A collection below the user, or null until the first snapshot. */
function useCollection<T>(
	db: Firestore,
	uid: Id,
	path: string | null,
	codec: Codec<T>,
	parentId?: Id
): T[] | null {
	const [state, setState] = useState<{ path: string | null; values: T[] | null }>({
		path,
		values: null
	});
	useEffect(() => {
		if (path === null) return;
		return watchCollection(db, uid, path, codec, (values) => setState({ path, values }), parentId);
	}, [db, uid, path, codec, parentId]);
	// Values from another path (the view changed) are not shown while the new ones load.
	return state.path === path ? state.values : null;
}

/** Saves the value as a JSON file through the browser's download. */
const download = (name: string, value: unknown) => {
	const url = URL.createObjectURL(
		new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
	);
	const link = document.createElement('a');
	link.href = url;
	link.download = name;
	link.click();
	URL.revokeObjectURL(url);
};

const Loading = () => <p className="kh-text-body innehall">Hämtar …</p>;

export function InstallningarRutt({ db, functions, uid, route, online }: InstallningarRuttProps) {
	// The day when the view opened; settings rarely stay open over midnight.
	const [today] = useState(() => dateOf(Date.now()));
	const assignmentId =
		route.view === 'uppdrag' ? route.id : route.view === 'mottagare' ? route.assignmentId : null;
	const assignments = useCollection(db, uid, assignmentsPath, assignmentCodec);
	const absenceTypes = useCollection(db, uid, absenceTypesPath, absenceTypeCodec);
	const freeDays = useCollection(db, uid, freeDaysPath, freeDayCodec);
	const codes = useCollection(
		db,
		uid,
		assignmentId && codesPath(assignmentId),
		codeCodec,
		assignmentId ?? undefined
	);
	const receivers = useCollection(
		db,
		uid,
		assignmentId && receiversPath(assignmentId),
		receiverCodec,
		assignmentId ?? undefined
	);
	const employers = useCollection(db, uid, employersPath, employerCodec);
	const customers = useCollection(db, uid, customersPath, customerCodec);

	const saveCopy = async () => {
		const now = Date.now();
		download(exportFileName(now), exportFile(await readAll(db, uid), now));
	};

	if (!assignments || !absenceTypes || !freeDays || !employers || !customers) return <Loading />;

	switch (route.view) {
		case 'installningar':
			return (
				<InstallningarVy
					assignments={assignments}
					employers={employers}
					customers={customers}
					absenceTypes={absenceTypes.filter((t) => !t.archived).length}
					freeDays={freeDays.filter((d) => d.free).length}
					scopeToday={Object.fromEntries(
						assignments.map((a) => [a.id, (termsOn(a, today) ?? a.terms[0])?.scopePercent ?? 100])
					)}
					online={online}
					onExport={saveCopy}
					onRestore={(file) => restoreFile(functions, file)}
					onEmpty={async () => {
						// The copy first: without it nothing is deleted.
						await saveCopy();
						await emptyAccount(functions);
						// The defaults as at the first sign-in; the start then offers "Kom igång".
						await ensureDefaultAbsenceTypes(db, uid);
						replaceRoute({ view: 'idag' });
					}}
				/>
			);
		case 'franvaro':
			return (
				<FranvaroVy
					absenceTypes={absenceTypes}
					freeDays={freeDays}
					today={today}
					online={online}
					onSaveAbsenceType={(before, after) => saveAbsenceType(db, uid, before, after)}
					onSaveFreeDay={(before, after) => saveFreeDay(db, uid, before, after)}
				/>
			);
		case 'uppdrag': {
			const assignment = route.id ? assignments.find((a) => a.id === route.id) : null;
			if (assignment === undefined)
				return <p className="kh-text-body innehall">Uppdraget finns inte.</p>;
			if (route.id && (!codes || !receivers)) return <Loading />;
			return (
				<UppdragVy
					key={route.id ?? 'ny'}
					assignment={assignment}
					codes={codes ?? []}
					receivers={receivers ?? []}
					employers={employers}
					customers={customers}
					nextOrder={nextNumber(assignments.map((a) => a.order))}
					today={today}
					online={online}
					onSave={async (before, after, codeChanges, firstReceivers) => {
						await saveAssignment(db, uid, before, after, codeChanges, firstReceivers);
						if (!before) replaceRoute({ view: 'uppdrag', id: after.id });
					}}
					onDelete={async (id) => {
						const refused = await deleteAssignment(functions, id);
						if (refused === null) replaceRoute({ view: 'installningar' });
						return refused;
					}}
				/>
			);
		}
		case 'arbetsgivare': {
			const employer = route.id ? employers.find((e) => e.id === route.id) : null;
			if (employer === undefined)
				return <p className="kh-text-body innehall">Arbetsgivaren finns inte.</p>;
			return (
				<PartVy
					key={route.id ?? 'ny'}
					kind="employer"
					value={employer}
					nextOrder={nextNumber(employers.map((e) => e.order))}
					online={online}
					onSave={async (before, after) => {
						await saveEmployer(db, uid, before, after);
						if (!before) replaceRoute({ view: 'arbetsgivare', id: after.id });
					}}
				/>
			);
		}
		case 'kund': {
			const customer = route.id ? customers.find((c) => c.id === route.id) : null;
			if (customer === undefined)
				return <p className="kh-text-body innehall">Kunden finns inte.</p>;
			return (
				<PartVy
					key={route.id ?? 'ny'}
					kind="customer"
					value={customer}
					nextOrder={nextNumber(customers.map((c) => c.order))}
					online={online}
					onSave={async (before, after) => {
						await saveCustomer(db, uid, before, after);
						if (!before) replaceRoute({ view: 'kund', id: after.id });
					}}
				/>
			);
		}
		case 'mottagare': {
			if (!codes || !receivers) return <Loading />;
			const receiver = route.id ? receivers.find((r) => r.id === route.id) : null;
			if (receiver === undefined)
				return <p className="kh-text-body innehall">Mottagaren finns inte.</p>;
			return (
				<MottagareVy
					key={route.id ?? 'ny'}
					assignmentId={route.assignmentId}
					receiver={receiver}
					receivers={receivers}
					codes={codes}
					absenceTypes={absenceTypes}
					online={online}
					onSave={async (before, after) => {
						await saveReceiver(db, uid, before, after);
						if (!before) {
							replaceRoute({ view: 'mottagare', assignmentId: after.assignmentId, id: after.id });
						}
					}}
				/>
			);
		}
	}
}
