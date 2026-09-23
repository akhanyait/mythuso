/* Lightweight language detection for the South African languages GilbertOne may be written in,
   added on 23 September 2026 with the multi-language backend pass (Phase 1A of the next wave).

   WHY THIS IS HAND-WRITTEN AND DEPENDENCY-FREE. The repository's boundary rule forbids a new npm
   package without an explicit founder approval, and none was sought for this: a full statistical
   identifier (fastText, franc, lingua) would be a dependency, a model file and a bundle cost the
   patient entry budget is measured against. What is here instead is the small, readable thing the
   job actually needs — a table of character sequences that are distinctive of each language, and a
   frequency count over them. It carries no data file, reaches no network, and runs in well under a
   millisecond on a single message, which matters because it runs on every turn, before the model
   call, on the hot path.

   WHAT IT IS FOR. The turn route asks it one question — which language did the person write in —
   and hands the answer to the orchestrator, whose system prompt is then told to respond in that
   language. It is a hint, never a decision: it classifies the words a person chose, and the model
   that reads those same words is far better placed than this table to answer them well. That is
   why the confidence floor exists. A guess this module is not sure of is worse than no guess, so
   anything under CONFIDENCE_FLOOR is reported as English with a confidence of zero — the safe,
   honest default the service has always spoken, and the one a caller can trust without inspecting
   the number.

   HOW IT SCORES. Every language carries a list of distinctive substrings — the click digraphs of
   isiXhosa ("xh", "ngc"), the "-ngi-" and "-kulu-" of isiZulu, the "'n" and the double "nie" of
   Afrikaans, the "ho " and "dumela" of Sesotho — each with a weight that says how much that
   sequence belongs to this one language and not to a neighbour. The Nguni languages (isiZulu,
   isiXhosa, siSwati, isiNdebele) share a great deal of vocabulary, so the shared markers are
   weighted low and the ones unique to a single language weighted high; a sentence that is clearly
   one of them accumulates enough unique weight to pull clear of the others. A language's score is
   the weighted count of its markers found in the lower-cased text. Confidence is the winning
   language's share of the total score, damped when there is very little evidence either way, so a
   single stray marker cannot claim a whole message and a contested message falls back to English.

   THE LIMITS, SAID PLAINLY. This is a heuristic over short, informal health messages, not a
   linguist. It will be wrong on a single ambiguous word, on heavy code-switching (very common in
   South Africa), and on a language it has too few markers for. Being wrong is survivable because
   the consequence is only the language a hint asks the model to reply in — the model still reads
   the person's actual words — and because the floor turns a weak reading into the safe default.
   It is not a claim about the person, it is never stored as one, and it never overrides anything
   the safety chain decides. */

/* The languages this module can name. The first is the default and the fallback; the rest are the
   South African languages the founder's multi-language plan covers. The codes are the ISO 639-1
   (and the two-letter) codes the rest of the platform and Azure's recognition locales use. */
export const SUPPORTED_LANGUAGES = [
  "en",
  "zu",
  "xh",
  "st",
  "af",
  "tn",
  "nso",
  "ts",
  "ss",
  "ve",
  "nr",
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/* The name each code is known by to a person, used when the orchestrator tells the model which
   language to answer in. These are the languages' own names (isiZulu, isiXhosa, Afrikaans …) where
   one exists, and they match the names packages/catalog/assistant.json's voice.languages carries
   for the five languages that have a voice entry. They are linguistic constants rather than a
   product decision, which is why they live beside the detector that uses them. */
export const LANGUAGE_NAMES: Readonly<Record<SupportedLanguage, string>> = {
  en: "English",
  zu: "isiZulu",
  xh: "isiXhosa",
  st: "Sesotho",
  af: "Afrikaans",
  tn: "Setswana",
  nso: "Sepedi",
  ts: "Xitsonga",
  ss: "siSwati",
  ve: "Tshivenda",
  nr: "isiNdebele",
};

/* A reading of one message: the language it was written in, and how sure this module is, 0 to 1.
   A confidence of 0 always travels with language "en" — the floor below collapses every weak or
   contested reading onto the safe default, so a caller never has to decide what to do with a
   half-detected language. */
export type LanguageReading = { language: SupportedLanguage; confidence: number };

/* Below this, the reading is not trusted and English is returned with a confidence of zero. High
   enough that a contested Nguni message — where two or three languages score alike — falls back
   rather than guessing, and low enough that a message with a clear single language passes. */
const CONFIDENCE_FLOOR = 0.7;
/* The weighted evidence a message must carry before its confidence is taken at face value. A score
   below this damps the confidence proportionally, so one stray marker on a two-word message cannot
   claim it with the certainty a full sentence earns. */
const FULL_EVIDENCE_SCORE = 3;

/* The distinctive sequences, per language, each beside the weight that says how uniquely it belongs
   to that language. A language's own name ("isizulu", "siswati") is the strongest signal and
   carries the highest weight; a sequence found in only one language carries 3; one shared across a
   group — the "dumela" and "ngaka" of the Sotho languages, the "ngiyabonga" and "kakhulu" of the
   Nguni — carries 1 or 2, so a clear sentence accumulates enough unique weight to pull clear of its
   neighbours while a genuinely ambiguous one stays contested and falls back to English. Substrings
   are matched against the lower-cased message, so a marker written with a leading or trailing space
   (" ho ", " ke ") only matches at a word edge, which is what keeps an English "who" from counting
   as Sesotho. */
const MARKERS: Readonly<Record<SupportedLanguage, readonly [string, number][]>> =
  {
    en: [
      [" the ", 2], [" and ", 2], [" you", 2], ["your", 1], ["what", 2],
      ["when", 1], ["where", 1], ["have", 2], [" is ", 2], [" are ", 2],
      [" to ", 2], [" my ", 2], ["for ", 1], ["that", 1], ["this", 1],
      ["with", 1], [" can ", 1], ["how ", 2], ["please", 2], ["hello", 2],
      ["help", 2], ["not ", 1], ["would", 1], ["thank you", 2], ["doctor", 1],
      ["nurse", 1], ["medicine", 1], ["need", 1], ["about", 1], [" am ", 1],
    ],
    af: [
      ["'n ", 2], ["dankie", 3], ["asseblief", 3], ["hoe gaan", 3],
      ["ek is", 2], [" is nie", 3], [" nie", 2], ["nie.", 2], [" jou", 2],
      ["jy ", 2], ["die ", 1], ["het ", 1], ["wees", 2], [" sal ", 1],
      [" wat ", 2], ["gesond", 3], ["dokter", 2], ["verpleeg", 3],
      ["medisyne", 3], ["vir my", 3], ["nodig", 2], ["soos", 2], ["pyn", 2],
    ],
    zu: [
      ["isizulu", 4], ["ngiyabonga", 2], ["kakhulu", 2], ["ngicela", 3],
      ["ngiya", 1], ["kufanele", 3], ["umuntu", 2], ["impilo", 2],
      ["udokotela", 3], ["umhlengikazi", 3], ["isibhedlela", 2],
      ["ngifuna", 3], ["umuthi", 3], ["phezulu", 2], ["ngokushesha", 3],
      ["ngabe", 3], ["kumele", 3], ["wenza", 2], ["sawubona", 1],
      ["unjani", 2], ["ngiyagula", 3], ["umzimba", 3],
    ],
    xh: [
      ["isixhosa", 4], ["xhosa", 4], ["xh", 3], ["ngc", 3], ["gqi", 3],
      ["qha", 3], ["molo", 3], ["enkosi", 3], ["ndiphilile", 3],
      ["ixesha", 3], ["ugqirha", 3], ["umongikazi", 3], ["injani", 2],
      ["kunjani", 2], ["umntu", 3], ["ndiyabona", 3], ["igazi", 3],
      ["ndinengxaki", 3], ["isibhedlela", 1],
    ],
    st: [
      ["sesotho", 4], ["sotho", 4], ["khotso", 3], ["dumela", 1],
      ["o kae", 1], ["ke kopa", 3], [" ho ", 2], [" o a ", 2],
      ["hantle", 3], ["bophelo", 2], ["ngaka", 1], ["sepetlele", 2],
      ["mosali", 3], ["hloka", 2], ["hlola", 3], [" ke ", 1], [" tse ", 2],
    ],
    tn: [
      ["setswana", 4], ["tswana", 4], ["tlhoka", 3], ["botlhokwa", 3],
      ["tswee", 3], ["khotso", 2], [" go ", 1], ["tlh", 2], ["tsw", 2],
      ["dumela", 1], ["bophelo", 2], ["ngaka", 1], ["sepetlele", 2],
      ["tsa ", 1], [" mme ", 1],
    ],
    nso: [
      ["sepedi", 4], ["sa leboa", 4], ["bjale", 3], [" bj", 2], ["gore", 2],
      ["modimo", 2], ["bolwetse", 3], ["ngaka", 1], ["dumela", 1],
      ["ka nako", 2], ["tsebisa", 3], [" ke ", 1], ["na le", 1], ["o kae", 1],
    ],
    ts: [
      ["xitsonga", 4], ["tsonga", 4], ["ndzi", 3], ["xana", 3], ["hina", 2],
      ["tiva", 2], ["nhlana", 3], ["vutomi", 3], ["hakela", 3], ["ndza", 3],
      ["nhloko", 3], ["kota", 2],
    ],
    ss: [
      ["siswati", 4], ["swati", 4], ["umuntfu", 4], ["tfu", 3], ["siyabonga", 4],
      ["sihamba", 3], ["lusito", 3], ["sawubona", 1], ["kakhulu", 1],
      ["ngiyabonga", 1], ["kunjani", 2], ["bafana", 2],
    ],
    ve: [
      ["tshivenda", 4], ["venda", 4], ["vha", 2], ["zwi", 2], ["khou", 3],
      ["vhathu", 3], ["mulanga", 3], ["zwine", 3], ["u khou", 3],
      ["mutakalo", 3], ["vhumuthu", 3], ["thogwa", 3],
    ],
    nr: [
      ["isindebele", 4], ["ndebele", 4], ["ndeb", 4], ["ngibona", 3],
      ["yini", 2], ["khona", 2], ["ngitakwenta", 3], ["sikhona", 3],
      ["isibhedlela", 1], ["udokotela", 1], ["umhlengikazi", 1], ["ngi", 1],
    ],
  };

/* How many times `needle` occurs in `haystack`, counting non-overlapping occurrences. `split` is
   the cheapest honest way to do it and the messages are short, so this never needs to be cleverer. */
const countOccurrences = (haystack: string, needle: string): number =>
  needle.length === 0 ? 0 : haystack.split(needle).length - 1;

/* Read the language a message was written in. Returns the winning language with a confidence of 0
   to 1, or — when nothing scored, or the winner did not clear CONFIDENCE_FLOOR — English with a
   confidence of 0, so the caller can treat "en" at zero as "not detected" and fall back safely.
   An empty or non-string message is the same safe answer rather than a thrown error: this runs on
   the turn's hot path and must never be the reason a turn fails. */
export function detectLanguage(text: string): LanguageReading {
  const fallback: LanguageReading = { language: "en", confidence: 0 };
  if (typeof text !== "string") return fallback;

  /* Lower-cased once, with the message padded by a space on each side so a word-edge marker
     (" the ", " ho ") also matches at the very start or end of what was typed. */
  const haystack = ` ${text.toLowerCase()} `;

  let bestLanguage: SupportedLanguage = "en";
  let bestScore = 0;
  let secondScore = 0;

  for (const language of SUPPORTED_LANGUAGES) {
    let score = 0;
    for (const [marker, weight] of MARKERS[language]) {
      const hits = countOccurrences(haystack, marker);
      if (hits > 0) score += hits * weight;
    }
    /* Track the top two scores: confidence is the winner's margin over the runner-up, not its share
       of every language's score. The Nguni and Sotho languages share enough vocabulary that several
       of them always score a little on any one of their messages, so a share-of-total measure would
       read a perfectly clear Sesotho sentence as contested against Setswana and Sepedi and fall back
       to English. Against the runner-up alone, a clear winner is the one whose unique markers put
       real distance between it and the next-closest relative. */
    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      bestLanguage = language;
    } else if (score > secondScore) {
      secondScore = score;
    }
  }

  if (bestScore <= 0) return fallback;

  /* The winner's margin over the runner-up, damped when there is too little evidence to be sure. A
     message only one language scored takes the whole margin; a contested one — an ambiguous greeting
     two or three languages claim alike — takes only its part, which is what pushes it below the floor
     and onto the safe English default rather than guessing between relatives. */
  const margin = bestScore / (bestScore + secondScore);
  const evidence = Math.min(1, bestScore / FULL_EVIDENCE_SCORE);
  const confidence = margin * evidence;

  if (confidence < CONFIDENCE_FLOOR) return fallback;
  return { language: bestLanguage, confidence: Number(confidence.toFixed(3)) };
}

/* The name a language code is known by, for the sentence the orchestrator adds to the model's
   prompt ("Respond in isiZulu."). An unknown or absent code names English, the safe default. */
export function languageName(code: string | undefined): string {
  if (typeof code !== "string") return LANGUAGE_NAMES.en;
  const key = code.trim().toLowerCase();
  return (
    LANGUAGE_NAMES[key as SupportedLanguage] ?? LANGUAGE_NAMES.en
  );
}
