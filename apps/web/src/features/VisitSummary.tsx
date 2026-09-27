import { lazy, Suspense } from 'react';
import { Activity, ArrowRight, Clock3, MapPin, RotateCcw, ShieldCheck, Stethoscope } from 'lucide-react';
import { Pill, SectionTitle, ServiceIcon } from '../components/UI';
import { NotConnected } from '../components/NotConnected';
import { Metric, Metrics } from '../surface/Surface';
import { money } from '../lib/catalog';
import { endTime, longDateOf } from '../lib/scheduling';
import { doesNotUndo, refusalById, stateById, wordsFor, type CancelState } from '../lib/cancelling';
import {
 dateOf, flagFor, formatValue, lastReview, measureSpec, measuredIn, rangeText, reviewedBy, setOnDay
} from '../lib/passport';

/* From the same module as the tips screen, so the door and the page it opens share one download and one
   dependency list in the entry bundle rather than two. */
const CareTipsDoor = lazy(() => import('./CareTips').then(m => ({ default: m.CareTipsDoor })));

/* A visit that has already happened, and a visit that never will.
 *
 * Both were the same screen as an upcoming visit: a price, a time, a nurse and three things to have
 * ready — for a visit three days in the past, and for one that was stood down a fortnight ago. The
 * "have this ready" list was still on both of them.
 *
 * A completed visit is the screen a returning patient wants most and the one the audit found no
 * door to at all. What it owes them is four answers in this order: what was measured, whether each
 * of those readings sits inside its reference range, what a doctor said about them, and one way to
 * arrange the same visit again. The readings are the visit's own — looked up by the day the visit
 * happened rather than printed beside it — and every range is the assessment's, never typed.
 *
 * A cancelled visit owes a different four: the reason that was recorded at the time, which side of
 * the cancellation window it fell on, what happened to the money, and what cancelling did *not*
 * undo. All four sentences are packages/catalog/cancellation.json's, word for word. */

type Row = {
 id: string;
 service: { name: string; icon: string; duration: number; price: number };
 person: string;
 address: string;
 date?: string;
 start?: string;
 payment: string;
};

function VisitHead({ row }: { row: Row }) {
 return <>
  <div className="booking-summary">
   <span className="service-icon"><ServiceIcon name={row.service.icon}/></span>
   <div><h3>{row.service.name}</h3><p>{row.person} · {row.address}</p></div>
   <strong>{money(row.service.price)}</strong>
  </div>
  <div className="review-line"><span>Reference</span><strong>{row.id}</strong></div>
  <div className="review-line"><span><Clock3 size={15}/> When</span><strong>{row.date && row.start ? `${longDateOf(row.date)} · ${row.start} – ${endTime(row.start, row.service.duration)}` : 'As soon as a nurse was free'}</strong></div>
  <div className="review-line"><span><MapPin size={15}/> Where</span><strong>{row.address}</strong></div>
 </>;
}

/* ---- A visit that happened -------------------------------------------------------------------- */

export function PastVisit({ row, dayOffset, rebook, navigate }: {
 row: Row; dayOffset?: number; rebook: () => void; navigate: (page: string) => void;
}) {
 const set = dayOffset === undefined ? undefined : setOnDay(dayOffset);
 const measures = set ? measuredIn(set) : [];
 const outside = measures.filter(id => flagFor(id, set!.values[id]!) !== 'normal');
 return <div className="form-stack">
  <NotConnected of="clinical-records"/>
  <VisitHead row={row}/>
  <div className="nurse-row"><span className="avatar nurse-avatar">SN</span><div><strong>Sister Naledi Mokoena</strong><span>Registered Nurse (SANC)</span></div></div>

  {/* The subject of the screen, and the only thing on it set large. A status chip above a thin
      numeral with its name below — the same shape a figure takes everywhere in this product, so a
      reading is read the same way as a balance or a count. */}
  {set ? <>
   <SectionTitle title="What was measured"/>
   <div className="panel visit-findings">
    <Metrics>{measures.map(id => {
     const spec = measureSpec(id);
     const value = set.values[id]!;
     const flag = flagFor(id, value);
     return <Metric key={id} value={formatValue(id, value)} unit={spec.unit}
      label={spec.label} chip={flag === 'normal' ? 'In range' : flag === 'high' ? 'Above range' : 'Below range'}
      flagged={flag !== 'normal'}/>;
    })}</Metrics>
    {/* Colour is never the only difference between two states: every chip carries the word as well,
        and the range each judgement was made against is in the table underneath. */}
    <p className="helper"><Activity size={14}/>{outside.length === 0
     ? 'Every reading taken at this visit sits inside its indicative reference range. The ranges are in the table below.'
     : `${outside.map(id => measureSpec(id).label).join(' and ')} sat outside the indicative range at this visit. A reading outside a range is something to look at, not a diagnosis.`}</p>
    {set.note && <div className="review-line"><span>Noted at the visit</span><strong>{set.note}</strong></div>}
   </div>
   {/* The same seven numbers as a table, because a reading a person cannot read is not a reading —
       and a table is what somebody reads out to a doctor over the phone. It scrolls inside its own
       box so that a narrow screen never makes the page scroll sideways.

       The sentence sits above the scroller rather than in the table's caption: a caption belongs to
       the table, so at 320px it took the table's width and its last words scrolled off the right
       edge of the box. The table keeps a caption for a screen reader, where being the table's own
       child is exactly what it is for. */}
   <div className="panel">
    <p className="helper">Every reading taken on {longDateOf(dateOf(set.dayOffset))}, with the indicative range it is judged against.</p>
    <div className="table-scroll">
    <table className="chart-table">
     <caption className="visually-hidden">Readings taken at this visit, with their indicative reference ranges.</caption>
     <thead><tr><th scope="col">Reading</th><th scope="col">Value</th><th scope="col">Indicative range</th></tr></thead>
     <tbody>{measures.map(id => {
      const flag = flagFor(id, set.values[id]!);
      return <tr key={id}><th scope="row">{measureSpec(id).label}</th>
       <td>{formatValue(id, set.values[id]!)} {measureSpec(id).unit}</td>
       <td>{rangeText(id)}{flag !== 'normal' && <> · <strong>{flag === 'high' ? 'above' : 'below'}</strong></>}</td></tr>;
     })}</tbody>
    </table>
    </div>
   </div>
  </> : <div className="panel"><h3>No readings were filed for this visit</h3>
   <p className="muted">Nothing was recorded against it, and the record does not fill that in afterwards. If you think something was measured, the nurse who came is the person to ask.</p></div>}

  {/* A nurse records and a doctor reviews. Two acts, two names, and the screen never presents the
      first as the second — so the attribution sits above all three sentences rather than beside the
      first one, where it read as a caption on that sentence alone. */}
  <SectionTitle title="What the doctor said"/>
  <div className="panel">
   <div className="review-line"><span><Stethoscope size={15}/> Reviewed by</span><strong>{reviewedBy}</strong></div>
   <div className="review-line"><span>On</span><strong>{longDateOf(dateOf(lastReview.reviewedDayOffset))}</strong></div>
   <dl className="stated space-top">
    <div><dt>The assessment</dt><dd>{lastReview.assessment}</dd></div>
    <div><dt>What to do until the next visit</dt><dd>{lastReview.plan}</dd></div>
    <div><dt>What happens next</dt><dd>{lastReview.next}</dd></div>
   </dl>
  </div>

  {/* The care tips follow the doctor's plan because they are the general half of the same question —
      what to do until the next visit. A door rather than the stack, on a dynamic import like the visit's
      thread below: this dialog is on the patient's first load and the door's words are not. */}
  <Suspense fallback={null}><CareTipsDoor navigate={navigate}/></Suspense>

  <button className="primary full" onClick={rebook}><RotateCcw size={17}/>Book {row.service.name} again</button>
  <button className="secondary full" onClick={() => navigate('Health trends')}>See how this has changed over time<ArrowRight size={17}/></button>
  <p className="helper"><ShieldCheck size={14}/>A completed visit is not edited from here. If something on it is wrong, ask for a correction under Privacy &amp; settings and the change is recorded beside the original rather than instead of it.</p>
 </div>;
}

/* ---- A visit that was stood down --------------------------------------------------------------- */

export function CancelledVisit({ row, reason, state, cancelledOn, rebook, navigate }: {
 row: Row; reason?: string; state: CancelState; cancelledOn?: string;
 rebook: () => void; navigate: (page: string) => void;
}) {
 const spec = stateById(state);
 return <div className="form-stack">
  <NotConnected of="booking"/>
  <VisitHead row={row}/>
  <div className="review-line"><span>Status</span><strong><Pill tone="amber">Cancelled</Pill></strong></div>

  {/* The reason was recorded when the visit was stood down and it is shown here rather than kept.
      A cancelled visit whose reason is invisible is a visit nobody can ask about afterwards — the
      patient, the nurse who was dispatched, or whoever has to explain it. */}
  <SectionTitle title="Why it was cancelled"/>
  <div className="panel">
   <dl className="stated">
    <div><dt>The reason you gave</dt><dd>{reason ?? 'I would rather not say'}</dd>
     {cancelledOn && <small>Recorded on {longDateOf(cancelledOn)}, and kept because a visit that vanishes is one nobody can ask about afterwards.</small>}</div>
    <div><dt>{spec.name}</dt><dd>{spec.detail}</dd><small>{wordsFor(state)}</small></div>
   </dl>
  </div>

  {/* What happens to the money is the question a person actually has here. The answer is two facts
      and no invention, and the third sentence is the payments contract's — it disappears from this
      screen at the same moment it disappears from every other. */}
  <SectionTitle title="What happened to the money"/>
  <div className="panel">
   <div className="review-line"><span>This visit</span><strong>{money(row.service.price)}</strong></div>
   <div className="review-line"><span>Was to be paid by</span><strong>{row.payment}</strong></div>
   {/* Not a review line. A review line is a label and a short value in two columns, and the refusal
       sentence set right-aligned against "Refund" was five wrapped lines fighting one word. */}
   <p className="helper space-top"><ShieldCheck size={14}/>{refusalById('no-charge-stated').sentence}</p>
  </div>
  <NotConnected of="payments"/>

  {/* The three statements and not their reasons. `why` in the contract is the argument for the rule,
      written for whoever maintains it — and the interpreter one names a file in this repository by
      path. A person who has just cancelled a nurse should not be shown a JSON filename, so this
      screen renders the half of the entry that is addressed to them. If those reasons are worth
      saying to a patient they need wording of their own in the contract; they do not have it. */}
  <SectionTitle title="What cancelling did not undo"/>
  <div className="panel"><dl className="stated">{doesNotUndo.map(item =>
   <div key={item.id}><dd>{item.statement}</dd></div>)}</dl></div>

  <button className="primary full" onClick={rebook}><RotateCcw size={17}/>Book {row.service.name} again</button>
  <button className="secondary full" onClick={() => navigate('Privacy & settings')}>Review what you have consented to<ArrowRight size={17}/></button>
 </div>;
}
