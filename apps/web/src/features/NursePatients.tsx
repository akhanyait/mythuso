import { useState } from 'react';
import { CalendarClock, CalendarDays, ClipboardCheck, House, ShieldAlert, Users, Video } from 'lucide-react';
import { Badge, Button, Card, Tab, TabsList } from '../ui';
import { useThusoIQ } from '../lib/thusoiq';
import { thusoiq, type Appointment, type State } from '../../../../packages/thusoiq/index.ts';
import '../surface/nurse-identity.css';

/* The nurse's patients and appointments, in the Lovable export's arrangement, over the ThusoIQ sandbox.
 *
 * The export's patient screen has photographs, risk badges, a vitals grid and a blood-pressure trend, and
 * its appointments list has room numbers and conditions. None of those exists for these three fictional
 * people. What does is the sandbox's own state — who is on the care queue, whose consent is outstanding,
 * which visits are booked and which encounters are signed — so the tiles count that, the "next care
 * action" is the sandbox's own soonest unfinished visit, and the appointments list is the sandbox's
 * appointments filtered by day. Every row is under the workbench's "Fictional sandbox" standing, which
 * this screen repeats rather than assumes. */

const visitStates = thusoiq.appointments.states;
const visitModes = thusoiq.appointments.modes;
const terminal = (id: string) => visitStates.find(s => s.id === id)?.terminal ?? false;
const stateName = (id: string) => visitStates.find(s => s.id === id)?.name ?? id;
const modeName = (id: string) => visitModes.find(m => m.id === id)?.name ?? id;
const clockOf = (value: string) => new Date(value).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
const dayOf = (value: string) => new Date(value).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** The soonest visit on the queue that has not finished, which is what "next" can honestly mean here. */
export const nextVisit = (state: State): Appointment | undefined =>
 [...state.appointments].filter(a => !terminal(a.status)).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0];

/* Four counted tiles and the next care action, above the care queue.
   The visits tile counts the sandbox's appointments for every clinician, the doctor's included, and is
   named for that. It sits on her Schedule beside the deck's "Today's visits" and the day tiles' "Visits
   today", which count her own day from a different list; a third tile under the same words would
   disagree with them by the evening, and a reader would be right to believe whichever came first. */
export function NursePatientsSummary({ state, onChoose }: { state: State; onChoose: (patientId: string) => void }) {
 const today = dayKey(new Date());
 const consentOutstanding = state.patients.filter(p => !p.consent).length;
 const visitsToday = state.appointments.filter(a => dayKey(new Date(a.startsAt)) === today).length;
 const signed = state.consultations.filter(c => c.status === 'signed').length;
 const next = nextVisit(state);
 const who = next && state.patients.find(p => p.id === next.patientId);
 const tiles = [
  { icon: Users, value: state.patients.length, label: 'On the care queue', note: 'Fictional sandbox patients' },
  { icon: ShieldAlert, value: consentOutstanding, label: 'Consent outstanding', note: consentOutstanding ? 'Nothing is recorded for them until it is given' : 'Every patient has given it' },
  { icon: CalendarDays, value: visitsToday, label: 'Sandbox visits today', note: 'Every clinician’s, booked on the sandbox for today' },
  { icon: ClipboardCheck, value: signed, label: 'Encounters signed', note: 'Signed by a doctor, and locked' }
 ];
 return <div className="nurse-patients nurse-ui">
  <div className="nurse-tiles">{tiles.map(({ icon: Icon, value, label, note }) =>
   <div className="nurse-tile" key={label}>
    <span className="nurse-tile__icon" aria-hidden="true"><Icon/></span>
    <span className="nurse-tile__value">{value}</span>
    <span className="nurse-tile__label">{label}</span>
    <span className="nurse-tile__note">{note}</span>
   </div>)}</div>
  {next && who ? <Card padding="md" className="nurse-next-action">
   <p className="nurse-eyebrow">Next care action</p>
   <p className="nurse-next-action__what">{clockOf(next.startsAt)} · {modeName(next.mode)} · {who.name}</p>
   <p className="nurse-next-action__why">{stateName(next.status)} · {who.reason}</p>
   <Button variant="secondary" size="sm" onClick={() => onChoose(who.id)}>Open {who.name.split(' ')[0]}&rsquo;s record</Button>
  </Card> : <Card padding="md" className="nurse-next-action">
   <p className="nurse-eyebrow">Next care action</p>
   <p className="nurse-next-action__why">Every visit on the queue has finished. A follow-up arranged on a record is the next one.</p>
  </Card>}
 </div>;
}

type Range = 'Today' | 'Tomorrow' | 'This week';
const inRange = (range: Range, value: string) => {
 const start = new Date(); start.setHours(0, 0, 0, 0);
 const at = new Date(value).getTime();
 const day = 86_400_000;
 if (range === 'Today') return at >= start.getTime() && at < start.getTime() + day;
 if (range === 'Tomorrow') return at >= start.getTime() + day && at < start.getTime() + 2 * day;
 return at >= start.getTime() && at < start.getTime() + 7 * day;
};

/* Every visit on the care queue, by day, in time order — the export's appointments list. Check in is the
   sandbox's own transition, the same one the workbench's visit row offers, and the kernel may refuse it. */
export function NurseAppointments() {
 const { state, execute } = useThusoIQ();
 const [range, setRange] = useState<Range>('Today');
 const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
 const rows = [...state.appointments].filter(a => inRange(range, a.startsAt)).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
 const checkIn = (a: Appointment) => {
  try { execute({ type: 'appointment.transition', patientId: a.patientId, appointmentId: a.id, status: 'arrived' }); setSaid({ ok: true, text: 'Patient checked in, in the sandbox.' }); }
  catch (e) { setSaid({ ok: false, text: e instanceof Error ? e.message : 'This check-in could not be recorded.' }); }
 };
 return <div className="nurse-appointments nurse-ui">
  <div className="nurse-appointments__head">
   <p className="nurse-route__lead">The visits on the care queue, in time order. <Badge variant="neutral" dot>Fictional sandbox</Badge></p>
   <TabsList aria-label="Which days">
    {(['Today', 'Tomorrow', 'This week'] as const).map(r => <Tab key={r} active={range === r} aria-controls="nurse-appointments-list" onClick={() => { setRange(r); setSaid(null); }}>{r}</Tab>)}
   </TabsList>
  </div>
  <Card padding="md" id="nurse-appointments-list" role="tabpanel" aria-label={range}>
   {rows.length ? <ol className="nurse-appointments__list">{rows.map(a => {
    const who = state.patients.find(p => p.id === a.patientId);
    const Icon = a.mode === 'video' ? Video : House;
    return <li key={a.id}>
     <span className="nurse-appointments__time"><strong>{clockOf(a.startsAt)}</strong><small>{range === 'This week' ? dayOf(a.startsAt) : `${a.minutes} min`}</small></span>
     <span className="nurse-tile__icon" aria-hidden="true"><Icon/></span>
     <span className="nurse-appointments__who"><strong>{who?.name ?? a.patientId}</strong><small>{modeName(a.mode)} · {a.clinicianId} · {a.id}</small></span>
     {a.status === 'scheduled'
      ? <Button variant="primary" size="sm" onClick={() => checkIn(a)}>Check in</Button>
      : <Badge variant={terminal(a.status) ? 'neutral' : 'success'} size="sm">{stateName(a.status)}</Badge>}
    </li>;
   })}</ol>
    : <div className="nurse-safety-page__empty"><CalendarClock aria-hidden="true"/><p><strong>Nothing is booked {range === 'Tomorrow' ? 'for tomorrow' : range === 'Today' ? 'for today' : 'this week'}.</strong> A follow-up arranged on a patient&rsquo;s record in the workbench is the first thing that will appear here.</p></div>}
   {said && <p className={`nurse-appointments__said${said.ok ? '' : ' is-refused'}`} role={said.ok ? 'status' : 'alert'}>{said.text}</p>}
  </Card>
  <p className="helper">These patients belong to a separate, in-memory workflow sandbox. No clinical service is delivered here, and there are no rooms: a visit is at home or by video.</p>
 </div>;
}
