import { Suspense, lazy } from "react";
import { TimerReset } from "lucide-react";
import { Metric, Metrics } from "../../surface/Surface";
import {
  DispatchBoard,
  IncidentBoard,
  QualityBoard,
  ShiftBoard,
  controlTowerFigures,
} from "../Dispatch";
import { VettingQueue } from "../Vetting";
import { SafetyDesk } from "../FieldSafety";
import { SosDesk } from "../SosDesk";
import { ConcernBoard } from "../ConcernBoard";
import { HeldCashPayments } from "../CashCode";
import { AuditExportDesk } from "../AuditExports";
import { framingSection } from "./blurbs";
import { summarise } from "../../lib/vetting";
import { settingsScreen } from "../../lib/settings";
import { usePortal } from "./context";
import { Frame } from "./Frame";
import { DispatchDemo } from "./DispatchDemo";
import { Ring } from "./Parts";
import { Card } from "../../ui/Card";
import { buttonVariants } from "../../ui/Button";
import { ProvinceDemo } from "./ProvinceDemo";

/* The four operational categories — Dispatch & Incidents, Vetting, Quality and Audit — drawn from the
 * Control Tower workspace's own screens, unchanged (§6.3: "they move into the merged portal
 * unchanged"). What the portal adds is only what the merge moved: the back office's Operations tab was
 * split across Dispatch and Incidents (docs/control-tower-tab-inventory.md), so its two figures about
 * who vetting is keeping off the board join the Dispatch strip, and its link into the field-safety
 * settings lands under Incidents — the decision recorded in packages/catalog/control-tower-portal.json
 * #decisions, for whoever signs the cutover to accept or change. */

/* The same lazy screens the workspace fetched on opening its incidents or its dispatch board, and for
   the same reason: they carry every engine's settings through lib/settings. */
const SafeguardingDesk = lazy(() =>
  import("../Sentinel").then((m) => ({ default: m.SafeguardingDesk })),
);
const SafeguardingReport = lazy(() =>
  import("../Sentinel").then((m) => ({ default: m.SafeguardingReport })),
);
const DeviceRegistryDesk = lazy(() =>
  import("../Devices").then((m) => ({ default: m.DeviceRegistryDesk })),
);
const Movement = lazy(() =>
  import("../Movement").then((m) => ({ default: m.MovementSurface })),
);

/* The strip the Control Tower workspace drew over both of its boards, read from the one place it is
   written. The first figure leads, because the strip is ordered urgency-first: it is the elevated card,
   as the portal's own lead figure is (Parts.tsx#Figures). A figure that is a share of the register it
   was counted from carries a ring of that share, drawn from the same two counts as its numeral and its chip.

   Each figure is the handoff's Card holding the workspace's own Metric rather than a MetricCard: the
   parallel-run journey reads .s-metric's label, value and chip in the kept workspace and here and fails if
   they differ, so the markup inside the card is the workspace's, and portal.css gives it MetricCard's type. */
type StripFigure = { label: string; value: string; chip: string; flagged: boolean; share?: number };
function TowerStrip({ extra = [] }: { extra?: StripFigure[] }) {
  const figures: StripFigure[] = [...controlTowerFigures(), ...extra];
  return (
    <Metrics>
      {figures.map((f, i) => (
        <Card key={f.label} padding="md" variant={i === 0 ? "elevated" : "default"} className={i === 0 ? "pt-strip-figure is-lead" : "pt-strip-figure"}>
          <Metric
            label={f.label}
            value={f.value}
            chip={f.chip}
            flagged={f.flagged}
            lead={i === 0}
            visual={f.share === undefined ? undefined : <Ring share={f.share} size={56} />}
          />
        </Card>
      ))}
    </Metrics>
  );
}

export function DispatchCategory() {
  const { place, open, vetting, go, setSettingsEngine } = usePortal();
  /* Counted off the same register the board gates on, never typed: an operator wants to know how many
    names cannot be used today, so the count is of parties, not of checks. */
  const blocking = (roleId?: string) =>
    vetting.subjects.filter(
      (s) => (!roleId || s.roleId === roleId) && !summarise(s).cleared,
    ).length;
  const nurses = vetting.subjects.filter((s) => s.roleId === "nurse").length;

  if (place.tab === "incidents")
    return (
      <Frame blurb={framingSection("Incidents")}>
        <TowerStrip />
        <SafetyDesk />
        <SosDesk />
        <Suspense fallback={null}>
          <SafeguardingDesk />
          <SafeguardingReport workspace="control-tower" />
        </Suspense>
        <ConcernBoard />
        <IncidentBoard open={open} notice={false} />
        <HeldCashPayments />
        <Suspense fallback={null}>
          <DeviceRegistryDesk />
        </Suspense>
        {/* The field-safety settings, from under the board whose waits they decide. */}
        <div className="privacy-note space-top cf-link">
          <TimerReset size={19} aria-hidden="true" />
          <span>{settingsScreen.operationsNote}</span>
          <button
            type="button"
            className={buttonVariants({ variant: "secondary" })}
            onClick={() => {
              setSettingsEngine("safety");
              go("configuration", "tree");
            }}
          >
            {settingsScreen.operationsOpen}
          </button>
        </div>
      </Frame>
    );
  return (
    <Frame>
      <TowerStrip
        extra={[
          {
            label: "Parties blocking work",
            value: String(blocking()),
            chip: `Of ${vetting.subjects.length} on the register`,
            flagged: false,
            share: blocking() / vetting.subjects.length,
          },
          /* A share of the nurses on the register, so it carries the ring the figure beside it does,
            and its chip says the same arithmetic in words. */
          {
            label: "Nurses blocked",
            value: String(blocking("nurse")),
            chip: `Of ${nurses} nurses on the register`,
            flagged: false,
            share: nurses ? blocking("nurse") / nurses : 0,
          },
        ]}
      />
      <ProvinceDemo />
      <DispatchBoard subjects={vetting.subjects} />
      <ShiftBoard />
      <Suspense fallback={null}>
        <Movement of="desk" />
      </Suspense>
      {/* ── DEMO DATA — for show and tell only. Phase 4 Dispatch mockup. ── */}
      <DispatchDemo />
    </Frame>
  );
}

export function VettingCategory() {
  const { open, vetting } = usePortal();
  return (
    <Frame>
      <VettingQueue open={open} vetting={vetting} />
    </Frame>
  );
}

export function QualityCategory() {
  const { open } = usePortal();
  return (
    <Frame>
      <QualityBoard open={open} />
    </Frame>
  );
}

export function AuditCategory() {
  return (
    <Frame>
      <AuditExportDesk />
    </Frame>
  );
}
