import override from "../../../../packages/catalog/demonstration-override.json" with { type: "json" };

/* The founder's demonstration override, as this service reads it (2 October 2026).

   packages/catalog/demonstration-override.json stands in for the Information Officer's and the
   clinical reviewer's signatures on the gates it lists, while inForce is true, so the capability can be
   shown before either person is appointed. This service is live in production, so what this module
   decides is a production decision: a source it opens is asked from the box on the next restart.

   WHAT IT WILL NOT DO. It never answers yes for a gate the file does not list, and never while inForce
   is anything but true — so going live is one value in one file, and every gate closes at once. It
   never stands alone: every caller asks it beside its own signatures (signed || overrideOpens), so the
   strict rule is still the code and the override only waits beside it. And it carries the disclaimer
   every opened place shows word for word, from the one file, so no caller types its own.

   The types are loose on purpose, as the adapters' own config is: a misspelt key degrades to closed. Tests
   pass their own override through the optional argument — the same injection seam the adapters keep —
   so the closed path is proved without editing the contract. */

export type DemonstrationGate = {
  id: string;
  kind?: string;
  sourceId?: string;
  state?: string;
  waitingFor?: string;
};

export type DemonstrationOverride = {
  inForce?: boolean;
  disclaimer?: { label?: string; sentence?: string };
  words?: Record<string, string>;
  gates?: DemonstrationGate[];
};

export const demonstrationOverride = (): DemonstrationOverride => override as DemonstrationOverride;

/* A closed copy, for tests and for any caller that must prove the go-live path. */
export const overrideClosed: DemonstrationOverride = { ...(override as DemonstrationOverride), inForce: false };

export const overrideGate = (
  id: string,
  source: DemonstrationOverride = demonstrationOverride(),
): DemonstrationGate | null =>
  source.inForce === true && Array.isArray(source.gates)
    ? (source.gates.find((gate) => gate && gate.id === id) ?? null)
    : null;

/* The one question. Anything but inForce === true and a listed id is closed. */
export const overrideOpens = (id: string, source: DemonstrationOverride = demonstrationOverride()): boolean =>
  overrideGate(id, source) !== null;

/* The sentence every opened place shows. Empty only if the file lost it, which the build refuses. */
export const demonstrationDisclaimer = (source: DemonstrationOverride = demonstrationOverride()): string =>
  source.disclaimer?.sentence ?? "";
