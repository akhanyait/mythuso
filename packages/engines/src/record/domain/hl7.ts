/* The HL7 v2 bridge's reading and its rules, for the Health Passport P0 and the web preview alike.
 *
 * HAND-WRITTEN, ON PURPOSE. packages/catalog/open-source.json and §15D forbid adopting a component before its
 * licence, security, maintenance, data-flow and clinical-use reviews, and no HL7 library has had one. So this reads
 * the few segments packages/catalog/hl7v2-inbound.json names and nothing else: MSH to know who sent what, PID-3 to
 * match, PV1 for an admission or a discharge, OBR and OBX for a result. A segment it does not name is not read, and
 * a field it does not name is not looked at — a note is where somebody writes a name, and this code cannot screen a
 * name out of prose, so it never reads a note.
 *
 * WHAT IT DECIDES AND WHAT IT DOES NOT. It decides from a message and the contracts: whether the message can be
 * read, which registered partner sent it, whether that partner may send this kind, whether its clock is close
 * enough, which identifiers it carries under an authority the partner may use, whether the patient segment carries
 * more than the identifier, whether a laboratory is contracted, and what FHIR an admission, a discharge or a result
 * becomes. It does not decide who the patient is — the Passport looks the identifiers up against what patients
 * linked — nor whether an order was placed, which Record heard from Medicines. And it never matches on anything but
 * PID-3: the one function that reads identifiers reads field 3 of PID and no other field, and the build reads its
 * body to hold it there.
 *
 * Time is epoch milliseconds handed in by the caller, so a test is a clock. Every refusal is an id whose sentence is
 * packages/catalog/passport-gateway.json's, and whose acknowledgement code is hl7v2-inbound.json's. No enums.
 */
import contract from '../../../../catalog/hl7v2-inbound.json' with { type: 'json' };
import medicines from '../../../../catalog/medicines.json' with { type: 'json' };

export const HL7 = contract;
const MINUTE = 60_000;

export type Facility = (typeof contract.facilities)[number];
export type MessageType = {
 readonly code: string; readonly name: string; readonly from: string; readonly storesAs: string; readonly action: string;
 readonly purpose: string; readonly emits: string | null; readonly encounterStatus?: string; readonly handsTo?: string;
};
export type AckCode = 'AA' | 'AE' | 'AR';
export type RefusalId = (typeof contract.acknowledgements.refusals)[number]['refusal'];

/* ---- Reading ER7 -------------------------------------------------------------------------------------------- */

type Delimiters = { readonly field: string; readonly component: string; readonly repetition: string; readonly escape: string; readonly subcomponent: string };
type Segment = { readonly id: string; readonly raw: readonly string[] };

export type Message = {
 readonly delimiters: Delimiters;
 readonly segments: readonly Segment[];
 readonly sendingApplication: string;
 readonly sendingFacility: string;
 readonly sentAt: string;
 readonly code: string;
 readonly trigger: string;
 readonly controlId: string;
 readonly processingId: string;
 readonly version: string;
};

/* The five escapes a field may carry, decoded after the field is split, so an escaped separator never splits it. */
const decode = (value: string, d: Delimiters): string =>
 value.replace(/\\([FSTRE])\\/g, (_, code: string) => ({ F: d.field, S: d.component, T: d.subcomponent, R: d.repetition, E: d.escape })[code] ?? '');

/* Field n of a segment, undecoded. MSH counts its own field separator as field 1, which every other segment does not. */
const fieldOf = (segment: Segment | undefined, n: number): string => {
 if (!segment) return '';
 if (segment.id === 'MSH') return n === 1 ? '' : segment.raw[n - 1] ?? '';
 return segment.raw[n] ?? '';
};
const componentsOf = (value: string, d: Delimiters): string[] => value.split(d.component);
const component = (value: string, index: number, d: Delimiters): string => decode(componentsOf(value, d)[index] ?? '', d).trim();
const repetitionsOf = (value: string, d: Delimiters): string[] => value === '' ? [] : value.split(d.repetition);

export function parseMessage(text: unknown): { readonly ok: true; readonly message: Message } | { readonly ok: false; readonly refusal: 'hl7-message-unreadable' } {
 const unreadable = { ok: false as const, refusal: 'hl7-message-unreadable' as const };
 if (typeof text !== 'string') return unreadable;
 const lines = text.replace(/\r\n?/g, '\n').split('\n').filter(line => line.trim() !== '');
 if (!lines.length || lines.length > contract.parser.maxSegments || !lines[0]!.startsWith('MSH')) return unreadable;
 const header = lines[0]!;
 const field = header[3] ?? '';
 if (!field || /[A-Za-z0-9\s]/.test(field)) return unreadable;
 const encoding = header.slice(4, header.indexOf(field, 4) < 0 ? undefined : header.indexOf(field, 4));
 if (encoding.length < 4 || encoding.length > 5 || new Set([field, ...encoding]).size !== encoding.length + 1) return unreadable;
 const delimiters: Delimiters = { field, component: encoding[0]!, repetition: encoding[1]!, escape: encoding[2]!, subcomponent: encoding[3]! };
 const segments: Segment[] = [];
 for (const line of lines) {
  const id = line.slice(0, 3);
  if (!/^[A-Z][A-Z0-9]{2}$/.test(id) || (line.length > 3 && line[3] !== field)) return unreadable;
  segments.push({ id, raw: line.split(field) });
 }
 if (segments.filter(s => s.id === 'MSH').length !== 1) return unreadable;
 const msh = segments[0]!;
 const typeField = fieldOf(msh, 9);
 const message: Message = {
  delimiters, segments,
  sendingApplication: component(fieldOf(msh, 3), 0, delimiters),
  sendingFacility: component(fieldOf(msh, 4), 0, delimiters),
  sentAt: component(fieldOf(msh, 7), 0, delimiters),
  code: `${component(typeField, 0, delimiters)}^${component(typeField, 1, delimiters)}`,
  trigger: component(typeField, 1, delimiters),
  controlId: decode(fieldOf(msh, 10), delimiters).trim(),
  processingId: component(fieldOf(msh, 11), 0, delimiters),
  version: component(fieldOf(msh, 12), 0, delimiters)
 };
 if (!message.sendingApplication || !message.sendingFacility || !message.trigger || !message.controlId || !message.version.startsWith(contract.parser.versionPrefix)) return unreadable;
 return { ok: true, message };
}

/* An HL7 DTM with its offset, to minutes at least: 202609150930+0200. An instant with no offset is a claim about a
   timezone nobody stated, so it is not read as one. */
export function instantOf(value: string): { readonly ms: number; readonly iso: string } | null {
 const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:\.\d{1,4})?([+-])(\d{2})(\d{2})$/.exec(value);
 if (!m) return null;
 const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}${m[7]}${m[8]}:${m[9]}`;
 const ms = Date.parse(iso);
 return Number.isFinite(ms) ? { ms, iso } : null;
}

/* ---- Who sent it, and what it is ----------------------------------------------------------------------------- */

/** The registered partner a message's MSH-3 and MSH-4 name together, or null. */
export const facilityOf = (message: Message, facilities: readonly Facility[] = contract.facilities): Facility | null =>
 facilities.find(f => f.sendingApplication === message.sendingApplication && f.sendingFacility === message.sendingFacility) ?? null;

/** The built message type, if this facility is registered to send it. */
export function typeOf(message: Message, facility: Facility): MessageType | null {
 const type = contract.messageTypes.find(t => t.code === message.code && t.built === true) as MessageType | undefined;
 return type && type.from === facility.kind && facility.messageTypes.includes(message.code) ? type : null;
}

export const processingRefusal = (message: Message): RefusalId | null => (contract.parser.processingIdsAccepted.includes(message.processingId) ? null : 'hl7-not-synthetic');

export function clockRefusal(message: Message, now: number, skewMinutes: number): RefusalId | null {
 const sent = instantOf(message.sentAt);
 return sent && Math.abs(sent.ms - now) <= skewMinutes * MINUTE ? null : 'hl7-clock-skew';
}

/* ---- The patient ---------------------------------------------------------------------------------------------- */

export type Identifier = { readonly authority: string; readonly value: string };

/** PID-3 and nothing else: each identifier under an assigning authority this facility may use. The only reader of who
    a message is about, and the only thing a patient is ever matched on. */
export function identifiersIn(message: Message, facility: Facility): Identifier[] {
 const d = message.delimiters;
 const pid = message.segments.find(s => s.id === 'PID');
 const out: Identifier[] = [];
 for (const repetition of repetitionsOf(fieldOf(pid, 3), d)) {
  const parts = componentsOf(repetition, d);
  const value = decode(parts[0] ?? '', d).trim();
  const authority = decode((parts[3] ?? '').split(d.subcomponent)[0] ?? '', d).trim();
  if (value && facility.assigningAuthorities.includes(authority)) out.push({ authority, value });
 }
 return out;
}

/** Whether the patient segment carries any field the Passport has no consent basis to store. */
export function pidRefusal(message: Message): RefusalId | null {
 const pid = message.segments.find(s => s.id === 'PID');
 if (!pid) return null;
 const allowed = new Set<number>(contract.pid.consentBasis);
 const d = message.delimiters;
 for (let n = 1; n < pid.raw.length; n++) {
  if (allowed.has(n)) continue;
  const content = (pid.raw[n] ?? '').split(d.repetition).join('').split(d.component).join('').split(d.subcomponent).join('').trim();
  if (content !== '' && content !== '""') return 'hl7-pid-field-without-consent-basis';
 }
 return null;
}

/** Why a number may not be linked under an authority, or null. The identity number is refused before its shape. */
export function identifierRefusal(authority: string, value: string): 'identifier-authority-not-registered' | 'identifier-is-an-identity-number' | 'identifier-not-for-this-authority' | null {
 const registered = contract.assigningAuthorities.find(a => a.id === authority);
 if (!registered || !contract.facilities.some(f => f.assigningAuthorities.includes(authority))) return 'identifier-authority-not-registered';
 if (new RegExp(contract.identifierLinks.identityNumberPattern).test(value.replace(/[\s-]/g, ''))) return 'identifier-is-an-identity-number';
 return new RegExp(registered.identifierPattern).test(value) ? null : 'identifier-not-for-this-authority';
}

/* ---- An admission or a discharge ------------------------------------------------------------------------------ */

export type Visit = { readonly classCode: string | null; readonly visitNumber: string; readonly admittedAt: string | null; readonly dischargedAt: string | null };

export function visitOf(message: Message, type: MessageType): Visit | null {
 const d = message.delimiters;
 const pv1 = message.segments.find(s => s.id === 'PV1');
 if (!pv1) return null;
 const classCode = component(fieldOf(pv1, 2), 0, d) || null;
 const visitNumber = component(fieldOf(pv1, 19), 0, d);
 const admitted = component(fieldOf(pv1, 44), 0, d);
 const discharged = component(fieldOf(pv1, 45), 0, d);
 const admittedAt = admitted ? instantOf(admitted)?.iso ?? undefined : null;
 const dischargedAt = discharged ? instantOf(discharged)?.iso ?? undefined : null;
 if (!visitNumber || admittedAt === undefined || dischargedAt === undefined) return null;
 if (classCode !== null && !contract.encounters.classes.some(c => c.code === classCode)) return null;
 if (type.encounterStatus === 'in-progress' && (!classCode || !admittedAt)) return null;
 if (type.encounterStatus === 'finished' && !dischargedAt) return null;
 return { classCode, visitNumber, admittedAt, dischargedAt };
}

/** The Encounter an admission writes, or a discharge writes or revises. Who the patient is appears nowhere in it. */
export function encounterFrom(visit: Visit, type: MessageType, facility: Facility, previous: Record<string, unknown> | null = null): Record<string, unknown> {
 const kept = contract.encounters.classes.find(c => c.code === visit.classCode);
 const before = (previous?.['period'] ?? {}) as { start?: string };
 const start = visit.admittedAt ?? before.start ?? null;
 return {
  status: type.encounterStatus,
  ...(kept ? { class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: kept.fhir, display: kept.label } } : previous?.['class'] ? { class: previous['class'] } : {}),
  period: { ...(start ? { start } : {}), ...(type.encounterStatus === 'finished' && visit.dischargedAt ? { end: visit.dischargedAt } : {}) },
  serviceProvider: { display: facility.label }
 };
}

/* ---- A result -------------------------------------------------------------------------------------------------- */

export type Observed = {
 readonly code: { readonly code: string; readonly display: string; readonly system: string };
 readonly valueType: string; readonly value: string; readonly units: string; readonly range: string; readonly flag: string;
 readonly status: string; readonly verifiedBy: string;
};
export type Result = {
 readonly placerOrder: string;
 readonly service: { readonly code: string; readonly display: string; readonly system: string };
 readonly observedAt: string; readonly releasedAt: string; readonly status: string;
 readonly observations: readonly Observed[];
};

export function resultOf(message: Message): Result | null {
 const d = message.delimiters;
 const obr = message.segments.find(s => s.id === 'OBR');
 const obx = message.segments.filter(s => s.id === 'OBX');
 if (!obr || !obx.length || obx.length > contract.parser.maxObservations) return null;
 const coded = (value: string) => ({ code: component(value, 0, d), display: component(value, 1, d), system: component(value, 2, d) });
 const observedAt = instantOf(component(fieldOf(obr, 7), 0, d))?.iso;
 const releasedAt = instantOf(component(fieldOf(obr, 22), 0, d))?.iso;
 const status = contract.results.statusMap.find(s => s.code === component(fieldOf(obr, 25), 0, d))?.fhir;
 const placerOrder = component(fieldOf(obr, 2), 0, d);
 const service = coded(fieldOf(obr, 4));
 if (!placerOrder || !service.code || !observedAt || !releasedAt || !status) return null;
 const observations: Observed[] = [];
 for (const segment of obx) {
  const valueType = component(fieldOf(segment, 2), 0, d);
  const value = decode(fieldOf(segment, 5), d).trim();
  const code = coded(fieldOf(segment, 3));
  if (!['NM', 'ST', 'TX'].includes(valueType) || !code.code || !value || (valueType === 'NM' && !Number.isFinite(Number(value)))) return null;
  observations.push({
   code, valueType, value, units: component(fieldOf(segment, 6), 0, d), range: component(fieldOf(segment, 7), 0, d),
   flag: component(fieldOf(segment, 8), 0, d), status: component(fieldOf(segment, 11), 0, d), verifiedBy: component(fieldOf(segment, 16), 0, d)
  });
 }
 return { placerOrder, service, observedAt, releasedAt, status, observations };
}

/** Whoever verified every value before release, by registration; null when any value names nobody. */
export const verifierOf = (result: Result): string | null => (result.observations.every(o => o.verifiedBy) ? result.observations[0]!.verifiedBy : null);

/** Whether Medicines' contract names this laboratory as serving a collection mode. Medicines' rule, asked, not restated. */
export const laboratoryContracted = (facility: Facility): boolean =>
 facility.laboratory !== null && medicines.labs.collectionModes.some(mode => mode.servedBy === facility.laboratory);

/** The DiagnosticReport a result writes, with each value as a contained Observation. No order number, no identifier. */
export function reportFrom(result: Result): Record<string, unknown> {
 return {
  status: result.status,
  code: { coding: [{ system: result.service.system, code: result.service.code, display: result.service.display }], text: result.service.display },
  effectiveDateTime: result.observedAt,
  issued: result.releasedAt,
  contained: result.observations.map((o, index) => ({
   resourceType: 'Observation', id: `value-${index + 1}`,
   status: contract.results.statusMap.find(s => s.code === o.status)?.fhir ?? result.status,
   code: { coding: [{ system: o.code.system, code: o.code.code, display: o.code.display }], text: o.code.display },
   ...(o.valueType === 'NM' ? { valueQuantity: { value: Number(o.value), unit: o.units } } : { valueString: o.value }),
   ...(o.range ? { referenceRange: [{ text: o.range }] } : {}),
   ...(o.flag ? { interpretation: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0078', code: o.flag }] }] } : {})
  })),
  result: result.observations.map((_, index) => ({ reference: `#value-${index + 1}` }))
 };
}

export type HandOff = { readonly labOrderRef: string; readonly resultEntryRef: string; readonly labPartyRef: string; readonly releasedAt: string; readonly verifiedByRegistration: string };

/** What Medicines' intake is handed: references, a time and who verified it, and never what the result says. */
export const handOffFor = (input: { readonly labOrderRef: string; readonly resultEntryRef: string; readonly facility: Facility; readonly result: Result; readonly verifiedBy: string }): HandOff => ({
 labOrderRef: input.labOrderRef, resultEntryRef: input.resultEntryRef, labPartyRef: input.facility.laboratory ?? '', releasedAt: input.result.releasedAt, verifiedByRegistration: input.verifiedBy
});

/* ---- The acknowledgement ---------------------------------------------------------------------------------------- */

export const ackCodeOf = (refusal: string): AckCode =>
 (contract.acknowledgements.refusals.find(r => r.refusal === refusal)?.code as AckCode | undefined) ?? 'AR';

const ESCAPES: Readonly<Record<string, string>> = { '|': '\\F\\', '^': '\\S\\', '&': '\\T\\', '~': '\\R\\', '\\': '\\E\\' };
const escaped = (value: string) => value.replace(/[|^&~\\]/g, c => ESCAPES[c]!);

/** A DTM at South Africa's offset, which is the only one this product runs in. */
export function dtmOf(ms: number): string {
 const local = new Date(ms + 120 * MINUTE);
 const pad = (n: number, w = 2) => String(n).padStart(w, '0');
 return `${local.getUTCFullYear()}${pad(local.getUTCMonth() + 1)}${pad(local.getUTCDate())}${pad(local.getUTCHours())}${pad(local.getUTCMinutes())}${pad(local.getUTCSeconds())}+0200`;
}

/** An ACK, in the standard delimiters, whatever the message used: MSA-1 the code, MSA-2 its control ID, MSA-3 the sentence. */
export function acknowledgementOf(input: { readonly message: Message | null; readonly code: AckCode; readonly text: string; readonly at: number }): string {
 const m = input.message;
 const receiver = contract.acknowledgements.receiver;
 const control = m ? escaped(m.controlId) : '';
 return [
  ['MSH', '^~\\&', receiver.application, receiver.facility, escaped(m?.sendingApplication ?? ''), escaped(m?.sendingFacility ?? ''), dtmOf(input.at), '', `ACK^${escaped(m?.trigger ?? '')}^ACK`, `ACK${control}`, escaped(m?.processingId ?? ''), escaped(m?.version ?? contract.parser.versionPrefix)].join('|'),
  ['MSA', input.code, control, escaped(input.text)].join('|')
 ].join('\r');
}

/* ---- Synthetic messages, for tests and the web preview ---------------------------------------------------------- */

const segment = (...fields: string[]) => fields.join('|');
const header = (facility: Facility, code: string, controlId: string, sentAt: number, processingId: string) =>
 segment('MSH', '^~\\&', facility.sendingApplication, facility.sendingFacility, contract.acknowledgements.receiver.application, contract.acknowledgements.receiver.facility, dtmOf(sentAt), '', code, controlId, processingId, '2.5.1');
const pidOf = (identifier: Identifier | null, extra: Readonly<Record<number, string>>) => {
 const fields = Array.from({ length: 20 }, (_, n) => extra[n] ?? '');
 fields[1] = '1';
 fields[3] = identifier ? `${identifier.value}^^^${identifier.authority}^MR` : '';
 return segment('PID', ...fields.slice(1)).replace(/\|+$/, '');
};

/** A synthetic ADT A01 or A03. Every value is invented; `pid` adds fields a partner should not send, for a test of the refusal. */
export function syntheticAdt(input: {
 readonly facility: Facility; readonly trigger: 'A01' | 'A03'; readonly controlId: string; readonly sentAt: number; readonly identifier: Identifier | null;
 readonly visitNumber: string; readonly classCode?: string; readonly admittedAt?: number; readonly dischargedAt?: number;
 readonly pid?: Readonly<Record<number, string>>; readonly processingId?: string;
}): string {
 const pv1 = Array.from({ length: 46 }, () => '');
 pv1[1] = '1';
 pv1[2] = input.classCode ?? 'I';
 pv1[19] = input.visitNumber;
 if (input.admittedAt !== undefined) pv1[44] = dtmOf(input.admittedAt);
 if (input.dischargedAt !== undefined) pv1[45] = dtmOf(input.dischargedAt);
 return [header(input.facility, `ADT^${input.trigger}^ADT_${input.trigger}`, input.controlId, input.sentAt, input.processingId ?? 'D'),
  segment('EVN', input.trigger, dtmOf(input.sentAt)), pidOf(input.identifier, input.pid ?? {}), segment('PV1', ...pv1.slice(1)).replace(/\|+$/, '')].join('\r');
}

/** A synthetic ORU R01 for one lab order. The values are invented and belong to nobody. */
export function syntheticOru(input: {
 readonly facility: Facility; readonly controlId: string; readonly sentAt: number; readonly identifier: Identifier | null; readonly labOrderRef: string;
 readonly verifiedBy: string; readonly observations?: readonly { readonly code: string; readonly display: string; readonly value: string; readonly units: string; readonly range: string; readonly flag: string; readonly valueType?: string }[];
 readonly pid?: Readonly<Record<number, string>>; readonly processingId?: string; readonly status?: string;
}): string {
 const values = input.observations ?? [{ code: 'SYN-GLU', display: 'Synthetic glucose', value: '5.4', units: 'mmol/L', range: '3.9-5.6', flag: 'N' }];
 const obr = Array.from({ length: 26 }, () => '');
 obr[1] = '1';
 obr[2] = input.labOrderRef;
 obr[4] = 'SYN-PANEL^Synthetic panel^SYN';
 obr[7] = dtmOf(input.sentAt - 60 * MINUTE);
 obr[22] = dtmOf(input.sentAt);
 obr[25] = input.status ?? 'F';
 return [header(input.facility, 'ORU^R01^ORU_R01', input.controlId, input.sentAt, input.processingId ?? 'D'), pidOf(input.identifier, input.pid ?? {}),
  segment('OBR', ...obr.slice(1)).replace(/\|+$/, ''),
  ...values.map((v, index) => {
   const obx = Array.from({ length: 17 }, () => '');
   obx[1] = String(index + 1);
   obx[2] = v.valueType ?? 'NM';
   obx[3] = `${v.code}^${v.display}^SYN`;
   obx[5] = v.value;
   obx[6] = v.units;
   obx[7] = v.range;
   obx[8] = v.flag;
   obx[11] = 'F';
   obx[16] = input.verifiedBy;
   return segment('OBX', ...obx.slice(1));
  })].join('\r');
}
