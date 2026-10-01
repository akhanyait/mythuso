import test from "node:test";
import assert from "node:assert/strict";
import { ratifiedRow, triageGate, type ProtocolRow } from "./triage-gate.ts";
import protocols from "../../../../packages/catalog/protocols.json" with { type: "json" };
import clinical from "../../../../packages/catalog/clinical.json" with { type: "json" };

/* The protocol-status gate's own tests, added 22 September 2026 with the guided-assessment routes.

   The gate is the only thing standing between a built triage route and a live one, so what is
   tested here is not the gate's code but its honesty: it must be shut today, it must be shut for
   the reason the register gives rather than for a reason this file invented, and it must be
   reading the register — so that the day a governance board ratifies a triage protocol the same
   function answers true with no edit beside it. Every assertion below is written against
   packages/catalog/protocols.json and packages/catalog/clinical.json as they are, not as a copy
   of them, which is the point: a test that hardcoded "shut" would still pass after the board
   ratified a protocol, and would be lying. */

const triageIds: string[] = clinical.triage?.triageProtocols?.ids ?? [];
const rows = protocols.protocols as Array<{
  id: string;
  status: string;
  ratifiedBy: { role?: string | null; name?: string | null } | null;
  ratifiedOn: number | null;
  safetyCase: string | null;
}>;

/* The register's own definition of a ratified protocol, restated here so the gate is held to the
   register rather than to itself: a row that says ratified, carrying a role, a name, a day and the
   safety case it rests on. */
const ratified = (id: string): boolean => {
  const row = rows.find((entry) => entry.id === id);
  if (!row || row.status !== "ratified") return false;
  if (!row.ratifiedBy?.role?.trim() || !row.ratifiedBy?.name?.trim())
    return false;
  return typeof row.ratifiedOn === "number" && !!row.safetyCase?.trim();
};

test("the gate is shut while the board has designated no triage protocol, and says so", () => {
  const gate = triageGate();
  assert.equal(
    gate.open,
    false,
    "no triage protocol is designated, so nothing may be triaged under anything",
  );
  assert.ok(
    gate.reason.length > 0,
    "a shut gate names its reason for the log line that carries it",
  );
  assert.match(
    gate.reason,
    /triageProtocols\.ids/,
    "the reason points at the register line that decides it, not at a flag in the gate",
  );
});

test("the gate is open exactly when the register would let a triage run", () => {
  /* The one assertion that survives ratification: the gate's answer must equal the register's,
    computed here from the two contracts independently of the gate's own code. Today both sides
    are false — clinical.json names no triage protocol, the board is not formed and no Medical
    Director is appointed — and the day the board writes a protocol, names it and signs it, both
    sides become true together and this test still holds the gate to the register. */
  const boardFormed = protocols.governance?.board?.status === "formed";
  const directorAppointed =
    protocols.governance?.medicalDirector?.status === "appointed";
  const registerOpens =
    triageIds.length > 0 &&
    boardFormed &&
    directorAppointed &&
    triageIds.every((id) => ratified(id));
  assert.equal(
    triageGate().open,
    registerOpens,
    "the gate reads the register; it never decides on its own",
  );
});

test("no designated triage protocol is unratified behind the gate’s back", () => {
  /* Today this is vacuous, and vacuous is the safe direction: the list is empty. Written as a loop
    rather than as a length check so that the first protocol the board designates is held to being
    ratified in the registry the moment it is named — a designation without a ratified row is the
    one state in which the gate could be read as open on a draft. */
  for (const id of triageIds) {
    assert.ok(
      rows.some((row) => row.id === id),
      `${id} is designated as a triage protocol but is not registered in protocols.json`,
    );
    assert.equal(ratified(id), true, `${id} is designated but not ratified`);
  }
});

test("every registered protocol is still a draft, and the governance that would sign one is absent", () => {
  /* The register's own state, asserted so that a change to it is a deliberate act somebody sees in
    a failing test rather than a quiet edit that opened a clinical route. protocols.json's own
    _whyEveryOneIsDraft says no protocol advances beyond draft until the board is formed and a
    Medical Director is appointed; both halves are checked here. */
  for (const row of rows) {
    assert.equal(row.status, "draft", `${row.id} is no longer a draft`);
    assert.equal(
      row.ratifiedBy,
      null,
      `${row.id} carries a signature while still a draft`,
    );
    assert.equal(
      row.ratifiedOn,
      null,
      `${row.id} carries a ratification day while still a draft`,
    );
  }
  assert.equal(protocols.governance?.board?.status, "not-formed");
  assert.equal(protocols.governance?.medicalDirector?.status, "not-appointed");
  assert.deepEqual(
    protocols.governance?.ratificationProcess?.currentStep,
    "draft",
    "the ratification process has not moved, so nothing downstream of it may either",
  );
});

test("a shut gate carries no clinical statement a caller could be handed", () => {
  /* The reason is for a log line. It names register facts — which line is empty, which body is not
    formed — and never a clinical judgement, a priority or a category, because a sentence about
    what somebody's condition means is exactly what an unratified gate has no authority to write.
    The caller gets the contract's own refusal sentence instead, and the two are kept apart here. */
  const { reason } = triageGate();
  for (const forbidden of [
    "sats",
    "triage category",
    "priority",
    "red flag",
    "urgent",
  ]) {
    assert.equal(
      reason.toLowerCase().includes(forbidden),
      false,
      `the reason must not carry the clinical word "${forbidden}"`,
    );
  }
});

test("a signed, dated protocol with no safety case does not open the gate", () => {
  /* Added 1 October 2026. The gate read status, signature and day and never the safety case, so a row
    the clinical engine's validateProtocolReadiness calls not ready could have read as ratified here.
    The rows below are synthetic — no protocol in the register is ratified — and they are what the
    register would hold on the day one was, less exactly one thing each. */
  const signed: ProtocolRow = {
    id: "synthetic-triage",
    version: 1,
    status: "ratified",
    ratifiedBy: { role: "Medical Director", name: "Synthetic signatory" },
    ratifiedOn: 0,
    safetyCase: "Synthetic safety case.",
  };
  assert.equal(ratifiedRow(signed), true, "a row carrying all four is ratified");
  assert.equal(
    ratifiedRow({ ...signed, safetyCase: null }),
    false,
    "no safety case, not ratified",
  );
  assert.equal(
    ratifiedRow({ ...signed, safetyCase: "   " }),
    false,
    "a blank safety case is no safety case",
  );
  assert.equal(ratifiedRow({ ...signed, ratifiedOn: null }), false);
  assert.equal(
    ratifiedRow({ ...signed, ratifiedBy: { role: "Medical Director" } }),
    false,
  );
  assert.equal(ratifiedRow({ ...signed, status: "draft" }), false);
  assert.equal(ratifiedRow(undefined), false);
  /* And every row in the register as it stands is refused, safety case and all. */
  for (const row of protocols.protocols as ProtocolRow[])
    assert.equal(ratifiedRow(row), false, `${row.id} is a draft`);
});
