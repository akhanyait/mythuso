import Foundation

/* What a reading means — written down, by a person, in English, and reviewed by nobody yet.
 *
 * The Health Passport has always rendered seven reference ranges and never said what any of them
 * measures. A number beside a range answers "is this inside the lines" and not the question a
 * person actually opened the screen with, which is "should I be worried". Left unanswered, that
 * question gets asked of a search engine, and a search engine will diagnose them.
 *
 * WHY THIS IS PROSE AND NOT A MODEL. `screening` is one of the fifteen capabilities and it is
 * blocked on a model, a vendor and a licence. It is also the easiest thing in this product to
 * overstate. A written explanation cannot be any of the things an unlicensed model would be: it
 * cannot see your record, it cannot personalise itself, it cannot be confidently wrong in a new way
 * for each reader, and it can be read in full by a clinician before it ships. When screening does
 * arrive it will have to be better than this, and this is what "better" will be measured against.
 *
 * WHERE THE WORDS ARE NOW. They were typed here, and again in apps/web/src/lib/explain.ts, and
 * again in the Kotlin — three copies of a paragraph about somebody's blood pressure with nothing
 * comparing them. They live in packages/catalog/records.json now and reach this app through the
 * generated Models/RecordsData.swift, so this file holds no prose at all: it is the arithmetic that
 * joins an explanation to the range that flags it and to the red flags it points at, and nothing
 * else. Every sentence a reader sees on ExplainView comes from the contract.
 *
 * WHAT THE ARITHMETIC STILL DECIDES. `observation` resolves an explanation to the assessment's own
 * observation table by way of Passport.swift, so the ranges a patient reads and the ranges a nurse
 * is held to at a visit cannot become two different numbers. `urgent` resolves the pointers into
 * packages/catalog/sos.json by id — the eight red flags that end the questions and show the
 * ambulance number — so this screen can never invent a ninth or soften one of the eight. */

/// The contract's explanation, under the name this app's screens already call it.
typealias Explanation = RecordExplanation

enum Explain {
    static var all: [Explanation] { Records.explanations }

    static func of(_ id: String) -> Explanation? { Records.explanation(id) }
    /// The reference range, label and unit for an explanation, out of the assessment's own table.
    static func observation(_ explanation: Explanation) -> Observation? { Passport.spec(explanation.id) }
    /// The red flags an explanation points at, resolved through the emergency contract. A condition
    /// this app cannot find is dropped rather than invented, and the eight are all present — a
    /// boundary check says so.
    static func urgent(_ explanation: Explanation) -> [SosCondition] {
        explanation.urgent.compactMap(Sos.condition)
    }

    /* Where this text comes from and what it is not. Five sentences that have to be on the screen
       rather than in a policy: a reader deciding how much weight to give a paragraph about their
       own blood pressure is owed the provenance of it before the paragraph, not after. Read out of
       the contract, so the day a clinician does review this wording the sentence saying nobody has
       changes in one file rather than in three. */
    enum Provenance {
        static var written: String { Records.explanationProvenance.written }
        static var unreviewed: String { Records.explanationProvenance.unreviewed }
        static var ranges: String { Records.explanationProvenance.ranges }
        static var whoDecides: String { Records.explanationProvenance.whoDecides }
        static var neverChange: String { Records.explanationProvenance.neverChange }
    }
}
