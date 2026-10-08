/* The media contract, read once. Every sentence the studio shows and every limit the service keeps
   comes from packages/catalog/gilbertone-media.json; nothing in this directory types its own copy,
   so a refusal reworded there is reworded everywhere it is said. */
import raw from "../../../../packages/catalog/gilbertone-media.json" with { type: "json" };

export type Kind = "drawing" | "picture" | "video";

export interface KindSpec {
  id: Kind;
  label: string;
  meaning: string;
  maxPromptCharacters: number;
  typicalSeconds: [number, number];
  width?: number;
  height?: number;
  steps?: number;
  minScenes?: number;
  maxScenes?: number;
  secondsPerScene?: number;
  framesPerSecond?: number;
}

export interface Refusal {
  id: string;
  appliesTo: Kind[];
  sentence: string;
  patterns?: string[];
}

export interface ModelFile {
  name: string;
  url: string;
  flag: string;
}

export const contract = raw as unknown as {
  version: number;
  kinds: KindSpec[];
  models: { id: string; licence: string; commercialUse: boolean; files?: ModelFile[] }[];
  labels: Record<Kind, string>;
  keeping: { minutes: number; sentence: string };
  preview: string;
  refusals: Refusal[];
  drawingRules: string[];
  storyboardRules: string[];
};

export function kind(id: Kind): KindSpec {
  const found = contract.kinds.find((k) => k.id === id);
  if (!found) throw new Error(`gilbertone-media.json has no kind "${id}".`);
  return found;
}

export function refusal(id: string): Refusal {
  const found = contract.refusals.find((r) => r.id === id);
  if (!found) throw new Error(`gilbertone-media.json has no refusal "${id}".`);
  return found;
}

export function isKind(value: unknown): value is Kind {
  return value === "drawing" || value === "picture" || value === "video";
}

export function pictureFiles(): ModelFile[] {
  return contract.models.find((m) => m.id === "flux1-schnell-q4")?.files ?? [];
}
