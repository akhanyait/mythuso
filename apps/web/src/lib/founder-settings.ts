import { useSyncExternalStore } from 'react';
import { call, founderContract, sessionEnded, type Answer, type Refusal } from './founder-access';
import { portalContract } from './portal';
import { assistantDefaults, type Change, type SettingValue, type Snapshot } from './settings';

/* The founder's settings and provider controls, the browser's half (packages/catalog/control-tower-portal.json
 * #gilbertone.founder; the service's half is the founder routes in packages/catalog/apis/assistant.json).
 *
 * The founder's instruction of 28 September 2026 — "I need to be able to control all these aspects, I am the
 * owner" — is met here by asking the assistant service, never by the browser deciding anything. Every request
 * goes through lib/founder-access.ts's call(): the founder header, the same-origin cookie, the contract's
 * refusal shape. This module remembers, for as long as the page is open, two things the service last said:
 * the assistant engine's settings in force with their history, and each provider's metadata — whether a key
 * is on the box, its last four characters, its fingerprint, whether the provider is switched on.
 *
 * WHAT IT NEVER HOLDS. A key. putKey() hands the key it is given straight into one request's body and keeps
 * no copy — the caller clears its own field before the request is even sent — and every reader below picks
 * the fields it names off the answer and nothing else, so a key the service should never return could not
 * reach a screen through here by accident. Nothing is stored in any browser storage, logged, or put in an
 * address. A refusal that ends the session is handed to lib/founder-access.ts, which puts every founder
 * screen back to signed out.
 *
 * WHAT IS IN FORCE IS A REPLAY, HERE TOO. The service answers the values it holds; they are laid over the
 * contract's defaults (lib/settings.ts's assistantDefaults) so a setting the service has never been told about
 * reads as the contract says, the same way lib/settings.ts reads this tab's history — and every reader of the
 * snapshot is lib/settings.ts's, so the arithmetic is the engine's here too. Reached only through the portal's
 * dynamic imports: a patient's first load carries none of it. */

export const founderWords = portalContract.gilbertone.founder.words;
/* The paths are founder-access.json's (control-tower-portal.json#gilbertone.founder.routesFrom); the card in a
   path is the registry card's id, and the service refuses one it has no vault slot for in its own sentence. */
const routes = founderContract.routes;
const path = (route: 'settings' | 'settingsChanges' | 'providers' | 'providerKey' | 'providerEnabled' | 'providerTest' | 'providerLogs', card?: string) =>
 routes[route].replace('{card}', encodeURIComponent(card ?? ''));

/* ---- Readers that take only what they name -------------------------------------------------------- */

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown): string | null => typeof x === 'string' ? x : null;
const num = (x: unknown): number | null => typeof x === 'number' && Number.isFinite(x) ? x : null;
/* A setting's value is one of the shapes the shared settings code knows and nothing else. */
const settingValue = (x: unknown): SettingValue | undefined =>
 typeof x === 'number' || typeof x === 'boolean' || typeof x === 'string' || Array.isArray(x) || isRecord(x) ? x as SettingValue : undefined;

/* A moment as the route gives it — an instant string — or, defensively, as epoch milliseconds. */
const instant = (x: unknown): number | null => {
 if (typeof x === 'number' && Number.isFinite(x)) return x;
 const parsed = typeof x === 'string' ? Date.parse(x) : Number.NaN;
 return Number.isFinite(parsed) ? parsed : null;
};
/* One history row in the shared Change shape, its instant parsed; a row missing any part is left out. */
const changeOf = (x: unknown): Change | null => {
 if (!isRecord(x)) return null;
 const settingsVersion = num(x.settingsVersion), setting = str(x.setting), reason = str(x.reason), at = instant(x.at);
 const from = settingValue(x.from), to = settingValue(x.to);
 if (settingsVersion === null || setting === null || reason === null || at === null || from === undefined || to === undefined) return null;
 return Object.freeze({ settingsVersion, setting, from, to, reason, byRole: str(x.byRole) ?? '', byRef: str(x.byRef) ?? '', at });
};

/* ---- The settings in force on the service ------------------------------------------------------- */

export type FounderSettings = { readonly snapshot: Snapshot; readonly history: readonly Change[]; readonly expiresAt: string | null };
export type FounderSettingsState =
 | { readonly phase: 'unread' }
 | { readonly phase: 'reading' }
 | { readonly phase: 'read'; readonly settings: FounderSettings }
 | { readonly phase: 'refused'; readonly message: string; readonly refusalId: string | null };

let settingsState: FounderSettingsState = { phase: 'unread' };
const settingsListeners = new Set<() => void>();
const setSettings = (next: FounderSettingsState) => { settingsState = next; settingsListeners.forEach(l => l()); };
export const useFounderSettings = (): FounderSettingsState =>
 useSyncExternalStore(l => { settingsListeners.add(l); return () => { settingsListeners.delete(l); }; }, () => settingsState);

/* The service's answer laid over the contract: its version, each described setting's value in force and the
   version that set it, its history in version order. A history the service answers is taken as it is and never
   edited; the snapshot is the block's defaults with the service's values over them, so a setting the service
   does not describe reads as the contract's default, and a described value of a shape no setting has is not read. */
function settingsOf(body: Record<string, unknown>): FounderSettings {
 const history = (Array.isArray(body.history) ? body.history : []).map(changeOf).filter((c): c is Change => c !== null);
 const byDefault = assistantDefaults();
 const values: Record<string, SettingValue> = { ...byDefault.values };
 const setAt: Record<string, number> = { ...byDefault.setAt };
 for (const described of Array.isArray(body.settings) ? body.settings : []) {
  if (!isRecord(described)) continue;
  const key = str(described.setting);
  const known = settingValue(described.inForce);
  if (key === null || known === undefined || !(key in byDefault.values)) continue;
  values[key] = known;
  setAt[key] = num(described.setAtVersion) ?? setAt[key]!;
 }
 const settingsVersion = num(body.settingsVersion) ?? (history.length ? history[history.length - 1]!.settingsVersion : byDefault.settingsVersion);
 return Object.freeze({ snapshot: Object.freeze({ settingsVersion, values: Object.freeze(values), setAt: Object.freeze(setAt) }), history: Object.freeze(history), expiresAt: str(body.expiresAt) });
}

let readingSettings: Promise<void> | null = null;
export function readFounderSettings(): Promise<void> {
 readingSettings ??= (async () => {
  if (settingsState.phase !== 'read') setSettings({ phase: 'reading' });
  const answer = await call<Record<string, unknown>>('GET', path('settings'));
  if (answer.ok) setSettings({ phase: 'read', settings: settingsOf(answer.body) });
  else { sessionEnded(answer); setSettings({ phase: 'refused', message: answer.message, refusalId: answer.refusalId }); }
 })().finally(() => { readingSettings = null; });
 return readingSettings;
}
/* Forgotten on sign-out, so the next founder reads afresh rather than what the last session saw. */
export const forgetFounderSettings = (): void => { setSettings({ phase: 'unread' }); setProviders({ phase: 'unread' }); };

/* The route's own request: the setting, the value it is changed from and to, the reason, and the version the
   change is asked against — the shared ChangeRequest with `from` beside it, as the service asks. */
export type FounderChangeRequest = { readonly setting: string; readonly from: SettingValue; readonly to: SettingValue; readonly reason: string; readonly expectedVersion: number };
export type FounderChanged = { readonly ok: true; readonly settingsVersion: number; readonly at: number } | Refusal;
/* One change, validated by the shared rules on the service, and the settings read again afterwards: the service
   is the store, so what the screen shows in force is what it answered, never what this tab assumed it accepted.
   The route answers the version now in force and the instant it applies from, and nothing else is read. */
export async function postFounderChange(request: FounderChangeRequest): Promise<FounderChanged> {
 const answer = await call<Record<string, unknown>>('POST', path('settingsChanges'), request);
 if (!answer.ok) { sessionEnded(answer); return answer; }
 const settingsVersion = num(answer.body.settingsVersion);
 const at = instant(answer.body.appliesFrom);
 await readFounderSettings();
 if (settingsVersion === null || at === null) return { ok: false, refusalId: null, message: founderWords.notAnswered };
 return { ok: true, settingsVersion, at };
}

/* ---- The providers, as the service records them -------------------------------------------------- */

/* What may be said of a provider's key: configured — on the box, from the vault or the environment — its last four,
   its fingerprint prefix, and whether the provider is switched on. Never a value, and never a field beyond these. */
export type ProviderMetadata = { readonly card: string; readonly configured: boolean; readonly lastFour: string | null; readonly fingerprint: string | null; readonly enabled: boolean };
export type FounderProvidersState =
 | { readonly phase: 'unread' }
 | { readonly phase: 'reading' }
 | { readonly phase: 'read'; readonly providers: readonly ProviderMetadata[] }
 | { readonly phase: 'refused'; readonly message: string; readonly refusalId: string | null };

let providersState: FounderProvidersState = { phase: 'unread' };
const providerListeners = new Set<() => void>();
const setProviders = (next: FounderProvidersState) => { providersState = next; providerListeners.forEach(l => l()); };
export const useFounderProviders = (): FounderProvidersState =>
 useSyncExternalStore(l => { providerListeners.add(l); return () => { providerListeners.delete(l); }; }, () => providersState);

/* One provider's metadata, and only that: a field the service might grow — or should never send — is not read. */
const metadataOf = (x: unknown): ProviderMetadata | null => {
 if (!isRecord(x)) return null;
 const card = str(x.card);
 if (card === null) return null;
 return Object.freeze({ card, configured: x.configured === true, lastFour: str(x.lastFour), fingerprint: str(x.fingerprintPrefix), enabled: x.enabled === true });
};
const providersOf = (body: Record<string, unknown>): readonly ProviderMetadata[] =>
 Object.freeze((Array.isArray(body.providers) ? body.providers : []).map(metadataOf).filter((p): p is ProviderMetadata => p !== null));

let readingProviders: Promise<void> | null = null;
export function readFounderProviders(): Promise<void> {
 readingProviders ??= (async () => {
  if (providersState.phase !== 'read') setProviders({ phase: 'reading' });
  const answer = await call<Record<string, unknown>>('GET', path('providers'));
  if (answer.ok) setProviders({ phase: 'read', providers: providersOf(answer.body) });
  else { sessionEnded(answer); setProviders({ phase: 'refused', message: answer.message, refusalId: answer.refusalId }); }
 })().finally(() => { readingProviders = null; });
 return readingProviders;
}
export const providerMetadataOf = (card: string): ProviderMetadata | null =>
 providersState.phase === 'read' ? providersState.providers.find(p => p.card === card) ?? null : null;

export type Done = { readonly ok: true } | Refusal;
const settle = async (answer: Answer<Record<string, unknown>>): Promise<Done> => {
 if (!answer.ok) { sessionEnded(answer); return answer; }
 await readFounderProviders();
 return { ok: true };
};
/* The key goes in this one body and nowhere else. The caller has already emptied its field; the answer is read
   back as the provider's metadata by the re-read, so nothing the service returned is drawn but that. */
export const putKey = (card: string, key: string, code: string): Promise<Done> => call<Record<string, unknown>>('PUT', path('providerKey', card), { key, code }).then(settle);
export const removeKey = (card: string, code: string): Promise<Done> => call<Record<string, unknown>>('DELETE', path('providerKey', card), { code }).then(settle);
export const setEnabled = (card: string, enabled: boolean, code: string): Promise<Done> => call<Record<string, unknown>>('POST', path('providerEnabled', card), { enabled, code }).then(settle);

export type TestOutcome = { readonly ok: true; readonly passed: boolean; readonly outcome: string; readonly latencyMs: number | null } | Refusal;
/* A test's answer is the service's outcome word — ok, or one of its words for not ok — and how long it took;
   nothing else on the body is read. */
export async function testProvider(card: string): Promise<TestOutcome> {
 const answer = await call<Record<string, unknown>>('POST', path('providerTest', card), {});
 if (!answer.ok) { sessionEnded(answer); return answer; }
 const outcome = str(answer.body.outcome) ?? '';
 return { ok: true, passed: outcome === 'ok', outcome, latencyMs: num(answer.body.latencyMs) };
}

export type LogLine = { readonly at: string; readonly event: string; readonly outcome: string };
export type Logs = { readonly ok: true; readonly lines: readonly LogLine[] } | Refusal;
/* A log line is when, what and how it went, as strings. A line carrying anything else is drawn without it. */
export async function readLogs(card: string): Promise<Logs> {
 const answer = await call<Record<string, unknown>>('GET', path('providerLogs', card));
 if (!answer.ok) { sessionEnded(answer); return answer; }
 const lines = (Array.isArray(answer.body.lines) ? answer.body.lines : []).flatMap((line): LogLine[] =>
  isRecord(line) ? [{ at: str(line.at) ?? '', event: str(line.event) ?? '', outcome: str(line.outcome) ?? '' }] : []);
 return { ok: true, lines: Object.freeze(lines) };
}
