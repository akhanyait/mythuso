import { retrieveKnowledge, tokenize, type KnowledgeResult } from "./knowledge.ts";
import { isExpired, type SourceCitation } from "./knowledge-provenance.ts";
import {
  abstentionSentence,
  federationState,
  type AdapterOutcome,
  type FederatedResult,
} from "./sources/config.ts";
import { searchIcd11 } from "./sources/icd11-adapter.ts";
import { searchOpenFda } from "./sources/openfda-adapter.ts";
import { searchPubMed } from "./sources/pubmed-adapter.ts";

/* The governed knowledge federation, added on 22 September 2026.

   WHAT THIS MODULE IS. One layer above knowledge.ts: it asks the local knowledge base its question,
   asks the allowlisted external sources theirs (each of which refuses to operate while its
   federation.json row says "active": false — which is every source today), merges whatever comes
   back under one provenance discipline, and answers — when it cannot answer — with an explicit
   abstention instead of a guess. It is the only module in this service allowed to import the
   adapters in ./sources (a boundary check enforces exactly that), it is not imported by any route
   yet, and in production today it can only ever return local results plus a record that every
   external source was dark. That is the designed behaviour, not a stub.

   THE RULES, IN ORDER.

   FIRST: scope. A question asking for one of federation.json's excluded things — a diagnosis, a
   prescribing or dose change, an individual clinical decision, an interpretation that needs a
   licence — is answered with the outside-approved-scope abstention before any search runs. The
   check is a small deny-list of phrasings, deliberately narrow: it exists to make the exclusion
   real, not to reclassify questions a local record can serve.

   SECOND: local. retrieveKnowledge() answers first — every result already carries its entry's
   codes and its structured citation, because knowledge.ts attaches both at load time.

   THIRD: external, when (and only when) a source is active. All allowlisted sources are asked
   concurrently; an adapter that is dark, rate-limited, unreachable or credential-less reports that
   as its outcome, and the answer's notes say so per source rather than quietly dropping it.

   FOURTH: merge. External results keep their order behind the local ones (approved catalogue first,
   the wider index second) and are deduplicated against local results and against each other when
   they describe the same thing — the same normalised title, or the same verified snomed/icd11 code
   WITH a title that shares its subject (loinc is exempt from both rules, because an observation
   code like an INR is legitimately shared by different entries). A shared code with a wholly
   different subject is not folded away as a duplicate: it survives to the conflict rule below.
   Every result in the answer — local or external — carries the citation a surface renders.

   FIFTH: abstention. No results at all: no-evidence. Every result expired past its recorded review
   date: expired-evidence. Two kept results whose snomed/icd11 codes agree but whose titles share no
   token at all — two records claiming one code for different things: conflicting-evidence. Each
   sentence is quoted from federation.json so the surface, the tests and the contract cannot drift.

   WHAT THIS MODULE DELIBERATELY DOES NOT DO. It does not rank external results above local ones, it
   does not summarise a source's text, it does not answer from a search hit alone, and it never
   presents an external result as South African guidance — the citation says who said it, where it
   lives and under which licence, and the reading of it stays with a nurse, doctor or pharmacist. */

export type AbstentionKind =
  | "no-evidence"
  | "expired-evidence"
  | "conflicting-evidence"
  | "outside-approved-scope";

export type FederationSourceNote = {
  sourceId: string;
  status: AdapterOutcome["status"];
  detail?: string;
};

export type FederationResultsAnswer = {
  kind: "results";
  query: string;
  /* Local results first, then external — each already shaped as the knowledge tier's own result,
     with codes and a citation. */
  results: KnowledgeResult[];
  /* Every distinct citation the results stand on, in first-seen order — what a citation panel
     renders without walking the results itself. */
  citations: SourceCitation[];
  /* One entry per allowlisted source, saying what it did: ok, dark, rate-limited, unavailable. */
  notes: FederationSourceNote[];
  /* External results dropped because a local result already represents them. */
  deduped: number;
  /* Results (local or external) dropped because their record is past its review date. */
  droppedExpired: number;
};

export type FederationAbstentionAnswer = {
  kind: "abstention";
  query: string;
  abstention: AbstentionKind;
  sentence: string;
  notes: FederationSourceNote[];
};

export type FederationAnswer = FederationResultsAnswer | FederationAbstentionAnswer;

export type FederationAdapter = {
  id: string;
  search: (query: string) => Promise<AdapterOutcome>;
};

export type FederationDeps = {
  /* The same seam knowledge.ts keeps for Qdrant: production passes nothing and gets the real
     search; tests inject a deterministic one. */
  localSearch?: (query: string, topK: number) => Promise<KnowledgeResult[]>;
  adapters?: FederationAdapter[];
  now?: () => Date;
};

/* The allowlisted sources, in the order their results would appear. Registered from the adapters
   above — each reads its own federation.json row and refuses while dark, so adding an adapter here
   can never imply an active source. */
const defaultAdapters = (): FederationAdapter[] => [
  { id: "icd11-who", search: (query) => searchIcd11(query) },
  { id: "openfda", search: (query) => searchOpenFda(query) },
  { id: "pubmed-europepmc", search: (query) => searchPubMed(query) },
];

/* The excluded things of federation.json's scope, in the phrasings a person actually uses. Narrow
   on purpose: each pattern is a request FOR one of the four excluded services, never a topic that
   merely mentions one — "what is diabetes" is in scope, "do I have diabetes" is not. */
const OUT_OF_SCOPE: RegExp[] = [
  /\b(?:diagnose (?:me|this|my)|what(?:'s| is) wrong with me|do i have (?:it|covid|the flu|flu|diabetes|cancer|tb|hiv|malaria|depression|high blood pressure))\b/,
  /\bam i having\b/,
  /\bprescribe (?:me|something|antibiotics?|medication)\b/,
  /\b(?:change|increase|decrease|double|halve|stop|skip|adjust) (?:my|the) (?:dose|dosage|medication|meds|tablets|pills|insulin)\b/,
  /\bshould i (?:stop|skip|double|increase|decrease|change|adjust)\b/,
  /\b(?:read|interpret) my (?:scan|scans|x-?ray|x-?rays|mri|ct|blood (?:tests?|results?|work)|results?|report)\b/,
];

/* Which excluded domain a question is asking for, or null when it is in scope. Exported so a test
   (and a future surface) can ask the question without running a search. */
export function outsideApprovedScope(query: string): boolean {
  const text = (query ?? "").toLowerCase();
  return OUT_OF_SCOPE.some((pattern) => pattern.test(text));
}

const titleKey = (title: string): string => tokenize(title).sort().join(" ");

const codeKeys = (result: KnowledgeResult): string[] =>
  [result.codes.snomed, result.codes.icd11]
    .filter((code): code is string => typeof code === "string" && Boolean(code))
    .map((code) => code.toUpperCase());

const sharedCodes = (one: KnowledgeResult, other: KnowledgeResult): string[] =>
  codeKeys(one).filter((code) => codeKeys(other).includes(code));

const sharesTitleToken = (one: KnowledgeResult, other: KnowledgeResult): boolean => {
  const tokens = new Set(tokenize(one.title));
  return tokenize(other.title).some((token) => tokens.has(token));
};

/* Two kept results disagree when they claim the same snomed/icd11 code for subjects with no title
   token in common. loinc never enters: an observation code is legitimately shared. */
const conflictsWith = (one: KnowledgeResult, other: KnowledgeResult): boolean =>
  sharedCodes(one, other).length > 0 && !sharesTitleToken(one, other);

/* Two results describe the same thing when their normalised titles match, or when they claim the
   same snomed/icd11 code AND their titles share a subject token — the same record, described two
   ways. The complement of conflictsWith: for any shared-code pair, exactly one of the two holds, so
   a cross-source code collision is either folded away as a duplicate or raised as a conflict, never
   silently dropped. */
const describesSameThing = (one: KnowledgeResult, other: KnowledgeResult): boolean =>
  titleKey(one.title) === titleKey(other.title) ||
  (sharedCodes(one, other).length > 0 && sharesTitleToken(one, other));

const noteOf = (outcome: AdapterOutcome): FederationSourceNote => {
  if (outcome.status === "ok") return { sourceId: outcome.sourceId, status: "ok" };
  if (outcome.status === "rate-limited")
    return {
      sourceId: outcome.sourceId,
      status: "rate-limited",
      detail: `${outcome.detail} (about ${Math.ceil(outcome.retryAfterMs / 1000)}s)`,
    };
  return { sourceId: outcome.sourceId, status: outcome.status, detail: outcome.detail };
};

/* An external hit, wearing the same result shape as a local one: the authority string the locked
   route contract reads, the citation the surface renders, and a file name that says out loud where
   it came from. */
const asKnowledgeResult = (result: FederatedResult): KnowledgeResult => ({
  id: result.id,
  title: result.title,
  snippet: result.snippet,
  source: result.citation.authority,
  score: result.score,
  file: "federation",
  codes: result.codes,
  citation: result.citation,
});

export async function federatedSearch(
  query: string,
  options: { topK?: number } & FederationDeps = {},
): Promise<FederationAnswer> {
  const trimmed = (query ?? "").trim();
  const notes: FederationSourceNote[] = [];
  const abstain = (kind: AbstentionKind): FederationAbstentionAnswer => ({
    kind: "abstention",
    query: trimmed,
    abstention: kind,
    sentence: abstentionSentence(kind),
    notes,
  });

  if (!trimmed) return abstain("no-evidence");
  /* Excluded scope is decided before any search: an out-of-scope question must cost no lookup, local
     or external. */
  if (outsideApprovedScope(trimmed)) return abstain("outside-approved-scope");

  const now = options.now?.() ?? new Date();
  const localSearch = options.localSearch ?? ((q: string, topK: number) => retrieveKnowledge(q, topK));
  let local: KnowledgeResult[] = [];
  try {
    local = await localSearch(trimmed, options.topK ?? 4);
  } catch {
    /* An injected search that raised is this layer's to absorb: the answer continues with what the
       external sources can say, and the notes still tell the truth about them. */
    local = [];
  }

  const adapters = options.adapters ?? defaultAdapters();
  const outcomes = await Promise.all(
    adapters.map(async (adapter): Promise<AdapterOutcome> => {
      try {
        return await adapter.search(trimmed);
      } catch {
        /* Adapters do not throw; a wrapped one that does is reported as unavailable, never as a
           reason the whole answer fails. */
        return {
          status: "unavailable",
          sourceId: adapter.id,
          detail: "the adapter raised instead of answering; treated as unavailable",
        };
      }
    }),
  );
  for (const outcome of outcomes) notes.push(noteOf(outcome));

  const external = outcomes
    .flatMap((outcome) => (outcome.status === "ok" ? outcome.results : []))
    .sort((a, b) => b.score - a.score)
    .map(asKnowledgeResult);

  /* Expiry first, and honestly counted: a record past its review date is not presented as current,
     and if that removes everything, the answer abstains rather than shrinking to silence. */
  const all = [...local, ...external];
  const freshLocal = local.filter((result) => !isExpired(result.citation, now));
  const freshExternal = external.filter((result) => !isExpired(result.citation, now));
  const droppedExpired = all.length - freshLocal.length - freshExternal.length;
  if (!all.length) return abstain("no-evidence");
  if (!freshLocal.length && !freshExternal.length) return abstain("expired-evidence");

  /* Merge: local first, then the externals that add something — never a duplicated view of a record
     already present. Describes-same-thing (title agreement, or subject-bearing code agreement) is a
     duplicate; a shared code with a disjoint subject is left standing for the conflict rule below. */
  const kept: KnowledgeResult[] = [...freshLocal];
  let deduped = 0;
  for (const result of freshExternal) {
    if (kept.some((existing) => describesSameThing(existing, result))) {
      deduped += 1;
      continue;
    }
    kept.push(result);
  }

  /* Two records, one code, no shared title token: the records disagree about what the code names.
     Where evidence conflicts, this layer does not pick a side. */
  for (let i = 0; i < kept.length; i += 1)
    for (let j = i + 1; j < kept.length; j += 1)
      if (conflictsWith(kept[i], kept[j])) return abstain("conflicting-evidence");

  const citations: SourceCitation[] = [];
  const seenCitations = new Set<string>();
  for (const result of kept) {
    const key = [result.citation.authority, result.citation.sourceId ?? "", result.citation.url ?? "", result.citation.retrievedDate ?? ""].join("|");
    if (seenCitations.has(key)) continue;
    seenCitations.add(key);
    citations.push(result.citation);
  }

  return {
    kind: "results",
    query: trimmed,
    results: kept,
    citations,
    notes,
    deduped,
    droppedExpired,
  };
}

/* The federation's posture, for a surface or a check: darkByDefault and each source's active flag —
   read from federation.json through ./sources/config, so the answer cannot drift from the file the
   adapters obey. */
export const federationStatus = federationState;
