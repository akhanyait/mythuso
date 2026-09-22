import vitalsContract from "../../../../packages/catalog/vitals.json" with { type: "json" };
import { detectPHI } from "../../../../packages/gilbertone/src/phi.ts";

/* Vital-sign validation for /assistant/v1/vitals, added 22 September 2026.

   Every rule here is read from packages/catalog/vitals.json — the accepted types with their LOINC codes
   and UCUM units, the plausibility bounds a value must sit inside, the staleness window, the device
   allowlist and the sources — so nothing clinical is decided in code and a change to what is accepted is
   a catalog edit, not a handler edit. What this module does is refuse: an unregistered type or device, a
   unit that does not match the type, a value outside its bound, a reading older than the staleness
   window, and any string that carries an identity-shaped value (run through the same PHI detector the
   turn route uses). A refused reading is never stored.

   This is validation, not interpretation. It says whether a number is shaped like the reading it claims
   to be; it never says what the number means for a patient, never scores and never triages. Deciding
   that a heart rate is concerning is Clinical's, under a ratified protocol, and there is none. */

export type VitalSource = "manual" | "device" | "healthkit" | "healthconnect";

export interface VitalInput {
  type?: unknown;
  value?: unknown;
  unit?: unknown;
  capturedAt?: unknown;
  source?: unknown;
  deviceRef?: unknown;
}

/* A reading that passed validation, in the shape the observation store keeps and a handover pack reads.
   The value stays a number and the unit a UCUM string; nothing identifying survives, because an
   identity-shaped string was refused before it got here. */
export interface StoredReading {
  type: string;
  loinc: string;
  value: number;
  unit: string;
  capturedAt: string;
  source: VitalSource;
}

export type VitalVerdict =
  | { ok: true; reading: StoredReading }
  | { ok: false; refusalId: string; status: number };

interface VitalType {
  id: string;
  loinc: string;
  unit: string;
  min: number;
  max: number;
}

const types = vitalsContract.types as VitalType[];
const sources = vitalsContract.sources as VitalSource[];
const allowlist = vitalsContract.deviceAllowlist.real as string[];
const maxAgeMs = vitalsContract.staleness.maxAgeMs as number;

const refuse = (refusalId: string, status: number): VitalVerdict => ({
  ok: false,
  refusalId,
  status,
});

/* A value is identity-shaped when the PHI detector finds anything in it — an identity number, a phone
   number, an email or a medical-aid number riding in a field that should hold a type, a unit or a
   device reference. Such a reading is refused rather than redacted-and-stored: a clinical value with a
   person's identity number inside it is not a reading this service should be holding at all. */
const identityShaped = (...values: (string | undefined)[]): boolean =>
  values.some(
    (v) => typeof v === "string" && v.length > 0 && detectPHI(v).length > 0,
  );

export function validateVital(input: VitalInput, now: number): VitalVerdict {
  const type = typeof input.type === "string" ? input.type.trim() : "";
  const unit = typeof input.unit === "string" ? input.unit.trim() : "";
  const source = typeof input.source === "string" ? input.source.trim() : "";
  const deviceRef =
    typeof input.deviceRef === "string" && input.deviceRef.trim()
      ? input.deviceRef.trim()
      : undefined;
  const capturedAt =
    typeof input.capturedAt === "string" ? input.capturedAt.trim() : "";

  /* An identity-shaped value in any string field is refused first, before it is parsed as anything. */
  if (identityShaped(type, unit, source, deviceRef, capturedAt))
    return refuse("reading-not-validated", 422);

  if (!sources.includes(source as VitalSource))
    return refuse("reading-not-validated", 422);

  const vitalType = types.find((t) => t.id === type);
  if (!vitalType) return refuse("reading-not-validated", 422);
  if (unit !== vitalType.unit) return refuse("reading-not-validated", 422);

  const value = input.value;
  if (typeof value !== "number" || !Number.isFinite(value))
    return refuse("reading-not-validated", 422);
  if (value < vitalType.min || value > vitalType.max)
    return refuse("reading-not-validated", 422);

  /* A real device, a HealthKit source and a Health Connect source must name a device on the allowlist,
     which is empty until a DPIA has been done — so every one of them is refused as an unregistered
     device. A manual reading carries no device and needs none. */
  if (source !== "manual") {
    if (!deviceRef || !allowlist.includes(deviceRef))
      return refuse("unregistered-device", 422);
  }

  const captured = Date.parse(capturedAt);
  if (Number.isNaN(captured)) return refuse("reading-not-validated", 422);
  const age = now - captured;
  /* Older than the staleness window is stale; more than a minute in the future is a clock that cannot be
     trusted as a timestamp. Either way the reading is refused rather than handed on as current. */
  if (age > maxAgeMs || age < -60_000)
    return refuse("reading-not-validated", 422);

  return {
    ok: true,
    reading: {
      type: vitalType.id,
      loinc: vitalType.loinc,
      value,
      unit: vitalType.unit,
      capturedAt,
      source: source as VitalSource,
    },
  };
}
