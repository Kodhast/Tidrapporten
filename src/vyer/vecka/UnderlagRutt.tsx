// Connects the basis for a week (issue 25) to Firestore: the week as the week view has it, and
// the week's change log, whose entry changes are read back as entries for the before → after.
import type { Firestore } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { entryCodec } from '../../data/dokument.ts';
import { watchWeekChangeLog } from '../../data/reports.ts';
import { entryName } from '../../domain/dag.ts';
import { dateOf } from '../../domain/tid.ts';
import type { ChangeLogEntry, Entry, Id, IsoWeek } from '../../domain/types.ts';
import { changeSubject } from '../../domain/underlag.ts';
import { otherWeek, weekLabel } from '../../domain/vecka.ts';
import { useNow } from '../lyssnare.ts';
import { replaceRoute } from '../rutter.ts';
import { UnderlagVy, type Change } from './UnderlagVy';
import { useVecka } from './useVecka';

export interface UnderlagRuttProps {
	db: Firestore;
	uid: Id;
	week: IsoWeek;
}

const asEntry = (id: string, data: Record<string, unknown> | null): Entry | null =>
	data ? entryCodec.fromData(id, data) : null;

export function UnderlagRutt({ db, uid, week }: UnderlagRuttProps) {
	const now = useNow();
	const data = useVecka(db, uid, week, now);
	const [log, setLog] = useState<{ week: IsoWeek; value: ChangeLogEntry[] } | null>(null);
	const [logFailed, setLogFailed] = useState(false);
	useEffect(
		() =>
			watchWeekChangeLog(
				db,
				uid,
				week,
				(value) => setLog({ week, value }),
				() => setLogFailed(true)
			),
		[db, uid, week]
	);

	const describe = (entry: Entry) =>
		entryName(entry, data.assignments, data.codes, data.absenceTypes);
	// A log entry for an entry is read back as entries, so that its times can be said.
	const changes: Change[] | null =
		log?.week === week
			? log.value.map((l) => {
					const id = l.path.split('/')[1] ?? l.id;
					return changeSubject(l.path) === 'entry'
						? { log: l, before: asEntry(id, l.before), after: asEntry(id, l.after) }
						: { log: l, before: null, after: null };
				})
			: null;

	return (
		<UnderlagVy
			week={week}
			label={weekLabel(week, dateOf(now))}
			view={data.view}
			entries={data.entries}
			changes={changes}
			failed={data.failed || logFailed}
			describe={describe}
			onWeek={(step) => replaceRoute({ view: 'underlag', week: otherWeek(week, step) })}
			onPrint={() => window.print()}
		/>
	);
}
