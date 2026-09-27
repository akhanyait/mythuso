import contract from "../../../../packages/catalog/assistant.json";
import terms from "../../../../packages/catalog/gilbert-emergency-terms.json";
import {
  labels as schedulingLabels,
  shortWhenText,
  type Visit,
} from "./scheduling";
import { recordById } from "./records";
import { EXPIRY_WARNING_DAYS } from "./vetting";
import { conditions, emergency as sosEmergency, numberById } from "./sos";
import { crisisLines, showsCrisisLines } from "./crisis-lines";
import {
  summarise,
  urgencyWords,
  type ConversationTurn,
  type HandoverSummary,
} from "../../../../packages/engines/src/access/domain/handover.ts";
import scheduling from "../../../../packages/catalog/scheduling.json";
import booking from "../../../../packages/catalog/booking.json";
import vetting from "../../../../packages/catalog/vetting.json";
import { accessSettingsNow, rotaAt } from "./settings";

/* GilbertOne's reasoning, without a screen attached to it.

   Everything GilbertOne says is in packages/catalog/assistant.json, and this module is the arithmetic
   beside it — the same arithmetic as apps/ios/MyThuso/Models/Assistant.swift and
   apps/android/.../model/Assistant.kt, run against the same shared fixtures in the contract, so a
   sentence gets the same answer on every platform. There is no model behind it and nothing it sends.

   THE ORDER THAT MAKES IT SAFE. A message is folded to plain letters and reduced to stems. The
   emergency words are checked first, on stems and with small gaps, so "chest pains", "she bled" and
   "my chest feels tight" all raise; a match ends the matching. Only then is a trigger phrase looked
   for — and a question may answer on its own only if every word of the message is one of its trigger
   words or ordinary filler. Anything left over is said to be unread, with the ambulance numbers
   beside it, because a list of words will always miss a way of saying something frightening, and the
   defect the Wave 1 review found was the calm answer that followed the miss. "Nothing needs you" is
   never said to a message GilbertOne did not read all of.

   A TEXT BOX, AND WHY IT IS HONEST. The emergency words read it, the unread rule reads the rest, and
   the unmatched answer says plainly that GilbertOne could not assess it and puts the ambulance first. The
   emergency words are a draft nobody clinical has reviewed, which is why the contract's
   silenceIsNotSafety sentence is never left unsaid: its first half is the last of the consent
   gate's prohibitions, its second half — the numbers — is the composer's own strip, which stays on
   the screen the whole conversation, and the public assistant surface renders it whole.

   A MICROPHONE IN THE BOX, AND NO LISTENING SPHERE. Since the founder's decision of 18 September 2026
   the composer carries a push-to-talk button, and the words are the browser's own recognition of them —
   the reason the disclosure is on the screen before the first tap rather than after it. What it catches is
   a draft in the text box: nothing sends it, stores it or answers it until she presses Send, and no audio
   is taken or kept on any path, which the build still refuses across the whole of apps/web/src. The sphere
   is not driven by any of it. Listening and Thinking are native states; the web moves between Idle,
   Guiding, Escalate and Handover only, and never adds a pause to look considered. */

export type Depth = 0 | 1 | 2 | 3;
/* The states the web may be in. Listening and Thinking are the phones' alone; see the contract's statesWhy. */
export type PulseId = "idle" | "guiding" | "escalate" | "handover";

export const identity = contract.identity;
export const states = contract.states;
export const questionGroups = contract.questionGroups;
export const refusals = contract.refusals;
export const conversation = contract.conversation;
/* The consent gate's own words, since 20 September 2026: the screen a patient meets before her
   first interaction. Everything the gate shows is read from here — the intro, the two chip
   groups, the privacy and refusal notes, the two boxes and the two buttons — so a sentence on
   that screen can be reworded where every other approved sentence is, and never in the panel. */
export const consent = contract.consent;
/* Web-only layout copy for the three restyled GilbertOne surfaces (welcome, consent gate, public
   sheet). Short headings, labels and framing lines the layout needs; every clinical sentence and
   number still comes from its own section and from sos.json. Not emitted to the phones. */
export const screens = contract.screens;
export const voice = contract.voice;
export const answers = contract.answers;
export const fixtures = contract.fixtures;
/* The terms are their own versioned configuration (founder, 14 September 2026); how they match is here. */
export const emergencyGroupsContract = terms.groups;
export const falsePositives = terms.falsePositives;
export const stateSpec = (id: PulseId) => states.find((s) => s.id === id)!;
export const refusal = (id: string) => refusals.find((r) => r.id === id)!;

/* {ambulance}, {mobile} and {seconds} are the contract's own tokens and are filled from sos.json and
   the voice policy; nothing here types an emergency number. */
const fill = (text: string, values: Record<string, string>) =>
  text.replace(/\{([a-zA-Z]+)\}/g, (token, key) => values[key] ?? token);
const lineValues = {
  ambulance: numberById("ambulance").number,
  mobile: numberById("mobile").number,
  seconds: String(contract.voice.maxListeningSeconds),
};
export const say = (text: string) => fill(text, lineValues);
export const silenceIsNotSafety = say(contract.silenceIsNotSafety);
export const lines = (ids: string[]) =>
  ids.map((id) => {
    const n = numberById(id);
    return { number: n.number, name: n.name };
  });
/* What a voice reads where it would otherwise have read the digits. sos.json's spokenNumbers decision
   of 23 September 2026: an emergency number is a telephone number, not a quantity, and "10111" said
   aloud as one thousand one hundred and eleven is a number nobody can dial in a hurry. The spoken
   form is the contract's own field — derived nowhere, typed nowhere — and the boundary check holds it
   to the digits beside it. The screen still shows the digits; only the reading changes. */
export const spokenNumber = (id: string): string => {
  const n = numberById(id) as { number: string; spoken?: string };
  return n.spoken ?? n.number;
};
export const spokenLines = (ids: string[]) =>
  ids.map((id) => {
    const n = numberById(id);
    return { number: n.number, name: n.name, spoken: spokenNumber(id) };
  });

export type Situation = {
  id: string;
  name: string;
  sentence: string;
  figure: string | null;
  figureLabel: string | null;
  depth: Depth;
};

/* The visit is the one the home card shows — the first upcoming visit the person booked, written by the
   same shortWhenText — so GilbertOne and the home cannot name two days for one visit. With nothing booked,
   or a nurse still being found, it says scheduling.json's own words for that. */
const scheduled = (text: string) =>
  text.replace(
    /\{(noUpcoming|noUpcomingDetail|asapPending)\}/g,
    (token, key: keyof typeof schedulingLabels) =>
      schedulingLabels[key] ?? token,
  );

export function situations(visit: Visit | null = null): Situation[] {
  const values: Record<string, string> = {
    laboratory:
      recordById("laboratory")?.name ?? contract.situationsFallback.laboratory,
    expiryWarningDays: String(EXPIRY_WARNING_DAYS),
  };
  return contract.situations.map((s) => {
    const depth = s.depth as Depth;
    if (s.id === "visit" && (!visit || visit.kind !== "scheduled")) {
      const state = visit
        ? contract.visitStates.pending
        : contract.visitStates.none;
      return {
        id: s.id,
        name: scheduled(state.name),
        sentence: scheduled(state.sentence),
        figure: null,
        figureLabel: null,
        depth,
      };
    }
    const withVisit =
      s.id === "visit" && visit
        ? { ...values, visitWhen: shortWhenText(visit) }
        : values;
    return {
      id: s.id,
      name: s.name,
      sentence: fill(s.sentence, withVisit),
      figure: s.figure === null ? null : fill(s.figure, withVisit),
      figureLabel:
        s.figureLabel === null ? null : fill(s.figureLabel, withVisit),
      depth,
    };
  });
}

export type Question = (typeof contract.questions)[number];
export const questions: Question[] = contract.questions;

/* ---- The audience a conversation serves ---------------------------------------------------
 * The founder's decision of 19 September 2026: one GilbertOne across the product, with what
 * differs between audiences written in the contract's audiences section rather than in any
 * component. The ids are the RoleIds in lib/roles.ts and the engine's Audience, and the gate
 * holds the three lists together. A question carries the audiences it is offered to as a tag,
 * so the scope is authored where the question is. */
export type AudienceId =
  | "patient"
  | "nurse"
  | "doctor"
  | "partner"
  | "control-tower"
  | "back-office";
export type AudienceEntry = (typeof contract.audiences.list)[number];

/* Loud rather than blank: a panel asked to serve an audience the contract does not carry would
   otherwise draw a session with no questions, no label and no buttons, and nothing would say so. */
export function audienceOf(id: AudienceId): AudienceEntry {
  const found = contract.audiences.list.find((a) => a.id === id);
  if (!found)
    throw new Error(
      `packages/catalog/assistant.json has no audience "${id}". Every audience a panel can serve is in its audiences list.`,
    );
  return found;
}

/** The questions an audience is offered — the tags on each question, read one way. */
export const questionsFor = (audience: AudienceId): Question[] =>
  questions.filter((q) => q.audiences.includes(audience));

/* A refusal's own words for the audience asking. Most refusals are one truth for everybody; the
   two that differ — what GilbertOne will not name, and whose doses it will not carry — carry an
   `audiences` map in the contract, and a nurse asking for a dose and a patient asking for one
   are different refusals in exactly that map. */
export type RefusalWords = { statement: string; why: string };
export function refusalFor(
  entry: (typeof contract.refusals)[number],
  audience: AudienceId,
): RefusalWords {
  const variant = (entry as { audiences?: Record<string, RefusalWords> })
    .audiences?.[audience];
  return variant ?? { statement: entry.statement, why: entry.why };
}

/* The unmatched answer's own words for an audience. The patient's are the section's own; each
   staff audience's names the three questions its session answers and what is not GilbertOne's
   to read — which is the refusal half of the answer, because "I can't assess that" to a nurse
   is a scope, not a shrug. */
export function unmatchedDetail(audience: AudienceId): string {
  const variants = (
    contract.answers.unmatched as {
      audiences?: Record<string, { detail: string }>;
    }
  ).audiences;
  return variants?.[audience]?.detail ?? contract.answers.unmatched.detail;
}

export type EmergencyGroup = { id: string; name: string };

/* The group's name is the SOS screen's word for the condition it raises, or the contract's own for
   the two groups that raise without one. */
const groupName = (group: (typeof emergencyGroupsContract)[number]) =>
  group.condition === null
    ? ((group as { name?: string }).name ?? group.id)
    : (conditions.find((c) => c.id === group.condition)?.name ?? group.id);

/* ---- Words into stems ------------------------------------------------------------------------
   Lower case, the contract's foldings (æ is ae), combining marks removed (é is e), apostrophes
   removed, and anything outside a–z and 0–9 a space. Then the stemming rules, in the contract's order.
   Checked on every platform against fixtures.stems. */
const normalisation = contract.matcher.normalisation;
const irregular: Record<string, string> = contract.matcher.stemming.irregular;

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

export const stems = (text: string) => tokens(text).map(stem);

/* A term's words in order, each within maxGap words of the one before. Greedy from each start, which
   is deterministic and is exactly what the other two platforms do. */
function hasSequence(said: string[], term: string[], gap: number): boolean {
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

export function emergencyGroupsIn(text: string): EmergencyGroup[] {
  const said = stems(text);
  return emergencyGroupsContract
    .filter((g) =>
      g.words.some((w) => hasSequence(said, stems(w), contract.matcher.maxGap)),
    )
    .map((g) => ({ id: g.id, name: groupName(g) }));
}

/** The longest trigger (in words, adjacent) wins; a tie goes to the question listed first.
 *  Only the questions the audience is offered are in the running, because the tags are the
 *  assistant's scope — and the emergency words are matched before any of this, in send(), so
 *  scoping a question out can never scope an emergency out. */
export function questionFor(
  text: string,
  audience: AudienceId = "patient",
): Question | null {
  const said = stems(text);
  let best: Question | null = null;
  let length = 0;
  for (const question of questionsFor(audience))
    for (const trigger of question.triggers) {
      const term = stems(trigger);
      if (term.length > length && hasSequence(said, term, 0)) {
        best = question;
        length = term.length;
      }
    }
  return best;
}

/* Reading everything: a word that is neither one of the question's own trigger words nor filler is a
   word GilbertOne did not read, and it is said so. Only a matched question is measured — a greeting
   consumes its whole message in the bridge, so no other trigger set reaches this rule. */
const fillerStems = new Set(contract.matcher.readEverything.filler.map(stem));
export function leavesUnread(text: string, question: Question): boolean {
  const covered = new Set([
    ...fillerStems,
    ...question.triggers.flatMap(stems),
  ]);
  return stems(text).some((word) => !covered.has(word));
}

export type SummaryRow = { label: string; value: string };
export type Channel = "typed" | "chosen";
export type Reply =
  | { kind: "situation"; situation: Situation }
  | { kind: "identity" }
  | { kind: "voice" }
  /* The greeting, since the greeting fix of 20 September 2026: "hello" on its own is not a question
     the matcher has a trigger for, and it used to answer "I can't assess that" — the one reply that
     reads as a refusal to somebody who only said hello. Its sentence, its state and its face are the
     contract's (answers.greeting, affect.answers.greeting), read like every other reply kind's. */
  | { kind: "greeting" }
  | { kind: "emergency"; groups: EmergencyGroup[] }
  | { kind: "unmatched" }
  /* The second-tier answer, since 20 September 2026: words a language model wrote, shown under the
     answers.service heading only when the assistant API answered with a source above its keyword
     classifier — 'model', or 'orchestrator' since the LangChain tier of 21 September. It lives here
     so the panel treats it like every other reply — face, pulse, speech, outcome — without knowing
     or caring where the sentence came from. */
  | { kind: "service"; text: string }
  | {
      kind: "handover";
      rows: SummaryRow[];
      summary: HandoverSummary;
      desk: DeskWords;
    };

/** `unread` is true when the answer came with words GilbertOne could not read; the unread answer follows it. */
export type Turn = {
  id: number;
  asked: string | null;
  channel: Channel | null;
  reply: Reply;
  matched: Question | null;
  groups: EmergencyGroup[];
  unread: boolean;
};

export function replyTo(question: Question, visit: Visit | null = null): Reply {
  switch (question.answer) {
    case "situation": {
      const situation = situations(visit).find((s) => s.id === question.id);
      return situation
        ? { kind: "situation", situation }
        : { kind: "unmatched" };
    }
    case "identity":
      return { kind: "identity" };
    case "voice":
      return { kind: "voice" };
    case "emergency":
      return { kind: "emergency", groups: [] };
    default:
      return { kind: "unmatched" };
  }
}

export function pulseOf(reply: Reply): PulseId {
  switch (reply.kind) {
    case "situation":
      return "guiding";
    case "identity":
      return answers.identity.state as PulseId;
    case "voice":
      return answers.voice.state as PulseId;
    case "greeting":
      return answers.greeting.state as PulseId;
    case "emergency":
      return answers.emergency.state as PulseId;
    case "unmatched":
      return answers.unmatched.state as PulseId;
    case "service":
      return answers.service.state as PulseId;
    case "handover":
      return answers.handover.state as PulseId;
  }
}

/* ---- The face an answer wears ------------------------------------------------------------------
 * The founder's decision of 19 September 2026: affect is deterministic, derived from the answer kind
 * alone — no model, no network — and written in the contract's affect section, where each kind's cue,
 * the posture that cue means and the reason it is that one are on file beside the dated decision.
 * `cueOf` is the affect seam's read half, the way `pulseOf` is the state's: the panel asks what face
 * a reply wears and the answer comes from the contract, not from a ternary in the component.
 *
 * A turn with unread words wears the refusal's face whatever it matched, because the unread block in
 * that same turn is itself a refusal — the rest was not read — and affect may never soften a refusal. */
export const affect = contract.affect;
export function cueOf(reply: Reply, unread = false): string {
  const mapped = unread ? affect.answers.unread : affect.answers[reply.kind];
  return mapped.cue;
}
/* The register an answer is read aloud in — the voice's map, the way `cueOf` is the face's, and
   decided the same way: from the answer kind alone, in the contract's spokenRegister section of
   27 September 2026. The answer is a class id in packages/catalog/voice.json; whether that class's
   voice may be set by anybody is voice.json's zones' to say, and lib/voice.ts reads it there. A turn
   with unread words reads in the refusal's register whatever it matched, for the reason it wears the
   refusal's face: the unread block in that turn is itself a refusal. */
export const spokenRegister = contract.spokenRegister;
export function voiceClassOf(reply: Reply, unread = false): string {
  return unread
    ? spokenRegister.answers.unread
    : spokenRegister.answers[reply.kind];
}
/* What the cue that owns the face means, for the readable surface the tests key on. Reversed from
   the affect mapping: the greeting cues are conversation rather than answers, so a face they own has
   no posture on record — which is honest, a greeting is not an answer. */
export function postureOf(cue: string | null | undefined): string | undefined {
  if (!cue) return undefined;
  return Object.values(affect.answers).find((entry) => entry.cue === cue)
    ?.posture;
}

/* The conversation, held in memory and nowhere else, and capped. No browser storage of any kind: a
   transcript of health questions is the last thing that should survive a closed tab on a shared
   phone, and the build refuses those APIs in apps/web/src. */
/* What the panel opens with is the audience's own decision on file: the patient's first message
   is her current situation, and a staff preview opens with what GilbertOne is, because a nurse's
   first question is not "does anything need me" and the answer to it here would be about somebody
   else's chart. */
export const opening = (audience: AudienceId = "patient"): Turn[] => [
  {
    id: 0,
    asked: null,
    channel: null,
    reply:
      audienceOf(audience).opensWith === "identity"
        ? { kind: "identity" }
        : { kind: "situation", situation: situations()[0] },
    matched: null,
    groups: [],
    unread: false,
  },
];

const append = (turns: Turn[], make: (id: number) => Turn) =>
  [...turns, make((turns[turns.length - 1]?.id ?? 0) + 1)].slice(
    -conversation.turnLimit,
  );

/* What the nurse queue is handed, as the Access domain summarises it: how the last thing was asked, what
   it matched, and an urgency. Never the person's words and never which emergency words fired —
   conversation.handover@1 refuses both, and a group can be a crisis, which joined to a person is a record
   of it. A request for a nurse is not itself what a nurse needs to read, so it is skipped.

   `raised` is the panel's memory that an emergency was answered in a turn the conversation's cap has since
   dropped. An emergency at the first message and a calm question at the thirtieth is still an emergency,
   and scrolling out of the window must not be what lowers it. */
const conversationOf = (turns: Turn[]): ConversationTurn[] =>
  turns.map((t) => ({
    channel: t.channel,
    matchedQuestionId: t.matched?.id ?? null,
    askedForNurse: t.reply.kind === "handover",
    emergency: t.reply.kind === "emergency",
  }));
export const emergencyIn = (turns: Turn[]) =>
  turns.some((t) => t.reply.kind === "emergency");

/* Who answers a handover and whether anybody is there now: Access's settings handover-answered-by and
   handover-hours in force, asked once when the handover is shown and kept on the reply, so somebody told
   when the desk opens is not told something different a minute later. Out of hours the words are, in
   order, that nobody is on the desk, the emergency numbers from sos.json, and a call back when it next
   opens — and nothing here can leave out the first two, because neither is a setting: an admin changes
   the hours, never whether the numbers are given. */
export type DeskWords = {
  readonly answeredBy: string;
  readonly outOfHours: {
    readonly nobody: string;
    readonly numbers: string;
    readonly callback: string | null;
  } | null;
};
const fillWords = (text: string, values: Record<string, string>) =>
  text.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
export const handoverDeskWords = booking.handover;
/* When the handover desk answers, by the one rule for a rota: a post is on duty when one of its windows covers
   the day and the time in scheduling.json's timezone. rotaAt and the onDuty beneath it are the shared settings
   code's, which Core's escalation rota and the Access engine's handover route also ask, so the preview, the
   engine and the rota can never disagree about whether six in the morning has begun or when a shut desk opens.
   A screen's lib reaches that code through lib/settings.ts alone, so it is imported from there. */
export function handoverDesk(now: Date): DeskWords {
  const inForce = accessSettingsNow();
  const words = booking.handover;
  const answeredBy = inForce.handoverAnsweredBy
    .map((id) => vetting.roles.find((role) => role.id === id)?.name ?? id)
    .join(", ");
  const desk = rotaAt(inForce.handoverHours, now.getTime());
  if (desk.open) return { answeredBy, outOfHours: null };
  const opens = desk.opens;
  const when = !opens
    ? null
    : fillWords(
        opens.daysAhead === 0
          ? words.opensToday
          : opens.daysAhead === 1
            ? words.opensTomorrow
            : words.opensOn,
        {
          time: opens.from,
          day: new Date(opens.at).toLocaleDateString("en-ZA", {
            weekday: "long",
            timeZone: scheduling.timezone,
          }),
        },
      );
  return {
    answeredBy,
    outOfHours: {
      nobody: words.outOfHours,
      numbers: fillWords(words.outOfHoursNumbers, {
        ambulance: numberById("ambulance").number,
        mobile: numberById("mobile").number,
      }),
      callback: when === null ? null : fillWords(words.callback, { when }),
    },
  };
}

export function handoverReply(turns: Turn[], raised = false): Reply {
  const h = answers.handover;
  const label = (id: string) => h.fields.find((f) => f.id === id)?.label ?? id;
  const found = summarise(conversationOf(turns));
  const summary: HandoverSummary = raised
    ? { ...found, urgencyCode: "emergency" }
    : found;
  const last = [...turns]
    .reverse()
    .find((t) => t.asked !== null && t.reply.kind !== "handover");
  const channel = !last
    ? h.nothingAsked
    : last.channel === "chosen"
      ? h.channelChosen
      : h.channelTyped;
  const matched = !last
    ? h.nothingMatched
    : (last.matched?.asks ??
      (last.groups.length ? h.matchedEmergency : h.nothingMatched));
  return {
    kind: "handover",
    summary,
    rows: [
      { label: label("channel"), value: channel },
      { label: label("matched"), value: matched },
      {
        label: label("urgency"),
        value: urgencyWords(summary.urgencyCode).name,
      },
    ],
    desk: handoverDesk(new Date()),
  };
}

/** A message in a person's own words, for the audience the conversation serves. */
export function send(
  turns: Turn[],
  text: string,
  visit: Visit | null = null,
  raised = false,
  audience: AudienceId = "patient",
): Turn[] {
  const words = text.trim();
  if (!words) return turns;
  const groups = emergencyGroupsIn(words);
  /* The emergency words first, and a match ends it. */
  if (groups.length)
    return append(turns, (id) => ({
      id,
      asked: words,
      channel: "typed",
      reply: { kind: "emergency", groups },
      matched: null,
      groups,
      unread: false,
    }));
  const question = questionFor(words, audience);
  if (!question)
    return append(turns, (id) => ({
      id,
      asked: words,
      channel: "typed",
      reply: { kind: "unmatched" },
      matched: null,
      groups: [],
      unread: false,
    }));
  const unread =
    question.answer !== "emergency" && leavesUnread(words, question);
  /* A claim about everything is not made to a message GilbertOne did not read all of. */
  if (
    unread &&
    contract.matcher.readEverything.neverWithUnread.includes(question.id)
  ) {
    return append(turns, (id) => ({
      id,
      asked: words,
      channel: "typed",
      reply: { kind: "unmatched" },
      matched: null,
      groups: [],
      unread: false,
    }));
  }
  const reply: Reply =
    question.answer === "handover"
      ? handoverReply(turns, raised)
      : replyTo(question, visit);
  return append(turns, (id) => ({
    id,
    asked: words,
    channel: "typed",
    reply,
    matched: question,
    groups: [],
    unread,
  }));
}

/** One of the suggested questions, pressed. Its own words, so nothing is unread. */
export function choose(
  turns: Turn[],
  question: Question,
  visit: Visit | null = null,
  raised = false,
): Turn[] {
  const reply: Reply =
    question.answer === "handover"
      ? handoverReply(turns, raised)
      : replyTo(question, visit);
  return append(turns, (id) => ({
    id,
    asked: question.asks,
    channel: "chosen",
    reply,
    matched: question,
    groups: [],
    unread: false,
  }));
}

/** "Talk to a nurse", pressed from the unmatched or unread answer. */
export const handOver = (turns: Turn[], raised = false): Turn[] =>
  append(turns, (id) => ({
    id,
    asked: null,
    channel: null,
    reply: handoverReply(turns, raised),
    matched: null,
    groups: [],
    unread: false,
  }));

/** A message the engine greeted on, since the greeting fix of 20 September 2026. The engine
 *  classifies "hello" as a greeting, and the matcher has no trigger for one — so without this the
 *  bridge's own fallback answered "I can't assess that" to somebody who had only said hello. The
 *  words are kept exactly as asked, the way every other turn keeps them; the reply is the
 *  contract's own sentence, worn with the greeting's state and face.
 *
 *  Since 21 September 2026 the greeting consumes the whole message: the classification is the
 *  engine's decision that nothing else in the message is something it recognises — every category
 *  that can answer sits above the greeting in its order — so there is no remainder to measure and
 *  no unread flag to carry. The split reply the unread rule used to produce here, a hello and then
 *  "I can't assess the rest of what you said" with the ambulance numbers, answered a plain
 *  "Hello World" with a refusal. Words the web's own emergency list catches never reach this turn:
 *  the bridge runs that detector first and answers the emergency. */
export function greet(turns: Turn[], text: string): Turn[] {
  const words = text.trim();
  if (!words) return turns;
  return append(turns, (id) => ({
    id,
    asked: words,
    channel: "typed",
    reply: { kind: "greeting" },
    matched: null,
    groups: [],
    unread: false,
  }));
}

/** How a turn came out, in the words the shared fixtures use. */
export const outcomeOf = (turn: Turn): string =>
  turn.reply.kind === "emergency"
    ? "emergency"
    : turn.reply.kind === "unmatched" && !turn.matched
      ? "unmatched"
      : turn.unread
        ? "answer-and-unread"
        : "answer";

export const emergencyAnswer = {
  ...answers.emergency,
  headline: sosEmergency.headline,
  lead: sosEmergency.lead,
  notAnAmbulance: sosEmergency.notAnAmbulance,
};

/* ---- What a reply says out loud ------------------------------------------------------------------
 * The speech seam's read half, the way `cueOf` is the affect seam's. The founder's decision of
 * 19 September 2026 (`voice.webSpeech`) was switched on the next day, and the panel hands every
 * reply's own words to the adapter — so every sentence a patient hears is read from the reply
 * itself, with nothing left to decide, no sentence to find and no number to fetch.
 *
 * The words are the reply's own, exactly as ReplyBody writes them on the panel: every paragraph
 * and list the reply carries, in the order the screen shows them, and nothing it does not carry
 * — no invented summary and no shortened form, because the caption rule the decision writes is
 * that the voice is another reading of the words and never a replacement for them, and a reading
 * that skipped the ambulance numbers or the refusals would be a different answer. Two things
 * beside those words are deliberately not said: a button label is a thing to press rather than a
 * sentence, and the handover's send state is true the moment the reply lands and false the moment
 * she presses Send, so speech that said "not sent" would be stale before it finished. The unread
 * block is part of the turn's answer on the screen, so it is read in its place — and it is a
 * refusal, which is the last thing a spoken reading may be softened by leaving out. */
export function spokenOf(turn: Turn, audience: AudienceId): string {
  const words: string[] = [];
  const add = (...items: string[]) => {
    for (const item of items) if (item) words.push(item);
  };
  /* The numbers are read as they are spoken, number first: a person hearing "one zero one seven
     seven, Ambulance" hears the call-taker's own reading of a telephone number rather than a
     quantity — sos.json's spokenNumbers decision of 23 September 2026 — and the order is the one
     she would read, which is why this function exists at all. The digits stay on the screen beside
     the voice; the reading and the print are two readings of one number, from the same file. */
  const numbers = (ids: string[]) => {
    for (const n of spokenLines(ids)) words.push(`${n.spoken}, ${n.name}.`);
  };
  switch (turn.reply.kind) {
    case "situation":
      add(turn.reply.situation.sentence);
      break;
    case "identity":
      add(identity.whatItIs, identity.whatItIsNot);
      break;
    case "voice":
      add(voice.sentences.web, refusal("no-audio-kept").statement);
      break;
    case "greeting":
      add(answers.greeting.sentence);
      break;
    case "emergency":
      if (turn.reply.groups.length)
        add(
          emergencyAnswer.noticed,
          ...turn.reply.groups.map((g) => `${g.name}.`),
        );
      add(emergencyAnswer.headline, emergencyAnswer.lead);
      numbers(emergencyAnswer.numbers);
      add(emergencyAnswer.notAnAmbulance);
      /* The crisis lines after the ambulance numbers, in the order the screen shows them, and only
         when the crisis words raised this answer — packages/catalog/crisis-lines.json. */
      if (showsCrisisLines(turn.reply.groups)) {
        add(crisisLines.heading);
        /* Read as a telephone number, digit by digit — the spoken form beside each number in
           crisis-lines.json, as sos.json's emergency numbers are — never as a quantity. */
        for (const line of crisisLines.lines)
          words.push(`${line.spoken}, ${line.name}.`);
      }
      break;
    case "unmatched":
      add(
        answers.unmatched.sentence,
        unmatchedDetail(audience),
        answers.unmatched.ifUrgent,
      );
      numbers(answers.unmatched.numbers);
      break;
    case "service":
      /* The heading first, because it is what the screen says first: these words were written by a
         language model rather than read from an approved sentence, and the disclosure beside them
         is read in full — the one spoken reading this contract may never soften by omission. */
      add(
        answers.service.heading,
        turn.reply.text,
        answers.service.disclosure,
        answers.service.ifUrgent,
      );
      numbers(answers.service.numbers);
      break;
    case "handover": {
      const h = answers.handover;
      const out = turn.reply.desk.outOfHours;
      add(h.title);
      if (out) {
        add(out.nobody, out.numbers);
        if (out.callback) add(out.callback);
      }
      add(h.lead);
      for (const row of turn.reply.rows)
        words.push(`${row.label}: ${row.value}.`);
      add(
        `${handoverDeskWords.answeredByLabel} ${turn.reply.desk.answeredBy}.`,
      );
      if (turn.reply.summary.urgencyCode === "emergency") add(h.neverLowered);
      add(h.notCarriedHeading, ...h.notCarried.map((item) => item.sentence));
      break;
    }
  }
  if (turn.unread) {
    add(
      answers.unread.sentence,
      answers.unread.detail,
      answers.unread.ifUrgent,
    );
    numbers(answers.unread.numbers);
  }
  /* The tokens are filled once, at the end, with the same values the written words are filled
     with — so a number somebody hears cannot drift from the number she reads beside it. */
  return say(words.join(" "));
}

/* ---- Which language a reply is written in ---------------------------------------------------
 * voice.spokenLanguages, since 23 September 2026: a person may write to GilbertOne in isiZulu and
 * the service may answer in her language, and the voice that reads the reply follows the words
 * rather than the microphone's English-only rule — which stands, because hearing is the founder's
 * decision of 14 September 2026 and the recogniser still hears English only.
 *
 * Only a reply a language model wrote is ever tested, because every approved sentence in the
 * contract is English and a detector run over them could only ever find nothing. The words are
 * counted against the contract's own list — a short list of isiZulu words no English sentence
 * contains — and two must appear, so one loanword in an English answer changes nothing. Detection
 * is a fact about the reply, decided before any voice is asked for, so the seam stays where it
 * always was: lib/voice.ts chooses the voice, this file decides what language the words are. */
export type SpokenLanguage = (typeof voice.spokenLanguages)[number];

export function spokenLanguageOf(reply: Reply): SpokenLanguage | null {
  if (reply.kind !== "service") return null;
  const text = reply.text.toLowerCase();
  for (const language of voice.spokenLanguages) {
    let found = 0;
    for (const word of language.detectWords)
      if (text.includes(word)) found += 1;
    if (found >= 2) return language;
  }
  return null;
}
