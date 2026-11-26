// Listeners the views share: the codes of every assignment.
import type { Firestore } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { codeCodec } from '../data/dokument.ts';
import { codesPath, watchCollection } from '../data/installningar.ts';
import type { Id, TimeCode } from '../domain/types.ts';

/** The codes of every assignment, by assignment id. */
export const useCodes = (db: Firestore, uid: Id, assignmentIds: readonly Id[]) => {
	const [codes, setCodes] = useState<Record<Id, TimeCode[]>>({});
	const key = assignmentIds.join(',');
	useEffect(() => {
		const stops = key
			.split(',')
			.filter(Boolean)
			.map((id) =>
				watchCollection(
					db,
					uid,
					codesPath(id),
					codeCodec,
					(values) => setCodes((c) => ({ ...c, [id]: values })),
					id
				)
			);
		return () => stops.forEach((stop) => stop());
	}, [db, uid, key]);
	return codes;
};
