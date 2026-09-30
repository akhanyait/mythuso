import { Pill as PillIcon } from 'lucide-react';
import { Badge, MetricCard } from '../ui';
import { authorisation, classById, expiresInDays, formatDay, expiresOn, prescription, repeatsRemaining, substituted } from '../lib/dispensing';
import './doctor-pages.css';

/* The partner's repeats, as the Lovable export draws them first: a compact list of what is on the script and
 * what happened to each item, above the long screen where each one is actually worked (30 September 2026).
 *
 * The export gave every row an Approve and a Decline. Neither is drawn. A substitution here is a pharmacist's
 * signed decision under a named ground, told to the patient before anything is handed over, and an item the
 * prescriber marked must-not has no control at all — features/Dispensing.tsx says why, beside each item. A
 * one-press approve in a summary above it would be a second, quicker way round every one of those. So this is
 * a list that reads, counted off the same prescription the screen below works: items, what was substituted,
 * and the repeats the authorisation has left. */
export function RepeatsSummary() {
 return <section className="dp-page" aria-labelledby="pp-repeats">
  <div className="dp-head"><div><h2 id="pp-repeats">{prescription.reference} at a glance</h2><p>Each item as it was written, what is being handed over, and who may decide a change to it. Every item is worked, told and handed over below.</p></div></div>
  <div className="dp-strip" aria-label="The script, counted">
   <MetricCard className="is-lead" label="Items on the script" value={String(prescription.items.length)} trend={`${prescription.items.length - substituted.length} as written`}/>
   <MetricCard label="Substituted" value={String(substituted.length)} trend="Each on a named ground, told to the patient"/>
   <MetricCard label="Repeats left" value={`${repeatsRemaining} of ${authorisation.repeatsAuthorised}`} trend={`The authorisation lapses ${formatDay(expiresOn)} · in ${expiresInDays} days`}/>
  </div>
  <ol className="dp-list" aria-label="Items on the script">{prescription.items.map(item => <li key={item.id} className="dp-row">
   <span className="dp-row-mark" aria-hidden="true"><PillIcon size={18}/></span>
   <span className="dp-row-what"><strong>{item.dispensed}</strong><small>Written: {item.prescribed}</small></span>
   <span className="dp-row-state">
    <Badge variant={item.outcome === 'substituted' ? 'primary' : 'neutral'}>{item.outcome === 'substituted' ? 'Substituted' : 'As written'}</Badge>
    <Badge variant={item.classId === 'must-not' ? 'danger' : 'neutral'} size="sm">{classById(item.classId).shortName}</Badge>
   </span>
  </li>)}</ol>
 </section>;
}
