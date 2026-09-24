import { useEffect, useState } from 'react';
import overview from '../../../../../packages/catalog/control-tower-overview.json' with { type: 'json' };
import { FundingOverview, adminTabBlurb } from '../Admin';
import { categoryById, legacyAddresses, portalContract, readAssistantHealth, statusVocabulary, tabOf, type AssistantHealth } from '../../lib/portal';
import { usePortal } from './context';
import { Frame } from './Frame';
import { Empty, Region, RovingList, Status } from './Parts';

/* The portal's landing screen (§5.3), rendered from packages/catalog/control-tower-overview.json.
 *
 * "This session spent effort discovering that production was live and nothing recorded it. The
 * Overview screen makes that discovery instant." So every row here is read: a service fixed by a
 * decision carries that decision's state and reason from the contract, and the one service that can
 * change by itself — the assistant — is asked, from its health route, when the screen opens. Nothing is
 * typed that could be right on the day it was typed and wrong the day after, and the contract's four
 * refusals are drawn at the foot so a reader knows what the screen will not claim. */

type Section = (typeof overview.sections)[number];
const section = (id: string): Section => {
 const found = overview.sections.find(s => s.id === id);
 if (!found) throw new Error(`packages/catalog/control-tower-overview.json has no section "${id}".`);
 return found;
};

export function OverviewCategory() {
 const { place, vetting } = usePortal();
 if (place.tab === 'funding') return <Frame blurb={adminTabBlurb.Overview}><FundingOverview vetting={vetting}/></Frame>;
 if (place.tab === 'moves') return <Frame><WhatMoved/></Frame>;
 return <Frame><StateOfTheWorld/></Frame>;
}

/* What the health route answered, as the words it answered with: the fields that were true, and
   "not" before the ones that were not. Booleans only — the route carries nothing else, and nothing
   else is drawn. */
const answered = (health: AssistantHealth) => {
 const entries = Object.entries(health.fields);
 if (!entries.length) return 'The health route did not answer.';
 return `The health route answered: ${entries.map(([field, on]) => on ? field : `not ${field}`).join(' · ')}.`;
};

function StateOfTheWorld() {
 const [health, setHealth] = useState<AssistantHealth | null>(null);
 useEffect(() => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), portalContract.overview.healthTimeoutMs);
  void readAssistantHealth(controller.signal).then(setHealth);
  return () => { window.clearTimeout(timer); controller.abort(); };
 }, []);
 const services = section('service-state').services ?? [];
 const tenants = section('active-tenants');
 const activity = section('recent-activity');
 const gates = section('open-gates').gates ?? [];
 const changed = portalContract.overview.whatChanged;
 return <>
  <Region title="Services" count={services.length}>
   <RovingList label={`${services.length} services`} className="pt-services" rows={services.map(s => {
    const live = s.fixedState === undefined;
    return { key: s.id, content: <>
     <strong>{s.label}</strong>
     {live
      ? health ? <Status id={health.state}/> : <span className="pt-checking" role="status" aria-busy="true">{portalContract.overview.checkingSentence}</span>
      : <Status id={s.fixedState!}/>}
     <span>{live
      ? <>{health && <>{answered(health)} </>}<em>{portalContract.overview.recordedLabel}:</em> {s.recordedState}</>
      : s.reason}</span>
    </> };
   })}/>
   <details className="pt-legend"><summary>What each status means</summary>
    <dl>{statusVocabulary.map(w => <div key={w.id}><dt><Status id={w.id}/></dt><dd>{w.sentence}</dd></div>)}</dl>
   </details>
  </Region>
  <Region title={tenants.label} count={(tenants.tenants ?? []).length}>
   <Empty>{tenants.emptyState}</Empty>
  </Region>
  <Region title={section('what-changed').label} count={changed.length}>
   <p className="helper">{portalContract.overview.whatChangedWindow}</p>
   {changed.length ? <RovingList label={`${changed.length} changes`} rows={changed.map(c => ({
    key: c.heading, content: <><strong>{c.on}</strong><span>{c.heading.replace(/^Delivered — /, '')}</span><code>{c.ref}</code></>
   }))}/> : <Empty>{section('what-changed').emptyState}</Empty>}
  </Region>
  <Region title={activity.label}>
   <Empty>{activity.emptyState}</Empty>
  </Region>
  <Region title={section('open-gates').label} count={gates.length}>
   <div className="table-scroll"><table className="result-table admin-table pt-table">
    <caption>{section('open-gates').why}</caption>
    <thead><tr><th scope="col">Gate</th><th scope="col">Owner</th><th scope="col">What it waits on</th></tr></thead>
    <tbody>{gates.map(g => <tr key={g.id}><th scope="row">{g.id}</th><td>{g.owner}</td><td>{g.blockedOn}</td></tr>)}</tbody>
   </table></div>
  </Region>
  <Region title="Recorded, not resolved" count={overview.discrepancies.length}>
   <ul className="pt-refusals">{overview.discrepancies.map(d => <li key={d.id}><strong>{d.sentence}</strong> <span>Owner: {d.owner}.</span></li>)}</ul>
  </Region>
  <Region title="What this screen will not claim" count={overview.refusals.length}>
   <ul className="pt-refusals">{overview.refusals.map(r => <li key={r.id}><strong>{r.statement}</strong> <span>{r.why}</span></li>)}</ul>
  </Region>
 </>;
}

/* Where every old tab went, from the portal contract's legacy table — the in-portal half of the
   training note docs/control-tower-cutover.md asks for, and the page the old-address notice links to. */
function WhatMoved() {
 const { go } = usePortal();
 return <>
  <Region title="Every old tab and section" count={legacyAddresses.length}>
   <div className="table-scroll"><table className="result-table admin-table pt-table">
    <caption>{portalContract.notice.sentence}</caption>
    <thead><tr><th scope="col">Was</th><th scope="col">Is now</th><th scope="col">How</th></tr></thead>
    <tbody>{legacyAddresses.map(entry => {
     const [surface, name] = [entry.legacy.slice(0, entry.legacy.indexOf(':')), entry.legacy.slice(entry.legacy.indexOf(':') + 1)];
     const category = categoryById(entry.category);
     const tab = tabOf(category, entry.tab);
     const where = entry.tool ? `${category.label} · More tools` : tab.label === category.label ? category.label : `${category.label} · ${tab.label}`;
     return <tr key={entry.legacy}>
      <th scope="row">{surface === 'back-office' ? 'Back office' : 'Control Tower workspace'} · {name}</th>
      <td><button type="button" className="text-button" onClick={() => go(category.id, tab.id)}>{where}</button></td>
      <td>{entry.disposition}{entry.alsoTo ? ` — also ${categoryById(entry.alsoTo.split('/')[0]!).label} · ${tabOf(categoryById(entry.alsoTo.split('/')[0]!), entry.alsoTo.split('/')[1]!).label}` : ''}</td>
     </tr>;
    })}</tbody>
   </table></div>
  </Region>
  <Region title="Decided in this change" count={portalContract.decisions.length}>
   <ul className="pt-refusals">{portalContract.decisions.map(d => <li key={d.id}><strong>{d.sentence}</strong> <span>{d.why}</span></li>)}</ul>
  </Region>
  <Region title="The old surfaces, for one release cycle">
   <p>{portalContract.legacy.sentence}</p>
   <p className="helper">{portalContract.rollback.sentence}</p>
  </Region>
 </>;
}
