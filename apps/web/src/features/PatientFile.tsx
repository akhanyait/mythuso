import { useId, useState } from 'react';
import { Activity, ArrowRight, CalendarDays, ClipboardPlus, Eye, FileText, FlaskConical, Heart, LockKeyhole, MapPin, Receipt, Send, ShieldCheck, Stethoscope, Table2, Thermometer, TriangleAlert, Upload, UserRound, Weight, Wind } from 'lucide-react';
import './consult-file.css';
import { ClinicalDeck, type DeckFigure } from './ClinicalDeck';
import { EmptyNote, Pill } from '../components/UI';
import { CalibrationCaveat, CalibrationTag, ProvenanceTag } from '../components/Provenance';
import { ClinicalChart } from '../components/Chart';
import { ruleById } from '../lib/dispensing';
import { EmptyState } from '../components/States';
import { NotConnected } from '../components/NotConnected';
import { initialsOf } from '../lib/names';
import { flagOf, measureSpec, observationsNote } from '../lib/observations';
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
   refuses so that the refusals can be reviewed before they are built.

   WHAT THIS PASS CHANGED. The refusals were right and the composition was not: a review control, a
   patient, a set of tabs and eight bodies of content, every one of them a white rounded box with
   the same shadow, in one column, at one weight. A clinician opening a stranger's file at a door
   could not tell from thirty centimetres away whose file it was.

   Three things now carry the screen. The person is on the night ground the rest of this portal
   already uses for its single live instrument, at the size a human being's name deserves, with a
   meter beside it counting how much of their record this viewer may open — eight segments, one per
   section, lit where the vetting module says yes. The latest observations are drawn against the
   reference ranges in packages/catalog/records.json rather than printed as five bare numerals, so a
   reading outside its range is a position on a scale and not a font weight; nothing is typed here,
   lib/observations.ts is read. And the timeline is a spine with the date in its own gutter, because
   a year of care is a chronology and it was drawn as ten identical rows.

   THE RANGES ARE NOT A DIAGNOSIS AND THE SCREEN SAYS SO, in the contract's own sentence, under the
   strip. Nothing on a gauge animates into place: the band and the mark are where they are from the
   first frame, which is the rule tests/chart-motion.spec.ts holds every clinical mark to. */

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

/* The contract's range, in the shape ClinicalChart was written against. Copied out of the readonly
   tuple rather than restated: the numbers still have exactly one home. */
const rangeOf = (id: string) => [...measureSpec(id).range] as [number, number];
/* The date in a gutter: the day large, the month and year small under it, tabular so a column of
   them lines up. `shortDate` stays the full string wherever a sentence needs one. */
const dayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-ZA', { day: 'numeric', timeZone: 'UTC' });
const monthOf = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-ZA', { month: 'short', year: '2-digit', timeZone: 'UTC' });

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
 const actionsOpen = fileActions.filter(a => can(viewer, a.capability).allowed).length;
 /* How much of this file this viewer may open, counted off the tabs and the actions on the sheet.
    The ring has one arc per section of packages/catalog/records.json's navigation, lit where the
    vetting module says yes — marks rather than a percentage, because the refusals are the point and a
    reader can count the dark ones. */
 const figures: DeckFigure[] = [
  { label: 'Actions open to you', value: String(actionsOpen), unit: `of ${fileActions.length}`, flagged: false,
    chip: 'Each one asked of vetting', shape: { kind: 'gauge', part: actionsOpen, whole: fileActions.length } },
  { label: 'Sections of this file open to you', value: String(fileTabs.length - refused), unit: `of ${fileTabs.length}`, flagged: false,
    chip: refused ? `${refused} refused to this viewer` : 'None refused to this viewer',
    shape: { kind: 'ring', segments: fileTabs.map(t => canOpenTab(viewer, t).allowed) } }
 ];
 return <div className="pfx c-page">
  {/* The person is the subject of the file, so the person is the lead on the glass, at the size a
      human being's name deserves. The review device — whose file, through whose eyes — is a pair of
      pills on the night rather than the largest panel on the screen, which is what it used to be: a
      design-review control above the person the file is about. */}
  <ClinicalDeck role="Patient file" title="Patient file" figures={figures}
   headline={['Whose file this is,', { glyph: 'user' }, 'and what you may open.']}
   note="The file a nurse or a doctor opens about somebody else — and the sections each of them is refused."
   lead={<PatientIdentity patient={patient} viewer={viewer}/>}>
   <NotConnected of="clinical-records"/>
   <div className="c-deck-controls" role="group" aria-label="The same file, through different eyes">
    <label className="c-field">Open the file of
     <select value={patientId} onChange={e => { setPatientId(e.target.value); setNotice(''); }}>{patients.map(p => <option key={p.id} value={p.id}>{p.name} · {p.id}</option>)}</select>
    </label>
    <label className="c-field">Viewing as
     <select value={viewerId} onChange={e => { setViewerId(e.target.value); setNotice(''); }}>{viewers.map(v => <option key={v.id} value={v.id}>{v.name} · {roleById(v.roleId)?.name}</option>)}</select>
    </label>
   </div>
  </ClinicalDeck>

  <div className="c-sheet">
  <div className="pfx-lens">
   <Pill tone={status === 'cleared' ? '' : status === 'expiring' ? 'amber' : 'danger'}>{subjectStatusLabels[status]}</Pill>
   <p className="pfx-hint"><Eye size={14} aria-hidden="true"/><span>Viewing as {viewer.name} · {viewer.reference}. Every tab, action and field group below asks the vetting module whether this party may see it. Change the viewer and the file changes shape, because a refusal that is only written down is a refusal nobody has tested.</span></p>
  </div>

  <SummaryDetail patient={patient} viewer={viewer}/>

  <div className="pfx-tabs" role="group" aria-label="Patient file sections">
   {fileTabs.map(t => { const unlocked = canOpenTab(viewer, t).allowed; return <button key={t.name} className={`${t.name === tabName ? 'selected' : ''}${unlocked ? '' : ' is-locked'}`} aria-pressed={t.name === tabName} onClick={() => move(t.name)}>
    {t.name}{!unlocked && <><LockKeyhole size={13} aria-hidden="true"/><span className="visually-hidden"> — refused</span></>}
   </button>; })}
  </div>

  <p role="status" aria-live="polite" className="visually-hidden">{patient.name}, {patient.id}. Viewing as {viewer.name}, {role?.name.toLowerCase()}. {tabName} is {decision.allowed ? 'open' : 'refused'}. {refused} of {fileTabs.length} sections are refused to this viewer.</p>

  <p className="pf-holds">{tab.holds}</p>
  {!decision.allowed ? <Refusal title={`${tabName} — not open to this viewer`} decision={decision}/>
   : tabName === 'Overview' ? <Overview patient={patient} viewer={viewer} notice={notice} setNotice={setNotice} go={move} open={open}/>
    : tabName === 'Timeline' ? <Timeline patient={patient} viewer={viewer}/>
     : tabName === 'Consultations' ? <Consultations patient={patient} viewer={viewer}/>
      : tabName === 'Medication' ? <Medication patient={patient} viewer={viewer} open={open}/>
       : tabName === 'Results' ? <Results patient={patient} viewer={viewer} open={open}/>
        : tabName === 'Referrals' ? <Referrals patient={patient} viewer={viewer}/>
         : tabName === 'Documents' ? <Documents patient={patient} viewer={viewer}/>
          : <Billing patient={patient} viewer={viewer}/>}
  <p className="helper pf-not-built"><ShieldCheck size={14}/>{tab.notBuilt}</p>
  </div>
 </div>;
}

/* ---- Refusals ----------------------------------------------------------------------------
   A refused thing says the sentence the vetting contract wrote for it, and names the checks that
   are standing in the way. A greyed control with no explanation teaches a clinician that the
   system is broken; a sentence teaches them what to do next. */
function Refusal({ title, decision }: { title: string; decision: Decision }) {
 return <div className="pf-refusal" role="note">
  <span className="pf-refusal-icon" aria-hidden="true"><LockKeyhole size={19}/></span>
  <div>
   <strong>{title}</strong>
   <p>{decision.reason}</p>
   {decision.blockedBy.length > 0 && <p className="pfx-hint">Outstanding: {decision.blockedBy.map(c => c.name).join(' · ')}</p>}
  </div>
 </div>;
}

/* An entry a viewer holds a release for is marked as protected, so nobody reads it aloud in a room
   with somebody else in it. Only a reader who already holds the release ever sees the marker, so it
   discloses nothing it has not already disclosed. */
function ReleasedTag({ item }: { item: Sensitive }) {
 return isProtected(item) ? <Pill tone="amber">Protected · released to you</Pill> : null;
}

/* One head per block of the file, so eight tab bodies read as eight sections rather than as one
   scroll that changes subject without saying so. The count on the right is always a count of
   something the reader can see below it. */
function Head({ title, count, action, onAction }: { title: string; count?: string; action?: string; onAction?: () => void }) {
 return <div className="pfx-head">
  <h2>{title}</h2>
  {action ? <button className="text-button" onClick={onAction}>{action}<ArrowRight size={15}/></button> : count ? <span>{count}</span> : null}
 </div>;
}

/* ---- The permanent header ----------------------------------------------------------------
   Present on every tab, because the thing a nurse needs at a glance is not on the tab she happens
   to have open. It is two halves now: the person, on the deck's glass, and the facts about them, at
   the top of the sheet — so what is read from across a room and what is read up close are drawn at
   the sizes those two distances need. */
/* view-patient-summary is asked here and again in SummaryDetail. It is one pure function over one
   vetting record, so the two halves of the header cannot answer it differently. */
function PatientIdentity({ patient, viewer }: { patient: PatientRecord; viewer: VettingSubject }) {
 const decision = can(viewer, 'view-patient-summary');
 const profile = profileFor(viewer.roleId);
 /* A protected condition never becomes a chip — not for a nurse, not for a doctor holding a
    release, not for anybody. The header is read over a shoulder in a living room. */
 const chronic = patient.conditions.filter(c => !isProtected(c)).map(c => c.name);
 const chips: [ChipId, string, string, string][] = [
  ['blood', 'Blood group', patient.bloodGroup, ''],
  ['allergy', 'Allergies', patient.allergies.length ? patient.allergies.map(a => `${a.substance} — ${a.reaction.toLowerCase()}`).join(' · ') : 'None recorded', patient.allergies.length ? 'danger' : 'amber'],
  ['chronic', 'Chronic conditions', chronic.length ? chronic.join(' · ') : 'None recorded', ''],
  ['aid', 'Medical aid status', patient.medicalAid.status, patient.medicalAid.tone]
 ];
 if (!decision.allowed) return <div className="pfx-identity">
  <span className="pfx-disc is-anonymous" aria-hidden="true"><UserRound size={26}/></span>
  <div className="pfx-identity-say"><h2>Patient {patient.id}</h2><p>The file is open. The person is not.</p></div>
 </div>;
 return <>
  <div className="pfx-identity">
   <span className="pfx-disc" aria-hidden="true">{initialsOf(patient.name)}</span>
   <div className="pfx-identity-say">
    <h2>{patient.name}</h2>
    <p>{patient.id} · {patient.sex} · {ageFrom(patient.dob)} years</p>
   </div>
  </div>
  {profile.chips.length > 0 && <ul className="pf-chips">
   {chips.filter(c => profile.chips.includes(c[0])).map(([id, key, value, tone]) => <li key={id} className={`pf-chip ${tone}`}>
    <span>{tone === 'danger' && <TriangleAlert size={13} aria-hidden="true"/>}{key}</span><strong>{value}</strong>
   </li>)}
  </ul>}
 </>;
}

function SummaryDetail({ patient, viewer }: { patient: PatientRecord; viewer: VettingSubject }) {
 const decision = can(viewer, 'view-patient-summary');
 const profile = profileFor(viewer.roleId);
 const scope = grantSentence(viewer.roleId, 'view-patient-summary');
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
 if (!decision.allowed) return <section className="pfx-summary" aria-label="Patient summary">
  <Refusal title="The patient summary is not open to this viewer" decision={decision}/>
  <WithheldNotice viewer={viewer}/>
 </section>;
 return <section className="pfx-summary" aria-label="Patient summary">
  <dl className="pf-facts">{profile.facts.map(f => <div key={f}><dt>{facts[f][0]}</dt><dd>{facts[f][1]}</dd></div>)}</dl>
  {scope && <p className="pfx-scope"><ShieldCheck size={14} aria-hidden="true"/>The header is cut to this role's own words in the vetting contract: “{scope}”</p>}
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
  <span className="pf-refusal-icon" aria-hidden="true"><LockKeyhole size={19}/></span>
  <div>
   <strong>A category is withheld from this header.</strong>
   <p>{summaryCard.withheld}</p>
   <p>{withheldSentence} are never a chip — and this notice stands on every file, whether or not anything is held behind it.</p>
   <p className="pfx-hint">{ask}</p>
  </div>
 </div>;
}

/* ---- The observations strip -----------------------------------------------------------------
 *
 * Five readings, each against the range packages/catalog/records.json declares for it, read through
 * lib/observations.ts. Nothing here types a range and nothing here decides anything: `flagOf` is the
 * whole of the reasoning and it says only where a number sits, which is why the contract's own
 * qualifying sentence is printed under the strip rather than paraphrased beside each gauge.
 *
 * Weight has no entry in the observations contract, because it is not one of the seven readings a
 * nurse is flagged on. It therefore gets no gauge: inventing a scale for it here would be this
 * screen declaring a range the contract has deliberately not declared.
 *
 * Nothing on a gauge moves. The band is the range and the mark is the reading, both placed from the
 * first frame — a reference range that slid into position is the one animation this product forbids
 * outright, and a reading that counted up is the other. */
function RangeGauge({ id, reading }: { id: string; reading: number }) {
 const spec = measureSpec(id);
 const flag = flagOf(id, String(reading));
 const inRange = flag === 'normal';
 /* The window is the range with room either side, widened where the reading sits outside it, so a
    mark is never pinned to an edge and how far outside it sits is always drawn to scale. */
 const margin = (spec.high - spec.low) * 0.5;
 const low = Math.min(spec.low - margin, reading - margin * 0.4);
 const high = Math.max(spec.high + margin, reading + margin * 0.4);
 const at = (value: number) => `${(((value - low) / (high - low)) * 100).toFixed(1)}%`;
 const written = (value: number) => (spec.step < 1 ? value.toFixed(1) : String(value));
 return <div className="pf-gauge">
  {/* Two channels and a word: the mark is taller and hollow when the reading is outside its range,
      it carries a triangle, and the chip beside the figure says which. */}
  <span className={`pf-gauge-track${inRange ? '' : ' is-outside'}`} aria-hidden="true">
   <span className="pf-gauge-band" style={{ left: at(spec.low), width: `calc(${at(spec.high)} - ${at(spec.low)})` }}/>
   <span className="pf-gauge-mark" style={{ left: at(reading) }}/>
  </span>
  <span className="pf-gauge-scale">{written(spec.low)}–{written(spec.high)} {spec.unit}<em>{spec.label}</em></span>
 </div>;
}

/* ---- Overview ----------------------------------------------------------------------------
   Three cards, the latest observations, four bullets and the last few events. Highly visual on
   purpose: a wall of text is read by nobody standing in a doorway. */
/* `open` is a prop and not a lucky closure. It was neither for one commit: the action row called a
   bare `open(...)`, which resolved to window.open — the actions silently asked the browser for a
   popup named after a screen, and nothing rendered. A shadowed global is the one kind of wrong
   identifier TypeScript cannot warn about, and the only thing that catches it is opening the screen. */
function Overview({ patient, viewer, notice, setNotice, go, open }: { patient: PatientRecord; viewer: VettingSubject; notice: string; setNotice: (s: string) => void; go: (t: string) => void; open: (m: string) => void }) {
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
 const [showTable, setShowTable] = useState(false);
 const tableId = useId();
 /* Where the reading came from, then the reading, then what it is — the same order the metric the
    rest of this product now uses puts them in. `measure` is the id in the observations contract, and
    where there is none the tile carries no scale rather than a scale nobody declared. */
 const readings = [
  { measure: 'systolic', icon: <Heart size={16}/>, name: 'Blood pressure', value: `${latest.systolic}/${latest.diastolic}`, reading: latest.systolic, unit: 'mmHg', source: latest.sources.systolic },
  { measure: 'pulse', icon: <Activity size={16}/>, name: 'Pulse', value: String(latest.pulse), reading: latest.pulse, unit: 'bpm', source: latest.sources.pulse },
  { measure: 'temperature', icon: <Thermometer size={16}/>, name: 'Temperature', value: latest.temperature.toFixed(1), reading: latest.temperature, unit: '°C', source: latest.sources.temperature },
  { measure: undefined, icon: <Weight size={16}/>, name: 'Weight', value: latest.weight.toFixed(1), reading: latest.weight, unit: 'kg', source: latest.sources.weight },
  { measure: 'oxygen', icon: <Wind size={16}/>, name: 'Oxygen saturation', value: String(latest.oxygen), reading: latest.oxygen, unit: '%', source: latest.sources.oxygen }
 ];
 return <>
  <div className="pf-cards">
   <article className="pf-card">
    <span className="pf-card-key"><CalendarDays size={15} aria-hidden="true"/>Last visit</span>
    {clinical.allowed ? <><strong>{shortDate(patient.lastVisit.at)}</strong><p>{patient.lastVisit.service}</p><small>{patient.lastVisit.by} · {patient.lastVisit.outcome}</small></> : <Refusal title="Withheld" decision={clinical}/>}
   </article>
   <article className="pf-card is-lead">
    <span className="pf-card-key"><CalendarDays size={15} aria-hidden="true"/>Next appointment</span>
    {patient.nextAppointment ? <><strong>{shortDate(patient.nextAppointment.at)} · {patient.nextAppointment.time}</strong><p>{patient.nextAppointment.service}</p><small>{patient.nextAppointment.place}</small></> : <EmptyNote>Nothing is booked. A missed appointment and an unbooked one are not the same thing, and this file does not blur them.</EmptyNote>}
   </article>
   <article className="pf-card">
    <span className="pf-card-key"><ClipboardPlus size={15} aria-hidden="true"/>Current medication</span>
    {medicines.allowed ? current.length ? <><strong>{current[0].name} {current[0].dose}</strong><p>{current[0].frequency}</p><small>{current.length > 1 ? `${current.length - 1} more · ` : ''}{current[0].repeats}</small></> : <EmptyNote>Nothing is currently prescribed.</EmptyNote> : <Refusal title="Withheld" decision={medicines}/>}
   </article>
  </div>

  <Head title="Latest observations" count={clinical.allowed ? `Recorded ${shortDate(latest.at)}` : undefined}/>
  {clinical.allowed ? <section className="pf-obs">
   {/* Every number on this strip says where it came from, and the four origins are drawn at one
       size: a blood pressure a nurse took by hand is a clinical skill, not a device reading that
       failed. What differs is the icon, the word and the fact each one attaches — the instrument
       and its serial, the registration that typed it, the person who said it. */}
   <ul className="pf-vitals">
    {readings.map(v => {
     const flag = v.measure ? flagOf(v.measure, String(v.reading)) : 'normal';
     return <li key={v.name} className={`pf-vital${flag === 'normal' ? '' : ' is-outside'}`}>
      <span className="prov-row"><ProvenanceTag source={v.source}/><CalibrationTag source={v.source}/></span>
      <strong>{v.value}<small>{v.unit}</small></strong>
      <span className="pf-vital-name">{v.icon}{v.name}</span>
      {v.measure ? <>
       <RangeGauge id={v.measure} reading={v.reading}/>
       <span className={`pf-vital-flag${flag === 'normal' ? '' : ' is-outside'}`}>
        {flag !== 'normal' && <TriangleAlert size={13} aria-hidden="true"/>}{flag === 'normal' ? 'Within range' : 'Outside range'}
       </span>
      </> : null}
     </li>;
    })}
   </ul>
   {Object.values(latest.sources).filter((s, i, all) => all.findIndex(o => o.serial === s.serial) === i).map(s => <CalibrationCaveat key={s.serial ?? s.provenance} source={s}/>)}
   {/* The contract's own qualification, once, under the strip that needs it. A gauge is a position
       and never a verdict. */}
   <p className="pf-obs-note"><ShieldCheck size={14} aria-hidden="true"/>{observationsNote} Recorded {longDate(latest.at)} by {patient.careTeam[0].name}. Readings a patient takes at home are not in this record; only what a nurse or a doctor recorded appears here — and each of them says which of the two it was.</p>
   {/* A drawing is never the only way to reach a reading. Same rule the passport's charts are held
       to, and the same control, so a reader who knows one knows the other. */}
   <button className="text-button" aria-expanded={showTable} aria-controls={tableId} onClick={() => setShowTable(!showTable)}>
    <Table2 size={15} aria-hidden="true"/>{showTable ? 'Hide these readings' : 'Show these readings as a table'}
   </button>
   <div id={tableId} hidden={!showTable} className="pfx-table-wrap">
    <table className="result-table">
     <caption className="visually-hidden">The latest observations, with the reference range each is measured against.</caption>
     <thead><tr><th scope="col">Reading</th><th scope="col">Value</th><th scope="col">Reference range</th><th scope="col">Where it sits</th></tr></thead>
     <tbody>{readings.map(v => {
      const spec = v.measure ? measureSpec(v.measure) : undefined;
      const flag = v.measure ? flagOf(v.measure, String(v.reading)) : undefined;
      return <tr key={v.name} className={flag && flag !== 'normal' ? 'flagged-row' : ''}>
       <th scope="row">{v.name}</th>
       <td>{v.value} {v.unit}</td>
       <td>{spec ? `${spec.step < 1 ? spec.low.toFixed(1) : spec.low}–${spec.step < 1 ? spec.high.toFixed(1) : spec.high} ${spec.unit}` : 'No reference range is declared for this reading.'}</td>
       <td>{flag ? flag === 'normal' ? 'Within range' : 'Outside range' : '—'}</td>
      </tr>;
     })}</tbody>
    </table>
   </div>
   <div className="chart-grid">
    <ClinicalChart title="Systolic blood pressure" unit={measureSpec('systolic').unit} normal={rangeOf('systolic')} icon={<Heart size={16}/>} readings={patient.vitals.map(v => ({ label: label(v.at), value: v.systolic }))}/>
    <ClinicalChart title="Pulse" unit={measureSpec('pulse').unit} normal={rangeOf('pulse')} icon={<Activity size={16}/>} readings={patient.vitals.map(v => ({ label: label(v.at), value: v.pulse }))}/>
   </div>
  </section> : <Refusal title="Observations are not open to this viewer" decision={clinical}/>}

  <Head title="Clinical summary" count={clinical.allowed ? `${patient.summaryPoints.length} points` : undefined}/>
  {clinical.allowed ? <ul className="pf-bullets">{patient.summaryPoints.map(point => <li key={point}>{point}</li>)}</ul>
   : <Refusal title="The clinical summary is not open to this viewer" decision={clinical}/>}

  <Head title="Recent activity" action="Open the timeline" onAction={() => go('Timeline')}/>
  {recent.length ? <ol className="pf-track">{recent.map(entry => <EntryRow key={entry.id} entry={entry} decision={canOpen(viewer, entry)}/>)}</ol>
   : <EmptyNote>Nothing in this patient's history is open to this viewer. That is a refusal, not an empty record.</EmptyNote>}

  <Head title="Actions" count={`${fileActions.filter(a => can(viewer, a.capability).allowed).length} of ${fileActions.length} open to this viewer`}/>
  <ul className="pf-actions">
   {fileActions.map(action => {
    const allowed = can(viewer, action.capability);
    const Icon = action.label === 'New consultation' ? Stethoscope : action.label === 'Prescription' ? ClipboardPlus : action.label === 'Referral' ? Send : action.label === 'Upload document' ? Upload : MapPin;
    return <li key={action.label}>
     {allowed.allowed
      /* The patient travels with the action. Routing "Prescription" on Thando Mokoena's file to
         RX-0081 would have opened Lerato Molefe's medicines under Thando's name, which is a worse
         defect than the stub it replaced — so every screen these open is told who the file is
         about, and the two that cannot be about anybody else say so instead. */
      ? <button className="pf-action" onClick={() => action.opens ? open(`${action.opens} · ${patient.name}`) : setNotice(`${action.label} has no screen in this preview. Nothing was opened and nothing was written to ${patient.name}'s file.`)}><span className="pf-action-mark"><Icon size={19}/></span><strong>{action.label}</strong><small>{action.detail}</small></button>
      : <div className="pf-action refused"><span className="pf-action-mark"><LockKeyhole size={19}/></span><strong>{action.label}</strong><small>{allowed.reason}</small></div>}
    </li>;
   })}
  </ul>
  <p role="status" aria-live="polite" className="pfx-hint">{notice}</p>
 </>;
}

/* ---- Timeline ----------------------------------------------------------------------------
   Everything in one chronological list, each entry wearing its record type, because "a test" and
   "a referral" are different things to a clinician scanning a year of care.

   A clinical entry the viewer may not open is still listed, locked, with its refusal: a nurse who
   sees a gap will assume nothing happened there, which is worse than knowing something did. A
   protected entry is not listed at all, because for those the existence *is* the disclosure. That
   asymmetry is the design, not an oversight, and the line at the top of the list says so.

   Drawn down a spine with the date in its own gutter. Ten records at one weight in one column is a
   list of files; a chronology is what a clinician is actually reading. */
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
  <div className="pfx-rail" role="group" aria-label="Filter by record type">
   {kinds.map(k => <button key={k} className={chosen === k ? 'selected' : ''} aria-pressed={chosen === k} onClick={() => setFilter(k)}>{k}</button>)}
  </div>
  <p className="pfx-hint"><LockKeyhole size={14} aria-hidden="true"/>Protected entries are not listed here, on any patient, for any viewer without a release. A locked line would say one exists, which is the disclosure this class exists to prevent.</p>
  {rows.length ? <ol className="pf-track">{rows.map(entry => <EntryRow key={entry.id} entry={entry} decision={canOpen(viewer, entry)} full/>)}</ol>
   : <EmptyState title="Nothing under this filter" body="Change the record type, or choose all records. An empty filter is not an empty record." action="Show all records" onAction={() => setFilter('All records')}/>}
 </>;
}
function EntryRow({ entry, decision, full }: { entry: TimelineEntry; decision: Decision; full?: boolean }) {
 const type = recordById(entry.typeId);
 return <li className={`pf-entry${decision.allowed ? '' : ' is-locked'}`}>
  <span className="pf-entry-when"><strong>{dayOf(entry.at)}</strong><small>{monthOf(entry.at)}</small></span>
  <span className="pf-entry-mark" aria-hidden="true"/>
  <div className="pf-entry-card">
   <div className="pf-entry-head">
    <h3>{decision.allowed ? entry.title : `${type?.name ?? 'Record'} · withheld`}</h3>
    {decision.allowed ? <ReleasedTag item={entry}/> : <span className="pf-entry-lock"><LockKeyhole size={13} aria-hidden="true"/>Withheld</span>}
   </div>
   <p>{decision.allowed ? entry.detail : decision.reason}</p>
   <p className="pf-type">{full ? <>{type?.name} · {type?.fhir} · {shortDate(entry.at)}{decision.allowed ? ` · ${entry.by}` : ''}</> : <>{type?.name} · {shortDate(entry.at)}</>}</p>
  </div>
 </li>;
}

/* ---- Consultations ------------------------------------------------------------------------ */
function Consultations({ patient, viewer }: { patient: PatientRecord; viewer: VettingSubject }) {
 const rows = patient.consultations.filter(c => canOpen(viewer, c).allowed);
 return <>
  <p className="pfx-hint"><FileText size={14} aria-hidden="true"/>Twelve sections, the same twelve whoever writes them, mapped to {soap.map(s => s.id).join(' · ')} as the reading order. A section marked as needing a capability is about who may write it; reading a prescription is not prescribing.</p>
  {rows.length ? rows.map(consultation => {
   const filled = consultationSections.filter(s => consultation.sections.includes(s.id)).length;
   return <details className="pf-consultation" key={consultation.id}>
    <summary>
     <span className="pf-consultation-when"><strong>{dayOf(consultation.at)}</strong><small>{monthOf(consultation.at)}</small></span>
     <span className="pf-consultation-say"><strong>{consultation.kind}</strong><small>{consultation.by} · {consultation.registration}</small></span>
     <span className="pf-consultation-count">{filled}<small>/{consultationSections.length}</small></span>
     <ReleasedTag item={consultation}/>
    </summary>
    <dl className="pfx-facts">
     <div><dt>Reason for visit</dt><dd>{consultation.reason}</dd></div>
     <div><dt>Assessment</dt><dd>{consultation.assessment}</dd></div>
     <div><dt>Treatment plan</dt><dd>{consultation.plan}</dd></div>
     <div><dt>Place</dt><dd>{consultation.place}</dd></div>
    </dl>
    <div className="pfx-head"><h3>The standardised structure</h3><span>{filled} of {consultationSections.length} recorded</span></div>
    <ul className="pf-sections">{consultationSections.map(section => {
     const written = consultation.sections.includes(section.id);
     return <li key={section.id} className={written ? 'filled' : ''}>
      <span className="pf-section-mark" aria-hidden="true"/>
      <strong>{section.name}</strong>
      <small>{written ? 'Recorded' : section.required ? 'Required and not recorded' : 'Not recorded'}{section.gatedBy ? ` · written only by a party holding ${section.gatedBy}` : ''}</small>
      {section.note && <em>{section.note}</em>}
     </li>;
    })}</ul>
   </details>;
  }) : <EmptyNote>No consultation in this file is open to this viewer. Consultations exist; this viewer is not one of the people who may read them.</EmptyNote>}
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
  <div className={`pf-allergy${patient.allergies.length ? ' is-recorded' : ''}`}>
   <span className="pf-allergy-mark" aria-hidden="true">{patient.allergies.length ? <TriangleAlert size={20}/> : <ShieldCheck size={20}/>}</span>
   {patient.allergies.length
    ? <p><strong>Allergies: {patient.allergies.map(a => `${a.substance} — ${a.reaction.toLowerCase()} (${a.severity.toLowerCase()})`).join('; ')}.</strong> Carried into this screen because the pharmacist needs it before anything else, not after the label is printed.</p>
    : <p><strong>No allergy has been recorded.</strong> That is not the same as no allergy. Ask before dispensing.</p>}
  </div>
  <Head title="Current medicine" count={`${current.length} open to this viewer`}/>
  {current.length ? <ul className="pf-medicines">{current.map(m => <li key={m.name}>
   <span className="pf-medicine-mark" aria-hidden="true"><ClipboardPlus size={18}/></span>
   <div><strong>{m.name} {m.dose}</strong><small>{m.frequency} · started {m.started} · {m.repeats}</small><em>{m.prescriber}{m.dispensedBy ? ` · last dispensed ${m.dispensedBy}` : ' · not yet dispensed'}</em><ReleasedTag item={m}/></div>
  </li>)}</ul> : <EmptyNote>No current medicine is open to this viewer.</EmptyNote>}
  {past.length > 0 && <><Head title="Stopped" count={`${past.length} on record`}/><ul className="pf-medicines is-past">{past.map(m => <li key={m.name}>
   <span className="pf-medicine-mark" aria-hidden="true"><ClipboardPlus size={18}/></span>
   <div><strong>{m.name} {m.dose}</strong><small>Stopped {m.stopped} · started {m.started}</small><em>{m.prescriber}</em></div>
  </li>)}</ul></>}
  <ProtectedLine viewer={viewer} what="medicine"/>
  <button className="secondary full" onClick={() => open('Prescription RX-0081')}>Open a sample prescription record<ArrowRight size={16}/></button>
 </>;
}

/* ---- Results ------------------------------------------------------------------------------ */
function Results({ patient, viewer, open }: { patient: PatientRecord; viewer: VettingSubject; open: (s: string) => void }) {
 const rows = patient.results.filter(r => canOpen(viewer, r).allowed);
 const order = can(viewer, 'order-test');
 return <>
  {rows.length ? rows.map(report => <section className="pf-report" key={report.id}>
   <div className="pf-report-head">
    <span className="pf-report-mark" aria-hidden="true"><FlaskConical size={20}/></span>
    <div><h3>{report.name}</h3><p>{report.source} · {shortDate(report.at)}</p></div>
    <Pill>{report.status}</Pill>
    <ReleasedTag item={report}/>
   </div>
   <div className="pfx-table-wrap"><table className="result-table">
    {/* The qualification is the contract's, read from the observations section of the standard
        consultation rather than typed here. Two copies of a sentence about reference ranges is one
        copy too many. */}
    <caption>{observationsNote}</caption>
    <thead><tr><th scope="col">Analyte</th><th scope="col">Result</th><th scope="col">Reference range</th></tr></thead>
    <tbody>{report.rows.map(row => <tr key={row.name} className={row.flag ? 'flagged-row' : ''}><th scope="row">{row.name}</th>
     <td>{row.flag && <TriangleAlert size={13} aria-hidden="true"/>}{row.value}{row.flag ? ` · ${row.flag}` : ''}</td><td>{row.range}</td></tr>)}</tbody>
   </table></div>
   <p className="pfx-hint"><ShieldCheck size={14} aria-hidden="true"/>Released by {report.releasedBy}. An abnormal result is held until a clinician releases it with an explanation — release is a clinical act, not a delivery step.</p>
  </section>) : <EmptyNote>No result in this file is open to this viewer.</EmptyNote>}
  <ProtectedLine viewer={viewer} what="result"/>
  {order.allowed
   ? <button className="secondary full" onClick={() => open('Laboratory order LAB-0023')}>Request a test · open the sample order<ArrowRight size={16}/></button>
   : <Refusal title="Requesting a test is refused" decision={order}/>}
 </>;
}

/* ---- Referrals ---------------------------------------------------------------------------- */
function Referrals({ patient, viewer }: { patient: PatientRecord; viewer: VettingSubject }) {
 const rows = patient.referrals.filter(r => canOpen(viewer, r).allowed);
 return <>
  {rows.length ? <ul className="pf-referrals">{rows.map(r => <li key={r.id}>
   <span className="pf-referral-mark" aria-hidden="true"><Send size={18}/></span>
   <div><strong>{r.to}</strong><small>{r.reason}</small><em className="pf-type">{shortDate(r.at)} · {r.urgency} · {r.by}</em></div>
   <Pill tone={r.status.startsWith('Accepted') ? '' : 'sky'}>{r.status}</Pill>
  </li>)}</ul> : <EmptyNote>No referral in this file is open to this viewer.</EmptyNote>}
  <ProtectedLine viewer={viewer} what="referral"/>
  <p className="pfx-hint"><Send size={14} aria-hidden="true"/>Reading a referral and making one are different acts: the record opens on “view-clinical-record”, and “refer-patient” writes it. A nurse who may not refer still has to know her patient was referred.</p>
 </>;
}

/* ---- Documents ---------------------------------------------------------------------------- */
function Documents({ patient, viewer }: { patient: PatientRecord; viewer: VettingSubject }) {
 const rows = patient.documents.filter(d => canOpen(viewer, d).allowed);
 return <>
  {rows.length ? <ul className="pf-referrals">{rows.map(d => <li key={d.id}>
   <span className="pf-referral-mark" aria-hidden="true"><FileText size={18}/></span>
   <div><strong>{d.name}</strong><small>{d.kind} · {d.by}</small><em className="pf-type">{shortDate(d.at)} · DocumentReference</em></div>
  </li>)}</ul> : <EmptyNote>No document in this file is open to this viewer.</EmptyNote>}
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
  <div className="pf-allergy is-recorded">
   <span className="pf-allergy-mark" aria-hidden="true"><Receipt size={20}/></span>
   <p><strong>A code is not anonymous.</strong> Finance sees a service code and an amount and never a diagnosis in words — but a code can be looked up. A claim line for a protected service is withheld here for the same reason the words are.</p>
  </div>
  {rows.length ? <div className="pfx-table-wrap"><table className="result-table pf-claims">
   <caption>Claim lines, with what each was for and what the scheme has answered.</caption>
   <thead><tr><th scope="col">Date</th><th scope="col">Code</th><th scope="col">Service</th><th scope="col">Amount</th><th scope="col">Status</th></tr></thead>
   <tbody>{rows.map(line => <tr key={line.id} className={line.status === 'Rejected' ? 'flagged-row' : ''}>
    <th scope="row">{shortDate(line.at)}</th><td>{line.code}</td><td>{line.service}<br/><small>{line.payer}</small>{line.note && <><br/><small>{line.note}</small></>}</td><td className="pf-amount">{money(line.amount)}</td><td>{line.status}</td>
   </tr>)}</tbody>
   <tfoot><tr><th scope="row" colSpan={3}>Visible to this viewer</th><td className="pf-amount">{money(total)}</td><td>{rows.length} of {patient.billing.length} lines</td></tr></tfoot>
  </table></div> : <EmptyNote>No claim line in this file is open to this viewer.</EmptyNote>}
  <ProtectedLine viewer={viewer} what="claim line"/>
 </>;
}

/* One sentence, the same wherever a list could have been shortened by the protected rule. It does
   not say whether anything was removed, for the same reason the header notice does not. */
function ProtectedLine({ viewer, what }: { viewer: VettingSubject; what: string }) {
 const vetted = can(viewer, 'view-protected-record');
 return <p className="pfx-hint pf-protected-line"><LockKeyhole size={14} aria-hidden="true"/>A protected {what} appears on this page only where the patient released that entry to you by name. {vetted.allowed ? releaseRefusal(viewer.roleId) : vetted.reason}</p>;
}

/* ---- The two actions with no screen anywhere ----------------------------------------------------
 *
 * The file's action row asked the vetting module whether this viewer may take each action, and then
 * wrote "New consultation would open here for Thando Mokoena" into a live region — a sentence in
 * the subjunctive under a button somebody had just pressed. Three of the five open a real screen
 * now. These are the other two, and they are here rather than in the router because both are about
 * *this* file: a document goes into somebody's record and a prescription comes out of somebody's
 * review, and neither question has a general answer.
 *
 * Book a visit is the fifth and needs nothing: a doctor does not hold dispatch-nurses, so it draws
 * as the refusal rather than as a button. */

export function UploadDocument({ patient, onClose }: { patient: string; onClose: () => void }) {
 const evidence = recordById('vetting-evidence')!;
 return <div className="form-stack pfx">
  <NotConnected of="clinical-records"/>
  <p className="muted">Adding a letter, a report or a signed consent form to {patient}’s file is writing into a health record. It is the same act as writing a note, held to the same capability, and what makes it safe is not the upload — it is what is recorded around it.</p>
  <dl className="pfx-facts">
   <div><dt>What would be recorded with it</dt><dd>Who uploaded it, under which registration, at what time, and which record type it was filed as. A document in a file that nobody’s name is on is a document nobody can be asked about.</dd></div>
   {/* The platform already seals one class of uploaded document this way, and the record contract
       says how. A second scheme for clinical documents would be a second thing to get wrong. */}
   <div><dt>How it would be held</dt><dd>{evidence.summary}</dd></div>
   <div><dt>Who may take it out again</dt><dd>Nobody. A clinical document is superseded rather than deleted, and the version that was acted on stays readable — which is the only way to answer later what a clinician was looking at.</dd></div>
   <div><dt>What happens here</dt><dd>Nothing. There is no file picker on this screen, no storage behind it and nothing has been added to {patient}’s record. This preview holds no documents of any kind.</dd></div>
  </dl>
  <button className="primary full" onClick={onClose}>Close<ArrowRight size={16}/></button>
 </div>;
}

/* A prescription is not written from a file. It is what a signed clinical decision produces — the
   sentence is Clinical.tsx's own — so this action says where prescribing actually happens rather
   than opening somebody else's prescription, which is what routing it to RX-0081 would have done.
   Opening the wrong patient's medicine list is a worse outcome than a screen that says no. */
export function PrescribingRoute({ patient, onClose }: { patient: string; onClose: () => void }) {
 return <div className="form-stack pfx">
  <NotConnected of="clinical-records"/>
  <p className="muted">There is no prescription for {patient} on this file, and there is no screen here that writes one.</p>
  <dl className="pfx-facts">
   <div><dt>A prescription comes out of a decision</dt><dd>It is produced by a signed clinical review: the outcome is chosen, the rationale is written, and the signature under a current HPCSA registration is what makes the result a prescription rather than a list of medicines.</dd></div>
   <div><dt>Which is why it is not here</dt><dd>A file is what you read before you decide. Issuing from it would mean prescribing without the review that justifies it being on the same screen as the signature.</dd></div>
   <div><dt>And a repeat is not a renewal</dt><dd>{ruleById('ends-in-a-review').sentence}</dd></div>
  </dl>
  <p className="pfx-hint">The review queue is where a case is decided. This preview’s worked example is TH-2048.</p>
  <button className="primary full" onClick={onClose}>Close<ArrowRight size={16}/></button>
 </div>;
}
