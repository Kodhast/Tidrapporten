// Connects the settings views to Firestore: follows what each view shows and saves through the
// data layer. The views themselves get plain values and can be tested without Firebase.
import type { Firestore } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
	absenceTypesPath,
	assignmentsPath,
	codesPath,
	freeDaysPath,
	receiversPath,
	saveAbsenceType,
	saveAssignment,
	saveFreeDay,
	saveReceiver,
	watchCollection
} from '../../data/installningar.ts';
import {
	absenceTypeCodec,
	assignmentCodec,
	codeCodec,
	freeDayCodec,
	receiverCodec,
	type Codec
} from '../../data/dokument.ts';
import { nextNumber } from '../../domain/installningar.ts';
import { termsOn } from '../../domain/norm.ts';
import { dateOf } from '../../domain/tid.ts';
import type { Id, Receiver, TimeCode } from '../../domain/types.ts';
import { replaceRoute, type Route } from '../rutter.ts';
import { FranvaroVy } from './FranvaroVy';
import { InstallningarVy, type AssignmentCounts } from './InstallningarVy';
import { MottagareVy } from './MottagareVy';
import { UppdragVy } from './UppdragVy';

type SettingsRoute = Extract<
	Route,
	{ view: 'installningar' | 'uppdrag' | 'mottagare' | 'franvaro' }
>;

export interface InstallningarRuttProps {
	db: Firestore;
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

/** The number of codes and receivers per assignment, for the list. */
function useCounts(db: Firestore, uid: Id, ids: readonly Id[]): Record<Id, AssignmentCounts> {
	const [counts, setCounts] = useState<Record<Id, AssignmentCounts>>({});
	const key = ids.join(',');
	useEffect(() => {
		const stops = key
			.split(',')
			.filter(Boolean)
			.flatMap((id) => {
				const set = (field: keyof AssignmentCounts) => (values: unknown[]) =>
					setCounts((c) => ({
						...c,
						[id]: { ...(c[id] ?? { codes: 0, receivers: 0 }), [field]: values.length }
					}));
				return [
					watchCollection<TimeCode>(db, uid, codesPath(id), codeCodec, (v) =>
						set('codes')(v.filter((c) => !c.archived))
					),
					watchCollection<Receiver>(db, uid, receiversPath(id), receiverCodec, (v) =>
						set('receivers')(v.filter((r) => !r.archived))
					)
				];
			});
		return () => stops.forEach((stop) => stop());
	}, [db, uid, key]);
	return counts;
}

const Loading = () => <p className="kh-text-body innehall">Hämtar …</p>;

export function InstallningarRutt({ db, uid, route, online }: InstallningarRuttProps) {
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
	const counts = useCounts(
		db,
		uid,
		route.view === 'installningar' ? (assignments ?? []).map((a) => a.id) : []
	);

	if (!assignments || !absenceTypes || !freeDays) return <Loading />;

	switch (route.view) {
		case 'installningar':
			return (
				<InstallningarVy
					assignments={assignments}
					counts={counts}
					absenceTypes={absenceTypes.filter((t) => !t.archived).length}
					freeDays={freeDays.filter((d) => d.free).length}
					scopeToday={Object.fromEntries(
						assignments.map((a) => [a.id, (termsOn(a, today) ?? a.terms[0])?.scopePercent ?? 100])
					)}
					online={online}
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
					nextOrder={nextNumber(assignments.map((a) => a.order))}
					today={today}
					online={online}
					onSave={async (before, after, codeChanges) => {
						await saveAssignment(db, uid, before, after, codeChanges);
						if (!before) replaceRoute({ view: 'uppdrag', id: after.id });
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
