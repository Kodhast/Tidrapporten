// Listeners the views share: the codes and the receivers of every assignment.
import type { Firestore } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { codeCodec, receiverCodec, type Codec } from '../data/dokument.ts';
import { codesPath, receiversPath, watchCollection } from '../data/installningar.ts';
import type { Id, Receiver, TimeCode } from '../domain/types.ts';

/** A collection under each assignment, by assignment id; an id is missing until its values come. */
const usePerAssignment = <T>(
	db: Firestore,
	uid: Id,
	assignmentIds: readonly Id[],
	path: (assignmentId: Id) => string,
	codec: Codec<T>
) => {
	const [values, setValues] = useState<Record<Id, T[]>>({});
	const key = assignmentIds.join(',');
	useEffect(() => {
		const stops = key
			.split(',')
			.filter(Boolean)
			.map((id) =>
				watchCollection(
					db,
					uid,
					path(id),
					codec,
					(list) => setValues((v) => ({ ...v, [id]: list })),
					id
				)
			);
		return () => stops.forEach((stop) => stop());
		// The path and the codec are module constants.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [db, uid, key]);
	return values;
};

/** The codes of every assignment, by assignment id. */
export const useCodes = (db: Firestore, uid: Id, assignmentIds: readonly Id[]) =>
	usePerAssignment<TimeCode>(db, uid, assignmentIds, codesPath, codeCodec);

/** The receivers of every assignment, by assignment id. */
export const useReceivers = (db: Firestore, uid: Id, assignmentIds: readonly Id[]) =>
	usePerAssignment<Receiver>(db, uid, assignmentIds, receiversPath, receiverCodec);
