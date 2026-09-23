/* Device Lab simulator: synthetic readings for testing and demonstration.
 *
 * Every reading this module produces carries source: "simulator" and quality: "synthetic".
 * The simulator-as-real refusal (422) in packages/catalog/apis/devices.json fires if any consumer
 * treats these as clinical data. Nothing here contacts a real instrument, phone or watch.
 *
 * The presets are packages/catalog/devices/simulator-presets.json's. This module reads them,
 * computes timestamps from the offsets each reading carries, and produces session objects the
 * Device Lab screen renders.
 *
 * Zero external dependencies. No npm packages. The engine runtime is not used: the simulator
 * generates readings in-process for the web preview and for tests, never through a route.
 */
import presetCatalog from '../../../catalog/devices/simulator-presets.json' with { type: 'json' };

/* ---- Types ------------------------------------------------------------------------------------ */

export interface PresetReading {
  readonly type: string;
  readonly value: number;
  readonly unit: string;
  readonly timestamp_offset_ms: number;
}

export interface PresetDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly readings: readonly PresetReading[];
}

export interface SimulatorReading {
  readonly type: string;
  readonly value: number;
  readonly unit: string;
  readonly timestamp: string;
  readonly source: 'simulator';
  readonly quality: 'synthetic';
  readonly presetId: string;
}

export interface SimulatorSession {
  readonly id: string;
  readonly presetId: string;
  readonly startedAt: string;
  readonly readings: readonly SimulatorReading[];
  readonly active: boolean;
}

/* ---- Catalog access --------------------------------------------------------------------------- */

const presets = presetCatalog.presets as unknown as PresetDefinition[];

/** List all available simulator presets (id, name, description). */
export function listPresets(): Array<{ id: string; name: string; description: string }> {
  return presets.map(p => ({ id: p.id, name: p.name, description: p.description }));
}

/** Get a single preset definition by id, or null if not found. */
export function getPreset(presetId: string): PresetDefinition | null {
  return presets.find(p => p.id === presetId) ?? null;
}

/* ---- Reading generation ----------------------------------------------------------------------- */

let sessionCounter = 0;

/**
 * Generate all readings for a preset with timestamps computed from `now` + offset.
 * Every reading carries source: "simulator" and quality: "synthetic".
 */
export function generateReadings(presetId: string, now?: number): SimulatorReading[] {
  const preset = getPreset(presetId);
  if (!preset) return [];
  const base = now ?? Date.now();
  return preset.readings.map(r => ({
    type: r.type,
    value: r.value,
    unit: r.unit,
    timestamp: new Date(base + r.timestamp_offset_ms).toISOString(),
    source: 'simulator' as const,
    quality: 'synthetic' as const,
    presetId: preset.id,
  }));
}

/**
 * Create a new simulator session for a preset.
 * The session starts with all readings at offset 0 (the first batch).
 */
export function createSimulatorSession(presetId: string, sessionId?: string): SimulatorSession {
  const now = Date.now();
  const id = sessionId ?? `sim-session-${++sessionCounter}-${now.toString(36)}`;
  const preset = getPreset(presetId);
  if (!preset) {
    return { id, presetId, startedAt: new Date(now).toISOString(), readings: [], active: false };
  }
  /* The first batch: all readings whose offset is the minimum offset in the preset. */
  const minOffset = Math.min(...preset.readings.map(r => r.timestamp_offset_ms));
  const firstBatch = preset.readings
    .filter(r => r.timestamp_offset_ms === minOffset)
    .map(r => ({
      type: r.type,
      value: r.value,
      unit: r.unit,
      timestamp: new Date(now + r.timestamp_offset_ms).toISOString(),
      source: 'simulator' as const,
      quality: 'synthetic' as const,
      presetId: preset.id,
    }));
  return { id, presetId, startedAt: new Date(now).toISOString(), readings: firstBatch, active: true };
}

/**
 * Advance a session to the next batch of readings based on timestamp_offset_ms progression.
 * Returns a new session object with the next set of readings appended.
 * If all readings have been delivered, the session becomes inactive.
 *
 * Progression is anchored to the session's startedAt, not the wall clock: the offsets already
 * delivered are recovered from each reading's timestamp relative to startedAt, so repeated
 * advances step through the preset's offsets in order no matter how much real time passes
 * between calls. `_now` is accepted for signature compatibility and deliberately unused — a
 * drifting base would repeat the first batch instead of advancing.
 */
export function advanceSession(session: SimulatorSession, _now?: number): SimulatorSession {
  const preset = getPreset(session.presetId);
  if (!preset || !session.active) return { ...session, active: false };

  const base = Date.parse(session.startedAt);
  /* The unique sorted offsets in the preset. */
  const offsets = [...new Set(preset.readings.map(r => r.timestamp_offset_ms))].sort((a, b) => a - b);
  /* Offsets already delivered, recovered relative to the session start so the comparison is
     independent of when this is called. */
  const deliveredOffsets = new Set(session.readings.map(r => Date.parse(r.timestamp) - base));

  const nextOffset = offsets.find(offset => !deliveredOffsets.has(offset));
  if (nextOffset === undefined) {
    /* All readings delivered — session complete. */
    return { ...session, active: false };
  }

  /* Generate readings for the next offset, timestamped from the session start. */
  const nextBatch: SimulatorReading[] = preset.readings
    .filter(r => r.timestamp_offset_ms === nextOffset)
    .map(r => ({
      type: r.type,
      value: r.value,
      unit: r.unit,
      timestamp: new Date(base + r.timestamp_offset_ms).toISOString(),
      source: 'simulator' as const,
      quality: 'synthetic' as const,
      presetId: preset.id,
    }));

  const isLastOffset = nextOffset === offsets[offsets.length - 1];
  return {
    ...session,
    readings: [...session.readings, ...nextBatch],
    active: !isLastOffset,
  };
}

/**
 * Get all unique timestamp offsets for a preset, sorted ascending.
 * Useful for determining the interval at which to advance a session.
 */
export function presetOffsets(presetId: string): number[] {
  const preset = getPreset(presetId);
  if (!preset) return [];
  return [...new Set(preset.readings.map(r => r.timestamp_offset_ms))].sort((a, b) => a - b);
}
