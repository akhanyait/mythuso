import references from "../../../../packages/catalog/gilbertone-references.json" with { type: "json" };

/* Approved public references GilbertOne may name under a signed-in reply.
   Loaded from the catalog only. No network call. A candidate, or a source
   whose audience is not public, is never returned for a patient caption.

   THE THIRD AXIS, 6 October 2026. Until today this module asked two questions
   of an entry — is it approved, is it public — and quoted whatever answered yes
   to both. That was not enough, and the cost was concrete: `cochrane`,
   `cochrane-evidence`, `who-fact-sheets` and `nhs-conditions` were being named
   to patients as the source of an answer while
   packages/catalog/knowledge/federation.json's assessedNotAdmitted bars all
   three hosts as quotable (Wiley reserves reuse and AI-training rights on
   cochrane.org; WHO material is non-commercial and MyThuso is a commercial
   service; nhs.uk is licensed only to people in England). Two entries were also
   approved on a page title alone, by their own notes' admission. `use` is the
   axis that separates "may be shown to a patient" from "may an answer stand on
   it", and it is read here rather than restated: its two modes and the refusal
   sentences behind them live in the contract's `use` block.

   WHAT IS REFUSED, AND WHY. A link-only entry is offered as further reading and
   never named as the source of an answer — gilbertone-connectors.json:85 has
   always held that rule for Wikipedia ("an answer may point to it as further
   reading and never as its source"), and it is the right shape for any source
   whose licence or whose unreadness bars quotation. Being pointed at is still
   worth something to the person asking, so link-only entries are returned and
   labelled rather than dropped; what they may not do is stand under a caption
   that says a source said this.

   FAIL CLOSED. Only the exact string "quotable" opens quotation. An entry with
   no `use` field, or one carrying a value the contract's `use.modes` does not
   list, is link-only: a new entry nobody thought about cannot arrive quotable,
   and a typo cannot quietly promote one. The build holds this too —
   scripts/check-boundaries.mjs fails an entry whose `use` or `useRefusal` is
   outside the contract's own vocabulary. */

export type ReferenceUse = "quotable" | "link-only";

export type CitedReference = {
  readonly id: string;
  readonly name: string;
  readonly publisher: string;
  readonly url: string;
  /* The axis a caption must not flatten away: whether an answer may stand on
     this entry, or only point a person at it. */
  readonly use: ReferenceUse;
  /* The refusal id that keeps a link-only entry link-only, for a surface that
     has to say why rather than merely doing it. Empty when the entry is
     quotable. */
  readonly useRefusal: string;
  /* The jurisdiction id, as the contract's jurisdictions.order lists it — the
     sort key, kept so a caller can group rather than re-derive. */
  readonly jurisdiction: string;
};

type RawSource = (typeof references.sources)[number];

/* Approved for a patient at all. Unchanged in meaning by the third axis: a
   candidate or a clinician entry stays a shelf and is never returned, however
   its `use` reads. */
const citable = (source: RawSource) =>
  source.status === "approved" && source.audience === "public";

/* Fail closed: exactly "quotable", and only for an entry the contract's own
   modes list. Anything else — absent, misspelt, a mode added to the contract
   without this module learning about it — is link-only. */
const useOf = (source: RawSource): ReferenceUse =>
  (source as { use?: string }).use === "quotable" &&
  "quotable" in references.use.modes
    ? "quotable"
    : "link-only";

/* SA-first, as one ranked order rather than a comparison written twice. The
   ranking is the contract's jurisdictions.order and nothing else: South Africa
   first because that is whose guidance applies to the person reading, then
   international evidence, then another country's national guidance. An id the
   contract does not rank sorts last rather than first — a jurisdiction nobody
   placed is not a jurisdiction this module gets to promote. */
const jurisdictionRank = new Map<string, number>(
  references.jurisdictions.order.map((entry, index) => [entry.id, index]),
);
/* A jurisdiction the contract does not rank sorts last rather than first: a
   jurisdiction nobody placed is not one this module gets to promote. Written
   once here and used once below, so there is one copy of the rule. */
const UNRANKED = references.jurisdictions.order.length;
const rankOf = (jurisdiction: string): number =>
  jurisdictionRank.get(jurisdiction) ?? UNRANKED;

const asReference = (source: RawSource): CitedReference => ({
  id: source.id,
  name: source.name,
  publisher: source.publisher,
  url: source.url,
  use: useOf(source),
  useRefusal: useOf(source) === "quotable" ? "" : source.useRefusal ?? "",
  jurisdiction: (source as { jurisdiction?: string }).jurisdiction ?? "",
});

/* Shelf only. Never passed to the patient caption. */
export const referenceCandidates: readonly CitedReference[] = references.sources
  .filter((source) => !citable(source))
  .map(asReference);

const wordsOf = (text: string): ReadonlySet<string> =>
  new Set(text.toLowerCase().match(/[a-z0-9]+/g) ?? []);

/* A topic matches when each of its words is in the message. Tiny words that
   are not part of a topic are never searched for. Short topic words such as
   hiv or tb match only as a whole word. */
const topicMatches = (topic: string, said: ReadonlySet<string>): boolean => {
  const parts = topic.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return parts.length > 0 && parts.every((part) => said.has(part));
};

/* Stable by construction: Array.prototype.sort is specified stable, so two
   entries of equal rank keep the contract's order, and the contract's order is
   still a decision somebody made rather than an accident of a filesystem walk. */
const saFirst = (entries: readonly CitedReference[]): CitedReference[] =>
  [...entries].sort(
    (a, b) => rankOf(a.jurisdiction) - rankOf(b.jurisdiction),
  );

export const referencesUsedFor = (message: string): readonly CitedReference[] => {
  const said = wordsOf(message);
  if (!said.size) return [];
  const used: CitedReference[] = [];
  for (const source of references.sources) {
    if (!citable(source)) continue;
    if (!source.topics.some((topic) => topicMatches(topic, said))) continue;
    used.push(asReference(source));
  }
  /* Quotable first, then further reading, each SA-first. Grouping before
     ranking is deliberate: a caption that interleaved the two would let a
     link-only entry read as the source of the answer above it, which is the one
     thing this module now exists to stop. */
  return [
    ...saFirst(used.filter((entry) => entry.use === "quotable")),
    ...saFirst(used.filter((entry) => entry.use === "link-only")),
  ];
};

/* The two halves of one caption, separated so a surface renders them under
   different words and cannot present further reading as a source. Both are
   SA-first. */
export type ReferenceCaption = {
  readonly sources: readonly CitedReference[];
  readonly furtherReading: readonly CitedReference[];
};

export const referenceCaptionFor = (message: string): ReferenceCaption => {
  const used = referencesUsedFor(message);
  return {
    sources: used.filter((entry) => entry.use === "quotable"),
    furtherReading: used.filter((entry) => entry.use === "link-only"),
  };
};

/* The contract's own words, read rather than retyped: what each half of the
   caption is called, and the sentence that explains a further-reading entry to
   a person who wonders why it is not being quoted. */
export const referenceWords = {
  sourcesLabel: references.caption.sourcesLabel,
  furtherReadingLabel: references.caption.furtherReadingLabel,
  furtherReadingDetail: references.caption.furtherReadingDetail,
} as const;

export const useRefusalSentence = (id: string): string =>
  references.use.refusals.find((refusal) => refusal.id === id)?.statement ?? "";
