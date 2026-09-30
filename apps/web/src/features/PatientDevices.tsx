import { Activity, ArrowRight, Bluetooth, Droplets, Heart, Scale, Smartphone, Thermometer, Wind, type LucideIcon } from 'lucide-react';
import { NotConnected } from '../components/NotConnected';
import { Badge, Button, Card } from '../ui';
import { capability } from '../lib/capabilities';
import { deviceIntegrations, kitInstruments } from '../lib/passport';
import { observations } from '../lib/observations';
import devices from '../../../../packages/catalog/devices.json';
import { PatientHeader } from './PatientHeader';

/* Connected devices — the export's page (patient-space.tsx, ConnectedDevices), drawn over what is true.
 *
 * The export's page is a header with "Pair new device", three live figures — devices online, last sync,
 * needs attention — and a grid of devices, each with a photograph, a status pill, its latest reading, a
 * battery meter, when it last synced and "Sync now". Every one of those facts is about a device that has
 * been paired to this account and is sending readings. None has: the devices capability is simulated and
 * the wearables capability is absent, and both say so in their own words at the top of this page.
 *
 * So the arrangement is kept and the claims are not. The grid holds the six instruments packages/catalog/
 * capture.json says a nurse carries, with what each measures, how it connects and how often it is
 * calibrated — the true facts about a device nobody has paired — and the two phone stores devices.json
 * names. Every status is the contract's own word for a device that has never sent anything. The three
 * figures are the one count that can be checked against the rows under it, and two written states.
 *
 * WHAT IT WILL NOT DO. No battery, no latest reading, no sync time, no "Pair" and no "Sync now": a control
 * for a connection that does not exist teaches people the connection exists. The one thing a person can do
 * about a phone store is ask for it to be linked, and that request lives on the permission sheet each card
 * opens, where it has always lived — it is not copied here, so there is one request and one set of words. */

const neverSynced = devices.health.states.find(state => state.id === 'never-synced')!.label;
const kitSheet = deviceIntegrations.find(d => d.id === 'thuso-kit')!;
const sheetFor = (id: string) => deviceIntegrations.find(d => d.id === id);

/* An instrument's measures are identifiers. The ones the assessment collects have a label in records.json;
   the two it does not (a weight and a single-lead trace) are left to the instrument's own name rather than
   given a label invented here. Two halves of one reading share the front of their label ("Blood pressure —
   systolic", "— diastolic"), so they are said once: a column that reads "blood pressure" twice in three
   words is a column nobody reads. */
const labelled = (ids: readonly string[]) => {
 const labels = ids.map(id => observations.find(o => o.id === id)?.label).filter((label): label is string => !!label);
 const said: string[] = [];
 for (const label of labels) {
  const [whole, part] = label.split(' — ');
  const earlier = part ? said.findIndex(s => s.startsWith(`${whole} — `)) : -1;
  if (earlier >= 0) said[earlier] = `${said[earlier]} and ${part}`;
  else said.push(label);
 }
 return said;
};

const iconFor: Record<string, LucideIcon> = {
 'bp-cuff': Heart, 'pulse-oximeter': Wind, thermometer: Thermometer, glucometer: Droplets, scale: Scale, ecg: Activity,
};

export function PatientDevices({ navigate, open }: { navigate: (page: string) => void; open: (modal: string) => void }) {
 const kitBlocked = capability('devices').blockedBy[0];
 const platforms = devices.wearableLinks.platforms;
 return <div className="ps-screen">
  <PatientHeader icon={<Bluetooth size={22} strokeWidth={1.8}/>} eyebrow="Health Passport" title="Connected devices"
   lead="The instruments a nurse brings to your visit and the phone stores you could link, with what each one measures. None of them is connected to you."
   back={{ label: 'Back to your Health Passport', go: () => navigate('Health Passport') }}/>
  <NotConnected of="devices"/>

  {/* Three figures, and only the first is a number: it is the count of the rows in the grid below, so
      anybody can check it by counting. The other two are what is true about a device that has never been
      paired — said in words, because a zero reads as a fault and a dash reads as a reading still coming. */}
  <div className="ps-stats" role="list">
   <div className="ps-stat" role="listitem">
    <span className="ps-stat-label">In the Thuso Kit</span>
    <strong className="ps-stat-value">{kitInstruments.length}<small> instruments</small></strong>
    <span className="ps-stat-foot">Each one is listed below.</span>
   </div>
   <div className="ps-stat" role="listitem">
    <span className="ps-stat-label">Paired to your record</span>
    <strong className="ps-stat-value">None</strong>
    <span className="ps-stat-foot">{kitBlocked}</span>
   </div>
   <div className="ps-stat" role="listitem">
    <span className="ps-stat-label">Last synced</span>
    <strong className="ps-stat-value">{neverSynced}</strong>
    <span className="ps-stat-foot">Nothing has been read from any device for this account.</span>
   </div>
  </div>

  <Card padding="md" className="ps-panel">
   <div className="ps-panel-head">
    <div><h2>The Thuso Kit</h2><p>{kitSheet.sheet}</p></div>
    <Button variant="secondary" size="sm" className="ps-wrap" onClick={() => open('Thuso Kit connection')} trailingIcon={<ArrowRight size={16}/>}>What the kit would read</Button>
   </div>
   <ul className="ps-device-grid">
    {kitInstruments.map(instrument => {
     const Icon = iconFor[instrument.id] ?? Bluetooth;
     const measures = labelled(instrument.measures);
     return <li className="ps-device" key={instrument.id}>
      <div className="ps-device-top">
       <span className="ps-tile" aria-hidden="true"><Icon size={20} strokeWidth={1.8}/></span>
       <div className="ps-device-name"><h3>{instrument.name}</h3><p>{instrument.transport}</p></div>
       <Badge variant="neutral" size="sm">{neverSynced}</Badge>
      </div>
      <dl className="ps-facts">
       {measures.length > 0 && <div><dt>Measures</dt><dd>{measures.join(', ')}</dd></div>}
       <div><dt>Calibrated</dt><dd>Every {instrument.calibrateEveryMonths} months</dd></div>
      </dl>
      <p className="ps-device-note">{instrument.note}</p>
     </li>;
    })}
   </ul>
  </Card>

  <Card padding="md" className="ps-panel">
   <div className="ps-panel-head">
    <div><h2>Your phone’s health store</h2><p>{devices.wearableLinks.why}</p></div>
   </div>
   <NotConnected of="wearables" tone="inline"/>
   <ul className="ps-device-grid">
    {platforms.map(platform => <li className="ps-device" key={platform.id}>
     <div className="ps-device-top">
      <span className="ps-tile" aria-hidden="true"><Smartphone size={20} strokeWidth={1.8}/></span>
      <div className="ps-device-name"><h3>{platform.name}</h3><p>{platform.phone}</p></div>
      <Badge variant="neutral" size="sm">Not connected</Badge>
     </div>
     {sheetFor(platform.id) && <p className="ps-device-note">{sheetFor(platform.id)!.sheet}</p>}
     <Button variant="secondary" size="sm" className="ps-wrap ps-device-action" onClick={() => open(`${platform.name} connection`)} trailingIcon={<ArrowRight size={16}/>}>What {platform.name} would share</Button>
    </li>)}
   </ul>
  </Card>

  {/* The export's closing banner pointed at a page of batteries. The thing that does work is a visit: a
      nurse brings the instruments, and the readings are taken in front of the person they are about. */}
  <div className="ps-banner">
   <span className="ps-tile" aria-hidden="true"><Bluetooth size={20} strokeWidth={1.8}/></span>
   <div><strong>The nurse brings the instruments.</strong><p>Book a visit and the nurse takes the readings in front of you, with the instrument each one came from written beside it.</p></div>
   <Button variant="primary" size="md" className="ps-wrap" onClick={() => navigate('Book a nurse')} trailingIcon={<ArrowRight size={16}/>}>Book a visit</Button>
  </div>
 </div>;
}
