import { useState } from 'react';
import { Activity, Ambulance, ArrowRight, Bluetooth, Check, ChevronDown, Droplets, Heart, LockKeyhole, ShieldCheck, Smartphone, Thermometer, TriangleAlert, Wind } from 'lucide-react';
import { Pill, SectionTitle } from '../components/UI';
import { NotConnected } from '../components/NotConnected';
import { ClinicalChart } from '../components/Chart';
import { Metric, Metrics } from '../surface/Surface';
import { longDateOf } from '../lib/scheduling';
import { provenanceById } from '../lib/capture';
import { capability } from '../lib/capabilities';
import {
 dateOf, flagFor, formatValue, headlineMeasures, kitInstruments, latestSet, measureSpec, measuredIn,
 neverRead, otherMeasures, rangeText, readableMeasures, readingSets, seriesFor, type MeasureId
} from '../lib/passport';
import { explanations, provenance, urgentConditions } from '../lib/explain';

/* Two screens the Health Passport offered and could not open.
 *
 * "See all" beside the trend charts went to the catch-all dialog, and the three device cards under
 * More each went to a paragraph about the roadmap. Both are screens now, and neither of them can be
 * mistaken for a working integration: the trends screen renders the record contract's own notice
 * and the device screens render the device contract's, word for word, above everything else. */

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
  <div className="page-intro"><div className="eyebrow">Health Passport</div><h1>How your readings have changed.</h1>
   <p>{readingSets.length} home visits over the last {Math.round(Math.abs(readingSets[0].dayOffset) / 30)} months. Every reading is judged against an indicative reference range, which is a guide and not a diagnosis.</p></div>
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
 const blocking = capability('devices').blockedBy;
 const Icon = spec.icon;
 return <div className="form-stack">
  {/* One notice, from the contract, above everything. It is the first thing on the screen because
      the decision the screen is asking about has not got a subject yet. */}
  <NotConnected of="devices"/>
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
 const [shown, setShown] = useState<MeasureId | null>(null);
 const measures = measuredIn(latestSet);
 const inside = measures.filter(id => flagFor(id, latestSet.values[id]!) === 'normal').length;
 return <>
  <div className="page-intro"><div className="eyebrow">Health Passport</div><h1>What your readings mean.</h1>
   <p>What each measurement is, what a number outside its range may follow from, and who decides what any of it means for you.</p></div>
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
  <div className="panel explain-list">
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
  </div>

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
