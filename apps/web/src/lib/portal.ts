import portal from '../../../../packages/catalog/control-tower-portal.json' with { type: 'json' };
import overview from '../../../../packages/catalog/control-tower-overview.json' with { type: 'json' };
import { simulationOf } from './capabilities';
import { ROLE_PARAM, slugOfSection, type RoleId } from './roles';

/* The merged Control Tower's reasoning, read out of packages/catalog/control-tower-portal.json.
 *
 * Where the reader is lives in the address and nowhere else: the role (lib/roles.ts), then the
 * category, the tab, the site and the period. That is the same rule the role follows and for the same
 * two reasons — the preview may keep nothing in the browser, and a link has to open the screen it
 * says it opens. So this module is mostly a pair of pure functions between a query string and a place
 * in the portal, and the shell calls nothing else to find out where it is.
 *
 * This file is only ever reached through the portal's dynamic import. It imports two contracts whole,
 * and the patient's first load must not carry either: apps/web/src/lib/roles.ts is on that first load
 * and holds only the role table, which is why the portal's own parameter names are not written there. */

export const portalContract = portal;
export type Category = (typeof portal.categories)[number];
export type Tab = Category['tabs'][number] & { heading?: string; blurb?: string; legacy?: string; headsItself?: boolean; new?: boolean };

export const categories: readonly Category[] = portal.categories;
export const categoryById = (id: string): Category => {
 const found = categories.find(c => c.id === id);
 if (!found) throw new Error(`packages/catalog/control-tower-portal.json has no category "${id}".`);
 return found;
};
export const tabsOf = (category: Category): readonly Tab[] => category.tabs as readonly Tab[];
export const tabOf = (category: Category, id: string): Tab => {
 const found = tabsOf(category).find(t => t.id === id);
 if (!found) throw new Error(`The ${category.label} category has no tab "${id}".`);
 return found;
};
export const headingOf = (tab: Tab) => tab.heading ?? tab.label;

/* ---- The one status vocabulary ----------------------------------------------------------------
 *
 * Read from the Overview's contract and never declared here. A service is never "green" on one
 * screen and "operational" on another (§5.2), and the way that stays true is that no portal file owns
 * a list of status words: scripts/check-boundaries.mjs fails one that does. An id the contract does
 * not hold throws, loudly, rather than drawing a word nobody defined. */
export type StatusWord = { readonly id: string; readonly sentence: string };
export const statusVocabulary: readonly StatusWord[] = overview.statusVocabulary;
export const statusOf = (id: string): StatusWord => {
 const found = statusVocabulary.find(s => s.id === id);
 if (!found) throw new Error(`"${id}" is not in packages/catalog/control-tower-overview.json#statusVocabulary. The portal has one vocabulary.`);
 return found;
};
/* And the plan's §2 words for how far a thing is built, held to the plan's own table by the build. */
export const buildVocabulary: readonly StatusWord[] = portal.buildVocabulary;
export const buildWordOf = (id: string): StatusWord => {
 const found = buildVocabulary.find(s => s.id === id);
 if (!found) throw new Error(`"${id}" is not one of the plan's status words (docs/PROMPT-CONTROL-TOWER-UI.md §2).`);
 return found;
};

/* ---- Where the reader is --------------------------------------------------------------------- */

export type ContextId = 'site' | 'period';
export type PortalPlace = {
 readonly category: string;
 readonly tab: string;
 readonly site: string;
 readonly period: string;
 /** A tenant was asked for in the address. It is ignored, and the screen says why. */
 readonly tenantAsked: boolean;
 /** The address carried no category: an old bookmark to one of the two surfaces the portal replaced. */
 readonly fromOldAddress: boolean;
};

const params = portal.context.params;
const paramOf = (id: string) => {
 const found = params.find(p => p.id === id);
 if (!found) throw new Error(`packages/catalog/control-tower-portal.json#context has no parameter "${id}".`);
 return found;
};
export const contextParam = paramOf;
const valueOr = (id: ContextId, asked: string | null): string => {
 const p = paramOf(id);
 return p.values.some(v => v.id === asked) ? asked as string : p.default as string;
};

/* Every old tab and section, by the slug of its own name, and where it lives now. A category
   parameter written the old way — ?category=operations, ?category=audit-exports — lands on the new
   place rather than on nothing. */
type LegacyAddress = (typeof portal.legacyAddresses)[number];
export const legacyAddresses: readonly LegacyAddress[] = portal.legacyAddresses;
const legacyName = (entry: LegacyAddress) => entry.legacy.slice(entry.legacy.indexOf(':') + 1);
export const legacyTarget = (surface: 'control-tower' | 'back-office', name: string): LegacyAddress => {
 const found = legacyAddresses.find(e => e.legacy === `${surface}:${name}`);
 if (!found) throw new Error(`packages/catalog/control-tower-portal.json#legacyAddresses has nowhere for ${surface}'s "${name}".`);
 return found;
};

const landingOf = (role: RoleId) => {
 const landing = (portal.roleLanding as Record<string, { category: string; tab: string } | string>)[role];
 if (!landing || typeof landing === 'string') throw new Error(`packages/catalog/control-tower-portal.json#roleLanding has no landing for "${role}".`);
 return landing;
};

export function placeFromSearch(search: string, role: RoleId): PortalPlace {
 const query = new URLSearchParams(search);
 const askedCategory = query.get(portal.context.categoryParam);
 const landing = landingOf(role);
 let category = landing.category;
 let tab: string | null = askedCategory ? null : landing.tab;
 if (askedCategory) {
  /* An old name first, read against the surface the role belonged to, when no tab says otherwise:
     ?role=back-office&category=overview is the back office's Overview — the funding view — while
     ?role=control-tower&category=overview is the portal's own. Then a category of the portal's own,
     then an old name from either surface. */
  const ownOld = query.has(portal.context.tabParam) ? null
   : legacyAddresses.find(e => e.legacy.startsWith(`${role}:`) && slugOfSection(legacyName(e)) === askedCategory);
  const direct = categories.find(c => c.id === askedCategory);
  const old = ownOld ?? (direct ? null : legacyAddresses.find(e => slugOfSection(legacyName(e)) === askedCategory));
  if (old) { category = old.category; tab = old.tab; }
  else if (direct) category = direct.id;
 }
 const cat = categoryById(category);
 const askedTab = query.get(portal.context.tabParam);
 const resolvedTab = tabsOf(cat).find(t => t.id === askedTab)?.id ?? tab ?? tabsOf(cat)[0]!.id;
 return {
  category, tab: resolvedTab,
  site: valueOr('site', query.get('site')),
  period: valueOr('period', query.get('period')),
  tenantAsked: query.has('tenant'),
  fromOldAddress: !askedCategory
 };
}

/* The address of a place. The role stays whatever brought the reader here; the defaults are left
   out, so the address a person shares is as short as the place allows. */
export function searchForPlace(role: RoleId, place: Pick<PortalPlace, 'category' | 'tab' | 'site' | 'period'>): string {
 const query = new URLSearchParams();
 query.set(ROLE_PARAM, role);
 query.set(portal.context.categoryParam, place.category);
 query.set(portal.context.tabParam, place.tab);
 if (place.site !== paramOf('site').default) query.set('site', place.site);
 if (place.period !== paramOf('period').default) query.set('period', place.period);
 return `?${query.toString()}`;
}

/* Where an old surface's section now lives, as an address — the legacy read-only shells link to it. */
export function portalSearchForLegacy(surface: 'control-tower' | 'back-office', name: string): string {
 const target = legacyTarget(surface, name);
 return searchForPlace(surface, { category: target.category, tab: target.tab, site: paramOf('site').default as string, period: paramOf('period').default as string });
}

/* ---- Sentences the portal reads from other contracts ------------------------------------------ */

/* The switcher's own refusal from packages/catalog/capabilities.json, found by the words the portal
   contract says it starts with. Reworded there, this throws, and the portal stops saying it in words
   nobody says any more. */
export function pickerRefusal(): string {
 const refuses = simulationOf('accounts')?.refuses ?? [];
 const found = refuses.find(s => s.startsWith(portal.previewPicker.refusalStartsWith));
 if (!found) throw new Error(`packages/catalog/capabilities.json's accounts capability no longer refuses anything starting "${portal.previewPicker.refusalStartsWith}".`);
 return found;
}
export const overviewRefusal = (id: string): string => {
 const found = overview.refusals.find(r => r.id === id);
 if (!found) throw new Error(`packages/catalog/control-tower-overview.json has no refusal "${id}".`);
 return found.statement;
};
export const portalRefusal = (id: string): string => {
 const found = portal.refusals.find(r => r.id === id);
 if (!found) throw new Error(`packages/catalog/control-tower-portal.json has no refusal "${id}".`);
 return found.statement;
};

/* A sentence with {named} holes, filled from facts read elsewhere. A hole left unfilled throws: a
   template that printed "{real}" would be a screen admitting it had not read the contract. */
export function fill(template: string, values: Record<string, string | number>): string {
 const out = template.replace(/\{(\w+)\}/g, (_, key: string) => {
  if (!(key in values)) throw new Error(`No value for {${key}} in "${template}".`);
  return String(values[key]);
 });
 return out;
}

/* ---- The one service the Overview reads live -------------------------------------------------
 *
 * GET /assistant/health answers booleans only, which is why the landing screen may read it at all
 * (control-tower-overview.json, no-secret-on-the-overview). The three rules are the contract's
 * connectedWhen, degradedWhen and disconnectedWhen, in that order. The base is the same build-time
 * constant the assistant panel uses, empty by default so the request goes to this page's own origin. */
declare const __ASSISTANT_API_URL__: string;
export type AssistantHealth = { readonly state: string; readonly fields: Record<string, boolean> };
export async function readAssistantHealth(signal: AbortSignal): Promise<AssistantHealth> {
 const base = typeof __ASSISTANT_API_URL__ === 'string' ? __ASSISTANT_API_URL__ : '';
 const service = overview.sections.find(s => s.id === 'service-state')!.services!.find(s => s.id === 'assistant')!;
 const wanted = service.fieldsRead ?? [];
 try {
  const response = await fetch(`${base}/assistant/health`, { signal, headers: { accept: 'application/json' } });
  if (!response.ok) return { state: 'disconnected', fields: {} };
  const body = await response.json() as Record<string, unknown>;
  /* Only the fields the contract names, and only as booleans. Anything else the route might grow is
     not drawn, so a field added to the health answer cannot reach this screen by accident. */
  const fields = Object.fromEntries(wanted.map(f => [f, body[f] === true]));
  if (fields.ok && fields.activated) return { state: 'connected', fields };
  if (fields.ok) return { state: 'degraded', fields };
  return { state: 'disconnected', fields };
 } catch {
  return { state: 'disconnected', fields: {} };
 }
}
