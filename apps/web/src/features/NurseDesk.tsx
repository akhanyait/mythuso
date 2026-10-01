import { useState } from 'react';
import { BookOpen, CalendarCheck, ClipboardList, FileText, IdCard, ListChecks, Search, Undo2 } from 'lucide-react';
import { NotConnected } from '../components/NotConnected';
import { Badge, Button, Card, Tab, TabsList } from '../ui';
import { currentWeek, lineKindById, weeks } from '../lib/earnings';
import { WeekBars } from './NurseWeekBars';
import { libraryTabs, screens, searchLibrary, type LibraryEntry } from '../lib/patient-pages';
import { whoIs } from '../lib/roles';
import protocolsContract from '../../../../packages/catalog/protocols.json' with { type: 'json' };
import { useVisitQueue } from './VisitQueue';
import { nurseDayStops } from './Workspaces';
import '../surface/nurse-identity.css';

/* Three of the export's nurse pages that the live workspace did not have — Reports, Clinical resources and
 * Settings — each drawn from what the product already holds, in the export's arrangement.
 *
 * WHAT THEY WILL NOT DRAW, and each is on the export's page:
 *   - Reports: "142 patients seen", "98% vitals recorded", "36 vaccinations", a 4.8 satisfaction score and
 *     two export buttons. None of those is recorded anywhere. What is recorded is the earnings register's
 *     lines and today's schedule, so every figure is counted off one of those, and there is no export.
 *   - Resources: guidelines with authorities and years, leaflets to download, a referral form. The
 *     protocols this product names are all drafts — twelve with no content and one preview pathway that
 *     cites a contract section — and the only published reading is
 *     the knowledge base the patient's Health library already reads — so that is what is listed, each
 *     under its own contract's words, and "Forms" says there are none.
 *   - Settings: a form that edits her name, registration and email and a "Settings saved (demo)". Her
 *     details are the vetting register's, and the notifications they would govern are not sent. So it is a
 *     card that reads, under the notices that say why. */

/* ---- Reports ---------------------------------------------------------------------------------------- */

export function NurseReports() {
 const stops = nurseDayStops(useVisitQueue());
 const signed = stops.filter(stop => stop.signed).length;
 const onRegister = weeks.reduce((sum, week) => sum + week.visits, 0);
 const reversed = weeks.flatMap(week => week.lines).filter(line => line.kind === 'reversal').length;
 /* Four figures, each one the arithmetic of a list a reader can open: the schedule, or the register's
    lines on Earnings & payouts. */
 const tiles = [
  { icon: CalendarCheck, value: `${signed} of ${stops.length}`, label: 'Signed off today', note: 'Counted from today’s schedule' },
  { icon: ClipboardList, value: String(currentWeek.visits), label: 'Visits this week', note: 'This week’s register lines, so far' },
  { icon: ListChecks, value: String(onRegister), label: 'Visits on the register', note: `Across its ${weeks.length} weeks` },
  { icon: Undo2, value: String(reversed), label: `${lineKindById('reversal').name} lines`, note: lineKindById('reversal').detail }
 ];
 return <div className="nurse-desk nurse-ui">
  <p className="nurse-route__lead">What your own records add up to: today’s schedule and the weeks on your earnings register. Every figure is counted from a list you can open.</p>
  <div className="nurse-tiles">{tiles.map(({ icon: Icon, value, label, note }) => <div className="nurse-tile" key={label}>
   <span className="nurse-tile__icon" aria-hidden="true"><Icon/></span>
   <span className="nurse-tile__value">{value}</span>
   <span className="nurse-tile__label">{label}</span>
   <span className="nurse-tile__note">{note}</span>
  </div>)}</div>
  <Card padding="md" className="nurse-desk__panel">
   <h2>Visits each week</h2>
   <WeekBars/>
  </Card>
 </div>;
}

/* ---- Clinical resources ----------------------------------------------------------------------------- */

const statusOf = (id: string) => protocolsContract.statuses.find(status => status.id === id);
const library = screens['health-library'];
type Chip = 'All' | 'Protocols' | 'Health library' | 'Forms';
const chips: readonly Chip[] = ['All', 'Protocols', 'Health library', 'Forms'];

export function NurseResources() {
 const [chip, setChip] = useState<Chip>('All');
 const [query, setQuery] = useState('');
 const [reading, setReading] = useState<string | null>(null);
 const terms = query.trim().toLowerCase();
 const protocols = protocolsContract.protocols.filter(p => !terms || p.name.toLowerCase().includes(terms));
 /* The library's own search, over every tab, so a word finds what the patient's search would find. */
 const entries: (LibraryEntry & { tab: string })[] = libraryTabs.flatMap(tab => searchLibrary(tab, query).map(entry => ({ ...entry, tab: tab.label })));
 const showProtocols = chip === 'All' || chip === 'Protocols';
 const showLibrary = chip === 'All' || chip === 'Health library';
 const shown = (showProtocols ? protocols.length : 0) + (showLibrary ? entries.length : 0);

 return <div className="nurse-desk nurse-ui">
  <Card padding="md" className="nurse-desk__panel">
   <label className="nurse-desk__search"><Search aria-hidden="true"/><span className="visually-hidden">Search protocols and the health library</span>
    <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search resources…"/></label>
   <TabsList aria-label="What to list">
    {chips.map(c => <Tab key={c} active={chip === c} aria-controls="nurse-resources-list" onClick={() => { setChip(c); setReading(null); }}>{c}</Tab>)}
   </TabsList>
   <p className="nurse-desk__count" role="status">{chip === 'Forms' ? 'No forms' : `${shown} ${shown === 1 ? 'entry' : 'entries'}`}{terms ? ` for “${query.trim()}”` : ''}</p>

   <div id="nurse-resources-list" role="tabpanel" aria-label={chip} className="nurse-desk__sections">
    {showProtocols && <section aria-labelledby="nr-protocols">
     <h2 id="nr-protocols">Protocols</h2>
     {/* The register's governance, in its own words, above rows that are every one of them a draft. */}
     <p className="nurse-desk__governance">{protocolsContract.governance.ratificationProcess.note}</p>
     {/* What each status on the list means, once, in the register's words, rather than on every row. */}
     <dl className="nurse-desk__statuses">{[...new Set(protocols.map(p => p.status))].map(id => <div key={id}><dt>{statusOf(id)?.name ?? id}</dt><dd>{statusOf(id)?.detail}</dd></div>)}</dl>
     {protocols.length ? <ul className="nurse-desk__rows">{protocols.map(p => <li key={p.id}>
      <span className="nurse-tile__icon" aria-hidden="true"><FileText/></span>
      <span className="nurse-desk__say"><strong>{p.name}</strong><small>Version {p.version}</small></span>
      <Badge size="sm" variant={p.status === 'ratified' ? 'success' : p.status === 'draft' ? 'warning' : 'neutral'}>{statusOf(p.status)?.name ?? p.status}</Badge>
     </li>)}</ul> : <p className="nurse-desk__empty">No protocol is named like that.</p>}
    </section>}

    {showLibrary && <section aria-labelledby="nr-library">
     <h2 id="nr-library">Health library</h2>
     <p className="nurse-desk__governance">{library.lead}</p>
     {entries.length ? <ul className="nurse-desk__rows">{entries.map(entry => {
      const open = reading === entry.id;
      return <li key={entry.id} className={open ? 'is-open' : undefined}>
       <span className="nurse-tile__icon" aria-hidden="true"><BookOpen/></span>
       <span className="nurse-desk__say"><strong>{entry.title}</strong><small>{entry.tab} · {entry.sourceText}</small></span>
       <Button variant="secondary" size="sm" aria-expanded={open} aria-controls={`nr-entry-${entry.id}`} onClick={() => setReading(open ? null : entry.id)}>{open ? 'Close' : 'Read'}</Button>
       {open && <dl id={`nr-entry-${entry.id}`} className="nurse-desk__entry">{entry.fields.map(field => <div key={field.label}>
        <dt>{field.label}</dt>
        <dd>{field.items.length > 1 ? <ul>{field.items.map(item => <li key={item}>{item}</li>)}</ul> : field.items[0]}</dd>
       </div>)}</dl>}
      </li>;
     })}</ul> : <p className="nurse-desk__empty"><strong>{library.emptyTitle}</strong> {library.emptyDetail}</p>}
    </section>}

    {chip === 'Forms' && <section aria-labelledby="nr-forms">
     <h2 id="nr-forms">Forms</h2>
     <p className="nurse-desk__empty">There are no forms in this preview, and nothing here is downloaded to fill in by hand.</p>
    </section>}
   </div>
  </Card>
 </div>;
}

/* ---- Settings: her profile, read ------------------------------------------------------------------- */

export function NurseProfile({ subjectId }: { subjectId: string }) {
 const me = whoIs(subjectId, 'Dispatch is withdrawn until this is put right.');
 const { subject } = me;
 return <div className="nurse-desk nurse-desk--two nurse-ui">
  <Card padding="md" className="nurse-desk__panel">
   <h2>Profile</h2>
   <NotConnected of="credential-verification"/>
   <div className="nurse-desk__who">
    <span className="staff-team-card__initials" aria-hidden="true">{me.initials}</span>
    <span><strong>{subject.name}</strong><small>{me.roleName}</small></span>
   </div>
   <dl className="nurse-desk__facts">
    <div><dt>Registration</dt><dd>{subject.reference}</dd></div>
    {subject.zone && <div><dt>Suburb</dt><dd>{subject.zone}</dd></div>}
    <div><dt>On the register</dt><dd>{me.credential}</dd></div>
   </dl>
   {subject.scope?.length ? <ul className="staff-team-card__scope" aria-label="Your scope">{subject.scope.map(scope => <li key={scope}><Badge size="sm" variant="neutral">{scope}</Badge></li>)}</ul> : null}
   <p className="nurse-desk__governance"><IdCard aria-hidden="true"/>Read from the vetting register, where these details live. Nothing on this card can be edited here.</p>
  </Card>
  <Card padding="md" className="nurse-desk__panel">
   <h2>Notifications</h2>
   <NotConnected of="messaging"/>
   <p className="nurse-desk__empty">So there is nothing here to switch on or off.</p>
  </Card>
 </div>;
}
