import { useState } from 'react';
import { ArrowRight, Ban, CalendarClock, CircleAlert, Ear, Info, Lock, Pill as PillIcon, Repeat, ShieldX, Signature, Stethoscope } from 'lucide-react';
import { Button } from '../ui';
import { EmptyNote, Pill, SectionTitle } from '../components/UI';
import { NotConnected } from '../components/NotConnected';
import {
 authorisation, authorisedOn, binds, classById, collectionAnswer, daysOfMedicineLeft, expiresInDays,
 expiresOn, formatDay, groundById, handover, isFinalRepeat, lastCollectedOn, mayChange, neverChanges,
 nextCollectionOn, pharmacist, prescription, refusalById, refusals, repeatsRemaining, ruleById,
 statutoryGrounds, strandedRepeats, substituted, substitutionClasses, tellingFor, type PrescribedItem
} from '../lib/dispensing';
import { can } from '../lib/vetting';
import { subjectById, subjectsByRole } from '../lib/vetting-fixtures';

/* Substitution, and how long a repeat is allowed to live.
 *
 * A pharmacist hands over something other than what was written. A repeat runs out. Both are the
 * most ordinary events in a pharmacy and both are where harm hides, so the screen is built out of
 * the distinctions that ordinariness erodes:
 *
 *   A substitution is a clinical decision, not a stock decision. An empty shelf is a reason to think
 *   about an alternative; it is never on its own a reason to hand one over. Each item says which of
 *   the three classes it is in and on what ground, and a "must not" item has no control on it at
 *   all — not a disabled one. A button that refuses is still a button somebody will look for a way
 *   around, and there is nothing here to work around.
 *
 *   The patient is told, in words, before they accept it. Nothing can be marked handed over until
 *   the words have actually been shown, which is a gate rather than a reminder: a screen that lets
 *   the last step be taken first has not asked for anything.
 *
 *   Who decided. Every substituted item carries the pharmacist's name and SAPC registration, the
 *   same way a clinical sign-off does.
 *
 *   The authorisation is boxed twice, by a date and by a number of repeats, and it ends on whichever
 *   arrives first. Both boxes are arithmetic on the contract rather than a sentence somebody typed.
 *
 * Two things this screen refuses are refused elsewhere and quoted here rather than restated: a
 * pharmacy whose responsible pharmacist is not current cannot be dispensed to, and a doctor whose
 * registration has lapsed cannot stand behind the prescription. Both answers come from the vetting
 * module in its own words, because a second sentence about the same refusal is a second sentence to
 * keep in step.
 *
 * Nothing is dispensed. No pharmacy is contacted and every patient, pharmacist and product is
 */

const pharmacies = subjectsByRole('pharmacy');
/* Two doctors: one whose registration is current and one whose HPCSA registration lapsed four days
   ago. Switching between them changes who is behind the prescription and nothing else, which is the
   rule made visible rather than asserted. */
const prescribers = ['D-401', 'D-402'];

function ClassPill({ id }: { id: string }) {
 const klass = classById(id);
 return <Pill tone={klass.tone}>{klass.shortName}</Pill>;
}

/* The words. Not a label on a box — sentences a person can repeat to somebody else at home. */
function Telling({ item }: { item: PrescribedItem }) {
 const telling = tellingFor(item);
 return <div className="disp-telling">
  <p className="disp-telling-head"><Ear size={16}/>{telling.headline}</p>
  {telling.replaces ? <p className="disp-replaces">It replaces <strong>{telling.replaces}</strong>.</p> : null}
  <p className="disp-words">{telling.words}</p>
  {telling.same.length ? <div className="disp-columns">
   <div><h4>The same</h4><ul>{telling.same.map(s => <li key={s}>{s}</li>)}</ul></div>
   <div><h4>Different</h4><ul>{telling.different.map(s => <li key={s}>{s}</li>)}</ul></div>
  </div> : null}
 </div>;
}

function Item({ item, told, onTell, handed, onHand, mayDispense }: {
 item: PrescribedItem; told: boolean; onTell: () => void; handed: boolean; onHand: () => void; mayDispense: boolean;
}) {
 const klass = classById(item.classId);
 const ground = groundById(item.ground);
 const second = item.secondGround ? groundById(item.secondGround) : undefined;
 return <div className={`panel disp-item ${item.classId}`}>
  <div className="disp-item-head">
   <span className="service-icon"><PillIcon size={21}/></span>
   <div>
    <strong>{item.dispensed}</strong>
    <small>{item.molecule} {item.strength} · {item.form} · {item.dose} · {item.quantity}</small>
   </div>
   <ClassPill id={item.classId}/>
  </div>
  {item.outcome === 'substituted'
   ? <p className="disp-prescribed">Written: <strong>{item.prescribed}</strong></p>
   : <p className="disp-prescribed">Written and dispensed: <strong>{item.prescribed}</strong></p>}
  <p className="disp-ground"><Info size={15}/><span><strong>{ground.name}{ground.section ? ` · section ${ground.section}` : ''}</strong> {ground.detail}</span></p>
  {second ? <p className="disp-ground"><Info size={15}/><span><strong>{second.name}{second.section ? ` · section ${second.section}` : ''}</strong> {second.detail}</span></p> : null}
  <p className="helper">{klass.whoDecides}</p>

  {/* A "must not" item carries no control. A disabled button is still a button somebody looks for a
      way around; the refusal is the absence, and the sentence says where the route actually is. */}
  {item.classId === 'must-not'
   ? <div className="disp-refusal"><Ban size={18}/><p>{refusalById('override-do-not-substitute').sentence}</p></div>
   : null}

  {item.writtenReason ? <div className="disp-signed">
   <Signature size={18}/>
   <div><strong>{pharmacist.name} · {pharmacist.registration}</strong>
    <small>{pharmacist.role} · the prescriber was told the same day</small>
    <p>{item.writtenReason}</p></div>
  </div> : null}

  <button className="text-button" aria-expanded={told} onClick={onTell}>
   <Ear size={15}/>{told ? 'Hide what was said to the patient' : 'Read this to the patient'}
  </button>
  {told ? <Telling item={item}/> : null}

  <label className={`checkbox disp-hand${told && mayDispense ? '' : ' is-blocked'}`}>
   <input type="checkbox" checked={handed} disabled={!told || !mayDispense} onChange={onHand}
    aria-label={`Hand over ${item.dispensed}`}/>
   <span/>
   <em>{told ? 'Handed over' : 'Nothing is handed over before the patient has been told what it is'}</em>
  </label>
  <p className="helper">{item.note}</p>
 </div>;
}

export function Dispensing() {
 const [pharmacyId, setPharmacyId] = useState(pharmacies[0].id);
 const [prescriberId, setPrescriberId] = useState(prescribers[0]);
 const [told, setTold] = useState<string[]>([]);
 const [handed, setHanded] = useState<string[]>([]);
 const [collectTried, setCollectTried] = useState(false);

 const pharmacy = pharmacies.find(p => p.id === pharmacyId)!;
 const prescriber = subjectById(prescriberId)!;
 const mayDispense = can(pharmacy, 'dispense');
 const mayPrescribe = can(prescriber, 'prescribe');
 const collection = collectionAnswer();
 const open = mayDispense.allowed && mayPrescribe.allowed;
 const everyItemTold = prescription.items.every(i => told.includes(i.id));

 return <div className="dispensing">
  <NotConnected of="dispensing"/>
  <div className="order-head">
   <span className="service-icon"><PillIcon size={22}/></span>
   <div><h3>{prescription.reference}</h3>
    <p className="muted">{prescription.patient} · {prescription.patientBorn} · issued {formatDay(prescription.issued)}</p></div>
   <Pill tone={open ? 'plain' : 'danger'}>{open ? 'Awaiting handover' : 'Held'}</Pill>
  </div>

  <div className="review-line"><span>Prescribed by</span><strong>{prescriber.name} · {prescriber.reference}</strong></div>
  <div className="review-line"><span>Dispensed by</span><strong>{pharmacist.name} · {pharmacist.registration}</strong></div>
  <div className="review-line"><span>At</span><strong>{pharmacy.name} · {pharmacy.reference}</strong></div>

  <fieldset className="disp-switch">
   <legend className="visually-hidden">Who is filling this prescription</legend>
   <label>Dispensing pharmacy<select value={pharmacyId} onChange={e => { setPharmacyId(e.target.value); setHanded([]); }}>
    {pharmacies.map(p => <option key={p.id} value={p.id}>{p.name} · {p.reference}</option>)}
   </select></label>
   <label>Prescriber<select value={prescriberId} onChange={e => { setPrescriberId(e.target.value); setHanded([]); }}>
    {prescribers.map(id => { const d = subjectById(id)!; return <option key={id} value={id}>{d.name} · {d.reference}</option>; })}
   </select></label>
   <p className="helper">Both answers below come from the vetting register in its own words. A licence and a registration are not badges on a partner page; they are what decides whether anything on this screen does anything.</p>
  </fieldset>

  {!mayDispense.allowed ? <div className="privacy-note alert" role="status"><ShieldX size={19}/>{mayDispense.reason}</div> : null}
  {!mayPrescribe.allowed ? <div className="privacy-note alert" role="status"><Stethoscope size={19}/>{mayPrescribe.reason}</div> : null}

  <SectionTitle title="What a substitution may and may not change"/>
  <div className="panel disp-boundary">
   <div className="disp-columns">
    <div><h4>Never, without the prescriber</h4>
     <ul>{neverChanges.map(c => <li key={c.what}><strong>{c.what}</strong> — {c.why}</li>)}</ul></div>
    <div><h4>May change, and the patient is told</h4>
     <ul>{mayChange.map(c => <li key={c.what}><strong>{c.what}</strong> — {c.why}</li>)}</ul></div>
   </div>
   <div className="disp-refusal"><Ban size={18}/><p>{refusalById('substitute-the-molecule').sentence}</p></div>
  </div>

  <SectionTitle title="The three classes"/>
  <div className="panel disp-classes">
   {substitutionClasses.map(c => <div key={c.id} className={`disp-class ${c.id}`}>
    <ClassPill id={c.id}/>
    <div><strong>{c.name}</strong><p>{c.detail}</p>
     <small>{c.whoDecides}{c.needsWrittenReason ? ' A written reason is part of it.' : ''}</small></div>
   </div>)}
   <p className="helper">There is no fourth class called “may be substituted”. Section 22F of the Medicines and Related Substances Act 101 of 1965 makes telling the patient a duty on every substitution, with four exceptions — {statutoryGrounds.map(g => `${g.name.toLowerCase()} (${g.section})`).join(', ')} — so a silent swap is not the mild end of this screen. It is outside it.</p>
  </div>

  <SectionTitle title={`Five items · ${substituted.length} substituted`}/>
  <p className="muted">{ruleById('substitution-is-clinical').sentence}</p>
  <div className="disp-items">
   {prescription.items.map(item => <Item key={item.id} item={item} mayDispense={open}
    told={told.includes(item.id)}
    onTell={() => setTold(told.includes(item.id) ? told.filter(x => x !== item.id) : [...told, item.id])}
    handed={handed.includes(item.id)}
    onHand={() => setHanded(handed.includes(item.id) ? handed.filter(x => x !== item.id) : [...handed, item.id])}/>)}
  </div>
  <p className="disp-rule"><Info size={15}/>{ruleById('patient-is-told-first').sentence}</p>
  <p className="disp-rule"><Signature size={15}/>{ruleById('substitution-is-signed').sentence}</p>

  <SectionTitle title="The handover"/>
  <ol className="timeline disp-handover">{handover.map((step, index) => {
   const state = !open ? 'waiting'
    : index < 2 ? 'done'
     : step.id === 'told' ? (everyItemTold ? 'done' : 'active')
      : step.id === 'accepted' ? (everyItemTold ? 'active' : 'waiting')
       : (handed.length === prescription.items.length ? 'done' : 'waiting');
   return <li key={step.id} className={state}>
    <span className="timeline-dot"/>
    <div><strong>{step.label}</strong><small>{step.detail}</small></div>
   </li>;
  })}</ol>

  <SectionTitle title="The chronic authorisation"/>
  <div className="panel disp-authorisation">
   <div className="order-head plain">
    <span className="service-icon"><Repeat size={21}/></span>
    <div><h3>{authorisation.reference}</h3><p className="muted">{authorisation.programme} · {authorisation.condition}</p></div>
    <Pill tone={binds === 'date' ? 'amber' : 'teal'}>{repeatsRemaining} of {authorisation.repeatsAuthorised} repeats left</Pill>
   </div>
   <div className="disp-boxes">
    <div className="disp-box"><span>Runs out on</span><strong>{formatDay(expiresOn)}</strong>
     <small>{expiresInDays} days from today · authorised {formatDay(authorisedOn)} for {authorisation.validMonths} months</small></div>
    <div className="disp-box"><span>Medicine still authorised</span><strong>{daysOfMedicineLeft} days</strong>
     <small>{repeatsRemaining} repeats of {authorisation.daysPerRepeat} days</small></div>
    <div className="disp-box"><span>Ends on</span><strong>{binds === 'date' ? 'the date' : 'the repeats'}</strong>
     <small>Whichever comes first{strandedRepeats > 0 ? ` — ${strandedRepeats} of the repeats cannot be collected before it expires` : ''}</small></div>
   </div>
   <p className="helper">{authorisation.note}</p>
   <p className="helper">{authorisation.quantityNote}</p>
   <p className="disp-rule"><Info size={15}/>{ruleById('authorisation-is-boxed').sentence}</p>

   <div className="review-line"><span>Last collected</span><strong>{formatDay(lastCollectedOn)}</strong></div>
   <div className="review-line"><span>Next collection due</span><strong>{formatDay(nextCollectionOn)}</strong></div>
   <Button variant="primary" disabled={!open} onClick={() => setCollectTried(true)} trailingIcon={<ArrowRight aria-hidden="true"/>}>Collect a repeat</Button>
   {collectTried ? <div className={collection.allowed ? 'privacy-note' : 'privacy-note alert'} role="status">
    <CalendarClock size={19}/>{collection.reason}
   </div> : null}
   {collectTried && !collection.allowed ? <p className="disp-rule"><Info size={15}/>{ruleById('early-is-refused-with-a-date').sentence}</p> : null}
   {isFinalRepeat ? <div className="privacy-note alert" role="status"><CircleAlert size={19}/>This is the last repeat. It is said now, not at the counter next month.</div> : null}

   <div className="disp-ends">
    <Lock size={19}/>
    <div><strong>What happens at the end</strong>
     <p>{authorisation.endsWith}</p>
     <p className="disp-rule">{ruleById('ends-in-a-review').sentence}</p></div>
   </div>
  </div>

  <SectionTitle title="What this screen will not do"/>
  <div className="disp-refusals">{refusals.map(r => <div className="disp-refusal" key={r.id}><Ban size={19}/><p>{r.sentence}</p></div>)}</div>
  <EmptyNote>Scheduling status, cold-chain handling and the pharmacy's own stock system arrive with the dispensing partner. None of the clinical wording on this screen has been read by a pharmacist.</EmptyNote>
 </div>;
}

/* The one line the fulfilment queue and the prescription detail need: how many items on this script
   are not what was written. Derived, so it cannot say two while the list shows one. */
export function substitutionSummary() {
 return { substituted: substituted.length, items: prescription.items.length, repeatsRemaining, expiresInDays };
}
