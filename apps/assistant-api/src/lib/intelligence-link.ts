import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import federation from "../../../../packages/catalog/knowledge/federation.json" with { type: "json" };
import { LOCAL_KNOWLEDGE_FILES } from "./knowledge.ts";

/* GilbertOne's intelligence, named in one place so the catalogue and the federation cannot
   drift apart from what the service will consult.
   The nine local files are searched on every knowledge lookup. A federation source is linked
   — the service knows its name, its licence and its flag — and it is consulted only when that
   flag is true. Every source ships active: false, so linking them does not call them. */

export type IntelligenceSource = {
  id: string;
  kind: "catalogue" | "federation";
  linked: true;
  consulted: boolean;
};

const here = dirname(fileURLToPath(import.meta.url));

/* The knowledge directory, walked from this file so a moved catalog fails the test rather than
   silently searching a stale list. federation.json is the allowlist, not a catalogue file. */
export function catalogueFilesOnDisk(): string[] {
  const dir = join(here, "../../../../packages/catalog/knowledge");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json") && name !== "federation.json")
    .map((name) => name.slice(0, -".json".length))
    .sort();
}

export function intelligenceSources(): IntelligenceSource[] {
  const catalogue: IntelligenceSource[] = LOCAL_KNOWLEDGE_FILES.map((id) => ({
    id,
    kind: "catalogue",
    linked: true,
    consulted: true,
  }));
  const external: IntelligenceSource[] = federation.sources.map((source) => ({
    id: source.id,
    kind: "federation",
    linked: true,
    consulted: source.active === true,
  }));
  return [...catalogue, ...external];
}
