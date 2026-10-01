import assistant from "../../catalog/assistant.json" with { type: "json" };

/* How a message is put into one shape before any emergency matcher reads it — written once, here,
   and read by all three of this package's matchers: the escalation patterns (escalation.ts), the
   engine's term classifier (engine.ts's normalizeText) and the stems every platform shares
   (stems.ts, mirrored by hand in Models/Assistant.swift and model/Assistant.kt and held to
   fixtures.stems in packages/catalog/assistant.json).

   WHY IT EXISTS. On 1 October 2026 a review found that the way a phone types could hide an
   emergency. iOS writes "I don’t want to live anymore" with a curly apostrophe; the escalation
   patterns were written `don'?t`, which a straight apostrophe or none satisfies and a curly one
   does not, so the sentence came back unknown. A no-break space or a zero-width character pasted
   between two words did the same. And "she isn't breathing" — the commonest way of saying the most
   urgent thing — never reached the term "not breathing", because "isnt" is one word. Every one of
   those is a matcher that lowered an emergency by not reading it.

   The characters are the contract's (matcher.normalisation in packages/catalog/assistant.json): the
   apostrophes, the invisible characters, the curly double quotes and the negations, so the three
   platforms read one list. No network, no model, no environment variable. */

const normalisation = assistant.matcher.normalisation;

/* Characters into one shape, keeping the punctuation the escalation patterns read — the full stop
   their `[^.]` windows stop at, the slash in 180/120, the decimal point in 39.5 — which is why this
   is not the classifier's normalizeText: that one turns every one of them into a space. Compatibility
   form first (a no-break space becomes a space, a full-width letter a letter), then the invisible
   characters removed rather than spaced, so one inside "can’t" leaves one word; every apostrophe the
   contract names becomes the straight one the patterns are written with, every curly double quote a
   straight one; lower case, and whitespace collapsed to single spaces. */
export function foldCharacters(text: string): string {
  let folded = text.normalize("NFKC");
  for (const mark of normalisation.invisible) folded = folded.split(mark).join("");
  for (const mark of normalisation.apostrophes) folded = folded.split(mark).join("'");
  for (const mark of normalisation.quotes) folded = folded.split(mark).join('"');
  return folded.toLowerCase().replace(/\s+/g, " ").trim();
}

const negations: Record<string, string> = normalisation.negations;

/* The be and have negations written out — "isnt" is "is not" — over words whose apostrophes are
   already gone. A word, not a pattern: the terms "not breathing" and "not responding" are matched on
   words, so the expansion has to produce words. Only the forms the contract lists are expanded; its
   whyNegations says why can't, won't and doesn't are not among them. */
export const expandNegations = (words: readonly string[]): string[] =>
  words.flatMap((word) => negations[word]?.split(" ") ?? [word]);
