import { useState } from 'react';
import { Check, FileText, Lock, ShieldX } from 'lucide-react';
import { NotConnected } from '../components/NotConnected';
import { can, roleById } from '../lib/vetting';
import { subjectById } from '../lib/vetting-fixtures';
import {
 certificateFrom, consultationFor, daysCovered, draftFor, isoOfOffset, keepForThisSession, longDayOf, offsetOfIso,
 protocolLine, refusalsFor, sickNote as c, type FitnessId, type Issuer, type SickNoteCertificate, type SickNoteDraft
} from '../lib/sick-note';
import { CertificateSheet } from './SickNoteCertificate';
import './sick-note.css';

/* The doctor's medical certificate — the sick note the founder asked for on 2 October 2026 — on the web.

   Two things are exported. SickNoteComposer is the compact form a consultation embeds: it is handed the
   consultation's reference, the patient and who is writing, and it refuses whatever
   packages/catalog/sick-note.json refuses, in that file's words, through lib/sick-note.ts. SickNoteDesk is
   the doctor's own page for it, so a certificate can be written without first opening a consultation —
   and it still has to choose one, because a certificate without a consultation is the first thing refused.

   What it will not do is the point of it. It does not let a nurse sign (the sentence she already reads on
   her assessment), nor a doctor whose registration lapsed (the vetting register's own refusal). It does not
   certify a call with nobody in the room, a consultation that has not happened, more days back than the
   contract allows or more days than one certificate covers. It describes the illness only when the patient
   has agreed, and never carries an identity number. And it issues nothing: a signature here shows the
   certificate as the patient would read it, marked not issued, and keeps it in this page's memory so the
   patient's Passport can show it in the same tab — no storage API, no request, gone on reload.

   Every word on it is the contract's. Nothing is typed here that a phone would have to type again. */

const issuerFor = (writerId: string): Issuer => {
 const subject = subjectById(writerId);
 if (!subject) return { granted: false, allowed: false, reason: c.issuer.notADoctor, name: writerId, registration: '' };
 const granted = (roleById(subject.roleId)?.grants ?? []).some(g => g.capability === c.issuer.capability);
 const decision = can(subject, c.issuer.capability);
 return { granted, allowed: decision.allowed, reason: decision.reason ?? '', name: subject.name, registration: subject.reference };
};
const writers = c.issuer.writers.map(id => subjectById(id)).filter(s => !!s);

export function SickNoteComposer({ reference = 'TH-2048', patient = 'Lerato Molefe', writer = 'D-401', onClose, onSign }:
 { reference?: string; patient?: string; writer?: string; onClose?: () => void; onSign?: (certificate: SickNoteCertificate) => boolean }) {
 const [writerId, setWriterId] = useState(writer);
 const [draft, setDraft] = useState<SickNoteDraft>(() => draftFor(reference, patient));
 const [signed, setSigned] = useState<SickNoteCertificate | null>(null);
 const issuer = issuerFor(writerId);
 const refusals = refusalsFor(draft, issuer);
 const seen = consultationFor(reference);
 const set = (next: Partial<SickNoteDraft>) => setDraft(current => ({ ...current, ...next }));

 if (signed) return <div className="sn sn-done">
  <div className="sn-signed" role="status"><Check size={18} aria-hidden="true"/><strong>{c.screen.signed}</strong><span>{c.notIssuedShort}</span></div>
  <h4 className="sn-sub">{c.screen.asSeenHeading}</h4>
  <CertificateSheet certificate={signed}/>
  <p className="sn-quiet">{c.memoryOnly}</p>
  <div className="sn-actions">
   <button className="secondary" onClick={() => { setSigned(null); setDraft(draftFor(reference, patient)); }}>{c.screen.again}</button>
   {onClose && <button className="primary" onClick={onClose}>{c.screen.close}</button>}
  </div>
 </div>;

 const sign = () => {
  if (refusals.length) return;
  const certificate = certificateFrom(draft, issuer, longDayOf);
  if (onSign && !onSign(certificate)) return;
  keepForThisSession(certificate);
  setSigned(certificate);
 };

 return <div className="sn">
  <p className="sn-banner" role="note"><FileText size={16} aria-hidden="true"/>{c.notIssued}</p>
  <div className="sn-facts">
   <div><span>{c.screen.consultationLabel}</span><strong>{seen ? `${seen.reference} · ${longDayOf(seen.dayOffset)} at ${seen.time}` : reference}</strong></div>
   <div><span>{c.fields.find(f => f.id === 'patient')?.label}</span><strong>{patient}</strong></div>
   <label className="sn-writer"><span>{c.screen.writingAs}</span>
    <select value={writerId} onChange={e => setWriterId(e.target.value)}>
     {writers.map(w => <option key={w.id} value={w.id}>{w.name} · {w.reference}</option>)}
    </select>
   </label>
  </div>
  {seen?.kind === 'home-visit' && <p className="sn-quiet">{c.basis.homeVisit} {c.basis.byVideo}</p>}
  <p className="sn-quiet sn-protocol">{protocolLine}</p>

  <fieldset className="sn-fitness">
   <legend>{c.screen.fitnessLabel}</legend>
   {c.fitness.map(f => <label key={f.id}>
    <input type="radio" name={`sn-fitness-${reference}`} value={f.id} checked={draft.fitness === f.id} onChange={() => set({ fitness: f.id as FitnessId })}/>
    <span>{f.label}</span>
   </label>)}
  </fieldset>

  <div className="sn-period">
   <label><span>{c.screen.fromLabel}</span><input type="date" value={isoOfOffset(draft.fromOffset)} onChange={e => e.target.value && set({ fromOffset: offsetOfIso(e.target.value) })}/></label>
   <label><span>{c.screen.toLabel}</span><input type="date" value={isoOfOffset(draft.toOffset)} onChange={e => e.target.value && set({ toOffset: offsetOfIso(e.target.value) })}/></label>
   <p className="sn-count"><strong>{Math.max(daysCovered(draft), 0)}</strong> {c.screen.daysLabel}</p>
  </div>

  {/* Rule 16(1)(f). The proviso is the default: unticked, the certificate says only whether the patient
      can work, and the description box is not on the form. Unticking clears it, so nothing written before
      the patient changed their mind can reach the certificate. */}
  <label className="sn-consent">
   <input type="checkbox" checked={draft.consent} onChange={e => set({ consent: e.target.checked, description: e.target.checked ? draft.description : '' })}/>
   <span>{c.diagnosis.consentLabel}</span>
  </label>
  {draft.consent ? <label className="sn-description"><span>{c.diagnosis.descriptionLabel}</span>
   <textarea value={draft.description} maxLength={c.diagnosis.descriptionMaxLength} placeholder={c.diagnosis.descriptionHint} onChange={e => set({ description: e.target.value })}/>
  </label> : <p className="sn-withheld"><Lock size={14} aria-hidden="true"/>{c.diagnosis.withheld}</p>}
  <ul className="sn-not-carried">{c.notCarried.map(n => <li key={n.id}>{n.sentence}</li>)}</ul>

  {refusals.length > 0 ? <div className="sn-refusals" role="status">
   <h4>{c.screen.refusedHeading}</h4>
   <ul>{refusals.map(r => <li key={r.id} data-refusal={r.id}><ShieldX size={14} aria-hidden="true"/>{r.sentence}</li>)}</ul>
  </div> : <p className="sn-ready" role="status">{c.screen.readyLine}</p>}

  <div className="sn-actions">
   {onClose && <button className="secondary" onClick={onClose}>{c.screen.close}</button>}
   <button className="primary" disabled={refusals.length > 0} onClick={sign}><Check size={16} aria-hidden="true"/>{c.screen.sign}</button>
  </div>
 </div>;
}

/* The doctor's page: the consultations a certificate may come out of, and the composer for the one
   chosen. A consultation the contract refuses is still listed, because a doctor who cannot find the call
   she just held is owed the reason it is not certifiable rather than its absence. */
export function SickNoteDesk() {
 const [reference, setReference] = useState(c.consultations[0].reference);
 const chosen = consultationFor(reference) ?? c.consultations[0];
 return <section className="sn-desk">
  <NotConnected of="clinical-records"/>
  <p className="sn-lead">{c.screen.deskLead}</p>
  <div className="sn-choices" role="group" aria-label={c.screen.consultationLabel}>{c.consultations.map(k =>
   <button key={k.reference} className="sn-choice" aria-pressed={k.reference === reference} onClick={() => setReference(k.reference)}>
    <strong>{k.reference}</strong><span>{k.patient}</span><small>{longDayOf(k.dayOffset)} · {k.time}</small>
   </button>)}</div>
  <SickNoteComposer key={chosen.reference} reference={chosen.reference} patient={chosen.patient}/>
  <details className="sn-rules">
   <summary>{c.screen.rulesHeading}</summary>
   <dl>{c.fields.map(f => <div key={f.id}><dt>{f.label}</dt><dd>{f.rule}</dd></div>)}</dl>
   <ul>{c.sources.map(s => <li key={s.id}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>)}</ul>
  </details>
 </section>;
}
