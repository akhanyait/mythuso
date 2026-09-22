/* Provenance, terminology codes and citations for the knowledge tier, added on 22 September 2026
   with the governed federation work.

   WHAT THIS MODULE IS. One place that understands the shape of a catalogue entry's attribution.
   Since the migration of 22 September 2026 every entry under packages/catalog/knowledge carries a
   source object (authority, jurisdiction, retrievedDate, evidenceGrade, expiresOrReviewBy) and the
   eight clinical files carry a codes object (snomed, icd11, loinc — {} where no code has been
   verified against the issuing authority's own browser). This module parses both, tolerantly —
   a plain source string is still readable, because the Qdrant payload path and test fixtures may
   hand one in — and builds the structured citation a surface renders.

   WHAT THE DATES MEAN. retrievedDate is the date the catalogue's content was compiled and read
   from its authorities (21 September 2026, the day the tier was added); expiresOrReviewBy is the
   twelve-month review horizon the federation contract records (reviewHorizonMonths in
   packages/catalog/knowledge/federation.json). Neither date claims a source document was
   published on that day — publishedDate stays absent unless a real publication date is known.

   The strict shape is enforced where it can be: scripts/knowledge-codes.mjs validates every entry
   on every build. These functions are the runtime readers, so they degrade rather than throw. */

/* The verified terminology codes of one entry. An absent key means no code was verified — never
   that a code exists and was withheld — so callers must treat {} as silence. */
export type KnowledgeCode = {
  snomed?: string;
  icd11?: string;
  loinc?: string;
};

/* The source object every catalogue entry carries, as frozen by the migration and validated by
   scripts/check-boundaries.mjs. */
export type KnowledgeSource = {
  authority: string;
  jurisdiction: string;
  publishedDate?: string;
  retrievedDate: string;
  evidenceGrade?: string;
  expiresOrReviewBy?: string;
};

/* What a surface renders: the entry's own provenance, or an external source's, plus whatever the
   federation adds (licence, URL, source id). Every field but authority is optional so a citation
   can always be built, however little is known — a citation with only an authority is still an
   honest citation. */
export type SourceCitation = {
  authority: string;
  jurisdiction?: string;
  publishedDate?: string;
  retrievedDate?: string;
  evidenceGrade?: string;
  expiresOrReviewBy?: string;
  licence?: string;
  url?: string;
  sourceId?: string;
};

const trimmed = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/* Strict enough for the typed contract (the boundary check guarantees the full shape on real
   entries), tolerant enough never to throw on a fixture: null when there is no authority at all,
   the complete object when every required field is a non-empty string. */
export function provenanceOf(raw: unknown): KnowledgeSource | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const authority = trimmed(record.authority);
  const jurisdiction = trimmed(record.jurisdiction);
  const retrievedDate = trimmed(record.retrievedDate);
  if (!authority || !jurisdiction || !retrievedDate) return null;
  const source: KnowledgeSource = { authority, jurisdiction, retrievedDate };
  const publishedDate = trimmed(record.publishedDate);
  const evidenceGrade = trimmed(record.evidenceGrade);
  const expiresOrReviewBy = trimmed(record.expiresOrReviewBy);
  if (publishedDate) source.publishedDate = publishedDate;
  if (evidenceGrade) source.evidenceGrade = evidenceGrade;
  if (expiresOrReviewBy) source.expiresOrReviewBy = expiresOrReviewBy;
  return source;
}

/* The authority string, from either shape. The tools and the knowledge route read attribution as
   one string (and their contracts pin it), so this is the single reader that turns the source
   object back into the string it has always been. */
export function attributionOf(raw: unknown, fallback: string): string {
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const authority = trimmed((raw as Record<string, unknown>).authority);
    if (authority) return authority;
  }
  return fallback;
}

/* The codes object, from whatever an entry carries. Only the three vocabulary keys survive; a
   malformed value is dropped rather than rendered. */
export function codesOf(raw: unknown): KnowledgeCode {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const record = raw as Record<string, unknown>;
  const codes: KnowledgeCode = {};
  const snomed = trimmed(record.snomed);
  const icd11 = trimmed(record.icd11);
  const loinc = trimmed(record.loinc);
  if (snomed) codes.snomed = snomed;
  if (icd11) codes.icd11 = icd11;
  if (loinc) codes.loinc = loinc;
  return codes;
}

/* The facts a citation can be built from when the caller does not hold a full KnowledgeSource — an
   adapter holds its source config's authority and jurisdiction, nothing more. Every field optional:
   a citation that knows less states less. */
export type CitationInput = {
  authority?: string | null;
  jurisdiction?: string;
  publishedDate?: string;
  retrievedDate?: string;
  evidenceGrade?: string;
  expiresOrReviewBy?: string;
};

/* Build the structured citation from a parsed source, a bare authority string, or nothing at all
   (an external adapter passes its own source config through extras instead). */
export function citationOf(
  source: CitationInput | string | null | undefined,
  extras: { licence?: string; url?: string; sourceId?: string } = {},
): SourceCitation {
  const citation: SourceCitation = {
    authority:
      typeof source === "string"
        ? source
        : trimmed(source?.authority) || "MyThuso knowledge base",
  };
  if (source && typeof source !== "string") {
    const jurisdiction = trimmed(source.jurisdiction);
    const publishedDate = trimmed(source.publishedDate);
    const retrievedDate = trimmed(source.retrievedDate);
    const evidenceGrade = trimmed(source.evidenceGrade);
    const expiresOrReviewBy = trimmed(source.expiresOrReviewBy);
    if (jurisdiction) citation.jurisdiction = jurisdiction;
    if (publishedDate) citation.publishedDate = publishedDate;
    if (retrievedDate) citation.retrievedDate = retrievedDate;
    if (evidenceGrade) citation.evidenceGrade = evidenceGrade;
    if (expiresOrReviewBy) citation.expiresOrReviewBy = expiresOrReviewBy;
  }
  const licence = trimmed(extras.licence);
  const url = trimmed(extras.url);
  const sourceId = trimmed(extras.sourceId);
  if (licence) citation.licence = licence;
  if (url) citation.url = url;
  if (sourceId) citation.sourceId = sourceId;
  return citation;
}

/* One renderable line — what the knowledge-search tool prints under each excerpt, and what a
   panel displays. Em dashes between facts, nothing invented: a fact that is absent is a segment
   that is absent. */
export function citationLine(citation: SourceCitation): string {
  const parts = [citation.authority];
  if (citation.jurisdiction) parts.push(citation.jurisdiction);
  if (citation.evidenceGrade) parts.push(`evidence: ${citation.evidenceGrade}`);
  if (citation.publishedDate) parts.push(`published ${citation.publishedDate}`);
  if (citation.retrievedDate) parts.push(`retrieved ${citation.retrievedDate}`);
  if (citation.expiresOrReviewBy) parts.push(`review by ${citation.expiresOrReviewBy}`);
  if (citation.licence) parts.push(citation.licence);
  return parts.join(" — ");
}

/* Expiry, decided by plain date-string comparison so a timezone can never move the boundary: an
   entry is expired on the first day after its review date. No review date, no expiry — absence
   of a horizon is not a claim that the record is current. */
export function isExpired(
  source: { expiresOrReviewBy?: unknown } | null | undefined,
  now: Date,
): boolean {
  const review = source && typeof source.expiresOrReviewBy === "string" ? source.expiresOrReviewBy : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(review)) return false;
  return review < now.toISOString().slice(0, 10);
}
