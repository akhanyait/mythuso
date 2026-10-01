import {
  assistantSettings,
  presentationVoiceOf,
  speechSettingsOf,
  type PresentationVoiceInForce,
  type SpeechSettingsInForce,
} from "../../../../packages/engines/src/assistant/domain/settings.ts";
import {
  proposeChange,
  rolesThatChange,
  sameValue,
  snapshotOf,
  type Change,
  type Refusal,
  type Setting,
  type Snapshot,
} from "../../../../packages/engines/src/settings/shape.ts";
import contract from "../../../../packages/catalog/founder-access.json" with { type: "json" };
import type { FounderState } from "./founder-state.ts";

/* The founder's settings history, 28 September 2026 (packages/catalog/founder-access.json#settings).

   RECORDED, NOT SIGNED. It was called "founder-signed" until 1 October 2026, and it is not: each line
   records the administrator role and the founder as the reference because the change was made inside
   the founder's session, and nothing about the line proves that afterwards. There is no signature and
   no MAC; whoever can write the state directory — root, or this process — can write a line the replay
   will accept. What protects it is the directory's 0700 and the file's 0600, the same as the vault's
   metadata. A keyed MAC under the vault key would make an edit detectable, and is not built.

   THE FACT THIS FIXES. A setting saved in the Control Tower lived in that browser tab, and the speak
   route read the contract's defaults — so the founder made every presentation voice male, pressed
   test, and heard a female voice. From today the assistant service keeps its own history of accepted
   changes, and the speak route reads what is in force from it.

   THE RULES ARE NOT THIS FILE'S. Every rule a change obeys — the setting exists, a reason is given, the
   value is of the setting's kind, within its bounds, one of its allowed choices, not already in force,
   made against the version in force — is packages/engines/src/settings/shape.ts's proposeChange(), the
   same function the web preview and every engine's settings route call; so a change this route refuses
   is refused with the shared sentence, word for word, and a change it accepts is one the preview would
   have accepted. What this file decides is only where the history lives and who is recorded: the
   administrator role the block names, with the founder as the reference, because the founder is the
   only administrator today and the founder's session is the only authentication this service has.

   WHAT IS IN FORCE IS A REPLAY. Nothing here stores a value in force. The file is one accepted change
   per line, in the shared Change shape, and the values in force are always the contract's defaults with
   those lines replayed in version order — snapshotOf() — read afresh for every question, so a change
   appended a moment ago is what the next spoken answer reads. A file with a gap or a repeat throws at
   start-up, as the shared code says it must: a history read around is a version that no longer means
   one thing, and the service would rather not start than speak under it.

   WHAT A CLINICAL REGISTER READS. Nothing from here. presentationVoiceOf() answers the four presentation
   classes alone, and tuningFor() hands every other register the platform default with no knob; a
   founder's "male" reaches a routine answer and never an emergency one, which is voice.json's own rule
   and not a decision this file could take. */

export type SettingsHistory = {
  /* Whether this server keeps a history at all: true where the state directory exists. */
  readonly persisted: boolean;
  history(): Change[];
  snapshot(): Snapshot;
  /* The speech settings in force, for the speak route's seam. Asked afresh on every reading. */
  speech(): SpeechSettingsInForce;
  /* Which of a language's two voices reads each presentation register, in force now. */
  presentationVoice(): PresentationVoiceInForce;
  /* The shared read shape: the version, every setting described, and the history. */
  describe(): { settingsVersion: number; settings: DescribedSetting[]; history: HistoryRow[] };
  /* One change, through the shared rules, appended on acceptance. */
  propose(request: ChangeRequest, now: number): ChangeOutcome;
};

export type ChangeRequest = {
  setting: unknown;
  from: unknown;
  to: unknown;
  reason: unknown;
  expectedVersion: unknown;
};
/* A refusal travels as the contract's id alone: server.ts answers it with the contract's own status
   and sentence through refuse(), so neither is typed here. */
export type ChangeOutcome = { ok: true; change: Change } | { ok: false; refusalId: string };

export type HistoryRow = Omit<Change, "at"> & { at: string };
export type DescribedSetting = {
  setting: string;
  label: string;
  help: string;
  type: string;
  unit: string | null;
  inForce: unknown;
  setAtVersion: number;
  default: unknown;
  provenance: Record<string, unknown>;
  limits: Record<string, unknown>;
  changedBy: string[];
  appliesTo: string;
  guardrail: string | null;
  reviewRequired: string | null;
  reviewed: null;
};

export const SETTINGS_FILE: string = contract.state.settingsFile;
const BY_ROLE: string = contract.settings.byRole;
const BY_REF: string = contract.settings.byRef;
const LIMITS = ["positive", "bounds", "allowed", "maxLength", "mustKeep", "allowedRoles", "posts", "mustCover", "of", "items", "parts"] as const;
const block = assistantSettings.block;
const iso = (at: number) => new Date(at).toISOString();

/* A line of the file, held to the shared Change shape before it is replayed: a line that is not a
   change is a fault in the file, not something to skip. */
function parseChange(line: string, index: number): Change {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new Error(`${SETTINGS_FILE} line ${index + 1} is not JSON. The history is added to and never edited; restore it from the journal or the backup.`);
  }
  const { settingsVersion, setting, from, to, reason, byRole, byRef, at } = parsed;
  if (!Number.isInteger(settingsVersion) || typeof setting !== "string" || from === undefined || to === undefined || typeof reason !== "string" || typeof byRole !== "string" || typeof byRef !== "string" || !Number.isInteger(at))
    throw new Error(`${SETTINGS_FILE} line ${index + 1} is not a settings change. The history is added to and never edited.`);
  return Object.freeze({ settingsVersion, setting, from, to, reason, byRole, byRef, at }) as Change;
}

/* Same fields as the shared read route's describe(), for the assistant block, which waits on no
   clinical review: reviewRequired and reviewed are null for every setting. */
function describeSetting(setting: Setting, snapshot: Snapshot): DescribedSetting {
  const { value, ...provenance } = setting.default;
  return {
    setting: setting.key,
    label: setting.label,
    help: setting.help,
    type: setting.type,
    unit: setting.unit,
    inForce: snapshot.values[setting.key],
    setAtVersion: snapshot.setAt[setting.key]!,
    default: value,
    provenance,
    limits: Object.fromEntries(LIMITS.filter((key) => setting[key] !== undefined).map((key) => [key, setting[key]])),
    changedBy: rolesThatChange(block, setting, snapshot),
    appliesTo: setting.appliesTo,
    guardrail: setting.guardrail?.statement ?? null,
    reviewRequired: setting.reviewRequired ?? null,
    reviewed: null,
  };
}

const refused = (refusal: Refusal): ChangeOutcome => ({ ok: false, refusalId: refusal.id });

export function openSettingsHistory(state: FounderState | null): SettingsHistory {
  /* Replayed once at start-up, and held in memory as the list of accepted changes; every accepted
     change is appended to the file first and to the list second, so the list is never ahead of the
     file. Without a state directory the list is empty and stays empty. */
  const changes: Change[] = state ? state.readLines(SETTINGS_FILE).map(parseChange) : [];
  snapshotOf(block, changes);
  const history = () => [...changes];
  const snapshot = () => snapshotOf(block, changes);
  return {
    persisted: state !== null,
    history,
    snapshot,
    speech: () => speechSettingsOf(snapshot()),
    presentationVoice: () => presentationVoiceOf(snapshot()),
    describe() {
      const current = snapshot();
      return {
        settingsVersion: current.settingsVersion,
        settings: block.items.map((setting) => describeSetting(setting, current)),
        history: changes.map((change) => ({ ...change, at: iso(change.at) })),
      };
    },
    propose(request, now) {
      /* No state directory, no write: refused before the shared rules are asked, because a change this
         process could not keep is not a change whatever its value. */
      if (!state) return { ok: false, refusalId: "founder-state-unavailable" };
      const current = snapshot();
      /* The founder sends the value they were looking at. When it is not the value in force, the screen
         was stale, and the shared sentence for that is the answer — asked before the shared rules so a
         stale screen is told it is stale rather than that its value is already in force. */
      const known = typeof request.setting === "string" && request.setting in current.values;
      const expectedVersion =
        request.expectedVersion !== undefined
          ? request.expectedVersion
          : known && !sameValue(current.values[request.setting as string], request.from)
            ? -1
            : current.settingsVersion;
      const proposed = proposeChange(
        assistantSettings,
        changes,
        { setting: request.setting, value: request.to, reason: request.reason, expectedVersion, byRole: BY_ROLE, byRef: BY_REF },
        now,
      );
      if (!proposed.ok) return refused(proposed.refusal);
      const change = proposed.value.change;
      state.appendLine(SETTINGS_FILE, JSON.stringify(change));
      changes.push(change);
      return { ok: true, change };
    },
  };
}
