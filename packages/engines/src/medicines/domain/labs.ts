/* A lab order, the result that answers it, and the rule that a result is not complete until a clinician
 * acknowledges it.
 *
 * WHERE A RESULT COMES FROM. A laboratory's result arrives only through the lab-result door in
 * packages/catalog/feeds.json, which refuses every payload until a laboratory is contracted. So an order is placed
 * only for a collection mode packages/catalog/medicines.json says somebody serves, and today the only server is the
 * synthetic development laboratory, which exists on the development runtime and in the web preview and nowhere
 * else. It answers after its turnaround with a reference to a result that does not exist, never a value, as
 * Money's simulated provider answers a payment in development: a simulation beside the door, not an adapter
 * behind it.
 *
 * WHO ACKNOWLEDGES. Not this engine. Clinical records the acknowledgement by the clinician who ordered the test
 * and publishes result.acknowledged; Medicines hears it and only then may the order close. Core raises and
 * stands down the concern in between. A close before the acknowledgement is refused in the engine's own sentence,
 * which is the Wave 4 exit test.
 */
import { MINUTE, done, labModes, refused, syntheticLab, type Result } from './contract.ts';

export type LabOrder = {
 readonly labOrderRef: string; readonly subjectRef: string; readonly serviceRequestRef: string; readonly collectionMode: string;
 readonly orderedByRef: string; readonly orderedAt: number;
 readonly resultEntryRef: string | null; readonly resultAt: number | null; readonly alertRung: number | null; readonly rungSettingsVersion: number | null;
 readonly acknowledgedAt: number | null; readonly acknowledgedByRef: string | null; readonly closedAt: number | null;
};

export const labStateOf = (o: LabOrder): string =>
 o.closedAt !== null ? 'closed' : o.acknowledgedAt !== null ? 'acknowledged' : o.resultEntryRef !== null ? 'result-received' : 'ordered';

export function placeOrder(input: { labOrderRef: string; subjectRef: string; serviceRequestRef: string; collectionMode: string; orderedByRef: string }, now: number): Result<LabOrder> {
 /* A mode nobody serves, and a mode nobody offers, are both an order to nobody. */
 const mode = labModes.find(m => m.id === input.collectionMode);
 if (!mode || mode.servedBy === null) return refused('lab-not-contracted');
 return done({
  ...input, orderedAt: now, resultEntryRef: null, resultAt: null, alertRung: null, rungSettingsVersion: null,
  acknowledgedAt: null, acknowledgedByRef: null, closedAt: null
 }, [{ key: 'lab.order.placed@1', payload: { labOrderRef: input.labOrderRef, orderedByRef: input.orderedByRef } }]);
}

/** Whether the synthetic laboratory has a result for this order by now. A real laboratory's never arrives here. */
export const syntheticResultDue = (o: LabOrder, now: number): boolean =>
 o.resultEntryRef === null && labModes.find(m => m.id === o.collectionMode)?.servedBy === syntheticLab.id && now >= o.orderedAt + syntheticLab.turnaroundMinutes * MINUTE;

/** A result reference, and the rung its concern is raised on, which the order keeps. */
export function receiveResult(o: LabOrder, input: { resultEntryRef: string; rung: number; settingsVersion: number }, now: number): Result<LabOrder> {
 const received: LabOrder = { ...o, resultEntryRef: input.resultEntryRef, resultAt: now, alertRung: input.rung, rungSettingsVersion: input.settingsVersion };
 return done(received, [{ key: 'lab.result.received@1', payload: { labOrderRef: o.labOrderRef, resultEntryRef: input.resultEntryRef } }]);
}

/** What Medicines keeps when Clinical says the result was acknowledged. The first acknowledgement stands. */
export const acknowledged = (o: LabOrder, byRef: string, now: number): LabOrder =>
 o.acknowledgedAt !== null ? o : { ...o, acknowledgedAt: now, acknowledgedByRef: byRef };

export function close(o: LabOrder, now: number): Result<LabOrder> {
 if (o.closedAt !== null) return refused('lab-order-closed');
 if (o.resultEntryRef === null) return refused('no-result-yet');
 if (o.acknowledgedAt === null) return refused('lab-result-complete-before-acknowledgement');
 return done({ ...o, closedAt: now });
}
