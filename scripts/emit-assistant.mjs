/* GilbertOne, written out for two native apps, by a machine.

   packages/catalog/assistant.json holds everything the assistant says and the rules it says it by.
   The web reads that file. iOS and Android cannot, so it is written into AssistantData.swift and
   AssistantData.kt here, and scripts/check-boundaries.mjs compares both with the contract on every
   build.

   This is the contract that most needed a generator. Before it, the four situation sentences were
   typed in AssistantView.swift and copied into apps/web/src/lib/assistant.ts, and Android had no
   assistant at all. Now there are three platforms, a matcher that decides which answer a sentence
   gets, and a list of emergency words that only ever raise. A trigger phrase typed differently on one
   platform is the same question answered differently depending on the phone somebody owns, and an
   emergency word missing from one copy is an ambulance number one platform does not show. There is
   one list, and it is not typed.

   What is resolved here and what is not.
     - {ambulance} and {mobile} are filled from packages/catalog/sos.json, and each emergency answer
       carries the numbers, their names and the SOS headline from the same file. A native app never
       holds an emergency number that was typed for it.
     - Each emergency word group carries the name of the sos.json condition it maps to, resolved
       here, so the escalation names the condition in the SOS screen's own words.
     - {seconds} is voice.maxListeningSeconds.
     - The situation tokens — {visitWhen}, {laboratory}, {expiryWarningDays} — are left in. They are a
       booked visit and counts from other contracts, and a date resolved when this file was generated
       would be wrong by the next morning. scheduling.json's labels for no visit and a pending one are
       filled here. Models/Assistant.swift and model/Assistant.kt
       fill them at runtime.
     - The matcher's data — foldings, irregular forms, filler words, the gap, the unread answer — and
       the shared fixtures are emitted, so each platform's own tests run against the same list.
     - The audience dimension of the founder's decision of 19 September 2026 is emitted, and only where
       the matcher needs it: each question carries the audiences it is offered to, and each shared
       fixture the audience it is spoken to, because the matcher's arithmetic is triplicated and a
       scope one platform ignores is a question it answers to an audience the contract never offered.
       The audiences section itself — the simulated label, the voice control, the patient's two action
       buttons, what a session opens with — is not: the phones' assistant is the patient's, every one
       of those is a preview panel's concern, and a Swift copy of a label no phone renders would be a
       second place for the founder's decision to drift. scripts/check-boundaries.mjs holds the
       vocabulary to the RoleIds and the engine's Audience type instead.
     - The descriptor is not emitted on its own, only descriptorLine with its disclosure, so no native
       screen can say "Your Thuso AI Doctor" without saying what GilbertOne is not.
     - The typed API clients — Models/AssistantClient.swift and model/AssistantClient.kt — are written
       in the same pass from packages/catalog/apis/assistant.json's built routes: the three addresses
       a phone asks today, each at the route's own version, the request and response shapes, the web
       bridge's twelve seconds, and the two reply sources whose words may replace what the phone
       itself wrote. The addresses are emitted, never typed, so a version the catalog moves without
       the clients moving is caught by scripts/check-boundaries.mjs rather than by a phone.
     - The Pulse events are not emitted. They are a contract between engines, no phone emits one in
       this release, and a Kotlin copy of an event schema nobody publishes would be a second place for
       it to drift.
     - Neither is the affect section. Cue ids are the web rig's own vocabulary: the phones carry the
       six states and no rig, so a Swift copy of a face mapping nothing renders would be a second
       place for the founder's decision to drift. scripts/check-boundaries.mjs runs the rig's own
       reducer against the mapping instead, which is a stronger check than a copy could ever be.
     - Neither are the usage descriptions: they belong to the iOS target's build settings, where the
       build compares them with this file directly.

   Escaping is the hazard, and the two languages disagree about it:
     - Swift needs only its quotes escaped.
     - Kotlin needs backslash, quote and dollar escaped, because a lone backslash is an escape and a
       lone $ starts a string template.
   The curly quotes and dashes in these sentences are simply UTF-8. */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SOURCE = "packages/catalog/assistant.json";
const SOS = "packages/catalog/sos.json";
const SCHEDULING = "packages/catalog/scheduling.json";
const TERMS = "packages/catalog/gilbert-emergency-terms.json";
const API = "packages/catalog/apis/assistant.json";

/* The web bridge's REFINE_TIMEOUT_MS (apps/web/src/lib/gilbertone-bridge.ts), held here as well:
   the three platforms must give the service the same patience, or one of them shows an answer the
   others have already given up on. */
const REFINE_TIMEOUT_MS = 12_000;

/* Characters a reader of the generated source cannot see — the no-break spaces, the soft hyphen, the
   zero-width characters and the byte-order mark — are written as escapes rather than as themselves.
   Since 1 October 2026 the matcher removes the invisible ones and the shared fixtures carry them on
   purpose, and a fixture whose point is an invisible character must not look, in a Swift or Kotlin
   file, like the fixture beside it that has none. */
const unseen = /[\u00a0\u00ad\u200b-\u200d\u202f\u2060\ufeff]/g;
const hex = (c) => c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0");
const swift = (value) => {
  if (value.includes("\\"))
    throw new Error(
      `Cannot write ${JSON.stringify(value)} as a Swift literal here`,
    );
  return `"${value.replace(/"/g, '\\"').replace(unseen, (c) => `\\u{${hex(c)}}`)}"`;
};
const kotlin = (value) =>
  `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "\\$").replace(unseen, (c) => `\\u${hex(c)}`)}"`;
const optSwift = (value) => (value == null ? "nil" : swift(value));
const optKotlin = (value) => (value == null ? "null" : kotlin(value));
const listSwift = (values) => `[${values.map(swift).join(", ")}]`;
const listKotlin = (values) =>
  values.length ? `listOf(${values.map(kotlin).join(", ")})` : "emptyList()";

const banner = () =>
  [
    `Generated by scripts/emit-assistant.mjs from ${SOURCE}, ${TERMS} and ${SOS}.`,
    "Do not edit by hand — run `npm run assistant`. The build fails if this file and its sources",
    "disagree, so an edit here is lost rather than merely wrong.",
    "",
    "Everything GilbertOne says, the six Pulse states, the questions with their trigger phrases and",
    "the audiences each is offered to, the emergency words (drafted, not yet reviewed by a clinician,",
    "and used only to raise), the voice policy and the refusals. The emergency numbers are resolved",
    "from sos.json when this file is written. The situation tokens are left in on purpose: they are",
    "dates, and are filled at runtime. Each shared fixture carries the audience it is spoken to.",
  ]
    .map((line) => (line ? `// ${line}` : "//"))
    .join("\n");

const clientBanner = () =>
  [
    `Generated by scripts/emit-assistant.mjs from ${API}, the assistant engine's API contract.`,
    "Do not edit by hand — run `npm run assistant`. The build fails if this file and its source",
    "disagree, so an edit here is lost rather than merely wrong.",
    "",
    "The typed client for the contract's built routes: the addresses a phone asks today, each at",
    "the route's own version, with every request and response field the contract declares, the",
    "same twelve-second patience the web bridge gives the service, and the error shape a refusal",
    "arrives in. The routes the contract declares and the service does not answer yet are not",
    "here — their refusal is the contract's own sentence, and a phone that has not typed it",
    "cannot soften it.",
  ]
    .map((line) => (line ? `// ${line}` : "//"))
    .join("\n");

export function emitAssistant(root = "") {
  const contract = JSON.parse(readFileSync(root + SOURCE, "utf8"));
  const sos = JSON.parse(readFileSync(root + SOS, "utf8"));
  const schedulingLabels = JSON.parse(
    readFileSync(root + SCHEDULING, "utf8"),
  ).labels;
  /* The emergency terms are their own versioned configuration since the founder's decision of 14
    September 2026; the matching rules stay in the contract. */
  const terms = JSON.parse(readFileSync(root + TERMS, "utf8"));
  /* The assistant engine's own API contract: the routes the native clients are written from, and
     the version scripts/check-boundaries.mjs holds them to. */
  const api = JSON.parse(readFileSync(root + API, "utf8"));
  /* scheduling.json's own words for a visit that is not booked or not yet given a nurse, filled here so
    the native apps say exactly what their home cards say. */
  const scheduled = (text) =>
    text.replace(
      /\{(noUpcoming|noUpcomingDetail|asapPending)\}/g,
      (_, key) => schedulingLabels[key],
    );

  const line = (id) => {
    const found = sos.emergency.numbers.find((n) => n.id === id);
    if (!found)
      throw new Error(
        `${SOURCE} names the emergency number "${id}", which ${SOS} does not have.`,
      );
    /* The spoken form is a decision on file since 23 September 2026, and a number without one is a
       number a voice will read as a quantity — the exact reading the decision exists to refuse. */
    if (typeof found.spoken !== 'string' || !found.spoken.trim())
      throw new Error(
        `${SOS} carries the emergency number "${id}" with no spoken form. A phone's read-aloud would read ${found.number} as a quantity; sos.json's spokenNumbers decision requires the words a call-taker would say.`,
      );
    return found;
  };
  const values = {
    ambulance: line("ambulance").number,
    mobile: line("mobile").number,
    seconds: String(contract.voice.maxListeningSeconds),
  };
  /* Only the three tokens this generator owns are filled. Anything else in braces is a situation
    token for the runtime, and a stray one nobody fills shows up on the screen rather than vanishing. */
  const say = (text) =>
    text.replace(/\{(ambulance|mobile|seconds)\}/g, (_, key) => values[key]);
  const need = (object, fields, what) => {
    for (const field of fields) {
      if (typeof object?.[field] !== "string" || !object[field])
        throw new Error(
          `${what} has no ${field}. ${SOURCE} is not complete enough to write two native apps from.`,
        );
    }
  };
  need(
    contract.identity,
    [
      "name",
      "descriptor",
      "disclosure",
      "descriptorLine",
      "pulseName",
      "callToAction",
      "poweredBy",
      "whatItIs",
      "whatItIsNot",
      "poweredByMeans",
    ],
    "GilbertOne's identity",
  );
  for (const state of contract.states)
    need(
      state,
      ["id", "name", "visual", "meaning", "cue", "announcement", "shownWhen"],
      `Pulse state "${state.id}"`,
    );
  for (const refusal of contract.refusals)
    need(refusal, ["id", "statement", "why"], `Refusal "${refusal.id}"`);
  const conditionName = (group) => {
    if (group.condition === null) {
      if (!group.name)
        throw new Error(
          `Emergency word group "${group.id}" maps to no sos.json condition and has no name of its own, so the handover would list it as nothing.`,
        );
      return group.name;
    }
    const found = sos.redFlags.conditions.find((c) => c.id === group.condition);
    if (!found)
      throw new Error(
        `Emergency word group "${group.id}" maps to "${group.condition}", which is not a condition in ${SOS}.`,
      );
    return found.name;
  };

  /* The matcher's data and the fixtures are required, not defaulted: a generator that quietly wrote an
    empty filler list would give every native app a matcher that reads nothing as unread. */
  for (const [value, what] of [
    [contract.matcher?.readEverything?.filler, "matcher.readEverything.filler"],
    [
      contract.matcher?.readEverything?.neverWithUnread,
      "matcher.readEverything.neverWithUnread",
    ],
    [contract.matcher?.stemming?.irregular, "matcher.stemming.irregular"],
    [
      contract.matcher?.normalisation?.foldings,
      "matcher.normalisation.foldings",
    ],
    [
      contract.matcher?.normalisation?.invisible,
      "matcher.normalisation.invisible",
    ],
    [
      contract.matcher?.normalisation?.negations,
      "matcher.normalisation.negations",
    ],
    [contract.answers?.unread, "answers.unread"],
    [contract.fixtures?.messages, "fixtures.messages"],
  ]) {
    if (!value)
      throw new Error(
        `${SOURCE} has no ${what}, so the matcher cannot be written out without deciding what reading everything means. It is refused here rather than defaulted.`,
      );
  }
  /* The service answer — the heading, the disclosure and the emergency numbers that surround a
     sentence a language model wrote — is required for the same reason: all three platforms show
     service replies now, and a phone without the disclosure would be the one place a model's
     words could appear without it. */
  need(
    contract.answers?.service,
    ["state", "heading", "disclosure", "ifUrgent", "sosLabel", "handoverLabel"],
    "answers.service, the answer drawn around a model-written reply",
  );
  if (
    !Array.isArray(contract.answers.service.numbers) ||
    !contract.answers.service.numbers.length
  )
    throw new Error(
      `${SOURCE} has no answers.service.numbers, so a service reply could be shown without the emergency numbers beside it. It is refused here rather than defaulted.`,
    );
  /* The clients are written from the contract's own built routes: each address below is emitted
     into both clients as a literal, each shape is emitted field by field, and
     scripts/check-boundaries.mjs holds the literals back to this file. A route that is declared
     and not built is refused here rather than typed into a client: a phone calling a route the
     service answers with its not-yet-available refusal has been promised something this file
     withdraws. */
  const builtRoute = (path, version, what) => {
    const found = api.routes.find(
      (route) =>
        route.path === path &&
        route.version === version &&
        route.status === "built",
    );
    if (!found)
      throw new Error(
        `${API} has no built ${path}@${version} to write ${what} from. The client would be calling a route the service does not answer.`,
      );
    return found;
  };
  const turnRoute = builtRoute("/v1/turn", 2, "the turn call");
  const knowledgeRoute = builtRoute(
    "/v1/knowledge/search",
    2,
    "the knowledge search",
  );
  const statusRoute = builtRoute("/v1/status", 2, "the status call");
  const listenRoute = builtRoute(
    "/v1/listen",
    3,
    "push-to-talk's hearing half",
  );
  const speakRoute = builtRoute("/v1/speak", 4, "push-to-talk's speaking half");
  /* The five gated addresses, looked up the same way and for the same reason: they are built in
     the service, and three of the five are refused by it — both triage steps while no triage
     protocol is ratified, and the handover submission always, because the identity, roster and
     destination contracts a clinician routing needs do not exist. The vital reading is refused in
     any process that has not said out loud it is testing. Only the handover pack is answered,
     and no native screen assembles one yet. None of the five gets a request or a reply shape
     here, because there is nothing for a phone to send and nothing it would be answered with but
     the contract's own sentence; their addresses travel so that neither client is written for a
     smaller service than the one running, and so that the day a gate opens it opens in the
     catalog and in the service — never first in a phone nobody reviewed. */
  const triageStartRoute = builtRoute(
    "/v1/triage/start",
    3,
    "guided assessment's first step",
  );
  const triageAnswerRoute = builtRoute(
    "/v1/triage/answer",
    3,
    "guided assessment's next step",
  );
  const vitalsRoute = builtRoute("/v1/vitals", 3, "the vital reading");
  const handoverPrepareRoute = builtRoute(
    "/v1/handover/prepare",
    3,
    "the handover pack",
  );
  const handoverSubmitRoute = builtRoute(
    "/v1/handover/submit",
    3,
    "the handover submission",
  );
  const expectFields = (fields, expected, what) => {
    const found = Object.fromEntries(
      (fields ?? []).map((f) => [f.field, f.type]),
    );
    for (const [field, type] of Object.entries(expected)) {
      if (found[field] !== type)
        throw new Error(
          `${what} declares "${field}" as ${found[field] ?? "nothing"} where the typed client is written for ${type}. ${API} and the clients would disagree.`,
        );
    }
  };
  expectFields(
    turnRoute.request,
    {
      sessionId: "string",
      parentTurnId: "string",
      text: "string",
      audience: "string",
      userConsent: "boolean",
    },
    "POST /v1/turn@2's request",
  );
  expectFields(
    turnRoute.response,
    {
      turnId: "string",
      sessionId: "string",
      route: "string",
      classification: "string",
      reply: "string",
      style: "string",
      confidence: "number",
      requiresConfirmation: "boolean",
      suggestedActions: "list",
      refusalId: "string",
      source: "string",
      cue: "string",
    },
    "POST /v1/turn@2's response",
  );
  expectFields(
    knowledgeRoute.request,
    { query: "string", language: "string" },
    "POST /v1/knowledge/search@2's request",
  );
  expectFields(
    knowledgeRoute.response,
    { sources: "list", withheld: "integer" },
    "POST /v1/knowledge/search@2's response",
  );
  expectFields(
    knowledgeRoute.response.find((f) => f.field === "sources")?.fields,
    { id: "string", title: "string", source: "string" },
    "POST /v1/knowledge/search@2's sources",
  );
  expectFields(
    statusRoute.response,
    {
      ok: "boolean",
      mode: "string",
      azure: "boolean",
      ollama: "boolean",
      production: "boolean",
      activated: "boolean",
    },
    "GET /v1/status@1's response",
  );
  /* The two reply sources whose words may replace what a phone itself wrote: the service's live
     model tiers, named the way the web bridge names them. The contract's source field says only
     which tier wrote the reply, so the names live here with the same comment the bridge carries:
     a third one has to be added on purpose, never discovered in production. */
  const replySources = ["model", "orchestrator"];
  /* The addresses, in the catalog's own notation, exactly as scripts/check-boundaries.mjs will
     look for them in the two client files. */
  const address = (route) =>
    `${route.method} /assistant${route.path}@${route.version}`;
  /* The audience dimension of the founder's decision of 19 September 2026. The vocabulary is the
     contract's audiences list, and scripts/check-boundaries.mjs holds it to the RoleIds and the
     engine's Audience type. What is refused here rather than defaulted is the scope itself: a question
     with no audiences is a question nobody can ask, and an empty list would be a scope every platform
     silently matches everything through. */
  const audienceIds = (contract.audiences?.list ?? []).map((a) => a.id);
  if (!audienceIds.length)
    throw new Error(
      `${SOURCE} has no audiences list. Since the founder's audience decision there is no GilbertOne without one: every question is offered to named audiences and every shared fixture spoken to one.`,
    );
  const PLATFORMS = ["web", "ios", "android"];
  for (const question of contract.questions) {
    if (
      question.platforms !== undefined &&
      (!Array.isArray(question.platforms) ||
        !question.platforms.length ||
        question.platforms.some((p) => !PLATFORMS.includes(p)))
    )
      throw new Error(
        `GilbertOne's question "${question.id}" carries platforms [${(
          question.platforms ?? []
        ).join(", ")}], which is empty or names a platform that does not exist (${PLATFORMS.join(", ")}). A question is every platform's unless its contract says which ones answer it.`,
      );
    if (
      !Array.isArray(question.audiences) ||
      !question.audiences.length ||
      question.audiences.some((a) => !audienceIds.includes(a))
    )
      throw new Error(
        `GilbertOne's question "${question.id}" is offered to [${(
          question.audiences ?? []
        ).join(
          ", ",
        )}], which is empty or names an audience the audiences list does not carry. A question no audience is offered is a question nobody can ask.`,
      );
  }
  for (const fixture of contract.fixtures.messages) {
    if (fixture.audience != null && !audienceIds.includes(fixture.audience))
      throw new Error(
        `The shared fixture "${fixture.says}" is spoken to "${fixture.audience}", which the audiences list does not carry. All three platforms run the shared fixtures, and an audience one of them has never heard of cannot be scoped.`,
      );
  }
  /* The questions a phone's matcher is given: every question without a platforms field, and every
     question whose field names that phone. A question built on the web alone — the reading,
     preparation and medicines questions of 27 September 2026 — is left out here rather than emitted
     and answered with "I can't assess that", which is what the native reply builder does with an
     answer kind it has never met. contract.platformsWhy is the record. */
  const questionsFor = (platform) =>
    contract.questions.filter(
      (q) => q.platforms === undefined || q.platforms.includes(platform),
    );
  const { identity, answers, voice, conversation, matcher, fixtures } =
    contract;
  /* The descriptor is not written out on its own. A native screen that wants to say "Your Thuso AI
    Doctor" has only descriptorLine to say it with, and descriptorLine carries the disclosure. */
  const dictSwift = (entries) =>
    entries.length
      ? `[${entries.map(([k, v]) => `${swift(k)}: ${swift(v)}`).join(", ")}]`
      : "[:]";
  const pairsKotlin = (entries) =>
    entries.length
      ? `listOf(${entries.map(([k, v]) => `${kotlin(k)} to ${kotlin(v)}`).join(", ")})`
      : "emptyList()";
  const mapKotlin = (entries) =>
    entries.length
      ? `mapOf(${entries.map(([k, v]) => `${kotlin(k)} to ${kotlin(v)}`).join(", ")})`
      : "emptyMap()";
  const handover = answers.handover;
  const lines = (ids) => ids.map(line);
  const kLine = (n) => `GilbertLine(${kotlin(n.number)}, ${kotlin(n.spoken)}, ${kotlin(n.name)})`;

  const swiftFile = `${banner()}

import Foundation

extension Gilbert {
    static let contractVersion = ${contract.version}

    static let name = ${swift(identity.name)}
    static let disclosure = ${swift(identity.disclosure)}
    static let descriptorLine = ${swift(identity.descriptorLine)}
    static let pulseName = ${swift(identity.pulseName)}
    static let callToAction = ${swift(identity.callToAction)}
    static let poweredBy = ${swift(identity.poweredBy)}
    static let whatItIs = ${swift(identity.whatItIs)}
    static let whatItIsNot = ${swift(identity.whatItIsNot)}
    static let poweredByMeans = ${swift(identity.poweredByMeans)}

    static let states: [GilbertState] = [
${contract.states
  .map(
    (s) => `        GilbertState(id: ${swift(s.id)}, name: ${swift(s.name)},
                     visual: ${swift(s.visual)},
                     meaning: ${swift(s.meaning)},
                     cue: ${swift(s.cue)},
                     announcement: ${swift(say(s.announcement))},
                     shownWhen: ${swift(s.shownWhen)},
                     platforms: ${listSwift(s.platforms)})`,
  )
  .join(",\n")}
    ]

    static let situationTemplates: [GilbertSituationTemplate] = [
${contract.situations
  .map(
    (
      s,
    ) => `        GilbertSituationTemplate(id: ${swift(s.id)}, name: ${swift(s.name)},
                                 sentence: ${swift(s.sentence)},
                                 figure: ${optSwift(s.figure)}, figureLabel: ${optSwift(s.figureLabel)}, depth: ${s.depth})`,
  )
  .join(",\n")}
    ]
    static let visitNone = (name: ${swift(scheduled(contract.visitStates.none.name))}, sentence: ${swift(scheduled(contract.visitStates.none.sentence))})
    static let visitPending = (name: ${swift(scheduled(contract.visitStates.pending.name))}, sentence: ${swift(scheduled(contract.visitStates.pending.sentence))})
    static let fallbackLaboratory = ${swift(contract.situationsFallback.laboratory)}

    static let questionGroups: [GilbertQuestionGroup] = [
${contract.questionGroups.map((g) => `        GilbertQuestionGroup(id: ${swift(g.id)}, heading: ${swift(g.heading)}, lead: ${optSwift(g.lead)})`).join(",\n")}
    ]

    static let questions: [GilbertQuestion] = [
${questionsFor("ios")
  .map(
    (
      q,
    ) => `        GilbertQuestion(id: ${swift(q.id)}, asks: ${swift(q.asks)}, group: ${swift(q.group)}, answer: ${swift(q.answer)},
                        triggers: ${listSwift(q.triggers)}, audiences: ${listSwift(q.audiences)})`,
  )
  .join(",\n")}
    ]

    /// Nil until a clinician has read the list below. It is shown as nil rather than hidden.
    static let emergencyWordsReviewedBy: String? = ${optSwift(terms.clinicalReview.reviewedBy)}
    /// The version of packages/catalog/gilbert-emergency-terms.json these terms came from.
    static let emergencyTermsVersion = ${terms.version}

    static let emergencyGroups: [GilbertEmergencyGroup] = [
${terms.groups
  .map(
    (
      g,
    ) => `        GilbertEmergencyGroup(id: ${swift(g.id)}, condition: ${optSwift(g.condition)}, name: ${swift(conditionName(g))},
                              words: ${listSwift(g.words)})`,
  )
  .join(",\n")}
    ]

    /* The matcher's own data: how a message becomes stems, and what reading all of it means. The rules
       themselves are arithmetic in Models/Assistant.swift, identical to the web's and Android's. */
    static let foldings: [(String, String)] = [${Object.entries(
      matcher.normalisation.foldings,
    )
      .map(([k, v]) => `(${swift(k)}, ${swift(v)})`)
      .join(", ")}]
    static let apostrophes: [String] = ${listSwift(matcher.normalisation.apostrophes)}
    static let invisible: [Unicode.Scalar] = ${listSwift(matcher.normalisation.invisible)}
    static let negations: [String: [String]] = [${Object.entries(matcher.normalisation.negations)
      .map(([k, v]) => `${swift(k)}: ${listSwift(v.split(" "))}`)
      .join(", ")}]
    static let irregular: [String: String] = ${dictSwift(Object.entries(matcher.stemming.irregular))}
    static let maxGap = ${matcher.maxGap}
    static let filler: [String] = ${listSwift(matcher.readEverything.filler)}
    static let neverWithUnread: [String] = ${listSwift(matcher.readEverything.neverWithUnread)}

    static let unread = GilbertUnmatched(
        state: ${swift(answers.unread.state)},
        sentence: ${swift(answers.unread.sentence)},
        detail: ${swift(answers.unread.detail)},
        ifUrgent: ${swift(say(answers.unread.ifUrgent))},
        lines: [${lines(answers.unread.numbers)
          .map(
            (n) =>
              `GilbertLine(number: ${swift(n.number)}, spoken: ${swift(n.spoken)}, name: ${swift(n.name)})`,
          )
          .join(", ")}],
        sosLabel: ${swift(answers.unread.sosLabel)},
        handoverLabel: ${swift(answers.unread.handoverLabel)})

    static let unmatched = GilbertUnmatched(
        state: ${swift(answers.unmatched.state)},
        sentence: ${swift(answers.unmatched.sentence)},
        detail: ${swift(answers.unmatched.detail)},
        ifUrgent: ${swift(say(answers.unmatched.ifUrgent))},
        lines: [${lines(answers.unmatched.numbers)
          .map(
            (n) =>
              `GilbertLine(number: ${swift(n.number)}, spoken: ${swift(n.spoken)}, name: ${swift(n.name)})`,
          )
          .join(", ")}],
        sosLabel: ${swift(answers.unmatched.sosLabel)},
        handoverLabel: ${swift(answers.unmatched.handoverLabel)})

    static let emergency = GilbertEmergency(
        state: ${swift(answers.emergency.state)},
        noticed: ${swift(answers.emergency.noticed)},
        headline: ${swift(sos.emergency.headline)},
        lead: ${swift(sos.emergency.lead)},
        lines: [${lines(answers.emergency.numbers)
          .map(
            (n) =>
              `GilbertLine(number: ${swift(n.number)}, spoken: ${swift(n.spoken)}, name: ${swift(n.name)})`,
          )
          .join(", ")}],
        notAnAmbulance: ${swift(sos.emergency.notAnAmbulance)},
        sosLabel: ${swift(answers.emergency.sosLabel)})

    /* The answer drawn around a sentence a language model wrote: the heading, the disclosure and
       the emergency numbers, emitted so a native screen cannot show the words without them. */
    static let service = GilbertService(
        state: ${swift(answers.service.state)},
        heading: ${swift(answers.service.heading)},
        disclosure: ${swift(answers.service.disclosure)},
        ifUrgent: ${swift(say(answers.service.ifUrgent))},
        lines: [${lines(answers.service.numbers)
          .map(
            (n) =>
              `GilbertLine(number: ${swift(n.number)}, spoken: ${swift(n.spoken)}, name: ${swift(n.name)})`,
          )
          .join(", ")}],
        sosLabel: ${swift(answers.service.sosLabel)},
        handoverLabel: ${swift(answers.service.handoverLabel)})

    static let identityState = ${swift(answers.identity.state)}
    static let voiceState = ${swift(answers.voice.state)}

    static let handover = GilbertHandover(
        state: ${swift(handover.state)},
        title: ${swift(handover.title)},
        lead: ${swift(handover.lead)},
        notSent: ${swift(handover.notSent)},
        fields: [${handover.fields.map((f) => `GilbertHandoverField(id: ${swift(f.id)}, label: ${swift(f.label)})`).join(",\n                 ")}],
        channelTyped: ${swift(handover.channelTyped)},
        channelSpoken: ${swift(handover.channelSpoken)},
        channelChosen: ${swift(handover.channelChosen)},
        nothingAsked: ${swift(handover.nothingAsked)},
        nothingMatched: ${swift(handover.nothingMatched)},
        matchedEmergency: ${swift(handover.matchedEmergency)},
        urgency: [${handover.urgency.map((u) => `GilbertUrgency(id: ${swift(u.id)}, name: ${swift(u.name)}, why: ${swift(u.why)})`).join(",\n                  ")}],
        neverLowered: ${swift(handover.neverLowered)},
        notCarriedHeading: ${swift(handover.notCarriedHeading)},
        notCarried: [${handover.notCarried.map((n) => `GilbertNotCarried(id: ${swift(n.id)}, sentence: ${swift(n.sentence)})`).join(",\n                     ")}],
        sendLabel: ${swift(handover.sendLabel)},
        sentTitle: ${swift(handover.sentTitle)},
        sent: ${swift(handover.sent)},
        sentReference: ${swift(handover.sentReference)},
        alreadySent: ${swift(handover.alreadySent)},
        stillUrgent: ${swift(handover.stillUrgent)},
        lines: [${lines(handover.numbers)
          .map(
            (n) =>
              `GilbertLine(number: ${swift(n.number)}, spoken: ${swift(n.spoken)}, name: ${swift(n.name)})`,
          )
          .join(", ")}])

    static let silenceIsNotSafety = ${swift(say(contract.silenceIsNotSafety))}

    static let conversation = GilbertConversation(
        inputLabel: ${swift(conversation.inputLabel)},
        inputHint: ${swift(conversation.inputHint)},
        sendLabel: ${swift(conversation.sendLabel)},
        startAgainLabel: ${swift(conversation.startAgainLabel)},
        youAsked: ${swift(conversation.youAsked)},
        youSaid: ${swift(conversation.youSaid)},
        logLabel: ${swift(conversation.logLabel)},
        refusalsHeading: ${swift(conversation.refusalsHeading)},
        keyboardNote: ${swift(conversation.keyboardNote)},
        turnLimit: ${conversation.turnLimit})

    static let voice = GilbertVoicePolicy(
        mode: ${swift(voice.mode)},
        gesture: ${swift(voice.gesture)},
        maxListeningSeconds: ${voice.maxListeningSeconds},
        recognitionLocales: ${listSwift(voice.languages.flatMap((l) => l.recognitionLocales))},
        recognition: ${swift(voice.recognition)},
        audioStored: ${voice.audioStored},
        transcriptLifetime: ${swift(voice.transcriptLifetime)},
        correctionBeforeSend: ${voice.correctionBeforeSend},
        wakeWord: ${voice.wakeWord},
        howItWorks: ${swift(say(voice.sentences.howItWorks))},
        beforePermission: ${swift(voice.sentences.beforePermission)},
        askPermissionLabel: ${swift(voice.sentences.askPermissionLabel)},
        notNowLabel: ${swift(voice.sentences.notNowLabel)},
        unavailable: ${swift(voice.sentences.unavailable)},
        refused: ${swift(voice.sentences.refused)},
        failed: ${swift(voice.sentences.failed)},
        interrupted: ${swift(voice.sentences.interrupted)},
        talkLabel: ${swift(voice.sentences.talkLabel)},
        stopLabel: ${swift(voice.sentences.stopLabel)},
        captionsLabel: ${swift(voice.sentences.captionsLabel)},
        correctLabel: ${swift(voice.sentences.correctLabel)},
        discardLabel: ${swift(voice.sentences.discardLabel)},
        nativeSpeechEnabled: ${voice.nativeSpeech.enabled},
        speechVoiceOrder: ${listSwift(voice.voicePreference.order)},
        spokenLanguages: [
${(voice.spokenLanguages ?? []).map((language) => `            GilbertSpokenLanguage(id: ${swift(language.id)}, name: ${swift(language.name)}, localeOrder: ${listSwift(language.localeOrder)}, detectWords: ${listSwift(language.detectWords)})`).join(",\n")}
        ],
        muteLabel: ${swift(voice.sentences.muteLabel)},
        unmuteLabel: ${swift(voice.sentences.unmuteLabel)},
        speechUnavailable: ${swift(voice.sentences.speechUnavailable)})

    /* The shared fixtures every platform runs its own matcher against. */
    static let stemFixtures: [GilbertStemFixture] = [
${fixtures.stems.map((f) => `        GilbertStemFixture(says: ${swift(f.says)}, stems: ${listSwift(f.stems)})`).join(",\n")}
    ]
    /// Ordinary sentences the terms raise today: reported by the self-test, never blocking.
    static let falsePositiveFixtures: [String] = ${listSwift(terms.falsePositives.messages.map((m) => m.says))}
    static let messageFixtures: [GilbertMessageFixture] = [
${fixtures.messages.map((f) => `        GilbertMessageFixture(says: ${swift(f.says)}, expect: ${swift(f.expect)}, question: ${optSwift(f.question ?? null)}, groups: ${listSwift(f.groups ?? [])}, audience: ${optSwift(f.audience ?? null)})`).join(",\n")}
    ]

    static let refusals: [GilbertRefusal] = [
${contract.refusals
  .map(
    (r) => `        GilbertRefusal(id: ${swift(r.id)},
                       statement: ${swift(say(r.statement))},
                       why: ${swift(say(r.why))})`,
  )
  .join(",\n")}
    ]
}
`;

  const kotlinFile = `${banner()}

package za.co.mythuso.model

object GilbertData {
    const val contractVersion = ${contract.version}

    const val name = ${kotlin(identity.name)}
    const val disclosure = ${kotlin(identity.disclosure)}
    const val descriptorLine = ${kotlin(identity.descriptorLine)}
    const val pulseName = ${kotlin(identity.pulseName)}
    const val callToAction = ${kotlin(identity.callToAction)}
    const val poweredBy = ${kotlin(identity.poweredBy)}
    const val whatItIs = ${kotlin(identity.whatItIs)}
    const val whatItIsNot = ${kotlin(identity.whatItIsNot)}
    const val poweredByMeans = ${kotlin(identity.poweredByMeans)}

    val states = listOf(
${contract.states
  .map(
    (s) => `        GilbertState(
            id = ${kotlin(s.id)}, name = ${kotlin(s.name)},
            visual = ${kotlin(s.visual)},
            meaning = ${kotlin(s.meaning)},
            cue = ${kotlin(s.cue)},
            announcement = ${kotlin(say(s.announcement))},
            shownWhen = ${kotlin(s.shownWhen)},
            platforms = ${listKotlin(s.platforms)}
        )`,
  )
  .join(",\n")}
    )

    val situationTemplates = listOf(
${contract.situations
  .map(
    (s) => `        GilbertSituationTemplate(
            id = ${kotlin(s.id)}, name = ${kotlin(s.name)},
            sentence = ${kotlin(s.sentence)},
            figure = ${optKotlin(s.figure)}, figureLabel = ${optKotlin(s.figureLabel)}, depth = ${s.depth}
        )`,
  )
  .join(",\n")}
    )
    val visitNone = ${kotlin(scheduled(contract.visitStates.none.name))} to ${kotlin(scheduled(contract.visitStates.none.sentence))}
    val visitPending = ${kotlin(scheduled(contract.visitStates.pending.name))} to ${kotlin(scheduled(contract.visitStates.pending.sentence))}
    const val fallbackLaboratory = ${kotlin(contract.situationsFallback.laboratory)}

    val questionGroups = listOf(
${contract.questionGroups.map((g) => `        GilbertQuestionGroup(${kotlin(g.id)}, ${kotlin(g.heading)}, ${optKotlin(g.lead)})`).join(",\n")}
    )

    val questions = listOf(
${questionsFor("android")
  .map(
    (q) => `        GilbertQuestion(
            id = ${kotlin(q.id)}, asks = ${kotlin(q.asks)}, group = ${kotlin(q.group)}, answer = ${kotlin(q.answer)},
            triggers = ${listKotlin(q.triggers)},
            audiences = ${listKotlin(q.audiences)}
        )`,
  )
  .join(",\n")}
    )

    /** Null until a clinician has read the list below. It is shown as null rather than hidden. */
    val emergencyWordsReviewedBy: String? = ${optKotlin(terms.clinicalReview.reviewedBy)}
    /** The version of packages/catalog/gilbert-emergency-terms.json these terms came from. */
    const val emergencyTermsVersion = ${terms.version}

    val emergencyGroups = listOf(
${terms.groups
  .map(
    (g) => `        GilbertEmergencyGroup(
            id = ${kotlin(g.id)}, condition = ${optKotlin(g.condition)}, name = ${kotlin(conditionName(g))},
            words = ${listKotlin(g.words)}
        )`,
  )
  .join(",\n")}
    )

    /* The matcher's own data; the arithmetic is in model/Assistant.kt, identical to the web's and iOS's. */
    val foldings = ${pairsKotlin(Object.entries(matcher.normalisation.foldings))}
    val apostrophes = ${listKotlin(matcher.normalisation.apostrophes)}
    val invisible = ${listKotlin(matcher.normalisation.invisible)}
    val negations = mapOf(${Object.entries(matcher.normalisation.negations)
      .map(([k, v]) => `${kotlin(k)} to ${listKotlin(v.split(" "))}`)
      .join(", ")})
    val irregular = ${mapKotlin(Object.entries(matcher.stemming.irregular))}
    const val maxGap = ${matcher.maxGap}
    val filler = ${listKotlin(matcher.readEverything.filler)}
    val neverWithUnread = ${listKotlin(matcher.readEverything.neverWithUnread)}

    val unread = GilbertUnmatched(
        state = ${kotlin(answers.unread.state)},
        sentence = ${kotlin(answers.unread.sentence)},
        detail = ${kotlin(answers.unread.detail)},
        ifUrgent = ${kotlin(say(answers.unread.ifUrgent))},
        lines = listOf(${lines(answers.unread.numbers).map(kLine).join(", ")}),
        sosLabel = ${kotlin(answers.unread.sosLabel)},
        handoverLabel = ${kotlin(answers.unread.handoverLabel)}
    )

    val unmatched = GilbertUnmatched(
        state = ${kotlin(answers.unmatched.state)},
        sentence = ${kotlin(answers.unmatched.sentence)},
        detail = ${kotlin(answers.unmatched.detail)},
        ifUrgent = ${kotlin(say(answers.unmatched.ifUrgent))},
        lines = listOf(${lines(answers.unmatched.numbers).map(kLine).join(", ")}),
        sosLabel = ${kotlin(answers.unmatched.sosLabel)},
        handoverLabel = ${kotlin(answers.unmatched.handoverLabel)}
    )

    val emergency = GilbertEmergency(
        state = ${kotlin(answers.emergency.state)},
        noticed = ${kotlin(answers.emergency.noticed)},
        headline = ${kotlin(sos.emergency.headline)},
        lead = ${kotlin(sos.emergency.lead)},
        lines = listOf(${lines(answers.emergency.numbers).map(kLine).join(", ")}),
        notAnAmbulance = ${kotlin(sos.emergency.notAnAmbulance)},
        sosLabel = ${kotlin(answers.emergency.sosLabel)}
    )

    /* The answer drawn around a sentence a language model wrote: the heading, the disclosure and
       the emergency numbers, emitted so a native screen cannot show the words without them. */
    val service = GilbertService(
        state = ${kotlin(answers.service.state)},
        heading = ${kotlin(answers.service.heading)},
        disclosure = ${kotlin(answers.service.disclosure)},
        ifUrgent = ${kotlin(say(answers.service.ifUrgent))},
        lines = listOf(${lines(answers.service.numbers).map(kLine).join(", ")}),
        sosLabel = ${kotlin(answers.service.sosLabel)},
        handoverLabel = ${kotlin(answers.service.handoverLabel)}
    )

    const val identityState = ${kotlin(answers.identity.state)}
    const val voiceState = ${kotlin(answers.voice.state)}

    val handover = GilbertHandover(
        state = ${kotlin(handover.state)},
        title = ${kotlin(handover.title)},
        lead = ${kotlin(handover.lead)},
        notSent = ${kotlin(handover.notSent)},
        fields = listOf(${handover.fields.map((f) => `GilbertHandoverField(${kotlin(f.id)}, ${kotlin(f.label)})`).join(", ")}),
        channelTyped = ${kotlin(handover.channelTyped)},
        channelSpoken = ${kotlin(handover.channelSpoken)},
        channelChosen = ${kotlin(handover.channelChosen)},
        nothingAsked = ${kotlin(handover.nothingAsked)},
        nothingMatched = ${kotlin(handover.nothingMatched)},
        matchedEmergency = ${kotlin(handover.matchedEmergency)},
        urgency = listOf(${handover.urgency.map((u) => `GilbertUrgency(${kotlin(u.id)}, ${kotlin(u.name)}, ${kotlin(u.why)})`).join(", ")}),
        neverLowered = ${kotlin(handover.neverLowered)},
        notCarriedHeading = ${kotlin(handover.notCarriedHeading)},
        notCarried = listOf(${handover.notCarried.map((n) => `GilbertNotCarried(${kotlin(n.id)}, ${kotlin(n.sentence)})`).join(", ")}),
        sendLabel = ${kotlin(handover.sendLabel)},
        sentTitle = ${kotlin(handover.sentTitle)},
        sent = ${kotlin(handover.sent)},
        sentReference = ${kotlin(handover.sentReference)},
        alreadySent = ${kotlin(handover.alreadySent)},
        stillUrgent = ${kotlin(handover.stillUrgent)},
        lines = listOf(${lines(handover.numbers).map(kLine).join(", ")})
    )

    const val silenceIsNotSafety = ${kotlin(say(contract.silenceIsNotSafety))}

    val conversation = GilbertConversation(
        inputLabel = ${kotlin(conversation.inputLabel)},
        inputHint = ${kotlin(conversation.inputHint)},
        sendLabel = ${kotlin(conversation.sendLabel)},
        startAgainLabel = ${kotlin(conversation.startAgainLabel)},
        youAsked = ${kotlin(conversation.youAsked)},
        youSaid = ${kotlin(conversation.youSaid)},
        logLabel = ${kotlin(conversation.logLabel)},
        refusalsHeading = ${kotlin(conversation.refusalsHeading)},
        keyboardNote = ${kotlin(conversation.keyboardNote)},
        turnLimit = ${conversation.turnLimit}
    )

    val voice = GilbertVoicePolicy(
        mode = ${kotlin(voice.mode)},
        gesture = ${kotlin(voice.gesture)},
        maxListeningSeconds = ${voice.maxListeningSeconds},
        recognitionLocales = ${listKotlin(voice.languages.flatMap((l) => l.recognitionLocales))},
        recognition = ${kotlin(voice.recognition)},
        audioStored = ${voice.audioStored},
        transcriptLifetime = ${kotlin(voice.transcriptLifetime)},
        correctionBeforeSend = ${voice.correctionBeforeSend},
        wakeWord = ${voice.wakeWord},
        howItWorks = ${kotlin(say(voice.sentences.howItWorks))},
        beforePermission = ${kotlin(voice.sentences.beforePermission)},
        askPermissionLabel = ${kotlin(voice.sentences.askPermissionLabel)},
        notNowLabel = ${kotlin(voice.sentences.notNowLabel)},
        unavailable = ${kotlin(voice.sentences.unavailable)},
        refused = ${kotlin(voice.sentences.refused)},
        failed = ${kotlin(voice.sentences.failed)},
        interrupted = ${kotlin(voice.sentences.interrupted)},
        talkLabel = ${kotlin(voice.sentences.talkLabel)},
        stopLabel = ${kotlin(voice.sentences.stopLabel)},
        captionsLabel = ${kotlin(voice.sentences.captionsLabel)},
        correctLabel = ${kotlin(voice.sentences.correctLabel)},
        discardLabel = ${kotlin(voice.sentences.discardLabel)},
        nativeSpeechEnabled = ${voice.nativeSpeech.enabled},
        speechVoiceOrder = ${listKotlin(voice.voicePreference.order)},
        spokenLanguages = listOf(
${(voice.spokenLanguages ?? []).map((language) => `            GilbertSpokenLanguage(${kotlin(language.id)}, ${kotlin(language.name)}, ${listKotlin(language.localeOrder)}, ${listKotlin(language.detectWords)})`).join(",\n")}
        ),
        muteLabel = ${kotlin(voice.sentences.muteLabel)},
        unmuteLabel = ${kotlin(voice.sentences.unmuteLabel)},
        speechUnavailable = ${kotlin(voice.sentences.speechUnavailable)}
    )

    /* The shared fixtures every platform runs its own matcher against. */
    val stemFixtures = listOf(
${fixtures.stems.map((f) => `        GilbertStemFixture(${kotlin(f.says)}, ${listKotlin(f.stems)})`).join(",\n")}
    )
    /** Ordinary sentences the terms raise today: reported by the JVM test, never blocking. */
    val falsePositiveFixtures = ${listKotlin(terms.falsePositives.messages.map((m) => m.says))}
    val messageFixtures = listOf(
${fixtures.messages.map((f) => `        GilbertMessageFixture(${kotlin(f.says)}, ${kotlin(f.expect)}, ${optKotlin(f.question ?? null)}, ${listKotlin(f.groups ?? [])}, ${optKotlin(f.audience ?? null)})`).join(",\n")}
    )

    val refusals = listOf(
${contract.refusals
  .map(
    (r) => `        GilbertRefusal(
            ${kotlin(r.id)},
            ${kotlin(say(r.statement))},
            ${kotlin(say(r.why))}
        )`,
  )
  .join(",\n")}
    )
}
`;

  /* The typed clients, written from the routes validated above: the addresses and shapes are
     emitted, never typed, and scripts/check-boundaries.mjs holds each client's address literals
     back to the built routes of packages/catalog/apis/assistant.json. */
  const swiftClient = `${clientBanner()}

import Foundation

/// The contract's constants: its version, the one timeout every call shares, the sources whose
/// reply may replace what the phone itself wrote, and the built routes' own addresses — emitted
/// exactly as packages/catalog/apis/assistant.json declares them, so scripts/check-boundaries.mjs
/// can hold this file to the catalog's versions rather than to a copy of them.
enum AssistantApi {
    /// packages/catalog/apis/assistant.json's version.
    static let contractVersion = ${api.version}
    /// The one timeout every call shares, in seconds: the web bridge's REFINE_TIMEOUT_MS, exactly,
    /// because the three platforms must give the service the same patience or one of them shows an
    /// answer the others have already given up on.
    static let timeoutSeconds: TimeInterval = ${REFINE_TIMEOUT_MS / 1000}
    /// The only source values whose reply may replace the phone's own answer: the service's two
    /// live model tiers. The web bridge refuses every other name for the same reason — a sentence
    /// from a tier this file has never heard of is not a sentence to put on a patient's screen.
    /// A third name has to be added here on purpose, never discovered in production.
    static let replySources: [String] = ${listSwift(replySources)}

    /// Each built route at the catalog's own version, for readers and for
    /// scripts/check-boundaries.mjs. The paths below are the same routes minus method and version.
    static let turnAddress = ${swift(address(turnRoute))}
    static let knowledgeSearchAddress = ${swift(address(knowledgeRoute))}
    static let statusAddress = ${swift(address(statusRoute))}
    /// Push-to-talk's two built addresses travel even though no phone calls them yet: the voice
    /// itself is web-only for now, and scripts/check-boundaries.mjs holds every built /v1 route's
    /// literal to the contract — a client that did not name a route the service answers would be
    /// a client written for a smaller service than the one running.
    static let listenAddress = ${swift(address(listenRoute))}
    static let speakAddress = ${swift(address(speakRoute))}
    /// The five gated addresses, built in the service and refused by all but one of them: both
    /// triage steps answer the engine's triage-not-ratified refusal while no triage protocol is
    /// ratified, the vital reading answers device-data-needs-a-dpia in any process that has not
    /// said it is testing, and the handover submission answers clinician-routing-not-built always.
    /// Their addresses travel and no request or reply shape does — there is nothing for a phone to
    /// send, and nothing it would be answered with but the contract's own sentence, which the
    /// refusal shape below already carries.
    static let triageStartAddress = ${swift(address(triageStartRoute))}
    static let triageAnswerAddress = ${swift(address(triageAnswerRoute))}
    static let vitalsAddress = ${swift(address(vitalsRoute))}
    static let handoverPrepareAddress = ${swift(address(handoverPrepareRoute))}
    static let handoverSubmitAddress = ${swift(address(handoverSubmitRoute))}

    static let turnPath = ${swift("/assistant" + turnRoute.path)}
    static let knowledgeSearchPath = ${swift("/assistant" + knowledgeRoute.path)}
    static let statusPath = ${swift("/assistant" + statusRoute.path)}
    static let listenPath = ${swift("/assistant" + listenRoute.path)}
    static let speakPath = ${swift("/assistant" + speakRoute.path)}
}

/// POST /v1/turn@2's request. Optional fields are omitted from the JSON when nil — the service
/// reads an absent sessionId as "mint one", exactly as the contract says.
struct AssistantTurnRequest: Encodable {
    var sessionId: String?
    var parentTurnId: String?
    var text: String
    var audience: String?
    var userConsent: Bool
}

/// POST /v1/turn@2's response, field for field.
struct AssistantTurnReply: Decodable {
    let turnId: String
    let sessionId: String
    let route: String
    let classification: String
    let reply: String
    let style: String
    let confidence: Double
    let requiresConfirmation: Bool
    let suggestedActions: [String]
    /// Present only when a refusal policy answered instead of the classifier.
    let refusalId: String?
    /// Which tier wrote the reply; nil means the classifier's own, already on the screen.
    let source: String?
    /// With a model-written reply, the face the catalog gives that answer.
    let cue: String?
}

/// POST /v1/knowledge/search@2's request.
struct AssistantKnowledgeRequest: Encodable {
    var query: String
    var language: String
}

/// One source: the entry's own id, its title, and where it was published from.
struct AssistantKnowledgeSource: Decodable {
    let id: String
    let title: String
    let source: String
}

/// POST /v1/knowledge/search@2's response.
struct AssistantKnowledgeReply: Decodable {
    let sources: [AssistantKnowledgeSource]
    /// How many matches were withheld for want of a source, so a thin answer reads as thin.
    let withheld: Int
}

/// GET /v1/status@1's response: booleans and the mode, and no field that could carry a secret.
struct AssistantStatusReply: Decodable {
    let ok: Bool
    let mode: String
    let azure: Bool
    let ollama: Bool
    let production: Bool
    let activated: Bool
}

/// What the service answers a request it refused: the server's own shape for every non-2xx body.
/// The message is optional because a refusal body may carry no sentence — the 404 carries none —
/// and this client does not invent one.
struct AssistantRefusal: Decodable {
    let error: String
    let refusalId: String?
    let message: String?
}

/// One call's outcome, all four told apart: an answer, a refusal the service wrote, a service
/// that could not be reached at all, and one that answered with something that is not the
/// declared shape. Only answered carries a reply; the apps treat the other three the same way —
/// the phone's own answer stands.
enum AssistantCall<Value> {
    case answered(Value)
    case refused(AssistantRefusal)
    case unreachable
    case unusable
}

/// The client itself. Every function takes the base URL as an argument: this file knows the
/// contract's paths, and the build knows where the service lives.
enum AssistantClient {
    /// One turn: what a phone sends after its own classifier found nothing it could place.
    static func turn(_ request: AssistantTurnRequest, base: URL) async -> AssistantCall<AssistantTurnReply> {
        await post(AssistantApi.turnPath, body: encode(request), base: base, as: AssistantTurnReply.self)
    }

    /// The published knowledge a search may stand on; public at the v1 surface.
    static func knowledgeSearch(_ request: AssistantKnowledgeRequest, base: URL) async -> AssistantCall<AssistantKnowledgeReply> {
        await post(AssistantApi.knowledgeSearchPath, body: encode(request), base: base, as: AssistantKnowledgeReply.self)
    }

    /// The service's versioned status: provider presence, production and the activation gate's own
    /// answer, as GET /assistant/v1/status declares them.
    static func status(base: URL) async -> AssistantCall<AssistantStatusReply> {
        await get(AssistantApi.statusPath, base: base, as: AssistantStatusReply.self)
    }

    /// The native refinement, the acceptance the web bridge applies word for word: the phone asks
    /// about a message it could not place, and the service's sentence replaces the local one only
    /// when the service names a model tier as its source and the sentence carries words.
    /// Everything else — refused, unreachable, timed out, unusable, a classifier echo — returns
    /// nil, and the phone keeps its own answer, exactly as the web panel does.
    ///
    /// userConsent is true because the message is the person's own, typed and sent by her:
    /// pressing Send is the confirmation, and nothing is asked about a message that was not sent.
    static func refine(text: String, sessionId: String?, audience: String?, base: URL) async -> String? {
        let request = AssistantTurnRequest(sessionId: sessionId, parentTurnId: nil, text: text, audience: audience, userConsent: true)
        guard case .answered(let reply) = await turn(request, base: base) else { return nil }
        guard let source = reply.source, AssistantApi.replySources.contains(source) else { return nil }
        let words = reply.reply.trimmingCharacters(in: .whitespacesAndNewlines)
        return words.isEmpty ? nil : words
    }

    // MARK: - The one place a request is made

    private static func encode<Body: Encodable>(_ body: Body) -> Data? {
        try? JSONEncoder().encode(body)
    }

    private static func post<Value: Decodable>(_ path: String, body: Data?, base: URL, as type: Value.Type) async -> AssistantCall<Value> {
        guard let body else { return .unusable }
        return await send(request(path, method: "POST", base: base, body: body), as: type)
    }

    private static func get<Value: Decodable>(_ path: String, base: URL, as type: Value.Type) async -> AssistantCall<Value> {
        await send(request(path, method: "GET", base: base, body: nil), as: type)
    }

    private static func request(_ path: String, method: String, base: URL, body: Data?) -> URLRequest {
        var request = URLRequest(url: base.appendingPathComponent(path))
        request.httpMethod = method
        /* The one timeout the three platforms share; a call that has not answered by then is one
           more unreachable, and the local answer stands. */
        request.timeoutInterval = AssistantApi.timeoutSeconds
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "content-type")
        }
        return request
    }

    private static func send<Value: Decodable>(_ request: URLRequest, as type: Value.Type) async -> AssistantCall<Value> {
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else { return .unusable }
            guard (200..<300).contains(http.statusCode) else {
                /* The refusal the service wrote, when the body is that shape; otherwise the status
                   line, which is a fact this client saw rather than a sentence it invented. */
                let refusal = (try? JSONDecoder().decode(AssistantRefusal.self, from: data))
                    ?? AssistantRefusal(error: "http_status_" + String(http.statusCode), refusalId: nil, message: nil)
                return .refused(refusal)
            }
            guard let answer = try? JSONDecoder().decode(Value.self, from: data) else { return .unusable }
            return .answered(answer)
        } catch {
            /* Unreachable, blocked by App Transport Security, timed out, or any other transport
               failure: one fact to every caller — the phone keeps its own answer. */
            return .unreachable
        }
    }
}
`;

  const kotlinClient = `${clientBanner()}

package za.co.mythuso.model

import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

/** The contract's constants: its version, the one timeout every call shares, the sources whose
 *  reply may replace what the phone itself wrote, and the built routes' own addresses — emitted
 *  exactly as packages/catalog/apis/assistant.json declares them, so scripts/check-boundaries.mjs
 *  can hold this file to the catalog's versions rather than to a copy of them. */
object AssistantApi {
    /** packages/catalog/apis/assistant.json's version. */
    const val contractVersion = ${api.version}
    /** The one timeout every call shares, in milliseconds: the web bridge's REFINE_TIMEOUT_MS,
     *  exactly, because the three platforms must give the service the same patience or one of them
     *  shows an answer the others have already given up on. */
    const val timeoutMs = ${REFINE_TIMEOUT_MS}
    /** The only source values whose reply may replace the phone's own answer: the service's two
     *  live model tiers. The web bridge refuses every other name for the same reason — a sentence
     *  from a tier this file has never heard of is not a sentence to put on a patient's screen.
     *  A third name has to be added here on purpose, never discovered in production. */
    val replySources = ${listKotlin(replySources)}

    /** Each built route at the catalog's own version, for readers and for
     *  scripts/check-boundaries.mjs. The paths below are the same routes minus method and version. */
    const val turnAddress = ${kotlin(address(turnRoute))}
    const val knowledgeSearchAddress = ${kotlin(address(knowledgeRoute))}
    const val statusAddress = ${kotlin(address(statusRoute))}
    /** Push-to-talk's two built addresses travel even though no phone calls them yet: the voice
     *  itself is web-only for now, and scripts/check-boundaries.mjs holds every built /v1 route's
     *  literal to the contract — a client that did not name a route the service answers would be
     *  a client written for a smaller service than the one running. */
    const val listenAddress = ${kotlin(address(listenRoute))}
    const val speakAddress = ${kotlin(address(speakRoute))}
    /** The five gated addresses, built in the service and refused by all but one of them: both
     *  triage steps answer the engine's triage-not-ratified refusal while no triage protocol is
     *  ratified, the vital reading answers device-data-needs-a-dpia in any process that has not
     *  said it is testing, and the handover submission answers clinician-routing-not-built always.
     *  Their addresses travel and no request or reply shape does — there is nothing for a phone to
     *  send, and nothing it would be answered with but the contract's own sentence, which the
     *  refusal shape below already carries. */
    const val triageStartAddress = ${kotlin(address(triageStartRoute))}
    const val triageAnswerAddress = ${kotlin(address(triageAnswerRoute))}
    const val vitalsAddress = ${kotlin(address(vitalsRoute))}
    const val handoverPrepareAddress = ${kotlin(address(handoverPrepareRoute))}
    const val handoverSubmitAddress = ${kotlin(address(handoverSubmitRoute))}

    const val turnPath = ${kotlin("/assistant" + turnRoute.path)}
    const val knowledgeSearchPath = ${kotlin("/assistant" + knowledgeRoute.path)}
    const val statusPath = ${kotlin("/assistant" + statusRoute.path)}
    const val listenPath = ${kotlin("/assistant" + listenRoute.path)}
    const val speakPath = ${kotlin("/assistant" + speakRoute.path)}
}

/** POST /v1/turn@2's request. Optional fields are omitted from the JSON when null — the service
 *  reads an absent sessionId as "mint one", exactly as the contract says. */
data class AssistantTurnRequest(
    val sessionId: String?,
    val parentTurnId: String?,
    val text: String,
    val audience: String?,
    val userConsent: Boolean
) {
    fun json(): JSONObject = JSONObject().apply {
        if (sessionId != null) put("sessionId", sessionId)
        if (parentTurnId != null) put("parentTurnId", parentTurnId)
        put("text", text)
        if (audience != null) put("audience", audience)
        put("userConsent", userConsent)
    }
}

/** POST /v1/knowledge/search@2's request. */
data class AssistantKnowledgeRequest(val query: String, val language: String) {
    fun json(): JSONObject = JSONObject().apply {
        put("query", query)
        put("language", language)
    }
}

/** POST /v1/turn@2's response, field for field. */
data class AssistantTurnReply(
    val turnId: String,
    val sessionId: String,
    val route: String,
    val classification: String,
    val reply: String,
    val style: String,
    val confidence: Double,
    val requiresConfirmation: Boolean,
    val suggestedActions: List<String>,
    /** Present only when a refusal policy answered instead of the classifier. */
    val refusalId: String?,
    /** Which tier wrote the reply; null means the classifier's own, already on the screen. */
    val source: String?,
    /** With a model-written reply, the face the catalog gives that answer. */
    val cue: String?
) {
    companion object {
        fun of(json: JSONObject) = AssistantTurnReply(
            turnId = json.getString("turnId"),
            sessionId = json.getString("sessionId"),
            route = json.getString("route"),
            classification = json.getString("classification"),
            reply = json.getString("reply"),
            style = json.getString("style"),
            confidence = json.getDouble("confidence"),
            requiresConfirmation = json.getBoolean("requiresConfirmation"),
            suggestedActions = json.strings("suggestedActions"),
            refusalId = json.optionalString("refusalId"),
            source = json.optionalString("source"),
            cue = json.optionalString("cue")
        )
    }
}

/** One source: the entry's own id, its title, and where it was published from. */
data class AssistantKnowledgeSource(val id: String, val title: String, val source: String) {
    companion object {
        fun of(json: JSONObject) = AssistantKnowledgeSource(
            id = json.getString("id"),
            title = json.getString("title"),
            source = json.getString("source")
        )
    }
}

/** POST /v1/knowledge/search@2's response: the entries an answer may stand on, and how many matches
 *  were withheld for want of a source, so a thin answer reads as thin. */
data class AssistantKnowledgeReply(
    val sources: List<AssistantKnowledgeSource>,
    val withheld: Int
) {
    companion object {
        fun of(json: JSONObject) = AssistantKnowledgeReply(
            sources = json.getJSONArray("sources").let { array ->
                (0 until array.length()).map { AssistantKnowledgeSource.of(array.getJSONObject(it)) }
            },
            withheld = json.getInt("withheld")
        )
    }
}

/** GET /v1/status@1's response: booleans and the mode, and no field that could carry a secret. */
data class AssistantStatusReply(
    val ok: Boolean,
    val mode: String,
    val azure: Boolean,
    val ollama: Boolean,
    val production: Boolean,
    val activated: Boolean
) {
    companion object {
        fun of(json: JSONObject) = AssistantStatusReply(
            ok = json.getBoolean("ok"),
            mode = json.getString("mode"),
            azure = json.getBoolean("azure"),
            ollama = json.getBoolean("ollama"),
            production = json.getBoolean("production"),
            activated = json.getBoolean("activated")
        )
    }
}

/** What the service answers a request it refused: the server's own shape for every non-2xx body.
 *  The message is null when the body carries no sentence — the 404 carries none — and this client
 *  does not invent one. */
data class AssistantRefusal(val error: String, val refusalId: String?, val message: String?) {
    companion object {
        fun of(json: JSONObject) = AssistantRefusal(
            error = json.optString("error", ""),
            refusalId = json.optionalString("refusalId"),
            message = json.optionalString("message")
        )
    }
}

/** One call's outcome, all four told apart: an answer, a refusal the service wrote, a service that
 *  could not be reached at all, and one that answered with something that is not the declared
 *  shape. Only answered carries a reply; the apps treat the other three the same way — the phone's
 *  own answer stands. */
sealed interface AssistantCall<out Value> {
    data class Answered<out Value>(val value: Value) : AssistantCall<Value>
    data class Refused(val refusal: AssistantRefusal) : AssistantCall<Nothing>
    data object Unreachable : AssistantCall<Nothing>
    data object Unusable : AssistantCall<Nothing>

    /** The value when this call was answered, and null otherwise — the way a caller asks. */
    fun valueOrNull(): Value? = (this as? Answered<Value>)?.value
}

/** The helpers the typed shapes parse through: an optional string, and a list of strings.
 *  File-private: they exist for the shapes above, not as a general-purpose JSON library. */
private fun JSONObject.optionalString(name: String): String? =
    if (!has(name) || isNull(name)) null else getString(name)

private fun JSONObject.strings(name: String): List<String> {
    val array = optJSONArray(name) ?: return emptyList()
    return (0 until array.length()).map { array.getString(it) }
}

/** The refusal in a non-2xx body, or the status line itself when the body is not the refusal shape:
 *  the client reports what it saw rather than inventing a sentence. */
private fun refusalIn(body: String?, status: Int): AssistantRefusal {
    val json = try {
        if (body.isNullOrBlank()) null else JSONObject(body)
    } catch (failure: Exception) {
        null
    }
    if (json != null) {
        try {
            return AssistantRefusal.of(json)
        } catch (failure: Exception) {
            /* Not the refusal shape; the status line below is the fact that remains. */
        }
    }
    return AssistantRefusal("http_status_" + status, null, null)
}

/** The client itself. Every function takes the base URL as an argument: this file knows the
 *  contract's paths, and the build knows where the service lives. */
object AssistantClient {
    /** One turn: what a phone sends after its own classifier found nothing it could place. */
    suspend fun turn(request: AssistantTurnRequest, base: String): AssistantCall<AssistantTurnReply> =
        post(AssistantApi.turnPath, request.json(), base) { AssistantTurnReply.of(it) }

    /** The published knowledge a search may stand on; public at the v1 surface. */
    suspend fun knowledgeSearch(request: AssistantKnowledgeRequest, base: String): AssistantCall<AssistantKnowledgeReply> =
        post(AssistantApi.knowledgeSearchPath, request.json(), base) { AssistantKnowledgeReply.of(it) }

    /** The service's versioned status: provider presence, production and the activation gate's own
     *  answer, as GET /assistant/v1/status declares them. */
    suspend fun status(base: String): AssistantCall<AssistantStatusReply> =
        exchange(AssistantApi.statusPath, "GET", null, base) { AssistantStatusReply.of(it) }

    /** The native refinement, the acceptance the web bridge applies word for word: the phone asks
     *  about a message it could not place, and the service's sentence replaces the local one only
     *  when the service names a model tier as its source and the sentence carries words.
     *  Everything else — refused, unreachable, timed out, unusable, a classifier echo — returns
     *  null, and the phone keeps its own answer, exactly as the web panel does.
     *
     *  userConsent is true because the message is the person's own, typed and sent by her: pressing
     *  Send is the confirmation, and nothing is asked about a message that was not sent. */
    suspend fun refine(text: String, sessionId: String?, audience: String?, base: String): String? {
        val request = AssistantTurnRequest(
            sessionId = sessionId,
            parentTurnId = null,
            text = text,
            audience = audience,
            userConsent = true
        )
        val reply = turn(request, base).valueOrNull() ?: return null
        val source = reply.source ?: return null
        if (source !in AssistantApi.replySources) return null
        val words = reply.reply.trim()
        return words.ifEmpty { null }
    }

    /* One request, one place: the method, the timeouts and the two streams are read here and
       nowhere else, so the three call shapes above cannot drift apart in how they ask. */
    private suspend fun <Value> post(
        path: String,
        body: JSONObject,
        base: String,
        parse: (JSONObject) -> Value
    ): AssistantCall<Value> = exchange(path, "POST", body, base, parse)

    private suspend fun <Value> exchange(
        path: String,
        method: String,
        body: JSONObject?,
        base: String,
        parse: (JSONObject) -> Value
    ): AssistantCall<Value> = withContext(Dispatchers.IO) {
        var connection: HttpURLConnection? = null
        try {
            val opened = URL(base + path).openConnection() as HttpURLConnection
            connection = opened
            opened.requestMethod = method
            /* The one timeout the three platforms share; a call that has not answered by then is
               one more unreachable, and the local answer stands. */
            opened.connectTimeout = AssistantApi.timeoutMs
            opened.readTimeout = AssistantApi.timeoutMs
            opened.setRequestProperty("accept", "application/json")
            if (body != null) {
                opened.doOutput = true
                opened.setRequestProperty("content-type", "application/json")
                opened.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val status = opened.responseCode
            val text = (if (status in 200..299) opened.inputStream else opened.errorStream)
                ?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }
            if (status !in 200..299) {
                return@withContext AssistantCall.Refused(refusalIn(text, status))
            }
            val json = try {
                JSONObject(text ?: "")
            } catch (failure: Exception) {
                return@withContext AssistantCall.Unusable
            }
            try {
                return@withContext AssistantCall.Answered(parse(json))
            } catch (failure: Exception) {
                return@withContext AssistantCall.Unusable
            }
        } catch (failure: Exception) {
            /* Unreachable, blocked, timed out, or any other transport failure: one fact to every
               caller — the phone keeps its own answer. */
            AssistantCall.Unreachable
        } finally {
            connection?.disconnect()
        }
    }
}
`;

  return [
    { path: "apps/ios/MyThuso/Models/AssistantData.swift", content: swiftFile },
    {
      path: "apps/ios/MyThuso/Models/AssistantClient.swift",
      content: swiftClient,
    },
    {
      path: "apps/android/app/src/main/java/za/co/mythuso/model/AssistantData.kt",
      content: kotlinFile,
    },
    {
      path: "apps/android/app/src/main/java/za/co/mythuso/model/AssistantClient.kt",
      content: kotlinClient,
    },
  ];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const file of emitAssistant()) {
    writeFileSync(file.path, file.content);
    console.log(`wrote ${file.path}`);
  }
}
