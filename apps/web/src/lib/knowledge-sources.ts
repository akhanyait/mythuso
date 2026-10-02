import federation from '../../../../packages/catalog/knowledge/federation.json' with { type: 'json' };
import { overrideGate } from './demonstration-override';

/* Knowledge sources, as Governance reads them (founder's ask of 27 September and 1 October 2026: paste
   a link in the Control Tower, have it signed off, make GilbertOne's first-aid and skin answers
   stronger).

   packages/catalog/knowledge/federation.json is the authority for every source GilbertOne could ever
   ask: its licence and the verdict on it, where it is hosted, what it may and may not be used for, and
   the two signatures — the clinical reviewer's and the Information Officer's — it waits on. This file
   is the reasoning over that contract, and what it will not do is the point of it:

   - A pasted link is a PROPOSED source and nothing more. It is held in the screen's own memory, never
     fetched, never opened, never written to storage, never sent anywhere, and it is gone when the
     screen is left. Making it a source is an edit of federation.json in a reviewed commit, by a person.
   - A link that is not https, that is not a link, that names a source already in the contract or one
     already assessed and turned away, or that carries what looks like a person's ID number or email
     address, is refused with the contract's own sentence — a proposal is about a publisher, never
     about a patient.
   - No source is switched on here, whatever its state. Activation needs both signatures, a licence
     verdict that permits a commercial service's use (and the written permission where the verdict asks
     for one), and then a commit; the screen can only say which of those is missing.
   - Since 2 October 2026 the founder's demonstration override (packages/catalog/demonstration-
     override.json) opens, without the two signatures, the sources it lists whose licences permit a
     commercial service's use. The screen says which, with the override's disclaimer; it never says a
     signature exists, and it never opens a source the licence keeps off, nor a proposal nobody has
     assessed. */

export type Refusal = { readonly id: string; readonly statement: string; readonly why: string };
export type Verdict = { readonly label: string; readonly mayActivate: boolean; readonly requiresPermissionRecord?: boolean; readonly sentence: string };
export type SignatureRole = { readonly id: string; readonly label: string; readonly appointed: boolean; readonly signs: string; readonly appointmentRecord: string };
export type Signature = { readonly signedBy: string; readonly signedOn: string; readonly reference: string } | null;
export type Source = (typeof federation.sources)[number];
export type NotAdmitted = (typeof federation.assessedNotAdmitted)[number];

export const governance = federation.governance;
export const verdicts = federation.licenceVerdicts as Record<string, Verdict>;
export const signatureRoles = governance.signatures as readonly SignatureRole[];
export const sources: readonly Source[] = federation.sources;
export const notAdmitted: readonly NotAdmitted[] = federation.assessedNotAdmitted;
export const refusals = governance.refusals as readonly Refusal[];

export const refusalOf = (id: string): Refusal => {
 const found = refusals.find(r => r.id === id);
 if (!found) throw new Error(`packages/catalog/knowledge/federation.json#governance.refusals has no "${id}".`);
 return found;
};
export const verdictOf = (id: string): Verdict => {
 const found = verdicts[id];
 if (!found) throw new Error(`packages/catalog/knowledge/federation.json#licenceVerdicts has no "${id}".`);
 return found;
};

/* The signatures a source holds, keyed by role. Absent and null both mean not signed. */
export const signatureOf = (source: { signOff?: Record<string, Signature> } | null, role: string): Signature =>
 source?.signOff?.[role] ?? null;

/* Which of the activation conditions a source does not meet, as the contract's refusal ids, in the
   order a reviewer would meet them. An empty list would mean the contract allows the flag to move —
   and even then nothing on this screen moves it. */
export function activationRefusals(source: { licensing: { verdict: string; permissionRef?: string | null }; signOff?: Record<string, Signature> }): string[] {
 const out: string[] = [];
 const verdict = verdicts[source.licensing.verdict];
 if (!verdict || !verdict.mayActivate) out.push('licence-does-not-permit-activation');
 else if (verdict.requiresPermissionRecord && !source.licensing.permissionRef) out.push('permission-required-before-activation');
 if (signatureRoles.some(role => !signatureOf(source, role.id))) out.push('no-activation-without-two-signatures');
 return out;
}

/* Whether the founder's demonstration override opens a source, and how: on, or on and waiting for its
   credentials. Null when the source is signed (it needs no override), when the override does not list
   it, or when its licence does not permit a commercial service's use without written permission — the
   override never cures a licence, so the screen asks the verdict as well as the override. */
export type DemonstrationState = 'on' | 'waiting-for-credentials' | null;
export function demonstrationStateOf(source: { id: string; active?: boolean; licensing: { verdict: string } }): DemonstrationState {
 if (source.active === true) return null;
 const verdict = verdicts[source.licensing.verdict];
 if (!verdict || !verdict.mayActivate || verdict.requiresPermissionRecord) return null;
 const gate = overrideGate(`knowledge-source:${source.id}`);
 if (!gate) return null;
 return gate.state === 'waiting-for-credentials' ? 'waiting-for-credentials' : 'on';
}

/* What a source opened while waiting for credentials is waiting for, in the override's words. */
export const waitingForOf = (source: { id: string }): string => overrideGate(`knowledge-source:${source.id}`)?.waitingFor ?? '';

/* A source the licence keeps off: a verdict that never activates, or one that waits on written
   permission not on file. */
export function licenceKeepsOff(source: { licensing: { verdict: string; permissionRef?: string | null } }): boolean {
 const verdict = verdicts[source.licensing.verdict];
 return !verdict || !verdict.mayActivate || Boolean(verdict.requiresPermissionRecord && !source.licensing.permissionRef);
}

/* ---- Proposals: session memory only ---- */

export type Proposal = { readonly id: string; readonly link: string; readonly host: string; readonly licensing: { readonly verdict: string }; readonly signOff: Record<string, Signature> };
export type ProposalOutcome =
 | { readonly ok: true; readonly proposal: Proposal }
 | { readonly ok: false; readonly refusal: Refusal; readonly detail?: string };

const bareHost = (host: string) => host.toLowerCase().replace(/^www\./, '');
const sameOrUnder = (host: string, listed: string) => host === listed || host.endsWith(`.${listed}`);

/* What a person's detail looks like inside a link: a run of thirteen digits (the length of a South
   African identity number) or an email address, anywhere in the link once its escapes are undone. */
const personalDetail = (text: string): boolean => {
 let decoded = text;
 try { decoded = decodeURIComponent(text); } catch { /* a malformed escape is read as typed */ }
 return /(?<!\d)\d{13}(?!\d)/.test(decoded) || /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(decoded);
};

export function propose(text: string, held: readonly Proposal[], sequence: number): ProposalOutcome {
 const typed = text.trim();
 let url: URL;
 try { url = new URL(typed); } catch { return { ok: false, refusal: refusalOf('proposal-not-a-link') }; }
 if (!url.hostname) return { ok: false, refusal: refusalOf('proposal-not-a-link') };
 if (url.protocol !== 'https:') return { ok: false, refusal: refusalOf('proposal-not-https') };
 if (url.username || url.password || personalDetail(typed)) return { ok: false, refusal: refusalOf('proposal-carries-personal-detail') };
 const host = bareHost(url.hostname);
 /* The most specific host wins, whichever list holds it: gov.za's terms were assessed and turned away,
    and the Department of Health's guidelines under health.gov.za are a listed source of their own. */
 const match = [
  ...sources.flatMap(s => s.hosts.map((h: string) => ({ h, listed: s as Source | null, turned: null as NotAdmitted | null }))),
  ...notAdmitted.flatMap(n => n.hosts.map((h: string) => ({ h, listed: null as Source | null, turned: n as NotAdmitted | null })))
 ].filter(m => sameOrUnder(host, m.h)).sort((a, b) => b.h.length - a.h.length)[0];
 if (match?.listed) return { ok: false, refusal: refusalOf('proposal-already-listed'), detail: match.listed.name };
 if (match?.turned) return { ok: false, refusal: refusalOf('proposal-assessed-and-not-admitted'), detail: `${match.turned.name}: ${match.turned.reason}` };
 const link = url.toString();
 if (held.some(p => p.link === link)) return { ok: false, refusal: refusalOf('proposal-already-proposed') };
 return { ok: true, proposal: { id: `proposal-${sequence}`, link, host, licensing: { verdict: 'not-assessed' }, signOff: {} } };
}
