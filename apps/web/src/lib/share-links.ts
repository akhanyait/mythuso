import { useSyncExternalStore } from 'react';
import consent from '../../../../packages/catalog/consent.json';
import gateway from '../../../../packages/catalog/passport-gateway.json';
import records from '../../../../packages/catalog/records.json';
import sharing from '../../../../packages/catalog/passport-sharing.json';
import {
 EMERGENCY_SCOPE, defaultScopeFor, isSealedCategory, linkTermsFor, useRefusal, type GrantTerms, type LinkKindId, type LinkTerms
} from '../../../../packages/engines/src/record/domain/links.ts';
import { recordSettingsNow } from './settings';

/* The Health Passport's share links, emergency card and access log, in the web preview.
 *
 * What a link may be is packages/engines/src/record/domain/links.ts's — the same function the Passport P0 asks
 * before it stores one — and how long a link lasts and how often it opens are the Record settings in force, read
 * through lib/settings.ts once when the link is made and kept by the link. Every sentence a refusal or a log entry
 * shows is packages/catalog/passport-gateway.json's, and every label passport-sharing.json's. What this file adds is
 * only what a preview needs and the service does not: the grants and the log a patient starts from, from
 * passport-sharing.json's preview block, and a place in this tab's memory to keep what the patient makes. Nothing
 * is kept anywhere else, a reload puts the preview back, and no link, code or card reaches anybody.
 *
 * Only the screens that are behind a dynamic import read this file, because it carries four contracts and the
 * patient's first view needs none of them.
 */

const DAY = 86_400_000;
const HOUR = 3_600_000;
const openedAt = Date.now();

export const say = sharing.screens;
export const logWords = sharing.accessLog;
export const exportContract = sharing.export;

type Reason = { readonly statement?: string; readonly refusal?: string; readonly breakGlass?: string };

export type Grant = {
 readonly ref: string;
 readonly recipientRole: string;
 readonly recipientName: string;
 readonly scope: readonly string[];
 readonly purpose: string;
 readonly sealedIncluded: boolean;
 readonly expiresAt: number;
};
export type Link = {
 readonly ref: string;
 readonly code: string;
 readonly grant: Grant;
 readonly terms: LinkTerms;
 readonly madeAt: number;
 readonly revokedAt: number | null;
 readonly uses: number;
};
export type Entry = {
 readonly id: string;
 readonly at: number;
 readonly requesterRole: string;
 readonly action: string;
 readonly purpose: string | null;
 readonly outcome: 'granted' | 'refused';
 readonly reason: string;
 readonly breakGlass: boolean;
 readonly reviewDueAt: number | null;
};

/* ---- The contract's words --------------------------------------------------------------------- */

export function statementOf(id: string): string {
 const found = (gateway.statements as Record<string, string>)[id];
 if (!found) throw new Error(`packages/catalog/passport-gateway.json has no statement "${id}".`);
 return found;
}
export function refusalOf(id: string): string {
 const found = gateway.refusals.find(refusal => refusal.id === id);
 if (!found) throw new Error(`packages/catalog/passport-gateway.json has no refusal "${id}".`);
 return found.sentence;
}
const reasonOf = (reason: Reason): string => {
 if (reason.statement) return statementOf(reason.statement);
 if (reason.refusal) return refusalOf(reason.refusal);
 const glass = gateway.breakGlass.reasons.find(candidate => candidate.id === reason.breakGlass);
 return glass ? glass.sentence : logWords.noReason;
};
export const fill = (template: string, values: Record<string, string | number>): string =>
 template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole));

export const roleLabel = (id: string): string =>
 consent.grants.recipientRoles.find(role => role.id === id)?.name ?? logWords.roleLabels.find(role => role.id === id)?.label ?? id;
export const actionLabel = (action: string): string =>
 action.endsWith(logWords.probeSuffix) ? logWords.probeLabel : logWords.actions.find(candidate => candidate.id === action)?.label ?? logWords.requestLabel;
export const outcomeLabel = (outcome: Entry['outcome']): string => logWords.outcomes.find(candidate => candidate.id === outcome)?.label ?? outcome;
export const categoryName = (id: string): string => records.records.find(record => record.id === id)?.name ?? id;
export const categoriesSaid = (ids: readonly string[]): string => ids.map(categoryName).join(', ');
export const isSealed = isSealedCategory;
export const payersSaid = sharing.links.neverTo.map(payer => payer.name.toLowerCase()).join(', ');
export const emergencyCategories: readonly string[] = gateway.emergencySummary.categories;
export const scopeName = (value: string): string => say.sharing.scopeNames.find(name => name.value === value)?.label ?? value;

/* ---- The preview's grants and log, as of the moment the tab opened ------------------------------ */

export const grants: readonly Grant[] = sharing.preview.grants.map(grant => Object.freeze({
 ref: grant.ref, recipientRole: grant.recipientRole, recipientName: roleLabel(grant.recipientRole),
 scope: grant.scope, purpose: grant.purpose, sealedIncluded: grant.sealedIncluded, expiresAt: openedAt + grant.endsInDays * DAY
}));
export const grantByRef = (ref: string): Grant | null => grants.find(grant => grant.ref === ref) ?? null;
/* The card rides on the grant made for an emergency, and on any grant that opens the emergency card if there is none. */
export const cardGrant: Grant | null =
 grants.find(grant => grant.scope.includes(EMERGENCY_SCOPE[0]!) && grant.purpose === 'emergency') ?? grants.find(grant => grant.scope.includes(EMERGENCY_SCOPE[0]!)) ?? null;
const termsOf = (grant: Grant): GrantTerms => ({ recipientRole: grant.recipientRole, scope: grant.scope, purpose: grant.purpose, sealedIncluded: grant.sealedIncluded, expiresAt: grant.expiresAt, revokedAt: null });

const atOffset = (dayOffset: number, time: string): number => {
 const day = new Date(openedAt + dayOffset * DAY);
 const [hours, minutes] = time.split(':').map(Number);
 day.setHours(hours ?? 0, minutes ?? 0, 0, 0);
 return day.getTime();
};
const previewLog: readonly Entry[] = sharing.preview.accessLog.map((entry, index) => {
 const at = atOffset(entry.dayOffset, entry.time);
 return Object.freeze({
  id: `preview-${index}`, at, requesterRole: entry.requesterRole, action: entry.action, purpose: entry.purpose ?? null,
  outcome: entry.outcome as Entry['outcome'], reason: reasonOf(entry.reason), breakGlass: entry.breakGlass === true,
  reviewDueAt: typeof entry.reviewDueInHours === 'number' ? at + entry.reviewDueInHours * HOUR : null
 });
});

/* ---- What the patient makes, in this tab's memory ---------------------------------------------- */

type State = { readonly links: readonly Link[]; readonly entries: readonly Entry[] };
let state: State = Object.freeze({ links: Object.freeze([]), entries: Object.freeze([]) });
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const current = () => state;
const put = (next: State) => { state = Object.freeze(next); for (const listener of listeners) listener(); };
export const useSharing = () => useSyncExternalStore(subscribe, current, current);

let entryCount = 0;
const entry = (fields: Omit<Entry, 'id' | 'breakGlass' | 'reviewDueAt'>): Entry =>
 Object.freeze({ ...fields, id: `made-${++entryCount}`, breakGlass: false, reviewDueAt: null });

/** Every entry, the preview's and the ones made here, newest first — as the patient reads their log. */
export const logOf = (made: readonly Entry[]): Entry[] => [...made, ...previewLog].sort((a, b) => b.at - a.at);

/* The code a card or a link shows in the preview: random, from an alphabet without the characters people misread,
   and behind nothing. crypto.getRandomValues rather than Math.random, so the preview does not teach the pattern of
   a code that could be guessed. */
export function previewCode(): string {
 const { alphabet, groups, groupLength } = sharing.links.previewCode;
 const picked = new Uint32Array(groups * groupLength);
 crypto.getRandomValues(picked);
 const characters = [...picked].map(n => alphabet[n % alphabet.length]!);
 return Array.from({ length: groups }, (_, g) => characters.slice(g * groupLength, (g + 1) * groupLength).join('')).join('-');
}
export const qrTextFor = (code: string): string => sharing.links.qrPayload.replace('{code}', code);

/** What a link on this grant would open if the patient chose nothing, from the default in force. */
export const defaultScopeNow = (grant: Grant, kindCode: LinkKindId): string[] => defaultScopeFor(kindCode, termsOf(grant), recordSettingsNow());

/** What a link made now would be, without making it — so the screen shows the end and the uses before the patient presses. */
export const wouldBe = (grant: Grant, kindCode: LinkKindId, scope?: readonly string[], sealedIncluded = false, now = Date.now()) =>
 linkTermsFor({ recipientRole: grant.recipientRole, kindCode, scope, sealedIncluded }, termsOf(grant), recordSettingsNow(), now);

export type Made = { readonly ok: true; readonly link: Link } | { readonly ok: false; readonly refusal: string };

export function makeLink(grant: Grant, kindCode: LinkKindId, scope?: readonly string[], sealedIncluded = false, now = Date.now()): Made {
 const decided = wouldBe(grant, kindCode, scope, sealedIncluded, now);
 if (!decided.ok) {
  const refusal = refusalOf(decided.refusal);
  put({ ...state, entries: [entry({ at: now, requesterRole: 'patient', action: 'share.link.create', purpose: grant.purpose, outcome: 'refused', reason: refusal }), ...state.entries] });
  return { ok: false, refusal };
 }
 const link: Link = Object.freeze({ ref: `link-${state.links.length + 1}`, code: previewCode(), grant, terms: decided.value, madeAt: now, revokedAt: null, uses: 0 });
 put({
  links: [link, ...state.links],
  entries: [entry({ at: now, requesterRole: 'patient', action: 'share.link.create', purpose: grant.purpose, outcome: 'granted', reason: statementOf('patientSession') }), ...state.entries]
 });
 return { ok: true, link };
}

export type Opened = { readonly ok: true; readonly categories: readonly string[]; readonly usesLeft: number } | { readonly ok: false; readonly refusal: string };

/* A use, as the recipient of the grant would make it: counted, and written into the log whichever way it goes. */
export function openLink(ref: string, now = Date.now()): Opened {
 const link = state.links.find(candidate => candidate.ref === ref);
 if (!link) return { ok: false, refusal: refusalOf('link-not-recognised') };
 const refused = useRefusal({ revokedAt: link.revokedAt, expiresAt: link.terms.expiresAt, usesAllowed: link.terms.usesAllowed }, link.uses, { revokedAt: null, expiresAt: link.grant.expiresAt }, now);
 const common = { at: now, requesterRole: link.terms.recipientRole, action: 'share.link.use', purpose: link.terms.purpose };
 if (refused) {
  const refusal = refusalOf(refused);
  put({ ...state, entries: [entry({ ...common, outcome: 'refused', reason: refusal }), ...state.entries] });
  return { ok: false, refusal };
 }
 const used: Link = Object.freeze({ ...link, uses: link.uses + 1 });
 put({ links: state.links.map(candidate => (candidate.ref === ref ? used : candidate)), entries: [entry({ ...common, outcome: 'granted', reason: statementOf('linkUsed') }), ...state.entries] });
 return { ok: true, categories: link.terms.scope, usesLeft: used.terms.usesAllowed - used.uses };
}

export function revokeLink(ref: string, now = Date.now()): void {
 const link = state.links.find(candidate => candidate.ref === ref);
 if (!link || link.revokedAt !== null) return;
 put({
  links: state.links.map(candidate => (candidate.ref === ref ? Object.freeze({ ...candidate, revokedAt: now }) : candidate)),
  entries: [entry({ at: now, requesterRole: 'patient', action: 'share.link.revoke', purpose: null, outcome: 'granted', reason: statementOf('patientSession') }), ...state.entries]
 });
}
