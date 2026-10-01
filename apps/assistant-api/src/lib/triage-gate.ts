import protocols from "../../../../packages/catalog/protocols.json" with { type: "json" };
import clinical from "../../../../packages/catalog/clinical.json" with { type: "json" };
import { validateProtocolReadiness } from "../../../../packages/engines/src/clinical/domain/triage.ts";

/* The triage protocol-status gate, added 22 September 2026.

   GilbertOne's guided-assessment routes (/assistant/v1/triage/start and /assistant/v1/triage/answer)
   are built, but a built route is not the same as a live clinical one: taking a person through
   triage questions and setting a priority for them is a clinical act, and packages/catalog/clinical.json
   is explicit that it runs only under a triage protocol the clinical governance board has ratified.
   This module is the single place that reads the register's truth and answers one question — is there
   a ratified triage protocol this service may act under? — so the routes refuse while the answer is no
   and begin the moment it is yes, with no edit to a handler.

   WHAT "RATIFIED" MEANS HERE, read from the contracts and never decided in code:

     1. packages/catalog/clinical.json#triage.triageProtocols.ids names which registered protocols are
        triage protocols. It is the board's list, and today it is empty: none of the twelve launch
        protocols is a triage protocol, and clinical.json's own note forbids borrowing one by naming it.
     2. Every protocol on that list must appear in packages/catalog/protocols.json with the status
        "ratified", carrying the role and name of whoever signed it, the day they did, and the safety
        case the protocol rests on. A draft, a retirement, a missing row or a signed row with no safety
        case is not ratified.
     3. The governance board must be formed and a Medical Director appointed, because protocols.json
        says no protocol advances beyond draft until both are — a ratified row without them would be a
        signature nobody was there to give.

   The gate is open only when all three hold. Because it reads the register rather than a flag in this
   file, ratifying a triage protocol is a catalog act — the board writes the protocol, sets its status,
   names it in clinical.json — and the routes activate on the next start with no code change. Until
   then every triage call is answered with the contract's own refusal, not a 501 and not a guess. */

export type ProtocolRow = {
  id: string;
  version: number;
  status: string;
  ratifiedBy: { role?: string; name?: string } | null;
  ratifiedOn: number | null;
  safetyCase: string | null;
};

const protocolRows = protocols.protocols as ProtocolRow[];
const triageProtocolIds: string[] = clinical.triage?.triageProtocols?.ids ?? [];
const boardFormed: boolean = protocols.governance?.board?.status === "formed";
const directorAppointed: boolean =
  protocols.governance?.medicalDirector?.status === "appointed";

/* One protocol is ratified when the register says so and carries a signature: a role, a name and a day
   that has happened (ratifiedOn is a negative-or-zero offset in the register's own convention, so any
   whole number the register holds is a day it recorded; a null is a draft that never was).

   It must also carry a safety case, added 1 October 2026. The status, signature and day were read here
   and the safety case was not, so a row marked ratified and signed on a day but resting on no safety case
   would have opened triage — while the clinical engine's own validateProtocolReadiness answered the same
   row not ready. The engine's function is the one definition of a ready protocol, so this asks it rather
   than restating it; the role-and-name check stays in front because the engine reads a signature as any
   non-null value and the register's signature is two fields. Stricter only: no protocol is ratified. */
export const ratifiedRow = (row: ProtocolRow | undefined): boolean => {
  if (!row || row.status !== "ratified") return false;
  if (!row.ratifiedBy?.role?.trim() || !row.ratifiedBy?.name?.trim())
    return false;
  if (typeof row.ratifiedOn !== "number") return false;
  return validateProtocolReadiness({
    protocolId: row.id,
    version: row.version,
    ratifiedBy: `${row.ratifiedBy.role.trim()} ${row.ratifiedBy.name.trim()}`,
    ratifiedAt: String(row.ratifiedOn),
    safetyCase: row.safetyCase?.trim() ? row.safetyCase : null,
  }).ready;
};
const isRatified = (id: string): boolean =>
  ratifiedRow(protocolRows.find((p) => p.id === id));

export interface TriageGate {
  /* True only when the register holds at least one triage protocol and every one of them is ratified,
     under a formed board and an appointed Medical Director. */
  readonly open: boolean;
  /* The reason the gate is shut, in words for a log line — never a clinical statement, and never sent
     to a caller, who gets the contract's own refusal sentence instead. Empty when the gate is open. */
  readonly reason: string;
}

export function triageGate(): TriageGate {
  if (!triageProtocolIds.length)
    return {
      open: false,
      reason:
        "clinical.json#triage.triageProtocols.ids names no triage protocol; the board has designated none.",
    };
  if (!boardFormed || !directorAppointed)
    return {
      open: false,
      reason:
        "protocols.json governance is not ready: the board is not formed or no Medical Director is appointed, so nothing is ratified.",
    };
  const unratified = triageProtocolIds.filter((id) => !isRatified(id));
  if (unratified.length)
    return {
      open: false,
      reason: `these named triage protocols are not ratified in protocols.json: ${unratified.join(", ")}.`,
    };
  return { open: true, reason: "" };
}
