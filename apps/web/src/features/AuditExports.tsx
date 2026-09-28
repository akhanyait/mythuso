import { useState } from 'react';
import { CalendarRange, ShieldAlert } from 'lucide-react';
import coreApi from '../../../../packages/catalog/apis/core.json' with { type: 'json' };
import { auditExportMaxDaysNow } from '../lib/settings';
import { Button, Card, Field, Input } from '../ui';
import '../surface/office-identity.css';

/* GET /v1/core/audit-exports@1's own bound, checked here rather than called: the route reads the
 * bus's hash-chained trail (packages/engines/src/runtime/trail.ts), which this preview does not have
 * and must not fabricate. What it can check honestly is the same arithmetic the route's handler runs
 * before it ever opens the trail — a range wider than audit-export-max-days is refused, in the
 * contract's own sentence, and a range inside it is what the operator sends the request for. Nothing
 * here exports anything or sends anything to anybody: refusing that loudly is more honest than a
 * fabricated entryCount would be.
 */
const route = coreApi.routes.find(r => r.method === 'GET' && r.path === '/v1/core/audit-exports' && !(r as { withdrawn?: unknown }).withdrawn)!;
const refusalSentence = (id: string) => route.refusals.find(r => r.id === id)?.statement ?? id;
const DAY_MS = 86_400_000;
const spanDaysOf = (from: string, to: string): number => Math.floor((new Date(to).getTime() - new Date(from).getTime()) / DAY_MS) + 1;

export function AuditExportDesk() {
 const today = new Date().toISOString().slice(0, 10);
 const [from, setFrom] = useState(today);
 const [to, setTo] = useState(today);
 const [checked, setChecked] = useState<{ ok: boolean; days: number } | null>(null);
 const bound = auditExportMaxDaysNow();
 const check = () => {
  const days = spanDaysOf(from, to);
  setChecked({ ok: days >= 1 && days <= bound, days });
 };
 return <section className="oi-section ae-desk" aria-labelledby="ae-title">
  <div className="oi-head"><h2 id="ae-title" className="oi-section-title">Audit exports</h2>
   <p className="oi-lead">{route.summary} The bound below is audit-export-max-days, {bound} days, on the Configuration tab — an admin setting rather than a number typed into this screen. This preview checks a range against it; it opens no real export, reads no trail and sends nothing to anybody.</p></div>
  <Card padding="md" className="oi-card-body">
   <div className="oi-form-row ae-form">
    <Field label="From" htmlFor="ae-from"><Input id="ae-from" type="date" value={from} onChange={event => { setFrom(event.target.value); setChecked(null); }}/></Field>
    <Field label="To" htmlFor="ae-to"><Input id="ae-to" type="date" value={to} onChange={event => { setTo(event.target.value); setChecked(null); }}/></Field>
    <div><Button variant="primary" onClick={check} leadingIcon={<CalendarRange aria-hidden="true"/>}>Check the range</Button></div>
   </div>
   {checked && (checked.ok
    ? <p className="oi-note ae-result" role="status"><CalendarRange aria-hidden="true"/><span>{checked.days} day{checked.days === 1 ? '' : 's'}, within the {bound}-day bound. A real export would run now; this preview keeps nothing.</span></p>
    : <p className="oi-note oi-note--refusal ae-result ae-refusal" role="alert"><ShieldAlert aria-hidden="true"/><span>{refusalSentence('range-too-wide')} ({checked.days} days asked for, {bound} allowed.)</span></p>)}
  </Card>
 </section>;
}
