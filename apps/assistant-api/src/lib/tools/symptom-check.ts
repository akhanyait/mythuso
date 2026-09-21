import { z } from "zod";
import { tool } from "@langchain/core/tools";
import conditions from "../../../../../packages/catalog/knowledge/conditions.json" with { type: "json" };
import { tokenize } from "../knowledge.ts";

/* The symptom-triage tool: it matches a person's own words against the recorded symptoms of the
   64 conditions in packages/catalog/knowledge/conditions.json and hands back the catalog's own
   "when to see a doctor" line. It is a mirror, not a mind: nothing here says what the person has,
   and every output says that a nurse or doctor decides. Where the words describe a child with one
   of the IMCI danger signs, the tool leads with the urgent line instead — a triage list that
   buries "take the child now" under cold remedies is not a triage list. */

type ConditionEntry = {
  id: string;
  title: string;
  symptoms: string[];
  whenToSeeDoctor: string;
  homeCare: string;
  source?: string;
};

const CONDITIONS = conditions as ConditionEntry[];

/* Words that say the symptoms belong to a child. "Month old" and "year old" are matched as phrases
   because a number followed by "old" is a child's age more often than anything else in this
   context. The separator is whitespace or a hyphen, because "8-month-old" is as ordinary a way to
   write a baby's age as "8 months old" is, and the eval set of 21 September found the hyphenated
   form reaching an IMCI-eligible child without the branch that reads it as one. */
const CHILD_TERMS = [
  "baby", "babies", "infant", "newborn", "child", "children", "toddler", "little one",
  "my son", "my daughter", "my boy", "my girl",
];
const isAboutAChild = (text: string): boolean => {
  const lowered = text.toLowerCase();
  if (CHILD_TERMS.some((term) => lowered.includes(term))) return true;
  return /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)[\s-]+(month|year)s?[\s-]+old\b/.test(lowered);
};

/* The IMCI general danger signs, in the wording of the WHO/SA integrated management of childhood
   illness: any one of them in a child is "go now", not "watch and wait". Each entry pairs the
   phrases a caregiver might use with the plain sentence the tool prints. */
const CHILD_RED_FLAGS: { phrases: string[]; sign: string }[] = [
  {
    phrases: ["cannot drink", "not drinking", "not feeding", "won't feed", "refusing to feed", "not breastfeeding", "cannot breastfeed", "won't drink", "not suckling"],
    sign: "cannot drink or breastfeed",
  },
  {
    phrases: ["vomits everything", "vomiting everything", "throws up everything", "brings up everything"],
    sign: "vomits everything",
  },
  {
    phrases: ["convulsion", "convulsions", "seizure", "seizures", "fits", "fitting"],
    sign: "has had convulsions (fits)",
  },
  {
    phrases: ["lethargic", "unconscious", "not waking", "won't wake", "cannot be woken", "floppy", "unresponsive", "very sleepy"],
    sign: "is lethargic or unconscious",
  },
  {
    phrases: ["struggling to breathe", "difficulty breathing", "fast breathing", "breathing fast", "breathing hard", "shortness of breath", "wheezing badly", "cannot breathe"],
    sign: "is struggling to breathe or breathing fast",
  },
  {
    phrases: ["chest indrawing", "chest indraws", "ribs pulling", "pulling in"],
    sign: "has chest indrawing (the ribs pulling in with each breath)",
  },
  {
    phrases: ["blue lips", "blue face", "turning blue", "grey face"],
    sign: "has blue or grey lips or face",
  },
  {
    phrases: ["sunken eyes", "no tears", "dry mouth", "very thirsty", "dehydrated", "fewer wet nappies", "no wet nappy"],
    sign: "shows signs of dehydration (sunken eyes, no tears, dry mouth, fewer wet nappies)",
  },
  {
    phrases: ["blood in the stool", "bloody diarrhoea", "blood in stool", "diarrhoea with blood"],
    sign: "has diarrhoea with blood",
  },
  {
    phrases: ["bulging fontanelle", "bulging soft spot"],
    sign: "has a bulging soft spot (fontanelle)",
  },
];

/* A condition's recorded symptom counts as matched when a query term lands inside it — the terms
   are already lowercase, stemmed and stopword-free from the knowledge module's tokenizer, and the
   symptom string is searched both raw and stemmed so "babies feeding" meets "not feeding". */
const symptomMatches = (queryTerms: string[], symptom: string): boolean => {
  const lowered = ` ${symptom.toLowerCase()} `;
  return queryTerms.some(
    (term) =>
      term.length >= 3 &&
      (lowered.includes(term) ||
        tokenize(symptom).some((symptomTerm) => symptomTerm === term || (term.length >= 4 && symptomTerm.startsWith(term)))),
  );
};

export function checkSymptoms(input: string): string {
  const text = (input ?? "").trim();
  if (!text)
    return "Describe the symptoms in your own words and I will match them against the conditions MyThuso records.\nSources: MyThuso conditions list (64 entries).";

  const queryTerms = tokenize(text);
  const ranked = CONDITIONS.map((condition) => {
    const matched = condition.symptoms.filter((symptom) => symptomMatches(queryTerms, symptom));
    return { condition, matched, score: matched.length };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.condition.id.localeCompare(b.condition.id))
    .slice(0, 3);

  const lines: string[] = [];
  const child = isAboutAChild(text);
  const flagged = child
    ? CHILD_RED_FLAGS.filter((flag) => flag.phrases.some((phrase) => text.toLowerCase().includes(phrase)))
    : [];

  if (flagged.length) {
    lines.push(
      "URGENT — a child's warning sign: take this child to the nearest clinic or hospital NOW.",
      ...flagged.map((flag) => `The message says the child ${flag.sign}. In a child, that is a danger sign, not something to wait on.`),
      "If the child is struggling to breathe, cannot be woken, or is having a seizure, call 10177 for an ambulance (112 from a cellphone) instead of travelling yourself.",
      "",
    );
  }

  if (!ranked.length) {
    lines.push(
      "No condition in MyThuso's list records these symptoms as a clear match.",
      "That does not mean nothing is wrong — it means this list cannot read these words. Describe the symptoms again in different words, or speak to a nurse. Any emergency sign (severe bleeding, chest pain, a person who cannot be woken) is a 10177 call, not a search.",
    );
    return lines.join("\n") + "\nSources: MyThuso conditions list (64 entries).";
  }

  lines.push(
    "Conditions whose recorded symptoms overlap with what was described — a nurse or doctor decides which, if any, it actually is:",
    "",
  );
  const sources = new Set<string>();
  for (const { condition, matched } of ranked) {
    sources.add(condition.source ?? "MyThuso conditions list");
    lines.push(
      `${condition.title} — matched symptoms: ${matched.join("; ")}.`,
      `When to see a doctor: ${condition.whenToSeeDoctor}`,
      `Home care the record gives: ${condition.homeCare}`,
      "",
    );
  }
  lines.push(
    "This is a reading of recorded symptom lists, not a diagnosis. If any symptom is severe, getting worse, or worrying, that is the moment to speak to a nurse or doctor rather than search further.",
    `Sources: ${[...sources].join("; ")}.`,
  );
  return lines.join("\n");
}

export const symptomCheckTool = tool(
  async ({ symptoms }) => checkSymptoms(symptoms),
  {
    name: "symptom_check",
    description:
      "Match described symptoms against MyThuso's recorded conditions and return the catalog's own 'when to see a doctor' guidance and home-care notes. Use when a message describes how someone feels (fever, rash, pain, cough, and so on). Leads with urgent guidance when a child's danger sign appears. Never names what the person has — only a nurse or doctor diagnoses.",
    schema: z.object({
      symptoms: z
        .string()
        .describe("The symptoms exactly as described, e.g. 'runny nose, sore throat and mild fever since yesterday'"),
    }),
  },
);
