import test from "node:test";
import assert from "node:assert/strict";
import { captureTuningFor, contractDefaults, knownRegister, monthlyCeiling, readingFor } from "./speech-settings.ts";
import voice from "../../../../packages/catalog/voice.json" with { type: "json" };
import { speechSettingsByDefault, SPEECH_SETTING_KEYS } from "../../../../packages/engines/src/assistant/domain/settings.ts";

/* The service's reading of the speech settings, 28 September 2026: the contract's defaults until the
   service keeps a history; a presentation register gets its provider and every knob and a clinical one
   the default with the delivery mechanics alone; the door's register question is the contract's; and
   the monthly ceiling admits, counts, and rolls over with the calendar. */

test("the defaults the service reads are the contract's, every key of which the reader names", () => {
  const keys = voice.settings.items.map((s) => s.key);
  for (const key of SPEECH_SETTING_KEYS) assert.ok(keys.includes(key), `${key} is a setting in voice.json`);
  const inForce = contractDefaults();
  assert.equal(inForce.settingsVersion, 1);
  assert.equal(inForce.providerByClass.routine, "azure-speech");
  assert.equal(inForce.stretchTimeoutSeconds * 1000, 15 * 1000, "the stretch timeout the seam has always had");
  assert.equal(inForce.captureTimeoutSeconds * 1000, 30 * 1000);
  assert.equal(inForce.ownVoice, "off");
});

test("a presentation register reads through its provider with every knob; a clinical register, clinical assist and no register read through the default with the mechanics alone", () => {
  const routine = readingFor(contractDefaults, "routine");
  assert.equal(routine.provider, "azure-speech");
  assert.equal(routine.fallbackToDefault, true);
  assert.ok(routine.tuning.presentation, "the knobs travel");
  assert.equal(routine.tuning.azureAudioQuality, speechSettingsByDefault.azure.audioQuality);
  for (const register of ["emergency", "refusal", "escalation", "clinical-assist", null, "nothing-the-contract-has"]) {
    const reading = readingFor(contractDefaults, register);
    assert.equal(reading.provider, null, `${register} names no provider`);
    assert.equal(reading.tuning.presentation, undefined, `${register} carries no knob`);
    assert.equal(reading.tuning.ownVoice, false);
    assert.equal(reading.tuning.timeoutMs, 15 * 1000, "the mechanics still reach it");
  }
  for (const c of voice.queryClasses) assert.equal(knownRegister(c.id), true);
  assert.equal(knownRegister("routine "), false, "the door trims before it asks; this does not");
  assert.equal(knownRegister(""), false);
  assert.deepEqual(captureTuningFor(contractDefaults), { timeoutMs: 30 * 1000, profanity: "raw" });
});

test("the monthly ceiling admits while there is room, counts what was read, and starts again with the calendar month", () => {
  const settings = () => ({ ...speechSettingsByDefault, monthlyCeilingCharacters: 100 });
  const ceiling = monthlyCeiling(settings);
  const september = Date.UTC(2026, 8, 15, 12);
  assert.equal(ceiling.admits(60, september), true);
  ceiling.count(60, september);
  assert.equal(ceiling.used(september), 60);
  assert.equal(ceiling.admits(40, september), true, "exactly to the ceiling is admitted");
  assert.equal(ceiling.admits(41, september), false, "one over is not");
  ceiling.count(40, september);
  assert.equal(ceiling.admits(1, september), false);
  const october = Date.UTC(2026, 9, 1, 12);
  assert.equal(ceiling.admits(100, october), true, "a new month is a new count");
  assert.equal(ceiling.used(october), 0);
  /* The ceiling in force is asked afresh each time, so a change reaches the next reading. */
  let limit = 10;
  const moving = monthlyCeiling(() => ({ ...speechSettingsByDefault, monthlyCeilingCharacters: limit }));
  assert.equal(moving.admits(20, october), false);
  limit = 50;
  assert.equal(moving.admits(20, october), true);
});

test("the month's count is kept where a store is given, read back by the next process, and not carried into the next month", () => {
  /* 1 October 2026: a restart used to hand the month its whole budget again. */
  const settings = () => ({ ...speechSettingsByDefault, monthlyCeilingCharacters: 100 });
  let kept: { month: string; used: number } | null = null;
  const store = { load: () => kept, save: (value: { month: string; used: number }) => void (kept = { ...value }) };
  const september = Date.UTC(2026, 8, 15, 12);
  const first = monthlyCeiling(settings, store);
  const held = first.reserve(70, september);
  assert.ok(held);
  assert.equal(first.admits(31, september), false, "what is held counts while it waits");
  assert.equal(first.reserve(31, september), null);
  first.settle(held, true);
  assert.deepEqual(kept, { month: "2026-09", used: 70 }, "a billed reading is written down");
  const unbilled = first.reserve(20, september)!;
  first.settle(unbilled, false);
  assert.equal(first.used(september), 70, "an unbilled reading is given back, not counted");
  /* The next process: the same store, the same month. */
  const second = monthlyCeiling(settings, store);
  assert.equal(second.used(september), 70);
  assert.equal(second.admits(31, september), false, "a restart does not reopen the month");
  assert.equal(second.admits(30, september), true);
  /* The month after: what was kept is September's, and October starts at nothing. */
  const october = monthlyCeiling(settings, store);
  assert.equal(october.used(Date.UTC(2026, 9, 2, 12)), 0);
  /* A store that cannot write does not stop a billed reading being counted in memory. */
  const broken = monthlyCeiling(settings, { load: () => { throw new Error("unreadable"); }, save: () => { throw new Error("disk full"); } });
  const r = broken.reserve(10, september)!;
  assert.doesNotThrow(() => broken.settle(r, true));
  assert.equal(broken.used(september), 10);
});
