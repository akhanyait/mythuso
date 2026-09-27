import pack from '../../../../../../packages/catalog/compliance-pack.json' with { type: 'json' };
import providers from '../../../../../../packages/catalog/model-providers.json' with { type: 'json' };
import registry from '../../../../../../packages/catalog/api-registry.json' with { type: 'json' };
import { cardOf, g1 } from '../../../lib/gilbertone-admin';
import { CompliancePackPreview } from '../BackOffice';
import { Empty, Region } from '../Parts';
import { GatedAction } from './Controls';

/* GilbertOne · Compliance (§7.7): the pack, the audit extract, the kill switch and the residency map.
 *
 * The pack is the Compliance category's own preview, reused rather than copied, so the six sections and
 * the four decisions that keep them empty are drawn by one component in both places. The audit extract
 * is layer 13's alone, and no session exists that could say anybody is layer 13, so it is an empty state
 * for everybody. The kill switch is Module 8's, and neither a tenant nor a kill switch exists, so it is a
 * disabled button with that sentence. The residency map draws the three tiers and every provider in
 * none of them: packages/catalog/model-providers.json's region for Azure OpenAI is an observed fact
 * about where the model runs, and a tier is a decision nobody has recorded (DATA-RESIDENCY-OPTIONS.md
 * §7). Which request fields go where is api-registry.json's dataFlows, read as they are. */

export function ComplianceScreen() {
 const words = g1.compliance;
 const killSection = pack.sections.find(s => s.id === 'per-tenant-kill-switch')!;
 const auditSection = pack.sections.find(s => s.id === 'audit-extract')!;
 const withResidency = [
  ...providers.providers.map(p => ({ id: p.id, name: p.name, region: p.region, pinnedIn: null as string | null, tier: p.residency.tier, why: p.residencyWhy })),
  ...registry.cards.filter(c => 'residency' in c && !providers.providers.some(p => p.id === c.id))
   .map(c => ({ id: c.id, name: c.name, region: null as string | null, pinnedIn: cardOf(c.id).regionFrom ?? null, tier: null as string | null, why: c.why }))
 ];
 return <>
  <CompliancePackPreview/>

  <Region title={words.auditHeading}>
   <Empty>{words.auditEmpty}</Empty>
   <p className="helper">{auditSection.todayItWouldSay}</p>
  </Region>

  <Region title={words.killSwitchHeading}>
   <p>{killSection.sentence}</p>
   <GatedAction id="kill-switch"/>
   <p className="helper">{killSection.todayItWouldSay}</p>
   {/* The founder asked to control this screen too (28 September 2026). What it holds is read, and nothing on it
       has a contract that names a sign-off, so the contract says so here rather than a button pretending to. */}
   <Empty>{words.founderNote}</Empty>
  </Region>

  <Region title={words.residencyHeading}>
   <Empty heading={providers.residencyToday.sentence}>{providers.residencyToday.why}</Empty>
   <ul className="pt-refusals">{providers.residencyTiers.map(t => <li key={t.id}><strong>{t.label}</strong> <span>{t.sentence} Nothing is assigned to it.</span></li>)}</ul>
   <div className="table-scroll"><table className="result-table admin-table pt-table">
    <caption>{words.residencyObserved}: a region is where processing happens; a tier is a decision.</caption>
    <thead><tr><th scope="col">Provider</th><th scope="col">Region</th><th scope="col">Tier</th><th scope="col">Why</th></tr></thead>
    <tbody>{withResidency.map(p => <tr key={p.id}>
     <th scope="row">{p.name}</th>
     <td>{p.region ? <code>{p.region}</code> : p.pinnedIn ? <>Pinned in <code>{p.pinnedIn}</code></> : '—'}</td>
     <td>{p.tier ?? g1.modelProviders.residencyUnassigned}</td>
     <td>{p.why}</td>
    </tr>)}</tbody>
   </table></div>
  </Region>

  <Region title={words.flowsHeading} count={registry.dataFlows.length}>
   <div className="table-scroll"><table className="result-table admin-table pt-table">
    <caption>{registry._dataFlowsWhy}</caption>
    <thead><tr><th scope="col">Route</th><th scope="col">Field</th><th scope="col">Provider</th><th scope="col">May carry health information</th><th scope="col">After</th></tr></thead>
    <tbody>{registry.dataFlows.map(f => <tr key={`${f.route}-${f.field}-${f.providerRef}`}>
     <th scope="row"><code>{f.route}</code></th>
     <td><code>{f.field}</code></td>
     <td>{cardOf(f.providerRef).name}</td>
     <td>{f.phi ? g1.overview.trueWord : g1.overview.falseWord}</td>
     <td>{f.after}</td>
    </tr>)}</tbody>
   </table></div>
  </Region>
 </>;
}
