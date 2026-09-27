import { useState, type ComponentType } from 'react';
import { Ambulance, ArrowLeft, ArrowRight, Ban, Briefcase, GlassWater, HeartPulse, PhoneCall, Pill, RotateCcw, ShieldCheck } from 'lucide-react';
import { careTipDoor, careTipRefusals, careTipReview, careTips, careTipWords as words, counterFor, jumpLabelFor } from '../lib/care-tips';
import { careTipsRoute } from '../lib/care-tips-route.generated';
import './care-tips.css';

/* Care tips, after a visit: one card in front, the next two behind it, read one at a time.
 *
 * WHY A STACK AND NOT A LIST. Five paragraphs of advice on one screen is a leaflet, and a leaflet is
 * what somebody has already been handed and not read. One card at a time, with the next ones visibly
 * waiting, is a thing a person can finish — and the stack thins as they go, so it shows how much is
 * left without a number having to. The progress bar above it is the same fact again, and each of its
 * segments is a 44px button, so nobody has to press Next four times to reach the last tip.
 *
 * WHAT IT WILL NOT DO. Every word here is packages/catalog/care-tips.json's, and so are the three
 * refusals beside the stack: a tip names no dose, no diagnosis and nothing about this person. The
 * reviewer notice sits directly under the controls rather than in the side panel, because it is the
 * sentence that qualifies every card, and on a phone the side panel is a scroll away.
 *
 * MOTION. The front card is remounted by key when the tip changes, so its entrance (care-tips.css)
 * plays once per tip and never loops. Nothing is hidden by it that a script has to reveal: under
 * reduced motion, or before the shell has set data-motion, the card is simply there. */

/* Which drawing goes with which category. A picture, not a sentence, so it lives with the screen; a
   category the contract adds later draws the generic mark rather than nothing. */
const icons: Record<string, ComponentType<{ size?: number; strokeWidth?: number }>> = {
 medicines: Pill, 'blood-pressure': HeartPulse, 'be-ready': Briefcase, water: GlassWater, 'when-to-call': PhoneCall
};

export function CareTips({ open }: { open: (modal: string) => void }) {
 const [at, setAt] = useState(0);
 const tip = careTips[at]!;
 const last = at === careTips.length - 1;
 const Icon = icons[tip.category] ?? ShieldCheck;
 /* The next two, and only while there are two left: the stack gets thinner as it is read. */
 const behind = careTips.slice(at + 1, at + 3);
 return <div className="ct-screen">
  <div className="page-intro"><div className="eyebrow">{words.eyebrow}</div>
   <h1>{words.heading}</h1>
   <p>{words.lead}</p></div>

  <div className="ct-layout">
   <section className="ct-deck">
    <ol className="ct-progress" aria-label={words.progressLabel}>
     {careTips.map((t, i) => <li key={t.id}>
      <button type="button" aria-label={jumpLabelFor(i)} aria-current={i === at ? 'step' : undefined}
       data-read={i <= at || undefined} onClick={() => setAt(i)}/>
     </li>)}
    </ol>

    {/* A live region that stays put while the card inside it is replaced, so a screen reader hears the
        new tip when Next is pressed; a region created with its content already in it is announced by
        nobody. The cards behind are drawing, not content, and are hidden from it. */}
    <div className="ct-stack" data-depth={behind.length} aria-live="polite">
     {behind.map((t, k) => <div key={k} className={`ct-peek ct-peek-${k + 1}`} data-tint={t.tint} aria-hidden="true"/>).reverse()}
     <article key={tip.id} className="ct-card" data-tint={tip.tint}>
      <div className="ct-card-head">
       <span className="ct-tag">{tip.tag}</span>
       <span className="ct-count">{counterFor(at)}</span>
      </div>
      <span className="ct-icon" aria-hidden="true"><Icon size={40} strokeWidth={1.6}/></span>
      <h2 className="ct-title">{tip.title}</h2>
      <p className="ct-body">{tip.body}</p>
     </article>
    </div>

    <div className="ct-actions">
     <button type="button" className="secondary m-press" disabled={at === 0} onClick={() => setAt(at - 1)}><ArrowLeft size={17}/>{words.back}</button>
     <button type="button" className="primary m-press" onClick={() => setAt(last ? 0 : at + 1)}>
      {last ? <><RotateCcw size={17}/>{words.startAgain}</> : <>{words.next}<ArrowRight size={17}/></>}
     </button>
    </div>
    <p className="ct-review"><ShieldCheck size={16}/><span>{careTipReview.notice}</span></p>
   </section>

   <aside className="ct-about panel" aria-labelledby="ct-about-heading">
    <h2 id="ct-about-heading">{words.refusalsHeading}</h2>
    <ul className="ct-refusals">{careTipRefusals.map(sentence => <li key={sentence}><Ban size={16}/><span>{sentence}</span></li>)}</ul>
    <button type="button" className="secondary full" onClick={() => open('Thuso SOS')}><Ambulance size={17}/>{words.emergencyLabel}</button>
   </aside>
  </div>
 </div>;
}

/* The door to the tips, on a completed visit. It lives in this module, on the visit summary's dynamic import,
   because the visit summary is on the patient's first load and these words are not — and sharing a module with
   the page it opens means one download and one dependency list rather than two. The dialog is long enough that
   the door has arrived before anybody has scrolled to it. */
export function CareTipsDoor({ navigate }: { navigate: (page: string) => void }) {
 return <section className="visit-support"><h3>{careTipDoor.heading}</h3><p>{careTipDoor.detail}</p>
  <button type="button" className="secondary full" onClick={() => navigate(careTipsRoute.opens)}>{careTipDoor.action}<ArrowRight size={17}/></button></section>;
}
