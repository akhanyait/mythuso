/* The Health Passport's own pages — trends, what a reading means, the timeline, the care team, the
   certificate, a prescription's journey and a device's permission sheet — behind a dynamic import since the
   design handoff of 28 September 2026. None of them is on a patient's first view, and Passport.tsx, which the
   application imports statically, now hands each of them over on the first press rather than on the first
   load; the home's figures and shared components were paid for with these bytes. */
import { Suspense, lazy, useState, type ReactNode } from 'react';
import { Activity, Ambulance, ArrowRight, BookOpen, Bluetooth, CalendarClock, Check, ChevronDown, ChevronRight, Clock3, Download, Droplets, FileCheck, FileText, Heart, History, HeartPulse, LineChart, LockKeyhole, MapPin, Pill as PillIcon, Share2, ShieldCheck, Smartphone, Stethoscope, Target, Thermometer, TriangleAlert, Users, Wind } from 'lucide-react';
import { ClinicianProfile } from '../components/ClinicianProfile';
import { EmptyState } from '../components/States';
import { Pill, SectionTitle } from '../components/UI';
import { NotConnected } from '../components/NotConnected';
import { ClinicalChart } from '../components/Chart';
import { Metric, Metrics } from '../surface/Surface';
import { Badge, Button, Card, Tab, TabsList } from '../ui';
import { PatientHeader } from './PatientHeader';
import type { VisitAction, VisitRow } from './Pages';
import { labels as schedulingLabels, longDateOf, shortDateOf, visitEnds, weekdayOf } from '../lib/scheduling';
import { nurseOfVisit } from '../lib/arrival';
import { subjectById } from '../lib/vetting-fixtures';
import { refusal as wellbeingRefusal } from '../lib/wellbeing';
import './health-home.css';
import { provenanceById } from '../lib/capture';
import { capability } from '../lib/capabilities';
import { money, services } from '../lib/catalog';
import { roleById } from '../lib/vetting';
import { subjectsByRole } from '../lib/vetting-fixtures';
import { recordById } from '../lib/records';
import { assignedNurse } from '../lib/arrival';
import {
 authorisation, authorisedOn, binds, collectionAnswer, expiresOn, formatDay, handover, isFinalRepeat,
 nextCollectionOn, prescription, refusalById, repeatsRemaining, ruleById
} from '../lib/dispensing';
import {
 dateOf, documents as passportDocuments, flagFor, formatValue, headlineMeasures, kitInstruments,
 lastReview, latestSet, measureSpec, measuredIn, neverRead, otherMeasures, rangeText,
 readableMeasures, readingSets, refusalById as passportRefusal, reviewedBy, reviewer, seriesFor, type MeasureId
} from '../lib/passport';
import { explanations, provenance, urgentConditions } from '../lib/explain';
/* The request to link Apple Health or Health Connect arrives when the patient opens that screen and not before:
   it carries the Devices registry and every engine's settings, which no patient's first load may. */
const WearableLinkRequest = lazy(() => import('./Devices').then(m => ({ default: m.WearableLinkRequest })));

/* Two screens the Health Passport offered and could not open.
 *
 * "See all" beside the trend charts went to the catch-all dialog, and the three device cards under
 * More each went to a paragraph about the roadmap. Both are screens now, and neither of them can be
 * mistaken for a working integration: the trends screen renders the record contract's own notice
 * and the device screens render the device contract's, word for word, above everything else. */

/* A role's own refusal sentence for one capability, so a screen that explains a limit quotes the
   contract that enforces it rather than describing it in words of its own. Thrown on rather than
   left blank: a limit that silently renders as nothing is the limit going missing. */
const refusalFor = (roleId: string, capabilityId: string) => {
 const grant = roleById(roleId)?.grants.find(g => g.capability === capabilityId);
 if (!grant) throw new Error(`No grant "${capabilityId}" on role "${roleId}" in packages/catalog/vetting.json`);
 return grant.refusal;
};

const measureIcon: Partial<Record<MeasureId, typeof Heart>> = {
 systolic: Heart, diastolic: Heart, pulse: Activity, glucose: Droplets, temperature: Thermometer,
 oxygen: Wind, respiratory: Wind
};

/* ---- Trends ------------------------------------------------------------------------------------ */

export function HealthTrends({ navigate }: { navigate: (page: string) => void }) {
 const [showAll, setShowAll] = useState(false);
 const shown = showAll ? [...headlineMeasures, ...otherMeasures] : headlineMeasures;
 const measures = measuredIn(latestSet);
 const outside = measures.filter(id => flagFor(id, latestSet.values[id]!) !== 'normal');
 return <>
  <PatientHeader icon={LineChart} eyebrow="Health Passport" title="How your readings have changed." back={{ label: 'Back to Health Passport', go: () => navigate('Health Passport') }}
   lead={`${readingSets.length} home visits over the last ${Math.round(Math.abs(readingSets[0].dayOffset) / 30)} months. Every reading is judged against an indicative reference range, which is a guide and not a diagnosis.`}/>
  <NotConnected of="clinical-records"/>

  {/* The lead: where things stand today, before any curve. A person opening a trends screen wants
      the current number first and the shape of it second — the reverse is a chart they have to
      decode to answer "am I all right". */}
  <section className="panel glass lead trend-lead rise-2">
   <div className="lead-head"><div><h2>Your last visit</h2><p>{longDateOf(dateOf(latestSet.dayOffset))}</p></div>
    <Pill tone={outside.length ? 'amber' : 'teal'}>{outside.length ? `${outside.length} outside range` : 'All inside range'}</Pill></div>
   <Metrics>{measuredIn(latestSet).filter(id => headlineMeasures.includes(id)).map(id => {
    const flag = flagFor(id, latestSet.values[id]!);
    return <Metric key={id} value={formatValue(id, latestSet.values[id]!)} unit={measureSpec(id).unit}
     label={measureSpec(id).label} chip={flag === 'normal' ? 'In range' : flag === 'high' ? 'Above range' : 'Below range'}
     flagged={flag !== 'normal'}/>;
   })}</Metrics>
  </section>

  <SectionTitle title="Over time"/>
  <div className="chart-grid">{shown.map(id => {
   const spec = measureSpec(id);
   const Icon = measureIcon[id] ?? Activity;
   return <ClinicalChart key={id} title={spec.label} unit={spec.unit} normal={[spec.range[0], spec.range[1]]}
    icon={<Icon size={16}/>} format={n => formatValue(id, n)} readings={seriesFor(id)}/>;
  })}</div>
  <button className="secondary full space-top" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>
   {showAll ? 'Show the four I watch' : `Show the other ${otherMeasures.length} readings`}</button>

  {/* Every range on this screen in one table, because a person who wants to check one number against
      one range should not have to open seven charts to find it. */}
  {/* The describing sentence sits above the scroll box, not in the table's caption: a caption is the
      table's own child, so at 320px it took the table's width and its last words scrolled off the
      right-hand edge. The caption stays for a screen reader, where belonging to the table is the
      whole point of it. */}
  <SectionTitle title="The ranges these are judged against"/>
  <div className="panel">
   <p className="helper">Indicative reference ranges. They are a guide for a healthy adult and are not a validated early-warning score; your own doctor may work to different numbers for you.</p>
   <div className="table-scroll">
   <table className="chart-table">
    <caption className="visually-hidden">Indicative reference ranges, and your latest reading against each.</caption>
    <thead><tr><th scope="col">Reading</th><th scope="col">Indicative range</th><th scope="col">Your last</th></tr></thead>
    <tbody>{[...headlineMeasures, ...otherMeasures].map(id => {
     const value = latestSet.values[id];
     const flag = value === undefined ? undefined : flagFor(id, value);
     return <tr key={id}><th scope="row">{measureSpec(id).label}</th><td>{rangeText(id)}</td>
      <td>{value === undefined ? '—' : `${formatValue(id, value)} ${measureSpec(id).unit}`}{flag && flag !== 'normal' ? ` · ${flag === 'high' ? 'above' : 'below'}` : ''}</td></tr>;
    })}</tbody>
   </table>
   </div>
  </div>
  <p className="helper"><ShieldCheck size={14}/>Nothing on this screen interprets a reading for you. What a number means for a particular person is a clinical judgement, and MyThuso does not make one.</p>
  {/* Which is not the same as saying nothing. What a measurement *is*, and what a number outside a
      range may follow from, can be explained without interpreting anybody's reading — and a person
      who is not told goes and asks a search engine, which will interpret it for them. */}
  <button className="secondary full" onClick={() => navigate('What readings mean')}>What these readings mean<ArrowRight size={17}/></button>
  <button className="primary full" onClick={() => navigate('Book a nurse')}>Book a visit to have these taken again<ArrowRight size={17}/></button>
  {/* This is the only screen in the patient app that is not itself a navigation entry, so no row in
      the sidebar is lit while you are on it. A full-size way back is the difference between a
      sub-page and a dead end. */}
  <button className="secondary full" onClick={() => navigate('Health Passport')}>Back to your Health Passport<ArrowRight size={17}/></button>
 </>;
}

/* ---- Device permissions ------------------------------------------------------------------------
   Three integrations are offered on the passport's device tab and not one of them could be opened.
   Each needs the same three answers before a person could sensibly say yes: exactly what would be
   read, exactly what would not, and the fact that none of it is connected.
 *
 * Every one of those three is derived. The reading types are the assessment's own observations,
 * because MyThuso does not ask for a category it has nowhere to file. The refusal is the record
 * contract's protected categories, which are released by the person entry by entry and are not
 * something an operating system's permission sheet can hand over on their behalf. And the notice is
 * packages/catalog/capabilities.json's, rendered rather than written. */

export type Integration = 'Apple Health' | 'Health Connect' | 'Thuso Kit';

/* An instrument's `measures` are identifiers — "systolic", "ecg" — and two of the eight are not
   observations the assessment collects at all, so they have no label to borrow. They are named here
   rather than printed raw, because "Measures ecg" is a database column shown to a patient.
   The rest take the qualifying half of their own label: a cuff's cell reading "blood pressure —
   systolic, blood pressure — diastolic, pulse" is four wrapped lines saying "blood pressure" twice
   in a column three words wide. */
const unnamedMeasures: Record<string, string> = { weight: 'weight', ecg: 'a single-lead trace' };
const measureName = (id: string) => {
 if (unnamedMeasures[id]) return unnamedMeasures[id];
 const label = measureSpec(id as MeasureId).label.toLowerCase();
 return label.includes(' — ') ? label.split(' — ')[1] : label;
};

const integrations: Record<Integration, { platform: string; sheet: string; withdraw: string; icon: typeof Smartphone }> = {
 'Apple Health': {
  platform: 'iPhone',
  sheet: 'iOS asks you, on your own phone, one reading type at a time. MyThuso never sees the question and never sees a type you decline.',
  withdraw: 'Health → Sharing → Apps, on your phone. Withdrawing it stops new readings; it does not remove what is already on your record.',
  icon: Smartphone
 },
 'Health Connect': {
  platform: 'Android',
  sheet: 'Health Connect asks you, on your own phone, one reading type at a time. MyThuso never sees the question and never sees a type you decline.',
  withdraw: 'Health Connect → App permissions, on your phone. Withdrawing it stops new readings; it does not remove what is already on your record.',
  icon: Smartphone
 },
 'Thuso Kit': {
  platform: 'the instruments a nurse brings',
  sheet: 'The kit is paired at a visit, by the nurse, in front of you. Nothing pairs itself and nothing pairs while you are not there.',
  withdraw: 'Ask the nurse to unpair it, or unpair it from this screen once the kit is connected. An unpaired instrument sends nothing.',
  icon: Bluetooth
 }
};

export function DevicePermission({ integration, navigate }: { integration: Integration; navigate: (page: string) => void }) {
 const spec = integrations[integration];
 const device = provenanceById('device');
 /* Apple Health and Health Connect are the wearables capability, and the kit is the devices one: each screen
    renders the notice of the capability it depends on, and what blocks that one. */
 const notice = integration === 'Thuso Kit' ? 'devices' : 'wearables';
 const blocking = capability(notice).blockedBy;
 const Icon = spec.icon;
 return <div className="form-stack">
  {/* One notice, from the contract, above everything. It is the first thing on the screen because
      the decision the screen is asking about has not got a subject yet. */}
  <NotConnected of={notice}/>
  <div className="booking-summary">
   <span className="service-icon"><Icon size={23}/></span>
   <div><h3>{integration}</h3><p>Readings from {spec.platform}</p></div>
   <Pill tone="amber">Not connected</Pill>
  </div>

  {/* A table rather than seven rows each carrying the same tick in the same sage tile. The units and
      the ranges line up in columns a reader can run an eye down, which is what somebody checking
      whether a permission covers the one reading they care about is actually doing. */}
  <SectionTitle title="What would be read"/>
  <div className="panel">
   <p className="helper">Every reading type MyThuso would ask {integration} for, and nothing else. It asks for these because they are what a visit records; a category it has nowhere to file is a category it does not request.</p>
   <div className="table-scroll">
    <table className="chart-table fact-table">
     <caption className="visually-hidden">The reading types this permission would cover.</caption>
     <thead><tr><th scope="col">Reading</th><th scope="col">Recorded in</th><th scope="col">Judged against</th></tr></thead>
     <tbody>{readableMeasures.map(id => <tr key={id}>
      <th scope="row">{measureSpec(id).label}</th><td>{measureSpec(id).unit}</td><td>{rangeText(id)}</td>
     </tr>)}</tbody>
    </table>
   </div>
  </div>
  <p className="helper"><Check size={14}/>{spec.sheet}</p>

  {/* The half of a permission screen that is usually missing. A list of what an app will read tells
      a person nothing without the list of what it will not, and the second list is the one that
      matters to somebody deciding whether to hand over a phone's health store. */}
  <SectionTitle title="What would never be read"/>
  <div className="panel"><dl className="stated">
   <div><dt>Anything in a protected category</dt><dd>{neverRead.join(', ')}.</dd>
    <small>These are released by you, entry by entry, and a permission sheet cannot hand one over on your behalf.</small></div>
   <div><dt>Where you are, who you message, and what else is on the phone</dt>
    <dd>MyThuso asks for reading types and nothing else.</dd>
    <small>A permission it does not need is a permission it does not ask for.</small></div>
   <div><dt>Anything going the other way</dt><dd>Nothing on your MyThuso record is written back to {integration}.</dd>
    <small>Readings would come in. Your record would not go out to a store you did not choose to put it in.</small></div>
  </dl></div>

  <SectionTitle title="How a reading from a device is filed"/>
  <div className="panel"><dl className="stated">
   <div><dt>{device.name}</dt><dd>{device.detail}</dd></div>
   <div><dt>Its trust, written down beside it</dt><dd>{device.trust}</dd></div>
  </dl></div>
  {integration === 'Thuso Kit' && <>
   <SectionTitle title="The instruments in the kit"/>
   <div className="panel">
    <p className="helper">What a nurse carries, what each instrument measures, and how often it has to be calibrated. An instrument out of calibration still produces a reading; what it stops producing is one anybody should act on without saying so.</p>
    <div className="table-scroll">
     <table className="chart-table fact-table">
      <caption className="visually-hidden">The instruments in the Thuso Kit and their calibration intervals.</caption>
      <thead><tr><th scope="col">Instrument</th><th scope="col">Measures</th><th scope="col">Calibrated</th></tr></thead>
      <tbody>{kitInstruments.map(instrument => <tr key={instrument.id}>
       <th scope="row">{instrument.name}</th>
       <td>{instrument.measures.map(measureName).join(', ')}</td>
       <td>Every {instrument.calibrateEveryMonths} months</td>
      </tr>)}</tbody>
     </table>
    </div>
   </div>
  </>}

  {integration !== 'Thuso Kit' && <Suspense fallback={null}><WearableLinkRequest integration={integration} notice={false}/></Suspense>}

  <SectionTitle title="Turning it off again"/>
  <p className="muted">{spec.withdraw}</p>

  {/* Why it cannot be switched on today, in the contract's own words rather than in a paraphrase.
      There is no Connect button here, disabled or otherwise: a greyed-out primary is the biggest
      thing on a screen promising the one thing the screen has just said it cannot do. What is
      offered instead is the thing that does work — a nurse who brings the instruments herself. */}
  <div className="privacy-note"><LockKeyhole size={19}/>{blocking.join(' ')} Until that changes there is nothing to connect to, so there is no button here pretending otherwise.</div>
  <button className="primary full" onClick={() => navigate('Book a nurse')}>Book a visit — the nurse brings the instruments<ArrowRight size={17}/></button>
  <button className="secondary full" onClick={() => navigate('Health Passport')}>Back to your Health Passport<ArrowRight size={17}/></button>
 </div>;
}

/* ---- What a reading means ---------------------------------------------------------------------
 *
 * The passport has drawn seven reference ranges since it was written and has never said what one of
 * them measures. "136 mmHg, 90–140" answers whether a number is inside the lines. It does not answer
 * the question the person actually opened the screen with, and the question they actually opened the
 * screen with gets asked of a search engine instead — which will diagnose them, confidently, in
 * about four seconds.
 *
 * So it is answered here, in writing, by a person, with the provenance of the writing on the screen
 * rather than in a policy. This is where `screening` will eventually live. It is worth saying that
 * the written version is not a placeholder for the model: it is the thing the model will have to be
 * better than, and unlike the model it can be read in full by a clinician before it ships.
 *
 * Three things hold the line. Each entry says what a reading outside the range *may* follow from,
 * beginning with the ordinary reasons, because the ordinary reasons are usually the right ones.
 * "What you can do" is never a change to a medicine. And every entry carries the red flags from
 * packages/catalog/sos.json by id, with the door to the emergency pathway on the row — a screen that
 * explains blood pressure to somebody having a stroke is a screen that has done harm.
 *
 * The rows are collapsed by default and only one is open at a time. Seven of these expanded is two
 * thousand words, and a person came here about one reading. */

const flagWord = (flag: ReturnType<typeof flagFor>) =>
 flag === 'normal' ? 'inside the range' : flag === 'high' ? 'above the range' : flag === 'low' ? 'below the range' : 'not measured';

export function ReadingsExplained({ navigate, open }: { navigate: (page: string) => void; open: (modal: string) => void }) {
 const measures = measuredIn(latestSet);
 const inside = measures.filter(id => flagFor(id, latestSet.values[id]!) === 'normal').length;
 return <>
  <PatientHeader icon={BookOpen} eyebrow="Health Passport" title="What your readings mean." back={{ label: 'Back to Health Passport', go: () => navigate('Health Passport') }}
   lead="What each measurement is, what a number outside its range may follow from, and who decides what any of it means for you."/>
  <NotConnected of="screening"/>

  {/* The lead is a count and not a verdict. "All inside range" is a fact about seven numbers on one
      day; it is not "you are well", and the sentence under it says so before anything else does. */}
  <section className="panel glass lead rise-2">
   <div className="lead-head"><div><h2>Your last visit</h2><p>{longDateOf(dateOf(latestSet.dayOffset))}</p></div>
    <Pill tone={inside === measures.length ? 'teal' : 'amber'}>{inside === measures.length ? 'All inside range' : `${measures.length - inside} outside range`}</Pill></div>
   <Metrics>
    <Metric value={String(inside)} unit={`of ${measures.length}`} label="Readings inside their range" chip="On the day they were taken"/>
   </Metrics>
   <p className="helper"><ShieldCheck size={14}/>{provenance.whoDecides}</p>
  </section>

  <SectionTitle title="Choose a reading"/>
  <ExplainList open={open}/>

  {/* Provenance, and it is on the screen rather than in a policy. A reader deciding how much weight
      to give four paragraphs about their own blood pressure is owed this before the paragraphs. */}
  <SectionTitle title="Where these words come from"/>
  <div className="panel"><dl className="stated">
   <div><dt>Written down, not generated</dt><dd>{provenance.written}</dd></div>
   <div><dt>No clinician has reviewed this wording</dt><dd>{provenance.unreviewed}</dd></div>
   <div><dt>The ranges are the nurse’s own</dt><dd>{provenance.ranges}</dd></div>
   <div><dt>Nothing here changes a medicine</dt><dd>{provenance.neverChange}</dd></div>
  </dl></div>
  <div className="privacy-note"><LockKeyhole size={19}/>{capability('screening').blockedBy.join(' ')}</div>

  <button className="primary full" onClick={() => navigate('Health trends')}>See how your readings have changed<ArrowRight size={17}/></button>
  <button className="secondary full" onClick={() => navigate('Health Passport')}>Back to your Health Passport<ArrowRight size={17}/></button>
 </>;
}

/* The explanations, one open at a time, each with its red flags and the door to Thuso SOS. Drawn by the
   readings screen and by the Passport's Results tab, which is where "what does this result mean" is asked. */
function ExplainList({ open }: { open: (modal: string) => void }) {
 const [shown, setShown] = useState<MeasureId | null>(null);
 return <div className="panel explain-list">
   {explanations.map(explanation => {
    const id = explanation.id;
    const spec = measureSpec(id);
    const value = latestSet.values[id];
    const flag = value === undefined ? undefined : flagFor(id, value);
    const isOpen = shown === id;
    /* No tile on these rows. Seven identical sage squares — two of them the same heart, for the two
       halves of one blood-pressure reading — is a colour that has stopped carrying information, and
       the space it took is where the one thing on the row that does mean something now sits: where
       the last reading fell against its own range, as a word rather than as a tint. */
    return <div className={`explain-item${isOpen ? ' open' : ''}`} key={id}>
     <button className="record-row explain-row" aria-expanded={isOpen} onClick={() => setShown(isOpen ? null : id)}>
      <span><strong>{spec.label}</strong>
       <small>{rangeText(id)}{value === undefined ? '' : ` · your last was ${formatValue(id, value)} ${spec.unit}`}</small></span>
      {flag && <Pill tone={flag === 'normal' ? '' : 'amber'}>{flagWord(flag)}</Pill>}
      <ChevronDown size={18} className="explain-chevron"/>
     </button>
     {isOpen && <div className="explain-body">
      <dl className="stated">
       <div><dt>What it measures</dt><dd>{explanation.measures}</dd></div>
       <div><dt>A reading above the range</dt><dd>{explanation.above}</dd></div>
       <div><dt>A reading below the range</dt><dd>{explanation.below}</dd></div>
       <div><dt>What you can do</dt><dd>{explanation.whatToDo}</dd></div>
      </dl>
      {/* The red flags, from the emergency contract by id. This screen can never invent a ninth or
          soften one of the eight, and it is the only thing on the page with a door out of it. */}
      <div className="privacy-note alert explain-urgent">
       <TriangleAlert size={19}/>
       <div>
        <p>Not this screen: {urgentConditions(explanation).map(c => c.name.toLowerCase()).join(', ')}. Any of those is an emergency and needs an ambulance rather than a reading.</p>
        <button className="text-button" onClick={() => open('Emergency & urgent care')}><Ambulance size={15}/>Open Thuso SOS</button>
       </div>
      </div>
     </div>}
    </div>;
   })}
  </div>;
}

/* ---- The care timeline, the care team and the certificate --------------------------------------
 *
 * Three rows in docs/FLOW-COMPLETENESS.md, and one shape of defect behind all three: the passport
 * showed a person that something existed and had nowhere to send them when they pressed it. Each of
 * the three timeline entries, the Doctors row and two of the three documents fell through to the
 * catch-all roadmap dialog — "X is included in the MyThuso feature roadmap" — which is a sentence
 * about the product answering a question about the reader's own record.
 *
 * None of the three claims a capability. What each of them does is show what the record actually
 * holds, which for a preview built out of four sets of readings and one doctor's review is more
 * than a roadmap paragraph and considerably less than a health record. Both halves are said. */

/* Everything the record holds about this account, newest first, as events rather than as a list of
   visits: a nurse recording readings and a doctor reviewing them are two acts on two days by two
   people, and a timeline that merges them into "visit" loses the only thing a timeline is for. */
type TimelineEvent = {
 dayOffset: number;
 kind: 'readings' | 'review' | 'document' | 'medicine';
 title: string;
 by: string;
 /** The reading set this event opens, when it opens one. */
 set?: typeof readingSets[number];
};

/* The medicines are the dispensing contract's, on the days it gives: the chronic authorisation and the
   prescription written against it, both by the doctor it names. The Medicines chip used to say "No active
   prescriptions are recorded in this preview" beside a Medications tab that said the same thing and a
   prescription screen counting the repeats left on one — three accounts of one patient's medicines. There
   is one now, and it is dispensing.json's. */
const prescriber = subjectById(authorisation.reviewedBy);
const prescribedBy = prescriber ? `${prescriber.name} · ${prescriber.reference}` : authorisation.reviewedBy;
const timeline = (): TimelineEvent[] => {
 const events: TimelineEvent[] = readingSets.map(set => ({
  dayOffset: set.dayOffset, kind: 'readings' as const,
  title: 'Nurse home visit', by: `${assignedNurse.name} · ${assignedNurse.role}`, set
 }));
 events.push({ dayOffset: lastReview.reviewedDayOffset, kind: 'review', title: 'Doctor review completed', by: reviewedBy });
 for (const doc of passportDocuments) events.push({ dayOffset: doc.dayOffset, kind: 'document', title: `${doc.name} issued`, by: reviewedBy });
 events.push({ dayOffset: authorisation.authorisedByDays, kind: 'medicine', title: `${authorisation.programme} authorisation ${authorisation.reference}`, by: prescribedBy });
 events.push({ dayOffset: prescription.issuedInDays, kind: 'medicine', title: `Prescription ${prescription.reference} issued`, by: prescribedBy });
 return events.sort((a, b) => b.dayOffset - a.dayOffset);
};
const kindIcon = { readings: Stethoscope, review: FileCheck, document: FileText, medicine: PillIcon } as const;
const filters: [string, TimelineEvent['kind'] | null][] = [['All entries', null], ['Visits', 'readings'], ['Reviews', 'review'], ['Documents', 'document'], ['Medicines', 'medicine']];

/* The care timeline as the export draws it: a rail down the left, a date against each node and a card beside
   it, arriving in the shell's three-step stagger (motion.css's .m-stagger, gated on reduced motion there).
   The node's icon says what kind of act it was; the words on the card say it too, so the icon is never the
   only difference. Each card still opens on what the act produced, in place — the readings as a table, the
   doctor's words, the document, the medicine — because a rail that only lists is a rail with nowhere to go. */
function TimelineRail({ navigate, open }: { navigate: (page: string) => void; open: (modal: string) => void }) {
 const [shown, setShown] = useState<string | null>(null);
 const [filter, setFilter] = useState('All entries');
 const [period, setPeriod] = useState('All time');
 const events = timeline();
 const kind = filters.find(([label]) => label === filter)?.[1] ?? null;
 const visible = events.filter(event => (kind === null || event.kind === kind) && (period === 'All time' || event.dayOffset >= -Number(period)));
 return <>
  <div className="care-timeline-tools">
   <div className="hp-chips" role="group" aria-label="Timeline entry types">{filters.map(([label]) => <Button key={label} size="sm" variant={filter === label ? 'primary' : 'secondary'} aria-pressed={filter === label} onClick={() => { setFilter(label); setShown(null); }}>{label}</Button>)}</div>
   <label>Time period<select value={period} onChange={e=>{setPeriod(e.target.value);setShown(null);}}><option value="All time">All time</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></label>
  </div>
  <p className="helper" role="status">{visible.length} {visible.length===1?'entry':'entries'} shown · Newest first</p>
  {!visible.length && <EmptyState title="No entries in this view" body="Try a different entry type or widen the time period." action="Show all entries" onAction={()=>{setFilter('All entries');setPeriod('All time');}}/>}
  <ol key={`${filter}-${period}`} className="hp-rail care-timeline m-stagger">{visible.map(event => {
   const key = `${event.kind}-${event.dayOffset}-${event.title}`;
   const isOpen = shown === key;
   const measures = event.set ? measuredIn(event.set) : [];
   const outside = measures.filter(id => flagFor(id, event.set!.values[id]!) !== 'normal');
   const doc = passportDocuments.find(d => `${d.name} issued` === event.title);
   const Icon = kindIcon[event.kind];
   const [day, month] = shortDateOf(dateOf(event.dayOffset)).split(' ');
   return <li className="hp-rail__item" key={key}>
    <time className="hp-rail__date" dateTime={dateOf(event.dayOffset)}><strong>{day}</strong><span>{month}</span></time>
    <span className="hp-rail__node" aria-hidden="true"><Icon size={18}/></span>
    <div className={`hp-rail__card explain-item${isOpen ? ' open' : ''}`}>
    <button className="record-row explain-row" aria-expanded={isOpen} onClick={() => setShown(isOpen ? null : key)}>
     <span><strong>{event.title}</strong>
      <small><time dateTime={dateOf(event.dayOffset)}>{longDateOf(dateOf(event.dayOffset))}</time> · {event.by}</small>
      <small className="timeline-status">{event.kind==='review'?'Review completed':event.kind==='medicine'?`${repeatsRemaining} of ${authorisation.repeatsAuthorised} repeats left`:event.kind==='document'?(doc?.reviewed?'Doctor reviewed':'Awaiting review'):event.dayOffset===latestSet.dayOffset?'Doctor review available':'No doctor review recorded'}</small></span>
     {event.kind === 'readings' && <Pill tone={outside.length ? 'amber' : ''}>{outside.length ? `${outside.length} outside range` : `${measures.length} readings`}</Pill>}
     <ChevronDown size={17} className="explain-chevron"/>
    </button>
    {isOpen && <div className="explain-body">
     {event.kind === 'readings' && event.set && <>
      {/* The readings themselves, against their own ranges. This is what "open a visit on the
          timeline" was always asking for, and it is a table rather than a paragraph because seven
          numbers with seven ranges is a table. */}
      <div className="table-scroll"><table className="chart-table fact-table">
       <caption className="visually-hidden">Readings taken on {longDateOf(dateOf(event.dayOffset))}, each against its indicative reference range.</caption>
       <thead><tr><th scope="col">Reading</th><th scope="col">Value</th><th scope="col">Indicative range</th><th scope="col">Where it fell</th></tr></thead>
       <tbody>{measures.map(id => <tr key={id}>
        <th scope="row">{measureSpec(id).label}</th>
        <td>{formatValue(id, event.set!.values[id]!)} {measureSpec(id).unit}</td>
        <td>{rangeText(id)}</td>
        <td>{flagWord(flagFor(id, event.set!.values[id]!))}</td>
       </tr>)}</tbody>
      </table></div>
      {event.set.note && <p className="helper">Recorded at the visit: {event.set.note}.</p>}
      {event.dayOffset === latestSet.dayOffset
       ? <button className="secondary full" onClick={() => open('Visit summary')}>Open the visit this came from<ArrowRight size={16}/></button>
       /* Said rather than left as an absent button. Three of the four visits in this record are
          readings and nothing else — no summary was written and no doctor reviewed them — and a
          screen that quietly offers a door on one row and not on another has told the reader the
          record is inconsistent rather than that it is short. */
       : <p className="helper"><ShieldCheck size={14}/>No visit summary was written for this one. The readings above are the whole of what the record holds about that day.</p>}
     </>}
     {event.kind === 'review' && <>
      <dl className="stated">
       <div><dt>What the doctor found</dt><dd>{lastReview.assessment}</dd></div>
       <div><dt>What to do</dt><dd>{lastReview.plan}</dd></div>
       <div><dt>What happens next</dt><dd>{lastReview.next}</dd></div>
      </dl>
      <button className="secondary full" onClick={() => navigate('Your care team')}>Who has reviewed your record<ArrowRight size={16}/></button>
     </>}
     {event.kind === 'document' && doc && <>
      <p className="muted">{doc.kind}, issued out of the visit on {longDateOf(dateOf(event.dayOffset))} and {doc.reviewed ? 'reviewed by a registered doctor' : 'awaiting review'}.</p>
      <button className="secondary full" onClick={() => open(doc.opens ?? doc.name)}>Open the {doc.name.toLowerCase()}<ArrowRight size={16}/></button>
     </>}
     {event.kind === 'medicine' && <>
      <p className="muted">{authorisation.note}</p>
      {event.title.startsWith('Prescription')
       ? <button className="secondary full" onClick={() => open(`Prescription ${prescription.reference}`)}>See how a prescription reads<ArrowRight size={16}/></button>
       : <button className="secondary full" onClick={() => navigate('What happens to a prescription')}>What happens after a doctor signs one<ArrowRight size={16}/></button>}
     </>}
    </div>}
    </div>
   </li>;
  })}</ol>
 </>;
}

export function CareTimeline({ navigate, open }: { navigate: (page: string) => void; open: (modal: string) => void }) {
 return <>
  <PatientHeader icon={History} eyebrow="Health Passport" title="Everything on your record." back={{ label: 'Back to Health Passport', go: () => navigate('Health Passport') }}
   lead={`${timeline().length} entries over ${Math.round(Math.abs(Math.min(readingSets[0].dayOffset, authorisation.authorisedByDays)) / 30)} months. Each one opens on what it produced, and says who made it.`}/>
  <NotConnected of="clinical-records"/>
  <TimelineRail navigate={navigate} open={open}/>
  <button className="secondary full" onClick={() => navigate('Health Passport')}>Back to your Health Passport<ArrowRight size={17}/></button>
 </>;
}

/* ---- Who has been in the record ---------------------------------------------------------------- */

/* The record contract has a type for this and the screen is drawn from it rather than from a list of
   names: `care-team` is "everyone currently authorised for this patient, and since when", gated on
   view-clinical-record. Two people are in it, they are the two the rest of the app already names,
   and both carry the registration the vetting register holds them to. */
export function CareTeam({ navigate, open }: { navigate: (page: string) => void; open: (modal: string) => void }) {
 const contract = recordById('care-team')!;
 const nurse = subjectsByRole('nurse').find(n => n.name === assignedNurse.name);
 const team = [
  { name: reviewer.name, reference: reviewer.registration, role: 'Reviewing doctor',
    did: `Reviewed the readings from ${longDateOf(dateOf(latestSet.dayOffset))} and wrote what to do next.`,
    sees: 'The clinical record for the case in front of them, and results.' },
  { name: assignedNurse.name, reference: nurse?.reference ?? '', role: assignedNurse.role,
    did: `Took the readings at the visit on ${longDateOf(dateOf(latestSet.dayOffset))}, in ${assignedNurse.area}.`,
    sees: 'The summary and record for the visit she is attending, and only while she is attending it.' }
 ];
 return <>
  <PatientHeader icon={Users} eyebrow="Health Passport" title="Who has been in your record." back={{ label: 'Back to Health Passport', go: () => navigate('Health Passport') }} lead={contract.summary}/>
  <NotConnected of="clinical-records"/>

  <div className="care-team-grid">{team.map(person => <ClinicianProfile key={person.name} name={person.name} role={person.role} reference={person.reference} detail={person.did} access={person.sees} subject={subjectsByRole(person.name===reviewer.name?'doctor':'nurse').find(subject=>subject.name===person.name)}/>)}</div>
  <p className="helper">The reviewing doctor may decide that a home visit is appropriate. This care-team list does not book a doctor visit or change who is assigned to your nurse appointment.</p>

  {/* The limit, and it is the whole point of the screen. A care team is not a standing grant, and
      the three sentences that say so are the vetting contract's own refusals rather than this
      screen's paraphrase of them. */}
  <SectionTitle title="What being on this list does not mean"/>
  <div className="panel"><dl className="stated">
   <div><dt>It is not a key to the record</dt><dd>{refusalFor('nurse', 'view-clinical-record')}</dd></div>
   <div><dt>A protected category is yours to release</dt><dd>{refusalFor('doctor', 'view-protected-record')}</dd></div>
   <div><dt>A registration that lapses closes the record</dt><dd>{refusalFor('doctor', 'view-clinical-record')}</dd></div>
  </dl></div>

  {/* The true continuation: this screen says who is authorised, and the access log says who actually
      opened it — including the two who were refused. */}
  <button className="primary full" onClick={() => open('Access history')}>See who has actually opened it<ArrowRight size={17}/></button>
  <button className="secondary full" onClick={() => navigate('Health Passport')}>Back to your Health Passport<ArrowRight size={17}/></button>
 </>;
}

/* ---- The certificate ---------------------------------------------------------------------------
   The one document in the passport with nothing behind it anywhere: records.json holds a type for a
   consultation, a prescription, a referral and a laboratory report, and none for a certificate. So
   this screen does not draw one. It says what a certificate is for, who may sign it, and where the
   visit that would produce it sits in the catalogue — which is the honest whole of what MyThuso can
   say about a document it has never issued. */
export function MedicalCertificate({ navigate }: { navigate: (page: string) => void }) {
 const doc = passportDocuments.find(d => d.name === 'Medical certificate')!;
 const sickNote = services.find(s => s.name.startsWith('Sick-note'));
 return <div className="form-stack">
  <NotConnected of="clinical-records"/>
  <p className="muted">A certificate says that a named person was seen on a named day by a named clinician, and was or was not fit to work. It is the shortest document in healthcare and the one most often asked for by somebody who is not the patient.</p>
  <dl className="stated">
   <div><dt>What it would carry</dt><dd>The days it covers, the visit it came out of, and the issuing doctor’s name and registration — {reviewedBy}, on the visit of {longDateOf(dateOf(doc.dayOffset))}.</dd></div>
   <div><dt>Who may sign one</dt><dd>A doctor, under a current registration. {refusalFor('doctor', 'write-clinical-note')}</dd></div>
   <div><dt>What it does not say</dt><dd>Why. Whoever asked for it is owed the days and the signature; what was wrong with you is between you and the clinician, and MyThuso does not print a diagnosis on a document written for somebody else’s desk.</dd></div>
   <div><dt>What this preview holds</dt><dd>Nothing. There is no certificate here to open, download or hand to anybody, and no clinician has issued one. The row you pressed is a document type the passport is designed to hold, not a document it has.</dd></div>
  </dl>
  {sickNote && <button className="primary full" onClick={() => navigate('Book a nurse')}>A {sickNote.name.toLowerCase()} is in the catalogue, from {money(sickNote.price)}<ArrowRight size={16}/></button>}
 </div>;
}

/* ---- What happens to a prescription ------------------------------------------------------------
   The medications tab's second control opened the roadmap dialog for the Thuso Pharmacy module — a
   paragraph about a phase, in answer to "what happens after the doctor signs it". Every sentence
   this screen needs was already in packages/catalog/dispensing.json, written for the pharmacist's
   side of the same counter: the five steps of a handover, the rule that a patient is told before
   they accept, the refusal that stops a silent substitution, and the arithmetic that boxes a
   chronic authorisation by a date and by a count at the same time. It is the same contract read
   from the side of the person the medicine is for. */
/* The patient's medicines, as the dispensing contract holds them: one chronic authorisation and the
   prescription written on it. Drawn by the prescription's journey, the Passport's Medications tab and the
   Prescriptions page alike, so the three cannot give three accounts of one patient's medicines again. */
export function AuthorisationLead() {
 const answer = collectionAnswer();
 return <section className="panel glass lead rise-2">
   <div className="lead-head"><div><h2>{authorisation.programme}</h2><p>{authorisation.reference} · authorised {formatDay(authorisedOn)}</p></div>
    <Pill tone={answer.allowed ? 'teal' : 'amber'}>{answer.allowed ? 'Due now' : 'Not due yet'}</Pill></div>
   {/* One figure, not three. A repeat count is a number and belongs in the big thin numeral the
       design language reserves for one; a date set at 40px reads as a display figure rather than as
       a day in November, and two of them beside each other read as a comparison nobody is making.
       The dates are the two facts under it, in the same shape as every other pair of facts. */}
   <Metrics>
    <Metric value={String(repeatsRemaining)} unit={`of ${authorisation.repeatsAuthorised}`} label="Repeats left on it" chip={isFinalRepeat ? 'Last one' : 'Authorised'}/>
   </Metrics>
   <div className="review-line"><span>The next may be collected</span><strong>{answer.allowed ? 'Today' : formatDay(nextCollectionOn)}</strong></div>
   <div className="review-line"><span>The authorisation ends</span><strong>{formatDay(expiresOn)}</strong></div>
   <div className="review-line"><span>Which of the two runs out first</span><strong>{binds === 'date' ? 'The date' : 'The repeats'}</strong></div>
   <p className="helper">{answer.reason}</p>
  </section>;
}

export function PrescriptionJourney({ navigate, open }: { navigate: (page: string) => void; open: (modal: string) => void }) {
 return <>
  <PatientHeader icon={PillIcon} eyebrow="Health Passport" title="What happens to a prescription." back={{ label: 'Back to Health Passport', go: () => navigate('Health Passport') }}
   lead="Once a doctor signs one, five things happen before anything is in your hand — and you may stop it at the fourth."/>
  <NotConnected of="dispensing"/>

  {/* The export's Prescriptions: Current, Past and Requests as peer views. Current leads with the
      arithmetic, because on a chronic medicine the question is never "how does this work" — it is "when
      may I fetch the next one, and when does this stop" — and both answers are worked out from the
      authorisation rather than written beside it. Past and Requests are true empty states: the record
      holds one authorisation and it has not ended, and a repeat is never asked for from here, in the
      dispensing contract's own words. No "Request a new prescription", no refill button and no delivery
      banner — prescribing is refused and dispensing is not connected. */}
  <PrescriptionTabs open={open}/>

  <SectionTitle title="The five things that happen at the counter"/>
  <ol className="timeline">{handover.map(step => <li key={step.id} className="done">
   <span className="timeline-dot"><Check size={12}/></span>
   <div><strong>{step.label}</strong><small>{step.detail}</small></div>
  </li>)}</ol>

  {/* The two the patient is the subject of, quoted rather than summarised. */}
  <SectionTitle title="What you are told, and what you may refuse"/>
  <div className="panel"><dl className="stated">
   <div><dt>{ruleById('patient-is-told-first').title}</dt><dd>{ruleById('patient-is-told-first').sentence}</dd></div>
   <div><dt>Nothing is swapped quietly</dt><dd>{refusalById('silent-substitution').sentence}</dd></div>
   <div><dt>And nobody works around your doctor</dt><dd>{refusalById('override-do-not-substitute').sentence}</dd></div>
  </dl></div>

  <SectionTitle title="Why it stops rather than continues"/>
  <div className="panel"><dl className="stated">
   <div><dt>{ruleById('authorisation-is-boxed').title}</dt><dd>{ruleById('authorisation-is-boxed').sentence}</dd></div>
   <div><dt>{ruleById('ends-in-a-review').title}</dt><dd>{ruleById('ends-in-a-review').sentence}</dd></div>
   <div><dt>{ruleById('early-is-refused-with-a-date').title}</dt><dd>{ruleById('early-is-refused-with-a-date').sentence}</dd></div>
  </dl>
  <p className="helper"><ShieldCheck size={14}/>{authorisation.endsWith}</p></div>

  {/* Who collects a dispensed bag is the patient's to say. The dialog is named by the capability, and its words and
      rules arrive with it on a dynamic import rather than on this page. */}
  <div className="hp-actions rx-page-actions">
   <Button variant="secondary" trailingIcon={<ArrowRight aria-hidden="true"/>} onClick={() => open('medicine-collection')}>{capability('medicine-collection').name}</Button>
   <Button variant="ghost" trailingIcon={<ArrowRight aria-hidden="true"/>} onClick={() => navigate('Health Passport')}>Back to your Health Passport</Button>
  </div>
 </>;
}

type PrescriptionTab = 'Current' | 'Past' | 'Requests';
const prescriptionTabs: PrescriptionTab[] = ['Current', 'Past', 'Requests'];
function PrescriptionTabs({ open }: { open: (modal: string) => void }) {
 const [tab, setTab] = useState<PrescriptionTab>('Current');
 return <div className="rx-tabs">
  <TabsList className="hp-tabs" aria-label="Prescriptions">{prescriptionTabs.map(t => <Tab key={t} id={`rx-tab-${t}`} aria-controls="rx-panel" active={tab === t} onClick={() => setTab(t)}>{t}</Tab>)}</TabsList>
  <div key={tab} id="rx-panel" role="tabpanel" aria-labelledby={`rx-tab-${tab}`} tabIndex={0} className="hp-panel m-stagger">
   {tab === 'Current' ? <>
    <AuthorisationLead/>
    <PrescriptionItems open={open}/>
   </> : tab === 'Past'
    ? <EmptyState title="Nothing has ended yet" body={ruleById('ends-in-a-review').sentence}/>
    : <EmptyState title="No requests are made from here" body={refusalById('software-renewal').sentence}/>}
  </div>
 </div>;
}

/* ---- The Health Passport's home, in tabs ---------------------------------------------------------
 *
 * The export's "My Health": a welcome, then Overview, Vitals, Results, Medications, History and Goals as
 * peer views of one record, and a seventh — Records — for the documents, the sharing and the devices the
 * Passport already had and the export draws on a page of its own. Passport (Pages.tsx) owns the tab bar
 * and the choice; this draws the one panel, re-keyed on the tab so it arrives in the shell's three-step
 * stagger each time it is chosen.
 *
 * WHAT THE EXPORT DRAWS AND THIS DOES NOT. Weight and BMI (the record holds no such measure), a progress bar
 * under every figure, "Within your range", "Improving", a 30-day average and 7D/30D/6M chips over four
 * readings in three months, invented result rows marked "Normal", today's medicines with Taken and Take now,
 * and goals with targets and "On track". Every figure here is counted from rows on the screen or read from
 * passport.json or dispensing.json, and the Goals tab says, in wellbeing.json's own words, why it is empty. */
export type PassportTab = 'Overview' | 'Vitals' | 'Results' | 'Medications' | 'History' | 'Goals' | 'Records';
type PanelProps = {
 tab: PassportTab;
 go: (tab: PassportTab) => void;
 navigate: (page: string) => void;
 open: (modal: string) => void;
 panelId: string;
 labelledBy: string;
 next?: VisitRow;
 view?: (id: string) => void;
 manage?: (id: string, action: VisitAction) => void;
};

export function HealthPanel({ tab, panelId, labelledBy, ...rest }: PanelProps) {
 return <div key={tab} id={panelId} role="tabpanel" aria-labelledby={labelledBy} tabIndex={0} className="hp-panel m-stagger">
  {tab === 'Overview' ? <HealthOverview tab={tab} {...rest}/>
   : tab === 'Vitals' ? <HealthVitals {...rest}/>
    : tab === 'Results' ? <HealthResults {...rest}/>
     : tab === 'Medications' ? <HealthMedications {...rest}/>
      : tab === 'History' ? <TimelineRail navigate={rest.navigate} open={rest.open}/>
       : tab === 'Goals' ? <HealthGoals {...rest}/>
        : <HealthRecords {...rest}/>}
 </div>;
}

type Rest = Omit<PanelProps, 'tab' | 'panelId' | 'labelledBy'>;
const flagChip = (flag: ReturnType<typeof flagFor>) => flag === 'normal' ? 'In range' : flag === 'high' ? 'Above range' : 'Below range';

function CardHead({ title, lead, aside }: { title: string; lead?: string; aside?: ReactNode }) {
 return <div className="hp-card__head"><div><h2 className="hp-title">{title}</h2>{lead && <p className="hp-lead">{lead}</p>}</div>{aside}</div>;
}

function HealthOverview({ go, navigate, next, view, manage }: Rest & { tab: PassportTab }) {
 const measures = measuredIn(latestSet).filter(id => headlineMeasures.includes(id));
 const outside = measures.filter(id => flagFor(id, latestSet.values[id]!) !== 'normal');
 return <>
  {/* The four figures the trends screen leads with, from the last visit's readings. The word under each is
      where it fell against its own indicative range — a fact about one number on one day, never a verdict. */}
  <Card className="hp-card" padding="md">
   <CardHead title="Your latest readings" lead={`Taken at your home visit on ${longDateOf(dateOf(latestSet.dayOffset))}. Sample readings.`}
    aside={<Badge variant={outside.length ? 'warning' : 'success'} dot>{outside.length ? `${outside.length} outside range` : 'All inside range'}</Badge>}/>
   <ul className="hp-stats">{measures.map(id => {
    const flag = flagFor(id, latestSet.values[id]!);
    const Icon = measureIcon[id] ?? Activity;
    return <li className="hp-stat" key={id}>
     <span className="hp-stat__head"><span className="hp-tile"><Icon size={18} aria-hidden="true"/></span><Badge size="sm" variant={flag === 'normal' ? 'success' : 'warning'}>{flagChip(flag)}</Badge></span>
     <strong className="hp-stat__value">{formatValue(id, latestSet.values[id]!)}<small> {measureSpec(id).unit}</small></strong>
     <span className="hp-stat__label">{measureSpec(id).label}</span>
    </li>;
   })}</ul>
  </Card>
  <NextVisitCard next={next} view={view} manage={manage} navigate={navigate}/>
  <div className="hp-jumps">
   <Button variant="secondary" leadingIcon={<HeartPulse aria-hidden="true"/>} onClick={() => go('Vitals')}>Review your vitals</Button>
   <Button variant="secondary" leadingIcon={<FileText aria-hidden="true"/>} onClick={() => go('Results')}>Open your results</Button>
   <Button variant="secondary" leadingIcon={<History aria-hidden="true"/>} onClick={() => go('History')}>See your care history</Button>
  </div>
 </>;
}

/* The export's dark appointment card, drawn from the visit the person booked: who is coming (the roster's
   initials, never a photograph of somebody who does not exist), what and where, and the day as a date block.
   No clinic, no room and no "Join online" — a home visit has none of them. */
function NextVisitCard({ next, view, manage, navigate }: Pick<Rest, 'next' | 'view' | 'manage' | 'navigate'>) {
 if (!next) return <Card className="hp-card hp-next-empty" padding="md">
  <span className="hp-tile"><CalendarClock size={18} aria-hidden="true"/></span>
  <div><h2 className="hp-title">{schedulingLabels.noUpcoming}</h2><p className="hp-lead">{schedulingLabels.noUpcomingDetail}</p></div>
  <Button variant="secondary" trailingIcon={<ArrowRight aria-hidden="true"/>} onClick={() => navigate('Book a nurse')}>Book a nurse</Button>
 </Card>;
 const v = next.visit;
 const nurse = nurseOfVisit(v);
 const [day, month] = v.date ? shortDateOf(v.date).split(' ') : [];
 return <section className="hp-next" aria-labelledby="hp-next-title">
  <span className="hp-next__who" aria-hidden="true">{nurse.initials}</span>
  <div className="hp-next__body">
   <p className="hp-next__eyebrow">Your next visit</p>
   <h2 id="hp-next-title">{nurse.name}</h2>
   <p>{nurse.role} · Sample assignment</p>
   <ul>
    <li><Stethoscope size={16} aria-hidden="true"/>{v.service.name}</li>
    <li><MapPin size={16} aria-hidden="true"/>{v.address} · {v.person}</li>
   </ul>
  </div>
  <div className="hp-next__when">
   {v.date && v.start ? <>
    <p className="hp-next__date"><span>{weekdayOf(v.date)}</span><strong>{day}</strong><span>{month}</span></p>
    <p className="hp-next__time"><Clock3 size={16} aria-hidden="true"/>{v.start} – {visitEnds(v)}</p>
    <small>{v.service.duration} minutes</small>
   </> : <p className="hp-next__time"><Clock3 size={16} aria-hidden="true"/>{schedulingLabels.asapPending}</p>}
   {view && <Button variant="secondary" trailingIcon={<ArrowRight aria-hidden="true"/>} onClick={() => view(next.id)}>View this visit</Button>}
   {manage && <Button variant="ghost" className="hp-next__ghost" onClick={() => manage(next.id, 'reschedule')}>Reschedule</Button>}
  </div>
 </section>;
}

/* The export's vitals: the charts and a row of facts under them. Its "30-day average" and "Trend: Improving"
   are not here — four readings over three months have no thirty-day average, and "improving" is an
   interpretation passport.json refuses in its own words, which the panel prints instead. */
function HealthVitals({ navigate }: Rest) {
 const pressure = `${formatValue('systolic', latestSet.values.systolic!)}/${formatValue('diastolic', latestSet.values.diastolic!)}`;
 return <Card className="hp-card" padding="md">
  <CardHead title="Vitals" lead={`${readingSets.length} home visits on record, the last on ${longDateOf(dateOf(latestSet.dayOffset))}. Each reading is drawn against its indicative range.`}/>
  <div className="chart-grid">{headlineMeasures.map(id => {
   const spec = measureSpec(id);
   const Icon = measureIcon[id] ?? Activity;
   return <ClinicalChart key={id} title={spec.label} unit={spec.unit} normal={[spec.range[0], spec.range[1]]}
    icon={<Icon size={16}/>} format={n => formatValue(id, n)} readings={seriesFor(id)}/>;
  })}</div>
  <dl className="hp-facts">
   <div><dt>Latest blood pressure</dt><dd>{pressure} <small>{measureSpec('systolic').unit}</small></dd></div>
   <div><dt>Visits with readings</dt><dd>{readingSets.length}</dd></div>
   <div><dt>Last taken</dt><dd>{longDateOf(dateOf(latestSet.dayOffset))}</dd></div>
  </dl>
  <p className="helper"><ShieldCheck size={14}/>{passportRefusal('no-interpretation').sentence}</p>
  <div className="hp-actions">
   <Button variant="secondary" trailingIcon={<ArrowRight aria-hidden="true"/>} onClick={() => navigate('Health trends')}>Every reading, as charts and tables</Button>
   <Button variant="ghost" trailingIcon={<ArrowRight aria-hidden="true"/>} onClick={() => navigate('What readings mean')}>What these readings mean</Button>
  </div>
 </Card>;
}

/* Results reach the record as documents — a laboratory's report, with who issued it and whether a registered
   doctor has reviewed it — so that is what this lists, not a row per test marked "Normal". A document whose
   kind names a report is a result; the rest (the visit summary, the certificate) are under Records. */
const isResult = (kind: string) => /report/i.test(kind);
function HealthResults({ open }: Rest) {
 const results = passportDocuments.filter(doc => isResult(doc.kind));
 const glucose = measureSpec('glucose');
 return <>
  <div className="hp-split">
  <Card className="hp-card" padding="md">
   <CardHead title="Your results" lead="Every result says who issued it, when, and whether a registered doctor has reviewed it."/>
   {results.length ? <ul className="hp-rows">{results.map(doc => <li key={doc.name}>
    <button className="hp-row" onClick={() => open(doc.opens ?? doc.name)}>
     <span className="hp-tile"><FileText size={18} aria-hidden="true"/></span>
     <span className="hp-row__text"><strong>{doc.name}</strong><small>{doc.kind} · issued {longDateOf(dateOf(doc.dayOffset))}</small></span>
     <Badge size="sm" variant={doc.reviewed ? 'primary' : 'warning'}>{doc.reviewed ? 'Doctor reviewed' : 'Awaiting review'}</Badge>
     <ChevronRight size={17} aria-hidden="true"/>
    </button></li>)}</ul>
    : <EmptyState title="No results on your record" body="A result appears here once a laboratory has reported it, with who reviewed it."/>}
  </Card>
  <ClinicalChart title={glucose.label} unit={glucose.unit} normal={[glucose.range[0], glucose.range[1]]} icon={<Droplets size={16}/>}
   format={n => formatValue('glucose', n)} readings={seriesFor('glucose')}/>
  </div>
  <SectionTitle title="What a reading means"/>
  <ExplainList open={open}/>
  <p className="helper"><ShieldCheck size={14}/>{provenance.whoDecides}</p>
 </>;
}

/* What the dispensing contract holds, and nothing a person could take for an adherence record: no "Taken",
   no "Take now", no refill button. The next collection is a date worked out from the authorisation. */
function HealthMedications({ navigate, open }: Rest) {
 return <>
  <AuthorisationLead/>
  <PrescriptionItems open={open} navigate={navigate}/>
 </>;
}

/* The prescription written on the authorisation, as the doctor wrote it. The Medications tab offers the way
   to the prescription's journey; the journey's own Current tab is already there, so it does not. */
function PrescriptionItems({ open, navigate }: { open: (modal: string) => void; navigate?: (page: string) => void }) {
 return <Card className="hp-card" padding="md">
  <CardHead title={`Prescription ${prescription.reference}`} lead={`Issued ${formatDay(prescription.issued)} by ${prescribedBy}. ${prescription.items.length} medicines, as the doctor wrote them.`}/>
  <ul className="hp-rows">{prescription.items.map(item => <li key={item.id} className="hp-row hp-row--static">
   <span className="hp-tile"><PillIcon size={18} aria-hidden="true"/></span>
   <span className="hp-row__text"><strong>{item.molecule} {item.strength}</strong><small>{item.dose} · {item.quantity}</small></span>
  </li>)}</ul>
  <p className="helper"><ShieldCheck size={14}/>{wellbeingRefusal('no-medicine-advice')}</p>
  <div className="hp-actions">
   <Button variant="secondary" trailingIcon={<ArrowRight aria-hidden="true"/>} onClick={() => open(`Prescription ${prescription.reference}`)}>See how a prescription reads</Button>
   {navigate && <Button variant="ghost" trailingIcon={<ArrowRight aria-hidden="true"/>} onClick={() => navigate('What happens to a prescription')}>What happens after a doctor signs one</Button>}
  </div>
 </Card>;
}

/* The export's goals are targets with progress bars and "On track". wellbeing.json refuses both, so the tab
   is the refusal, in the contract's words, and a door to where ongoing care is actually arranged. */
function HealthGoals({ navigate }: Rest) {
 return <>
  <EmptyState title="No goals are set for you here" body={wellbeingRefusal('no-target')} action="Open Care plans" onAction={() => navigate('Care plans')}/>
  <p className="helper"><Target size={14}/>{wellbeingRefusal('no-cheerfulness-about-illness')}</p>
 </>;
}

/* The sample export writes the last visit's readings out of passport.json. It typed "118/78" beside a
   record whose last blood pressure was a different number, which is two copies of one reading. */
const exportSample = () => {
 const set = latestSet.values;
 const blob = new Blob([JSON.stringify({ demo: true, patient: 'Lerato Molefe', readings: [{ day: dateOf(latestSet.dayOffset), bloodPressure: `${formatValue('systolic', set.systolic!)}/${formatValue('diastolic', set.diastolic!)}`, heartRate: set.pulse, glucose: set.glucose }], notice: 'Fictional data. Not a medical record.' }, null, 2)], { type: 'application/json' });
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url; a.download = 'mythuso-demo-passport.json'; a.click();
 setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/* What the Passport was before it had tabs, kept whole: the documents, the doors that share or protect the
   record, and the three device sheets under the permission nobody has given. */
function HealthRecords({ navigate, open }: Rest) {
 const shortcuts: [string, string, typeof Share2, () => void][] = [
  ['Share record', 'Let a verified professional see a limited summary, for a period you set.', Share2, () => open('Share my passport')],
  ['Share links', 'A link that rides on a grant you made, and ends when it does or sooner.', Share2, () => navigate('Share part of your record')],
  ['Your emergency card', 'Allergies and medicines on a card you can show or print. A preview.', ShieldCheck, () => navigate('Your emergency card')],
  ['Who opened your record', 'Every access, allowed or refused, with the reason.', History, () => navigate('Who opened your record')],
  ['Claims to your medical scheme', 'What was claimed, and whether anything was sent.', FileText, () => navigate('Claims to your medical scheme')],
  ['Export sample passport', 'Downloads a JSON copy to your device. Nothing is sent anywhere.', Download, exportSample],
  ['Doctors', 'The clinicians who have reviewed what is on your record.', Users, () => navigate('Your care team')],
  ['What these readings mean', 'What each measurement is, what a number outside its range may follow from, and who decides.', BookOpen, () => navigate('What readings mean')]
 ];
 return <>
  <SectionTitle title="Your documents"/>
  <div className="panel document-list">{passportDocuments.map(doc => <button className="record-row" key={doc.name} onClick={() => open(doc.opens ?? doc.name)}><span className="service-icon"><FileText size={20}/></span><span><strong>{doc.name}</strong><small>{doc.kind} · issued {longDateOf(dateOf(doc.dayOffset))}</small></span><Pill>{doc.reviewed ? 'Doctor reviewed' : 'Awaiting review'}</Pill><ChevronRight size={17}/></button>)}</div>
  <p className="helper"><ShieldCheck size={14}/>Every document says who issued it, when, and whether a registered doctor has reviewed it. A document with no review status is not a reviewed document.</p>
  <SectionTitle title="Your record"/>
  <div className="shortcut-list">{shortcuts.map(([title, detail, Icon, act]) =>
   <button className="shortcut-row" key={title} onClick={act}><span className="service-icon"><Icon size={20}/></span><span className="shortcut-text"><strong>{title}</strong><small>{detail}</small></span><ChevronRight size={17}/></button>)}</div>
  {/* The one state on the patient side that is true rather than staged: nothing in this build has asked this
      device for Health Connect or Apple Health, so the permission genuinely has not been granted. The three
      sheets that say what each would read sit under the block rather than behind a button that grants nothing. */}
  <SectionTitle title="Connected devices"/>
  <NotConnected of="devices"/>
  <div className="state-block denied" role="status">
   <span className="state-icon"><LockKeyhole size={24}/></span>
   <div><h3>We need your permission first</h3><p>MyThuso cannot show readings from your connected devices until you allow Apple Health or Health Connect access. You can change your mind at any time, and declining never blocks a visit. Nothing below has been asked for yet.</p></div>
  </div>
  <div className="catalog-grid">{(['Apple Health', 'Health Connect', 'Thuso Kit'] as const).map(t => <div className="panel module-card" key={t}><span className="tile-icon"><Bluetooth size={20}/></span><h3>{t}</h3><p>Choose exactly which readings you share, and stop sharing them without losing what is already on your record.</p><Button variant="secondary" className="full" trailingIcon={<ArrowRight aria-hidden="true"/>} onClick={() => open(`${t} connection`)}>What this would read</Button></div>)}</div>
 </>;
}
