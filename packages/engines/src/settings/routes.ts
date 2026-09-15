/* A settings read route, change route and review route for any engine, bound once.
 *
 * Every engine with settings answers GET /v1/<engine>/settings and POST /v1/<engine>/setting-changes to
 * the shapes packages/catalog/settings.json gives, and POST /v1/<engine>/setting-reviews once one of its
 * settings waits on a clinical review. The rules are ./shape.ts's. This file reads the engine's own
 * history out of the engine's own store, hands it to them, and appends what they accept; an engine
 * spreads the handlers into its routes under keys its engine.ts names, so every route an engine answers
 * is still registered there by name and the binder still admits each route's callers from the contract
 * before any of this runs.
 *
 * APPENDED, NEVER EDITED. Nothing here updates or deletes a settings_history or settings_reviews row, and
 * the build fails if anything in packages/engines does: the history is added to, and what is in force is
 * always the defaults with it replayed. Read afresh for every act, so the settings in force are never a
 * copy this module holds that could fall behind its own table.
 *
 * WHO. The caller's role and reference are the runtime's, never a field: who made a change is recorded
 * from the caller the binder admitted, so a request cannot name somebody else as having made it.
 */
import { ok, refuse, type EngineContext, type EngineStore, type HandlerRequest, type RouteHandler, type RouteKey } from '../runtime/types.ts';
import {
 changeFromFields, confirmReview, proposeChange, reviewStateOf, reviewersOf, rolesThatChange, snapshotOf,
 type Change, type Review, type Setting, type SettingsEngine, type Snapshot
} from './shape.ts';

/* Each engine's own store holds these two tables and nobody else's. A value is kept as JSON, because a
   setting may be a number, a word, a list or a rota, and the shape — not the column — says which. */
export const SETTINGS_SCHEMA = [
 'CREATE TABLE IF NOT EXISTS settings_history (',
 ' settings_version INTEGER PRIMARY KEY,',
 ' setting TEXT NOT NULL,',
 ' from_value TEXT NOT NULL,',
 ' to_value TEXT NOT NULL,',
 ' reason TEXT NOT NULL,',
 ' changed_by_role TEXT NOT NULL,',
 ' changed_by_ref TEXT NOT NULL,',
 ' changed_at INTEGER NOT NULL',
 ');',
 'CREATE TABLE IF NOT EXISTS settings_reviews (',
 ' settings_version INTEGER NOT NULL,',
 ' setting TEXT NOT NULL,',
 ' reason TEXT NOT NULL,',
 ' reviewed_by_role TEXT NOT NULL,',
 ' reviewed_by_ref TEXT NOT NULL,',
 ' reviewed_at INTEGER NOT NULL,',
 ' PRIMARY KEY (setting, settings_version)',
 ');'
].join('\n');

type HistoryRow = { settings_version: number; setting: string; from_value: string; to_value: string; reason: string; changed_by_role: string; changed_by_ref: string; changed_at: number };
type ReviewRow = { settings_version: number; setting: string; reason: string; reviewed_by_role: string; reviewed_by_ref: string; reviewed_at: number };

/** The history, oldest first, exactly as it was appended. */
export const historyOf = (store: EngineStore): Change[] =>
 (store.prepare('SELECT settings_version, setting, from_value, to_value, reason, changed_by_role, changed_by_ref, changed_at FROM settings_history ORDER BY settings_version').all() as HistoryRow[])
  .map(row => ({ settingsVersion: row.settings_version, setting: row.setting, from: JSON.parse(row.from_value), to: JSON.parse(row.to_value), reason: row.reason, byRole: row.changed_by_role, byRef: row.changed_by_ref, at: row.changed_at }));

/** Every confirmed clinical review, oldest first. */
export const reviewsOf = (store: EngineStore): Review[] =>
 (store.prepare('SELECT settings_version, setting, reason, reviewed_by_role, reviewed_by_ref, reviewed_at FROM settings_reviews ORDER BY reviewed_at, settings_version').all() as ReviewRow[])
  .map(row => ({ settingsVersion: row.settings_version, setting: row.setting, reason: row.reason, byRole: row.reviewed_by_role, byRef: row.reviewed_by_ref, at: row.reviewed_at }));

/** The settings in force in an engine's store, now. Whatever starts reads this once and keeps what it read. */
export const settingsIn = (engine: SettingsEngine, store: EngineStore): Snapshot => snapshotOf(engine.block, historyOf(store));

const iso = (at: number) => new Date(at).toISOString();
const LIMITS = ['positive', 'bounds', 'allowed', 'maxLength', 'mustKeep', 'allowedRoles', 'posts', 'mustCover', 'of', 'items', 'parts'] as const;

function describe(engine: SettingsEngine, setting: Setting, snapshot: Snapshot, reviews: readonly Review[]) {
 const { value, ...provenance } = setting.default;
 const review = reviewStateOf(setting, snapshot, reviews);
 return {
  setting: setting.key, label: setting.label, help: setting.help, type: setting.type, unit: setting.unit,
  inForce: snapshot.values[setting.key], setAtVersion: snapshot.setAt[setting.key],
  default: value, provenance,
  limits: Object.fromEntries(LIMITS.filter(key => setting[key] !== undefined).map(key => [key, setting[key]])),
  changedBy: rolesThatChange(engine.block, setting, snapshot),
  appliesTo: setting.appliesTo,
  guardrail: setting.guardrail?.statement ?? null,
  reviewRequired: review.required,
  reviewed: review.reviewed && { byRef: review.reviewed.byRef, at: review.reviewed.at === null ? null : iso(review.reviewed.at), on: review.reviewed.on }
 };
}

/** The roles the review-confirmer setting names in force, or null when they could not be read. */
export type ConfirmersReader = (ctx: EngineContext) => readonly string[] | null;

/* Every engine but Clinical asks Clinical who confirms a clinical review, through the one route that answers it.
   An answer the development mock gave, or a refusal, is not Clinical's answer, and confirms nobody: a review nobody
   may confirm waits, where a review confirmed by whoever a fallback guessed would be a signature under nothing. */
export const confirmersFromClinical: ConfirmersReader = ctx => {
 const answer = ctx.call('GET /v1/clinical/review-confirmers@2', {}, { purpose: 'audit' });
 const roles = answer.body['confirmers'];
 return answer.status === 200 && answer.answeredBy === 'engine' && Array.isArray(roles) && roles.every(role => typeof role === 'string') ? roles as string[] : null;
};

export function settingsRoutes(engine: SettingsEngine, keys: { read: RouteKey; change: RouteKey; review?: RouteKey }, reader: { readonly confirmers?: ConfirmersReader } = {}): Partial<Record<RouteKey, RouteHandler>> {
 const { block } = engine;
 const waitsOnReview = block.items.some(s => s.reviewRequired);
 if (waitsOnReview && !reader.confirmers) throw new Error(`The ${block.engine} settings wait on a clinical review, and settingsRoutes() was not told how to read who confirms one. It is the review-confirmer setting in force, and nothing else.`);
 const confirmersIn = (ctx: EngineContext) => waitsOnReview && reader.confirmers ? reader.confirmers(ctx) : null;
 const routes: Partial<Record<RouteKey, RouteHandler>> = {
  [keys.read]: (_request: HandlerRequest, ctx: EngineContext) => {
   const history = historyOf(ctx.store);
   const reviews = reviewsOf(ctx.store);
   const snapshot = snapshotOf(block, history);
   /* The binder admits the route's callers. A caller who may neither change nor review any setting here
      is still refused, because the history names people and is read by those who answer for it. */
   const confirmers = confirmersIn(ctx);
   const readers = new Set(block.items.flatMap(s => [...rolesThatChange(block, s, snapshot), ...reviewersOf(s, confirmers)]));
   if (!readers.has(ctx.caller.role)) return refuse('settings-read-not-permitted');
   return ok({
    settingsVersion: snapshot.settingsVersion,
    settings: block.items.map(setting => describe(engine, setting, snapshot, reviews)),
    history: history.map(change => ({ settingsVersion: change.settingsVersion, setting: change.setting, from: change.from, to: change.to, reason: change.reason, byRole: change.byRole, byRef: change.byRef, at: iso(change.at) }))
   });
  },

  [keys.change]: (request: HandlerRequest, ctx: EngineContext) => {
   const { setting, value } = changeFromFields(block, request.fields);
   const changed = proposeChange(engine, historyOf(ctx.store), {
    setting, value, reason: request.fields.reason, expectedVersion: request.fields.expectedVersion,
    byRole: ctx.caller.role, byRef: ctx.caller.ref
   }, ctx.clock.now().getTime());
   if (!changed.ok) return refuse(changed.refusal.id);
   const change = changed.value.change;
   ctx.store.prepare('INSERT INTO settings_history (settings_version, setting, from_value, to_value, reason, changed_by_role, changed_by_ref, changed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(change.settingsVersion, change.setting, JSON.stringify(change.from), JSON.stringify(change.to), change.reason, change.byRole, change.byRef, change.at);
   return ok({ settingsVersion: change.settingsVersion, appliesFrom: iso(change.at) });
  }
 };

 if (keys.review) {
  routes[keys.review] = (request: HandlerRequest, ctx: EngineContext) => {
   const reviewed = confirmReview(engine, historyOf(ctx.store), reviewsOf(ctx.store), {
    setting: request.fields.setting, settingsVersion: request.fields.settingsVersion, reason: request.fields.reason,
    byRole: ctx.caller.role, byRef: ctx.caller.ref, confirmers: confirmersIn(ctx)
   }, ctx.clock.now().getTime());
   if (!reviewed.ok) return refuse(reviewed.refusal.id);
   const review = reviewed.value;
   ctx.store.prepare('INSERT INTO settings_reviews (settings_version, setting, reason, reviewed_by_role, reviewed_by_ref, reviewed_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(review.settingsVersion, review.setting, review.reason, review.byRole, review.byRef, review.at);
   return ok({ settingsVersion: review.settingsVersion, reviewedAt: iso(review.at) });
  };
 }
 return routes;
}
