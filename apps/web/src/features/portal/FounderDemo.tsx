import founderDemo from "../../../../../packages/catalog/founder-dashboard-demo.json" with { type: "json" };
import { useState } from "react";
import { Region, toneOf } from "./Parts";
import { Switch } from "./Fields";
import { Alert } from "../../ui/Alert";
import { Badge } from "../../ui/Badge";

/* ── DEMO DATA — for show and tell only ──────────────────────────────────────────────────────────
 * This entire component reads from packages/catalog/founder-dashboard-demo.json, which holds
 * invented figures for the Founder / Super User dashboard mockup. No real system-health history,
 * deploy log, key metadata or break-glass state is connected yet. Every number, ring and row below
 * is a demonstration value. When the real deploy/health log exists, this file is replaced. */

/* A progress ring drawn as an SVG arc. The value and total come from the demo file; the centre
 * numeral and the label beneath it are the only things a reader sees. */
function ProgressRing({
  label,
  value,
  total,
  unit,
}: {
  label: string;
  value: number;
  total: number;
  unit: string;
}) {
  const size = 96;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = total > 0 ? value / total : 0;
  const offset = circumference * (1 - ratio);
  return (
    <div
      className="pt-demo-ring"
      role="img"
      aria-label={`${label}: ${value} ${unit} of ${total}`}
    >
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="pt-demo-ring-track"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="pt-demo-ring-fill"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          className="pt-demo-ring-num"
        >
          {value}
        </text>
      </svg>
      <span className="pt-demo-ring-label">{label}</span>
      <span className="pt-demo-ring-unit">{unit}</span>
    </div>
  );
}

/* A small bar sparkline for the deploy history. Each bar's height is proportional to its value;
   the tallest bar fills the plot height. */
function DeploySparkline({
  points,
  target,
}: {
  points: number[];
  target: string;
}) {
  const W = 260;
  const H = 48;
  const max = Math.max(...points, 1);
  const barW = W / points.length - 2;
  return (
    <div className="pt-demo-sparkline">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Recent deploys sparkline"
        className="chart-plot"
      >
        {points.map((v, i) => {
          const h = (v / max) * (H - 4);
          const x = i * (barW + 2) + 1;
          const y = H - h - 2;
          return (
            <rect
              key={i}
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
      <span className="pt-demo-spark-target">{target}</span>
    </div>
  );
}

export function FounderDashboardDemo() {
  const [breakGlassOn, setBreakGlassOn] = useState(false);
  const data = founderDemo as typeof founderDemo;
  const rings = data.rings as Array<{
    id: string;
    label: string;
    value: number;
    total: number;
    unit: string;
  }>;
  const vault = data.vault as Array<{
    id: string;
    label: string;
    masked: string;
    status: string;
  }>;
  const health = data.systemHealth as Array<{
    id: string;
    label: string;
    state: string;
    uptime: string;
  }>;
  const spark = data.deploySparkline as {
    label: string;
    target: string;
    points: number[];
  };
  const bg = data.breakGlass as {
    state: string;
    label: string;
    audited: boolean;
    why: string;
  };

  return (
    <>
      {/* ── DEMO DATA — for show and tell only ── */}
      <Alert variant="warning" role="note" className="pt-demo-banner" title="DEMO DATA — for show and tell only.">
        <p>
          The Founder dashboard below reads invented figures from a
          demonstration file. No real deploy history, key metadata or
          system-health log is connected yet. Replace when the deploy/health log
          exists.
        </p>
      </Alert>

      <Region title="System health at a glance (demo)" count={rings.length}>
        <div className="pt-demo-rings-row">
          {rings.map((r) => (
            <ProgressRing
              key={r.id}
              label={r.label}
              value={r.value}
              total={r.total}
              unit={r.unit}
            />
          ))}
        </div>
      </Region>

      <Region title="Vault panel (demo)" count={vault.length}>
        <div className="pt-demo-vault">
          {vault.map((k) => (
            <div key={k.id} className="pt-demo-vault-row">
              <strong>{k.label}</strong>
              <code className="pt-demo-vault-masked">{k.masked}</code>
              <Badge
                variant={toneOf(k.status === "configured" ? "connected" : k.status)}
                size="sm"
                dot
                className={`pt-status is-${k.status === "configured" ? "connected" : k.status === "not-configured" ? "not-configured" : k.status}`}
              >
                {k.status}
              </Badge>
            </div>
          ))}
          <p className="pt-demo-vault-note">
            In a live system, each key would be revealed one at a time with a
            fresh authenticator code, and wiped after 30 seconds.
          </p>
        </div>
      </Region>

      <Region title="Break-glass access (demo)">
        <div className="pt-demo-breakglass">
          <div className="pt-demo-toggle-row">
            <Switch
              label={
                <span className="pt-demo-toggle-label">
                  <strong>{bg.label}</strong>
                  <span>{bg.why}</span>
                </span>
              }
              checked={breakGlassOn}
              onChange={setBreakGlassOn}
              stateText={breakGlassOn ? "On" : "Off"}
            />
          </div>
          {bg.audited && <Badge variant="danger" size="sm" className="pt-demo-audit-chip">audited</Badge>}
        </div>
      </Region>

      <Region title="System health (demo)" count={health.length}>
        <div className="pt-demo-health-rows">
          {health.map((h) => (
            <div key={h.id} className="pt-demo-health-row">
              <strong>{h.label}</strong>
              <Badge variant={toneOf(h.state)} size="sm" dot className={`pt-status is-${h.state}`}>{h.state}</Badge>
              <span className="pt-demo-health-uptime">{h.uptime}</span>
            </div>
          ))}
        </div>
      </Region>

      <Region title={spark.label}>
        <DeploySparkline points={spark.points} target={spark.target} />
      </Region>
    </>
  );
}
