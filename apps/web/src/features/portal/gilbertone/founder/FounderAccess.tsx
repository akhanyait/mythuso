import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { Copy, Eye, EyeOff } from 'lucide-react';
import registry from '../../../../../../../packages/catalog/api-registry.json' with { type: 'json' };
import {
 codeDigits, founderContract, founderKeys, founderWords as words, masked, probe, reveal, sessionEnded, sessionMinutes,
 signIn, signOut, useFounderState, wipeAfterMs, type KeyMetadata, type RevealAnswer
} from '../../../../lib/founder-access';

/* Founder access in the Control Tower: the founder signs in with a password and an authenticator code,
 * sees what may be said about the two Azure keys without revealing them — set or not, the masked last
 * four characters, the SHA-256 fingerprint prefix — and may reveal one at a time by typing a fresh code.
 *
 * This is the one place in GilbertOne administration where a key reaches the browser, on the founder's
 * decision of 24 September 2026 (packages/catalog/founder-access.json#decision), and every control
 * that makes that tolerable is in the service rather than here: the switch that keeps it dark, the two
 * factors, the fresh code on every reveal, the lock, the fifteen-minute session and the two-name
 * allowlist. What this file owns is how briefly the key lives on the screen:
 *
 *   It exists only in RevealKey's own state, set from the reveal route's answer and from nothing else.
 *   It is drawn masked until the eye is pressed, and wiped — state emptied, not hidden — after the
 *   contract's thirty seconds, when the tab is hidden, when the page is left or the history moves, on
 *   sign-out (which unmounts every row) and when the screen is left (which unmounts this whole file).
 *   It is never stored, never logged, never put in a URL: the forms post nowhere but through fetch,
 *   and say method="post" so a form that somehow submitted without script still would not put a
 *   field in an address.
 *
 * Every other control on the GilbertOne screens stays disabled behind its gate; these are the only live
 * inputs and buttons, and scripts/check-boundaries.mjs names this file as the only exception. */

export function FounderAccessPanel({ cardId }: { cardId?: string }) {
 const state = useFounderState();
 useEffect(() => { void probe(); }, []);
 const entries = founderKeys.filter(k => !cardId || k.card === cardId);
 return <div className="g1-founder">
  <p className="helper">{words.intro}</p>
  {state.phase === 'checking' && <p className="helper" role="status" aria-busy="true">{words.checking}</p>}
  {state.phase === 'refused' && <p className="g1-founder-refusal" role="status">{state.message}</p>}
  {state.phase === 'signed-out' && <SignIn message={state.message}/>}
  {state.phase === 'signed-in' && <>
   <div className="g1-founder-session">
    <p>{words.signedIn.replace('{minutes}', String(sessionMinutes))}</p>
    <button type="button" className="secondary g1-founder-button" onClick={() => void signOut()}>{words.signOut}</button>
   </div>
   <ul className="g1-founder-keys">{entries.map(k =>
    <li key={k.name}><RevealKey label={k.label} name={k.name} meta={state.keys.find(m => m.name === k.name) ?? null}/></li>)}</ul>
  </>}
 </div>;
}

/* The settings gate's panel, on the founder's amendment of 28 September 2026: drawn where a settings editor
   would be, it shows the same sign-in form as the reveal panel while the founder is signed out, the session
   line and Sign out while signed in, and the contract's preview sentence where founder access is dark or the
   service does not answer. It reveals nothing and draws no field of its own — SignIn above is the one form. */
export function FounderGatePanel({ sentence, phase }: { sentence: string; phase: 'checking' | 'signed-out' | 'refused' | 'signed-in' | 'preview' }) {
 return <div className="g1-founder g1-founder-gate" role="region" aria-label={founderContract.gate.words.lockedHeading}>
  {phase === 'signed-out' && <p className="pt-label">{founderContract.gate.words.lockedHeading}</p>}
  <p className={phase === 'refused' ? 'g1-founder-refusal' : 'helper'} role={phase === 'checking' ? 'status' : undefined}>{sentence}</p>
  {phase === 'signed-out' && <SignIn message={null}/>}
  {phase === 'signed-in' && <button type="button" className="secondary g1-founder-button" onClick={() => void signOut()}>{words.signOut}</button>}
 </div>;
}

/* The two factors, cleared from the form the moment they are sent, whatever the answer. Exported for one
   other caller — the Control Tower's door, shells/FounderGate.tsx, which reaches this module through a
   dynamic import — so the product has one sign-in form, and this file stays the only one that draws a
   password field. */
export function SignIn({ message }: { message: string | null }) {
 const [password, setPassword] = useState('');
 const [code, setCode] = useState('');
 const [busy, setBusy] = useState(false);
 const [refusal, setRefusal] = useState<string | null>(null);
 const hint = useId();
 const submit = async (event: FormEvent) => {
  event.preventDefault();
  if (busy) return;
  const typed = [password, code] as const;
  setPassword('');
  setCode('');
  setBusy(true);
  const refused = await signIn(...typed);
  setBusy(false);
  setRefusal(refused ? refused.message : null);
 };
 const said = refusal ?? message;
 return <form className="g1-form g1-founder-form" method="post" onSubmit={submit} aria-label={words.signInHeading}>
  <p className="pt-label">{words.signInHeading}</p>
  <input type="text" className="visually-hidden" name="username" autoComplete="username" value="founder" readOnly tabIndex={-1} aria-hidden="true"/>
  <label className="g1-field"><span>{words.passwordLabel}</span>
   <input type="password" name="password" autoComplete="current-password" required spellCheck={false}
    value={password} onChange={e => setPassword(e.target.value)} disabled={busy}/></label>
  <label className="g1-field"><span>{words.codeLabel}</span>
   <input type="text" name="one-time-code" inputMode="numeric" autoComplete="one-time-code" required spellCheck={false}
    pattern={`\\d{${codeDigits}}`} maxLength={codeDigits} aria-describedby={hint}
    value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} disabled={busy}/></label>
  <p id={hint} className="helper">{words.codeHint}</p>
  <button type="submit" className="primary g1-founder-button" disabled={busy}>{busy ? words.signingIn : words.signIn}</button>
  {said && <p className="g1-founder-refusal" role="alert">{said}</p>}
 </form>;
}

/* One key: its metadata, and the reveal. The revealed key lives in `shown` and nowhere else. */
function RevealKey({ label, name, meta }: { label: string; name: string; meta: KeyMetadata | null }) {
 const [shown, setShown] = useState<RevealAnswer | null>(null);
 const [visible, setVisible] = useState(false);
 const [code, setCode] = useState('');
 const [busy, setBusy] = useState(false);
 const [note, setNote] = useState<string | null>(null);
 const hint = useId();
 const wipe = useCallback((said: string | null) => {
  setShown(null);
  setVisible(false);
  setNote(said);
 }, []);
 /* The wipes, armed only while a key is on the screen: the contract's time, the tab hidden, the page
    left, the history moved. Unmounting — sign-out, another tab, another screen — takes the state with
    it and needs no listener. */
 useEffect(() => {
  if (!shown) return;
  const timer = window.setTimeout(() => wipe(words.wiped), wipeAfterMs);
  const hidden = () => { if (document.visibilityState === 'hidden') wipe(words.wiped); };
  const left = () => wipe(words.wiped);
  document.addEventListener('visibilitychange', hidden);
  window.addEventListener('pagehide', left);
  window.addEventListener('popstate', left);
  return () => {
   window.clearTimeout(timer);
   document.removeEventListener('visibilitychange', hidden);
   window.removeEventListener('pagehide', left);
   window.removeEventListener('popstate', left);
  };
 }, [shown, wipe]);

 const submit = async (event: FormEvent) => {
  event.preventDefault();
  if (busy) return;
  const typed = code;
  setCode('');
  setBusy(true);
  const answer = await reveal(name, typed);
  setBusy(false);
  if (answer.ok) {
   setNote(null);
   setShown(answer.body);
  } else {
   setNote(answer.message);
   sessionEnded(answer);
  }
 };
 const copy = async () => {
  if (!shown) return;
  try {
   await navigator.clipboard.writeText(shown.revealedKey);
   setNote(words.copied);
  } catch {
   setNote(words.copyFailed);
  }
 };

 return <article className="g1-founder-key" aria-label={label}>
  <p className="g1-founder-key-name"><strong>{label}</strong> <code>{name}</code></p>
  <dl className="pt-facts">
   <div className="g1-fact"><dt>{words.setLabel}</dt><dd>{meta?.present ? words.present : words.absent}</dd></div>
   {meta?.present && <>
    <div className="g1-fact"><dt>{words.lastFourLabel}</dt><dd><code>{masked(registry.keyMetadata.maskedDisplay, meta.lastFour)}</code></dd></div>
    <div className="g1-fact"><dt>{words.fingerprint}</dt><dd><code>{meta.fingerprint}</code></dd></div>
   </>}
  </dl>
  {meta?.present && !shown && <form className="g1-form g1-founder-form" method="post" onSubmit={submit} aria-label={`${words.revealHeading} ${label}`}>
   <label className="g1-field"><span>{words.revealCodeLabel}</span>
    <input type="text" name="one-time-code" inputMode="numeric" autoComplete="one-time-code" required spellCheck={false}
     pattern={`\\d{${codeDigits}}`} maxLength={codeDigits} aria-describedby={hint}
     value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} disabled={busy}/></label>
   <p id={hint} className="helper">{words.revealCodeHint}</p>
   <button type="submit" className="primary g1-founder-button" disabled={busy}>{busy ? words.revealing : words.reveal}</button>
  </form>}
  {shown && <div className="g1-founder-revealed">
   <code className="g1-founder-secret" aria-label={label}>{visible ? shown.revealedKey : masked(registry.keyMetadata.maskedDisplay, shown.lastFour)}</code>
   <div className="g1-action-row">
    <button type="button" className="secondary g1-founder-button" aria-pressed={visible} onClick={() => setVisible(v => !v)}>
     {visible ? <EyeOff aria-hidden="true"/> : <Eye aria-hidden="true"/>} {visible ? words.hide : words.show}</button>
    <button type="button" className="secondary g1-founder-button" onClick={() => void copy()}><Copy aria-hidden="true"/> {words.copy}</button>
   </div>
   <p className="helper">{words.wipes.replace('{seconds}', String(founderContract.reveal.wipeAfterSeconds))}</p>
  </div>}
  {note && <p className="g1-founder-note" role="status">{note}</p>}
 </article>;
}
