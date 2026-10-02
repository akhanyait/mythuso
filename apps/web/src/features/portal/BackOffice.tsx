import { Suspense, lazy } from 'react';
import pack from '../../../../../packages/catalog/compliance-pack.json' with { type: 'json' };
import { ClinicalOversight, Catalogue, ControlChecklist, Finance, GovernanceDocuments, Growth, adminTabBlurb } from '../Admin';
import { contextParam, portalContract, portalRefusal } from '../../lib/portal';
import { usePortal } from './context';
import { Frame } from './Frame';
import { Empty, Loading, Region, RovingList } from './Parts';
import { ClinicianReviewQueue } from './ReviewQueue';

/* Governance's Knowledge sources (1 October 2026) arrives on a dynamic import of its own: it reads the
   whole federation contract, and nobody opening the review queue should download it. */
const KnowledgeSourcesScreen = lazy(() => import('./KnowledgeSources').then(m => ({ default: m.KnowledgeSourcesScreen })));
/* Catalogue's Suppliers & OEMs (2 October 2026) arrives on its own dynamic import too: it carries the whole
   supplier register, and nobody opening the price catalogue should download it. */
const SuppliersScreen = lazy(() => import('./Suppliers').then(m => ({ default: m.SuppliersScreen })));

/* The back office's categories — Finance, Compliance, Governance, Clinical oversight, Catalogue and
 * Growth — with the console's own panels, unchanged, and the three things §6.2 adds: cost allocation
 * under Finance, the compliance pack preview under Compliance and the Clinician Review Queue under
 * Governance. Each addition reads the contract that owns it and draws what that contract says today,
 * which for all three is a written empty state and the reason for it. */

export function FinanceCategory() {
 const { place } = usePortal();
 if (place.tab === 'cost-allocation') return <Frame><CostAllocation/></Frame>;
 return <Frame blurb={adminTabBlurb.Finance}><Finance/></Frame>;
}

/* Three axes and no figure on any of them. The period the reader chose is named, because it is the
   one context a cost screen would obviously be scoped by — and it changes nothing here, which the
   screen says rather than leaving somebody to change it and wonder. */
function CostAllocation() {
 const { place } = usePortal();
 const allocation = portalContract.costAllocation;
 const period = contextParam('period').values.find(v => v.id === place.period)?.label ?? place.period;
 return <>
  <Empty heading={portalRefusal('no-cost-without-a-meter')}>{allocation.emptyState}</Empty>
  <Region title="The three axes" count={allocation.axes.length}>
   <div className="table-scroll"><table className="result-table admin-table pt-table">
    <caption>{period}. {allocation.refusal}</caption>
    <thead><tr><th scope="col">Axis</th><th scope="col">What it divides</th><th scope="col">Why there is no figure</th></tr></thead>
    <tbody>{allocation.axes.map(axis => <tr key={axis.id}>
     <th scope="row">{axis.label}</th><td>{axis.divides}</td><td>{axis.emptyState}</td>
    </tr>)}</tbody>
   </table></div>
  </Region>
 </>;
}

export function ComplianceCategory() {
 const { place } = usePortal();
 if (place.tab === 'pack') return <Frame><CompliancePackPreview/></Frame>;
 return <Frame blurb={adminTabBlurb.Compliance}><ControlChecklist/></Frame>;
}

/* The pack is a schema with nothing in it, and the screen is the schema read aloud: every section,
   every field it would carry, the decision that keeps it empty, the document that would unblock it and
   what it would say if it were generated today. There is no Generate button, because the pack's own
   first refusal is that nothing is produced — not a draft, not a preview — until all four decisions
   close. */
export function CompliancePackPreview() {
 const words = portalContract.compliancePack;
 const decision = (id: string) => {
  const found = pack.gatesOn.decisions.find(d => d.id === id);
  if (!found) throw new Error(`packages/catalog/compliance-pack.json names a decision "${id}" it does not declare.`);
  return found;
 };
 const refusal = pack.refusals.find(r => r.id === 'no-pack-before-all-four-close')!;
 return <>
  <Empty heading={refusal.statement}>{pack.preview}</Empty>
  <Region title={words.decisionsHeading} count={pack.gatesOn.decisions.length}>
   <div className="table-scroll"><table className="result-table admin-table pt-table">
    <caption>{pack.gatesOn.allFourRequired}</caption>
    <thead><tr><th scope="col">Decision</th><th scope="col">Document and section</th><th scope="col">Where it stands</th></tr></thead>
    <tbody>{pack.gatesOn.decisions.map(d => <tr key={d.id}>
     <th scope="row">{d.id}</th><td><code>{d.document}</code>, section {d.section}</td><td>{d.state}</td>
    </tr>)}</tbody>
   </table></div>
  </Region>
  <Region title={words.sectionsHeading} count={pack.sections.length}>
   <RovingList label={`${pack.sections.length} sections of the compliance pack`} rows={pack.sections.map(section => ({
    key: section.id,
    content: <article className="pt-card" aria-label={section.label}>
     <h3>{section.label}</h3>
     <p>{section.sentence}</p>
     <p className="pt-label">{words.todayLabel}</p>
     <p>{section.todayItWouldSay}</p>
     <p className="pt-label">{words.unblockLabel}</p>
     <ul className="pt-bullets">{section.gatedBy.map(id => { const d = decision(id); return <li key={id}><code>{d.document}</code>, section {d.section} — {d.state}</li>; })}</ul>
     <p className="pt-label">Fields</p>
     <ul className="pt-fields">{section.fields.map(f => <li key={f.field}><code>{f.field}</code> <span>{f.type}{(f as { nullable?: boolean }).nullable ? ', empty today' : ''}</span></li>)}</ul>
    </article>
   }))}/>
  </Region>
  <Region title="What the pack refuses" count={pack.refusals.length}>
   <ul className="pt-refusals">{pack.refusals.map(r => <li key={r.id}><strong>{r.statement}</strong> <span>{r.why}</span></li>)}</ul>
  </Region>
 </>;
}

export function GovernanceCategory() {
 const { place } = usePortal();
 if (place.tab === 'review-queue') return <Frame><ClinicianReviewQueue/></Frame>;
 if (place.tab === 'knowledge-sources') return <Frame><Suspense fallback={<Loading/>}><KnowledgeSourcesScreen/></Suspense></Frame>;
 return <Frame blurb={adminTabBlurb.Governance}><GovernanceDocuments/></Frame>;
}

export function ClinicalCategory() {
 const { open, vetting } = usePortal();
 return <Frame blurb={adminTabBlurb.Clinical}><ClinicalOversight open={open} vetting={vetting}/></Frame>;
}
export function CatalogueCategory() {
 const { place } = usePortal();
 if (place.tab === 'suppliers') return <Frame><Suspense fallback={<Loading/>}><SuppliersScreen/></Suspense></Frame>;
 return <Frame blurb={adminTabBlurb.Catalogue}><Catalogue/></Frame>;
}
export function GrowthCategory() {
 return <Frame blurb={adminTabBlurb.Growth}><Growth/></Frame>;
}
