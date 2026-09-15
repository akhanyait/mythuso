/* The one shape every admin setting has, and the rules every change to one obeys, enforced once.
 *
 * The founder instructed on 15 September 2026 that the questions the programme kept asking become admin
 * settings. packages/catalog/settings.json holds the shape, the rules and the sentences a change is
 * refused in; each engine's own contract holds its settings in that shape. This file is the arithmetic
 * over both, and it is the only copy of it: the engine runtime binds it to each engine's routes through
 * ./routes.ts, the web preview hands it the history it keeps in memory, and scripts/check-boundaries.mjs
 * runs every default and every value a guardrail forbids through refusalOf() below. So the rules a
 * change is refused by and the rules the build holds a contract to cannot drift apart.
 *
 * WHAT IS IN FORCE IS A REPLAY. Nothing here stores a value in force. It is always the contract's defaults
 * with the engine's history of accepted changes replayed in version order, and a history with a gap or a
 * repeat is a fault rather than something to read around, because the version something running kept
 * would no longer mean one thing.
 *
 * THE ORDER A CHANGE IS ASKED IN. Who, before anything about what: a caller with no reference is refused
 * as not permitted rather than written down as nobody. Then whether the setting exists, a reason, the
 * version, and then the value: its kind, nought (before the bounds, so bounds set wrongly cannot let
 * nought through), the vetting register, the wording and rota rules, and last the bounds and allowed
 * values. An engine's own rule between settings — Safety's steps against its ceiling — is asked after
 * the shared ones, and whether anything changed is asked last.
 *
 * Zero dependencies and apps/api's type-stripping rules: no enums, no namespaces, no constructor
 * parameter properties. Time is epoch milliseconds handed in by the caller, so a test is a clock.
 */
import contract from '../../../catalog/settings.json' with { type: 'json' };
import scheduling from '../../../catalog/scheduling.json' with { type: 'json' };
import vetting from '../../../catalog/vetting.json' with { type: 'json' };

export const settingsContract = contract;
export const settingsScreen = contract.screen;

/* ---- Whether a rota's post is on duty --------------------------------------------------------------
   A schedule setting is a list of windows, and whether one covers a moment is one rule for every engine:
   Core asks it of the escalation rota a concern kept, and Access asks it of the handover desk's hours in
   force. It lived in Core's loops.ts until the Access engine needed it on its own handover route, and an
   engine may not reach into another engine's directory; so it is here, where both may import it, and the
   build fails if a second evaluation of a window's hours is written anywhere beside it. */

const local = new Intl.DateTimeFormat('en-GB', { timeZone: scheduling.timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** The day of the week and the time of day a moment is where the rota is kept, as a window names them: "mon" and "02:10". */
export function localTimeOf(at: number): { readonly day: string; readonly time: string } {
 const parts = local.formatToParts(new Date(at));
 const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? '';
 return { day: part('weekday').toLowerCase(), time: `${part('hour')}:${part('minute')}` };
}

/* A window's hours run from 00:00 to 24:00 and end after they start, so a time of day compares with them as
   text: "02:10" is before "06:00", and every time of day is before "24:00". A rota is anything with windows,
   so Core hands in the rota a concern kept and Access the desk's hours, and neither is copied to fit. */
export const onDuty = (rota: { readonly windows: readonly Window[] }, post: string, at: number): boolean => {
 const { day, time } = localTimeOf(at);
 return rota.windows.some(w => w.post === post && w.days.includes(day) && w.from <= time && time < w.to);
};

const DAY_MS = 86_400_000;

/* Whether any post of a rota is on duty at a moment, and when the next window starts if none is: later the
   same local day, or the first window of the next day that has one, looking a week ahead. A rota with no
   window at all opens never, which the caller must say rather than invent an hour. */
export function rotaAt(windows: readonly Window[], at: number): { readonly open: boolean; readonly opens: { readonly daysAhead: number; readonly at: number; readonly from: string } | null } {
 const open = [...new Set(windows.map(w => w.post))].some(post => onDuty({ windows }, post, at));
 const { time } = localTimeOf(at);
 for (let ahead = 0; ahead <= 7; ahead++) {
  const moment = at + ahead * DAY_MS;
  const { day } = localTimeOf(moment);
  const starts = windows.filter(w => w.days.includes(day) && (ahead > 0 || w.from > time)).map(w => w.from).sort();
  if (starts.length) return { open, opens: { daysAhead: ahead, at: moment, from: starts[0]! } };
 }
 return { open, opens: null };
}

export type TypeId = 'minutes' | 'count' | 'moneyCents' | 'percentage' | 'boolean' | 'enum' | 'text' | 'roleList' | 'schedule' | 'list' | 'record';
export type Scalar = number | boolean | string;
export type Window = { readonly post: string; readonly days: readonly string[]; readonly from: string; readonly to: string };
export type SettingValue = Scalar | readonly Scalar[] | readonly Window[] | Readonly<Record<string, Scalar>>;

export type Provenance = {
 readonly decidedBy: string | null;
 readonly decidedOn?: string;
 readonly why?: string;
 readonly proposedBy?: string;
 readonly proposedBecause?: string;
 readonly reviewedBy?: string;
 readonly reviewedOn?: string;
};
export type Bound = Provenance & { readonly value: number };
export type Choice = Provenance & { readonly value: string | boolean; readonly label: string };
/** A position on a rota. role is null, with roleMissing saying why, for a post no role on the vetting register holds yet. */
export type Post = { readonly id: string; readonly label: string; readonly role: string | null; readonly roleMissing?: string };
export type Cover = { readonly post: string; readonly days: readonly string[]; readonly from: string; readonly to: string; readonly why: string };
/** What a value of one type is held to. A list's items and a record's parts are held to theirs the same way. */
export type Limits = {
 readonly type: TypeId;
 readonly unit?: string | null;
 readonly positive?: boolean;
 readonly bounds?: { readonly lowest: Bound; readonly highest: Bound; readonly citedFrom?: unknown; readonly notCitedBecause?: string };
 readonly allowed?: readonly Choice[];
 readonly maxLength?: Bound;
 readonly mustKeep?: readonly { readonly words: string; readonly why: string }[];
 readonly allowedRoles?: Provenance & { readonly roles: readonly string[] };
 readonly posts?: readonly Post[];
 readonly mustCover?: readonly Cover[];
 readonly of?: TypeId;
 readonly items?: { readonly lowest: Bound; readonly highest: Bound };
 readonly parts?: readonly Part[];
};
export type Part = Limits & { readonly key: string; readonly label: string };
export type Setting = Limits & {
 readonly key: string;
 readonly label: string;
 readonly help: string;
 readonly owner: string;
 readonly unit: string | null;
 readonly default: Provenance & { readonly value: SettingValue };
 readonly changedBy: string | { readonly fromSetting: string };
 readonly reviewRequired?: string;
 readonly appliesTo: string;
 readonly guardrail?: { readonly statement: string; readonly forbids: readonly unknown[] };
};
export type ChangelogEntry = {
 readonly version: number; readonly on: string; readonly by: string; readonly why: string;
 readonly changed: readonly { readonly setting: string; readonly from: unknown; readonly to: unknown }[];
};
export type SettingsBlock = {
 readonly engine: string;
 readonly heading: string;
 readonly intro: string;
 readonly items: readonly Setting[];
 readonly defaults: { readonly version: number; readonly changelog: readonly ChangelogEntry[] };
};

/** One accepted change. Added to a history, and never edited or removed. */
export type Change = {
 readonly settingsVersion: number;
 readonly setting: string;
 readonly from: SettingValue;
 readonly to: SettingValue;
 readonly reason: string;
 readonly byRole: string;
 readonly byRef: string;
 readonly at: number;
};
/** One confirmed clinical review of the value a version set. Added, and never edited or removed. */
export type Review = {
 readonly settingsVersion: number;
 readonly setting: string;
 readonly reason: string;
 readonly byRole: string;
 readonly byRef: string;
 readonly at: number;
};
/** The values in force after a history, and the version that set each one. */
export type Snapshot = {
 readonly settingsVersion: number;
 readonly values: Readonly<Record<string, SettingValue>>;
 readonly setAt: Readonly<Record<string, number>>;
};
export type Refusal = { readonly id: string; readonly status: number; readonly statement: string };
export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly refusal: Refusal };
/** An engine's rule between its own settings, asked of the values a change would put in force. */
export type Check = (next: Snapshot['values'], setting: Setting) => string | null;
/** What an engine hands this file: its block, the refusals its own routes add, and its own rule. */
export type SettingsEngine = { readonly block: SettingsBlock; readonly refusals?: readonly Refusal[]; readonly check?: Check };

/** The version of a history nobody has added to: the contract's defaults. */
export const FIRST_SETTINGS_VERSION = 1;

type RouteKind = 'read' | 'change' | 'review';
type TypeRow = { id: string; limits: string; positive?: string; unit: string | null; valueField: string; ceiling?: number };
const TYPES = contract.types as readonly TypeRow[];
const DAYS: readonly string[] = contract.days;
const ROLES = vetting.roles as readonly { id: string; grants?: readonly { capability: string }[] }[];
const ROLE_IDS = new Set(ROLES.map(role => role.id));

export const typeOf = (id: string): TypeRow => {
 const found = TYPES.find(row => row.id === id);
 if (!found) throw new Error(`packages/catalog/settings.json has no setting type "${id}".`);
 return found;
};
/** The roles on the vetting register that hold a capability. */
export const rolesGranting = (capability: string): string[] => ROLES.filter(role => (role.grants ?? []).some(grant => grant.capability === capability)).map(role => role.id);
export const isRole = (id: string) => ROLE_IDS.has(id);

/* A refusal's sentence is the contract's: the shared one for the route, or one the engine's own route
   declares for its own rule. An id in neither is a fault, because a refusal with no sentence is a screen
   that says nothing at the moment somebody needs to know why. */
export function refusalFor(kind: RouteKind, id: string, own: readonly Refusal[] = []): Refusal {
 const shared = contract.refusals.find(entry => entry.route === kind && entry.id === id) ?? own.find(entry => entry.id === id);
 if (!shared) throw new Error(`No refusal "${id}" for a settings ${kind} in packages/catalog/settings.json or on the engine's own route.`);
 return { id: shared.id, status: shared.status, statement: shared.statement };
}
const refused = <T>(kind: RouteKind, id: string, own?: readonly Refusal[]): Result<T> => ({ ok: false, refusal: refusalFor(kind, id, own) });
const done = <T>(value: T): Result<T> => ({ ok: true, value });

/* ---- The value ------------------------------------------------------------------------------------ */

const NUMBERS = new Set<string>(['minutes', 'count', 'moneyCents', 'percentage']);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
/* Minutes past midnight, 00:00 to 24:00, or null for anything that is not a time of day. */
const minuteOfDay = (value: unknown): number | null => {
 if (typeof value !== 'string') return null;
 const m = /^(\d{2}):(\d{2})$/.exec(value);
 if (!m) return null;
 const at = Number(m[1]) * 60 + Number(m[2]);
 return Number(m[2]) < 60 && at <= 24 * 60 ? at : null;
};
const itemsOf = (limits: Limits): Limits => ({ ...limits, type: limits.of!, of: undefined, items: undefined });
const needsPositive = (limits: Limits) => {
 const row = typeOf(limits.type);
 return row.positive === 'always' || (row.positive === 'setting' && limits.positive === true);
};

function wrongType(limits: Limits, value: unknown): boolean {
 if (value === undefined || value === null) return true;
 switch (limits.type) {
  case 'minutes': case 'count': case 'moneyCents': case 'percentage': return !Number.isInteger(value);
  case 'boolean': return typeof value !== 'boolean';
  case 'enum': case 'text': return typeof value !== 'string';
  case 'roleList': return !Array.isArray(value) || !value.every(role => typeof role === 'string');
  /* A window is a post, days and hours and nothing else. A field beside them — a name, a phone number —
     is refused as the wrong kind of value, which is how a rota stays a rota of posts. So is a window for a
     post no role on the register holds: nobody could be on it, and a rota that said somebody was would be
     a post quietly given to whoever the admin had in mind. */
  case 'schedule': return !Array.isArray(value) || !value.every(w => isRecord(w)
   && Object.keys(w).sort().join(',') === 'days,from,post,to'
   && (limits.posts ?? []).some(post => post.id === w.post && post.role !== null)
   && Array.isArray(w.days) && w.days.length > 0 && new Set(w.days).size === w.days.length && w.days.every(day => DAYS.includes(day as string))
   && minuteOfDay(w.from) !== null && minuteOfDay(w.to) !== null && minuteOfDay(w.from)! < minuteOfDay(w.to)!);
  case 'list': return !Array.isArray(value) || value.some(item => wrongType(itemsOf(limits), item));
  case 'record': {
   const parts = limits.parts ?? [];
   return !isRecord(value) || Object.keys(value).sort().join(',') !== parts.map(p => p.key).sort().join(',') || parts.some(p => wrongType(p, value[p.key]));
  }
 }
}
function notAboveZero(limits: Limits, value: unknown): boolean {
 if (NUMBERS.has(limits.type)) return needsPositive(limits) && (value as number) <= 0;
 if (limits.type === 'list') return (value as unknown[]).some(item => notAboveZero(itemsOf(limits), item));
 if (limits.type === 'record') return (limits.parts ?? []).some(p => notAboveZero(p, (value as Record<string, unknown>)[p.key]));
 return false;
}
const offRegister = (limits: Limits, value: unknown) => limits.type === 'roleList' && (value as string[]).some(role => !ROLE_IDS.has(role));
function tooLong(limits: Limits, value: unknown): boolean {
 if (limits.type === 'text') return (value as string).length > (limits.maxLength?.value ?? 0);
 return limits.type === 'list' && limits.of === 'text' && (value as unknown[]).some(item => tooLong(itemsOf(limits), item));
}
function losesGuardrail(limits: Limits, value: unknown): boolean {
 if (limits.type === 'text') return (limits.mustKeep ?? []).some(keep => !(value as string).includes(keep.words));
 return limits.type === 'list' && limits.of === 'text' && (value as unknown[]).some(item => losesGuardrail(itemsOf(limits), item));
}
/* Every day a cover names, the windows for its post, laid end to end, must reach from its start to its end. */
function leavesGap(limits: Limits, value: unknown): boolean {
 if (limits.type !== 'schedule') return false;
 const windows = value as Window[];
 return (limits.mustCover ?? []).some(cover => cover.days.some(day => {
  let reached = minuteOfDay(cover.from)!;
  const end = minuteOfDay(cover.to)!;
  const spans = windows.filter(w => w.post === cover.post && w.days.includes(day)).map(w => [minuteOfDay(w.from)!, minuteOfDay(w.to)!] as const).sort((a, b) => a[0] - b[0]);
  for (const [from, to] of spans) if (from <= reached && to > reached) reached = to;
  return reached < end;
 }));
}
function outOfRange(limits: Limits, value: unknown): boolean {
 switch (limits.type) {
  case 'minutes': case 'count': case 'moneyCents': case 'percentage': {
   const n = value as number;
   const ceiling = typeOf(limits.type).ceiling;
   return !limits.bounds || n < limits.bounds.lowest.value || n > limits.bounds.highest.value || n < 0 || (ceiling !== undefined && n > ceiling);
  }
  case 'boolean': return !!limits.allowed && !limits.allowed.some(choice => choice.value === value);
  case 'enum': return !(limits.allowed ?? []).some(choice => choice.value === value);
  case 'text': return (value as string).trim() === '';
  case 'roleList': {
   const roles = value as string[];
   return new Set(roles).size !== roles.length || !roles.every(role => (limits.allowedRoles?.roles ?? []).includes(role))
    || (limits.items !== undefined && (roles.length < limits.items.lowest.value || roles.length > limits.items.highest.value));
  }
  case 'schedule': return false;
  case 'list': {
   const items = value as unknown[];
   return !limits.items || items.length < limits.items.lowest.value || items.length > limits.items.highest.value || items.some(item => outOfRange(itemsOf(limits), item));
  }
  case 'record': return (limits.parts ?? []).some(p => outOfRange(p, (value as Record<string, unknown>)[p.key]));
 }
}

/** The shared refusal a value is refused with, or null when the value may be set. */
export function refusalOf(limits: Limits, value: unknown): string | null {
 if (wrongType(limits, value)) return 'setting-value-wrong-type';
 if (notAboveZero(limits, value)) return 'setting-not-above-zero';
 if (offRegister(limits, value)) return 'setting-role-not-on-register';
 if (tooLong(limits, value)) return 'setting-text-too-long';
 if (losesGuardrail(limits, value)) return 'setting-text-loses-a-guardrail';
 if (leavesGap(limits, value)) return 'setting-schedule-leaves-a-gap';
 if (outOfRange(limits, value)) return 'setting-out-of-range';
 return null;
}

/* Two values are the same when they are the same data, whatever order a record's keys arrived in. */
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
 : isRecord(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const sameValue = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const frozen = <T>(value: T): T => {
 if (Array.isArray(value)) { value.forEach(frozen); return Object.freeze(value); }
 if (isRecord(value)) { Object.values(value).forEach(frozen); return Object.freeze(value); }
 return value;
};
const copy = (value: unknown): SettingValue => frozen(JSON.parse(JSON.stringify(value)));

/* ---- What is in force ----------------------------------------------------------------------------- */

export const defaultsOf = (block: SettingsBlock): Readonly<Record<string, SettingValue>> =>
 Object.freeze(Object.fromEntries(block.items.map(setting => [setting.key, copy(setting.default.value)])));

/** The values in force after a history of accepted changes. */
export function snapshotOf(block: SettingsBlock, history: readonly Change[]): Snapshot {
 const values: Record<string, SettingValue> = { ...defaultsOf(block) };
 const setAt: Record<string, number> = Object.fromEntries(block.items.map(setting => [setting.key, FIRST_SETTINGS_VERSION]));
 let settingsVersion = FIRST_SETTINGS_VERSION;
 for (const change of [...history].sort((a, b) => a.settingsVersion - b.settingsVersion)) {
  if (change.settingsVersion !== settingsVersion + 1) throw new Error(`The ${block.engine} settings history goes from version ${settingsVersion} to ${change.settingsVersion}. It is added to and never edited.`);
  if (!(change.setting in values)) throw new Error(`The ${block.engine} settings history changes "${change.setting}", which is not one of its settings. It is added to and never edited.`);
  values[change.setting] = copy(change.to);
  setAt[change.setting] = change.settingsVersion;
  settingsVersion = change.settingsVersion;
 }
 return Object.freeze({ settingsVersion, values: Object.freeze(values), setAt: Object.freeze(setAt) });
}

/** Every value a setting has held: its default and each change to it. What a phone that read an older one may still send. */
export const valuesHeld = (block: SettingsBlock, history: readonly Change[], key: string): SettingValue[] => {
 const setting = block.items.find(s => s.key === key);
 return setting ? [setting.default.value, ...history.filter(change => change.setting === key).map(change => change.to)] : [];
};

/** The roles that may change a setting: its role, the roles holding its capability, or the roles a roleList setting names. */
export function rolesThatChange(block: SettingsBlock, setting: Setting, snapshot: Snapshot = snapshotOf(block, [])): string[] {
 const by = setting.changedBy;
 if (typeof by !== 'string') return [...((snapshot.values[by.fromSetting] ?? []) as string[])];
 return ROLE_IDS.has(by) ? [by] : rolesGranting(by);
}

/* ---- A change ------------------------------------------------------------------------------------- */

export type ChangeRequest = {
 readonly setting: unknown;
 readonly value: unknown;
 readonly reason?: unknown;
 readonly expectedVersion: unknown;
 readonly byRole: string;
 readonly byRef: string | null;
};

export function proposeChange(engine: SettingsEngine, history: readonly Change[], request: ChangeRequest, now: number): Result<{ readonly change: Change; readonly snapshot: Snapshot }> {
 const { block } = engine;
 const current = snapshotOf(block, history);
 const setting = block.items.find(s => s.key === request.setting);
 if (!request.byRef) return refused('change', 'setting-change-not-permitted');
 /* An unknown setting is named as unknown only to somebody who could change a setting here at all;
    anybody else learns nothing about which settings exist. */
 if (!setting) return refused('change', block.items.some(s => rolesThatChange(block, s, current).includes(request.byRole)) ? 'setting-not-known' : 'setting-change-not-permitted');
 if (!rolesThatChange(block, setting, current).includes(request.byRole)) return refused('change', 'setting-change-not-permitted');
 const reason = typeof request.reason === 'string' ? request.reason.trim() : '';
 if (!reason) return refused('change', 'setting-change-without-reason');
 if (request.expectedVersion !== current.settingsVersion) return refused('change', 'settings-version-stale');
 const problem = refusalOf(setting, request.value);
 if (problem) return refused('change', problem);
 const to = copy(request.value);
 const own = engine.check?.({ ...current.values, [setting.key]: to }, setting);
 if (own) return refused('change', own, engine.refusals);
 const from = current.values[setting.key]!;
 if (sameValue(from, to)) return refused('change', 'setting-unchanged');
 const change: Change = Object.freeze({ settingsVersion: current.settingsVersion + 1, setting: setting.key, from, to, reason, byRole: request.byRole, byRef: request.byRef, at: now });
 /* Nothing is published. No engine acts on a settings change: the engine that owns a setting reads the
    value in force when it starts something, and the event contract refuses an event nobody subscribes
    to. A change is the row an engine appends, and nothing else. */
 return done({ change, snapshot: snapshotOf(block, [...history, change]) });
}

/* ---- A clinical review ---------------------------------------------------------------------------- */

export type ReviewState = {
 /** The capability whose holder confirms it, or null for a setting that waits on nobody. */
 readonly required: string | null;
 /** Who confirmed the value in force, or null while it is not clinically reviewed. */
 readonly reviewed: { readonly byRef: string; readonly at: number | null; readonly on: string | null } | null;
};

/* A review belongs to the value a version set. A later change is a new value nobody has reviewed, so it
   is shown as not clinically reviewed again even though the setting was reviewed before. */
export function reviewStateOf(setting: Setting, snapshot: Snapshot, reviews: readonly Review[]): ReviewState {
 if (!setting.reviewRequired) return { required: null, reviewed: null };
 const version = snapshot.setAt[setting.key] ?? FIRST_SETTINGS_VERSION;
 const confirmed = reviews.find(review => review.setting === setting.key && review.settingsVersion === version);
 if (confirmed) return { required: setting.reviewRequired, reviewed: { byRef: confirmed.byRef, at: confirmed.at, on: null } };
 if (version === FIRST_SETTINGS_VERSION && setting.default.reviewedBy && setting.default.reviewedOn) {
  return { required: setting.reviewRequired, reviewed: { byRef: setting.default.reviewedBy, at: null, on: setting.default.reviewedOn } };
 }
 return { required: setting.reviewRequired, reviewed: null };
}

export type ReviewRequest = { readonly setting: unknown; readonly settingsVersion: unknown; readonly reason?: unknown; readonly byRole: string; readonly byRef: string | null };

export function confirmReview(engine: SettingsEngine, history: readonly Change[], reviews: readonly Review[], request: ReviewRequest, now: number): Result<Review> {
 const { block } = engine;
 const current = snapshotOf(block, history);
 const reviewers = (s: Setting) => s.reviewRequired ? rolesGranting(s.reviewRequired) : [];
 const setting = block.items.find(s => s.key === request.setting);
 if (!request.byRef) return refused('review', 'setting-review-not-permitted');
 if (!setting) return refused('review', block.items.some(s => reviewers(s).includes(request.byRole)) ? 'setting-not-known' : 'setting-review-not-permitted');
 if (!setting.reviewRequired) return refused('review', 'setting-review-not-needed');
 if (!reviewers(setting).includes(request.byRole)) return refused('review', 'setting-review-not-permitted');
 const reason = typeof request.reason === 'string' ? request.reason.trim() : '';
 if (!reason) return refused('review', 'setting-review-without-reason');
 if (request.settingsVersion !== current.setAt[setting.key]) return refused('review', 'setting-review-not-in-force');
 /* The person who made a change never confirms its review, as nobody lifts their own suspension. */
 if (history.some(change => change.settingsVersion === request.settingsVersion && change.byRef === request.byRef)) return refused('review', 'setting-review-own-change');
 if (reviewStateOf(setting, current, reviews).reviewed) return refused('review', 'setting-review-already-confirmed');
 return done(Object.freeze({ settingsVersion: request.settingsVersion as number, setting: setting.key, reason, byRole: request.byRole, byRef: request.byRef, at: now }));
}

/* ---- From a route's fields ------------------------------------------------------------------------ */

/** The setting and the value a change route's fields carry. The value is read from the one field its type's value travels in. */
export function changeFromFields(block: SettingsBlock, fields: Readonly<Record<string, unknown>>): { setting: unknown; value: unknown } {
 const setting = block.items.find(s => s.key === fields.setting);
 return { setting: fields.setting, value: setting ? fields[typeOf(setting.type).valueField] : undefined };
}
