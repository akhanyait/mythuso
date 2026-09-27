import overview from '../../../../packages/catalog/control-tower-overview.json' with { type: 'json' };
import registry from '../../../../packages/catalog/api-registry.json' with { type: 'json' };
import providers from '../../../../packages/catalog/model-providers.json' with { type: 'json' };
import voice from '../../../../packages/catalog/voice.json' with { type: 'json' };
import { portalContract } from './portal';
import { applyChange, presentationVoiceNow, settingsEngineOf, type PresentationVoiceInForce, type Proposed } from './settings';

/* GilbertOne API Administration's reasoning (docs/PROMPT-CONTROL-TOWER-UI.md §7, Phase 4), read out of
 * packages/catalog/control-tower-portal.json#gilbertone and the contracts it points at.
 *
 * Four things live here so that no screen can do them its own way:
 *
 *   Which gate holds an action, and whether it is still open — or, since the founder's decision of
 *   27 September 2026, whether the action is live. An action is drawn only by naming it in the
 *   contract. A gated action is drawn disabled with its gate's sentence; a live one carries the
 *   founder's dated record and its own sentence, and is refused here without all three. The state of
 *   a G-numbered gate is the Overview contract's open-gates row, never a word typed on a screen.
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
 *   What the Voice screen may change and ask. The presentation voice is the assistant engine's
 *   setting, changed through lib/settings.ts with a reason like every other setting, and the preview's
 *   one request is the service's own speak route, at the path and version the contract names — the
 *   only request this module makes that is not a status read, and the build counts them.
 *
 * Reached only through the portal's dynamic imports, like lib/portal.ts, and the portal contract is read
 * through lib/portal.ts rather than imported again: a second importer would split the contract into a
 * chunk of its own, and its name would join the list the patient's first load carries. */

export const g1 = portalContract.gilbertone;

/* ---- Gates and actions ------------------------------------------------------------------------ */

export type Gate = (typeof g1.gates)[number];
export type Live = { readonly since: string; readonly decidedBy: string; readonly sentence: string };
export type Action = Omit<(typeof g1.actions)[number], 'gate' | 'live'> & { gate: string | null; live?: Live; refusal?: string; registryAction?: string };

export const gateOf = (id: string | null): Gate => {
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
export const gateIsOpen = (id: string | null): boolean => {
 if (id === null) return false;
 if (id.startsWith('G')) {
  const row = overview.sections.find(s => s.id === 'open-gates')?.gates?.find(g => g.id === id);
  return row?.state === 'open';
 }
 return 'openWhileMissing' in gateOf(id);
};
export const refusalFor = (action: Action): string => action.refusal ?? gateOf(action.gate).sentence;
/* A live action's record, or a throw: an action is live only with no gate, the founder's name and the
   day, and a sentence — the same three things _gatesWhy promises the build refuses it without. A screen
   that drew an action enabled on any weaker record would be the control the portal exists not to draw. */
export const liveOf = (action: Action): Live => {
 const live = action.live;
 if (action.gate !== null || !live || live.decidedBy !== 'Founder' || !/^\d\d\d\d-\d\d-\d\d$/.test(live.since) || !live.sentence.trim())
  throw new Error(`"${action.id}" is not a live action: it needs gate null and a live record with decidedBy Founder, a dated since and a sentence.`);
 return live;
};
export const registryActions = (): readonly Action[] => (g1.actions as readonly Action[]).filter(a => a.registryAction);

/* ---- Providers ------------------------------------------------------------------------------- */

export type Pricing = { readonly perMillionCharactersUsd: number; readonly unitCharacters: number; readonly currency: string; readonly source: string; readonly recordedOn: string; readonly why: string };
export type Card = (typeof registry.cards)[number] & {
 serves?: string[]; gate?: string; prohibitedFor?: string; keyRequired?: boolean; calledFrom?: string;
 detailsFrom?: string; regionFrom?: string; voicesFrom?: string; pricing?: Pricing;
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

/* ---- The presentation voice: the setting, and the preview's one request ------------------------ */

export type VoiceLabel = PresentationVoiceInForce['byClass'][keyof PresentationVoiceInForce['byClass']];
export type PresentationClassId = keyof PresentationVoiceInForce['byClass'];
/* A presentation class's setting is voice.json's to name on the class, never composed here from its id.
   A class with no setting — the clinical ones — has nothing to save into, and asking throws. */
export const settingOfClass = (classId: string) => {
 const entry = (voice.queryClasses as readonly { id: string; setting?: string }[]).find(c => c.id === classId);
 if (!entry?.setting) throw new Error(`packages/catalog/voice.json's class "${classId}" names no setting: its voice is not an administrator's to save.`);
 const setting = settingsEngineOf('assistant').block.items.find(s => s.key === entry.setting);
 if (!setting) throw new Error(`The assistant engine has no setting "${entry.setting}", which voice.json's class "${classId}" names.`);
 return setting;
};
/* The choices an administrator may make for a presentation class, with their labels: the setting's own
   allowed list, so the words on the screen are the contract's and a third voice added there arrives here. */
export const voiceChoicesOf = (classId: string): readonly { value: VoiceLabel; label: string }[] =>
 (settingOfClass(classId).allowed ?? []).map(c => ({ value: c.value as VoiceLabel, label: c.label }));
/* Save a presentation voice: one change, with its reason, through the same door the Configuration screen
   uses — so the refusal for a missing reason, a stale version or an unchanged value is the shared rules'
   sentence, and the change lands in the assistant engine's history beside every other setting's. */
export const savePresentationVoice = (classId: string, value: VoiceLabel, reason: string): Proposed =>
 applyChange('assistant', { setting: settingOfClass(classId).key, value, reason, expectedVersion: presentationVoiceNow().settingsVersion });

/* The one text-to-speech provider the preview reads through — the card voice.json lists for tts that the
   registry records as configured — and its recorded list price. The Voice screen and every TTS card's
   preview ask this rather than choosing a card, so a preview on ElevenLabs' card cannot call ElevenLabs. */
export const previewProvider = (): Card | null =>
 voice.providers.tts.map(cardOf).find(c => c.statusToday === 'configured' && c.pricing) ?? null;

export type PreviewAnswer =
 | { readonly ok: true; readonly audioBase64: string; readonly format: string; readonly voice: string; readonly language: string }
 | { readonly ok: false; readonly voiceUnavailable: boolean };
/* POST the service's speak route with an administrator's own sentence — the one request this module makes
   that is not a status read. The path and version are the contract's; the voice is the contract's own name
   for the language, handed in by the preview and never composed here; consent is the administrator's press.
   The answer is read the way the patient panel's client reads it, without importing that client: audio as
   base64 with its media type, or the language-has-no-voice flag, or nothing. A refusal, a fault and an
   unreachable service are all "not answered"; the preview says so in words and bills nothing. */
export async function previewSpeech(text: string, language: string, voiceName: string, signal: AbortSignal): Promise<PreviewAnswer> {
 const base = typeof __ASSISTANT_API_URL__ === 'string' ? __ASSISTANT_API_URL__ : '';
 try {
  const response = await fetch(`${base}${g1.overview.prefix}${g1.voice.previewRoute.path}`, {
   method: 'POST', signal, headers: { 'content-type': 'application/json', accept: 'application/json' },
   body: JSON.stringify({ text, language, voice: voiceName, userConsent: true })
  });
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (body?.voiceUnavailable === true) return { ok: false, voiceUnavailable: true };
  if (!response.ok || typeof body?.audioBase64 !== 'string' || typeof body.format !== 'string') return { ok: false, voiceUnavailable: false };
  return { ok: true, audioBase64: body.audioBase64, format: body.format, voice: typeof body.voice === 'string' ? body.voice : '', language: typeof body.language === 'string' ? body.language : language };
 } catch {
  return { ok: false, voiceUnavailable: false };
 }
}
