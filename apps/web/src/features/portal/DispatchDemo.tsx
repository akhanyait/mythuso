import dispatchDemo from "../../../../../packages/catalog/dispatch-demo.json" with { type: "json" };
import { useState } from "react";
import { Region } from "./Parts";

/* ── DEMO DATA — for show and tell only ──────────────────────────────────────────────────────────
 * This entire component reads from packages/catalog/dispatch-demo.json, which holds invented
 * figures for the Dispatch & Incidents mockup. No real crime feed, load-shedding API, roster or
 * alert log is connected yet (gate G22 is open). Every zone, name, alert and risk level below is a
 * demonstration value. When the SAPS/Eskom feeds exist, this file is replaced. */

type Precinct = { id: string; label: string; risk: string; nurses: number };
type RosterEntry = {
  id: string;
  name: string;
  zone: string;
  status: string;
  riskChip: string;
};
type Alert = {
  id: string;
  severity: string;
  title: string;
  detail: string;
  time: string;
};

/* A schematic precinct map drawn as coloured rectangles. Each zone is a token-ground fill based on
   its risk level; the stones between them are hairlines. No real geography — the approved mockup
   calls it a schematic, and the demo data holds no coordinates. */
function SchematicMap({ precincts }: { precincts: Precinct[] }) {
  const riskGround = (risk: string) => {
    if (risk === "high") return "var(--danger-soft)";
    if (risk === "medium") return "var(--mango-soft)";
    return "var(--pale-sage)";
  };
  const riskInk = (risk: string) => {
    if (risk === "high") return "var(--danger)";
    if (risk === "medium") return "var(--ink)";
    return "var(--charcoal)";
  };
  return (
    <div
      className="pt-demo-map"
      role="img"
      aria-label="Schematic precinct map, demonstration data"
    >
      <svg viewBox="0 0 280 200" className="pt-demo-map-svg">
        {precincts.map((p, i) => {
          const col = i % 2;
          const row = Math.floor(i / 2);
          const x = col * 144 + 4;
          const y = row * 104 + 4;
          return (
            <g key={p.id}>
              <rect
                x={x}
                y={y}
                width={132}
                height={92}
                rx={8}
                fill={riskGround(p.risk)}
                stroke="var(--stone)"
                strokeWidth={1}
              />
              <text
                x={x + 10}
                y={y + 22}
                fill={riskInk(p.risk)}
                fontSize={14}
                fontWeight={600}
              >
                {p.label}
              </text>
              <text x={x + 10} y={y + 42} fill={riskInk(p.risk)} fontSize={12}>
                {p.nurses} nurses
              </text>
              <text
                x={x + 10}
                y={y + 60}
                fill={riskInk(p.risk)}
                fontSize={11}
                opacity={0.7}
              >
                {p.risk} risk
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* A small risk-trend sparkline: seven bars, one per day of the week, each filled to the level. */
function RiskTrendSparkline({
  trend,
}: {
  trend: Array<{ date: string; level: number }>;
}) {
  const W = 200;
  const H = 48;
  const max = 5;
  const barW = W / trend.length - 4;
  return (
    <div className="pt-demo-sparkline">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Risk trend this week"
        className="chart-plot"
      >
        {trend.map((t, i) => {
          const h = (t.level / max) * (H - 4);
          const x = i * (barW + 4) + 2;
          const y = H - h - 2;
          return (
            <rect
              key={t.date}
              x={x}
              y={y}
              width={barW}
              height={h}
              rx={2}
              className="pt-demo-spark-bar"
            />
          );
        })}
      </svg>
      <div className="pt-demo-chart-labels">
        {trend.map((t) => (
          <span key={t.date}>{t.date}</span>
        ))}
      </div>
    </div>
  );
}

export function DispatchDemo() {
  const data = dispatchDemo as typeof dispatchDemo;
  const precincts = data.map.precincts as Precinct[];
  const roster = data.roster as RosterEntry[];
  const alerts = data.alerts as Alert[];
  const mode = data.deploymentMode as {
    current: string;
    options: Array<{ id: string; label: string }>;
  };
  const trend = data.riskTrend as Array<{ date: string; level: number }>;
  const loadShedding = data.loadShedding as {
    active: boolean;
    stage: number;
    overlay: string;
  };

  const [activeMode, setActiveMode] = useState(mode.current);

  const statusChipClass = (status: string) => {
    if (status === "missed-check-in") return "pt-status is-degraded";
    if (status === "off-duty") return "pt-status is-dark";
    return "pt-status is-connected";
  };

  const alertClass = (severity: string) => {
    if (severity === "escalation") return "pt-demo-alert is-escalation";
    return "pt-demo-alert is-warning";
  };

  return (
    <>
      {/* ── DEMO DATA — for show and tell only ── */}
      <div className="pt-demo-banner" role="note">
        <strong>DEMO DATA — for show and tell only.</strong>
        <span>
          The map, roster, alerts and risk trend below read invented figures
          from a demonstration file. No real crime feed, load-shedding API or
          roster is connected yet (gate G22 is open). Replace with the
          SAPS/Eskom feeds when they exist.
        </span>
      </div>

      <Region title="Schematic precinct map (demo)">
        <SchematicMap precincts={precincts} />
        {!loadShedding.active && (
          <p className="helper">{loadShedding.overlay}</p>
        )}
      </Region>

      <Region title="Live roster (demo)" count={roster.length}>
        <div className="pt-demo-roster">
          {roster.map((r) => (
            <div key={r.id} className="pt-demo-roster-row">
              <strong>{r.name}</strong>
              <span className="pt-demo-roster-zone">
                {precincts.find((p) => p.id === r.zone)?.label ?? r.zone}
              </span>
              <span className={statusChipClass(r.status)}>{r.status}</span>
            </div>
          ))}
        </div>
      </Region>

      <Region title="Alerts (demo)" count={alerts.length}>
        <div className="pt-demo-alerts">
          {alerts.map((a) => (
            <div key={a.id} className={alertClass(a.severity)} role="alert">
              <strong>{a.title}</strong>
              <span>{a.detail}</span>
              <span className="pt-demo-alert-time">{a.time}</span>
            </div>
          ))}
        </div>
      </Region>

      <Region title="Deployment mode (demo)">
        <div
          className="pt-demo-segmented"
          role="radiogroup"
          aria-label="Deployment mode"
        >
          {mode.options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={activeMode === opt.id}
              className={`pt-demo-seg-button ${activeMode === opt.id ? "is-active" : ""}`}
              onClick={() => setActiveMode(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </Region>

      <Region title="Risk trend this week (demo)">
        <RiskTrendSparkline trend={trend} />
      </Region>
    </>
  );
}
