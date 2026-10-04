import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openFounderState } from "./founder-state.ts";
import { openSettingsHistory, SETTINGS_FILE } from "./settings-history.ts";
import { selectedSpeech } from "./speech.ts";
import { assistantSettings } from "../../../../packages/engines/src/assistant/domain/settings.ts";
import settingsContract from "../../../../packages/catalog/settings.json" with { type: "json" };

/* The founder's settings history (lib/settings-history.ts), held to packages/catalog/
   founder-access.json#settings: a change obeys the shared rules and is refused with the shared id; an
   accepted change is one appended line, 0600, replayed by the next process; what is in force is the
   defaults with the history replayed; a saved "male" reaches a presentation register's reading and never
   an emergency's; and without a state directory nothing is written. */

const T0 = Date.UTC(2026, 8, 28, 9, 0, 0);
const sandbox = () => {
  const dir = mkdtempSync(join(tmpdir(), "mythuso-settings-"));
  return { state: openFounderState(dir), dir, done: () => rmSync(dir, { recursive: true }) };
};
const AZURE = { AZURE_SPEECH_KEY: "fixturespeechkey0123456789abcdef", AZURE_SPEECH_REGION: "southafricanorth" };
const sharedStatus = (id: string) => settingsContract.refusals.find((r) => r.route === "change" && r.id === id)!.status;

/* A fetch that records the SSML Azure would have been sent and answers a byte of audio. */
const recording = () => {
  const bodies: string[] = [];
  const impl = (async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    bodies.push(String(init?.body ?? ""));
    return new Response(new Uint8Array([1]), { status: 200 });
  }) as typeof fetch;
  return { bodies, impl };
};

test("a fresh history is the contract's defaults, and describes every setting in the shared read shape", () => {
  const box = sandbox();
  try {
    const history = openSettingsHistory(box.state);
    assert.equal(history.persisted, true);
    const described = history.describe();
    assert.equal(described.settingsVersion, 1);
    assert.equal(described.settings.length, assistantSettings.block.items.length);
    assert.deepEqual(described.history, []);
    const routine = described.settings.find((s) => s.setting === "presentation-voice-routine")!;
    assert.equal(routine.inForce, "male");
    assert.equal(routine.default, "male");
    assert.equal(routine.setAtVersion, 1);
    assert.deepEqual(routine.changedBy, ["admin"]);
    assert.equal(routine.reviewRequired, null);
    assert.equal(history.presentationVoice().byClass.routine, "male");
    /* The read shape's fields, exactly the shared read route's rows. */
    const sharedRows = (settingsContract.routes.read.response.find((f) => f.field === "settings") as { fields: { field: string }[] }).fields.map((f) => f.field).sort();
    assert.deepEqual(Object.keys(routine).sort(), sharedRows);
  } finally {
    box.done();
  }
});

test("a change obeys the shared rules — refused by the shared id — and an accepted one is appended, 0600, and read back after a restart", () => {
  const box = sandbox();
  try {
    const history = openSettingsHistory(box.state);
    const refusals = [
      [{ setting: "no-such-setting", from: "female", to: "male", reason: "why", expectedVersion: undefined }, "setting-not-known"],
      [{ setting: "presentation-voice-routine", from: "female", to: "male", reason: "", expectedVersion: undefined }, "setting-change-without-reason"],
      [{ setting: "presentation-voice-routine", from: "male", to: "neutral", reason: "why", expectedVersion: undefined }, "setting-out-of-range"],
      [{ setting: "presentation-voice-routine", from: "male", to: 3, reason: "why", expectedVersion: undefined }, "setting-value-wrong-type"],
      [{ setting: "presentation-voice-routine", from: "male", to: "male", reason: "why", expectedVersion: undefined }, "setting-unchanged"],
      [{ setting: "presentation-voice-routine", from: "female", to: "male", reason: "why", expectedVersion: undefined }, "settings-version-stale"],
      [{ setting: "presentation-voice-routine", from: "female", to: "male", reason: "why", expectedVersion: 7 }, "settings-version-stale"],
      [{ setting: "spoken-answer-monthly-ceiling-characters", from: 2000000, to: 0, reason: "why", expectedVersion: undefined }, "setting-not-above-zero"],
    ] as const;
    for (const [request, id] of refusals) {
      const outcome = history.propose(request, T0);
      assert.deepEqual(outcome, { ok: false, refusalId: id }, id);
      assert.ok(sharedStatus(id) >= 400, `${id} is a shared change refusal`);
    }
    assert.equal(existsSync(join(box.dir, SETTINGS_FILE)), false, "a refused change writes nothing — not even the file");
    const accepted = history.propose({ setting: "presentation-voice-routine", from: "male", to: "female", reason: "The founder prefers the female voice for routine answers.", expectedVersion: undefined }, T0);
    assert.ok(accepted.ok);
    assert.equal(accepted.change.settingsVersion, 2);
    assert.equal(accepted.change.byRole, "admin");
    assert.equal(accepted.change.byRef, "founder");
    assert.equal(accepted.change.at, T0);
    assert.equal(history.presentationVoice().byClass.routine, "female");
    assert.equal(history.presentationVoice().byClass.navigation, "male", "one register changed, not four");
    const lines = readFileSync(join(box.dir, SETTINGS_FILE), "utf8").trim().split("\n");
    assert.equal(lines.length, 1);
    assert.equal(JSON.parse(lines[0]!).setting, "presentation-voice-routine");
    assert.equal(statSync(join(box.dir, SETTINGS_FILE)).mode & 0o777, 0o600);
    /* A second change, then the file replayed by a new process. */
    const second = history.propose({ setting: "azure-presentation-speed-percent", from: 100, to: 110, reason: "A little faster.", expectedVersion: 2 }, T0 + 1000);
    assert.ok(second.ok);
    const restarted = openSettingsHistory(box.state);
    assert.equal(restarted.snapshot().settingsVersion, 3);
    assert.equal(restarted.presentationVoice().byClass.routine, "female");
    assert.equal(restarted.speech().azure.speedPercent, 110);
    assert.equal(restarted.describe().history.length, 2);
    assert.equal(restarted.describe().history[0]!.at, new Date(T0).toISOString());
  } finally {
    box.done();
  }
});

test("a history with a gap, a repeat or a line that is not a change stops the service starting", () => {
  const box = sandbox();
  try {
    const change = (settingsVersion: number) => JSON.stringify({ settingsVersion, setting: "presentation-voice-routine", from: "female", to: "male", reason: "r", byRole: "admin", byRef: "founder", at: T0 });
    writeFileSync(join(box.dir, SETTINGS_FILE), `${change(3)}\n`, { mode: 0o600 });
    assert.throws(() => openSettingsHistory(box.state), /goes from version 1 to 3/);
    writeFileSync(join(box.dir, SETTINGS_FILE), `${change(2)}\n${change(2)}\n`, { mode: 0o600 });
    assert.throws(() => openSettingsHistory(box.state), /never edited/);
    writeFileSync(join(box.dir, SETTINGS_FILE), `{"hello":"world"}\n`, { mode: 0o600 });
    assert.throws(() => openSettingsHistory(box.state), /not a settings change/);
    writeFileSync(join(box.dir, SETTINGS_FILE), `not json\n`, { mode: 0o600 });
    assert.throws(() => openSettingsHistory(box.state), /not JSON/);
  } finally {
    box.done();
  }
});

test("without a state directory the history is the defaults and every change is refused as unavailable, before the shared rules", () => {
  const history = openSettingsHistory(null);
  assert.equal(history.persisted, false);
  assert.equal(history.presentationVoice().byClass.admin, "male");
  assert.deepEqual(history.propose({ setting: "presentation-voice-routine", from: "female", to: "male", reason: "why", expectedVersion: undefined }, T0), { ok: false, refusalId: "founder-state-unavailable" });
  assert.deepEqual(history.propose({ setting: "nonsense", from: 1, to: 2, reason: "", expectedVersion: undefined }, T0), { ok: false, refusalId: "founder-state-unavailable" });
});

test("the speak seam reads the history: a saved male voice reads a presentation register, and an emergency is read in the platform's default whatever the history says", async () => {
  const box = sandbox();
  try {
    const history = openSettingsHistory(box.state);
    assert.ok(history.propose({ setting: "presentation-voice-routine", from: "male", to: "female", reason: "The founder's voice test.", expectedVersion: undefined }, T0).ok);
    assert.ok(history.propose({ setting: "presentation-voice-admin", from: "male", to: "female", reason: "And in the Control Tower.", expectedVersion: 2 }, T0).ok);
    const { bodies, impl } = recording();
    const speech = selectedSpeech(impl, AZURE, history.speech, () => T0, () => AZURE, history.presentationVoice);
    const routine = await speech.synthesize({ text: "A visit costs from R399.", language: "en-ZA", register: "routine" });
    assert.ok(routine.ok && routine.voice === "en-ZA-LeahNeural", "a saved change off the male default is what the next reading uses");
    assert.match(bodies[0]!, /<voice name="en-ZA-LeahNeural">/);
    const admin = await speech.synthesize({ text: "Settings saved.", language: "af", register: "admin" });
    assert.ok(admin.ok && admin.voice === "af-ZA-AdriNeural", "per language: the label resolves to that language's female voice");
    const navigation = await speech.synthesize({ text: "Bookings are on the left.", language: "en-ZA", register: "navigation" });
    assert.ok(navigation.ok && navigation.voice === "en-ZA-LukeNeural", "a register the founder did not change keeps the male default");
    const emergency = await speech.synthesize({ text: "Call 10177 now.", language: "en-ZA", register: "emergency" });
    assert.ok(emergency.ok && emergency.voice === "en-ZA-LeahNeural", "an emergency answer ignores the history");
    const refusal = await speech.synthesize({ text: "GilbertOne cannot answer that.", language: "en-ZA", register: "refusal" });
    assert.ok(refusal.ok && refusal.voice === "en-ZA-LeahNeural");
    const none = await speech.synthesize({ text: "Hello.", language: "en-ZA" });
    assert.ok(none.ok && none.voice === "en-ZA-LeahNeural", "no register: the platform default");
    const named = await speech.synthesize({ text: "Hello.", language: "en-ZA", voice: "en-ZA-LukeNeural", register: "routine" });
    assert.ok(named.ok && named.voice === "en-ZA-LukeNeural", "a caller that names a voice is honoured over the setting");
    /* A change made after the seam was built is read at the next answer: the source is a function. */
    assert.ok(history.propose({ setting: "presentation-voice-routine", from: "female", to: "male", reason: "Back again.", expectedVersion: 3 }, T0).ok);
    const back = await speech.synthesize({ text: "A visit costs from R399.", language: "en-ZA", register: "routine" });
    assert.ok(back.ok && back.voice === "en-ZA-LukeNeural");
    /* And the contract's defaults, handed nothing, read exactly as before the history existed. */
    const defaults = selectedSpeech(impl, AZURE);
    const before = await defaults.synthesize({ text: "Hello.", language: "en-ZA", register: "routine" });
    assert.ok(before.ok && before.voice === "en-ZA-LukeNeural");
  } finally {
    box.done();
  }
});
