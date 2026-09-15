import { Suspense, lazy, useState } from 'react';
import essential from '../../../../packages/catalog/mom-essential.json' with { type: 'json' };
import { NotConnected } from '../components/NotConnected';
import { money } from '../lib/catalog';
import { groupsOf, momPlan } from '../lib/mom-plans';
import { momPlanNow, useSettingsHistories } from '../lib/settings';
import './mom-plans.css';
/* MyThuso for Mom, which the Blueprint calls the hero, and which is therefore the thing this screen
 * leads with rather than the third of five identical cards.
 *
 * The person reading is usually the child who would pay, comparing three prices. So the three prices
 * are one row of choices at the top, and choosing one shows what that tier names underneath. Three
 * tall columns side by side were tried against the brief and rejected: every inclusion carries a
 * sentence about what is not real yet, and three columns of that at a third of the width is a wall.
 *
 * Since Wave 4 one tier can be walked end to end as a preview: the button under the plan opens the Essential journey,
 * where a son or daughter asks for it, the parent agrees, and the first month is paid through Money's simulated
 * provider or a voucher — each screen saying so. Nothing is bought, and the rest of this comment is still true of the
 * panel itself.
 *
 * Nothing here can be bought and nothing pretends to be. There is no button that joins, the page's
 * payments notice sits above the prices, and each inclusion stands beside the notice of the capability
 * it waits on — read from packages/catalog/capabilities.json, so the sentence leaves the day the thing
 * is real and not a day before. The heading says "would bring" rather than "includes" for the same
 * reason: a plan does not include a device that has not been built.
 *
 * WHAT IS IN FORCE, NOT WHAT WAS TYPED. The plan's and tiers' names, "Everything in Essential", Plus's
 * call-outs, the report's wording and what priority SOS means are Money's settings, and this screen is
 * handed the plan already read into its words by lib/settings.ts. The two open questions this panel used
 * to list are those settings now, each with a proposal an admin changes on the back office, so there is
 * no "Not decided yet" to show; what the settings may never say is refused before they are in force.
 */
/* The Essential journey is its own chunk: a family comparing prices downloads the plan, and only somebody who asks for
   the monthly tier downloads the ledger, the booking rules and the journey behind it. */
const MomEssentialJourney = lazy(() => import('./MomEssential').then(m => ({ default: m.MomEssential })));
const fillPlan = (text: string, plan: string) => text.replace('{plan}', plan);

export function MomPlans({ family }: { family?: { sponsor: string; parents: readonly string[] } }) {
 useSettingsHistories();
 const plan = momPlanNow();
 const [chosen, setChosen] = useState(plan.tiers[0]!.id);
 const [journey, setJourney] = useState(false);
 const essentialTier = plan.tiers.find(x => x.id === essential.planCode);
 const essentialName = essentialTier ? `${plan.name} ${essentialTier.name}` : plan.name;
 const t = plan.tiers.find(x => x.id === chosen) ?? plan.tiers[0]!;
 return <><section className="panel mom-plan" aria-labelledby="mom-plan-title">
  <header className="mom-plan-head">
   <p className="mom-plan-payer">{momPlan.payer.headline}</p>
   <h2 id="mom-plan-title">{plan.name}</h2>
   <p>{momPlan.payer.statement}</p>
  </header>
  {/* A choice between three, drawn as three pressed-or-not buttons rather than tabs: nothing is
      hidden that a reader has to discover, the price is the label, and the selection is said by
      aria-pressed and by the border and ground together, never by colour alone. */}
  <div className="mom-tiers" role="group" aria-label={`${plan.name} plans`}>
   {plan.tiers.map(x => <button type="button" key={x.id} className="mom-tier" aria-pressed={x.id === chosen} onClick={() => setChosen(x.id)}>
    <span className="mom-tier-name">{x.name}</span>
    <strong className="mom-tier-price">{money(x.price)}<small>a month</small></strong>
    <span className="mom-tier-cadence">{x.cadence}</span>
   </button>)}
  </div>
  <div className="mom-plan-body">
   <div>
    <h3>What {t.name} would bring <span className="mom-phase">Phase {t.phase}</span></h3>
    {/* Said once, naming the tier below, rather than repeating its lines and their notices again. */}
    {t.inherits ? <p className="mom-inherits">{t.inherits}</p> : null}
    <ul className="mom-groups">
     {groupsOf(t).map(g => <li className="mom-group" key={g.items[0]!.id} data-capability={g.capability}>
      <ul>
       {g.items.map(i => <li className="mom-inclusion" key={i.id} data-inclusion={i.id}>
        <span><strong>{i.text}</strong>{i.detail ? <small>{i.detail}</small> : null}</span>
       </li>)}
      </ul>
      <NotConnected of={g.capability} tone="inline"/>
     </li>)}
    </ul>
   </div>
   <aside className="mom-aside" aria-label={`What ${plan.name} will not do`}>
    <div>
     <h3>What no plan does</h3>
     <ul className="mom-refusals">{momPlan.refusals.map(r => <li key={r.id} data-refusal={r.id}>{r.sentence}</li>)}</ul>
    </div>
    <div>
     <h3>Add-ons</h3>
     <p>{momPlan.addOns.statement}</p>
     <ul className="mom-addons">{momPlan.addOns.items.map(a => <li key={a.id}>{a.name}</li>)}</ul>
    </div>
    <div>
     <h3>Sharing the cost</h3>
     {/* The payments notice is already above the prices, and it is the capability this sentence
         waits on. Saying it twice on one screen is the defect, not the disclosure. */}
     <p>{momPlan.splitting.statement}</p>
    </div>
   </aside>
  </div>
  {/* One secondary button, under everything the plan says it will not do, so it is read after the refusals rather
      than instead of them. Only with a parent in the household to ask for. */}
  {family && family.parents.length > 0 && !journey && <div className="mom-essential-open">
   <button type="button" className="secondary" onClick={() => setJourney(true)}>{fillPlan(essential.screen.open, essentialName)}</button>
  </div>}
 </section>
 {family && journey && <Suspense fallback={<p className="helper" role="status">{fillPlan(essential.screen.open, essentialName)}</p>}>
  <MomEssentialJourney sponsorName={family.sponsor} parentOptions={family.parents}/>
 </Suspense>}
 </>;
}
