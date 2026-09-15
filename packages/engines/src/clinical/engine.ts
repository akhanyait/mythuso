/* Clinical Intelligence on the engine runtime: the clinical inbox and a review signed by a clinician's own action,
 * structured consultations, triage and Home Guidance that answer not triaged and no ratified script, outcome
 * questions that wait on the board, a result acknowledged by the clinician who ordered it, and Clinical's settings.
 *
 * WHAT THIS STORE HOLDS. References and states, as packages/catalog/clinical.json whereContentLives says. A review
 * is an encounter's reference, the protocol version the visit named and who signed it how; a consultation is its
 * entry's reference and which headings it holds; an episode is a signed review's days. No table has a column a
 * consultation's words, a reason code, a script or an answer could be written into.
 *
 * WHO. A caller's reference and role are the runtime's, never a field. Whether they may read the inbox or sign is
 * asked of the review-confirmer setting in force, of clinical.json's clinical roles, and of what Trust last said
 * about that person in that role, heard on the bus (domain/standing.ts). A caller the runtime could not name signs
 * nothing: that is an automatic signature, refused as one.
 *
 * HEARD. visit.handover.submitted, which opens a review; passport.entry.written, which says who wrote an encounter
 * so that nobody signs their own; person.verified, suspended, reinstated and deactivated, for standing; and
 * lab.order.placed and lab.result.received, which say who is responsible for a result.
 *
 * WHAT IT SAYS. review.signed@1 when a review is signed; triage.completed@2 and guidance.delivered@1 only on paths no
 * call can reach until the board ratifies a triage protocol and a script, because the rules and the words those
 * paths need are not in this build; result.acknowledged@1, as it was built in Wave 4.
 *
 * Nothing here is a real service: no visit is reviewed, no patient is triaged and nobody is asked anything.
 */
import { randomUUID } from 'node:crypto';
import { defineEngine, instant, ok, refuse, type BusEvent, type EngineContext, type EventKey } from '../runtime/index.ts';
import { SETTINGS_SCHEMA, settingsIn, settingsRoutes } from '../settings/routes.ts';
import { isRatified, reviewStates, type Emitted } from './domain/contract.ts';
import { STANDING_EVENTS, clearedOn, dayOf, learn, type Standing } from './domain/standing.ts';
import { mayConfirm, openReview, sign, type Review, type Signer } from './domain/reviews.ts';
import { missingOf, record, recordComplete, type Consultation } from './domain/consultations.ts';
import { noRulesInThisBuild, triageOn } from './domain/triage.ts';
import { deliver, noScriptWordsInThisBuild } from './domain/guidance.ts';
import { answer, noPassportGatewayHere, startEpisode, type Episode } from './domain/proms.ts';
import { clinicalInForceOf, clinicalSettings } from './domain/settings.ts';

const TABLES = ['reviews', 'consultations', 'episodes', 'standings', 'entry_authors', 'triages'] as const;
type Table = typeof TABLES[number];
const schema = [
 ...TABLES.map(name => `CREATE TABLE IF NOT EXISTS ${name} (ref TEXT PRIMARY KEY, doc TEXT NOT NULL);`),
 'CREATE TABLE IF NOT EXISTS ordered (lab_order_ref TEXT PRIMARY KEY, ordered_by_ref TEXT NOT NULL);',
 'CREATE TABLE IF NOT EXISTS results (result_ref TEXT PRIMARY KEY, lab_order_ref TEXT NOT NULL, subject_ref TEXT NOT NULL, responsible_ref TEXT, received_at INTEGER NOT NULL, acknowledged_at INTEGER, acknowledged_by_ref TEXT);',
 SETTINGS_SCHEMA
].join('\n');

type ResultRow = { result_ref: string; subject_ref: string; responsible_ref: string | null; acknowledged_at: number | null };
type EntryAuthor = { readonly entryRef: string; readonly authorRef: string };
type TriageKept = { readonly triageRef: string; readonly subjectRef: string };
const text = (value: unknown) => typeof value === 'string' ? value : '';

const get = <T,>(ctx: EngineContext, table: Table, ref: unknown): T | undefined => {
 const row = ctx.store.prepare(`SELECT doc FROM ${table} WHERE ref = ?`).get(String(ref)) as { doc: string } | undefined;
 return row ? JSON.parse(row.doc) as T : undefined;
};
const all = <T,>(ctx: EngineContext, table: Table): T[] => (ctx.store.prepare(`SELECT doc FROM ${table} ORDER BY rowid`).all() as { doc: string }[]).map(row => JSON.parse(row.doc) as T);
const put = (ctx: EngineContext, table: Table, ref: string, doc: unknown) => {
 ctx.store.prepare(`INSERT INTO ${table} (ref, doc) VALUES (?, ?) ON CONFLICT(ref) DO UPDATE SET doc = excluded.doc`).run(ref, JSON.stringify(doc));
};
const nowOf = (ctx: EngineContext) => ctx.clock.now().getTime();
const inForceOf = (ctx: EngineContext) => clinicalInForceOf(settingsIn(clinicalSettings, ctx.store));
/* The protocol version an envelope names travels only when it is a ratified one: a signature outside any protocol
   publishes no version at all, so nothing on the bus can read as a draft having been followed. */
const publishAll = (ctx: EngineContext, emits: readonly Emitted[], subjectRef: string) => {
 for (const event of emits) ctx.publish(event.key as EventKey, { ...event.payload }, { subjectRef, ...(event.protocolVersion && isRatified(event.protocolVersion) ? { protocolVersion: event.protocolVersion } : {}) });
};

/* ── Who is asking ───────────────────────────────────────────────────────────────────────────────── */

const standingKey = (subjectRef: string, role: string) => `${subjectRef} ${role}`;
const signerOf = (ctx: EngineContext): Signer => {
 const ref = ctx.caller.ref;
 return { ref, role: ctx.caller.role, cleared: !!ref && clearedOn(get<Standing>(ctx, 'standings', standingKey(ref, ctx.caller.role)), dayOf(nowOf(ctx))) };
};
const heardStanding = (event: BusEvent, ctx: EngineContext) => {
 const role = text(event.payload['role']);
 const next = learn(get<Standing>(ctx, 'standings', standingKey(event.subjectRef, role)), event);
 if (next) put(ctx, 'standings', standingKey(next.subjectRef, next.role), next);
};
/* Everybody who wrote an encounter's record: its entry's author, heard from the Passport, and every consultation's
   writer. None of them signs its review. */
const authorsOf = (ctx: EngineContext, encounterRef: string): string[] => [...new Set([
 ...all<EntryAuthor>(ctx, 'entry_authors').filter(a => a.entryRef === encounterRef).map(a => a.authorRef),
 ...all<Consultation>(ctx, 'consultations').filter(c => c.encounterRef === encounterRef && c.writtenByRef).map(c => c.writtenByRef as string)
])];

const at = (ms: number | null) => ms === null ? null : instant(new Date(ms));

export const engine = defineEngine({
 id: 'clinical',
 store: { schema },
 routes: {
  /* The inbox is read by the people who answer for signing it, and by nobody else. */
  'GET /v1/clinical/reviews@2': (request, ctx) => {
   const inForce = inForceOf(ctx);
   const who = signerOf(ctx);
   if (!who.ref || !who.cleared || !mayConfirm(who.role, inForce.confirmers)) return refuse('not-a-confirmer');
   const state = request.fields['stateCode'];
   if (state !== undefined && !reviewStates.some(s => s.code === state)) return refuse('state-not-declared');
   const consultations = all<Consultation>(ctx, 'consultations');
   return ok({
    settingsVersion: inForce.settingsVersion,
    confirmers: [...inForce.confirmers],
    reviews: all<Review>(ctx, 'reviews').filter(r => state === undefined || r.stateCode === state).map(r => ({
     reviewRef: r.reviewRef, encounterRef: r.encounterRef, appointmentRef: r.appointmentRef, subjectRef: r.subjectRef, stateCode: r.stateCode,
     protocolVersionId: r.protocolVersionId, protocolRatified: isRatified(r.protocolVersionId), recordComplete: recordComplete(consultations, r.encounterRef),
     submittedAt: instant(new Date(r.submittedAt)), signingModeCode: r.signingModeCode, signedAt: at(r.signedAt), signedByRef: r.signedByRef
    }))
   });
  },

  /* A signature starts the episode whose outcome questions are scheduled from the settings in force, which the
     episode keeps. Both are written in the one transaction, so a refusal leaves neither. */
  'POST /v1/clinical/reviews/{reviewRef}/sign@2': (request, ctx) => {
   const now = nowOf(ctx);
   const inForce = inForceOf(ctx);
   const review = get<Review>(ctx, 'reviews', request.fields['reviewRef']);
   const encounterRef = review?.encounterRef ?? '';
   const episodeRef = `episode-${randomUUID()}`;
   const signed = sign(review, { encounterRef: request.fields['encounterRef'], signingModeCode: request.fields['signingModeCode'], protocolVersionId: request.fields['protocolVersionId'] }, signerOf(ctx), {
    confirmers: inForce.confirmers, recordComplete: recordComplete(all<Consultation>(ctx, 'consultations'), encounterRef), authors: authorsOf(ctx, encounterRef), episodeRef
   }, now);
   if (!signed.ok) return refuse(signed.refusal.id);
   put(ctx, 'reviews', signed.value.reviewRef, signed.value);
   const episode = startEpisode({ episodeRef, subjectRef: signed.value.subjectRef, reviewRef: signed.value.reviewRef }, inForce, now);
   put(ctx, 'episodes', episode.episodeRef, episode);
   publishAll(ctx, signed.emits, signed.value.subjectRef);
   const follows = signed.value.followsProtocolVersionId;
   return ok({ signedAt: instant(new Date(now)), signingModeCode: signed.value.signingModeCode, ...(follows ? { protocolVersionId: follows } : {}), episodeRef });
  },

  /* One consultation per entry and writer. A second call under the same entry adds headings until it is signed off. */
  'POST /v1/clinical/consultations@2': (request, ctx) => {
   const entryRef = text(request.fields['consultationEntryRef']);
   const existing = all<Consultation>(ctx, 'consultations').find(c => c.consultationEntryRef === entryRef && c.writtenByRef === ctx.caller.ref);
   const recorded = record(existing, {
    consultationRef: `consultation-${randomUUID()}`, subjectRef: text(request.fields['subjectRef']), encounterRef: text(request.fields['encounterRef']),
    consultationEntryRef: entryRef, sectionsWritten: Array.isArray(request.fields['sectionsWritten']) ? request.fields['sectionsWritten'] as unknown[] : [], signOff: request.fields['signOff'] === true
   }, { ref: ctx.caller.ref }, nowOf(ctx));
   if (!recorded.ok) return refuse(recorded.refusal.id);
   put(ctx, 'consultations', recorded.value.consultationRef, recorded.value);
   const missing = missingOf(recorded.value.sectionsWritten);
   const signedOffAt = at(recorded.value.signedOffAt);
   return ok({ consultationRef: recorded.value.consultationRef, signable: missing.length === 0, missingSections: missing, ...(signedOffAt ? { signedOffAt } : {}) });
  },

  /* Answered not triaged in this build, whatever is sent: no triage protocol is ratified, and no protocol's rules
     are loaded here. The success branch is the frame the board's content would run in. */
  'POST /v1/clinical/triage@3': (request, ctx) => {
   const triaged = triageOn({ intakeEntryRef: text(request.fields['intakeEntryRef']), protocolVersionId: request.fields['protocolVersionId'], explanationPriorityCode: request.fields['explanationPriorityCode'] }, {
    triageRef: `triage-${randomUUID()}`, load: noRulesInThisBuild
   });
   if (!triaged.ok) return refuse(triaged.refusal.id);
   const subjectRef = text(request.fields['subjectRef']);
   put(ctx, 'triages', triaged.value.triageRef, { triageRef: triaged.value.triageRef, subjectRef } satisfies TriageKept);
   publishAll(ctx, triaged.emits, subjectRef);
   return ok({ ...triaged.value });
  },

  /* No script is ratified and no script's words are in this build, so every outcome is refused in the route's
     sentence. Guidance follows a triage this engine answered, and one it did not is a fault rather than a guess. */
  'POST /v1/clinical/guidance@1': (request, ctx) => {
   const delivered = deliver({ triageRef: request.fields['triageRef'], scriptRef: request.fields['scriptRef'] }, { guidanceRef: `guidance-${randomUUID()}`, read: noScriptWordsInThisBuild });
   if (!delivered.ok) return refuse(delivered.refusal.id);
   const triage = get<TriageKept>(ctx, 'triages', request.fields['triageRef']);
   if (!triage) throw new Error('Guidance was asked to follow a triage this engine never answered, so nobody it could be given to is known.');
   publishAll(ctx, delivered.emits, triage.subjectRef);
   return ok({ ...delivered.value });
  },

  'POST /v1/clinical/proms@2': (request, ctx) => {
   const answered = answer(get<Episode>(ctx, 'episodes', request.fields['episodeRef']), {
    dayMark: request.fields['dayMark'], answers: Array.isArray(request.fields['answers']) ? request.fields['answers'] as unknown[] : []
   }, { ref: ctx.caller.ref }, { write: noPassportGatewayHere }, nowOf(ctx));
   return answered.ok ? ok({ ...answered.value }) : refuse(answered.refusal.id);
  },

  /* A clinician who is not responsible for the result is told it is another clinician's; so is one asking about a
     reference Clinical holds nothing for, and one the runtime could not name. A clinician who could tell "not
     yours" from "does not exist" could walk references to learn which results exist. */
  'POST /v1/clinical/results/{resultRef}/acknowledge@1': (request, ctx) => {
   const row = ctx.store.prepare('SELECT result_ref, subject_ref, responsible_ref, acknowledged_at FROM results WHERE result_ref = ?').get(text(request.fields['resultRef'])) as ResultRow | undefined;
   const who = ctx.caller.ref;
   if (!row || !who || row.responsible_ref !== who) return refuse('result-not-yours');
   if (row.acknowledged_at !== null) return refuse('already-acknowledged');
   const now = nowOf(ctx);
   ctx.store.prepare('UPDATE results SET acknowledged_at = ?, acknowledged_by_ref = ? WHERE result_ref = ?').run(now, who, row.result_ref);
   ctx.publish('result.acknowledged@1', { resultRef: row.result_ref, acknowledgedByRef: who }, { subjectRef: row.subject_ref });
   return ok({ acknowledgedAt: instant(new Date(now)) });
  },

  /* Who confirms a clinical review, for every other engine whose settings wait on one. The value in force, with the
     version that set it and nothing else: who changed it and why is read on the settings route, by a person. */
  'GET /v1/clinical/review-confirmers@1': (_request, ctx) => {
   if (!ctx.caller.role.startsWith('engine:')) return refuse('confirmers-read-by-engines');
   const inForce = inForceOf(ctx);
   return ok({ settingsVersion: inForce.settingsVersion, confirmers: [...inForce.confirmers] });
  },

  /* Clinical's own settings wait on a clinical review too, and read who confirms from its own store. */
  ...settingsRoutes(clinicalSettings, { read: 'GET /v1/clinical/settings@2', change: 'POST /v1/clinical/setting-changes@1', review: 'POST /v1/clinical/setting-reviews@2' }, { confirmers: ctx => inForceOf(ctx).confirmers })
 },
 subscriptions: {
  ...Object.fromEntries(STANDING_EVENTS.map(key => [key, heardStanding])),
  /* A nurse handed a visit over. One review per encounter, however often the handover is heard. */
  'visit.handover.submitted@1': (event, ctx) => {
   const encounterRef = text(event.payload['encounterRef']);
   if (!encounterRef || all<Review>(ctx, 'reviews').some(r => r.encounterRef === encounterRef)) return;
   const review = openReview({
    reviewRef: `review-${randomUUID()}`, appointmentRef: text(event.payload['appointmentRef']), encounterRef, subjectRef: event.subjectRef,
    protocolVersionId: typeof event.protocolVersion === 'string' && event.protocolVersion ? event.protocolVersion : null
   }, nowOf(ctx));
   put(ctx, 'reviews', review.reviewRef, review);
  },
  /* Who wrote an entry, so that nobody signs the review of a record they wrote. The entry's content is never here. */
  'passport.entry.written@1': (event, ctx) => {
   const entryRef = text(event.payload['entryRef']), authorRef = text(event.payload['authorRef']);
   if (entryRef && authorRef) put(ctx, 'entry_authors', `${entryRef} ${authorRef}`, { entryRef, authorRef } satisfies EntryAuthor);
  },
  'lab.order.placed@1': (event, ctx) => {
   ctx.store.prepare('INSERT OR IGNORE INTO ordered (lab_order_ref, ordered_by_ref) VALUES (?, ?)').run(text(event.payload['labOrderRef']), text(event.payload['orderedByRef']));
  },
  /* A result whose order Clinical never heard of has nobody responsible, so nobody can acknowledge it and Core's
     concern for it escalates: the loud way for a lost order to surface. */
  'lab.result.received@1': (event, ctx) => {
   const order = ctx.store.prepare('SELECT ordered_by_ref FROM ordered WHERE lab_order_ref = ?').get(text(event.payload['labOrderRef'])) as { ordered_by_ref: string } | undefined;
   ctx.store.prepare('INSERT OR IGNORE INTO results (result_ref, lab_order_ref, subject_ref, responsible_ref, received_at) VALUES (?, ?, ?, ?, ?)')
    .run(text(event.payload['resultEntryRef']), text(event.payload['labOrderRef']), event.subjectRef, order?.ordered_by_ref ?? null, ctx.clock.now().getTime());
  }
 }
});
