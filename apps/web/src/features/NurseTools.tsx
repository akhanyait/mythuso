import { ArrowRight, Ban, GraduationCap, ShieldCheck, ShieldX } from 'lucide-react';
import { SectionTitle } from '../components/UI';
import { NotConnected } from '../components/NotConnected';
import { modules, money, services } from '../lib/catalog';
import { capabilityById, roleById } from '../lib/vetting';

/* The two tools on a nurse's own home screen with nothing behind them.
 *
 * *Locum shifts* and *Academy* sat under "More tools" and opened the shell's not-drawn dialog —
 * "This workflow is in the roadmap and is not drawn yet" — which is true and is the wrong answer
 * here, because both of them are things a nurse has an immediate question about and both have
 * something real to say. A shift marketplace and a training record are the two places in a
 * healthcare platform where the pressure to loosen vetting is highest, and what MyThuso will refuse
 * in each is already written down: locum is its own vetted role in packages/catalog/vetting.json,
 * with its own six checks and its own refusal, and no course anywhere in that file is a check.
 *
 * So each screen says three things: what the module is and when the plan says it arrives, what it
 * would be for, and — the part worth the screen — the one thing it will not do. Nothing here is a
 * workflow and neither screen pretends to be one. */

const moduleRow = (name: string) => modules.find(([moduleName]) => moduleName === name)!;

export function LocumShifts({ onClose }: { onClose: () => void }) {
 const [, description, phase] = moduleRow('Thuso Locum');
 const locum = roleById('locum')!;
 const nurse = roleById('nurse')!;
 /* What a shift is worth is the catalogue's own nurse share, not a rate typed onto a marketplace. */
 const visit = services.find(s => s.phase === 1)!;
 return <div className="form-stack">
  <NotConnected of="dispatch"/>
  <p className="muted">Thuso Locum · {phase}. {description}. It is not drawn as a workflow and no shift can be picked up here.</p>

  <SectionTitle title="What it would be"/>
  <div className="panel"><dl className="stated">
   <div><dt>Visits somebody else could not take</dt><dd>A visit that has been released — a nurse off duty, a nurse whose day is full, an area with nobody in it — offered to a cleared locum rather than left on the Control Tower’s board.</dd></div>
   <div><dt>Paid at the same share as any other visit</dt><dd>{Math.round((visit.nurseShare / visit.price) * 100)}% of the visit, so a {visit.name.toLowerCase()} at {money(visit.price)} pays {money(visit.nurseShare)} whoever takes it. A shift market that pays less for the same work is a way of paying less for the same work.</dd></div>
   <div><dt>Held to a register of its own</dt><dd>{locum.summary} It carries {locum.checks.length} checks — not the nurse’s {nurse.checks.length} borrowed, its own.</dd></div>
  </dl></div>

  {/* The refusal is the feature. It is the register's own sentence rather than a paraphrase. */}
  <SectionTitle title="What it will not do"/>
  <div className="panel">{locum.grants.map(grant => <div className="record-row static" key={grant.capability}>
   <span className="service-icon check-declined"><Ban size={20}/></span>
   {/* The capability's own name, not its identifier with the hyphens taken out: "take visit" is a
       row heading nobody wrote. */}
   <span><strong>{capabilityById(grant.capability)?.name ?? grant.capability}</strong><small>{grant.refusal}</small></span>
  </div>)}</div>
  <div className="privacy-note alert"><ShieldX size={19}/>Urgency is not a reason to send somebody. A shift that nobody cleared can take stays unfilled, and the Control Tower has no override for it — which is the same rule the dispatch board is already held to, and the reason this is a register rather than a sign-up sheet.</div>
  <button className="primary full" onClick={onClose}>Close<ArrowRight size={16}/></button>
 </div>;
}

export function Academy({ onClose }: { onClose: () => void }) {
 const [, description, phase] = moduleRow('Thuso Academy');
 const nurse = roleById('nurse')!;
 return <div className="form-stack">
  <NotConnected of="credential-verification"/>
  <p className="muted">Thuso Academy · {phase}. {description}. It is not drawn as a workflow and no course can be started here.</p>

  <SectionTitle title="What it would be"/>
  <div className="panel"><dl className="stated">
   <div><dt>Continuing professional development, recorded</dt><dd>What you did, when, how long it took and who ran it — the record a council asks for, kept in the place you already keep your registration.</dd></div>
   <div><dt>Written for the work in front of you</dt><dd>A nurse working alone in somebody’s house has a different syllabus from one on a ward: what to do when a reading is wrong, when a house is not safe, and when the answer is to stop and call.</dd></div>
   <div><dt>Yours, and portable</dt><dd>A training record belongs to the person who earned it. It is not a thing MyThuso holds over somebody who wants to work elsewhere.</dd></div>
  </dl></div>

  {/* The line that matters, and it runs the other way from what a training product usually claims. */}
  <SectionTitle title="What it will not do"/>
  <div className="panel"><dl className="stated">
   <div><dt>A course is never a check</dt><dd>None of the {nurse.checks.length} checks on the nurse register is a MyThuso course, and none of them ever will be. Every one is issued by somebody outside this company — a council, a police service, an insurer — and a platform that could clear its own workforce by teaching them is not vetting anybody.</dd></div>
   <div><dt>Finishing one clears nothing</dt><dd>{nurse.grants[0].refusal}</dd></div>
   <div><dt>And it is not a route round a lapse</dt><dd>A check that has lapsed is renewed with the body that issued it. Nothing on a training screen shortens that, and nothing on it may be presented as if it had.</dd></div>
  </dl></div>
  <div className="privacy-note"><GraduationCap size={19}/>Where a course does count towards a council’s own CPD requirement, what counts is the council’s decision and the certificate is theirs. MyThuso would record that it happened; it would not decide what it was worth.</div>
  <div className="privacy-note"><ShieldCheck size={19}/>Nothing here is accredited, and nothing on this screen has been read by an education provider or a professional council.</div>
  <button className="primary full" onClick={onClose}>Close<ArrowRight size={16}/></button>
 </div>;
}
