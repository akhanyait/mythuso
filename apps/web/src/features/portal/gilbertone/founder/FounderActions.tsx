import { useEffect, useId, useState, type FormEvent } from 'react';
import registry from '../../../../../../../packages/catalog/api-registry.json' with { type: 'json' };
import { actionOf, founderOf, g1 } from '../../../../lib/gilbertone-admin';
import { fill } from '../../../../lib/portal';
import { useFounderGate } from '../../../../lib/founder-gate';
import { founderWords as words, putKey, readFounderProviders, readLogs, removeKey, setEnabled, testProvider, useFounderProviders, type LogLine, type ProviderMetadata } from '../../../../lib/founder-settings';
import { codeDigits, masked } from '../../../../lib/founder-access';

/* The founder's controls on a provider card (packages/catalog/control-tower-portal.json#gilbertone.founder),
 * on the founder's instruction of 28 September 2026: "API Registry, Compliance, Intelligence, Model Providers
 * — I cannot set them. I need to be able to control all these aspects, I am the owner."
 *
 * A FounderButton draws an action the contract records with a founder record — gate null, decided by the
 * founder on a day, with a sentence saying what it does and what it never does — and it is enabled under one
 * condition only: the assistant service says the founder is signed in (lib/founder-gate.ts, phase
 * 'signed-in'). Checking, signed out, dark or refused, it is disabled beside the contract's sentence for that
 * state, and no form is drawn at all. The founder's decision does not make the browser trust itself: every
 * press asks the service's founder routes through lib/founder-settings.ts, and what the card shows afterwards
 * is what the service answered.
 *
 * THE KEY. Entering or rotating a key is the one place outside FounderAccess.tsx where a password field is
 * drawn. It is drawn only inside the signed-in session and only once Rotate key has opened it; the key lives
 * in this component's state until Save the key is pressed, is emptied before the request is sent, goes once
 * in the body of one PUT with a fresh authenticator code, and is never echoed: the answer is read back as
 * the provider's metadata — present, last four, fingerprint — and nothing else. The form says method="post"
 * so a form that somehow submitted without script still would not put a key in an address. Nothing here is
 * stored, logged or put in a URL, and scripts/check-boundaries.mjs holds this file to that.
 *
 * WHAT STAYS GATED. Configure scopes and Add a provider have no contract behind them, and Controls.tsx still
 * draws them disabled behind G32; the card says so in the contract's words beside these. */

type Phase = ReturnType<typeof useFounderGate>['phase'];
/* The sentence a disabled founder control is described by, for each state the gate can be in. */
const disabledSentence = (gate: ReturnType<typeof useFounderGate>): string => {
 if (gate.phase === 'checking') return words.checking;
 if (gate.phase === 'preview') return words.preview;
 if (gate.phase === 'refused') return fill(words.refused, { message: gate.sentence });
 return words.notSignedIn;
};

/* The one enabled control the founder's decision allows: a founder action, enabled only while the founder is
   signed in, described by its founder sentence then, and by the gate's sentence for its state otherwise. The
   caller may hold it shut for a moment of its own — a request in flight, a card the service has no slot for —
   and says why through describedBy. founderOf throws before anything is drawn when the record is not complete. */
export function FounderButton({ id, name, describedBy, onClick, disabled = false, phase, submit = false, pressed }: {
 id: string; name?: string; describedBy: string; onClick?: () => void; disabled?: boolean; phase: Phase; submit?: boolean; pressed?: boolean;
}) {
 const action = actionOf(id);
 founderOf(action);
 const signedIn = phase === 'signed-in';
 return <button type={submit ? 'submit' : 'button'} className={`secondary g1-founder-live${signedIn ? ' is-open' : ''}`} onClick={onClick} disabled={!signedIn || disabled} aria-describedby={describedBy} aria-pressed={pressed}>{name ?? action.label}</button>;
}
/* A founder action's record, drawn once beside its button. */
export function FounderSentence({ id, sentenceId }: { id: string; sentenceId: string }) {
 const record = founderOf(actionOf(id));
 return <p id={sentenceId} className="g1-live-why"><strong>The founder's, since {record.since}.</strong> {record.sentence}</p>;
}

/* The founder's controls for one card: the metadata the service holds for it, and the actions the caller names —
   a subset of the founder actions, so the Model Providers screen draws the provider ones and the API Registry
   the registry ones, each on its own screen as the contract places them. */
export function FounderCardControls({ card, actions, showMetadata = true }: { card: string; actions: readonly string[]; showMetadata?: boolean }) {
 const gate = useFounderGate();
 const providers = useFounderProviders();
 const signedIn = gate.phase === 'signed-in';
 useEffect(() => { if (signedIn && providers.phase === 'unread') void readFounderProviders(); }, [signedIn, providers.phase]);
 const meta: ProviderMetadata | null = providers.phase === 'read' ? providers.providers.find(p => p.card === card) ?? null : null;
 const why = useId();
 const [code, setCode] = useState('');
 const [key, setKey] = useState('');
 const [keyOpen, setKeyOpen] = useState(false);
 const [busy, setBusy] = useState(false);
 const [note, setNote] = useState<string | null>(null);
 const [lines, setLines] = useState<readonly LogLine[] | null>(null);
 const [metaShown, setMetaShown] = useState(false);
 const has = (id: string) => actions.includes(id);
 /* Metadata is shown on a card whose actions include Show metadata only once it is pressed — the plan's toggle,
    as a button — and always on a card that switches, whose state is what the switch reads. */
 const metaOpen = has('provider-show-metadata') ? metaShown : true;
 const noSlot = signedIn && providers.phase === 'read' && meta === null;
 const shut = busy || noSlot || (signedIn && providers.phase !== 'read');
 const describedBy = !signedIn ? `${why}-gate` : noSlot ? `${why}-slot` : `${why}-record`;

 /* Each act: the code field emptied as it is sent, the answer drawn in the contract's words, the metadata
      re-read by the store so the card shows what the service now holds. */
 const act = async (run: (typed: string) => Promise<{ ok: true } | { ok: false; message: string }>, said: string) => {
  if (busy) return;
  const typed = code;
  setCode('');
  setBusy(true);
  setNote(words.working);
  const answer = await run(typed);
  setBusy(false);
  setNote(answer.ok ? said : answer.message);
 };
 const submitKey = async (event: FormEvent) => {
  event.preventDefault();
  if (busy) return;
  const typedKey = key;
  const typedCode = code;
  setKey('');
  setCode('');
  setBusy(true);
  setNote(words.working);
  const answer = await putKey(card, typedKey, typedCode);
  setBusy(false);
  if (answer.ok) setKeyOpen(false);
  setNote(answer.ok ? words.keySaved : answer.message);
 };
 const test = async () => {
  if (busy) return;
  setBusy(true);
  setNote(words.working);
  const answer = await testProvider(card);
  setBusy(false);
  setNote(!answer.ok ? answer.message : `${answer.passed ? words.testPassed : words.testFailed} ${fill(words.testOutcome, { outcome: answer.outcome, latency: answer.latencyMs ?? '' })}`);
 };
 const logs = async () => {
  if (busy) return;
  setBusy(true);
  setNote(words.working);
  const answer = await readLogs(card);
  setBusy(false);
  if (answer.ok) { setLines(answer.lines); setNote(null); } else setNote(answer.message);
 };

 return <div className="g1-founder-controls" role="group" aria-label={`${words.heading}: ${card}`}>
  {!signedIn && <p id={`${why}-gate`} className="g1-refusal">{disabledSentence(gate)}</p>}
  {noSlot && <p id={`${why}-slot`} className="g1-refusal">{words.noSlot}</p>}
  {signedIn && providers.phase === 'reading' && <p className="helper" role="status" aria-busy="true">{words.reading}</p>}
  {signedIn && providers.phase === 'refused' && <p className="g1-refusal" role="status">{providers.message}</p>}
  {signedIn && meta && showMetadata && metaOpen && <dl className="pt-facts g1-founder-meta" aria-label={words.metadataHeading}>
   <div className="g1-fact"><dt>{words.setLabel}</dt><dd>{meta.configured ? words.present : words.absent}</dd></div>
   {meta.configured && <>
    <div className="g1-fact"><dt>{words.lastFourLabel}</dt><dd><code>{masked(registry.keyMetadata.maskedDisplay, meta.lastFour)}</code></dd></div>
    <div className="g1-fact"><dt>{words.fingerprintLabel}</dt><dd><code>{meta.fingerprint}</code></dd></div>
   </>}
   {(has('registry-enable') || has('registry-disable')) && <div className="g1-fact"><dt>{words.enabledLabel}</dt><dd>{meta.enabled ? g1.overview.trueWord : g1.overview.falseWord}</dd></div>}
  </dl>}
  {signedIn && meta && (has('provider-remove-key') || has('registry-enable') || has('registry-disable')) && !keyOpen && <label className="g1-field g1-founder-code"><span>{words.codeLabel}</span>
   <input type="text" name="one-time-code" inputMode="numeric" autoComplete="one-time-code" spellCheck={false}
    pattern={`\\d{${codeDigits}}`} maxLength={codeDigits} aria-describedby={`${why}-code`}
    value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} disabled={busy}/>
   <small id={`${why}-code`}>{words.codeHint}</small></label>}
  <div className="g1-action-row">
   {has('provider-show-metadata') && <FounderButton id="provider-show-metadata" phase={gate.phase} describedBy={describedBy} disabled={shut} pressed={metaShown} onClick={() => setMetaShown(shown => !shown)}/>}
   {has('provider-test') && <FounderButton id="provider-test" phase={gate.phase} describedBy={describedBy} disabled={shut} onClick={() => { void test(); }}/>}
   {has('registry-test') && <FounderButton id="registry-test" phase={gate.phase} describedBy={describedBy} disabled={shut} onClick={() => { void test(); }}/>}
   {has('provider-rotate-key') && <FounderButton id="provider-rotate-key" phase={gate.phase} describedBy={describedBy} disabled={shut} pressed={keyOpen} onClick={() => { setKeyOpen(open => !open); setNote(null); }}/>}
   {has('registry-rotate-key') && <FounderButton id="registry-rotate-key" phase={gate.phase} describedBy={describedBy} disabled={shut} pressed={keyOpen} onClick={() => { setKeyOpen(open => !open); setNote(null); }}/>}
   {has('provider-remove-key') && <FounderButton id="provider-remove-key" phase={gate.phase} describedBy={describedBy} disabled={shut || !meta?.configured} onClick={() => { void act(typed => removeKey(card, typed), words.keyRemoved); }}/>}
   {has('registry-enable') && <FounderButton id="registry-enable" phase={gate.phase} describedBy={describedBy} disabled={shut || meta?.enabled === true} onClick={() => { void act(typed => setEnabled(card, true, typed), fill(words.switched, { state: words.onWord })); }}/>}
   {has('registry-disable') && <FounderButton id="registry-disable" phase={gate.phase} describedBy={describedBy} disabled={shut || meta?.enabled !== true} onClick={() => { void act(typed => setEnabled(card, false, typed), fill(words.switched, { state: words.offWord })); }}/>}
   {has('registry-view-logs') && <FounderButton id="registry-view-logs" phase={gate.phase} describedBy={describedBy} disabled={shut} onClick={() => { void logs(); }}/>}
  </div>
  {signedIn && <p id={`${why}-record`} className="g1-live-why">{actions.map(id => founderOf(actionOf(id)).sentence).join(' ')}</p>}
  {signedIn && keyOpen && <form className="g1-form g1-founder-form" method="post" onSubmit={submitKey} aria-label={`${actionOf('provider-enter-key').label}: ${card}`}>
   <label className="g1-field"><span>{words.keyLabel}</span>
    <input type="password" name="key" autoComplete="off" required spellCheck={false} value={key} onChange={e => setKey(e.target.value)} disabled={busy} aria-describedby={`${why}-key`}/>
    <small id={`${why}-key`}>{words.keyHint}</small></label>
   <label className="g1-field"><span>{words.codeLabel}</span>
    <input type="text" name="one-time-code" inputMode="numeric" autoComplete="one-time-code" required spellCheck={false}
     pattern={`\\d{${codeDigits}}`} maxLength={codeDigits} aria-describedby={`${why}-key-code`}
     value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} disabled={busy}/>
    <small id={`${why}-key-code`}>{words.codeHint}</small></label>
   <FounderButton id="provider-enter-key" phase={gate.phase} describedBy={`${why}-enter`} disabled={busy || !key || !code} submit/>
   <FounderSentence id="provider-enter-key" sentenceId={`${why}-enter`}/>
  </form>}
  {lines !== null && <div className="g1-founder-logs">
   <p className="pt-label">{words.logsHeading}</p>
   {lines.length
    ? <div className="table-scroll"><table className="result-table admin-table pt-table"><thead><tr><th scope="col">When</th><th scope="col">Event</th><th scope="col">Outcome</th></tr></thead>
     <tbody>{lines.map((line, i) => <tr key={`${line.at}-${i}`}><td>{line.at}</td><td>{line.event}</td><td>{line.outcome}</td></tr>)}</tbody></table></div>
    : <p className="helper">{words.logsEmpty}</p>}
  </div>}
  {note && <p className="g1-founder-note" role="status">{note}</p>}
 </div>;
}
