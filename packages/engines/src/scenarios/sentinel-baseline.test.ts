/**
 * Sentinel's baselines across four engines: what forms one and what may not, what a value may and may not do,
 * and what a tier raised on one becomes.
 *
 * A reading reached Sentinel only because Devices published it, and Devices publishes only a reading carrying
 * clinical weight as it stands then: so a consumer reading forms nothing, raises nothing, and its event never
 * goes out — while a certified reading opens a baseline that carries the readings and no value, naming the
 * Observation where the value lives in the Passport. A certified device announced stale suspends its baselines
 * until a newer reading, a recall takes its readings out and no tier may then stand on one, and neither of
 * those pages Core: Core binds no handler for a device event, and a reading reaches it only as a tier a named
 * clinician raises, at the rung closed-loop.json names and never tier four.
 *
 * Devices, Safety and Core run for real; Clinical stands in for its review-confirmer setting, the way
 * packages/engines/src/sentinel-and-safeguarding.test.ts stands it in, because Sentinel's baseline settings
 * wait on a clinical review. This file sits beside the engines rather than inside one, because it binds four.
 * Nothing here is a real service: no device is contacted and no patient's reading exists.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import eventsContract from "../../../catalog/events.json" with { type: "json" };
import clinicalContract from "../../../catalog/clinical.json" with { type: "json" };
import {
  MEMORY,
  createClock,
  createRuntime,
  defineEngine,
  ok,
} from "../runtime/index.ts";
import { engine as safety } from "../safety/engine.ts";
import { engine as core } from "../core/engine.ts";
import { engine as devices } from "../devices/engine.ts";
import { MINUTE, recallReasons } from "../devices/domain/contract.ts";
import { devicesByDefault } from "../devices/domain/settings.ts";
import { sentinelOwnerRole } from "../core/domain/contract.ts";
import { SENTINEL_ROUTES, sentinelRefusal } from "../safety/domain/sentinel.ts";
import { sentinelSettingsOf } from "../safety/domain/settings.ts";

const MORNING = "2026-09-15T09:00:00+02:00";
const NURSE = { role: "nurse", ref: "party-synthetic-205" };
const DOCTOR = { role: "doctor", ref: "party-synthetic-401" };
const OPS = { role: "operator", ref: "party-synthetic-801" };
const PATIENT = "subject-synthetic-7";
const OTHER_PATIENT = "subject-synthetic-8";
const defaults = sentinelSettingsOf([]);
type Who = { role: string; ref: string | null };
type TowerItem = {
  loopRef: string;
  sourceEngine: string;
  ownerRole: string;
  alertRef?: string;
};
const events = eventsContract.events as unknown as {
  type: string;
  version: number;
  payload: { field: string }[];
}[];
const declaredPayload = (type: string) =>
  events
    .find((e) => e.type === type && e.version === 1)!
    .payload.map((f) => f.field)
    .sort();

/* Clinical, standing in (Wave 5): who confirms a clinical review is Clinical's review-confirmer setting in force,
   which Safety asks Clinical for. Answered from the contract's own default, so this suite holds Safety's
   settings routes rather than Clinical's store. */
const clinical = defineEngine({
  id: "clinical",
  subscriptions: {},
  store: { schema: "" },
  routes: {
    "GET /v1/clinical/review-confirmers@2": () =>
      ok({
        settingsVersion: 1,
        confirmers: [
          ...clinicalContract.settings.items.find(
            (s) => s.key === clinicalContract.reviews.confirmerSetting,
          )!.default.value,
        ],
      }),
  },
});

function world() {
  const runtime = createRuntime({
    env: { MYTHUSO_ENGINES: "synthetic-data-only" },
    engines: [devices, safety, core, clinical],
    dataDirectory: MEMORY,
    clock: createClock(MORNING),
  });
  const call = (
    route: string,
    who: Who,
    purpose: string,
    fields: Record<string, unknown>,
  ) =>
    runtime.call(route as Parameters<typeof runtime.call>[0], {
      role: who.role,
      ref: who.ref,
      purpose,
      fields,
    });
  let keys = 0;
  const key = () => `key-${++keys}`;
  const register = (deviceClass: "certified" | "consumer", serial: string) => {
    const answer = call(
      "POST /v1/devices/registry@2",
      OPS,
      "treatment",
      deviceClass === "certified"
        ? {
            serial,
            model: "Oximeter",
            firmware: "1.0",
            deviceClass,
            instrumentKind: "pulse-oximeter",
            calibratedOn: "2026-09-01",
          }
        : { serial, model: "Watch", firmware: "1.0", deviceClass },
    );
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    return String(answer.body["deviceRef"]);
  };
  /* A reading asked for and linked to where its value went, as the capturer does. */
  const ingest = (
    deviceRef: string,
    subjectRef: string,
    observationRef: string,
    fields: Record<string, unknown> = {},
  ) => {
    const asked = call("POST /v1/devices/readings@2", NURSE, "treatment", {
      subjectRef,
      deviceRef,
      metric: "pulse",
      unit: "bpm",
      takenAt: new Date(runtime.clock.now()).toISOString(),
      source: "kit-instrument",
      quality: "good",
      consentState: "granted",
      intendedUse: "clinical",
      simulated: false,
      ...fields,
    });
    assert.equal(asked.status, 200, JSON.stringify(asked.body));
    const linked = call(
      "POST /v1/devices/readings/{readingRef}/observation@1",
      NURSE,
      "treatment",
      { readingRef: asked.body["readingRef"], observationRef },
    );
    assert.equal(linked.status, 200, JSON.stringify(linked.body));
    return linked.body["published"] as boolean;
  };
  const state = (subjectRef = PATIENT) =>
    call(SENTINEL_ROUTES.baselines, NURSE, "treatment", { subjectRef });
  const raise = (
    recordEntryRef: string,
    rung: number,
    who: Who = NURSE,
    subjectRef = PATIENT,
    idempotencyKey = key(),
  ) =>
    call(SENTINEL_ROUTES.raise, who, "treatment", {
      idempotencyKey,
      subjectRef,
      recordEntryRef,
      rung,
    });
  const published = (type: string) =>
    runtime.trail
      .all()
      .filter((e) => e.kind === "published" && e.eventKey === type)
      .map((e) => JSON.parse(e.body) as { payload: Record<string, unknown> });
  const delivered = (type: string, engine: string) =>
    runtime.trail
      .all()
      .filter(
        (e) =>
          e.kind === "delivered" && e.eventKey === type && e.engine === engine,
      ).length;
  const tower = () =>
    call(
      "GET /v1/core/loops@2",
      { role: "ops-desk", ref: "desk-synthetic-1" },
      "emergency",
      {},
    ).body["loops"] as TowerItem[];
  return {
    runtime,
    call,
    key,
    register,
    ingest,
    state,
    raise,
    published,
    delivered,
    tower,
  };
}

const refused = (
  answer: { status: number; body: Record<string, unknown> },
  route: keyof typeof SENTINEL_ROUTES,
  id: string,
) => {
  const expected = sentinelRefusal(route, id);
  assert.equal(answer.body["error"], id, JSON.stringify(answer.body));
  assert.equal(answer.body["message"], expected.statement);
  assert.equal(answer.status, expected.status);
};

test("a consumer reading forms nothing and raises nothing, and the certified one that does reach the bus names where its value is, not the value", () => {
  const { runtime, register, ingest, state, raise, published, delivered } =
    world();
  const watch = register("consumer", "WATCH-1");
  assert.equal(
    ingest(watch, PATIENT, "Observation/watch-1", {
      source: "own-device",
      intendedUse: "guidance",
    }),
    false,
    "Devices publishes no consumer reading",
  );
  refused(state(), "baselines", "nothing-heard-for-that-patient");
  refused(
    raise("Observation/watch-1", 1),
    "raise",
    "no-clinical-weight-behind-it",
  );
  assert.equal(published("reading.ingested@1").length, 0);

  const oximeter = register("certified", "MT-OX-1");
  assert.equal(ingest(oximeter, PATIENT, "Observation/ox-1"), true);
  const [heard] = published("reading.ingested@1");
  assert.deepEqual(
    Object.keys(heard!.payload).sort(),
    declaredPayload("reading.ingested"),
    "exactly the fields the event contract declares",
  );
  assert.equal(
    heard!.payload["observationRef"],
    "Observation/ox-1",
    "the event names the Observation where the value lives",
  );
  assert.doesNotMatch(
    JSON.stringify(heard!.payload),
    /value|patientName/i,
    "and carries no value and no name",
  );
  assert.equal(
    delivered("reading.ingested@1", "safety"),
    1,
    "Safety heard it and can hold a baseline",
  );
  assert.equal(
    delivered("reading.ingested@1", "core"),
    0,
    "Core is a declared subscriber that binds no handler: a reading reaches it only as a tier raised on one",
  );

  const read = state();
  assert.equal(read.status, 200, JSON.stringify(read.body));
  assert.equal(read.body["evaluationCode"], "not-evaluated");
  assert.equal(read.body["notEvaluatedReasonCode"], "no-ratified-rule");
  const [baseline, ...others] = read.body["baselines"] as Record<
    string,
    unknown
  >[];
  assert.deepEqual(others, []);
  assert.deepEqual(
    [
      baseline!["metric"],
      baseline!["stateCode"],
      baseline!["countedSoFar"],
      baseline!["neededToForm"],
      baseline!["windowDays"],
    ],
    ["pulse", "forming", 1, defaults.minimumReadings, defaults.windowDays],
    "the consumer reading is in no baseline",
  );
  for (const field of Object.keys(baseline!))
    assert.doesNotMatch(
      field,
      /^(value|values|reading|readings)$/i,
      "no value leaves Sentinel",
    );
  assert.deepEqual(runtime.faults(), []);
  runtime.close();
});

test("a stale device suspends its baseline until a newer reading and a recall takes its readings out, and neither announcement pages Core", () => {
  const {
    runtime,
    call,
    register,
    ingest,
    raise,
    state,
    published,
    delivered,
    tower,
  } = world();
  const oximeter = register("certified", "MT-OX-2");
  ingest(oximeter, PATIENT, "Observation/ox-2a");
  runtime.advance(devicesByDefault.staleAfterMinutes * MINUTE + MINUTE);
  let baseline = (state().body["baselines"] as Record<string, unknown>[])[0]!;
  assert.equal(
    baseline["stateCode"],
    "suspended",
    "Devices announced it under its own interval, and Sentinel suspended",
  );
  assert.ok(typeof baseline["suspendedSince"] === "string");
  assert.equal(published("device.stale@1").length, 1);
  assert.equal(delivered("device.stale@1", "core"), 0);
  assert.deepEqual(
    tower(),
    [],
    "a stale device is a suspension, never a concern: nothing on this bus binds a device event in Core",
  );

  ingest(oximeter, PATIENT, "Observation/ox-2b");
  baseline = (state().body["baselines"] as Record<string, unknown>[])[0]!;
  assert.deepEqual(
    [
      baseline["stateCode"],
      baseline["suspendedSince"],
      baseline["countedSoFar"],
    ],
    ["forming", null, 2],
    "a newer reading lifts the suspension",
  );

  const recalled = call(
    "POST /v1/devices/registry/{deviceRef}/recall@2",
    OPS,
    "audit",
    {
      deviceRef: oximeter,
      reasonCode: recallReasons[0]!.id,
      effectiveFrom: new Date(runtime.clock.now()).toISOString(),
    },
  );
  assert.equal(recalled.status, 200, JSON.stringify(recalled.body));
  baseline = (state().body["baselines"] as Record<string, unknown>[])[0]!;
  assert.deepEqual(
    [baseline["countedSoFar"], baseline["leftByRecall"]],
    [0, 2],
    "every reading from the recalled device left, and none was deleted",
  );
  refused(raise("Observation/ox-2a", 3), "raise", "reading-left-by-recall");
  assert.deepEqual(tower(), []);
  assert.deepEqual(runtime.faults(), []);
  runtime.close();
});

test("a tier three raised by a named clinician opens one Core alert owned by the doctor, a tier two opens nothing, and tier four is refused", () => {
  const {
    runtime,
    register,
    ingest,
    raise,
    state,
    published,
    delivered,
    tower,
  } = world();
  ingest(register("certified", "MT-OX-3"), PATIENT, "Observation/ox-3");

  refused(raise("Observation/ox-3", 4), "raise", "tier-four-not-in-this-build");
  refused(raise("Observation/ox-3", 5), "raise", "tier-four-not-in-this-build");
  refused(
    raise("Observation/ox-3", 0),
    "raise",
    "rung-not-on-the-sentinel-ladder",
  );
  refused(
    raise("Observation/ox-3", 3, NURSE, OTHER_PATIENT),
    "raise",
    "not-this-patients-reading",
  );
  assert.deepEqual(tower(), [], "a refused tier pages nobody");

  const two = raise("Observation/ox-3", 2);
  assert.equal(two.status, 200, JSON.stringify(two.body));
  assert.deepEqual(
    [two.body["toldCode"], two.body["evaluationCode"]],
    ["nurse-queue", "not-evaluated"],
  );
  assert.deepEqual(tower(), [], "a tier two is the nurse's own queue");

  const three = raise("Observation/ox-3", 3, DOCTOR, PATIENT, "three-once");
  assert.equal(three.status, 200, JSON.stringify(three.body));
  assert.equal(three.body["toldCode"], "core-loop");
  assert.equal(
    raise("Observation/ox-3", 3, DOCTOR, PATIENT, "three-once").status,
    200,
    "the same tier retried",
  );
  const [concern, ...others] = tower();
  assert.deepEqual(others, [], "one tier raised is one alert");
  assert.deepEqual(
    [concern!.sourceEngine, concern!.ownerRole, Boolean(concern!.alertRef)],
    ["safety", sentinelOwnerRole, true],
  );

  const rungsHeard = published("sentinel.rung_raised@1");
  assert.deepEqual(
    rungsHeard.map((e) => e.payload["rung"]),
    [2, 3],
    "every rung raised reaches the bus",
  );
  assert.equal(
    delivered("sentinel.rung_raised@1", "core"),
    rungsHeard.length,
    "and every one is delivered to Core, which opens an alert only from the third",
  );
  assert.deepEqual(
    Object.keys(rungsHeard.at(-1)!.payload).sort(),
    declaredPayload("sentinel.rung_raised"),
    "the rung names the concern and the record entry, never what was measured",
  );
  const raised = state().body["raised"] as Record<string, unknown>[];
  assert.deepEqual(
    raised.map((r) => [r["rung"], r["raisedByRole"]]),
    [
      [3, "doctor"],
      [2, "nurse"],
    ],
    "newest first, by role and never by name",
  );
  assert.deepEqual(runtime.faults(), []);
  runtime.close();
});
