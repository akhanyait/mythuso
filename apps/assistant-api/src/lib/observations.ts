import { randomUUID } from "node:crypto";
import { redactPHI } from "../../../../packages/gilbertone/src/phi.ts";
import type { StoredReading } from "./vitals.ts";

/* The session context for GilbertOne's observation and handover flows, added 22 September 2026.

   This is a store of its own, beside ../lib/session-store.ts and deliberately not inside it: the
   conversation store holds the turn transcript and is another module's to keep, and this one holds what
   the observation flows produce — the vital readings that passed validation, and the handover packs
   prepared from them. It lives in memory and nowhere else, with the same promise the conversation store
   keeps: nothing is written to disk and nothing survives a restart. A session id names a conversation and
   never a person.

   A handover pack is assembled here from what this store holds for a session. It is assembled, never
   submitted: /assistant/v1/handover/prepare returns it for the person to review, and the submission that
   would route it to a clinician stays dark until an identity service, a nurse roster and a destination
   contract exist. The pack carries no score and no priority — the fields a clinician would act on are a
   ratified triage protocol's to set, and there is none — so the urgency it names is the honest
   "not-triaged", and the readings it lists are the validated ones, redacted on the way in. */

export interface HandoverPack {
  handoverRef: string;
  preparedAt: string;
  summary: string;
  urgency: string;
  symptoms: string[];
  vitals: string[];
  sources: string[];
}

export interface ObservationStore {
  readings(sessionId: string): StoredReading[];
  addReading(sessionId: string, reading: StoredReading): void;
  addHandover(sessionId: string, pack: HandoverPack): void;
  handover(handoverRef: string): HandoverPack | undefined;
}

export function createObservationStore(): ObservationStore {
  const readings = new Map<string, StoredReading[]>();
  const handovers = new Map<string, HandoverPack>();
  return {
    readings(sessionId) {
      return readings.get(sessionId) ?? [];
    },
    addReading(sessionId, reading) {
      const held = readings.get(sessionId) ?? [];
      held.push(reading);
      readings.set(sessionId, held);
    },
    addHandover(sessionId, pack) {
      handovers.set(pack.handoverRef, pack);
      /* The session's own list is kept so a caller could be shown what it prepared; the ref map is what
         a submission would look up, and both hold the same immutable pack. */
      void sessionId;
    },
    handover(handoverRef) {
      return handovers.get(handoverRef);
    },
  };
}

/* One reading as a clinician-readable line: the type, the value and its UCUM unit, and when it was
   taken. The type and unit are catalog words and the value a number, so there is no free text here for
   an identity to ride in — but the line is redacted anyway, because a handover pack is exactly the kind
   of artefact the redactor exists to protect. */
const readingLine = (reading: StoredReading): string =>
  redactPHI(
    `${reading.type} ${reading.value} ${reading.unit} at ${reading.capturedAt}`,
  );

export type HandoverResult =
  | { ok: true; pack: HandoverPack }
  | { ok: false; nothing: true };

/* Assemble the pack for a session from what the store holds. A session with no validated reading on it
   has nothing to hand over: an empty pack sent to a clinician is a person's time spent on nothing, so the
   route refuses it rather than preparing it. */
export function assembleHandover(
  store: ObservationStore,
  sessionId: string,
  now: number,
): HandoverResult {
  const readings = store.readings(sessionId);
  if (!readings.length) return { ok: false, nothing: true };
  const vitals = readings.map(readingLine);
  return {
    ok: true,
    pack: {
      handoverRef: `handover-${randomUUID()}`,
      preparedAt: new Date(now).toISOString(),
      /* The summary says what this store actually holds and names what it does not: no triage was run,
         because the triage gate is shut, and the conversation transcript lives in the conversation store
         and is not reproduced here. */
      summary: redactPHI(
        `${vitals.length} validated vital ${vitals.length === 1 ? "reading" : "readings"} captured in this session. No triage was run: no triage protocol is ratified. The conversation transcript is held in the session and is not reproduced in this pack.`,
      ),
      /* Never a score and never a priority: while the triage gate is shut there is none to carry, and
         when it opens the category a ratified protocol sets is what belongs here. */
      urgency: "not-triaged",
      symptoms: [],
      vitals,
      sources: [],
    },
  };
}
