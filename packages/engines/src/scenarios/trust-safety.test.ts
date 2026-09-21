/**
 * Verify at the door, held across two engines: a code that runs out of tries publishes one mismatch and reports
 * the incident through the register the contract names — POST /v1/safety/incidents@3 — which the catalog itself
 * keeps proposed, so Safety binds no incidents route, the runtime answers the report through the contract mock
 * with engine:trust among the version's callers, and the mismatch completes rather than being rolled back. Where
 * an engine does answer as the register, it is told the incident in the contract's own words and nothing else.
 * A complaint about a nurse changes no badge and deciding one publishes nothing, and one lapsed clearance
 * answers the same way at every door: no badge, no shift, no code.
 *
 * Verify and Safety run for real, except in the second test, where a recording Safety stands in the way
 * packages/engines/src/trust/engine.test.ts stands one in, so the incident's words are checked where they
 * arrive. This file sits beside the engines rather than inside one, because it binds two. Nothing here is a
 * real service: no door is opened and no complaint was made.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import eventsContract from "../../../catalog/events.json" with { type: "json" };
import trustCatalog from "../../../catalog/trust.json" with { type: "json" };
import safetyApi from "../../../catalog/apis/safety.json" with { type: "json" };
import {
  MEMORY,
  createClock,
  createRuntime,
  defineEngine,
  ok,
  type EngineModule,
  type RouteKey,
} from "../runtime/index.ts";
import { engine as trust } from "../trust/engine.ts";
import { engine as safety } from "../safety/engine.ts";
import { MINUTE, refusal, verifyInService } from "../trust/domain/contract.ts";
import { trustInForce } from "../trust/domain/settings.ts";

const START = "2026-09-15T08:00:00+02:00";
const defaults = trustInForce([]);
const BADGE = "GET /v1/trust/parties/{partyId}/badge@1";
const GATES = "GET /v1/trust/parties/{partyId}/gates@1";
const SHIFT = "POST /v1/trust/shift-starts@2";
const CODE = "POST /v1/trust/door-codes@1";
const TRY = "POST /v1/trust/door-verifications@2";
const ANSWER = "POST /v1/trust/door-verifications/{appointmentRef}/answer@1";
const COMPLAIN = "POST /v1/trust/complaints@2";
const DECIDE = "POST /v1/trust/complaints/{complaintRef}/decide@1";
const INCIDENTS = "POST /v1/safety/incidents@3";
const incidents = safetyApi.routes.find(
  (route) => route.path === "/v1/safety/incidents" && route.version === 3,
)!;
type DeclaredEvent = {
  type: string;
  version: number;
  payload: { field: string }[];
};
/* The bus's declarations live across the three sources events.json names: trust.bus events in trust.json, the rest here. */
const events = [
  ...(eventsContract.events as unknown as DeclaredEvent[]),
  ...(trustCatalog.events as unknown as DeclaredEvent[]),
];
const declaredPayload = (type: string) =>
  events
    .find((entry) => entry.type === type && entry.version === 1)!
    .payload.map((field) => field.field)
    .sort();

type Who = {
  role: string;
  ref: string | null;
  purpose: string;
  fields: Record<string, unknown>;
};
type Reply = { status: number; body: Record<string, unknown> };
const as = (
  role: string,
  ref: string | null,
  purpose: string,
  fields: Record<string, unknown> = {},
): Who => ({ role, ref, purpose, fields });
const refused = (answer: Reply, id: string) => {
  assert.equal(answer.body["error"], id, JSON.stringify(answer.body));
  assert.equal(answer.body["message"], refusal(id).statement);
  assert.equal(answer.status, refusal(id).status);
};

/* A Safety that records the reports it is sent, so the incident's words are checked where they arrive — the
   way packages/engines/src/trust/engine.test.ts stands one in. */
function registerDesk() {
  const reports: Record<string, unknown>[] = [];
  const safety = defineEngine({
    id: "safety",
    store: { schema: "" },
    subscriptions: {},
    routes: {
      "POST /v1/safety/incidents@3": (request) => {
        reports.push({ ...request.fields });
        return ok({
          incidentId: `incident-${reports.length}`,
          notificationOwed: false,
        });
      },
    },
  });
  return { safety, reports };
}

function world(safetyEngine: EngineModule = safety) {
  const runtime = createRuntime({
    env: { MYTHUSO_ENGINES: "synthetic-data-only" },
    engines: [trust, safetyEngine],
    dataDirectory: MEMORY,
    clock: createClock(START),
  });
  const call = (route: string, who: Who) =>
    runtime.call(route as RouteKey, {
      role: who.role,
      ref: who.ref,
      purpose: who.purpose,
      fields: who.fields,
    });
  const published = (type: string) =>
    runtime.trail
      .all()
      .filter((entry) => entry.kind === "published" && entry.eventKey === type)
      .map(
        (entry) =>
          JSON.parse(entry.body) as { payload: Record<string, unknown> },
      );
  const delivered = (type: string, engine: string) =>
    runtime.trail
      .all()
      .filter(
        (entry) =>
          entry.kind === "delivered" &&
          entry.eventKey === type &&
          entry.engine === engine,
      ).length;
  return { runtime, call, published, delivered };
}

test("a code that runs out of tries publishes one mismatch and reports the incident to the register the contract names, which this build answers through the runtime's mock because Safety binds no incidents route", () => {
  const { runtime, call, published, delivered } = world();
  const code = call(
    CODE,
    as("nurse", "N-205", "vetting", { appointmentRef: "appt-synthetic-1" }),
  );
  assert.equal(code.status, 200, JSON.stringify(code.body));
  const digits = String(code.body["doorCode"]);
  assert.match(
    digits,
    new RegExp(`^\\d{${verifyInService.door.digits}}$`),
    "the code is digits and only digits",
  );
  assert.equal(code.body["attemptsAllowed"], defaults.doorCodeAttempts);
  assert.equal(
    Date.parse(String(code.body["expiresAt"])) - Date.parse(START),
    defaults.doorCodeMinutes * MINUTE,
    "the code keeps the lifetime in force when it was asked for",
  );

  /* The register is the contract's @3, whose own note says it stays proposed: Safety's routes are its check-ins,
    panics, SOS and safeguarding, and no engine binds an incidents route. So the runtime hands the call to the
    contract mock — how Verify's report has always been answered — and the mock enforces the version's callers,
    engine:trust among them. */
  assert.ok(
    !runtime.bound().includes(INCIDENTS as RouteKey),
    "Safety binds no incidents route in this build",
  );
  assert.equal(
    incidents.status,
    "proposed",
    "and the catalog itself keeps the register proposed",
  );
  assert.ok(
    (incidents.callers as string[]).includes("engine:trust"),
    "while naming Verify as a caller of the version",
  );
  const direct = call(
    INCIDENTS,
    as("engine:trust", null, "audit", {
      kind: "door",
      whatHappened: "synthetic",
      informationReached: false,
    }),
  );
  assert.equal(
    direct.answeredBy,
    "mock",
    "nothing invents a register: the contract mock answers",
  );
  assert.equal(direct.status, 200, JSON.stringify(direct.body));
  assert.deepEqual(
    Object.keys(direct.body).sort(),
    incidents.response.map((field) => field.field).sort(),
    "with exactly the fields the contract declares",
  );

  const wrong = digits === "000000" ? "111111" : "000000";
  let last: Reply | undefined;
  for (let i = 0; i < defaults.doorCodeAttempts; i++)
    last = call(
      TRY,
      as("patient", "subject-synthetic-1", "vetting", {
        appointmentRef: "appt-synthetic-1",
        doorCode: wrong,
      }),
    );
  assert.deepEqual(
    last!.body,
    { codeMatched: false, attemptsLeft: 0, incidentRaised: true },
    "the last wrong try is a mismatch the register answered for",
  );
  const mismatches = published("trust.door.mismatched@1");
  assert.equal(mismatches.length, 1, "one mismatch, published once");
  assert.deepEqual(mismatches[0]!.payload, {
    appointmentRef: "appt-synthetic-1",
    reasonCode: "attempts-used",
  });
  assert.deepEqual(
    Object.keys(mismatches[0]!.payload).sort(),
    declaredPayload("trust.door.mismatched"),
  );
  assert.equal(
    delivered("trust.door.mismatched@1", "safety"),
    0,
    "Safety is a declared subscriber that binds no handler for it in this build: the register, not a subscription, is what the mismatch reports to",
  );
  refused(
    call(
      TRY,
      as("patient", "subject-synthetic-1", "vetting", {
        appointmentRef: "appt-synthetic-1",
        doorCode: digits,
      }),
    ),
    "door-check-closed",
  );
  assert.ok(
    runtime.trail.all().every((entry) => !entry.body.includes(digits)),
    "the code itself never reaches the trail",
  );
  assert.deepEqual(runtime.faults(), []);
  runtime.close();
});

test("a patient who says she is not my nurse is one mismatch the register is told in the contract's words", () => {
  const desk = registerDesk();
  const { runtime, call, published } = world(desk.safety);
  const no = call(
    ANSWER,
    as("patient", "subject-synthetic-1", "vetting", {
      appointmentRef: "appt-synthetic-4",
      answer: "not-my-nurse",
    }),
  );
  assert.deepEqual(no.body, { verified: false, incidentRaised: true });
  assert.equal(
    published("trust.door.mismatched@1").length,
    1,
    "the mismatch is published once",
  );
  const { kind, whatHappened, informationReached } =
    verifyInService.door.incident;
  assert.deepEqual(
    desk.reports,
    [{ kind, whatHappened, informationReached }],
    "the register is told the contract's incident, and nothing else",
  );
  refused(
    call(
      ANSWER,
      as("patient", "subject-synthetic-1", "vetting", {
        appointmentRef: "appt-synthetic-5",
        answer: "she-is-my-nurse",
      }),
    ),
    "door-answer-before-code",
  );
  assert.deepEqual(runtime.faults(), []);
  runtime.close();
});

test("a complaint about a nurse changes no badge and publishes nothing when it is decided, and the nurse whose clearance lapsed can neither start a shift nor show a door code", () => {
  const { runtime, call, published } = world();
  const badge = () =>
    call(
      BADGE,
      as("patient", "subject-synthetic-1", "dispatch", { partyId: "N-205" }),
    ).body;
  const before = badge();
  assert.deepEqual(
    Object.keys(before).sort(),
    ["badgeTier", "verified"],
    "a badge is a tier and whether it is current, and nothing else",
  );

  const made = call(
    COMPLAIN,
    as("patient", "subject-synthetic-1", "vetting", {
      partyRef: "N-205",
      appointmentRef: "appt-synthetic-1",
      categoryCode: "conduct",
      whatHappened: "She was short with my mother.",
    }),
  );
  assert.equal(made.status, 200, JSON.stringify(made.body));
  const complaintRef = made.body["complaintRef"] as string;
  const received = published("trust.complaint.received@1");
  assert.equal(received.length, 1);
  assert.deepEqual(
    Object.keys(received[0]!.payload).sort(),
    declaredPayload("trust.complaint.received"),
  );
  assert.deepEqual(badge(), before, "a complaint arriving changes no badge");

  const eventsBefore = runtime.trail
    .all()
    .filter((entry) => entry.kind === "published").length;
  refused(
    call(
      DECIDE,
      as("admin", "A-901", "vetting", {
        complaintRef,
        outcomeCode: "upheld",
        reason: "Two accounts agree.",
        scoreChange: -10,
      }),
    ),
    "complaint-decision-carries-no-weight",
  );
  assert.equal(
    call(
      DECIDE,
      as("admin", "A-901", "vetting", {
        complaintRef,
        outcomeCode: "upheld",
        reason: "Two accounts agree.",
      }),
    ).status,
    200,
  );
  assert.equal(
    runtime.trail.all().filter((entry) => entry.kind === "published").length,
    eventsBefore,
    "deciding a complaint publishes nothing",
  );
  assert.deepEqual(badge(), before, "and an upheld complaint changes no badge");
  refused(
    call(
      DECIDE,
      as("admin", "A-901", "vetting", {
        complaintRef,
        outcomeCode: "not-upheld",
        reason: "Changed my mind.",
      }),
    ),
    "complaint-already-decided",
  );

  /* The same lapsed clearance answers at every door: the badge route, the shift start, and the code the nurse
    would show. The reviewer instead sees where the file stopped — a review that declined a reference never
    reaches training. */
  refused(
    call(
      BADGE,
      as("patient", "subject-synthetic-1", "dispatch", { partyId: "N-204" }),
    ),
    "no-current-verification",
  );
  refused(
    call(SHIFT, as("nurse", "N-204", "vetting")),
    "no-current-verification-to-start",
  );
  refused(
    call(
      CODE,
      as("nurse", "N-204", "vetting", { appointmentRef: "appt-synthetic-6" }),
    ),
    "no-badge-to-show-at-a-door",
  );
  const gates = call(
    GATES,
    as("admin", "A-901", "vetting", { partyId: "N-209" }),
  );
  assert.equal(gates.status, 200, JSON.stringify(gates.body));
  const rows = gates.body["gates"] as { gate: string; state: string }[];
  assert.equal(
    rows.find((row) => row.gate === "train")?.state,
    "not-reached",
    "a declined reference stops the file before training",
  );
  assert.deepEqual(runtime.faults(), []);
  runtime.close();
});
