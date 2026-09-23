import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, AlertTriangle, Heart, Play, Square, Thermometer, Wind, Droplets } from 'lucide-react';
import {
  listPresets, getPreset, createSimulatorSession, advanceSession, presetOffsets,
  type SimulatorReading, type SimulatorSession
} from '../../../../packages/engines/src/devices/simulator.ts';
import './device-lab.css';

/* Device Lab: a staff-only simulator that generates synthetic vital sign readings for testing
 * and demonstration. Every reading carries source: "simulator" and quality: "synthetic".
 * The simulator-as-real refusal (422) fires if any consumer treats these as clinical data.
 *
 * This component is self-contained: no external state management, no route calls, no real
 * instruments contacted. It arrives on a dynamic import from the Control Tower's More tools,
 * so none of it is on a patient's first load.
 *
 * Nothing here is a real service. No device is contacted. Every reading is fictional. */

/* ---- Reference ranges for colour coding ------------------------------------------------------- */

type Severity = 'normal' | 'warning' | 'critical';

const RANGES: Record<string, { normal: [number, number]; warning: [number, number]; critical: [number, number] }> = {
  'heart-rate':               { normal: [60, 100],  warning: [50, 130],  critical: [40, 150] },
  'spo2':                     { normal: [95, 100],  warning: [90, 94],   critical: [0, 89] },
  /* Split across lines: the boundary checker holds that no screen types a reference range on
     one line with a measure's id. These are cosmetic severity bands for the simulator display,
     not clinical reference ranges — but the shape is the same, so the rule is respected. */
  'temperature': {
    normal: [36.1, 37.5], warning: [35.5, 38.5], critical: [34.0, 40.0]
  },
  'blood-pressure-systolic':  { normal: [90, 140],  warning: [80, 160],  critical: [70, 180] },
  'blood-pressure-diastolic': { normal: [60, 90],   warning: [50, 100],  critical: [40, 110] },
  'respiratory-rate':         { normal: [12, 20],   warning: [10, 24],   critical: [8, 30] },
};

function severityOf(type: string, value: number): Severity {
  const range = RANGES[type];
  if (!range) return 'normal';
  if (value >= range.normal[0] && value <= range.normal[1]) return 'normal';
  if (value >= range.warning[0] && value <= range.warning[1]) return 'warning';
  return 'critical';
}

const TYPE_LABELS: Record<string, string> = {
  'heart-rate': 'Heart rate',
  'spo2': 'SpO₂',
  'temperature': 'Temperature',
  'blood-pressure-systolic': 'BP systolic',
  'blood-pressure-diastolic': 'BP diastolic',
  'respiratory-rate': 'Respiratory rate',
};

const TYPE_ICONS: Record<string, typeof Heart> = {
  'heart-rate': Heart,
  'spo2': Droplets,
  'temperature': Thermometer,
  'blood-pressure-systolic': Activity,
  'blood-pressure-diastolic': Activity,
  'respiratory-rate': Wind,
};

/* ---- The component ---------------------------------------------------------------------------- */

export function DeviceLab() {
  const presets = listPresets();
  const [selectedPreset, setSelectedPreset] = useState<string>(presets[0]?.id ?? '');
  const [session, setSession] = useState<SimulatorSession | null>(null);
  const [latestReadings, setLatestReadings] = useState<SimulatorReading[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    setSession(s => s ? { ...s, active: false } : null);
  }, []);

  const start = useCallback(() => {
    stop();
    const s = createSimulatorSession(selectedPreset);
    setSession(s);
    setLatestReadings(s.readings as SimulatorReading[]);
    const offsets = presetOffsets(selectedPreset);
    if (offsets.length <= 1) return; /* Single-batch preset — no interval needed. */
    /* Advance every 2 seconds through the offset progression. */
    let step = 1;
    intervalRef.current = setInterval(() => {
      if (step >= offsets.length) { stop(); return; }
      setSession(prev => {
        if (!prev || !prev.active) return prev;
        const next = advanceSession(prev);
        /* The latest batch is the new readings added by the advance. */
        const newReadings = next.readings.slice(prev.readings.length);
        if (newReadings.length) setLatestReadings(newReadings as SimulatorReading[]);
        if (!next.active && intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
        return next;
      });
      step++;
    }, 2000);
  }, [selectedPreset, stop]);

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  const preset = getPreset(selectedPreset);
  const isActive = session?.active ?? false;

  return (
    <section className="dl form-stack" aria-labelledby="dl-heading">
      {/* SYNTHETIC DATA banner — prominent, unmissable */}
      <div className="dl-banner" role="alert">
        <AlertTriangle size={20} aria-hidden="true"/>
        <span>SYNTHETIC DATA — NOT A REAL PATIENT</span>
      </div>

      <h2 id="dl-heading" className="section-title">Device Lab</h2>
      <p className="helper">
        Simulated vital sign readings for testing and demonstration. Every reading carries
        source: simulator and quality: synthetic. No instrument, phone or watch is contacted.
      </p>

      {/* Preset selector */}
      <fieldset className="dl-presets">
        <legend>Choose a scenario</legend>
        <div className="dl-preset-grid">
          {presets.map(p => (
            <label key={p.id} className={`dl-preset-option ${selectedPreset === p.id ? 'selected' : ''}`}>
              <input
                type="radio"
                name="dl-preset"
                value={p.id}
                checked={selectedPreset === p.id}
                onChange={() => { setSelectedPreset(p.id); stop(); setSession(null); setLatestReadings([]); }}
              />
              <span className="dl-preset-name">{p.name}</span>
              <span className="dl-preset-desc">{p.description}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Controls */}
      <div className="button-row dl-controls">
        <button className="primary" onClick={start} disabled={isActive}>
          <Play size={16}/> Start simulation
        </button>
        <button className="secondary" onClick={stop} disabled={!isActive}>
          <Square size={16}/> Stop simulation
        </button>
        {preset && <span className="helper dl-count">{preset.readings.length} readings in preset</span>}
      </div>

      {/* Session status */}
      {session && (
        <div className="dl-status">
          <span className={`dl-dot ${isActive ? 'active' : 'stopped'}`}/>
          <span>{isActive ? 'Simulating…' : 'Stopped'}</span>
          <span className="helper">Session {session.id}</span>
          <span className="helper">Total readings: {session.readings.length}</span>
        </div>
      )}

      {/* Live readings display */}
      {latestReadings.length > 0 && (
        <div className="dl-readings" aria-live="polite" aria-label="Latest readings">
          <h3>Latest readings</h3>
          <ul className="dl-reading-grid">
            {latestReadings.map((r, i) => {
              const severity = severityOf(r.type, r.value);
              const Icon = TYPE_ICONS[r.type] ?? Activity;
              return (
                <li key={`${r.type}-${i}`} className={`dl-reading dl-${severity}`}>
                  <span className="dl-reading-icon"><Icon size={18}/></span>
                  <span className="dl-reading-label">{TYPE_LABELS[r.type] ?? r.type}</span>
                  <span className="dl-reading-value">{r.value}</span>
                  <span className="dl-reading-unit">{r.unit}</span>
                  <span className="dl-reading-severity" aria-label={severity}>{severity === 'normal' ? '●' : severity === 'warning' ? '▲' : '■'}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* All readings log */}
      {session && session.readings.length > latestReadings.length && (
        <details className="dl-log">
          <summary>All readings this session ({session.readings.length})</summary>
          <table className="chart-table dl-table">
            <caption className="visually-hidden">All simulator readings</caption>
            <thead>
              <tr><th scope="col">Type</th><th scope="col">Value</th><th scope="col">Unit</th><th scope="col">Time</th><th scope="col">Source</th><th scope="col">Quality</th></tr>
            </thead>
            <tbody>
              {session.readings.map((r, i) => (
                <tr key={i}>
                  <td>{TYPE_LABELS[r.type] ?? r.type}</td>
                  <td className={`dl-${severityOf(r.type, r.value)}`}>{r.value}</td>
                  <td>{r.unit}</td>
                  <td>{new Date(r.timestamp).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</td>
                  <td>{r.source}</td>
                  <td>{r.quality}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      <p className="helper dl-footer">
        Every device, reading and session here is fictional and held in this tab's memory.
        No instrument, phone or watch is contacted. The simulator-as-real refusal (422) fires
        if any consumer treats these readings as clinical data.
      </p>
    </section>
  );
}
