import {
  isRegister,
  speechSettingsByDefault,
  tuningFor,
  type RegisterReading,
  type SpeechSettingsInForce,
} from "../../../../packages/engines/src/assistant/domain/settings.ts";
import type { RecognitionTuning } from "./providers/seam.ts";

/* The speech settings as this service reads them, 28 September 2026.

   WHAT IS IN FORCE, AND WHERE IT COMES FROM. Every rule — which setting means what, which register a
   knob reaches, that a clinical register reaches none — is packages/engines/src/assistant/domain/
   settings.ts's, imported and not restated, so the web preview and this service cannot apply a knob
   the other refuses. What THIS file decides is only the source of the values: a SpeechSettingsSource
   is asked afresh for every reading, so a history that changes under the service is read at the next
   answer and never held in a copy that falls behind.

   THE CONTRACT'S DEFAULTS, UNTIL THE SERVICE KEEPS A HISTORY. The settings history lives on the
   development engine runtime (packages/engines/src/assistant/engine.ts) and in the web preview's
   memory; this service has no authenticated way to ask either and keeps no history of its own yet.
   So contractDefaults below is what production reads: the defaults of packages/catalog/voice.json,
   replayed over nothing, and the Speech settings screen says so in the contract's own sentence
   rather than letting an administrator believe a change here reached a patient. The day the service
   keeps a history, the source changes and nothing else in this file does — which is why the source is
   a function and not a value.

   THE MONTHLY CEILING IS COUNTED HERE, HONESTLY. spoken-answer-monthly-ceiling-characters is counted
   in this process's memory from the moment it started, per calendar month in the deployment's own
   clock, across every provider: a reading is admitted only while the characters read so far this
   month plus its own stay under the ceiling in force, and counted once the provider has answered,
   because that is when it was billed. A restart starts the count again, and the contract says so;
   a count that survived restarts would need a store this service does not have. */

export type SpeechSettingsSource = () => SpeechSettingsInForce;
export const contractDefaults: SpeechSettingsSource = () => speechSettingsByDefault;

/** Whether a speak request's register is one the contract names. The door's own question. */
export const knownRegister = (register: string): boolean => isRegister(register);

/** What a register is read with, under the settings in force now. */
export const readingFor = (settings: SpeechSettingsSource, register: string | null): RegisterReading =>
  tuningFor(settings(), register);

/** What a capture is heard with: the timeout in force, and Azure's handling of strong language. */
export const captureTuningFor = (settings: SpeechSettingsSource): RecognitionTuning => {
  const inForce = settings();
  return { timeoutMs: inForce.captureTimeoutSeconds * 1000, profanity: inForce.azure.profanity };
};

/* The month a moment falls in, in the deployment's own zone, as "2026-09". A calendar month rather than
   thirty days, because a ceiling "a month" is what an administrator reads it as. */
const ZONE = "Africa/Johannesburg";
const monthOf = (at: number): string => {
  const parts = new Intl.DateTimeFormat("en-ZA", { timeZone: ZONE, year: "numeric", month: "2-digit" }).formatToParts(new Date(at));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}`;
};

export type MonthlyCeiling = {
  /** Whether a reading of this many characters may be sent now, under the ceiling in force. */
  admits(characters: number, now: number): boolean;
  /** Counts a reading the provider answered — and so billed. */
  count(characters: number, now: number): void;
  /** What has been counted this month, for a test and for nothing that prints. */
  used(now: number): number;
};

export function monthlyCeiling(settings: SpeechSettingsSource): MonthlyCeiling {
  let month = "";
  let used = 0;
  const roll = (now: number) => {
    const current = monthOf(now);
    if (current !== month) {
      month = current;
      used = 0;
    }
  };
  return {
    admits(characters, now) {
      roll(now);
      return used + characters <= settings().monthlyCeilingCharacters;
    },
    count(characters, now) {
      roll(now);
      used += characters;
    },
    used(now) {
      roll(now);
      return used;
    },
  };
}
