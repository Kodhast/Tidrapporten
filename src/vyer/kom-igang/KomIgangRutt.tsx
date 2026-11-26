// Connects the start at first use to Firestore. It is for a user without assignments: with one
// already, the flow would add a second employer beside the first, so it points to the settings.
import type { Firestore } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { assignmentsPath, saveFirstAssignment, watchCollection } from '../../data/installningar.ts';
import { assignmentCodec } from '../../data/dokument.ts';
import type { Id } from '../../domain/types.ts';
import { href, replaceRoute } from '../rutter.ts';
import { KomIgangVy } from './KomIgangVy';

export function KomIgangRutt({ db, uid, online }: { db: Firestore; uid: Id; online: boolean }) {
	const [count, setCount] = useState<number | null>(null);
	const [saved, setSaved] = useState(false);
	useEffect(
		() => watchCollection(db, uid, assignmentsPath, assignmentCodec, (v) => setCount(v.length)),
		[db, uid]
	);
	if (count === null) return <p className="kh-text-body innehall">Hämtar …</p>;
	if (count > 0 && !saved)
		return (
			<div className="innehall">
				<p className="kh-text-body">
					Du har redan uppdrag. Nya lägger du till under{' '}
					<a href={href({ view: 'installningar' })}>Inställningar</a>.
				</p>
			</div>
		);
	return (
		<KomIgangVy
			online={online}
			onSave={async (docs) => {
				setSaved(true);
				try {
					await saveFirstAssignment(db, uid, docs);
				} catch (e) {
					setSaved(false);
					throw e;
				}
				replaceRoute({ view: 'idag' });
			}}
		/>
	);
}
