import { useState } from 'react';
import { Activity, ArrowRight, CalendarDays, ClipboardPlus, FileText, FlaskConical, Heart, LockKeyhole, MapPin, Receipt, Send, ShieldCheck, Stethoscope, Thermometer, Upload, UserRound, Weight, Wind } from 'lucide-react';
import { EmptyNote, Pill, SectionTitle } from '../components/UI';
import { CalibrationCaveat, CalibrationTag, ProvenanceTag } from '../components/Provenance';
import { ClinicalChart } from '../components/Chart';
import { EmptyState } from '../components/States';
import { NotConnected } from '../components/NotConnected';
import { can, roleById, subjectStatusLabels, summarise, type Decision, type VettingSubject } from '../lib/vetting';
import { subjectsByRole } from '../lib/vetting-fixtures';
import { money } from '../lib/catalog';
import {
 ageFrom, canOpen, canOpenRecord, canOpenTab, consultationSections, fileActions, fileTabs, isProtected, longDate,
 patients, protectedCategories, recordById, releaseRefusal, shortDate, soap, summaryCard, timelineFor,
 type PatientRecord, type Sensitive, type TimelineEntry
} from '../lib/records';

/* The clinician-facing patient file: what a nurse or a doctor opens *about somebody else*. It is
   not the Health Passport, which is the patient's own view of their own record, and neither
   replaces the other — the audience is different, so the refusals are different too.

   The shape is the product owner's: a digital profile and a clinical timeline rather than a paper
   folder. What has to be known immediately is in a header that never leaves the screen; the depth
   is behind eight tabs, which is the whole of packages/catalog/records.json's navigation. The 42
   record types in that file are the data model, not the menu.

   Everything below — every tab, every action, every field group — asks can(subject, capability)
   before it renders. Nothing here is a security control: this is a preview with no server, and a
   gate drawn in a browser gates nothing. It is the design of one, and it is honest about what it
   refuses so that the refusals can be reviewed before they are built. */

/* One party per interesting answer, so a design review can watch the same file change shape rather
   than read a paragraph claiming it would. Two of them are refused everything: a nurse whose SAPS
   clearance lapsed nine days ago, and a doctor whose HPCSA registration lapsed four days ago —
   neither by anybody's decision, both by arithmetic on an expiry date. */
const viewerIds = ['D-401', 'N-201', 'N-204', 'D-402', 'P-501', 'G-032', 'O-801', 'A-901'];
const roster: VettingSubject[] = ['nurse', 'doctor', 'pharmacy', 'guardian', 'operator', 'admin'].flatMap(r => subjectsByRole(r));
const viewers: VettingSubject[] = viewerIds.map(id => roster.find(s => s.id === id)!).filter(Boolean);

/* view-patient-summary is one capability, but vetting.json writes a different sentence for each
   role that holds it, and those sentences do not describe the same summary. An operator "sees an
   address, a service and a window — never a clinical record"; a pharmacy "sees the prescription
   and the allergies that bear on filling it. Nothing else." Giving all three the same header
   because they share a capability id would be a gate that reads the contract's key and ignores
   its words. So the field groups are narrowed per role, and the role's own sentence is printed
   under the header as the reason. */
type FactId = 'name' | 'id' | 'dob' | 'sex' | 'mobile' | 'aid' | 'emergency' | 'facility' | 'address' | 'service' | 'window';
type ChipId = 'blood' | 'allergy' | 'chronic' | 'aid';
type Profile = { facts: FactId[]; chips: ChipId[] };
/* The name sits in the heading, so it is not repeated as a field. Everything else earns a row. */
const fullProfile: Profile = { facts: ['id', 'dob', 'sex', 'mobile', 'aid', 'emergency', 'facility'], chips: ['blood', 'allergy', 'chronic', 'aid'] };
const profiles: Record<string, Profile> = {
 operator: { facts: ['id', 'mobile', 'address', 'service', 'window'], chips: [] },
 pharmacy: { facts: ['id', 'dob', 'sex', 'mobile', 'facility'], chips: ['blood', 'allergy'] }
};
const profileFor = (roleId: string) => profiles[roleId] ?? fullProfile;
const grantSentence = (roleId: string, capability: string) => roleById(roleId)?.grants.find(g => g.capability === capability)?.refusal;

export function PatientFile({ open }: { open: (s: string) => void }) {
 const [patientId, setPatientId] = useState(patients[0].id);
 const [viewerId, setViewerId] = useState(viewers[0].id);
 const [tabName, setTabName] = useState(fileTabs[0].name);
 const [notice, setNotice] = useState('');
 const patient = patients.find(p => p.id === patientId)!;
 const viewer = viewers.find(v => v.id === viewerId)!;
 const tab = fileTabs.find(t => t.name === tabName)!;
 const decision = canOpenTab(viewer, tab);
 const refused = fileTabs.filter(t => !canOpenTab(viewer, t).allowed).length;
 const role = roleById(viewer.roleId);
 const status = summarise(viewer).status;
 const move = (name: string) => { setTabName(name); setNotice(''); };
 return <>
  <div className="page-intro">
   <div className="eyebrow">Clinical</div>
   <h1>Patient file</h1>
   <p>The file a nurse or a doctor opens about somebody else — and the sections each of them is refused.</p>
  </div>
  <NotConnected of="clinical-records"/>

  <section className="panel pf-review">
   <div className="pf-review-heading"><h2>The same file, through different eyes</h2></div>
   <p className="muted">Every tab, action and field group below asks the vetting module whether this party may see it. Change the viewer and the file changes shape, because a refusal that is only written down is a refusal nobody has tested.</p>
   <div className="pf-review-controls">
    <label className="inline-field">Open the file of
     <select value={patientId} onChange={e => { setPatientId(e.target.value); setNotice(''); }}>{patients.map(p => <option key={p.id} value={p.id}>{p.name} · {p.id}</option>)}</select>
    </label>
    <label className="inline-field">Viewing as
     <select value={viewerId} onChange={e => { setViewerId(e.target.value); setNotice(''); }}>{viewers.map(v => <option key={v.id} value={v.id}>{v.name} · {roleById(v.roleId)?.name}</option>)}</select>
    </label>
   </div>
   <div className="pf-review-status">
    <Pill tone={status === 'cleared' ? '' : status === 'expiring' ? 'amber' : 'danger'}>{subjectStatusLabels[status]}</Pill>
    <span className="helper">{viewer.reference} · {refused} of {fileTabs.length} sections refused to this viewer</span>
   </div>
  </section>

  <SummaryHeader patient={patient} viewer={viewer}/>

  <div className="underline-tabs" role="group" aria-label="Patient file sections">
   {fileTabs.map(t => { const unlocked = canOpenTab(viewer, t).allowed; return <button key={t.name} className={t.name === tabName ? 'selected' : ''} aria-pressed={t.name === tabName} onClick={() => move(t.name)}>
    {t.name}{!unlocked && <><LockKeyhole size={13} aria-hidden="true"/><span className="visually-hidden"> — refused</span></>}
   </button>; })}
  </div>

  <p role="status" aria-live="polite" className="visually-hidden">{patient.name}, {patient.id}. Viewing as {viewer.name}, {role?.name.toLowerCase()}. {tabName} is {decision.allowed ? 'open' : 'refused'}. {refused} of {fileTabs.length} sections are refused to this viewer.</p>

  <p className="pf-holds">{tab.holds}</p>
   {!decision.allowed ? <Refusal title={`${tabName} — not open to this viewer`} decision={decision}/>
    : tabName === 'Overview' ? <Overview patient={patient} viewer={viewer} notice={notice} setNotice={setNotice} go={move}/>
     : tabName === 'Timeline' ? <Timeline patient={patient} viewer={viewer}/>
      : tabName === 'Consultations' ? <Consultations patient={patient} viewer={viewer}/>
       : tabName === 'Medication' ? <Medication patient={patient} viewer={viewer} open={open}/>
        : tabName === 'Results' ? <Results patient={patient} viewer={viewer} open={open}/>
         : tabName === 'Referrals' ? <Referrals patient={patient} viewer={viewer}/>
          : tabName === 'Documents' ? <Documents patient={patient} viewer={viewer}/>
           : <Billing patient={patient} viewer={viewer}/>}
  <p className="helper pf-not-built"><ShieldCheck size={14}/>{tab.notBuilt}</p>
 </>;
}

/* ---- Refusals ----------------------------------------------------------------------------
   A refused thing says the sentence the vetting contract wrote for it, and names the checks that
   are standing in the way. A greyed control with no explanation teaches a clinician that the
   system is broken; a sentence teaches them what to do next. */
function Refusal({ title, decision }: { title: string; decision: Decision }) {
 return <div className="pf-refusal" role="note">
  <span className="pf-refusal-icon"><LockKeyhole size={19}/></span>
  <div>
   <strong>{title}</strong>
   <p>{decision.reason}</p>
   {decision.blockedBy.length > 0 && <p className="helper">Outstanding: {decision.blockedBy.map(c => c.name).join(' · ')}</p>}
  </div>
 </div>;
}

/* An entry a viewer holds a release for is marked as protected, so nobody reads it aloud in a room
   with somebody else in it. Only a reader who already holds the release ever sees the marker, so it
   discloses nothing it has not already disclosed. */
function ReleasedTag({ item }: { item: Sensitive }) {
 return isProtected(item) ? <Pill tone="amber">Protected · released to you</Pill> : null;
}

/* ---- The permanent header ----------------------------------------------------------------
   Present on every tab, because the thing a nurse needs at a glance is not on the tab she happens
   to have open. */
function SummaryHeader({ patient, viewer }: { patient: PatientRecord; viewer: VettingSubject }) {
 const decision = can(viewer, 'view-patient-summary');
 const profile = profileFor(viewer.roleId);
 const scope = grantSentence(viewer.roleId, 'view-patient-summary');
 /* A protected condition never becomes a chip — not for a nurse, not for a doctor holding a
    release, not for anybody. The header is read over a shoulder in a living room. */
 const chronic = patient.conditions.filter(c => !isProtected(c)).map(c => c.name);
 const facts: Record<FactId, [string, string]> = {
  name: ['Name', patient.name],
  id: ['Patient ID', patient.id],
  dob: ['Date of birth', `${longDate(patient.dob)} · ${ageFrom(patient.dob)} years`],
  sex: ['Sex', patient.sex],
  mobile: ['Mobile', patient.mobile],
  aid: ['Medical aid', `${patient.medicalAid.scheme} · ${patient.medicalAid.plan}`],
  emergency: ['Emergency contact', `${patient.emergency.name} · ${patient.emergency.relationship} · ${patient.emergency.mobile}`],
  facility: ['Preferred facility', patient.facility],
  address: ['Address', patient.address],
  service: ['Service booked', patient.service],
  window: ['Window', patient.window]
 };
 const chips: [ChipId, string, string, string][] = [
  ['blood', 'Blood group', patient.bloodGroup, ''],
  ['allergy', 'Allergies', patient.allergies.length ? patient.allergies.map(a => `${a.substance} — ${a.reaction.toLowerCase()}`).join(' · ') : 'None recorded', patient.allergies.length ? 'danger' : 'amber'],
  ['chronic', 'Chronic conditions', chronic.length ? chronic.join(' · ') : 'None recorded', ''],
  ['aid', 'Medical aid status', patient.medicalAid.status, patient.medicalAid.tone]
 ];
 if (!decision.allowed) return <section className="panel pf-header" aria-label="Patient summary">
  <div className="pf-identity"><span className="avatar pf-avatar" aria-hidden="true"><UserRound size={22}/></span><div><h2>Patient {patient.id}</h2><p className="muted">The file is open. The person is not.</p></div></div>
  <Refusal title="The patient summary is not open to this viewer" decision={decision}/>
  <WithheldNotice viewer={viewer}/>
 </section>;
 return <section className="panel pf-header" aria-label="Patient summary">
  <div className="pf-identity">
   <span className="avatar pf-avatar" aria-hidden="true">{patient.name.split(' ').map(w => w[0]).slice(0, 2).join('')}</span>
   <div><h2>{patient.name}</h2><p className="muted">{patient.id} · {patient.sex} · {ageFrom(patient.dob)} years</p></div>
  </div>
  <dl className="pf-facts">{profile.facts.map(f => <div key={f}><dt>{facts[f][0]}</dt><dd>{facts[f][1]}</dd></div>)}</dl>
  {profile.chips.length > 0 && <ul className="pf-chips">
   {chips.filter(c => profile.chips.includes(c[0])).map(([id, key, value, tone]) => <li key={id} className={`pf-chip ${tone}`}><span>{key}</span><strong>{value}</strong></li>)}
  </ul>}
  {scope && <p className="helper pf-scope"><ShieldCheck size={14}/>The header is cut to this role's own words in the vetting contract: “{scope}”</p>}
  <WithheldNotice viewer={viewer}/>
 </section>;
}

/* ---- The withheld notice -----------------------------------------------------------------
   The rule this whole surface exists to get right. It is written once, appears on every file, and
   reads identically whether the patient has three protected entries or none: a notice that turned
   up only when there was something behind it would disclose the thing it is hiding, as surely as
   a chip reading "Chronic: HIV" would. So there is no count, no category name and no difference
   between one patient and the next. */
/* The categories are the contract's, so the sentence is assembled from them rather than typed out
   beside them: a category added to records.json is named here without anybody editing this screen.
   Only the casing is ours, and an initialism keeps its capitals — “hIV” would be a category nobody
   recognises in the one sentence that has to be recognised. */
const withheldCategories = protectedCategories.map((term, i) => i === 0 || term[1]?.toUpperCase() === term[1] ? term : term[0].toLowerCase() + term.slice(1));
const withheldSentence = withheldCategories.length < 2 ? withheldCategories.join('')
 : `${withheldCategories.slice(0, -1).join(', ')} and ${withheldCategories[withheldCategories.length - 1]}`;
function WithheldNotice({ viewer }: { viewer: VettingSubject }) {
 const decision = can(viewer, 'view-protected-record');
 const ask = decision.allowed
  ? 'Vetted is not released: the patient releases a category entry by entry, in their own account, naming you. Ask them.'
  : `${decision.reason} Ask the patient, or the clinician they released it to.`;
 return <div className="pf-withheld" role="note">
  <span className="pf-refusal-icon"><LockKeyhole size={19}/></span>
  <div>
   <strong>A category is withheld from this header.</strong>
   <p>{summaryCard.withheld}</p>
   <p>{withheldSentence} are never a chip — and this notice stands on every file, whether or not anything is held behind it.</p>
   <p className="helper">{ask}</p>
  </div>
 </div>;
}

/* ---- Overview ----------------------------------------------------------------------------
   Three cards, the latest observations, four bullets and the last few events. Highly visual on
   purpose: a wall of text is read by nobody standing in a doorway. */
function Overview({ patient, viewer, notice, setNotice, go }: { patient: PatientRecord; viewer: VettingSubject; notice: string; setNotice: (s: string) => void; go: (t: string) => void }) {
 const clinical = can(viewer, 'view-clinical-record');
 /* The medicine card is reached the way a prescription is reached, not through the summary
    capability: a pharmacy holds neither the clinical record nor a reason to be told "no medicine
    is visible" when what it actually holds is dispense. Asked of the record type rather than of a
    pair of capabilities written out again here — the contract says which two open a prescription,
    and a second copy of that answer is a place for the two to disagree. */
 const medicines = canOpenRecord(viewer, 'prescription');
 const latest = patient.vitals[patient.vitals.length - 1];
 const recent = timelineFor(patient).filter(e => canOpen(viewer, e).allowed).slice(0, 4);
 const label = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
 const current = patient.medication.filter(m => !m.stopped && canOpen(viewer, m).allowed);
 return <>
  <div className="pf-cards">
   <article className="panel pf-card">
    <span className="pf-card-key"><CalendarDays size={15}/>Last visit</span>
    {clinical.allowed ? <><strong>{shortDate(patient.lastVisit.at)}</strong><p>{patient.lastVisit.service}</p><small>{patient.lastVisit.by} · {patient.lastVisit.outcome}</small></> : <Refusal title="Withheld" decision={clinical}/>}
   </article>
   <article className="panel pf-card">
    <span className="pf-card-key"><CalendarDays size={15}/>Next appointment</span>
    {patient.nextAppointment ? <><strong>{shortDate(patient.nextAppointment.at)} · {patient.nextAppointment.time}</strong><p>{patient.nextAppointment.service}</p><small>{patient.nextAppointment.place}</small></> : <EmptyNote>Nothing is booked. A missed appointment and an unbooked one are not the same thing, and this file does not blur them.</EmptyNote>}
   </article>
   <article className="panel pf-card">
    <span className="pf-card-key"><ClipboardPlus size={15}/>Current medication</span>
    {medicines.allowed ? current.length ? <><strong>{current[0].name} {current[0].dose}</strong><p>{current[0].frequency}</p><small>{current.length > 1 ? `${current.length - 1} more · ` : ''}{current[0].repeats}</small></> : <EmptyNote>Nothing is currently prescribed.</EmptyNote> : <Refusal title="Withheld" decision={medicines}/>}
   </article>
  </div>

  <SectionTitle title="Latest observations"/>
  {clinical.allowed ? <>
   {/* Every number on this strip says where it came from, and the four origins are drawn at one
       size: a blood pressure a nurse took by hand is a clinical skill, not a device reading that
       failed. What differs is the icon, the word and the fact each one attaches — the instrument
       and its serial, the registration that typed it, the person who said it. */}
   <ul className="pf-vitals">
    {[{ icon: <Heart size={16}/>, name: 'Blood pressure', value: `${latest.systolic}/${latest.diastolic}`, unit: 'mmHg', source: latest.sources.systolic },
      { icon: <Activity size={16}/>, name: 'Pulse', value: String(latest.pulse), unit: 'bpm', source: latest.sources.pulse },
      { icon: <Thermometer size={16}/>, name: 'Temperature', value: latest.temperature.toFixed(1), unit: '°C', source: latest.sources.temperature },
      { icon: <Weight size={16}/>, name: 'Weight', value: latest.weight.toFixed(1), unit: 'kg', source: latest.sources.weight },
      { icon: <Wind size={16}/>, name: 'Oxygen saturation', value: String(latest.oxygen), unit: '%', source: latest.sources.oxygen }].map(v =>
     <li key={v.name} className="panel pf-vital"><span>{v.icon}{v.name}</span><strong>{v.value}<small>{v.unit}</small></strong>
      <span className="prov-row"><ProvenanceTag source={v.source}/><CalibrationTag source={v.source}/></span>
     </li>)}
   </ul>
   {Object.values(latest.sources).filter((s, i, all) => all.findIndex(o => o.serial === s.serial) === i).map(s => <CalibrationCaveat key={s.serial ?? s.provenance} source={s}/>)}
   <p className="helper"><Activity size={14}/>Recorded {longDate(latest.at)} by {patient.careTeam[0].name}. Readings a patient takes at home are not in this record; only what a nurse or a doctor recorded appears here — and each of them says which of the two it was.</p>
   <div className="chart-grid space-top">
    <ClinicalChart title="Systolic blood pressure" unit="mmHg" normal={[90, 140]} icon={<Heart size={16}/>} readings={patient.vitals.map(v => ({ label: label(v.at), value: v.systolic }))}/>
    <ClinicalChart title="Pulse" unit="bpm" normal={[50, 100]} icon={<Activity size={16}/>} readings={patient.vitals.map(v => ({ label: label(v.at), value: v.pulse }))}/>
   </div>
  </> : <Refusal title="Observations are not open to this viewer" decision={clinical}/>}

  <SectionTitle title="Clinical summary"/>
  {clinical.allowed ? <div className="panel"><ul className="pf-bullets">{patient.summaryPoints.map(point => <li key={point}>{point}</li>)}</ul></div>
   : <Refusal title="The clinical summary is not open to this viewer" decision={clinical}/>}

  <SectionTitle title="Recent activity" action="Open the timeline" onClick={() => go('Timeline')}/>
  <div className="panel">
   {recent.length ? recent.map(entry => <EntryRow key={entry.id} entry={entry} decision={canOpen(viewer, entry)}/>)
    : <EmptyNote>Nothing in this patient's history is open to this viewer. That is a refusal, not an empty record.</EmptyNote>}
  </div>

  <SectionTitle title="Actions"/>
  <ul className="pf-actions">
   {fileActions.map(action => {
    const allowed = can(viewer, action.capability);
    const Icon = action.label === 'New consultation' ? Stethoscope : action.label === 'Prescription' ? ClipboardPlus : action.label === 'Referral' ? Send : action.label === 'Upload document' ? Upload : MapPin;
    return <li key={action.label}>
     {allowed.allowed
      ? <button className="pf-action" onClick={() => setNotice(`${action.label} would open here for ${patient.name}.`)}><Icon size={20}/><strong>{action.label}</strong><small>{action.detail}</small></button>
      : <div className="pf-action refused"><LockKeyhole size={20}/><strong>{action.label}</strong><small>{allowed.reason}</small></div>}
    </li>;
   })}
  </ul>
  <p role="status" aria-live="polite" className="helper">{notice}</p>
 </>;
}

/* ---- Timeline ----------------------------------------------------------------------------
   Everything in one chronological list, each entry wearing its record type, because "a test" and
   "a referral" are different things to a clinician scanning a year of care.

   A clinical entry the viewer may not open is still listed, locked, with its refusal: a nurse who
   sees a gap will assume nothing happened there, which is worse than knowing something did. A
   protected entry is not listed at all, because for those the existence *is* the disclosure. That
   asymmetry is the design, not an oversight, and the line at the top of the list says so. */
function Timeline({ patient, viewer }: { patient: PatientRecord; viewer: VettingSubject }) {
 const [filter, setFilter] = useState('All records');
 const all = timelineFor(patient).filter(e => canOpen(viewer, e).allowed || !isProtected(e));
 /* The chips are named by what this viewer can actually see, never by the contract's full list of
    record types. A “Referrals” chip that filters to nothing tells the reader a referral exists,
    which is precisely the disclosure the withheld entry was there to prevent — so a type every one
    of whose entries is protected and unreleased has already left `all`, and leaves the chips with
    it. The line under them says the asymmetry is deliberate, rather than leaving it to be found. */
 const kinds = ['All records', ...Array.from(new Set(all.map(e => recordById(e.typeId)?.name ?? e.typeId)))];
 /* A chip that has gone is a chip that cannot still be selected. Change the viewer or the patient
    and the choice made under the old one would otherwise survive its own chip, emptying a timeline
    that is not empty and blaming the record for it. */
 const chosen = kinds.includes(filter) ? filter : 'All records';
 const rows = all.filter(e => chosen === 'All records' || (recordById(e.typeId)?.name ?? e.typeId) === chosen);
 return <>
  <div className="tabs" role="group" aria-label="Filter by record type">
   {kinds.map(k => <button key={k} className={chosen === k ? 'selected' : ''} aria-pressed={chosen === k} onClick={() => setFilter(k)}>{k}</button>)}
  </div>
  <p className="helper"><LockKeyhole size={14}/>Protected entries are not listed here, on any patient, for any viewer without a release. A locked line would say one exists, which is the disclosure this class exists to prevent.</p>
  <div className="panel">
   {rows.length ? rows.map(entry => <EntryRow key={entry.id} entry={entry} decision={canOpen(viewer, entry)} full/>)
    : <EmptyState title="Nothing under this filter" body="Change the record type, or choose all records. An empty filter is not an empty record." action="Show all records" onAction={() => setFilter('All records')}/>}
  </div>
 </>;
}
function EntryRow({ entry, decision, full }: { entry: TimelineEntry; decision: Decision; full?: boolean }) {
 const type = recordById(entry.typeId);
 return <div className="record-row static pf-entry">
  <span className="service-icon">{decision.allowed ? <FileText size={20}/> : <LockKeyhole size={20}/>}</span>
  <span>
   <strong>{decision.allowed ? entry.title : `${type?.name ?? 'Record'} · withheld`}</strong>
   <small>{decision.allowed ? entry.detail : decision.reason}</small>
   {full && <em className="pf-type">{type?.name} · {type?.fhir} · {shortDate(entry.at)}{decision.allowed ? ` · ${entry.by}` : ''}</em>}
   {!full && <em className="pf-type">{shortDate(entry.at)}</em>}
  </span>
  {decision.allowed && <ReleasedTag item={entry}/>}
 </div>;
}

/* ---- Consultations ------------------------------------------------------------------------ */
function Consultations({ patient, viewer }: { patient: PatientRecord; viewer: VettingSubject }) {
 const rows = patient.consultations.filter(c => canOpen(viewer, c).allowed);
 return <>
  <p className="helper"><FileText size={14}/>Twelve sections, the same twelve whoever writes them, mapped to {soap.map(s => s.id).join(' · ')} as the reading order. A section marked as needing a capability is about who may write it; reading a prescription is not prescribing.</p>
  {rows.length ? rows.map(consultation => <details className="panel pf-consultation" key={consultation.id}>
   <summary><strong>{shortDate(consultation.at)} · {consultation.kind}</strong><span>{consultation.by}</span><ReleasedTag item={consultation}/></summary>
   <div className="review-line"><span>Reason for visit</span><strong>{consultation.reason}</strong></div>
   <div className="review-line"><span>Assessment</span><strong>{consultation.assessment}</strong></div>
   <div className="review-line"><span>Treatment plan</span><strong>{consultation.plan}</strong></div>
   <div className="review-line"><span>Clinician and registration</span><strong>{consultation.by} · {consultation.registration}</strong></div>
   <div className="review-line"><span>Place</span><strong>{consultation.place}</strong></div>
   <h3 className="space-top">The standardised structure</h3>
   <ul className="pf-sections">{consultationSections.map(section => {
    const filled = consultation.sections.includes(section.id);
    return <li key={section.id} className={filled ? 'filled' : ''}>
     <strong>{section.name}</strong>
     <small>{filled ? 'Recorded' : section.required ? 'Required and not recorded' : 'Not recorded'}{section.gatedBy ? ` · written only by a party holding ${section.gatedBy}` : ''}</small>
     {section.note && <em>{section.note}</em>}
    </li>;
   })}</ul>
  </details>) : <EmptyNote>No consultation in this file is open to this viewer. Consultations exist; this viewer is not one of the people who may read them.</EmptyNote>}
 </>;
}

/* ---- Medication ---------------------------------------------------------------------------
   Reached by a doctor through view-clinical-record and by a pharmacy through dispense, because
   the contract says a pharmacy sees "the prescription and the allergies that bear on filling it".
   The allergy panel is repeated here rather than left in the header: this is the screen where
   somebody hands over a medicine. */
function Medication({ patient, viewer, open }: { patient: PatientRecord; viewer: VettingSubject; open: (s: string) => void }) {
 const visible = patient.medication.filter(m => canOpen(viewer, m).allowed);
 const current = visible.filter(m => !m.stopped);
 const past = visible.filter(m => m.stopped);
 return <>
  <div className={`privacy-note ${patient.allergies.length ? 'alert' : ''}`}>
   <ShieldCheck size={19}/>
   {patient.allergies.length
    ? <span><strong>Allergies: {patient.allergies.map(a => `${a.substance} — ${a.reaction.toLowerCase()} (${a.severity.toLowerCase()})`).join('; ')}.</strong> Carried into this screen because the pharmacist needs it before anything else, not after the label is printed.</span>
    : <span><strong>No allergy has been recorded.</strong> That is not the same as no allergy. Ask before dispensing.</span>}
  </div>
  <SectionTitle title="Current medicine"/>
  {current.length ? <div className="panel">{current.map(m => <div className="medicine-row" key={m.name}>
   <span className="service-icon"><ClipboardPlus size={20}/></span>
   <div><strong>{m.name} {m.dose}</strong><small>{m.frequency} · started {m.started} · {m.repeats}</small><em>{m.prescriber}{m.dispensedBy ? ` · last dispensed ${m.dispensedBy}` : ' · not yet dispensed'}</em><ReleasedTag item={m}/></div>
  </div>)}</div> : <EmptyNote>No current medicine is open to this viewer.</EmptyNote>}
  {past.length > 0 && <><SectionTitle title="Stopped"/><div className="panel">{past.map(m => <div className="medicine-row" key={m.name}>
   <span className="service-icon"><ClipboardPlus size={20}/></span>
   <div><strong>{m.name} {m.dose}</strong><small>Stopped {m.stopped} · started {m.started}</small><em>{m.prescriber}</em></div>
  </div>)}</div></>}
  <ProtectedLine viewer={viewer} what="medicine"/>
  <button className="secondary full space-top" onClick={() => open('Prescription RX-0081')}>Open a sample prescription record<ArrowRight size={16}/></button>
 </>;
}

/* ---- Results ------------------------------------------------------------------------------ */
function Results({ patient, viewer, open }: { patient: PatientRecord; viewer: VettingSubject; open: (s: string) => void }) {
 const rows = patient.results.filter(r => canOpen(viewer, r).allowed);
 const order = can(viewer, 'order-test');
 return <>
  {rows.length ? rows.map(report => <section className="panel space-top" key={report.id}>
   <div className="order-head"><span className="service-icon"><FlaskConical size={21}/></span><div><h3>{report.name}</h3><p className="muted">{report.source} · {shortDate(report.at)}</p></div><Pill>{report.status}</Pill><ReleasedTag item={report}/></div>
   <div className="table-scroll"><table className="result-table">
    <caption>Reference ranges are indicative and are not a validated early-warning score.</caption>
    <thead><tr><th scope="col">Analyte</th><th scope="col">Result</th><th scope="col">Reference range</th></tr></thead>
    <tbody>{report.rows.map(row => <tr key={row.name} className={row.flag ? 'flagged-row' : ''}><th scope="row">{row.name}</th><td>{row.value}{row.flag ? ` · ${row.flag}` : ''}</td><td>{row.range}</td></tr>)}</tbody>
   </table></div>
   <p className="helper"><ShieldCheck size={14}/>Released by {report.releasedBy}. An abnormal result is held until a clinician releases it with an explanation — release is a clinical act, not a delivery step.</p>
  </section>) : <EmptyNote>No result in this file is open to this viewer.</EmptyNote>}
  <ProtectedLine viewer={viewer} what="result"/>
  <div className="space-top">
   {order.allowed
    ? <button className="secondary full" onClick={() => open('Laboratory order LAB-0023')}>Request a test · open the sample order<ArrowRight size={16}/></button>
    : <Refusal title="Requesting a test is refused" decision={order}/>}
  </div>
 </>;
}

/* ---- Referrals ---------------------------------------------------------------------------- */
function Referrals({ patient, viewer }: { patient: PatientRecord; viewer: VettingSubject }) {
 const rows = patient.referrals.filter(r => canOpen(viewer, r).allowed);
 return <>
  {rows.length ? <div className="panel">{rows.map(r => <div className="record-row static" key={r.id}>
   <span className="service-icon"><Send size={20}/></span>
   <span><strong>{r.to}</strong><small>{r.reason}</small><em className="pf-type">{shortDate(r.at)} · {r.urgency} · {r.by}</em></span>
   <Pill tone={r.status.startsWith('Accepted') ? '' : 'sky'}>{r.status}</Pill>
  </div>)}</div> : <EmptyNote>No referral in this file is open to this viewer.</EmptyNote>}
  <ProtectedLine viewer={viewer} what="referral"/>
  <p className="helper"><Send size={14}/>Reading a referral and making one are different acts: the record opens on “view-clinical-record”, and “refer-patient” writes it. A nurse who may not refer still has to know her patient was referred.</p>
 </>;
}

/* ---- Documents ---------------------------------------------------------------------------- */
function Documents({ patient, viewer }: { patient: PatientRecord; viewer: VettingSubject }) {
 const rows = patient.documents.filter(d => canOpen(viewer, d).allowed);
 return <>
  {rows.length ? <div className="panel">{rows.map(d => <div className="record-row static" key={d.id}>
   <span className="service-icon"><FileText size={20}/></span>
   <span><strong>{d.name}</strong><small>{d.kind} · {d.by}</small><em className="pf-type">{shortDate(d.at)} · DocumentReference</em></span>
  </div>)}</div> : <EmptyNote>No document in this file is open to this viewer.</EmptyNote>}
  <ProtectedLine viewer={viewer} what="document"/>
 </>;
}

/* ---- Billing -------------------------------------------------------------------------------
   A service code and an amount, never a diagnosis in words. That is necessary and it is not
   sufficient: 3932 is not anonymous to anybody holding the code book, so a claim line for a
   protected service discloses the condition as surely as the note would. Those lines are withheld
   too, and the screen says so rather than letting the code do quietly what the words are forbidden
   from doing. */
function Billing({ patient, viewer }: { patient: PatientRecord; viewer: VettingSubject }) {
 const rows = patient.billing.filter(line => canOpen(viewer, line).allowed);
 const total = rows.reduce((sum, line) => sum + line.amount, 0);
 return <>
  <div className="privacy-note alert"><Receipt size={19}/><span><strong>A code is not anonymous.</strong> Finance sees a service code and an amount and never a diagnosis in words — but a code can be looked up. A claim line for a protected service is withheld here for the same reason the words are.</span></div>
  {rows.length ? <div className="panel table-scroll"><table className="result-table">
   <caption>Claim lines, with what each was for and what the scheme has answered.</caption>
   <thead><tr><th scope="col">Date</th><th scope="col">Code</th><th scope="col">Service</th><th scope="col">Amount</th><th scope="col">Status</th></tr></thead>
   <tbody>{rows.map(line => <tr key={line.id} className={line.status === 'Rejected' ? 'flagged-row' : ''}>
    <th scope="row">{shortDate(line.at)}</th><td>{line.code}</td><td>{line.service}<br/><small>{line.payer}</small>{line.note && <><br/><small>{line.note}</small></>}</td><td>{money(line.amount)}</td><td>{line.status}</td>
   </tr>)}</tbody>
   <tfoot><tr><th scope="row" colSpan={3}>Visible to this viewer</th><td>{money(total)}</td><td>{rows.length} of {patient.billing.length} lines</td></tr></tfoot>
  </table></div> : <EmptyNote>No claim line in this file is open to this viewer.</EmptyNote>}
  <ProtectedLine viewer={viewer} what="claim line"/>
 </>;
}

/* One sentence, the same wherever a list could have been shortened by the protected rule. It does
   not say whether anything was removed, for the same reason the header notice does not. */
function ProtectedLine({ viewer, what }: { viewer: VettingSubject; what: string }) {
 const vetted = can(viewer, 'view-protected-record');
 return <p className="helper pf-protected-line"><LockKeyhole size={14}/>A protected {what} appears on this page only where the patient released that entry to you by name. {vetted.allowed ? releaseRefusal(viewer.roleId) : vetted.reason}</p>;
}
