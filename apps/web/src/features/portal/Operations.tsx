import { Suspense, lazy } from 'react';
import { TimerReset } from 'lucide-react';
import { Metric, Metrics } from '../../surface/Surface';
import { DispatchBoard, IncidentBoard, QualityBoard, ShiftBoard, controlTowerFigures } from '../Dispatch';
import { VettingQueue } from '../Vetting';
import { SafetyDesk } from '../FieldSafety';
import { SosDesk } from '../SosDesk';
import { ConcernBoard } from '../ConcernBoard';
import { HeldCashPayments } from '../CashCode';
import { AuditExportDesk } from '../AuditExports';
import { framingSection } from './blurbs';
import { summarise } from '../../lib/vetting';
import { settingsScreen } from '../../lib/settings';
import { usePortal } from './context';
import { Frame } from './Frame';

/* The four operational categories — Dispatch & Incidents, Vetting, Quality and Audit — drawn from the
 * Control Tower workspace's own screens, unchanged (§6.3: "they move into the merged portal
 * unchanged"). What the portal adds is only what the merge moved: the back office's Operations tab was
 * split across Dispatch and Incidents (docs/control-tower-tab-inventory.md), so its two figures about
 * who vetting is keeping off the board join the Dispatch strip, and its link into the field-safety
 * settings lands under Incidents — the decision recorded in packages/catalog/control-tower-portal.json
 * #decisions, for whoever signs the cutover to accept or change. */

/* The same lazy screens the workspace fetched on opening its incidents or its dispatch board, and for
   the same reason: they carry every engine's settings through lib/settings. */
const SafeguardingDesk = lazy(() => import('../Sentinel').then(m => ({ default: m.SafeguardingDesk })));
const SafeguardingReport = lazy(() => import('../Sentinel').then(m => ({ default: m.SafeguardingReport })));
const DeviceRegistryDesk = lazy(() => import('../Devices').then(m => ({ default: m.DeviceRegistryDesk })));
const Movement = lazy(() => import('../Movement').then(m => ({ default: m.MovementSurface })));

/* The strip the Control Tower workspace drew over both of its boards, read from the one place it is
   written. The first figure leads, because the strip is ordered urgency-first. */
function TowerStrip({ extra = [] }: { extra?: { label: string; value: string; chip: string; flagged: boolean }[] }) {
 const figures = [...controlTowerFigures(), ...extra];
 return <Metrics>{figures.map((f, i) =>
  <Metric key={f.label} label={f.label} value={f.value} chip={f.chip} flagged={f.flagged} lead={i === 0}/>)}</Metrics>;
}

export function DispatchCategory() {
 const { place, open, vetting, go, setSettingsEngine } = usePortal();
 /* Counted off the same register the board gates on, never typed: an operator wants to know how many
    names cannot be used today, so the count is of parties, not of checks. */
 const blocking = (roleId?: string) => vetting.subjects.filter(s => (!roleId || s.roleId === roleId) && !summarise(s).cleared).length;
 if (place.tab === 'incidents') return <Frame blurb={framingSection('Incidents')}>
  <TowerStrip/>
  <SafetyDesk/><SosDesk/>
  <Suspense fallback={null}><SafeguardingDesk/><SafeguardingReport workspace="control-tower"/></Suspense>
  <ConcernBoard/>
  <IncidentBoard open={open} notice={false}/>
  <HeldCashPayments/>
  <Suspense fallback={null}><DeviceRegistryDesk/></Suspense>
  {/* The field-safety settings, from under the board whose waits they decide. */}
  <div className="privacy-note space-top cf-link"><TimerReset size={19}/><span>{settingsScreen.operationsNote}</span>
   <button className="secondary" onClick={() => { setSettingsEngine('safety'); go('configuration', 'tree'); }}>{settingsScreen.operationsOpen}</button></div>
 </Frame>;
 return <Frame>
  <TowerStrip extra={[
   { label: 'Parties blocking work', value: String(blocking()), chip: `Of ${vetting.subjects.length} on the register`, flagged: false },
   { label: 'Nurses blocked', value: String(blocking('nurse')), chip: 'Refused on the board, with the reason', flagged: false }
  ]}/>
  <DispatchBoard subjects={vetting.subjects}/>
  <ShiftBoard/>
  <Suspense fallback={null}><Movement of="desk"/></Suspense>
 </Frame>;
}

export function VettingCategory() {
 const { open, vetting } = usePortal();
 return <Frame><VettingQueue open={open} vetting={vetting}/></Frame>;
}

export function QualityCategory() {
 const { open } = usePortal();
 return <Frame><QualityBoard open={open}/></Frame>;
}

export function AuditCategory() {
 return <Frame><AuditExportDesk/></Frame>;
}
