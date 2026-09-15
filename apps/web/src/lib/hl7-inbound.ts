import hl7 from '../../../../packages/catalog/hl7v2-inbound.json';
import gateway from '../../../../packages/catalog/passport-gateway.json';
import recordApi from '../../../../packages/catalog/apis/record.json';
import scheduling from '../../../../packages/catalog/scheduling.json';
import {
 clockRefusal, facilityOf, identifiersIn, laboratoryContracted, parseMessage, pidRefusal, processingRefusal, resultOf, syntheticOru, typeOf, verifierOf,
 type Facility
} from '../../../../packages/engines/src/record/domain/hl7.ts';
import { inboundInForce } from '../../../../packages/engines/src/record/domain/settings.ts';
import type { Refusal } from '../../../../packages/engines/src/medicines/domain/contract.ts';
import { inboundSettingsNow } from './settings';

/* The HL7 v2 bridge in the web preview (Wave 5): the laboratory's result a doctor acknowledges, and the development
 * quarantine an operator reads.
 *
 * THE SAME CODE AS THE PASSPORT. A result here is a real ER7 message, built for the synthetic laboratory and read by
 * packages/engines/src/record/domain/hl7.ts — the parser and rules apps/passport asks — against the registered
 * partners, the clock skew in force and the number the preview's patient linked. Only then is its reference handed to
 * Medicines' own receiveResult, so a result that arrived by HL7 is received and not acknowledged exactly as it is on
 * the engine runtime, and closes only after the clinician who ordered it acknowledges it. Nothing is sent anywhere:
 * the message is built and read in this tab.
 *
 * THE QUARANTINE HOLDS NOTHING A MESSAGE SAID, so neither does this: which registered partner sent each synthetic
 * rejection, what kind, the refusal's sentence, when it arrived and when its record goes. The deletion day is the
 * retention each record was given when it arrived — before this tab changed anything, so the contract's — and the
 * retention in force now is read from the Record settings, never typed.
 *
 * Only the clinical workspace reads this, behind its own dynamic import. It is not on the patient's first load.
 */

export const hl7Words = hl7.screens;
export const hl7Laboratory: Facility = hl7.facilities.find(facility => facility.kind === 'laboratory')!;
const DAY = 86_400_000;
const inboundRoute = recordApi.routes.find(route => route.method === 'POST' && route.path === '/hl7v2/inbound' && route.version === 1)!;

/** A refusal of the inbound route, in its contract's words, shaped as the Medicines screens render one. */
export function inboundRefusal(id: string): Refusal {
 const declared = inboundRoute.refusals.find(refusal => refusal.id === id);
 if (!declared) throw new Error(`packages/catalog/apis/record.json POST /hl7v2/inbound@1 declares no refusal "${id}".`);
 return { id, status: declared.status, statement: declared.statement };
}

export type LaboratoryResult =
 | { readonly ok: true; readonly resultEntryRef: string; readonly labPartyRef: string; readonly kind: string; readonly facility: string }
 | { readonly ok: false; readonly refusal: Refusal };

let sent = 0;
/** The synthetic laboratory's ORU for one order, built and judged in the Passport's own order. `placed` is what Record
    heard placed: in the preview, the orders this tab holds. */
export function laboratoryResult(input: { readonly labOrderRef: string; readonly placed: (labOrderRef: string) => boolean; readonly now: number }): LaboratoryResult {
 const refused = (id: string): LaboratoryResult => ({ ok: false, refusal: inboundRefusal(id) });
 sent += 1;
 const linked = { authority: hl7.preview.patient.authority, value: hl7.preview.patient.identifier };
 const parsed = parseMessage(syntheticOru({ facility: hl7Laboratory, controlId: `SYN-PREVIEW-${sent}`, sentAt: input.now, identifier: linked, labOrderRef: input.labOrderRef, verifiedBy: hl7.preview.verifiedBy }));
 if (!parsed.ok) return refused(parsed.refusal);
 const message = parsed.message;
 const facility = facilityOf(message);
 if (!facility) return refused('hl7-facility-not-registered');
 const notSynthetic = processingRefusal(message);
 if (notSynthetic) return refused(notSynthetic);
 const type = typeOf(message, facility);
 if (!type) return refused('hl7-message-type-not-built');
 if (!laboratoryContracted(facility)) return refused('hl7-laboratory-not-contracted');
 const skewed = clockRefusal(message, input.now, inboundSettingsNow().clockSkewMinutes);
 if (skewed) return refused(skewed);
 if (!identifiersIn(message, facility).some(id => id.authority === linked.authority && id.value === linked.value)) return refused('hl7-patient-not-matched');
 const pid = pidRefusal(message);
 if (pid) return refused(pid);
 const result = resultOf(message);
 if (!result) return refused('hl7-message-unreadable');
 if (!verifierOf(result)) return refused('hl7-result-without-verifier');
 if (!input.placed(result.placerOrder)) return refused('hl7-lab-order-not-placed');
 return { ok: true, resultEntryRef: `hl7-result-preview-${sent}`, labPartyRef: facility.laboratory ?? '', kind: message.code, facility: facility.label };
}

/* ---- The development quarantine ---------------------------------------------------------------------------------- */

export type QuarantineItem = { readonly ref: string; readonly facility: string; readonly kind: string | null; readonly reason: string; readonly receivedAt: number; readonly purgeAfter: number };

const sentenceOf = (id: string): string => gateway.refusals.find(refusal => refusal.id === id)?.sentence ?? id;
const atOffset = (now: number, dayOffset: number, time: string): number => {
 const day = new Date(now + dayOffset * DAY);
 const [hours, minutes] = time.split(':').map(Number);
 day.setHours(hours ?? 0, minutes ?? 0, 0, 0);
 return day.getTime();
};

/** The synthetic rejections, each with the deletion day it was given when it arrived, and none whose day has passed. */
export function previewQuarantine(now: number): QuarantineItem[] {
 const given = inboundInForce([]);
 return hl7.preview.quarantine.map((item, index) => {
  const receivedAt = atOffset(now, item.dayOffset, item.time);
  return {
   ref: `quarantine-preview-${index + 1}`,
   facility: hl7.facilities.find(facility => facility.id === item.facility)?.label ?? hl7Words.quarantine.unknownFacility,
   kind: item.messageType, reason: sentenceOf(item.refusal), receivedAt, purgeAfter: receivedAt + given.quarantineRetentionDays * DAY
  };
 }).filter(item => item.purgeAfter > now);
}

/** The quarantine retention in force now, for the sentence that says what records are kept for. */
export const retentionDaysNow = (): number => inboundSettingsNow().quarantineRetentionDays;

export const whenOf = (at: number): string => new Date(at).toLocaleString('en-ZA', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: scheduling.timezone });
export const fillHl7 = (sentence: string, values: Record<string, string | number>): string => sentence.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole));
