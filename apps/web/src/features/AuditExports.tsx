import { useState } from 'react';
import { CalendarRange, ShieldAlert } from 'lucide-react';
import coreApi from '../../../../packages/catalog/apis/core.json' with { type: 'json' };
import { auditExportMaxDaysNow } from '../lib/settings';

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
 return <section className="ae-desk" aria-labelledby="ae-title">
  <h2 id="ae-title">Audit exports</h2>
  <p className="helper">{route.summary} The bound below is audit-export-max-days, {bound} days, on the Configuration tab — an admin setting rather than a number typed into this screen. This preview checks a range against it; it opens no real export, reads no trail and sends nothing to anybody.</p>
  <div className="ae-form">
   <label className="ae-field">From
    <input type="date" value={from} onChange={event => { setFrom(event.target.value); setChecked(null); }}/>
   </label>
   <label className="ae-field">To
    <input type="date" value={to} onChange={event => { setTo(event.target.value); setChecked(null); }}/>
   </label>
   <button type="button" className="primary" onClick={check}><CalendarRange size={16}/>Check the range</button>
  </div>
  {checked && (checked.ok
   ? <p className="ae-result" role="status">{checked.days} day{checked.days === 1 ? '' : 's'}, within the {bound}-day bound. A real export would run now; this preview keeps nothing.</p>
   : <p className="ae-result ae-refusal" role="alert"><ShieldAlert size={16}/>{refusalSentence('range-too-wide')} ({checked.days} days asked for, {bound} allowed.)</p>)}
 </section>;
}
