import { useEffect, useState } from "react";
import overview from "../../../../../packages/catalog/control-tower-overview.json" with { type: "json" };
import visitDemo from "../../../../../packages/catalog/control-tower-overview-demo.json" with { type: "json" };
import { FundingOverview, adminTabBlurb } from "../Admin";
import {
  categoryById,
  legacyAddresses,
  portalContract,
  readAssistantHealth,
  statusVocabulary,
  tabOf,
  type AssistantHealth,
} from "../../lib/portal";
import { usePortal } from "./context";
import { Frame } from "./Frame";
import { Empty, Region, RovingList, Status } from "./Parts";
import { FounderDashboardDemo } from "./FounderDemo";
import "./design-widgets.css";

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
  const found = overview.sections.find((s) => s.id === id);
  if (!found)
    throw new Error(
      `packages/catalog/control-tower-overview.json has no section "${id}".`,
    );
  return found;
};

export function OverviewCategory() {
  const { place, vetting } = usePortal();
  if (place.tab === "funding")
    return (
      <Frame blurb={adminTabBlurb.Overview}>
        <FundingOverview vetting={vetting} />
      </Frame>
    );
  if (place.tab === "moves")
    return (
      <Frame>
        <WhatMoved />
      </Frame>
    );
  return (
    <Frame>
      <StateOfTheWorld />
    </Frame>
  );
}

/* What the health route answered, as the words it answered with: the fields that were true, and
   "not" before the ones that were not. Booleans only — the route carries nothing else, and nothing
   else is drawn. */
const answered = (health: AssistantHealth) => {
  const entries = Object.entries(health.fields);
  if (!entries.length) return "The health route did not answer.";
  return `The health route answered: ${entries.map(([field, on]) => (on ? field : `not ${field}`)).join(" · ")}.`;
};

/* ── DEMO DATA — for show and tell only ──────────────────────────────────────────────────────────
 * The three metric cards and the "Visits this week" area chart below read from
 * packages/catalog/control-tower-overview-demo.json. That file is not a real data source; it holds
 * invented figures so the screen has something to show until a real feed exists. Every number on
 * these cards is therefore a demonstration number, and the banner above them says so. When a real
 * source is connected, the demo block is removed and the cards read from the contract instead. */
function DemoBanner() {
  return (
    <div className="pt-demo-banner" role="note">
      <strong>DEMO DATA — for show and tell only.</strong>
      <span>
        The cards and chart below read invented figures from a demonstration
        file. No real visit data, metric or time-series is connected yet.
        Replace with the care visit log when it exists.
      </span>
    </div>
  );
}

/* Every widget derives from the same series. No totals are copied into presentation code. */
function WeeklyWidgets() {
 const visits=visitDemo.visits;
 const total=visits.reduce((n,v)=>n+v.count,0);
 const peak=visits.reduce((a,b)=>a.count>b.count?a:b);
 const weekday=visits.filter(v=>![0,6].includes(new Date(v.date+'T12:00:00Z').getUTCDay())).reduce((n,v)=>n+v.count,0);
 const share=total?weekday/total*100:0;
 const day=(date:string)=>new Date(date+'T12:00:00Z').toLocaleDateString('en-ZA',{weekday:'short',timeZone:'UTC'});
 return <section className="pt-weekly" aria-labelledby="weekly-heading">
  <header><span className="pt-widget-kicker">CONTROL TOWER / SAMPLE WEEK</span><h2 id="weekly-heading">The week, at a glance.</h2><p>{visitDemo.period.from} — {visitDemo.period.to} · Demonstration data</p></header>
  <div className="pt-weekly-metrics">{[{label:'Total sample visits',value:total,note:'Across the sample week'},{label:'Daily average',value:(total/visits.length).toFixed(1),note:'Derived from the same series'},{label:'Highest sample day',value:peak.count,note:day(peak.date)}].map(m=><div key={m.label}><span>{m.label}</span><strong>{m.value}</strong><small>{m.note}</small></div>)}</div>
  <div className="pt-weekly-charts"><section><h3>Visits through the week</h3><p className="helper">Illustrative visit counts</p><div className="pt-week-bars" aria-hidden="true">{visits.map(v=><div key={v.date}><strong>{v.count}</strong><i style={{height:`${v.count/peak.count*150}px`}}/><span>{day(v.date)}</span></div>)}</div></section><section className="pt-week-share"><h3>A clearer view of the mix</h3><div className="pt-week-donut" style={{background:`conic-gradient(var(--teal) 0 ${share}%, var(--mango) ${share}% 100%)`}} role="img" aria-label={`Sample visits: ${weekday} on weekdays, ${total-weekday} at the weekend`}><div><strong>{total}</strong><span>sample visits</span></div></div><dl><div><dt>Weekdays</dt><dd>{weekday}</dd></div><div><dt>Weekend</dt><dd>{total-weekday}</dd></div></dl></section></div>
  <details className="pt-week-values"><summary>Exact sample values</summary><table className="result-table"><caption>Visits in the demonstration week</caption><thead><tr><th scope="col">Date</th><th scope="col">Visits</th></tr></thead><tbody>{visits.map(v=><tr key={v.date}><th scope="row">{v.date} · {day(v.date)}</th><td>{v.count}</td></tr>)}</tbody></table></details>
 </section>;
}

function StateOfTheWorld() {
  const [health, setHealth] = useState<AssistantHealth | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => controller.abort(),
      portalContract.overview.healthTimeoutMs,
    );
    void readAssistantHealth(controller.signal).then(setHealth);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, []);
  const services = section("service-state").services ?? [];
  const tenants = section("active-tenants");
  const activity = section("recent-activity");
  const gates = section("open-gates").gates ?? [];
  const changed = portalContract.overview.whatChanged;
  return (
    <>
      {/* ── DEMO DATA — for show and tell only. Replace with real metrics when a feed exists. ── */}
      <DemoBanner />
      <WeeklyWidgets />
      <Region title="Services" count={services.length}>
        <RovingList
          label={`${services.length} services`}
          className="pt-services"
          rows={services.map((s) => {
            const live = s.fixedState === undefined;
            return {
              key: s.id,
              content: (
                <>
                  <strong>{s.label}</strong>
                  {live ? (
                    health ? (
                      <Status id={health.state} />
                    ) : (
                      <span
                        className="pt-checking"
                        role="status"
                        aria-busy="true"
                      >
                        {portalContract.overview.checkingSentence}
                      </span>
                    )
                  ) : (
                    <Status id={s.fixedState!} />
                  )}
                  <span>
                    {live ? (
                      <>
                        {health && <>{answered(health)} </>}
                        <em>{portalContract.overview.recordedLabel}:</em>{" "}
                        {s.recordedState}
                      </>
                    ) : (
                      s.reason
                    )}
                  </span>
                </>
              ),
            };
          })}
        />
        <details className="pt-legend">
          <summary>What each status means</summary>
          <dl>
            {statusVocabulary.map((w) => (
              <div key={w.id}>
                <dt>
                  <Status id={w.id} />
                </dt>
                <dd>{w.sentence}</dd>
              </div>
            ))}
          </dl>
        </details>
      </Region>
      <Region title={tenants.label} count={(tenants.tenants ?? []).length}>
        <Empty>{tenants.emptyState}</Empty>
      </Region>
      <Region title={section("what-changed").label} count={changed.length}>
        <p className="helper">{portalContract.overview.whatChangedWindow}</p>
        {changed.length ? (
          <RovingList
            label={`${changed.length} changes`}
            rows={changed.map((c) => ({
              key: c.heading,
              content: (
                <>
                  <strong>{c.on}</strong>
                  <span>{c.heading.replace(/^Delivered — /, "")}</span>
                  <code>{c.ref}</code>
                </>
              ),
            }))}
          />
        ) : (
          <Empty>{section("what-changed").emptyState}</Empty>
        )}
      </Region>
      <Region title={activity.label}>
        <Empty>{activity.emptyState}</Empty>
      </Region>
      <Region title={section("open-gates").label} count={gates.length}>
        <div className="table-scroll">
          <table className="result-table admin-table pt-table">
            <caption>{section("open-gates").why}</caption>
            <thead>
              <tr>
                <th scope="col">Gate</th>
                <th scope="col">Owner</th>
                <th scope="col">What it waits on</th>
              </tr>
            </thead>
            <tbody>
              {gates.map((g) => (
                <tr key={g.id}>
                  <th scope="row">{g.id}</th>
                  <td>{g.owner}</td>
                  <td>{g.blockedOn}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Region>
      <Region
        title="Recorded, not resolved"
        count={overview.discrepancies.length}
      >
        <ul className="pt-refusals">
          {overview.discrepancies.map((d) => (
            <li key={d.id}>
              <strong>{d.sentence}</strong> <span>Owner: {d.owner}.</span>
            </li>
          ))}
        </ul>
      </Region>
      <Region
        title="What this screen will not claim"
        count={overview.refusals.length}
      >
        <ul className="pt-refusals">
          {overview.refusals.map((r) => (
            <li key={r.id}>
              <strong>{r.statement}</strong> <span>{r.why}</span>
            </li>
          ))}
        </ul>
      </Region>
      {/* ── DEMO DATA — for show and tell only. The Founder dashboard is a Phase 7 mockup. ── */}
      <FounderDashboardDemo />
    </>
  );
}

/* Where every old tab went, from the portal contract's legacy table — the in-portal half of the
   training note docs/control-tower-cutover.md asks for, and the page the old-address notice links to. */
function WhatMoved() {
  const { go } = usePortal();
  return (
    <>
      <Region title="Every old tab and section" count={legacyAddresses.length}>
        <div className="table-scroll">
          <table className="result-table admin-table pt-table">
            <caption>{portalContract.notice.sentence}</caption>
            <thead>
              <tr>
                <th scope="col">Was</th>
                <th scope="col">Is now</th>
                <th scope="col">How</th>
              </tr>
            </thead>
            <tbody>
              {legacyAddresses.map((entry) => {
                const [surface, name] = [
                  entry.legacy.slice(0, entry.legacy.indexOf(":")),
                  entry.legacy.slice(entry.legacy.indexOf(":") + 1),
                ];
                const category = categoryById(entry.category);
                const tab = tabOf(category, entry.tab);
                const where = entry.tool
                  ? `${category.label} · More tools`
                  : tab.label === category.label
                    ? category.label
                    : `${category.label} · ${tab.label}`;
                return (
                  <tr key={entry.legacy}>
                    <th scope="row">
                      {surface === "back-office"
                        ? "Back office"
                        : "Control Tower workspace"}{" "}
                      · {name}
                    </th>
                    <td>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => go(category.id, tab.id)}
                      >
                        {where}
                      </button>
                    </td>
                    <td>
                      {entry.disposition}
                      {entry.alsoTo
                        ? ` — also ${categoryById(entry.alsoTo.split("/")[0]!).label} · ${tabOf(categoryById(entry.alsoTo.split("/")[0]!), entry.alsoTo.split("/")[1]!).label}`
                        : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Region>
      <Region
        title="Decided in this change"
        count={portalContract.decisions.length}
      >
        <ul className="pt-refusals">
          {portalContract.decisions.map((d) => (
            <li key={d.id}>
              <strong>{d.sentence}</strong> <span>{d.why}</span>
            </li>
          ))}
        </ul>
      </Region>
      <Region title="The old surfaces, for one release cycle">
        <p>{portalContract.legacy.sentence}</p>
        <p className="helper">{portalContract.rollback.sentence}</p>
      </Region>
    </>
  );
}
