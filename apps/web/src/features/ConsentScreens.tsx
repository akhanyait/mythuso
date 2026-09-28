/* The consent centre, the access history and the Information Officer, behind a dynamic import since the design handoff of 28 September
   2026: none of it is on a patient's first view. Consent.tsx keeps the names the application imports and hands
   each screen over on the first press — see deferred.tsx. */
import { useEffect, useState } from 'react';
import { ArrowRight, Ban, Check, ChevronRight, Clock, Eye, FileCheck, Fingerprint, History, PenLine, ShieldAlert, ShieldCheck, Trash2, X } from 'lucide-react';
import { Pill, SectionTitle } from '../components/UI';
import { NotConnected } from '../components/NotConnected';
import { StateBlock, useOffline, type LoadState } from '../components/States';
import {
 accessLog, asDate, asMoment, authorises, basisName, careStanding, currentVersion, effectiveOn,
 fetchAccessLog, fetchStanding, optionalPurposes, previewAccesses, previewStandings, purposeById,
 requiredPurposes, rules, sendDecision, stateLabel, stateOf, versionOf, why, wordingHash,
 type AccessEntry, type ConsentPurpose, type Standing
} from '../lib/consent';

/**
 * Your consents, and the log of who opened your record.
 *
 * Two screens, one module, because they are one question asked from two ends: a consent is a
 * permission to process, and the access log is the record of the processing it permitted. Every
 * sentence on both comes from packages/catalog/consent.json — the same file the server reads and
 * takes the fingerprint of — so there is nothing here to drift.
 *
 * Three things this screen is designed around, and each of them is a decision rather than a layout:
 *
 *  · **Required and optional are two lists, not one list with a badge.** A person deciding whether
 *    to tick something needs to know first whether it is a choice at all.
 *  · **The way out is on the screen before the way in.** What withdrawing does not undo is shown on
 *    the card, permanently, rather than behind a confirmation nobody reaches until it is too late.
 *    That is also what keeps withdrawal one action: it takes exactly as many taps as the tick did.
 *  · **A consent given to wording that has since changed is shown as its own state**, with what
 *    changed and why they are being asked again. It is not shown as agreed, and it is not shown as
 *    never asked, because it is neither.
 */

const withPreview = <T,>(load: () => Promise<T | null>, fallback: () => T) => {
 /* The same shape lib/auth.ts uses: with a service answering, this is the real register; without
    one it is fixtures in memory, gone on reload, and the screen says which. */
 const [value, setValue] = useState<T>(fallback);
 const [live, setLive] = useState(false);
 const [ready, setReady] = useState(false);
 useEffect(() => {
  let cancelled = false;
  void (async () => {
   const answered = await load();
   if (cancelled) return;
   if (answered) { setValue(answered); setLive(true); }
   setReady(true);
  })();
  return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, []);
 return { value, setValue, live, ready };
};

export function ConsentCentre() {
 const loaded = withPreview(async () => {
  const answered = await fetchStanding();
  return answered ? answered.standings : null;
 }, previewStandings);
 const standings = loaded.value;
 const [said, setSaid] = useState('');
 const care = careStanding(standings);

 const apply = async (purpose: ConsentPurpose, decision: 'given' | 'withdrawn' | 'refused') => {
  const version = currentVersion(purpose).version;
  if (loaded.live) await sendDecision(decision === 'withdrawn' ? 'withdraw' : 'give', purpose.id, version);
  const at = Date.now();
  loaded.setValue(standings.map(standing => standing.purposeId === purpose.id
   ? { ...standing, state: decision === 'given' ? 'held' : decision === 'withdrawn' ? 'withdrawn' : 'refused', heldVersion: version, decidedAt: at, history: [...standing.history, { decision, version, at, route: 'web-account', locale: 'en-ZA' }] }
   : standing));
  setSaid(decision === 'given'
   ? `${purpose.name} agreed, on version ${version} of the wording.`
   : decision === 'withdrawn'
    ? `${purpose.name} withdrawn. What is kept anyway is on the card, with the law that keeps it.`
    : `${purpose.name} declined. Nothing about your care changes.`);
 };

 return <div className="consent-centre">
  {/* Nothing until the register has answered. "Not connected" is not true while the question is
      still in flight, and a notice that flashes on every load is one nobody reads twice. */}
  {!loaded.ready ? null : loaded.live ? <Pill>Consent register connected</Pill> : <NotConnected of="accounts"/>}
  <p className="muted">{why}</p>
  <p className="muted">{rules.consentIsToAVersion}</p>
  <div className={care.mayReceiveCare ? 'privacy-note' : 'consent-blocked'} role="status">
   {care.mayReceiveCare ? <ShieldCheck size={19}/> : <ShieldAlert size={19}/>}{care.sentence}
  </div>
  <p className="helper" role="status">{said || (loaded.live ? 'Every decision below is recorded with its version, its wording and the date.' : 'These decisions live in this browser tab only. Nothing is sent anywhere.')}</p>

  <section className="consent-group">
   <h3>Needed to give you care</h3>
   <p className="muted">{rules.requiredIsNamedNotImplied}</p>
   {requiredPurposes.map(purpose => <PurposeCard key={purpose.id} purpose={purpose} standing={find(standings, purpose.id)} onDecide={apply}/>)}
  </section>

  <section className="consent-group">
   <h3>Entirely up to you</h3>
   <p className="muted">{rules.optionalNeverDegradesCare}</p>
   {optionalPurposes.map(purpose => <PurposeCard key={purpose.id} purpose={purpose} standing={find(standings, purpose.id)} onDecide={apply}/>)}
  </section>

  <div className="empty-note">{rules.withdrawalIsNotDeletion}</div>
 </div>;
}

const find = (standings: Standing[], purposeId: string): Standing =>
 standings.find(standing => standing.purposeId === purposeId)
 ?? { purposeId, state: 'never-asked', heldVersion: null, decidedAt: null, history: [] };

function PurposeCard({ purpose, standing, onDecide }: {
 purpose: ConsentPurpose; standing: Standing;
 onDecide: (purpose: ConsentPurpose, decision: 'given' | 'withdrawn' | 'refused') => void;
}) {
 const current = currentVersion(purpose);
 const state = stateOf(standing.history, purpose);
 const held = authorises({ ...standing, state });
 const acknowledgement = purpose.kind === 'acknowledgement';
 const [proof, setProof] = useState<string | null>(null);
 useEffect(() => { void wordingHash(purpose.id, current).then(setProof); }, [purpose.id, current]);
 const supersededBy = standing.heldVersion === null ? undefined : versionOf(purpose, standing.heldVersion);

 return <article className={`consent-card is-${state}`}>
  <header>
   <div>
    <h4>{purpose.name}</h4>
    <small>{basisName(purpose.lawfulBasis)}{purpose.alsoRestsOn ? `, and ${basisName(purpose.alsoRestsOn).toLowerCase()}` : ''}</small>
   </div>
   <span className={`consent-state consent-state-${state}`}>{stateLabel[state]}</span>
  </header>

  <blockquote className="consent-wording">{current.wording}</blockquote>
  <div className="consent-proof">
   <span><Clock size={14}/>Version {current.version}, in force since {asDate(effectiveOn(current))}</span>
   {/* The fingerprint of the exact words above, shown rather than described. A proof somebody
       cannot see is a proof they have to take on trust. */}
   <span><Fingerprint size={14}/>{proof ? `${proof.slice(0, 16)}…` : 'fingerprint of these exact words'}</span>
  </div>

  {state === 'held-on-superseded-version' && <div className="consent-changed">
   <strong>The wording has changed since you agreed.</strong>
   <p>You agreed to version {standing.heldVersion} on {asDate(standing.decidedAt!)}. That is still a real agreement to those words, and it is not an agreement to these ones. {current.change}</p>
   {supersededBy?.supersededBecause && <p className="muted">Why the old wording was replaced: {supersededBy.supersededBecause}</p>}
  </div>}

  {state === 'withdrawn' && standing.decidedAt !== null && <p className="helper">Withdrawn on {asDate(standing.decidedAt)}. It is on your record as a withdrawal, not as an absence.</p>}

  <div className="consent-facts">
   <div><span>If you say no</span><p>{purpose.ifRefused}</p></div>
   <div><span>Getting out</span><p>{purpose.withdrawal}</p></div>
   {purpose.retainedOnWithdrawal.length > 0 && <div className="consent-kept">
    <span>What withdrawing does not undo</span>
    <ul>{purpose.retainedOnWithdrawal.map(kept => <li key={kept.what}><strong>{kept.what}.</strong> {kept.because} <em>({basisName(kept.basis)})</em></li>)}</ul>
   </div>}
  </div>

  <div className="consent-actions">
   {acknowledgement
    ? <>
      {!held && <button className="primary" onClick={() => onDecide(purpose, 'given')}><Check size={16}/>I have read this</button>}
      <p className="helper">{rules.anAcknowledgementIsNotAConsent}</p>
     </>
    : held
     ? <button className="secondary" onClick={() => onDecide(purpose, 'withdrawn')}><X size={16}/>Withdraw</button>
     : <>
       <button className="primary" onClick={() => onDecide(purpose, 'given')}><Check size={16}/>{state === 'held-on-superseded-version' ? `Agree to version ${current.version}` : 'I agree'}</button>
       {state !== 'refused' && <button className="secondary" onClick={() => onDecide(purpose, 'refused')}><Ban size={16}/>No thanks</button>}
      </>}
  </div>
 </article>;
}

/**
 * The log of who opened your record.
 *
 * It replaces the two-line sample that used to sit here. Two things it does that the sample could
 * not: it shows the refused attempts as well as the allowed ones, and it names the lawful basis each
 * reading was made under rather than leaving "why were they allowed to" unanswered.
 */
export function AccessHistory() {
 /* The one screen in the app whose state comes from something that actually answers, and the reason
    the shared states are no longer reachable only through a picker.
 *
 * Four outcomes, kept apart because they are four different facts about the world: the log
 * answered, the device has no signal, a service is there and it failed, and no service is
 * configured at all. The last of those is not an error — the identity service is installed and
 * deliberately switched off until DNS, TLS and an SMS provider exist — so it renders the contract's
 * notice beside the fixtures rather than an alert nobody can act on. The other three replace the
 * entries entirely: a log of who has been reading your health record must never keep drawing rows
 * under a panel saying it could not load them.
 *
 * `source` is three-valued rather than a boolean on purpose. While the answer is still in flight,
 * neither "connected" nor "not connected" is true yet, and the honest thing on screen is the
 * skeleton. A boolean there flashes a connectivity notice on every single page load.
 *
 * Offline is listened for in both directions. Reading navigator.onLine once, at fetch time, misses
 * the person who loses signal after the log has loaded — they would be left reading entries with
 * nothing saying they are stale — and it leaves them stuck there until they reload, which is a
 * second dead end on the same screen. Signal returning re-asks on its own. */
 const offline = useOffline();
 const [attempt, setAttempt] = useState(0);
 const [state, setState] = useState<LoadState>('loading');
 const [entries, setEntries] = useState<AccessEntry[]>(previewAccesses);
 const [source, setSource] = useState<'unknown' | 'live' | 'fixtures'>('unknown');
 useEffect(() => {
  if (offline) { setSource('unknown'); setState('offline'); return; }
  let cancelled = false;
  setSource('unknown');
  setState('loading');
  void (async () => {
   const answer = await fetchAccessLog();
   if (cancelled) return;
   if (answer.kind === 'answered') { setEntries(answer.value); setSource('live'); setState('ready'); }
   else if (answer.kind === 'offline') setState('offline');
   else if (answer.kind === 'failed') setState('error');
   else { setSource('fixtures'); setState('ready'); }
  })();
  return () => { cancelled = true; };
 }, [attempt, offline]);
 const refused = entries.filter(entry => entry.outcome === 'refused').length;
 return <div className="access-log">
  {source === 'live' ? <Pill>Access log connected</Pill> : source === 'fixtures' ? <NotConnected of="accounts"/> : null}
  <p className="muted">{accessLog.why}</p>
  <div className="privacy-note"><Eye size={19}/>{accessLog.subjectMayRead}</div>
  <StateBlock state={state} subject="Your access history" permission="access to your record" onRetry={() => setAttempt(attempt + 1)}>
  <p className="helper" role="status">{entries.length} {entries.length === 1 ? 'entry' : 'entries'}, {refused} of them refused. {rules.aRefusedAccessIsRecordedToo}</p>
  <ul className="access-list">
   {entries.map(entry => <li key={entry.auditId ?? `${entry.at}-${entry.recordType}`} className={`access-row is-${entry.outcome}`}>
    <span className="access-mark">{entry.outcome === 'granted' ? <ShieldCheck size={20}/> : <ShieldAlert size={20}/>}</span>
    <div>
     <strong>{entry.actorLabel ?? 'Somebody MyThuso cannot name'}</strong>
     <small>{asMoment(entry.at)} · {entry.outcome === 'granted' ? 'Opened' : 'Refused'} your {entry.recordType.replace(/-/g, ' ')} · {entry.purpose}</small>
     <em>{basisName(entry.lawfulBasis)}{entry.consentPurpose ? ` — ${purposeById(entry.consentPurpose)?.name ?? entry.consentPurpose}, version ${entry.consentVersion}` : ''}</em>
     {entry.reason && <p className="access-reason">{entry.refusedBy ? `Refused at the ${entry.refusedBy} check. ` : ''}{entry.reason}</p>}
    </div>
   </li>)}
  </ul>
  <div className="empty-note">
   <strong>What this log never holds.</strong>
   <ul>{accessLog.neverRecords.map(line => <li key={line}>{line}</li>)}</ul>
  </div>
  <p className="helper">{rules.theAccessLogIsNotTheSignInLog} {accessLog.retention}</p>
  </StateBlock>
 </div>;
}

/* ---- The Information Officer ------------------------------------------------------------------
 *
 * The last row on Privacy & settings opened a dialog with the wrong capability notice on it — the
 * one about sign-in — a single sentence saying contact details "will be configured before launch",
 * and a button offering the product roadmap, which is not what somebody looking for a privacy
 * contact came for. docs/FLOW-COMPLETENESS.md marked it *rough* and said it needs a person rather
 * than a screen. Half of that is right and stays right: MyThuso cannot name an Information Officer
 * it has not appointed, and nothing here invents one.
 *
 * The other half is not. Almost everything a person would contact an Information Officer about,
 * this app already does — the access log, a correction, a deletion, a consent to withdraw — and the
 * row that should have been the door to all four was the one that led nowhere. So the screen is
 * those four doors, the sentence the consent contract already carries about who decides these
 * questions, and then the gap, stated as a gap. */
export function InformationOfficer({ open, navigate }: { open: (m: string) => void; navigate: (p: string) => void }) {
 return <div className="form-stack">
  <NotConnected of="messaging"/>
  <p className="muted">Under POPIA every responsible party has an Information Officer, and a request about your own personal information is made to them. MyThuso has not appointed one, and this screen does not pretend otherwise.</p>

  <SectionTitle title="What you would ask them for"/>
  <div className="panel">
   {/* Four of them are screens in this app already. The row that should have opened them was the
       one row on the privacy screen that opened nothing. */}
   <button className="record-row" onClick={() => open('Access history')}>
    <span className="service-icon"><History size={20}/></span>
    <span><strong>Who has opened my record</strong><small>Every access, the lawful basis for it, and the ones that were refused.</small></span>
    <ChevronRight size={17}/></button>
   <button className="record-row" onClick={() => open('Request a correction')}>
    <span className="service-icon"><PenLine size={20}/></span>
    <span><strong>Correct something that is wrong about me</strong><small>Section 24 of POPIA. You ask; the responsible party has to answer.</small></span>
    <ChevronRight size={17}/></button>
   <button className="record-row" onClick={() => open('Request account deletion')}>
    <span className="service-icon"><Trash2 size={20}/></span>
    <span><strong>Delete what you hold about me</strong><small>And be told what a retention schedule keeps anyway, and why.</small></span>
    <ChevronRight size={17}/></button>
   <button className="record-row" onClick={() => open('Your consents')}>
    <span className="service-icon"><FileCheck size={20}/></span>
    <span><strong>Withdraw a consent I gave</strong><small>Each purpose, the wording you agreed to, and what withdrawing does and does not stop.</small></span>
    <ChevronRight size={17}/></button>
  </div>

  {/* Not the consent contract's own `notAdvice` sentence, though it says the same thing: that one
      ends "the sections named below are pointers", and "below" means the rest of the JSON file. A
      sentence quoted into a place where one of its words stops being true is a sentence that has
      been changed. This is the screen's own, and it draws the same line. */}
  <div className="privacy-note"><ShieldCheck size={19}/>Nothing on this screen is legal advice and MyThuso does not interpret POPIA on your behalf. Which lawful basis and which authorisation apply to a purpose is a determination for an Information Officer and South African counsel — which is precisely the person this product has not appointed.</div>

  <SectionTitle title="What is missing, and it is a person"/>
  <div className="panel"><dl className="stated">
   <div><dt>A name and verified contact details</dt><dd>An Information Officer is registered with the Information Regulator by a named human being who takes responsibility for these answers. MyThuso has not appointed one, so there is no name to print here and no address to write to.</dd></div>
   <div><dt>Request tracking</dt><dd>A request has to be logged, acknowledged, answered within a period and closed. None of that exists yet: the two request screens above record an acknowledgement in this tab and nothing leaves it.</dd></div>
   <div><dt>Which is why the Regulator is the other route</dt><dd>A complaint about a responsible party is not made only to that party. The Information Regulator of South Africa takes complaints directly, and this screen naming its own contact would not change that.</dd></div>
  </dl></div>
  <button className="secondary full" onClick={() => navigate('Privacy & settings')}>Back to your privacy settings<ArrowRight size={17}/></button>
 </div>;
}
