/* What Clinical Intelligence reads, and the one way it says no.
 *
 * Every frame, registry and word here is read from a contract: the inbox, the consultation frame, triage,
 * Home Guidance and outcome questions from packages/catalog/clinical.json; the consultation's headings and
 * which of their sections are required from packages/catalog/records.json; which protocol versions exist and
 * which are ratified from packages/catalog/protocols.json; which roles are clinical from
 * packages/catalog/vetting.json. Nothing in this directory names a protocol, a heading, a priority, a script, an
 * instrument or a role.
 *
 * NO CLINICAL CONTENT. The registries this file hands out — the triage protocols, the guidance scripts, the
 * outcome instruments — are empty until the clinical governance board fills them, and this file never adds to
 * them. A red flag, a threshold, a priority scale, a script's words and a question are the board's; the frames
 * name where they would go, and the gates refuse while they are not there.
 *
 * A refusal is looked up by id, never written here. Its sentence is the one packages/catalog/apis/clinical.json
 * declares on a live route or for the engine, so the sentence the runtime answers with and the sentence the web
 * preview shows are one string. An id declared nowhere throws, because a refusal with no sentence is a screen
 * that says nothing at the moment it matters.
 *
 * The web preview runs this directory in the browser, so it holds no store, no clock and no node: time is epoch
 * milliseconds handed in. Zero dependencies and apps/api's type-stripping rules.
 */
import clinical from '../../../../catalog/clinical.json' with { type: 'json' };
import api from '../../../../catalog/apis/clinical.json' with { type: 'json' };
import protocols from '../../../../catalog/protocols.json' with { type: 'json' };
import records from '../../../../catalog/records.json' with { type: 'json' };
import vetting from '../../../../catalog/vetting.json' with { type: 'json' };

export const contract = clinical;
/** A unit, not a policy. */
export const DAY = 86_400_000;

export type Refusal = { readonly id: string; readonly status: number; readonly statement: string };
/** An event to publish, and the protocol version its envelope names — only ever a ratified one. */
export type Emitted = { readonly key: `${string}@${number}`; readonly payload: Readonly<Record<string, unknown>>; readonly protocolVersion?: string };
export type Done<T> = { readonly ok: true; readonly value: T; readonly emits: readonly Emitted[] };
export type Refused = { readonly ok: false; readonly refusal: Refusal };
export type Result<T> = Done<T> | Refused;

type Declared = { id: string; status: number; statement: string };
const declared = new Map<string, Refusal>();
for (const r of [
 ...(api.refusals as Declared[]),
 ...(api.routes as { refusals: Declared[]; withdrawn?: unknown }[]).filter(route => !route.withdrawn).flatMap(route => route.refusals)
]) {
 const seen = declared.get(r.id);
 if (seen && seen.statement !== r.statement) throw new Error(`packages/catalog/apis/clinical.json declares "${r.id}" in two different sentences. One refusal is one sentence.`);
 declared.set(r.id, { id: r.id, status: r.status, statement: r.statement });
}

export function refusal(id: string): Refusal {
 const found = declared.get(id);
 if (!found) throw new Error(`packages/catalog/apis/clinical.json declares no live refusal "${id}", so there is no sentence to refuse with.`);
 return found;
}
export const refused = (id: string): Refused => ({ ok: false, refusal: refusal(id) });
export const done = <T>(value: T, emits: readonly Emitted[] = []): Done<T> => ({ ok: true, value, emits });

/* ---- The protocol register ------------------------------------------------------------------------- */

type Protocol = { readonly id: string; readonly name: string; readonly engine: string; readonly version: number; readonly status: string };
export type Register = readonly Protocol[];
/** The register as packages/catalog/protocols.json holds it. A test may hand the domain another one; nothing else does. */
export const register: Register = protocols.protocols as Protocol[];
export const versionIdOf = (p: Protocol) => `${p.id}@${p.version}`;
export const protocolAt = (versionId: unknown, from: Register = register): Protocol | undefined =>
 typeof versionId === 'string' ? from.find(p => versionIdOf(p) === versionId) : undefined;
/** Ratified in the register today. A version the register does not hold is not ratified. */
export const isRatified = (versionId: unknown, from: Register = register): boolean => protocolAt(versionId, from)?.status === 'ratified';
export const protocolName = (versionId: string): string => protocolAt(versionId)?.name ?? versionId;

/* ---- The inbox ----------------------------------------------------------------------------------------- */

type Mode = { readonly code: string; readonly label: string; readonly sentence: string; readonly noProtocolSentence?: string };
export const signingModes: readonly Mode[] = clinical.reviews.signingModes;
const modeOf = (code: string): Mode => {
 const found = signingModes.find(mode => mode.code === code);
 if (!found) throw new Error(`packages/catalog/clinical.json has lost the signing mode "${code}", so a review would have no honest way to be signed.`);
 return found;
};
/** Signed under the ratified protocol the visit named. */
export const UNDER_PROTOCOL = modeOf('under-ratified-protocol').code;
/** Reviewed outside any protocol, which is what a draft, or none, allows. */
export const OUTSIDE_PROTOCOL = modeOf('outside-any-protocol').code;
export const modeLabel = (code: string) => signingModes.find(mode => mode.code === code)?.label ?? code;
/** The sentence a signature carries: which protocol it follows, or that it follows none and why. */
export function signedAsSentence(code: string, visitProtocol: string | null): string {
 const mode = modeOf(code);
 const named = visitProtocol ? protocolName(visitProtocol) : null;
 if (!named) return mode.noProtocolSentence ?? mode.sentence;
 return mode.sentence.replace('{protocol}', `${named} (${visitProtocol})`);
}
export const reviewStates: readonly { code: string; label: string }[] = clinical.reviews.states;
export const WAITING = reviewStates[0]!.code;
export const SIGNED = reviewStates[1]!.code;

/* The roles on the vetting register that are clinical for the purpose of confirming a review: they hold every
   capability clinical.json names. The review-confirmer setting may name no other. */
type RoleRow = { readonly id: string; readonly grants?: readonly { readonly capability: string }[] };
export const clinicalRoleHolds: readonly string[] = clinical.reviews.clinicalRoleHolds;
export const clinicalRoles: readonly string[] = (vetting.roles as readonly RoleRow[])
 .filter(role => clinicalRoleHolds.every(capability => (role.grants ?? []).some(grant => grant.capability === capability)))
 .map(role => role.id);

/* ---- The consultation frame ------------------------------------------------------------------------- */

type Heading = { readonly code: string; readonly name: string; readonly detail: string; readonly required: boolean };
const sectionRequired = new Map((records.consultation.sections as { id: string; required: boolean }[]).map(s => [s.id, s.required]));
const covers = clinical.consultation.covers as Readonly<Record<string, readonly string[]>>;
/* A heading is required when a section it covers is required in records.json — worked out, not written again. */
export const frame: readonly Heading[] = (records.consultation.soap as { id: string; name: string; detail: string }[]).map(h => {
 const sections = covers[h.id];
 if (!sections?.length) throw new Error(`packages/catalog/clinical.json consultation.covers says nothing about the heading "${h.id}", so whether it is required could not be worked out.`);
 for (const id of sections) if (!sectionRequired.has(id)) throw new Error(`packages/catalog/clinical.json says the heading "${h.id}" covers "${id}", which packages/catalog/records.json consultation.sections does not hold.`);
 return { code: h.id, name: h.name, detail: h.detail, required: sections.some(id => sectionRequired.get(id) === true) };
});
export const requiredHeadings: readonly string[] = frame.filter(h => h.required).map(h => h.code);

/* ---- Wording addressed to a patient ------------------------------------------------------------------ */

export const patientWording = clinical.wording.patientDiagnosis;
const normalised = (text: string) => text.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ');
/** The phrase in this text that tells a patient they have a condition, or null. A phrase, never a condition's name. */
export const diagnosisTold = (text: string): string | null => {
 const said = normalised(text);
 return patientWording.phrases.find(phrase => said.includes(phrase)) ?? null;
};

/* ---- Triage, Home Guidance and outcome questions ----------------------------------------------------- */

export const triage = clinical.triage;
/** The protocols the board has named as triage protocols. Empty until it does. */
export const triageProtocolIds: readonly string[] = clinical.triage.triageProtocols.ids;
export const notTriaged = clinical.triage.notTriaged;

type Outcome = { readonly code: string; readonly label: string; readonly scriptRef: string | null };
export type Script = { readonly scriptRef: string; readonly outcomeCode: string; readonly protocolVersionId: string; readonly contentRef: string };
export const guidanceOutcomes: readonly Outcome[] = clinical.guidance.outcomes;
/** The ratified scripts. Empty until the board writes one. */
export const guidanceScripts: readonly Script[] = clinical.guidance.scripts as Script[];

export type Instrument = { readonly id: string; readonly name: string; readonly version: number; readonly chosenBy: string; readonly chosenOn: string; readonly contentRef: string };
/** The outcome instruments the board chose. Empty until it chooses one. */
export const promInstruments: readonly Instrument[] = clinical.proms.instruments as Instrument[];
