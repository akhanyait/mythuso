/**
 * The security compromise register: POPIA section 22, as a table rather than a paragraph.
 *
 * ── What this is not ─────────────────────────────────────────────────────────────────────────
 *
 * It is **not** the Control Tower's incident board. That board — in `apps/web/src/features/
 * Dispatch.tsx` — is operational and clinical: a nurse who could not get in at the address, a
 * patient who reported chest pain, a sample seal found damaged. It has four severities and it is a
 * preview. This is a different register about a different thing, and running the two together would
 * have meant one severity ladder describing both "the courier's bag was damaged" and "somebody read
 * four hundred people's records", which is a ladder that cannot mean anything at either end.
 *
 * So there is deliberately **no severity here at all**, and that is the design rather than an
 * omission. Section 22 turns on one question and it is a yes or a no: were there reasonable grounds
 * to believe that personal information has been accessed or acquired by an unauthorised person? If
 * yes, the Information Regulator *and* every affected data subject must be notified as soon as
 * reasonably possible. If no, it is an incident worth recording and nobody has to be told. A
 * four-rung ladder in front of that question is a way of answering it "medium".
 *
 * ── Why it holds no names ────────────────────────────────────────────────────────────────────
 *
 * There is no column here for a data subject's name, number or account id, and there is no column a
 * reading could go in. What is held is a count. A breach register that lists everybody affected is a
 * second copy of the thing that leaked, kept in the file most likely to be opened by the largest
 * number of people during the worst week the company has. Who has to be told is worked out at the
 * time from the records the incident actually touched; it is not curated in here beforehand.
 *
 * ── The refusals ─────────────────────────────────────────────────────────────────────────────
 *
 * **Reporting is never refused.** Any party MyThuso has vetted may open one, and an incident is not
 * turned away for being wrong, duplicated or embarrassing. A report somebody has to be right to file
 * is a report nobody files, and the incidents that matter are the ones reported by the person who
 * thinks they might have caused it.
 *
 * **An incident that reached personal information cannot be closed until both notifications are
 * recorded.** Not one of them — both. Section 22(1) names the Regulator and the data subject, and a
 * register that let an incident be closed on the Regulator alone would be a register that quietly
 * made "we told the authorities" the whole of the duty.
 *
 * **A close is somebody's name and a date.** It is written into the same hash chain the gate writes
 * to, so an incident cannot be closed, reopened and quietly rewritten into having been minor.
 *
 * ── The number this file refuses to invent ───────────────────────────────────────────────────
 *
 * Section 22(2) says notification must be made "as soon as reasonably possible after the discovery",
 * and it names no period. So this counts the days since discovery and says the Act names none,
 * rather than printing a deadline MyThuso made up and letting it be read as the law. That is the
 * same rule the retention register follows for every period that is MyThuso's own setting.
 *
 * ── What is still absent, and it is most of it ───────────────────────────────────────────────
 *
 * Detection, paging and actual delivery of a notification. There is no monitoring here that would
 * notice anything by itself, no on-call rota, and no messaging provider — so nothing in this file
 * tells anybody anything. It records that somebody was told, on the word of the person recording it.
 * That is a register, not an incident response, and the difference is written down here rather than
 * discovered during one.
 *
 * Pure of HTTP: server.ts decides who is asking; this decides what may be done.
 */
import { randomUUID } from 'node:crypto';

type SqlValue = string | number | bigint | Uint8Array | null;
export type Database = {
 exec(sql: string): void;
 prepare(sql: string): { run(...params: SqlValue[]): unknown; all(...params: SqlValue[]): unknown[] };
};

/* No person_id, no phone, no name, no free-text field about anybody in particular. `people_affected`
   is a count and `what_happened` is about the event. See the note above: the one thing a breach
   register must not become is a copy of what was breached. */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS incidents (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, what_happened TEXT NOT NULL,
 information_reached INTEGER NOT NULL, people_affected INTEGER,
 discovered_at INTEGER NOT NULL, opened_by TEXT NOT NULL, opened_at INTEGER NOT NULL,
 contained_at INTEGER, containment TEXT,
 regulator_told_at INTEGER, subjects_told_at INTEGER,
 closed_at INTEGER, closed_by TEXT);
CREATE INDEX IF NOT EXISTS incidents_open ON incidents (closed_at, discovered_at);
`;

/**
 * What sort of thing happened. A closed set, because a free-text classification is a classification
 * nobody can count, and the first question anybody asks of a register is how many of each.
 */
export const INCIDENT_KINDS = [
 { id: 'unauthorised-access', name: 'Somebody opened something they had no business opening' },
 { id: 'lost-device', name: 'A device holding information was lost or taken' },
 { id: 'disclosure-in-error', name: 'Information was sent to the wrong person' },
 { id: 'key-or-credential', name: 'A key, a password or a session token may be in somebody else\'s hands' },
 { id: 'integrity', name: 'A record or a log may have been altered' },
 { id: 'availability', name: 'Information could not be reached when it was needed' },
 { id: 'supplier', name: 'Something happened at an operator or supplier holding MyThuso\'s information' },
 { id: 'other', name: 'Something else worth recording' }
] as const;
const KIND_IDS = new Set(INCIDENT_KINDS.map(kind => kind.id));

export const REFUSALS = {
 unknownKind:
  'That is not one of the kinds of incident this register holds. The list is short on purpose — a register with a free-text classification cannot answer "how many of these have we had", which is the first question anybody asks of one. Where nothing fits, use "Something else worth recording" and say what happened in your own words.',
 sayWhatHappened:
  'An incident has to say what happened and when it was discovered. Both, in the words of whoever noticed. A line with a date and no account of it is a line nobody can act on afterwards, and the person who could have explained it will have gone home.',
 tellThemFirst:
  'This incident is recorded as one where personal information was, or may have been, accessed or acquired by somebody with no right to it. POPIA section 22 requires the Information Regulator and every affected person to be told, and this register will not let it be closed until both are recorded as told. Telling the Regulator is not the whole duty and this refusal exists so it cannot quietly become it.',
 containFirst:
  'Nothing is closed before it is contained. Record what stopped it, and by then somebody will have written the sentence the close needs anyway.',
 alreadyClosed:
  'That incident is already closed. Reopening it is not a route here: what has been learned since goes in a new incident that names this one, so the record of what was known on the day is not rewritten by what was known a month later.',
 noSuchIncident: 'There is no incident by that reference.',
 notYours:
  'Only the person who reported this incident, or MyThuso staff who review the vetting register, can record how it was contained. A containment written by anybody else is a stranger marking somebody else\'s report as dealt with.'
} as const;

/** What section 22 says about time, quoted rather than converted into a deadline of MyThuso's own. */
export const NOTIFICATION_RULE =
 'POPIA section 22(2) requires notification "as soon as reasonably possible after the discovery of the compromise", and names no number of days. This register counts the days since discovery and does not invent a deadline, because a period MyThuso made up would be read as the one the Act states.';

export type Incident = {
 id: string;
 kind: string;
 whatHappened: string;
 /** The section 22 trigger, as the yes or no it actually is. */
 informationReached: boolean;
 peopleAffected: number | null;
 discoveredAt: number;
 openedBy: string;
 openedAt: number;
 containedAt: number | null;
 containment: string | null;
 regulatorToldAt: number | null;
 subjectsToldAt: number | null;
 closedAt: number | null;
 closedBy: string | null;
};

export type IncidentStore = {
 open(incident: Incident): void;
 find(id: string): Incident | null;
 all(): Incident[];
 contain(id: string, at: number, containment: string): void;
 recordNotification(id: string, who: 'regulator' | 'subjects', at: number): void;
 close(id: string, at: number, by: string): void;
};

const DAY = 86_400_000;
const asBool = (value: unknown): boolean => value === 1 || value === true || value === 1n;
const COLUMNS =
 'id, kind, what_happened AS whatHappened, information_reached AS informationReached, people_affected AS peopleAffected, '
 + 'discovered_at AS discoveredAt, opened_by AS openedBy, opened_at AS openedAt, contained_at AS containedAt, containment, '
 + 'regulator_told_at AS regulatorToldAt, subjects_told_at AS subjectsToldAt, closed_at AS closedAt, closed_by AS closedBy';

export function openIncidentStore(db: Database): IncidentStore {
 db.exec(SCHEMA);
 const hydrate = (rows: unknown[]): Incident[] =>
  (rows as (Incident & { informationReached: unknown })[]).map(row => ({ ...row, informationReached: asBool(row.informationReached) }));
 return {
  open(incident) {
   db.prepare('INSERT INTO incidents (id, kind, what_happened, information_reached, people_affected, discovered_at, opened_by, opened_at, contained_at, containment, regulator_told_at, subjects_told_at, closed_at, closed_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL)')
    .run(incident.id, incident.kind, incident.whatHappened, incident.informationReached ? 1 : 0, incident.peopleAffected, incident.discoveredAt, incident.openedBy, incident.openedAt);
  },
  find(id) { return hydrate(db.prepare(`SELECT ${COLUMNS} FROM incidents WHERE id = ?`).all(id))[0] ?? null; },
  all() { return hydrate(db.prepare(`SELECT ${COLUMNS} FROM incidents ORDER BY discovered_at DESC`).all()); },
  contain(id, at, containment) {
   db.prepare('UPDATE incidents SET contained_at = ?, containment = ? WHERE id = ?').run(at, containment, id);
  },
  recordNotification(id, who, at) {
   /* Two statements rather than one with an interpolated column: a column name assembled from a
      caller's word is how a register learns to write to whichever column it is asked for. */
   if (who === 'regulator') db.prepare('UPDATE incidents SET regulator_told_at = ? WHERE id = ? AND regulator_told_at IS NULL').run(at, id);
   else db.prepare('UPDATE incidents SET subjects_told_at = ? WHERE id = ? AND subjects_told_at IS NULL').run(at, id);
  },
  close(id, at, by) {
   db.prepare('UPDATE incidents SET closed_at = ?, closed_by = ? WHERE id = ? AND closed_at IS NULL').run(at, by, id);
  }
 };
}

export type Refused = { ok: false; reason: string };

/**
 * Open one. The only thing this refuses is an incident nobody could act on afterwards.
 *
 * Note what is *not* checked: whether the reporter was involved, whether it is a duplicate, whether
 * `informationReached` is a fair call. All three are judgements for the person who reads it, and
 * every one of them, made here, would be a reason somebody decided not to file.
 */
export function report(
 store: IncidentStore,
 input: { kind: string; whatHappened: string; informationReached: boolean; peopleAffected?: number | null; discoveredAt?: number; openedBy: string },
 at: number
): { ok: true; incident: Incident } | Refused {
 if (!KIND_IDS.has(input.kind as typeof INCIDENT_KINDS[number]['id'])) return { ok: false, reason: REFUSALS.unknownKind };
 const discoveredAt = input.discoveredAt ?? at;
 if (!input.whatHappened.trim() || !Number.isFinite(discoveredAt)) return { ok: false, reason: REFUSALS.sayWhatHappened };
 const incident: Incident = {
  id: randomUUID(), kind: input.kind, whatHappened: input.whatHappened.trim(),
  informationReached: input.informationReached,
  peopleAffected: typeof input.peopleAffected === 'number' ? input.peopleAffected : null,
  /* A discovery in the future is a clock somebody got wrong, and the honest reading of it is now.
     Recorded rather than corrected silently would be better still, and it needs a field to record
     it in — which is the sort of thing that goes in when there is a second one of these. */
  discoveredAt: Math.min(discoveredAt, at),
  openedBy: input.openedBy, openedAt: at,
  containedAt: null, containment: null, regulatorToldAt: null, subjectsToldAt: null, closedAt: null, closedBy: null
 };
 store.open(incident);
 return { ok: true, incident };
}

/** Close one, or say which of the three things standing in the way has not happened. */
export function close(
 store: IncidentStore,
 id: string,
 by: string,
 at: number
): { ok: true; incident: Incident } | Refused {
 const incident = store.find(id);
 if (!incident) return { ok: false, reason: REFUSALS.noSuchIncident };
 if (incident.closedAt !== null) return { ok: false, reason: REFUSALS.alreadyClosed };
 if (incident.containedAt === null) return { ok: false, reason: REFUSALS.containFirst };
 if (incident.informationReached && (incident.regulatorToldAt === null || incident.subjectsToldAt === null)) {
  return { ok: false, reason: REFUSALS.tellThemFirst };
 }
 store.close(id, at, by);
 return { ok: true, incident: { ...incident, closedAt: at, closedBy: by } };
}

/**
 * The register in numbers, for an operator and for the health check.
 *
 * `owedNotification` is the one worth waking up for: an incident that reached personal information
 * and where somebody who has to be told has not been. `longestOpenDays` is beside it because a
 * single open incident from March says more than any count of this month's.
 */
export function standing(incidents: readonly Incident[], at: number): {
 total: number; open: number; reachedInformation: number; owedNotification: number;
 longestOpenDays: number | null; notificationRule: string;
} {
 const open = incidents.filter(incident => incident.closedAt === null);
 const owed = incidents.filter(incident =>
  incident.informationReached && (incident.regulatorToldAt === null || incident.subjectsToldAt === null));
 const oldest = open.reduce<number | null>((longest, incident) => {
  const days = Math.floor((at - incident.discoveredAt) / DAY);
  return longest === null || days > longest ? days : longest;
 }, null);
 return {
  total: incidents.length,
  open: open.length,
  reachedInformation: incidents.filter(incident => incident.informationReached).length,
  owedNotification: owed.length,
  longestOpenDays: oldest,
  notificationRule: NOTIFICATION_RULE
 };
}

/** Days since discovery. Named rather than inlined, because it is the number the register is for. */
export const daysSinceDiscovery = (incident: Incident, at: number): number =>
 Math.floor((at - incident.discoveredAt) / DAY);
