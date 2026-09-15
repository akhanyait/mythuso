/* Clinical Intelligence on the engine runtime, narrowly: a clinician acknowledges a lab result, and nothing else is
 * built here yet. The rest of packages/catalog/apis/clinical.json is Wave 5's, answered by the contract mock.
 *
 * WHO IS RESPONSIBLE. The clinician who ordered the test. Clinical hears lab.order.placed@1, which names who ordered
 * it, and lab.result.received@1, which names the order and the result's entry in the Health Passport, and keeps the
 * one beside the other: a result reference, the order it answers, the patient's opaque subject reference and the
 * responsible clinician's reference. Never a value: the result is read in the Passport under the clinician's grant.
 *
 * WHAT IS REFUSED. POST /v1/clinical/results/{resultRef}/acknowledge@1 declares two refusals and is frozen with
 * them. A clinician who is not responsible for the result is told it is another clinician's; so is one asking about
 * a reference Clinical holds nothing for, and one the runtime could not name. That is on purpose rather than for
 * want of a sentence: a clinician who could tell "not yours" from "does not exist" could walk references to learn
 * which results exist, and a result's existence says a test was ordered for somebody. A result is acknowledged
 * once, and a second acknowledgement is refused rather than recorded again.
 *
 * WHAT IT SAYS. result.acknowledged@1, naming the entry and who acknowledged it. Medicines hears it and may then
 * close the order; Core hears it and stands down the concern Medicines raised for the result.
 */
import { defineEngine, instant, ok, refuse } from '../runtime/index.ts';

const schema = [
 'CREATE TABLE IF NOT EXISTS ordered (lab_order_ref TEXT PRIMARY KEY, ordered_by_ref TEXT NOT NULL);',
 'CREATE TABLE IF NOT EXISTS results (result_ref TEXT PRIMARY KEY, lab_order_ref TEXT NOT NULL, subject_ref TEXT NOT NULL, responsible_ref TEXT, received_at INTEGER NOT NULL, acknowledged_at INTEGER, acknowledged_by_ref TEXT);'
].join('\n');

type ResultRow = { result_ref: string; subject_ref: string; responsible_ref: string | null; acknowledged_at: number | null };
const text = (value: unknown) => typeof value === 'string' ? value : '';

export const engine = defineEngine({
 id: 'clinical',
 store: { schema },
 routes: {
  'POST /v1/clinical/results/{resultRef}/acknowledge@1': (request, ctx) => {
   const row = ctx.store.prepare('SELECT result_ref, subject_ref, responsible_ref, acknowledged_at FROM results WHERE result_ref = ?').get(text(request.fields['resultRef'])) as ResultRow | undefined;
   const who = ctx.caller.ref;
   if (!row || !who || row.responsible_ref !== who) return refuse('result-not-yours');
   if (row.acknowledged_at !== null) return refuse('already-acknowledged');
   const now = ctx.clock.now().getTime();
   ctx.store.prepare('UPDATE results SET acknowledged_at = ?, acknowledged_by_ref = ? WHERE result_ref = ?').run(now, who, row.result_ref);
   ctx.publish('result.acknowledged@1', { resultRef: row.result_ref, acknowledgedByRef: who }, { subjectRef: row.subject_ref });
   return ok({ acknowledgedAt: instant(new Date(now)) });
  }
 },
 subscriptions: {
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
