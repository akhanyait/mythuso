/**
 * The engine runtime's interface: what an engine module is, what a handler receives and what it may
 * answer. Every engine — Core, Care, Safety, Money, Access and the rest — is written against this file
 * and nothing else in the runtime, so it is kept stable: extended, never renamed.
 *
 * ── Why a handler is a function of (request, context) and nothing more ───────────────────────────────
 *
 * The contract in packages/catalog/apis already says who may call a route, for which purpose, with
 * which fields and what it refuses. If a handler could read a header, open a file or reach a sibling
 * engine's database, each of those would be a second answer to a question the contract has settled.
 * So the binder does the contract's part before the handler runs — caller, purpose, required fields and
 * their types, the idempotency key — and the handler is handed only what is left to decide: the declared
 * fields, the caller the binder admitted, its own store, the bus and a clock. It answers with a declared
 * response or a declared refusal id, and the runtime renders the refusal's status and sentence from the
 * contract, so no engine types a refusal sentence of its own.
 *
 * ── What it never does ───────────────────────────────────────────────────────────────────────────────
 *
 * Nothing here is a real service. The runtime answers on loopback, with synthetic data, behind
 * MYTHUSO_ENGINES=synthetic-data-only, and a caller's role arrives in a development header rather than
 * over mutual TLS or a session. A production door is a different piece of work.
 */
import type { DatabaseSync } from 'node:sqlite';

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** "<METHOD> <path as declared in the engine file>@<version>", e.g. "POST /v1/core/loops@1". */
export type RouteKey = `${Method} /${string}@${number}`;

/** "<type>@<version>", e.g. "loop.opened@1". */
export type EventKey = `${string}@${number}`;

/** Who the binder admitted: a role id from the route's callers ("nurse", "ops-desk", "engine:care"). */
export type Caller = { readonly role: string; readonly ref: string | null };

export type HandlerRequest = {
 readonly route: RouteKey;
 /** The route's declared request fields that were sent — path parameters, query or body — already typed. */
 readonly fields: Readonly<Record<string, unknown>>;
 /** Names of fields that were sent and are not declared. Their values never reach a handler. */
 readonly undeclared: readonly string[];
};

/** A handler's answer: the declared response body, or the id of a refusal the route or its engine declares. */
export type Answer = { readonly ok: Record<string, unknown> } | { readonly refuse: string };

export const ok = (body: Record<string, unknown>): Answer => ({ ok: body });
export const refuse = (id: string): Answer => ({ refuse: id });

/** The envelope fields a publisher supplies. The rest — eventId, occurredAt, owner — are the bus's. */
export type PublishOptions = {
 readonly subjectRef: string;
 /** Defaults to the caller's role, or "system" for a tick. */
 readonly actorRole?: string;
 /** Defaults to the context's purpose. */
 readonly purposeOfUse?: string;
 readonly causationId?: string;
 readonly protocolVersion?: string;
};

export type Envelope = {
 readonly eventId: string;
 readonly type: string;
 readonly version: number;
 readonly occurredAt: string;
 readonly owner: string;
 readonly actorRole: string;
 readonly subjectRef: string;
 readonly purposeOfUse: string;
 readonly causationId?: string;
 readonly protocolVersion?: string;
};

export type BusEvent = Envelope & { readonly payload: Readonly<Record<string, unknown>> };

export type Published = { readonly eventId: string; readonly type: string; readonly version: number };

/** The simulated clock. Time moves only when a test or the dev server advances it. */
export type ClockReading = { now(): Date; iso(): string };
export type Clock = ClockReading & { advance(ms: number): void; set(at: Date | string): void };

/** An engine's own SQLite store. No handler is ever handed another engine's. */
export type EngineStore = Pick<DatabaseSync, 'exec' | 'prepare'>;

/** The runtime's answer to a call, in the mock's shape, saying which of the two answered. */
export type RuntimeAnswer = { status: number; body: Record<string, unknown>; answeredBy: 'engine' | 'mock' | 'runtime' };

/** One line of the hash-chained development event log. */
export type TrailEntry = {
 readonly seq: number; readonly at: string; readonly kind: string; readonly eventId: string | null;
 readonly eventKey: string | null; readonly engine: string | null; readonly body: string; readonly prevHash: string; readonly hash: string;
};
export type TrailReader = { entries(fromIso: string, toIso: string): TrailEntry[]; verify(): boolean };

export type EngineContext = {
 readonly engine: string;
 readonly caller: Caller;
 readonly purpose: string;
 readonly idempotencyKey: string | null;
 readonly store: EngineStore;
 readonly clock: ClockReading;
 /**
  * Validated at once against packages/catalog/events.json — declared, live, owned by this engine, the
  * frozen payload shape, nothing on a never-list — and throws BusRefused if not. Delivered only after
  * the handler's store transaction commits; a refusal or a fault discards it.
  */
 publish(event: EventKey, payload: Record<string, unknown>, options: PublishOptions): Published;
 /** Another engine's route, as caller "engine:<this engine>". Never this engine's own. */
 call(route: RouteKey, fields: Record<string, unknown>, options: { purpose: string }): RuntimeAnswer;
 /**
  * A write a declared refusal keeps. When a handler refuses, everything it did is rolled back, except
  * the statements recorded here: one INSERT or UPDATE each, checked like any store statement, into a
  * table the route's keptOnRefusal names, and kept only if the refusal is one keptOnRefusal names. An
  * answer that is not a refusal writes them too. A fault keeps nothing. Route handlers only.
  */
 recordRefusal(sql: string, ...params: (string | number | bigint | null | Uint8Array)[]): void;
 /** Core only: the bus's trail, read-only. Undefined for every other engine. */
 readonly trail?: TrailReader;
};

export type RouteHandler = (request: HandlerRequest, context: EngineContext) => Answer;
export type SubscriptionHandler = (event: BusEvent, context: EngineContext) => void;

export type EngineModule = {
 /** An engine id from packages/catalog/events.json. */
 readonly id: string;
 readonly routes: Readonly<Partial<Record<RouteKey, RouteHandler>>>;
 readonly subscriptions: Readonly<Partial<Record<EventKey, SubscriptionHandler>>>;
 /** The schema the runtime runs when it opens this engine's store. Tables whose names start with _runtime_ are the runtime's. */
 readonly store: { readonly schema: string };
 /** Called after the simulated clock moves: deadlines, SLAs, overdue check-ins. */
 readonly tick?: (context: EngineContext) => void;
};

export const defineEngine = <M extends EngineModule>(module: M): M => module;
