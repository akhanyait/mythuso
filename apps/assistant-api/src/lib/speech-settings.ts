import {
  isPresentationRegister,
  isRegister,
  presentationVoiceByDefault,
  speechSettingsByDefault,
  tuningFor,
  type PresentationVoiceInForce,
  type RegisterReading,
  type SpeechSettingsInForce,
  type VoiceLabel,
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
   a count that survived restarts would need a store this service does not have.

   SINCE 1 OCTOBER 2026 THE COUNT IS HELD AND KEPT. Two things were wrong with the paragraph above once
   the service was live. The question and the count were an await apart, so forty readings sent
   together were all admitted against the same count and all billed; a reading now reserves its
   characters before the provider is asked, and gives them back if the provider did not answer, so
   what is in flight counts against the ceiling too. And a restart — every deploy that is followed
   by one, every crash systemd recovers from — handed the month its whole budget again; where the
   service has a state directory the month and its count are now written there after every billed
   reading (packages/catalog/founder-access.json#state.speechCeilingFile), replaced atomically, and
   read back at start-up. A write that fails is not a reason to withhold a reading that was already
   billed, so it is let go and the count in memory stands until the next one succeeds. */

export type SpeechSettingsSource = () => SpeechSettingsInForce;
export const contractDefaults: SpeechSettingsSource = () => speechSettingsByDefault;

/* SINCE 28 SEPTEMBER 2026 THE SERVICE KEEPS A HISTORY. ./settings-history.ts replays the founder's
   accepted changes over the contract's defaults from the state directory, and server.ts hands its
   speech() and presentationVoice() readers to the seam in place of the two defaults below. The
   defaults stay as what a caller that passes nothing — a test, a process with no state directory —
   reads, and as the values a clinical-delivery register is always read with. */

/** Which of a language's two voices reads each presentation register, in force now. */
export type PresentationVoiceSource = () => PresentationVoiceInForce;
export const contractVoices: PresentationVoiceSource = () => presentationVoiceByDefault;

/** The label a register is read in when the caller named no voice: the setting in force for a
    presentation register, and nothing — the platform's default — for every other register. */
export const voiceLabelFor = (voices: PresentationVoiceSource, register: string | null): VoiceLabel | undefined =>
  isPresentationRegister(register) ? voices().byClass[register] : undefined;

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

/** Characters held against the ceiling while a provider is asked, in the month they were held in. */
export type Reservation = { readonly month: string; readonly characters: number };

export type MonthlyCeiling = {
  /** Whether a reading of this many characters may be sent now, under the ceiling in force, counting
      what is already held for readings still in flight. */
  admits(characters: number, now: number): boolean;
  /** Holds a reading's characters against the ceiling before its provider is asked, or answers null
      when they would pass it. Every reservation is settled exactly once. */
  reserve(characters: number, now: number): Reservation | null;
  /** Settles a reservation: counted when the provider answered — and so billed — and given back when
      it did not. A reservation from a month that has since ended is let go either way. */
  settle(reservation: Reservation, billed: boolean): void;
  /** Counts a reading the provider answered — and so billed. */
  count(characters: number, now: number): void;
  /** What has been counted this month, for a test and for nothing that prints. */
  used(now: number): number;
};

/** Where the month's count is kept between restarts: the state directory's file, or nowhere. */
export type CeilingStore = {
  load(): { month: string; used: number } | null;
  save(value: { month: string; used: number }): void;
};

export function monthlyCeiling(settings: SpeechSettingsSource, store: CeilingStore | null = null): MonthlyCeiling {
  let month = "";
  let used = 0;
  let held = 0;
  /* What a previous run of this process counted, if it was this month: read once, lazily, at the first
     reading, and believed only when it is a month and a whole number of characters. */
  let loaded = store === null;
  const recall = (current: string) => {
    if (loaded) return;
    loaded = true;
    try {
      const kept = store!.load();
      if (kept && kept.month === current && Number.isSafeInteger(kept.used) && kept.used >= 0) used = kept.used;
    } catch {
      /* An unreadable file is a count of nothing rather than a service that will not speak. */
    }
  };
  const roll = (now: number) => {
    const current = monthOf(now);
    if (current !== month) {
      month = current;
      used = 0;
      held = 0;
      recall(current);
    }
  };
  const keep = () => {
    if (!store) return;
    try {
      store.save({ month, used });
    } catch {
      /* See the header: the reading was billed whether or not the count reached the disk. */
    }
  };
  return {
    admits(characters, now) {
      roll(now);
      return used + held + characters <= settings().monthlyCeilingCharacters;
    },
    reserve(characters, now) {
      roll(now);
      if (used + held + characters > settings().monthlyCeilingCharacters) return null;
      held += characters;
      return { month, characters };
    },
    settle(reservation, billed) {
      if (reservation.month !== month) return;
      held = Math.max(0, held - reservation.characters);
      if (!billed) return;
      used += reservation.characters;
      keep();
    },
    count(characters, now) {
      roll(now);
      used += characters;
      keep();
    },
    used(now) {
      roll(now);
      return used;
    },
  };
}
