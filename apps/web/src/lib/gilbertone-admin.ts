import overview from '../../../../packages/catalog/control-tower-overview.json' with { type: 'json' };
import registry from '../../../../packages/catalog/api-registry.json' with { type: 'json' };
import providers from '../../../../packages/catalog/model-providers.json' with { type: 'json' };
import { portalContract } from './portal';

/* GilbertOne API Administration's reasoning (docs/PROMPT-CONTROL-TOWER-UI.md §7, Phase 4), read out of
 * packages/catalog/control-tower-portal.json#gilbertone and the contracts it points at.
 *
 * Three things live here so that no screen can do them its own way:
 *
 *   Which gate holds an action, and whether it is still open. An action is drawn only by naming it in
 *   the contract, and it is drawn disabled with its gate's sentence. The state of a G-numbered gate is
 *   the Overview contract's open-gates row, never a word typed on a screen.
 *
 *   What a provider's state is. There is one answer, api-registry.json's statusToday, and the Model
 *   Providers screen reads the same card the API Registry screen does, so the two cannot disagree
 *   about whether Azure OpenAI is configured.
 *
 *   What the service says about itself. The two routes answer booleans and a mode; this reads the
 *   booleans the contract lists, as true only when the answer holds the boolean true, and nothing else.
 *   A key, an endpoint or a region cannot reach a screen through here, because nothing here would
 *   carry one. The address is the page's own origin, the same constant the assistant panel uses.
 *
 * Reached only through the portal's dynamic imports, like lib/portal.ts, and the portal contract is read
 * through lib/portal.ts rather than imported again: a second importer would split the contract into a
 * chunk of its own, and its name would join the list the patient's first load carries. */

export const g1 = portalContract.gilbertone;

/* ---- Gates and actions ------------------------------------------------------------------------ */

export type Gate = (typeof g1.gates)[number];
export type Action = (typeof g1.actions)[number] & { refusal?: string; registryAction?: string };

export const gateOf = (id: string): Gate => {
 const found = g1.gates.find(g => g.id === id);
 if (!found) throw new Error(`packages/catalog/control-tower-portal.json#gilbertone.gates has no gate "${id}".`);
 return found;
};
export const actionOf = (id: string): Action => {
 const found = (g1.actions as readonly Action[]).find(a => a.id === id);
 if (!found) throw new Error(`packages/catalog/control-tower-portal.json#gilbertone.actions has no action "${id}". A GilbertOne screen draws an action only by naming it there.`);
 return found;
};
/* Whether the gate is still open, from the one register the portal reads. Module 8 has no row in a
   register; it is open by the contract's own account, and the build holds that account to the files
   it names. An action whose gate is not open throws rather than drawing itself enabled with nothing
   behind it — the build fails first, but a screen should not be the thing that finds out. */
export const gateIsOpen = (id: string): boolean => {
 if (id.startsWith('G')) {
  const row = overview.sections.find(s => s.id === 'open-gates')?.gates?.find(g => g.id === id);
  return row?.state === 'open';
 }
 return 'openWhileMissing' in gateOf(id);
};
export const refusalFor = (action: Action): string => action.refusal ?? gateOf(action.gate).sentence;
export const registryActions = (): readonly Action[] => (g1.actions as readonly Action[]).filter(a => a.registryAction);

/* ---- Providers ------------------------------------------------------------------------------- */

export type Card = (typeof registry.cards)[number] & {
 serves?: string[]; gate?: string; prohibitedFor?: string; keyRequired?: boolean; calledFrom?: string;
 detailsFrom?: string; regionFrom?: string; voicesFrom?: string;
};
export type CardStatus = (typeof registry.cardStatuses)[number];
export const cards: readonly Card[] = registry.cards as readonly Card[];
export const cardOf = (id: string): Card => {
 const found = cards.find(c => c.id === id);
 if (!found) throw new Error(`packages/catalog/api-registry.json has no card "${id}".`);
 return found;
};
export const cardStatusOf = (id: string): CardStatus => {
 const found = registry.cardStatuses.find(s => s.id === id);
 if (!found) throw new Error(`"${id}" is not one of packages/catalog/api-registry.json#cardStatuses.`);
 return found;
};
/* A model provider's state is its registry card's, and only that. */
export const providerStatus = (providerId: string): CardStatus => cardStatusOf(cardOf(providerId).statusToday);
export type Provider = (typeof providers.providers)[number] & {
 candidateRegions?: { region: string; proposedTier: string; gate: string }[]; darkWhy?: string;
};
export const modelProviders: readonly Provider[] = providers.providers as readonly Provider[];

/* Cards grouped by the contract's own categories, in the order the portal contract lists them. A card
   in a category with no label throws: a card nobody can find on the screen is a provider the screen
   could never switch off. */
export function cardsByCategory(): { id: string; label: string; cards: Card[] }[] {
 const groups = g1.apiRegistry.categories.map(c => ({ ...c, cards: cards.filter(card => card.category === c.id) }));
 const placed = new Set(groups.flatMap(g => g.cards.map(c => c.id)));
 const lost = cards.find(c => !placed.has(c.id));
 if (lost) throw new Error(`packages/catalog/api-registry.json's "${lost.id}" is in category "${lost.category}", which control-tower-portal.json#gilbertone.apiRegistry does not label.`);
 return groups.filter(g => g.cards.length);
}

/* ---- What the service says about itself -------------------------------------------------------- */

declare const __ASSISTANT_API_URL__: string;
export type RouteAnswer = { readonly answered: boolean; readonly fields: Readonly<Record<string, boolean>> };
export async function readServiceBooleans(path: string, signal: AbortSignal): Promise<RouteAnswer> {
 const base = typeof __ASSISTANT_API_URL__ === 'string' ? __ASSISTANT_API_URL__ : '';
 const wanted = g1.overview.fields.map(f => f.field);
 try {
  const response = await fetch(`${base}${g1.overview.prefix}${path}`, { signal, headers: { accept: 'application/json' } });
  if (!response.ok) return { answered: false, fields: {} };
  const body = await response.json() as Record<string, unknown>;
  return { answered: true, fields: Object.fromEntries(wanted.map(f => [f, body[f] === true])) };
 } catch {
  return { answered: false, fields: {} };
 }
}
/* The Overview contract's three rules for the assistant — connected, degraded, disconnected — applied
   to one route's answer, so this screen and the portal's own Overview say the same word. */
export const serviceStateOf = (answer: RouteAnswer): string =>
 !answer.answered || !answer.fields.ok ? 'disconnected' : answer.fields.activated ? 'connected' : 'degraded';
