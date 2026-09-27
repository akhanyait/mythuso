import { useEffect, useState } from 'react';
import { g1, saveAssistantSetting } from '../../../lib/gilbertone-admin';
import { fill } from '../../../lib/portal';
import { assistantDefaults, presentationVoiceOf, settingsRefusal, settingsScreen, snapshotNow, speechSettingsOf, useSettingsHistories, type Change, type PresentationVoiceInForce, type Proposed, type SettingValue, type Snapshot, type SpeechSettingsInForce } from '../../../lib/settings';
import { useFounderGate } from '../../../lib/founder-gate';
import { forgetFounderSettings, postFounderChange, readFounderSettings, useFounderSettings } from '../../../lib/founder-settings';

/* Where the assistant's settings in force come from, and how a change to one is saved — one answer for the
 * Speech settings screen and the voice preview, so the chip a preview shows and the value a Save is judged
 * against are always the same reading.
 *
 * THREE SOURCES, DECIDED BY THE FOUNDER'S GATE (lib/founder-gate.ts), 28 September 2026:
 *   signed in  — the assistant service's own history, read through lib/founder-settings.ts when the founder
 *                signs in and again after every save; a Save is one POST per changed setting, validated by
 *                the shared rules on the service, and the service is the store. This is what makes the
 *                founder's saved voice reach the service's next spoken answer, and the preview's Play.
 *   preview    — founder access dark, or no service answering: this tab's history in lib/settings.ts, as
 *                every setting in the web preview is kept, and a Save is applyChange() with the same rules.
 *   locked     — founder access on and nobody signed in, or the service refusing: the contract's shipped
 *                defaults are shown, nothing can be saved, and the gate's sentence says why.
 *
 * A save while the gate is shut is refused here in the gate's own sentence, and the screens disable Save
 * beside that sentence too, so the door is shut twice for the same reason. The reason is required by the
 * shared rules, not by this hook: an empty one is sent and refused in the contract's sentence, so the screen
 * shows the rule rather than quietly disabling the button. Nothing is kept beyond React state and the two
 * stores' memory: no storage, the same promise every screen under apps/web/src keeps. */
const ZONE = 'Africa/Johannesburg';
const whenOf = (at: number) => new Date(at).toLocaleTimeString('en-ZA', { hour: 'numeric', minute: 'numeric', hour12: false, timeZone: ZONE });
const byDefault: Snapshot = assistantDefaults();

export type SpeechSource = {
 readonly phase: 'service' | 'tab' | 'locked' | 'checking';
 readonly snapshot: Snapshot;
 readonly voices: PresentationVoiceInForce;
 readonly speech: SpeechSettingsInForce;
 readonly history: readonly Change[];
 /** The sentence that says where what is shown came from, in the contract's words. */
 readonly sentence: string;
 /** Whether a Save may be tried: signed in with the service read, or a preview. */
 readonly canSave: boolean;
};

export function useSpeechSource(): SpeechSource {
 useSettingsHistories();
 const gate = useFounderGate();
 const founder = useFounderSettings();
 const signedIn = gate.phase === 'signed-in';
 /* The service is asked once the founder is signed in, and forgotten when the session ends, so the next
    sign-in reads afresh rather than what the last session saw. */
 useEffect(() => {
  if (signedIn) { if (founder.phase === 'unread') void readFounderSettings(); }
  else if (founder.phase !== 'unread') forgetFounderSettings();
 }, [signedIn, founder.phase]);
 const words = g1.speech;
 const of = (phase: SpeechSource['phase'], snapshot: Snapshot, history: readonly Change[], sentence: string, canSave: boolean): SpeechSource =>
  ({ phase, snapshot, voices: presentationVoiceOf(snapshot), speech: speechSettingsOf(snapshot), history, sentence, canSave });
 if (signedIn) {
  if (founder.phase === 'read') return of('service', founder.settings.snapshot, founder.settings.history, fill(words.sourceService, { version: founder.settings.snapshot.settingsVersion }), true);
  if (founder.phase === 'refused') return of('locked', byDefault, [], fill(words.sourceRefused, { message: founder.message }), false);
  return of('checking', byDefault, [], words.sourceReading, false);
 }
 if (gate.phase === 'preview') {
  const snapshot = snapshotNow('assistant');
  return of('tab', snapshot, [], fill(words.sourceTab, { version: snapshot.settingsVersion }), true);
 }
 return of(gate.phase === 'checking' ? 'checking' : 'locked', byDefault, [], gate.phase === 'checking' ? words.sourceReading : words.sourceLocked, false);
}

export type SettingChange = { readonly setting: string; readonly value: SettingValue };

export function useVoiceSaving() {
 const source = useSpeechSource();
 const gate = useFounderGate();
 const [reason, setReason] = useState('');
 const [busy, setBusy] = useState(false);
 const [outcome, setOutcome] = useState<{ readonly ok: true; readonly changes: readonly Change[] } | Proposed | null>(null);
 /* One reason, one or several changes, saved one after another in the order given and stopped at the first
    refusal — each judged against the version the one before it left, so the shared rules' stale-version refusal
    still means what it says. The outcome is the last change's, or the refusal. */
 const save = async (changes: readonly SettingChange[]) => {
  if (busy || !changes.length) return;
  if (gate.locked || !source.canSave) { setOutcome({ ok: false, refusal: { ...settingsRefusal('change', 'setting-change-not-permitted'), statement: gate.sentence } }); return; }
  setBusy(true);
  const done: Change[] = [];
  let expectedVersion = source.snapshot.settingsVersion;
  for (const change of changes) {
   if (source.phase === 'service') {
    /* The service asks for the value the change is from as well as to, and answers the version now in force
       and the instant it applies from; the row it wrote is read back with the history a moment later. */
    const result = await postFounderChange({ setting: change.setting, from: source.snapshot.values[change.setting]!, to: change.value, reason, expectedVersion });
    if (!result.ok) { setOutcome({ ok: false, refusal: { ...settingsRefusal('change', 'setting-change-not-permitted'), statement: result.message } }); setBusy(false); return; }
    done.push({ settingsVersion: result.settingsVersion, setting: change.setting, from: source.snapshot.values[change.setting]!, to: change.value, reason, byRole: '', byRef: '', at: result.at });
    expectedVersion = result.settingsVersion;
   } else {
    const result = saveAssistantSetting(change.setting, change.value, reason);
    if (!result.ok) { setOutcome(result); setBusy(false); return; }
    done.push(result.change);
   }
  }
  setBusy(false);
  setOutcome({ ok: true, changes: done });
  setReason('');
 };
 const applied = (change: Change) => fill(settingsScreen.applied, { version: change.settingsVersion, at: whenOf(change.at) });
 const sentence = outcome === null ? null
  : !outcome.ok ? outcome.refusal.statement
  : !('changes' in outcome) ? applied(outcome.change)
  : outcome.changes.length === 1 ? applied(outcome.changes[0]!)
  : fill(g1.speech.savedCount, { count: outcome.changes.length, applied: applied(outcome.changes[outcome.changes.length - 1]!) });
 const ok = outcome?.ok ?? null;
 return { source, reason, setReason, busy, ok, sentence, save, gate, clear: () => setOutcome(null) } as const;
}
