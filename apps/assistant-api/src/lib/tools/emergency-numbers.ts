import { z } from "zod";
import { tool } from "@langchain/core/tools";
import sos from "../../../../../packages/catalog/sos.json" with { type: "json" };

/* The emergency-numbers tool. The three emergency numbers are sos.json's own — the same contract
   the emergency screen and the system prompt fill from, by id, so no copy can drift. The support
   lines below them are typed here, and the test suite pins each one against the catalog's
   mental-health resources, so a number that changes in the catalog fails a test here rather than
   quietly going stale on a person in crisis. */

type SosNumber = {
  id: string;
  number: string;
  name: string;
  detail: string;
  whenToUse: string;
};

const EMERGENCY_NUMBERS = sos.emergency.numbers as SosNumber[];

/* Support lines, worded as the catalog's mental-health resources word them. Order is by how many
   people each one can help: the SADAG line answers any mental-health question. */
const SUPPORT_LINES: { label: string; number: string }[] = [
  { label: "SADAG mental health helpline (free counselling and referrals)", number: "0800 567 567" },
  { label: "Lifeline South Africa (24-hour crisis counselling)", number: "0861 322 322" },
  { label: "GBV Command Centre (gender-based violence, 24 hours)", number: "0800 428 428" },
];

const SUPPORT_HINTS = [
  "mental", "depress", "anxiet", "anxious", "panic", "suicid", "sad", "grief", "trauma", "abuse",
  "violence", "counsel", "stress", "lonely",
];

export function emergencyNumbers(need?: string): string {
  const hint = (need ?? "").toLowerCase();
  const wantsSupport = SUPPORT_HINTS.some((word) => hint.includes(word));

  const lines: string[] = ["Emergency numbers, South Africa:", ""];
  /* Ambulance first unless the question is clearly a support-line question: that ordering is the
     sos contract's own rule — emergency services before any service of ours. */
  for (const entry of EMERGENCY_NUMBERS)
    lines.push(`${entry.name}: ${entry.number} — ${entry.whenToUse}`);
  lines.push("", "Support lines:", "");
  for (const line of SUPPORT_LINES) lines.push(`${line.label}: ${line.number}`);
  lines.push(
    "",
    "If this is a life threat, call now — do not wait for a reply here. Nothing MyThuso does replaces an ambulance, and no answer from me replaces a person on the line.",
  );
  if (wantsSupport)
    lines.push(
      "For how you are feeling, the support lines above are free to call, and a public clinic can arrange a mental-health consultation.",
    );
  return lines.join("\n") + "\nSources: MyThuso emergency screen (sos.json); SA mental-health support lines from the MyThuso knowledge base.";
}

export const emergencyNumbersTool = tool(
  async ({ need }) => emergencyNumbers(need),
  {
    name: "emergency_numbers",
    description:
      "Return South Africa's emergency numbers (ambulance 10177, all-emergencies from a mobile 112, police 10111) and the free support lines (SADAG 0800 567 567, Lifeline 0861 322 322, GBV Command Centre 0800 428 428). Use whenever a message asks who to call, or names a crisis. If the message suggests a life threat right now, give these numbers in the answer itself and lead with the ambulance.",
    schema: z.object({
      need: z
        .string()
        .describe("What kind of help is being asked about, in the person's own words; 'not specified' if they did not say"),
    }),
  },
);
