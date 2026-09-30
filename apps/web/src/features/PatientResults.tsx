import { useState } from 'react';
import { ArrowRight, BookOpen, Droplets, FileText } from 'lucide-react';
import { ClinicalChart } from '../components/Chart';
import { NotConnected } from '../components/NotConnected';
import { Badge, Button, Card, Tab, TabsList } from '../ui';
import { MyThusoResultsIcon } from '../ui/icons/MyThusoIcons.generated';
import { dateOf, documents, formatValue, measureSpec, seriesFor } from '../lib/passport';
import { explanations, labelFor, provenance } from '../lib/explain';
import { observationsNote } from '../lib/observations';
import { longDateOf } from '../lib/scheduling';
import { PatientHeader } from './PatientHeader';

/* Test results — the export's page (patient-space.tsx, TestResults), composed out of what the Health
 * Passport already holds.
 *
 * The export draws a results inbox: five tests with dates, a green "Normal" beside each and a "View", then
 * GilbertOne offering to explain them, then a blood-sugar curve. The inbox is the part that is refused. A
 * result reaches a patient in this product through the Passport, as a document a doctor has reviewed, and
 * never as a row with a value and a verdict on it — "Normal" is an interpretation, and a list of values with
 * no clinician's words beside them is a raw results inbox by another name. The laboratory capability is
 * absent, and its notice says so above the list.
 *
 * So the three tabs are three things that exist. Latest is the Passport's own documents, each with whether
 * a doctor has reviewed it, opening the document itself. Trends is the blood-glucose chart the Passport draws
 * from the same four visits, with the range it is judged against and the sentence that says the range is
 * indicative. Explanations is the written account of what each reading measures, from the contract a person
 * wrote and no clinician has reviewed yet — which it says. The GilbertOne row opens the assistant and says in
 * advance what it will not do. */

type TabId = 'latest' | 'trends' | 'explanations';
const tabs: [TabId, string][] = [['latest', 'Latest'], ['trends', 'Trends'], ['explanations', 'Explanations']];

const askAssistant = () => window.dispatchEvent(new CustomEvent('mythuso:ask-assistant'));

export function PatientResults({ navigate, open }: { navigate: (page: string) => void; open: (modal: string) => void }) {
 const [tab, setTab] = useState<TabId>('latest');
 const glucose = measureSpec('glucose');
 return <div className="ps-screen">
  <PatientHeader icon={<MyThusoResultsIcon width={22} height={22}/>} eyebrow="Health Passport" title="Test results"
   lead="Results reach you through your Health Passport, as documents a doctor has reviewed. This page gathers them with the trend and what each reading measures; it never lists a value on its own."
   back={{ label: 'Back to your Health Passport', go: () => navigate('Health Passport') }}/>
  <NotConnected of="laboratory-results"/>

  <Card padding="md" className="ps-panel">
   <TabsList aria-label="Test results" className="ps-tabs">
    {tabs.map(([id, label]) => <Tab key={id} id={`results-tab-${id}`} aria-controls={`results-panel-${id}`} active={tab === id} onClick={() => setTab(id)}>{label}</Tab>)}
   </TabsList>

   <div role="tabpanel" id={`results-panel-${tab}`} aria-labelledby={`results-tab-${tab}`} className="ps-tabpanel" key={tab}>
    {tab === 'latest' && <>
     <ul className="ps-rows">
      {documents.map(doc => <li className="ps-row" key={doc.name}>
       <span className="ps-tile" aria-hidden="true"><FileText size={20} strokeWidth={1.8}/></span>
       <div className="ps-row-text">
        <strong>{doc.name}</strong>
        <small>{doc.kind} · issued <time dateTime={dateOf(doc.dayOffset)}>{longDateOf(dateOf(doc.dayOffset))}</time></small>
       </div>
       <Badge variant={doc.reviewed ? 'neutral' : 'warning'} size="sm">{doc.reviewed ? 'Doctor reviewed' : 'Awaiting review'}</Badge>
       <Button variant="secondary" size="sm" onClick={() => open(doc.opens ?? doc.name)} aria-label={`Open the ${doc.name.toLowerCase()}`} trailingIcon={<ArrowRight size={16}/>}>Open</Button>
      </li>)}
     </ul>
     <p className="ps-note">A result is released to you by the clinician who reviewed it, inside the document. It is not shown here as a number with a word beside it, because what a number means for you is theirs to say.</p>
    </>}

    {tab === 'trends' && <>
     <ClinicalChart title={glucose.label} unit={glucose.unit} normal={[glucose.range[0], glucose.range[1]]}
      icon={<Droplets size={16}/>} format={n => formatValue('glucose', n)} readings={seriesFor('glucose')}/>
     <p className="ps-note">{observationsNote}</p>
     <Button variant="secondary" className="ps-wrap ps-start" onClick={() => navigate('Health trends')} trailingIcon={<ArrowRight size={16}/>}>See every reading over time</Button>
    </>}

    {tab === 'explanations' && <>
     <NotConnected of="screening" tone="inline"/>
     <dl className="ps-explained">
      {explanations.map(explanation => <div key={explanation.id}>
       <dt>{labelFor(explanation.id)}</dt>
       <dd>{explanation.measures}</dd>
      </div>)}
     </dl>
     <p className="ps-note">{provenance.unreviewed}</p>
     <Button variant="secondary" className="ps-wrap ps-start" onClick={() => navigate('What readings mean')} trailingIcon={<ArrowRight size={16}/>}>What a reading outside its range may follow from</Button>
    </>}
   </div>
  </Card>

  {/* The export's GilbertOne banner, without its figure: the orb in the corner is his face, and it is the
      thing this row opens. What he will not do is said before anybody asks. */}
  <div className="ps-banner">
   <span className="ps-tile" aria-hidden="true"><BookOpen size={20} strokeWidth={1.8}/></span>
   <div><strong>Need help understanding a result?</strong><p>GilbertOne can say what a measurement is, in plain language, from the same written explanations. He will not tell you what yours means for you — that is your nurse’s or your doctor’s to say.</p></div>
   <Button variant="primary" className="ps-wrap" onClick={askAssistant}>Ask GilbertOne</Button>
  </div>
 </div>;
}
