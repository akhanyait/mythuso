import { useState } from 'react';
import { ArrowLeft, ArrowRight, CircleAlert } from 'lucide-react';
import brief from '../../../../packages/catalog/funder-brief.json' with { type: 'json' };
import PilotKit from './PilotKit';
import './funder-view.css';

/* The funder view: the eight points the Technology Innovation Agency asked a demo to cover, on one
 * screen, for the presentation on 15 October 2026.
 *
 * Reached at /app/?preview=funder and from nowhere else — see src/Doorway.tsx. Like the GilbertOne
 * demonstrator it is behind a dynamic import and off every navigation, because a patient on metered
 * data has no reason to download a pitch, and a funder has no reason to land on somebody's visits.
 *
 * Every word and figure comes from packages/catalog/funder-brief.json, which GilbertOne's funder
 * answers read as well, so the screen and the assistant cannot tell a funder two different things.
 * Nothing is typed here that the brief does not hold.
 *
 * WHAT IT REFUSES TO DO. A figure the founder has not given is a placeholder, and it is drawn as one:
 * the "To confirm" chip is the loudest thing on its card rather than a footnote, because a funding ask
 * shown as settled when it is not is the one mistake this screen exists to prevent. The brief holds
 * three candidate asks; this screen shows all three as unconfirmed and picks none. It shows no visit
 * counts, no triage accuracy and no outcomes, because there are no real patients yet and an invented
 * result in front of a funder is a claim, whatever badge sits beside it. The invented people in
 * `samples` appear only under the DEMO DATA badge, as what a nurse's day would look like. */

type Status = keyof typeof brief.statuses;
type Fact = { text: string; status: string; source: string; figure?: string };
type Budget = { lead: string; total: number; lines: { label: string; amount: number }[]; source: string };
type Point = (typeof brief.points)[number] & { market?: { lead: string; others: { name: string; lane: string }[]; source: string }; budget?: Budget };

const points = brief.points as Point[];
const label = (s: string) => brief.statuses[s as Status] ?? s;

function StatusChip({ status }: { status: string }) {
 return <span className={`fv-chip fv-chip--${status}`}>{status === 'toConfirm' && <CircleAlert size={13} aria-hidden/>}{label(status)}</span>;
}

/* Rand in millions to two places, the way the deck writes them: R2.40m. Each line's bar is its
 * share of the whole; scripts/check-boundaries.mjs holds the lines to the total, so the bars always
 * fill exactly one budget. The split is drawn as proposed because it is: the founder has not
 * checked it, and the chip says so beside the figures rather than under them. */
const millions = (n: number) => `R${(n / 1e6).toFixed(2)}m`;

function BudgetSplit({ budget }: { budget: Budget }) {
 return <div className="fv-budget">
  <div className="fv-budget-head"><p className="fv-market-lead">{budget.lead}</p><span className="fv-chip fv-chip--planning">Proposed</span></div>
  <ul>{budget.lines.map(l => <li key={l.label}>
   <span className="fv-budget-label">{l.label}</span><b>{millions(l.amount)}</b>
   <span className="fv-budget-bar" aria-hidden><i style={{ width: `${(l.amount / budget.total) * 100}%` }}/></span>
  </li>)}</ul>
  <p className="fv-source">{budget.source}</p>
 </div>;
}

function FactRow({ fact }: { fact: Fact }) {
 return <li className={`fv-fact${fact.figure ? ' fv-fact--figure' : ''}`}>
  {fact.figure && <strong className="fv-figure">{fact.figure}</strong>}
  <span className="fv-fact-text">{fact.text}</span>
  <span className="fv-fact-meta"><StatusChip status={fact.status}/><span className="fv-source">{fact.source}</span></span>
 </li>;
}

export default function FunderView() {
 const [open, setOpen] = useState<string | null>(null);
 const pending = points.filter(p => p.facts.some(f => f.status === 'toConfirm')).map(p => p.title);
 return <div className="fv">
  <header className="fv-top">
   <a className="fv-brand" href="/app/" aria-label="MyThuso home">
    <img src="/brand/mythuso-logo-reversed.svg" alt="MyThuso" width="160" height="43"/>
   </a>
   <span className="fv-for">For the Technology Innovation Agency · 15 October 2026</span>
  </header>

  <main className="fv-main">
   <section className="fv-hero">
    <p className="fv-eyebrow">Funder view</p>
    <h1>Nurse-led care at home, and a shorter clinic queue, on one health record.</h1>
    <p className="fv-lede">The eight points TIA asked us to cover. Each figure names its source and whether it is published, a planning assumption, working today, or still to be confirmed.</p>
    <p className="fv-disclaimer" role="note">{brief.disclaimer}</p>
    {pending.length > 0 && <p className="fv-pending" role="status"><CircleAlert size={18} aria-hidden/>
     <span><b>Still to confirm before Thursday:</b> {pending.join(', ')}.</span></p>}
   </section>

   <ol className="fv-points">
    {points.map(p => {
     const expanded = open === p.id;
     return <li key={p.id} className={`fv-card fv-card--${p.id}`} id={`point-${p.id}`}>
      <div className="fv-card-head">
       <span className="fv-num" aria-hidden>{p.order}</span>
       <div>
        <h2>{p.title}</h2>
        <p className="fv-lead">{p.lead}</p>
       </div>
      </div>
      <ul className="fv-facts">{(p.facts as Fact[]).map((f, i) => <FactRow key={i} fact={f}/>)}</ul>
      {p.market && <div className="fv-market">
       <p className="fv-market-lead">{p.market.lead}</p>
       <ul>{p.market.others.map(o => <li key={o.name}><b>{o.name}</b><span>{o.lane}</span></li>)}</ul>
       <p className="fv-source">{p.market.source}</p>
      </div>}
      {p.budget && <BudgetSplit budget={p.budget}/>}
      <button type="button" className="fv-say" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : p.id)}>
       {expanded ? 'Hide' : 'What GilbertOne says when asked'}<ArrowRight size={15} aria-hidden/>
      </button>
      {expanded && <blockquote className="fv-answer">
       <p>{p.answer}</p>
       <footer>{brief.assistantLine}</footer>
      </blockquote>}
     </li>;
    })}
   </ol>

   <section className="fv-samples" aria-labelledby="fv-samples-h">
    <div className="fv-samples-head">
     <h2 id="fv-samples-h">What a nurse's day would look like</h2>
     <span className="fv-demo">DEMO DATA</span>
    </div>
    <p className="fv-disclaimer">{brief.samples._demo}</p>
    <div className="fv-day">
     {brief.samples.nurseDay.map(v => {
      const who = brief.samples.patients.find(p => p.name === v.patient);
      return <article key={v.time} className="fv-visit">
       <span className="fv-time">{v.time}</span>
       <div><b>{v.patient}</b>{who && <span className="fv-who">{who.age} · {who.area} · {who.language}</span>}
        <span className="fv-what">{v.visit}</span></div>
       <span className="fv-chip fv-chip--demo">{v.status}</span>
      </article>;
     })}
    </div>
   </section>

   <PilotKit/>

   <nav className="fv-links" aria-label="Show the app">
    <a href="/app/"><ArrowLeft size={16} aria-hidden/>The patient app</a>
    <a href="/app/?role=nurse">The nurse's workspace<ArrowRight size={16} aria-hidden/></a>
   </nav>
  </main>

  <footer className="fv-foot">
   <p>{brief.emergencyLine}</p>
   <p>{brief.assistantLine}</p>
  </footer>
 </div>;
}
