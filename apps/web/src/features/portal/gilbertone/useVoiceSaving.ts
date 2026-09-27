import { useState } from 'react';
import { savePresentationVoice, type VoiceLabel } from '../../../lib/gilbertone-admin';
import { fill } from '../../../lib/portal';
import { settingsScreen, useSettingsHistories, type Proposed } from '../../../lib/settings';

/* Saving a presentation voice, for the Voice screen's table and for the preview panel: one reason, one
 * outcome, one door. The change itself goes through lib/gilbertone-admin.ts's savePresentationVoice and
 * so through lib/settings.ts's applyChange — the same rules the Configuration screen's form asks, in the
 * same words — which is why the refusal for a missing reason or an unchanged value is never composed
 * here. The reason is required by those rules, not by this hook: an empty one is sent and refused in the
 * contract's sentence, so the screen shows the rule rather than quietly disabling the button.
 *
 * The histories are subscribed to so that a value in force re-renders the moment it changes, whether
 * this screen changed it or the Configuration tab did in the same session. Nothing is kept beyond React
 * state: no storage, the same promise every screen under apps/web/src keeps. */
const ZONE = 'Africa/Johannesburg';
const whenOf = (at: number) => new Date(at).toLocaleTimeString('en-ZA', { hour: 'numeric', minute: 'numeric', hour12: false, timeZone: ZONE });

export function useVoiceSaving() {
 useSettingsHistories();
 const [reason, setReason] = useState('');
 const [outcome, setOutcome] = useState<Proposed | null>(null);
 const save = (classId: string, value: VoiceLabel) => {
  const result = savePresentationVoice(classId, value, reason);
  setOutcome(result);
  if (result.ok) setReason('');
 };
 const sentence = outcome === null ? null
  : outcome.ok ? fill(settingsScreen.applied, { version: outcome.change.settingsVersion, at: whenOf(outcome.change.at) })
  : outcome.refusal.statement;
 return { reason, setReason, outcome, sentence, save, clear: () => setOutcome(null) } as const;
}
