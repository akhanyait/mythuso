import { useEffect, useState } from 'react';
import copy from '../../../../packages/catalog/assistant-ui.json';
import './assistant-greeting.css';

/* A quiet invitation, never an announcement or a reason to open the microphone.
   Opening hides the invitation; minimising brings it back. Dismissal lasts for this page visit. */
export function AssistantGreeting({ open, onOpen }: { open: boolean; onOpen: () => void }) {
 const [state, setState] = useState<'waiting' | 'visible' | 'finished'>('waiting');
 useEffect(() => {
  if (open) { if (state !== 'finished') setState('visible'); return; }
  if (state !== 'waiting') return;
  const appear = window.setTimeout(() => setState('visible'), copy.greetingDelayMs);
  return () => clearTimeout(appear);
 }, [state, open]);
 if (state !== 'visible' || open) return null;
 return <aside className="assistant-greeting">
  <button type="button" onClick={onOpen}><span>{copy.greeting}</span><strong>{copy.greetingAction}</strong></button>
  <button type="button" aria-label={copy.dismissGreeting} onClick={() => setState('finished')}>×</button>
 </aside>;
}
