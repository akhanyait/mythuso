import { useEffect, useState } from 'react';
import copy from '../../../../packages/catalog/assistant-ui.json';
import './assistant-greeting.css';

/* One invitation per mount, never an announcement or a reason to open the microphone.
   Opening the assistant or dismissing the invitation ends it for this page visit. */
export function AssistantGreeting({ open, onOpen }: { open: boolean; onOpen: () => void }) {
 const [visible, setVisible] = useState(false);
 const [finished, setFinished] = useState(false);
 useEffect(() => { if (open) { setFinished(true); setVisible(false); } }, [open]);
 useEffect(() => {
  if (finished || open) return;
  const appear = window.setTimeout(() => { if (!document.hidden) setVisible(true); }, copy.greetingDelayMs);
  const disappear = window.setTimeout(() => { setVisible(false); setFinished(true); }, copy.greetingDelayMs + copy.greetingDurationMs);
  return () => { clearTimeout(appear); clearTimeout(disappear); };
 }, [finished, open]);
 if (!visible || open || finished) return null;
 return <aside className="assistant-greeting">
  <button type="button" onClick={onOpen}>{copy.greeting}</button>
  <button type="button" aria-label={copy.dismissGreeting} onClick={() => { setVisible(false); setFinished(true); }}>×</button>
 </aside>;
}
