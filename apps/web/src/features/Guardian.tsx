import { useState } from 'react';
import { ArrowLeft, ArrowRight, BadgeCheck, Check, Eye, FileText, LockKeyhole, ShieldCheck, UserRoundX } from 'lucide-react';
import { Pill } from '../components/UI';
import { NotConnected } from '../components/NotConnected';
export type Invitation = { id: string; name: string; relationship: string; scope: string; expires: string; status: 'Awaiting acceptance' | 'Verification pending' | 'Active' | 'Revoked' };
export const sampleInvitations: Invitation[] = [
 { id: 'INV-0031', name: 'Nomsa Molefe', relationship: 'Mother', scope: 'Visit summaries only', expires: 'Until I revoke it', status: 'Active' },
 { id: 'INV-0034', name: 'Kagiso Molefe', relationship: 'Brother', scope: 'Bookings and payments only', expires: '31 December 2026', status: 'Awaiting acceptance' }
];
/* Paying for someone's care is not the same as being allowed to read their records.
   Scope, duration and verification are three separate decisions, so they are three separate steps. */
const scopes = [
 { id: 'booking', icon: FileText, title: 'Bookings and payments only', body: 'They can arrange and pay for visits. They see no clinical information at all.' },
 { id: 'summaries', icon: Eye, title: 'Visit summaries only', body: 'They see what happened at a visit and what to do next. No history, results or medicines.' },
 { id: 'full', icon: LockKeyhole, title: 'Full Health Passport', body: 'Everything you can see. Appropriate for a guardian of a child, or where you have chosen to share fully.' }
];
export function InviteGuardian({ onInvite, onClose }: { onInvite: (i: Invitation) => void; onClose: () => void }) {
 const [step, setStep] = useState(0);
 const [name, setName] = useState('');
 const [relationship, setRelationship] = useState('Parent');
 const [scope, setScope] = useState('booking');
 const [expires, setExpires] = useState('Until I revoke it');
 const [understood, setUnderstood] = useState(false);
 const chosen = scopes.find(s => s.id === scope)!;
 const minor = relationship === 'Child under 18';
 return <div className="form-stack">
  <ol className="stepper wide" aria-label="Invitation progress">{['Who', 'What they see', 'For how long', 'Review'].map((s, i) => <li key={s} aria-current={i === step ? 'step' : undefined} className={i <= step ? 'current' : ''}><b>{i < step ? <Check size={12}/> : i + 1}</b>{s}</li>)}</ol>
  {step === 0 ? <>
   <h3>Who are you inviting?</h3>
   <p className="muted">They receive an invitation on their own phone and choose whether to accept. You can withdraw it at any time.</p>
   <label>Their name<input autoFocus value={name} onChange={e => setName(e.target.value.slice(0, 60))} placeholder="e.g. Nomsa Molefe" required/></label>
   <label>Their relationship to you<select value={relationship} onChange={e => setRelationship(e.target.value)}>
    <option>Parent</option><option>Child under 18</option><option>Adult child</option><option>Partner</option><option>Sibling</option><option>Carer</option><option>Other family member</option></select></label>
   {minor && <div className="privacy-note"><ShieldCheck size={19}/>For a child under 18 you are asking for guardianship, not sharing. Production requires proof of parental responsibility and a record of the child’s own views as they grow older.</div>}
   <div className="button-row"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!name.trim()} onClick={() => setStep(1)}>Continue<ArrowRight size={16}/></button></div>
  </> : step === 1 ? <>
   <h3>What should {name.split(' ')[0]} be able to see?</h3>
   <p className="muted">Start with the least you can live with. You can widen it later in one tap.</p>
   <div className="choice-list">{scopes.map(({ id, icon: Icon, title, body }) =>
    <label key={id} className={`choice-row ${scope === id ? 'selected' : ''}`}><input type="radio" name="scope" checked={scope === id} onChange={() => setScope(id)}/><span className="service-icon"><Icon size={20}/></span><span><strong>{title}</strong><small>{body}</small></span></label>)}</div>
   <div className="privacy-note"><LockKeyhole size={19}/>Sexual and reproductive health, mental health and HIV-related entries stay hidden under every scope unless you release them one by one.</div>
   <div className="button-row"><button className="secondary" onClick={() => setStep(0)}><ArrowLeft size={16}/>Back</button><button className="primary" onClick={() => setStep(2)}>Continue<ArrowRight size={16}/></button></div>
  </> : step === 2 ? <>
   <h3>For how long?</h3>
   <label>Access expires<select value={expires} onChange={e => setExpires(e.target.value)}>
    <option>Until I revoke it</option><option>Until the end of this visit</option><option>For 7 days</option><option>For 30 days</option><option>31 December 2026</option></select></label>
   <p className="helper">Time-limited access is the safer default. An open-ended grant is reviewed with you every six months.</p>
   <div className="privacy-note"><BadgeCheck size={19}/>{name.split(' ')[0]} must verify their identity before the invitation becomes active. An unverified invitation grants nothing.</div>
   <div className="button-row"><button className="secondary" onClick={() => setStep(1)}><ArrowLeft size={16}/>Back</button><button className="primary" onClick={() => setStep(3)}>Review<ArrowRight size={16}/></button></div>
  </> : <>
   <h3>Check this before you send it.</h3>
   <div className="review-line"><span>Person</span><strong>{name}</strong></div>
   <div className="review-line"><span>Relationship</span><strong>{relationship}</strong></div>
   <div className="review-line"><span>They will see</span><strong>{chosen.title}</strong></div>
   <div className="review-line"><span>Access ends</span><strong>{expires}</strong></div>
   <div className="review-line"><span>Before it starts</span><strong>Identity verification{minor ? ' and proof of guardianship' : ''}</strong></div>
   <NotConnected of="messaging"/>
   <label className="checkbox"><input type="checkbox" checked={understood} onChange={e => setUnderstood(e.target.checked)}/><span>I have checked the person, the relationship and what they will be able to see.</span></label>
   <div className="button-row"><button className="secondary" onClick={() => setStep(2)}><ArrowLeft size={16}/>Back</button>
    <button className="primary" disabled={!understood} onClick={() => onInvite({ id: `INV-00${40 + Math.floor(Math.random() * 50)}`, name: name.trim(), relationship, scope: chosen.title, expires, status: 'Verification pending' })}>Send demo invitation<ArrowRight size={16}/></button></div>
  </>}
 </div>;
}
/* Four statuses, one badge shape. "Active" used to be a teal pill and everything else a bare
   uppercase caption, so two invitations in the same list were told apart by two different kinds of
   thing rather than by two different words. The word still carries the meaning — the tone only
   repeats it — because a status a reader has to see in colour is a status half of them cannot. */
const invitationTone = (status: Invitation['status']) =>
 status === 'Active' ? 'teal' : status === 'Revoked' ? 'danger' : 'amber';
export function InvitationList({ invitations, onRevoke }: { invitations: Invitation[]; onRevoke: (id: string) => void }) {
 return <div className="panel">
  {invitations.map(i => <div className="record-row static invitation-row" key={i.id}>
   <span className="service-icon"><ShieldCheck size={20}/></span>
   <span><strong>{i.name} · {i.relationship}</strong><small>{i.scope} · Ends: {i.expires}</small><small>{i.id}</small></span>
   <Pill tone={invitationTone(i.status)}>{i.status}</Pill>
   <button className="secondary" disabled={i.status === 'Revoked'} onClick={() => onRevoke(i.id)}><UserRoundX size={15}/>{i.status === 'Revoked' ? 'Revoked' : 'Revoke'}</button>
  </div>)}
  <p className="helper">Revoking takes effect immediately and the other person is told. Anything they already saw cannot be un-seen, which is why scope matters more than revocation.</p>
 </div>;
}
