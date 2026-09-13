import { ShieldCheck, Stethoscope } from 'lucide-react';
import { initialsOf } from '../lib/names';
import { checkById, checkStateLabels, formatDate, roleById, stateOf, type VettingSubject } from '../lib/vetting';

/** Identity and verification come from the same record the governance screen reads. */
export function ClinicianProfile({ subject, name, role, reference, detail, access }: {
 subject?: VettingSubject; name: string; role: string; reference: string; detail?: string; access?: string;
}) {
 return <article className="clinician-profile">
  <header><span className="clinician-monogram" aria-hidden="true">{initialsOf(name)}</span>
   <div><p className="home-eyebrow">YOUR CARE TEAM · SAMPLE PROFILE</p><h3>{name}</h3><p>{role}</p></div><Stethoscope size={22} aria-hidden="true"/>
  </header>
  <dl className="clinician-facts"><div><dt>Registration reference</dt><dd>{reference || 'Not recorded'}</dd></div>
   {subject?.zone && <div><dt>Practice area</dt><dd>{subject.zone}</dd></div>}
  </dl>
  {detail && <p>{detail}</p>}{access && <p className="helper">{access}</p>}
  <details className="clinician-checks"><summary><ShieldCheck size={17}/>View verification record</summary>
   <p className="helper">Fictional preview credentials. No live registration check has been performed.</p>
   {subject ? <ul>{(roleById(subject.roleId)?.checks ?? []).map(check => {
    const record = subject.records.find(r => r.checkId === check.id);
    return <li key={check.id}><div><strong>{checkById(subject.roleId, check.id)?.name ?? check.id}</strong><span>{checkStateLabels[stateOf(subject, check.id)]}</span></div>
     <small>{record?.decidedOn ? `Checked ${formatDate(record.decidedOn)}` : 'Check not completed'}{record?.expiresOn ? ` · Review due ${formatDate(record.expiresOn)}` : ''}</small></li>;
   })}</ul> : <p>No verification record is linked to this profile.</p>}
  </details>
 </article>;
}
