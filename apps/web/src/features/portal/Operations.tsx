import { Suspense, lazy, type ComponentType } from "react";
import { ArrowRight, Ban, ClipboardList, Siren, TimerReset, TriangleAlert, UserRoundCheck, UserX } from "lucide-react";
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
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
import { MyThusoVisitIcon } from "../../ui/icons/MyThusoIcons.generated";
import { portalContract } from "../../lib/portal";
import { deskRows, useFieldSafety } from "../../lib/field-safety";
import { deskRowsOf, useSosDesk } from "../../lib/sos-desk";

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
/* The handoff's stat cards each carry an icon tile (30 September 2026). Keyed to the figure's own label,
   so an icon can never sit on a figure it does not describe; a figure with no entry here simply has no
   tile, and the label under it is what tells two figures apart, as it always was. Decorative and hidden
   from a screen reader: the label says the same thing in words. */
const STRIP_ICONS: Readonly<Record<string, ComponentType<{ "aria-hidden"?: boolean | "true" }>>> = {
  "Visits on the board": ClipboardList,
  "Nurses on duty": UserRoundCheck,
  "Open incidents": TriangleAlert,
  "Parties blocking work": Ban,
  "Nurses blocked": UserX,
};
function TowerStrip({ extra = [] }: { extra?: StripFigure[] }) {
  const figures: StripFigure[] = [...controlTowerFigures(), ...extra];
  return (
    <Metrics>
      {figures.map((f, i) => {
        const Icon = STRIP_ICONS[f.label];
        return (
        <Card key={f.label} padding="md" variant={i === 0 ? "elevated" : "default"} className={`pt-strip-figure${i === 0 ? " is-lead" : ""}${Icon ? " has-icon" : ""}`}>
          {Icon && <span className="pt-strip-icon"><Icon aria-hidden="true" /></span>}
          <Metric
            label={f.label}
            value={f.value}
            chip={f.chip}
            flagged={f.flagged}
            lead={i === 0}
            visual={f.share === undefined ? undefined : <Ring share={f.share} size={56} />}
          />
        </Card>
        );
      })}
    </Metrics>
  );
}

/* The handoff's panic banner, held still, at the top of Dispatch (30 September 2026). Three counts, each
   read off the same desk state the Incidents tab draws its rows from — the field-safety queue's open
   panics and overdue check-ins, the SOS desk's presses not stood down — so every figure can be checked by
   opening Incidents and counting. Nothing is drawn while all three are nought. It takes the controller to
   Incidents and does nothing else: picking up, closing and resolving stay on the rows, where the reason
   for each is asked. The words are packages/catalog/control-tower-portal.json#fieldAlert. */
function FieldAlert() {
  const { go } = usePortal();
  const field = deskRows(useFieldSafety()).filter((row) => row.open);
  const sos = deskRowsOf(useSosDesk()).filter((row) => !row.stoodDown);
  const say = portalContract.fieldAlert;
  const counts = [
    { label: say.nursePanics, value: field.filter((row) => row.kind === "panic").length },
    { label: say.patientSos, value: sos.length },
    { label: say.overdue, value: field.filter((row) => row.kind === "overdue").length },
  ];
  if (counts.every((c) => c.value === 0)) return null;
  return (
    <Alert variant="danger" role="status" className="pt-field-alert" title={say.heading} icon={<Siren aria-hidden="true" />}>
      <ul className="pt-field-alert-counts">
        {counts.map((c) => (
          <li key={c.label}>
            <span>{c.label}</span>
            <strong>{c.value}</strong>
          </li>
        ))}
      </ul>
      <Button variant="destructive" size="sm" className="pt-field-alert-go" trailingIcon={<ArrowRight aria-hidden="true" />} onClick={() => go("dispatch", "incidents")}>
        {say.open}
      </Button>
    </Alert>
  );
}

export function DispatchCategory() {
  const { audience, place, open, vetting, go, setSettingsEngine } = usePortal();
  /* Counted off the same register the board gates on, never typed: an operator wants to know how many
    names cannot be used today, so the count is of parties, not of checks. */
  const blocking = (roleId?: string) =>
    vetting.subjects.filter(
      (s) => (!roleId || s.roleId === roleId) && !summarise(s).cleared,
    ).length;
  const nurses = vetting.subjects.filter((s) => s.roleId === "nurse").length;

  if (place.tab === "incidents")
    return (
      <Frame blurb={framingSection("Incidents")} icon={<MyThusoVisitIcon aria-hidden="true" />}>
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
      <FieldAlert />
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
      {/* The audience decides whether the field-safety overlay is drawn, and this portal serves two of
          them: the Control Tower, whose subject is an operator the desk queue's route admits, and the
          back office, whose is an admin it does not. Handing the audience down is what keeps a nurse's
          open panic off the funding view. */}
      <DispatchBoard subjects={vetting.subjects} audience={audience} />
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
