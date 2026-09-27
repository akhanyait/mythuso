import assistant from "../../catalog/assistant.json" with { type: "json" };

/* Words into stems, by the rules in packages/catalog/assistant.json's matcher section.

   This is the arithmetic apps/web/src/lib/assistant.ts carried until 27 September 2026, moved here
   so that the reading recogniser beside it (readings.ts) and the web's matcher fold and stem a
   message identically — the web re-exports these rather than keeping a copy. Models/Assistant.swift
   and model/Assistant.kt carry the same arithmetic by hand, and every copy is run against
   fixtures.stems in the contract, which is what "identical" means here. Lower case, the contract's
   foldings (æ is ae), combining marks removed (é is e), apostrophes removed, and anything outside a–z
   and 0–9 a space; then the stemming rules, in the contract's order. No network, no model, no
   environment variable. */
const normalisation = assistant.matcher.normalisation;
const irregular: Record<string, string> = assistant.matcher.stemming.irregular;

export function tokens(text: string): string[] {
  let folded = text.toLowerCase();
  for (const [from, to] of Object.entries(normalisation.foldings))
    folded = folded.split(from).join(to);
  folded = folded.normalize("NFD").replace(/\p{M}+/gu, "");
  for (const mark of normalisation.apostrophes)
    folded = folded.split(mark).join("");
  return folded
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

const undouble = (word: string) =>
  word.length >= 3 &&
  word[word.length - 1] === word[word.length - 2] &&
  !"aeiouslz".includes(word[word.length - 1])
    ? word.slice(0, -1)
    : word;

export function stem(word: string): string {
  let t = irregular[word] ?? word;
  if (t.length >= 5 && t.endsWith("ing")) t = undouble(t.slice(0, -3));
  else if (t.length >= 4 && (t.endsWith("ied") || t.endsWith("ies")))
    t = `${t.slice(0, -3)}y`;
  else if (t.length >= 4 && t.endsWith("ed") && !t.endsWith("eed"))
    t = undouble(t.slice(0, -2));
  else if (t.length >= 4 && /(s|x|z|ch|sh)es$/.test(t)) t = t.slice(0, -2);
  else if (t.length >= 4 && t.endsWith("s") && !/(ss|us|is)$/.test(t))
    t = t.slice(0, -1);
  if (t.length >= 4 && t.endsWith("e")) t = t.slice(0, -1);
  return t;
}

export const stems = (text: string): string[] => tokens(text).map(stem);

/* A term's words in order, each within `gap` words of the one before. Greedy from each start, which
   is deterministic and is exactly what the other two platforms do. */
export function hasSequence(
  said: readonly string[],
  term: readonly string[],
  gap: number,
): boolean {
  for (let start = 0; start < said.length; start++) {
    if (said[start] !== term[0]) continue;
    let at = start;
    let whole = true;
    for (let k = 1; k < term.length && whole; k++) {
      let found = -1;
      for (let j = at + 1; j < said.length && j <= at + 1 + gap; j++)
        if (said[j] === term[k]) {
          found = j;
          break;
        }
      if (found < 0) whole = false;
      else at = found;
    }
    if (whole) return true;
  }
  return false;
}

/* The ordinary words a question may carry without leaving anything unread, as stems, from the
   contract's own list. Shared here so the reading recogniser and the web's unread rule count the
   same words as filler. */
export const fillerStems: ReadonlySet<string> = new Set(
  assistant.matcher.readEverything.filler.map(stem),
);
