import { useState } from 'react';
import { BadgeCheck, CalendarClock, Check, Download, KeyRound, LockKeyhole, Pill as MedicineIcon, ShieldCheck, ShieldX, Syringe, Timer, Users } from 'lucide-react';
import { Pill } from '../components/UI';
import { NotConnected } from '../components/NotConnected';
import contract from '../../../../packages/catalog/records.json';
import { can, daysUntil, formatDate, formatEventTime, inDays, inMonths, roleById, type CheckRecord, type CheckState, type VettingSubject } from '../lib/vetting';
import { subjectById } from '../lib/vetting-fixtures';
import { protectedCategories } from '../lib/records';
import { addToRoster, householdWords, nameOf, neverHolds, previewHousehold, refOfMember, rosterFor } from '../lib/household';

/* A household is the one screen whose whole purpose is showing several people's health at once,
   which makes it the easiest place in the product to undo everything the guardian flow promises.
   packages/catalog/records.json says it plainly — "Membership is not consent: each member's record
   stays their own" — so the rule here is that living at one address grants nothing at all. Every
   clinical line on this page is asked for twice: once of the vetting module (may this party ever
   hold this capability?) and once of the record itself (has this person granted it, to whom, for
   how long?). A yes to one is not a yes.

   Nothing typed here is stored or sent. */

const householdRecord = contract.records.find(r => r.id === 'household')!;

/* ---- The people --------------------------------------------------------------------------- */
export type Member = {
 id: string; name: string; relation: string; born: string; reference: string; dependant: string;
 bloodGroup: string; allergies: string[]; conditions: string[]; medication: string[];
 lastConsultation: { on: string; with: string; about: string };
 emergencyContact: string; vitals: { bp: string; weight: string; on: string }; careTeam: string[];
 immunisations: { vaccine: string; due: string }[];
 collections: { medicine: string; ready: string; pharmacy: string }[];
 /* Protected entries are held here with their detail so the export guard below has something real
    to fail on. Nothing renders them but the person's own view, and no artefact carries them. */
 restricted: { category: string; detail: string }[];
};

export const mokoena = {
 id: 'HH-0184', name: 'Mokoena Household', area: 'Rosebank, Johannesburg',
 scheme: { name: 'Motswedi Medical Scheme', plan: 'Family Option', membership: 'MMS 4417 883', principal: 'thando' },
 members: [
  { id: 'thando', name: 'Thando Mokoena', relation: 'Mother', born: '1987-05-14', reference: 'THU-0001842', dependant: '00',
    bloodGroup: 'O positive', allergies: ['Penicillin — rash and facial swelling, 2016'], conditions: ['Hypertension, diagnosed 2021, managed at home'],
    medication: ['Amlodipine 5 mg, once daily, morning'], lastConsultation: { on: inDays(-11), with: 'Dr Ayanda Dlamini · HPCSA MP0483217', about: 'Blood-pressure review' },
    emergencyContact: 'Nomsa Mokoena · Mother · 071 000 0000', vitals: { bp: '136/84 mmHg', weight: '74.2 kg', on: inDays(-11) },
    careTeam: ['Sister Palesa Khumalo · SANC 20011203', 'Dr Ayanda Dlamini · HPCSA MP0483217'],
    immunisations: [{ vaccine: 'Influenza, annual', due: inDays(24) }],
    collections: [{ medicine: 'Amlodipine 5 mg · 3 months', ready: inDays(3), pharmacy: 'Rosebank community pharmacy' }],
    restricted: [{ category: 'Sexual and reproductive health', detail: 'Contraceptive implant inserted 2025, review 2028' },
                 { category: 'Social support', detail: 'Referred to a social worker after the 2024 retrenchment' }] },
  { id: 'sipho', name: 'Sipho Mokoena', relation: 'Father', born: '1984-02-02', reference: 'THU-0001843', dependant: '01',
    bloodGroup: 'A positive', allergies: ['None recorded'], conditions: ['Type 2 diabetes, diagnosed 2019'],
    medication: ['Metformin 850 mg, twice daily'], lastConsultation: { on: inDays(-38), with: 'Dr Ayanda Dlamini · HPCSA MP0483217', about: 'Six-month diabetic review' },
    emergencyContact: 'Thando Mokoena · Wife · 071 000 0000', vitals: { bp: '128/80 mmHg', weight: '88.6 kg', on: inDays(-38) },
    careTeam: ['Dr Ayanda Dlamini · HPCSA MP0483217'],
    immunisations: [], collections: [{ medicine: 'Metformin 850 mg · 3 months', ready: inDays(9), pharmacy: 'Rosebank community pharmacy' }],
    restricted: [] },
  { id: 'lebo', name: 'Lebo Mokoena', relation: 'Child', born: '2018-03-03', reference: 'THU-0001844', dependant: '02',
    bloodGroup: 'O positive', allergies: ['None recorded'], conditions: ['Mild asthma, reliever inhaler as needed'],
    medication: ['Salbutamol inhaler, as needed'], lastConsultation: { on: inDays(-64), with: 'Sister Palesa Khumalo · SANC 20011203', about: 'Winter chest check' },
    emergencyContact: 'Thando Mokoena · Mother · 071 000 0000', vitals: { bp: 'Not taken', weight: '26.4 kg', on: inDays(-64) },
    careTeam: ['Sister Palesa Khumalo · SANC 20011203'],
    immunisations: [{ vaccine: 'Td booster, school age', due: inDays(41) }], collections: [], restricted: [] },
  { id: 'amahle', name: 'Amahle Mokoena', relation: 'Child', born: '2009-09-21', reference: 'THU-0001845', dependant: '03',
    bloodGroup: 'B positive', allergies: ['None recorded'], conditions: ['None recorded'], medication: ['None recorded'],
    lastConsultation: { on: inDays(-27), with: 'Sister Palesa Khumalo · SANC 20011203', about: 'Recorded in her own account' },
    emergencyContact: 'Thando Mokoena · Mother · 071 000 0000', vitals: { bp: '112/70 mmHg', weight: '54.1 kg', on: inDays(-27) },
    careTeam: ['Sister Palesa Khumalo · SANC 20011203'],
    immunisations: [], collections: [],
    restricted: [{ category: 'Sexual and reproductive health', detail: 'HIV test with counselling, consented to on her own account' }] }
 ] as Member[]
};
export const memberById = (id: string) => mokoena.members.find(m => m.id === id)!;
export const firstName = (m: Member) => m.name.split(' ')[0];
/* Ages are arithmetic on a birth date rather than a number somebody typed, so Amahle passes into
   adulthood — and out of every guardian grant below — on the day she actually does. */
export function ageOf(born: string) {
 const d = new Date(`${born}T00:00:00Z`), now = new Date();
 let years = now.getUTCFullYear() - d.getUTCFullYear();
 const months = now.getUTCMonth() - d.getUTCMonth();
 if (months < 0 || (months === 0 && now.getUTCDate() < d.getUTCDate())) years--;
 return years;
}
/* The Children's Act lets a child of 12 consent to their own medical treatment, and to an HIV test
   with counselling. The design treats 12 as the age at which a record stops being automatically a
   parent's to open; a real product must also record the maturity assessment the Act asks for, and
   this build does not pretend to make it. */
export const OWN_CONSENT_AGE = 12;

/* ---- Who is looking ------------------------------------------------------------------------ */
export type Level = 'none' | 'admin' | 'emergency' | 'summary' | 'clinical' | 'self';
const order: Level[] = ['none', 'admin', 'emergency', 'summary', 'clinical', 'self'];
export const atLeast = (level: Level, floor: Level) => order.indexOf(level) >= order.indexOf(floor);
export const levelLabels: Record<Level, string> = {
 none: 'No access', admin: 'Household admin only', emergency: 'Emergency details only',
 summary: 'Health summary', clinical: 'Full record', self: 'Your own record'
};
export type HouseGrant = { memberId: string; basis: 'guardian' | 'shared' | 'visit'; asks: Level; until: string; period: string; verified: boolean };
export type Viewer = { id: string; name: string; role: string; memberId?: string; subject?: VettingSubject; grants: HouseGrant[] };

/* Two guardian records built here rather than borrowed, because the household needs guardians by
   these names. Every renewable check is given a real expiry, so nobody is verified forever. */
const vetted = (id: string, name: string, roleId: string, reference: string, over: Record<string, Partial<CheckRecord>> = {}): VettingSubject => ({
 id, name, roleId, reference,
 records: (roleById(roleId)?.checks ?? []).map(c => ({
  checkId: c.id, state: 'verified' as CheckState, decidedOn: inMonths(-3), decidedBy: 'T. van Wyk · Compliance', evidence: c.evidence,
  ...(c.renewMonths ? { expiresOn: inMonths(c.renewMonths - 3) } : {}),
  ...(c.risk === 'high' ? { secondedBy: 'M. Sithole · Clinical Governance' } : {}),
  ...over[c.id]
 }))
});
const guardianOf = (memberId: string, verified = true): HouseGrant =>
 ({ memberId, basis: 'guardian', asks: 'clinical', until: inMonths(6), period: 'Reviewed every six months', verified });
const visitTo = (memberId: string): HouseGrant =>
 ({ memberId, basis: 'visit', asks: 'clinical', until: inDays(1), period: 'Today’s visit only', verified: true });

export const householdViewers: Viewer[] = [
 { id: 'v-thando', name: 'Thando Mokoena', role: 'Household organiser · you', memberId: 'thando',
   subject: vetted('G-101', 'Thando Mokoena', 'guardian', 'Guardian 0184'), grants: [guardianOf('lebo'), guardianOf('amahle')] },
 { id: 'v-sipho', name: 'Sipho Mokoena', role: 'Household member', memberId: 'sipho',
   subject: vetted('G-102', 'Sipho Mokoena', 'guardian', 'Guardian 0185', { 'legal-authority': { state: 'submitted', note: 'Birth certificates uploaded; awaiting the document check.' } }),
   grants: [guardianOf('lebo'), guardianOf('amahle')] },
 { id: 'v-amahle', name: 'Amahle Mokoena', role: 'Household member · 16', memberId: 'amahle', grants: [] },
 /* The nurse reaches Thando through today's visit and Sipho through a summary he handed over
    himself. Two different authorities, neither of them the household. */
 { id: 'v-nurse', name: 'Sister Palesa Khumalo', role: 'Visiting nurse · vetting current', subject: subjectById('N-206')!,
   grants: [visitTo('thando'), { memberId: 'sipho', basis: 'shared', asks: 'summary', until: inDays(1), period: 'Until this evening', verified: true }] },
 { id: 'v-lapsed', name: 'Sister Ayanda Dube', role: 'Visiting nurse · clearance lapsed', subject: subjectById('N-204')!, grants: [visitTo('thando')] },
 { id: 'v-sponsor', name: 'Zodwa Radebe', role: 'Care sponsor · pays for Thando’s visits', subject: subjectById('S-022')!, grants: [] }
];

export type Visibility = { level: Level; reason: string };
/* The whole rule, in one function, so no screen can quietly reach past it. Order matters: the
   household floor is administrative and never clinical; a grant is checked for life and for
   verification before it is checked for scope; the vetting module has the last word on anyone
   acting in a role; and a minor old enough to consent for themselves is not reachable through
   their parent at all. */
export function visibilityFor(viewer: Viewer, member: Member): Visibility {
 if (viewer.memberId === member.id) return { level: 'self', reason: 'Your own record, in full.' };
 const floor: Level = viewer.memberId ? 'admin' : 'none';
 const grant = viewer.grants.find(g => g.memberId === member.id);
 const who = firstName(member);
 if (!grant) return { level: floor, reason: viewer.memberId
  ? `${who} has not given you access to their record. Sharing a household is not consent, and paying for care is not a permission.`
  : 'Nothing has been granted for this person, so nothing about them is shown here — not even that there is a record.' };
 if ((daysUntil(grant.until) ?? 0) < 0) return { level: floor, reason: `That access ended on ${formatDate(grant.until)}. It does not renew by being asked for again; ${who} grants it.` };
 if (!grant.verified) return { level: floor, reason: 'Identity verification is outstanding. An unverified invitation grants nothing.' };
 if (grant.basis !== 'shared') {
  /* Acting in a role — guardian, nurse — means the vetting record decides, and it is resolved
     against its own expiry dates every time it is read rather than trusted as written down. */
  if (!viewer.subject) return { level: floor, reason: 'No vetting record stands behind this claim, so it grants nothing.' };
  const holds = can(viewer.subject, grant.basis === 'guardian' ? 'guardian-access' : 'view-patient-summary');
  if (!holds.allowed) return { level: floor, reason: holds.reason ?? 'Refused.' };
  const scoped = can(viewer.subject, 'view-clinical-record');
  if (!scoped.allowed) return { level: floor, reason: scoped.reason ?? 'Refused.' };
 }
 const age = ageOf(member.born);
 if (grant.basis === 'guardian' && age >= OWN_CONSENT_AGE && age < 18) return { level: 'emergency', reason:
  `${who} is ${age}. From 12 a child may consent to their own medical treatment, and to an HIV test with counselling — so this record is theirs to open, not yours. Blood group, allergies and one contact stay here because an emergency cannot wait for a conversation; conditions, medicines and visits are released by ${who} from their own account.` };
 return { level: grant.asks, reason:
  grant.basis === 'visit' ? `Open for ${grant.period.toLowerCase()}, because ${who} is expecting you. It closes on its own.`
   : grant.basis === 'shared' ? `${who} shared this directly, ${grant.period.toLowerCase()}. Nobody had to be vetted for it: the person it belongs to is the shortest route to it, and the easiest to withdraw.`
    : `Guardian access, ${grant.period.toLowerCase()}, until ${formatDate(grant.until)}.` };
}

/* ---- The household's own facts -------------------------------------------------------------- */
const appointments = [
 { id: 'AP-9001', memberId: 'thando', when: inDays(2), time: '09:00', service: 'Vitals & chronic check' },
 { id: 'AP-9002', memberId: 'lebo', when: inDays(2), time: '10:30', service: 'Childhood immunisation' },
 { id: 'AP-9003', memberId: 'amahle', when: inDays(5), time: '15:00', service: 'Follow-up visit' },
 { id: 'AP-9004', memberId: 'sipho', when: inDays(12), time: '08:00', service: 'Diabetic review' }
];

/* ---- The household record -------------------------------------------------------------------- */
export function HouseholdRecord({ household = mokoena, viewers = householdViewers }: { household?: typeof mokoena; viewers?: Viewer[] } = {}) {
 const [viewerId, setViewerId] = useState(viewers[0].id);
 const [openId, setOpenId] = useState<string | null>(null);
 const [status, setStatus] = useState('');
 const viewer = viewers.find(v => v.id === viewerId) ?? viewers[0];
 const seen = household.members.map(m => ({ member: m, vis: visibilityFor(viewer, m) }));
 /* A household member already knows who lives there, so the roster tells them nothing new and the
    refusals are worth showing by name. To anybody else the roster is itself information, so they
    are shown only the people they have a basis for, and no count of the rest. */
 const roster = viewer.memberId ? seen : seen.filter(r => r.vis.level !== 'none');
 const clinical = seen.filter(r => atLeast(r.vis.level, 'clinical'));
 const principal = viewer.memberId === household.scheme.principal;
 const billing = viewer.memberId ? { allowed: true, reason: '' }
  : viewer.subject ? can(viewer.subject, 'view-billing')
   : { allowed: false, reason: 'Nothing stands behind this claim, so the scheme record is not opened.' };
 const refusal = viewer.subject ? can(viewer.subject, 'view-patient-summary').reason : 'Nobody outside this household is shown its members.';
 const open = openId ? seen.find(r => r.member.id === openId) : undefined;
 const choose = (id: string) => {
  const next = viewers.find(v => v.id === id)!;
  const count = household.members.filter(m => atLeast(visibilityFor(next, m).level, 'emergency')).length;
  setViewerId(id); setOpenId(null);
  setStatus(next.memberId
   ? `Viewing as ${next.name}. ${count} of ${household.members.length} records are open to them; the rest are refused with the reason on the card.`
   : `Viewing as ${next.name}, who does not live here. ${count === 0 ? 'No member of this household is listed for them at all.' : `Only the ${count} member${count === 1 ? '' : 's'} they have a basis for are listed; the household roster is itself information.`}`);
 };
 return <div className="form-stack">
  <div className="tabs" role="group" aria-label="Look at this household as">
   {viewers.map(v => <button key={v.id} className={v.id === viewer.id ? 'selected' : ''} aria-pressed={v.id === viewer.id} onClick={() => choose(v.id)}>{v.name}</button>)}
  </div>
  <p className="helper" role="status" aria-live="polite">{status || `Viewing as ${viewer.name} — ${viewer.role}. Switch above to see the same household through someone else’s permissions.`}</p>

  <div className="panel">
   <div className="review-line"><span>Household</span><strong><Users size={15}/>{household.name}</strong></div>
   <div className="review-line"><span>Held as</span><strong>FHIR Group · {household.id}</strong></div>
   <div className="review-line"><span>Care area</span><strong>{household.area}</strong></div>
   <p className="helper">{householdRecord.summary}</p>
  </div>

  <div className="catalog-grid">{roster.map(({ member, vis }) => {
   const permitted = atLeast(vis.level, 'emergency');
   return <div className="panel family-profile" key={member.id}>
    <span className={`avatar ${member.relation === 'Child' ? 'peach' : 'blue'}`}>{member.name.split(' ').map(p => p[0]).join('')}</span>
    <h3>{member.name}</h3>
    <Pill tone={vis.level === 'self' ? 'teal' : permitted ? 'sky' : 'danger'}>{levelLabels[vis.level]}</Pill>
    <p className="muted">{member.relation} · {ageOf(member.born)} years · {member.reference}</p>
    <p className="muted">{vis.reason}</p>
    <button className="secondary" disabled={!permitted} onClick={() => { setOpenId(member.id); setStatus(`Opened ${member.name} at ${levelLabels[vis.level].toLowerCase()}.`); }}>
     {permitted ? <><ShieldCheck size={15}/>Open what you may see</> : <><ShieldX size={15}/>Refused</>}
    </button>
   </div>;
  })}</div>
  {!roster.length && <div className="panel"><h3>Nothing here is yours to see.</h3><p className="muted">{refusal}</p>
   <p className="helper">Not one member is named, and no count of them is given. A refusal that still told you how many people live here, and which of them have records, would be a refusal in name only.</p></div>}
  <div className="privacy-note"><LockKeyhole size={19}/>Every record here has parts only the person themselves can release. This line stands on all of them, whether or not there is anything behind it — a notice that appeared only where there was something to hide would be the disclosure it is meant to prevent, and a count of the records it stood on would be another one.</div>

  {open && atLeast(open.vis.level, 'emergency') && <div className="panel">
   <h3>{open.member.name}</h3>
   <p className="muted">{levelLabels[open.vis.level]} · {open.vis.reason}</p>
   {open.vis.level === 'emergency'
    ? <><div className="review-line"><span>Blood group</span><strong>{open.member.bloodGroup}</strong></div>
        <div className="review-line"><span>Allergies</span><strong>{open.member.allergies.join('; ')}</strong></div>
        <div className="review-line"><span>Emergency contact</span><strong>{open.member.emergencyContact}</strong></div>
        <p className="helper">Three lines, and deliberately not the fourth. Conditions and medicines would say more about {firstName(open.member)} than an emergency needs to know.</p></>
    : <SummaryCard member={open.member} fields={contract.summaryCard.fields}/>}
   {open.vis.level === 'self' && <HealthSummary member={open.member}/>}
  </div>}

  <div className="two-column">
   <section className="panel">
    <h3>Shared appointments</h3>
    {appointments.map(a => {
     const m = memberById(a.memberId);
     const vis = visibilityFor(viewer, m);
     if (!viewer.memberId && !atLeast(vis.level, 'emergency')) return null;
     return <div className="record-row static" key={a.id}>
      <span className="service-icon"><CalendarClock size={20}/></span>
      <span><strong>{formatDate(a.when)} · {a.time} · {firstName(m)}</strong>
       <small>{atLeast(vis.level, 'summary') ? a.service : 'A booked visit. What it is for is not part of the household calendar.'}</small></span>
     </div>;
    })}
    <p className="helper">A household calendar says who is out of the house on Saturday morning. It says what the visit is for only to someone already allowed to know.</p>
   </section>
   <section className="panel">
    <h3>Medical aid and dependants</h3>
    {billing.allowed ? <>
     <div className="review-line"><span>Scheme</span><strong>{household.scheme.name}</strong></div>
     <div className="review-line"><span>Plan</span><strong>{household.scheme.plan}</strong></div>
     <div className="review-line"><span>Membership</span><strong>{household.scheme.membership}</strong></div>
     {household.members.filter(m => principal || m.id === viewer.memberId).map(m =>
      <div className="review-line" key={m.id}><span>{m.name}{m.id === household.scheme.principal ? ' · principal' : ''}</span><strong>Dependant {m.dependant}</strong></div>)}
     <p className="helper">{principal ? 'You are the principal member, so you hold every dependant code.' : 'Only your own dependant code is shown. The others are not yours to quote.'} A dependant code links a person to a scheme; it is not a key to their record, and nothing clinical is stored against it.</p>
    </> : <><p className="muted">{billing.reason}</p><p className="helper">Claims carry a service code and never the diagnosis in words, which is what makes a refusal here cheap rather than obstructive.</p></>}
   </section>
  </div>

  <div className="two-column">
   <section className="panel">
    <h3>Immunisations due</h3>
    {clinical.flatMap(({ member }) => member.immunisations.map(i => <div className="record-row static" key={`${member.id}-${i.vaccine}`}>
     <span className="service-icon"><Syringe size={20}/></span>
     <span><strong>{firstName(member)} · {i.vaccine}</strong><small>Due {formatDate(i.due)}</small></span>
    </div>))}
    <p className="helper">This list covers the members whose records are open to you. It does not say whether there is anything outstanding for the others. Dates are indicative; the national EPI schedule governs.</p>
   </section>
   <section className="panel">
    <h3>Chronic medicine to collect</h3>
    {clinical.flatMap(({ member }) => member.collections.map(c => <div className="record-row static" key={`${member.id}-${c.medicine}`}>
     <span className="service-icon"><MedicineIcon size={20}/></span>
     <span><strong>{firstName(member)} · {c.medicine}</strong><small>Ready {formatDate(c.ready)} · {c.pharmacy}</small></span>
    </div>))}
    <p className="helper">Same rule, and for the same reason: “a collection is due for someone you cannot see” is itself a clinical fact about that person.</p>
   </section>
  </div>

  <Roster viewer={viewer}/>

  <section className="panel">
   <h3>Book a home visit</h3>
   <p className="muted">Arranging care is not reading a record, so this stays open to the household while the record above stays shut.</p>
   <div className="button-row">{household.members.map(m => <button key={m.id} className="secondary" disabled={!viewer.memberId}
    onClick={() => setStatus(`Home visit requested for ${m.name}. Arranging it still tells you nothing about what the nurse finds.`)}>{firstName(m)}</button>)}</div>
   <p className="helper">{viewer.memberId ? 'You can arrange a visit for anyone in the household. The visit summary goes to them.' : 'Only a member of the household can arrange visits for it.'}</p>
  </section>
 </div>;
}

/* ---- The roster ------------------------------------------------------------------------------
   The household above is the record: who may see what of whom, and why. This is the arrangement
   underneath it — a list of account references and who put them there — and the point of drawing
   the two on one screen is that adding a line to the second changes nothing about the first.

   Everything here is answered by packages/engines/src/access/domain/household.ts, the module the
   routes POST /v1/access/household-memberships@1 and GET /v1/access/households@1 are built on, so
   the refusal a person reads is the one the route would have sent. Nothing is stored or sent: the
   roster lives in this component's state while the page is open.

   The checkbox is the part worth defending. It offers exactly what the contract refuses — a record
   opened along with the roster line — and it is not disabled, because a disabled control says the
   thing is possible for somebody. Ticking it sends the field, and the route answers in words. */
function Roster({ viewer }: { viewer: Viewer }) {
 const [household, setHousehold] = useState(() => previewHousehold());
 const [reference, setReference] = useState('');
 const [withAccess, setWithAccess] = useState(false);
 const [status, setStatus] = useState('');
 const mine = viewer.memberId ? refOfMember(viewer.memberId) : null;
 const seen = rosterFor(household, mine ?? '');
 const add = () => {
  const answer = addToRoster(household, { memberSubjectRef: reference.trim(), addedBySubjectRef: mine ?? '', attachment: withAccess ? 'grantedScope' : undefined });
  if (answer.refused) { setStatus(answer.statement); return; }
  setHousehold(answer.household); setReference(''); setWithAccess(false);
  setStatus(householdWords.added);
 };
 return <section className="panel">
  <h3>{householdWords.heading}</h3>
  <p className="muted">{householdWords.intro}</p>
  {seen.refused
   ? <p className="muted">{seen.statement}</p>
   : <>{seen.members.map(m => <div className="review-line" key={m.memberSubjectRef}>
       <span>{nameOf(m.memberSubjectRef)}</span>
       <strong>{householdWords.addedBy.replace('{who}', nameOf(m.addedBySubjectRef))} · {formatDate(m.addedOnDay)}</strong>
      </div>)}
      <label>{householdWords.addLabel}<input value={reference} onChange={e => setReference(e.target.value.slice(0, 40))} placeholder="subj-preview-…"/></label>
      <label className="checkbox"><input type="checkbox" checked={withAccess} onChange={e => setWithAccess(e.target.checked)}/><span>Also open their record to me</span></label>
      <div className="button-row"><button className="secondary" disabled={!reference.trim()} onClick={add}><Users size={16}/>{householdWords.add}</button></div>
     </>}
  <p className="helper" role="status" aria-live="polite">{status || householdWords.preview}</p>
  <div className="privacy-note"><LockKeyhole size={19}/><span><strong>{householdWords.neverHeading}.</strong> {householdWords.grantsNothing}</span></div>
  <dl className="stated">{neverHolds.map(n => <div key={n.field}><dt>{n.field}</dt><dd>{n.why}</dd></div>)}</dl>
 </section>;
}

/* ---- The health summary ---------------------------------------------------------------------
   packages/catalog/records.json defines this card: nine fields, and a rule that protected
   categories never appear but are never silently omitted either. Both halves matter. A clinician
   who reads a summary with no mention of mental health concludes there is nothing to know. */
const summaryFields: Record<string, (m: Member) => { label: string; value: string }> = {
 patient: m => ({ label: 'Patient', value: `${m.name} · ${m.reference} · born ${formatDate(m.born)}` }),
 bloodGroup: m => ({ label: 'Blood group', value: m.bloodGroup }),
 allergies: m => ({ label: 'Allergies', value: m.allergies.join('; ') }),
 chronicConditions: m => ({ label: 'Chronic conditions', value: m.conditions.join('; ') }),
 currentMedication: m => ({ label: 'Current medication', value: m.medication.join('; ') }),
 lastConsultation: m => ({ label: 'Last consultation', value: `${formatDate(m.lastConsultation.on)} · ${m.lastConsultation.with} · ${m.lastConsultation.about}` }),
 emergencyContact: m => ({ label: 'Emergency contact', value: m.emergencyContact }),
 latestVitals: m => ({ label: 'Latest readings', value: `BP ${m.vitals.bp} · ${m.vitals.weight} · ${formatDate(m.vitals.on)}` }),
 careTeam: m => ({ label: 'Care team', value: m.careTeam.join('; ') })
};
export const summaryValues = (member: Member, fields: readonly string[]) =>
 contract.summaryCard.fields.filter(f => fields.includes(f) && summaryFields[f]).map(f => summaryFields[f](member));

/* A shared summary is bound to a purpose and to a period, and the purpose chooses the fields. A
   pharmacist dispensing this afternoon needs allergies and medicines; they do not need where the
   patient was last seen or by whom. An undated summary with every field in it is the artefact that
   ends up forwarded, so it is the one thing this flow will not produce. */
export type Purpose = { id: string; name: string; recipient: string; hours: number; fields: string[] };
export const purposes: Purpose[] = [
 { id: 'visit', name: 'The nurse at my door, today', recipient: 'Sister Palesa Khumalo · SANC 20011203', hours: 6,
   fields: ['patient', 'allergies', 'chronicConditions', 'currentMedication', 'latestVitals', 'emergencyContact', 'lastConsultation'] },
 { id: 'pharmacy', name: 'A pharmacy, dispensing one prescription', recipient: 'Rosebank community pharmacy', hours: 4,
   fields: ['patient', 'allergies', 'currentMedication'] },
 { id: 'casualty', name: 'A casualty unit, admitting me', recipient: 'The admitting clinician', hours: 24,
   fields: contract.summaryCard.fields },
 { id: 'opinion', name: 'A doctor giving a second opinion', recipient: 'Dr Sanjay Naidoo · HPCSA MP0559104', hours: 168,
   fields: ['patient', 'chronicConditions', 'currentMedication', 'lastConsultation', 'latestVitals', 'careTeam'] }
];
export type Share = { id: string; token: string; purpose: Purpose; recipient: string; createdAt: string; validUntil: string; revoked: boolean };
/* Twenty characters from a 32-symbol alphabet — 100 bits from the browser's own generator, with no
   modulo bias because 256 divides by 32. It is not the patient number, not a hash of it and not a
   counter, so there is nothing to guess at and nothing to walk through. I, L, O and U are left out
   so that reading one over a counter cannot turn it into a different valid-looking one. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function shareToken() {
 const bytes = new Uint8Array(20);
 crypto.getRandomValues(bytes);
 return [...bytes].map(b => ALPHABET[b % 32]).join('').replace(/(.{5})(?=.)/g, '$1-');
}
export function buildSharedSummary(member: Member, share: Share) {
 return {
  document: 'MyThuso health summary', version: 1,
  notice: 'A summary the person it is about produced for one named purpose. It is not a medical record and nothing in it was written by a clinician.',
  producedAt: share.createdAt, producedBy: `${member.name} — the person this summary is about`,
  purpose: share.purpose.name, sharedWith: share.recipient,
  validUntil: share.validUntil, validFor: `${share.purpose.hours} hours from the moment it was produced`,
  afterThat: 'The summary stops being valid. A copy kept after that date is a copy of an expired document, and the verification link says so.',
  reference: share.token,
  verification: {
   link: `https://verify.mythuso.co.za/s/${share.token.toLowerCase()}`,
   returns: ['the patient’s initials', 'valid, expired or revoked', 'the purpose it was made for', 'the moment it stops being valid'],
   neverReturns: ['name', 'identity number', 'patient reference', 'date of birth', 'address', 'contact number', 'any clinical content'],
   note: 'No verification service is running behind this link yet, so it resolves to nothing at all.'
  },
  summary: Object.fromEntries(summaryValues(member, share.purpose.fields).map(f => [f.label, f.value])),
  withheld: { categories: protectedCategories, rule: contract.summaryCard.withheld,
   whatToDo: 'Ask the patient. MyThuso will not release these on their behalf, and this list is the same on every summary it produces — it does not say that this person has entries in any of them.' }
 };
}

/* The withheld list is the same on every summary of every person, and is read from the contract in
   lib/records.ts so a category added there is refused here without anyone editing this file. Naming
   only the categories a person actually has would turn the honesty of the notice into the leak it
   was written to prevent — the list is constant precisely so that its presence discloses nothing. */
export function SummaryCard({ member, fields }: { member: Member; fields: readonly string[] }) {
 return <>
  {summaryValues(member, fields).map(f => <div className="review-line" key={f.label}><span>{f.label}</span><strong>{f.value}</strong></div>)}
  <div className="privacy-note"><LockKeyhole size={19}/><span><strong>Withheld from every summary.</strong> {contract.summaryCard.withheld}
   <span className="chip-set">{protectedCategories.map(c => <span className="chip" key={c}>{c}</span>)}</span></span></div>
 </>;
}

export function HealthSummary({ member = mokoena.members[0] }: { member?: Member } = {}) {
 const [purposeId, setPurposeId] = useState(purposes[0].id);
 const [recipient, setRecipient] = useState('');
 const [understood, setUnderstood] = useState(false);
 const [shares, setShares] = useState<Share[]>([]);
 const [status, setStatus] = useState('');
 const purpose = purposes.find(p => p.id === purposeId)!;
 const create = () => {
  const now = new Date();
  const share: Share = { id: `SHR-${shares.length + 1}`, token: shareToken(), purpose,
   recipient: recipient.trim() || purpose.recipient, createdAt: now.toISOString(),
   validUntil: new Date(now.getTime() + purpose.hours * 3_600_000).toISOString(), revoked: false };
  setShares([share, ...shares]); setUnderstood(false);
  setStatus(`Summary shared for ${purpose.name.toLowerCase()}, with ${share.recipient}. It stops being valid at ${formatEventTime(share.validUntil)} — ${purpose.fields.length} of ${contract.summaryCard.fields.length} fields, and no protected category.`);
 };
 /* The rule is checked against the bytes that would actually leave, not against the intention of
    the code that wrote them. A protected entry reaching this file at all should stop the export
    rather than travel in it, and a rule nobody tests is a rule somebody hopes about. */
 const download = (share: Share) => {
  const body = JSON.stringify(buildSharedSummary(member, share), null, 2);
  const leak = member.restricted.find(r => body.includes(r.detail));
  if (leak) { setStatus('Export refused: a protected entry reached the artefact. Nothing was downloaded.'); return; }
  const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = `mythuso-summary-${share.token.slice(0, 5).toLowerCase()}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus(`Downloaded. The file says who made it, for whom, for what, and when it stops being valid — and carries ${purpose.fields.length} fields with no protected category in any of them.`);
 };
 return <div className="form-stack">
  <div className="panel">
   <h3>Health summary · {member.name}</h3>
   <p className="muted">{contract.summaryCard.why}</p>
   <SummaryCard member={member} fields={contract.summaryCard.fields}/>
   {!!member.restricted.length && <p className="helper"><LockKeyhole size={13}/>You have {member.restricted.length} entries in protected categories. They are yours, they appear in no summary you share, and you release them one at a time, to one person, for one purpose.</p>}
  </div>

  <div className="panel">
   <h3>Share this summary</h3>
   <p className="muted">A summary that is valid forever is a summary you have lost. Choose what it is for; the purpose chooses the fields and the hours.</p>
   <NotConnected of="clinical-records" tone="inline"/>
   <fieldset className="chip-set"><legend>What is this summary for?</legend>
    {purposes.map(p => <label key={p.id} className={`chip ${p.id === purposeId ? 'selected' : ''}`}>
     <input type="radio" name="summary-purpose" checked={p.id === purposeId} onChange={() => { setPurposeId(p.id); setStatus(`${p.name} — ${p.fields.length} fields, valid ${p.hours} hours.`); }}/>{p.name}</label>)}
   </fieldset>
   <label>Who receives it<input value={recipient} onChange={e => setRecipient(e.target.value.slice(0, 80))} placeholder={purpose.recipient}/></label>
   <div className="review-line"><span>They will see</span><strong>{summaryValues(member, purpose.fields).map(f => f.label).join(', ')}</strong></div>
   <div className="review-line"><span>They will not see</span><strong>{contract.summaryCard.fields.filter(f => !purpose.fields.includes(f)).map(f => summaryFields[f](member).label).join(', ') || 'Nothing further — this purpose carries the whole card'}</strong></div>
   <div className="review-line"><span>Valid for</span><strong><Timer size={15}/>{purpose.hours} hours</strong></div>
   <label className="checkbox"><input type="checkbox" checked={understood} onChange={e => setUnderstood(e.target.checked)}/><span>I have read what this share does and does not include, and who receives it.</span></label>
   <div className="button-row"><button className="primary" disabled={!understood} onClick={create}><BadgeCheck size={16}/>Create the share</button></div>
   <p className="helper" role="status" aria-live="polite">{status || 'Nothing has been shared yet.'}</p>
  </div>

  {shares.map(share => <div className="panel" key={share.id}>
   <div className="review-line"><span>Purpose</span><strong>{share.purpose.name}</strong></div>
   <div className="review-line"><span>Shared with</span><strong>{share.recipient}</strong></div>
   <div className="review-line"><span>Produced</span><strong>{formatEventTime(share.createdAt)} by {member.name}</strong></div>
   <div className="review-line"><span>Stops being valid</span><strong>{share.revoked ? 'Revoked' : formatEventTime(share.validUntil)}</strong></div>
   <div className="review-line"><span>Reference</span><strong><KeyRound size={15}/>{share.token}</strong></div>
   <div className="privacy-note"><ShieldCheck size={19}/><span><strong>What a scanner would read.</strong> The reference above, and nothing else — it is 100 random bits, not your patient number and not a number anyone can count up to. Someone holding it is answered with your initials ({member.name.split(' ').map(p => p[0]).join('.')}.), whether the summary is valid, expired or revoked, what it was made for, and when it stops. Not your name, not your date of birth, not one clinical word. No code is drawn here: the picture would only be a way to lose the reference, and the reference is the part that matters.</span></div>
   <div className="button-row">
    <button className="secondary" disabled={share.revoked} onClick={() => download(share)}><Download size={16}/>Export this summary</button>
    <button className="secondary" disabled={share.revoked} onClick={() => { setShares(shares.map(s => s.id === share.id ? { ...s, revoked: true } : s)); setStatus('Revoked. The verification link now answers “revoked”. Anything already read cannot be unread, which is why the purpose and the hours matter more than the revocation does.'); }}>
     {share.revoked ? <><Check size={16}/>Revoked</> : <><ShieldX size={16}/>Revoke</>}</button>
   </div>
  </div>)}
 </div>;
}
