/* The escalation ruleset: the deterministic layer that runs BEFORE the model.

   The engine's emergency classifier (see engine.ts) already refuses to lower a message that carries
   an emergency word, and that is a substring match over a catalog of terms. This module is
   defense-in-depth beside it: a fixed, ordered list of symptom patterns with a severity and an
   approved message, so a specific presentation — chest pain radiating to the arm, a throat that is
   swelling, a blood pressure over 180/120 — is caught by pattern matching that never calls an LLM
   and never has to reason about what it is seeing. The model can be talked around; a regex over
   this list cannot.

   Three things this file is not allowed to be:
     - Diagnostic. A message describes what the person said and what to do next, never what they
       "have". "You're having a heart attack" is a diagnosis; "chest pain that spreads to the arm
       needs emergency help now" is not.
     - Networked or environment-aware. This directory is pure logic — no fetch, no environment
       variable reads, no I/O — and the boundary check enforces it. Every message is typed here on
       purpose.
     - Reorderable by accident. Emergency rules come first, urgent after; checkEscalation returns
       the first rule that matches, so the order below IS the triage order. */

export type Severity = "emergency" | "urgent" | "routine";

export interface EscalationRule {
  id: string;
  severity: Severity;
  /* Symptom patterns, matched case-insensitively against the whole session text. Ordered within the
     rule from the most specific presentation to the broadest. None of these carry a /g flag, so a
     shared RegExp is safe to exec repeatedly. */
  patterns: RegExp[];
  /* What the person is told to do. call_emergency raises the ambulance numbers; urgent_care is
     "be seen today, now"; clinician_soon is "a clinician, today". */
  action: "call_emergency" | "urgent_care" | "clinician_soon";
  /* The approved sentence(s). Symptom-descriptive, action-oriented, empathetic but firm. */
  message: string;
}

export interface EscalationResult {
  rule: EscalationRule;
  /* The slice of the session text that actually triggered the rule — useful for logging why a
     message escalated, and cheap to keep because it is already in hand from the match. */
  matchedPattern: string;
}

/* The South African emergency numbers, spelled the same way in every message: 10177 is the
   ambulance, 112 reaches emergency services from any mobile even without airtime or a SIM. */
const AMBULANCE = "10177";
const MOBILE = "112";

export const ESCALATION_RULES: readonly EscalationRule[] = [
  /* ---- emergency ---- */
  {
    id: "cardiac-chest-pain",
    severity: "emergency",
    patterns: [
      /chest (?:pain|pressure|tightness|crushing|squeezing|heaviness|discomfort)/i,
      /(?:pain|pressure|tightness|crushing|squeezing|heaviness|discomfort) (?:in|on|across|behind) (?:my )?chest/i,
      /(?:pain|ache|discomfort|pressure)[^.]{0,60}(?:radiat\w*|spread\w*|travel\w*|moving|goes? (?:down|up|into))[^.]{0,40}(?:arm|jaw|neck|back|shoulder)/i,
      /(?:left|right) (?:arm|shoulder)[^.]{0,24}(?:pain|numb\w*|ache|hurt\w*)/i,
      /shortness of breath/i,
      /(?:short of breath|can'?t catch my breath|breathless(?:ness)? at rest)/i,
    ],
    action: "call_emergency",
    message:
      "What you're describing — chest pain or pressure, or pain spreading into your arm, jaw, neck, back or shoulder, especially with breathlessness — needs emergency help right now. " +
      `Call ${AMBULANCE} for an ambulance, or ${MOBILE} from any mobile. Do not drive yourself. Stay where someone can be with you until help arrives.`,
  },
  {
    id: "self-harm",
    severity: "emergency",
    patterns: [
      /suicid\w*/i,
      /(?:want|wanna|going to|gonna|plan(?:ning)? to|thinking (?:of|about)|think about|consider(?:ing)?) (?:to )?(?:die|kill(?:ing)? myself|end(?:ing)? (?:it|my life)|hurt(?:ing)? myself|harm(?:ing)? myself)/i,
      /(?:kill|killing|end|ending|hurt|hurting|harm|harming) myself/i,
      /self[- ]?harm\w*/i,
      /(?:better off dead|no reason to live|end(?:ing)? it all|take my own life|don'?t want to (?:live|be here))/i,
    ],
    action: "call_emergency",
    message:
      "I'm really glad you told me. What you're feeling is an emergency, and you do not have to carry it alone. " +
      "Please call the SADAG Suicide Crisis Line on 0800 567 567 (24 hours), or emergency services on " +
      `${AMBULANCE}, or ${MOBILE} from any mobile, right now. If you can, tell someone you trust and stay with them until you've spoken to someone.`,
  },
  {
    id: "neuro-stroke",
    severity: "emergency",
    patterns: [
      /(?:face|facial|mouth|eye) (?:is |has )?(?:droop\w*|sag\w*|twisted|paralys\w*|paralyz\w*|numb)/i,
      /droop\w* (?:face|mouth|eye|eyelid)/i,
      /(?:slurred|slurring) (?:speech|words)|(?:speech|words) (?:is |are |sound )?(?:slurred|slurring|unclear)/i,
      /sudden (?:numbness|weakness|paralysis|loss of feeling)[^.]{0,40}(?:one side|left side|right side|on one side|half|face|arm|leg)/i,
      /(?:numbness|weakness|paralysis|can'?t move)[^.]{0,40}(?:one side|left side|right side|on one side|half of my)/i,
      /sudden (?:confusion|disorientation|trouble (?:speaking|understanding)|difficulty (?:speaking|understanding))/i,
      /(?:can'?t|cannot|unable to|trouble|difficulty|struggling to) (?:speak|talk|understand|find(?:ing)? (?:my|the) words)/i,
    ],
    action: "call_emergency",
    message:
      "A face that has dropped on one side, slurred speech, sudden weakness or numbness on one side, or sudden confusion and trouble speaking or understanding can be signs of a stroke. This is a medical emergency and every minute counts. " +
      `Call ${AMBULANCE} for an ambulance, or ${MOBILE} from any mobile, right now. Note the time the symptoms started. Do not eat, drink, or drive.`,
  },
  {
    id: "respiratory-distress",
    severity: "emergency",
    patterns: [
      /(?:can'?t|cannot|unable to|struggling to|can hardly|barely|hardly) breathe/i,
      /(?:can'?t|cannot|unable to|struggling to) (?:get (?:my )?breath|catch my breath)/i,
      /chok(?:ing|e)\b/i,
      /(?:throat|airway|windpipe) (?:is |has )?(?:clos\w*|block\w*|tight\w*|constrict\w*|narrow\w*)/i,
      /(?:blue|grey|gray|purple|pale) (?:lips|fingertips|fingers|nails|face)/i,
      /(?:lips|fingertips|fingers|nails|face) (?:are |is |turning |turn |went |look )?(?:blue|purple|grey|gray)/i,
      /gasping for (?:air|breath)/i,
    ],
    action: "call_emergency",
    message:
      "Not being able to breathe, choking, a throat that is closing, or lips or fingertips turning blue is a medical emergency. " +
      `Call ${AMBULANCE} for an ambulance, or ${MOBILE} from any mobile, right now. Sit upright, try to stay as calm as you can, and keep someone with you.`,
  },
  {
    id: "severe-allergic",
    severity: "emergency",
    patterns: [
      /(?:throat|tongue|lips|airway|mouth|face|eyes?) (?:is |are |has |have )?(?:swell\w*|swollen|puff\w*)/i,
      /swelling (?:of|in) (?:my )?(?:throat|tongue|lips|face|airway|mouth)/i,
      /(?:swollen|swelling|puffy) (?:throat|tongue|lips|face|airway)/i,
      /anaphyla(?:xis|ctic)/i,
      /(?:hives|rash|welts|urticaria)[^.]{0,40}(?:breath|breathe|swallow|throat|swell)/i,
      /(?:breath|breathe|swallow)[^.]{0,40}(?:hives|rash|welts)/i,
      /allergic reaction[^.]{0,40}(?:severe|breath|throat|swell|whole body|spreading)/i,
    ],
    action: "call_emergency",
    message:
      "Swelling of the throat, tongue, lips or face, or a spreading rash or hives with trouble breathing or swallowing, can be a severe allergic reaction (anaphylaxis). This is a medical emergency. " +
      `Call ${AMBULANCE} for an ambulance, or ${MOBILE} from any mobile, now. If an adrenaline auto-injector (EpiPen) has been prescribed, use it as directed and tell the operator.`,
  },
  {
    id: "uncontrolled-bleeding",
    severity: "emergency",
    patterns: [
      /(?:bleeding|blood)[^.]{0,30}(?:won'?t|will not|doesn'?t|does not|didn'?t|can'?t|cannot) (?:stop|slow)/i,
      /(?:won'?t|will not|can'?t|cannot) stop (?:the )?bleeding/i,
      /(?:spurting|spraying|gushing|pumping|jetting) blood/i,
      /blood (?:is )?(?:spurting|spraying|gushing|pumping)/i,
      /(?:sever\w*|cut|cut through|lacerat\w*|nick(?:ed)?|sliced) (?:a |an |my |the )?(?:artery|vein|major blood vessel)/i,
      /(?:artery|vein) (?:is |was )?(?:cut|severed|punctured|bleeding|torn)/i,
      /bleeding (?:heavily|badly|profusely|non-?stop|so much|uncontrollably)/i,
      /heavy bleeding[^.]{0,30}(?:soaked|through|won'?t stop|severe)/i,
    ],
    action: "call_emergency",
    message:
      "Bleeding that will not stop, blood that is spurting or gushing, or a deep cut to an artery is a medical emergency. " +
      `Call ${AMBULANCE} for an ambulance, or ${MOBILE} from any mobile, now. Press firmly on the wound with a clean cloth, keep the person lying down and warm, and do not pull out anything embedded in the wound.`,
  },
  {
    id: "seizure",
    severity: "emergency",
    patterns: [
      /(?:having|had|a|throwing) (?:a )?(?:seizure|convulsion|fit)\b/i,
      /\bseizure\w*\b/i,
      /\bconvuls(?:ion|ing)\w*/i,
      /(?:shaking|convulsing|jerking|twitching) (?:uncontrollably|violently|all over|hard)/i,
      /uncontrollabl(?:e|y) (?:shaking|jerking|convulsions?|tremor)/i,
      /(?:foaming at the mouth|bit (?:my|his|her|their) tongue|epilep(?:tic|sy))/i,
    ],
    action: "call_emergency",
    message:
      "A seizure, convulsion or fit, or uncontrollable shaking, is a medical emergency — especially if it is a first seizure, lasts longer than five minutes, or repeats. " +
      `Call ${AMBULANCE} for an ambulance, or ${MOBILE} from any mobile. Ease the person to the floor, cushion their head, turn them onto their side once the shaking stops, and put nothing in their mouth.`,
  },
  {
    id: "poisoning-overdose",
    severity: "emergency",
    patterns: [
      /(?:swallow\w*|drank|ingest\w*|took|ate|consumed) (?:a |some )?(?:poison|pesticide|rat poison|weed ?killer|bleach|chemical|detergent|acid|alkali|petrol|gasoline|paraffin|antifreeze|paint thinner)/i,
      /(?:poison(?:ed|ing)|toxic (?:dose|substance))/i,
      /overdos(?:e|ed|ing)|\bo\.?d\.?(?:ed|ing)?\b/i,
      /(?:took|swallowed|ate|drank) too many (?:pills|tablets|capsules|meds)/i,
      /too many (?:pills|tablets|capsules|meds|paracetamol|panado)/i,
      /(?:swallowed|took|drank) a (?:handful|bottle|box|packet) of (?:pills|tablets|capsules|medication)/i,
    ],
    action: "call_emergency",
    message:
      "Swallowing a poison or chemical, or taking too many pills or an overdose, is a medical emergency. " +
      `Call ${AMBULANCE} for an ambulance, or ${MOBILE} from any mobile, now. If it is safe, keep the container, packet or label to show the paramedics. Do not make the person vomit unless the operator tells you to.`,
  },

  /* ---- urgent ---- */
  {
    id: "persistent-high-fever",
    severity: "urgent",
    patterns: [
      /(?:fever|temperature)\D{0,12}(?:39|40|41|42|10[2-9]|11[0-1])(?:\.\d+)? ?(?:°?\s?(?:c|celsius|f|fahrenheit)|degrees)?/i,
      /(?:very )?high (?:fever|temperature)/i,
      /(?:fever|temperature)[^.]{0,30}(?:3|three|4|four|5|five|6|six|7|seven|several|many) (?:days|nights)/i,
      /(?:fever|temperature)[^.]{0,30}(?:lasting|for|over|more than|above) (?:3|three|\d+) days/i,
      /(?:fever|temperature)[^.]{0,20}(?:won'?t|will not|doesn'?t|hasn'?t) (?:come down|break|go away|settle)/i,
    ],
    action: "clinician_soon",
    message:
      "A fever above 39 °C (about 103 °F), or one that has lasted three days or more, or will not come down, needs a clinician to look at you today. " +
      "Please contact your nearest clinic, GP, or MyThuso care team to be seen. " +
      `Seek emergency help on ${AMBULANCE} or ${MOBILE} straight away if it comes with a stiff neck, a rash that does not fade, confusion, a severe headache, or trouble breathing.`,
  },
  {
    id: "severe-dehydration",
    severity: "urgent",
    patterns: [
      /(?:no|not|haven'?t|hasn'?t|without)[^.]{0,30}(?:urine|urinated|urinating|pe(?:e|ed|eing)?|passed water)[^.]{0,24}(?:8|eight|9|nine|10|ten|11|eleven|12|twelve|\d+) ?hours/i,
      /(?:8|eight|9|nine|10|ten|12|twelve|\d+) ?hours[^.]{0,24}(?:no|without|haven'?t) (?:urine|urinated|peed)/i,
      /(?:not|can'?t|cannot|unable to|stopped) (?:urinating|peeing|passing (?:urine|water))/i,
      /sunken (?:eyes|fontanelle|soft spot)|(?:eyes|soft spot) (?:are |look )?sunken/i,
      /skin tenting|(?:skin|it)[^.]{0,24}(?:doesn'?t|does not|won'?t) (?:spring|bounce|return)/i,
      /pinch(?:ed)? (?:my |the )?skin[^.]{0,30}(?:stays|doesn'?t|tent|up)/i,
      /(?:severe|extreme|bad) (?:dizziness|lightheadedness)[^.]{0,24}(?:standing|when i stand|on standing)/i,
      /(?:dizzy|lightheaded|faint|blackout)[^.]{0,24}(?:when|every time|on|as soon as) (?:i )?stand/i,
      /(?:can'?t|cannot|unable to) keep (?:any )?(?:fluids|water|anything) down/i,
    ],
    action: "urgent_care",
    message:
      "Passing no urine for eight hours or more, sunken eyes, skin that tents when you pinch it, or severe dizziness on standing are signs of serious dehydration. " +
      "Sip oral rehydration fluid or water if you can keep it down, and be seen urgently today — contact your nearest clinic or GP. " +
      `Call ${AMBULANCE} or ${MOBILE} now if the person is confused, very drowsy, or cannot keep any fluids down.`,
  },
  {
    id: "hypertensive-crisis",
    severity: "urgent",
    patterns: [
      /(?:blood pressure|bp)\D{0,14}(?:1[89]\d|2\d\d)\s*(?:\/|over)\s*(?:1[2-9]\d|[2-9]\d\d)/i,
      /(?:blood pressure|bp)\D{0,14}(?:over|above|higher than|at|of|is|was)\s*(?:1[89]\d|2\d\d)/i,
      /(?:18[0-9]|19[0-9]|2[0-9]{2})\s*(?:\/|over)\s*(?:1[2-9][0-9]|[2-9][0-9]{2})/i,
      /(?:dangerously|very|really|extremely) high (?:blood pressure|bp)/i,
      /hypertensive (?:crisis|emergency|urgency)/i,
      /severe headache[^.]{0,40}(?:blurred|blurring|double|loss of|changes? in|trouble with)? ?vision/i,
      /(?:blurred|blurring|double|loss of|changes? in) vision[^.]{0,40}severe headache/i,
      /chest pain[^.]{0,40}(?:high blood pressure|high bp|hypertensive)/i,
      /(?:high blood pressure|high bp|hypertensive)[^.]{0,40}chest pain/i,
    ],
    action: "urgent_care",
    message:
      "A blood pressure reading over 180/120, a severe headache with blurred or changing vision, or chest pain together with high blood pressure can be a hypertensive crisis. " +
      "Sit quietly for five minutes and recheck if you can. If it is still this high, or you have any of these symptoms, seek urgent care now — contact your clinic or GP immediately. " +
      `Call ${AMBULANCE} or ${MOBILE} if there is chest pain, breathlessness, weakness, confusion, or vision loss.`,
  },
  {
    id: "acute-abdomen",
    severity: "urgent",
    patterns: [
      /(?:severe|unbearable|excruciating|terrible|awful|worst|crushing|stabbing) (?:abdominal|stomach|belly|tummy) (?:pain|cramps?|ache)/i,
      /(?:abdominal|stomach|belly|tummy) (?:pain|ache|cramps?)[^.]{0,24}(?:severe|unbearable|excruciating|worst|terrible|awful)/i,
      /(?:rigid|hard|board[- ]?like|tight|distended|stiff) (?:abdomen|stomach|belly|tummy)/i,
      /(?:abdomen|stomach|belly|tummy) (?:is |feels )?(?:rigid|hard|board[- ]?like|stiff|distended)/i,
      /(?:vomiting|throwing up|being sick|puking)[^.]{0,20}blood/i,
      /blood (?:in|with) (?:my |the )?(?:vomit|stool|stools|poop|faeces|feces|bowel)/i,
      /(?:black|tarry|bloody|red) (?:stool|stools|poop|faeces|feces)/i,
    ],
    action: "urgent_care",
    message:
      "Severe abdominal pain, a rigid or hard abdomen, vomiting blood, or blood in the stool with severe pain needs an urgent assessment today. " +
      "Do not eat or drink for now. Contact your nearest clinic or GP immediately. " +
      `Call ${AMBULANCE} or ${MOBILE} if the pain is sudden and severe, the abdomen is hard and tender, or the person looks very unwell or is fainting.`,
  },
];

/* The whole session, not just the last turn. A symptom named three messages ago is still a symptom
   named in this session, so the transcript and every history entry are searched together. The
   transcript is placed first so that when a phrase appears in both, the matched slice comes from
   what the person has just said. Rules are tried in array order — emergency before urgent — and the
   first rule with a matching pattern wins, which makes the order of ESCALATION_RULES the triage
   order. Returns null when nothing matches. */
export function checkEscalation(
  transcript: string,
  history: readonly string[] = [],
): EscalationResult | null {
  const haystack = [transcript, ...history].join("\n");
  for (const rule of ESCALATION_RULES) {
    for (const pattern of rule.patterns) {
      const match = pattern.exec(haystack);
      if (match) return { rule, matchedPattern: match[0] };
    }
  }
  return null;
}
