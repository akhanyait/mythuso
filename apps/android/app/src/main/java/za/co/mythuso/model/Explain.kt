package za.co.mythuso.model

import za.co.mythuso.ui.Observation
import za.co.mythuso.ui.observations

/*
 * What a reading means — written down, by a person, in English, and reviewed by nobody yet.
 *
 * The Health Passport has always rendered seven reference ranges and never said what any of them
 * measures. A number beside a range answers “is this inside the lines” and not the question a person
 * actually opened the screen with, which is “should I be worried”. Left unanswered, that question
 * gets asked of a search engine, and a search engine will diagnose them.
 *
 * WHERE THE WORDS ARE NOW. They are in packages/catalog/records.json, under explanations, beside the
 * observation section whose own note already calls those ranges indicative — and they reach this app
 * as recordExplanations and recordExplanationProvenance in the generated RecordsData.kt. This file
 * used to type all thirty-three of them out, as did apps/web/src/lib/explain.ts and
 * apps/ios/MyThuso/Models/Explain.swift, with nothing comparing the three. It types none of them
 * now: what is left here is the resolving — which range a paragraph belongs to, and which red flags
 * it points at — which is reasoning rather than prose, and is the half that is right to hand-write.
 *
 * WHY THIS IS PROSE AND NOT A MODEL. `screening` is one of the fifteen capabilities and it is blocked
 * on a model, a vendor and a licence. It is also the easiest thing in this product to overstate. A
 * written explanation cannot be any of the things an unlicensed model would be: it cannot see your
 * record, it cannot personalise itself, it cannot be confidently wrong in a new way for each reader,
 * and it can be read in full by a clinician before it ships. When screening does arrive it will have
 * to be better than this, and this is what “better” will be measured against.
 *
 * THE LINE IT MUST NOT CROSS. Nothing in the contract diagnoses. Each entry says what the
 * measurement is, what a number outside the range *may* follow from — including the ordinary, boring
 * reasons, which are usually the right ones — and what to do, which is nearly always “have it taken
 * again” and never “start, stop or change a medicine”. Every entry ends at the same place: a
 * registered doctor decides what a reading means for a particular person, and this screen does not.
 *
 * WHAT IS DERIVED. Every label, unit and range comes from the assessment's own observation table, so
 * the ranges a patient reads here and the ranges a nurse is held to at a visit cannot become two
 * different numbers. The urgent conditions are pointers into the emergency contract by id — the red
 * flags that end the questions and show the ambulance number — so this screen can never invent one
 * or soften one.
 */

/** The contract's own paragraphs, read rather than restated. */
val explanations: List<RecordExplanation> get() = recordExplanations

object Explain {
    fun forMeasure(id: String): RecordExplanation? = recordExplanations.firstOrNull { it.id == id }
    /** The order the passport already reads them in, so the explanations and the charts agree. */
    fun measure(id: String): Observation? = observations.firstOrNull { it.id == id }
    /** The red flags an explanation points at, resolved through the emergency contract. */
    fun urgentConditions(explanation: RecordExplanation): List<SosCondition> =
        explanation.urgent.mapNotNull { Sos.condition(it) }
}

/* Where this text comes from and what it is not. Five sentences that have to be on the screen rather
   than in a policy: a reader deciding how much weight to give a paragraph about their own blood
   pressure is owed the provenance of it before the paragraph, not after. Held as an object rather
   than read through recordExplanationProvenance at each call site so the screen reads the same way
   it did; what changed is that none of the five is written here any more. */
object ExplainProvenance {
    val written: String get() = recordExplanationProvenance.written
    val unreviewed: String get() = recordExplanationProvenance.unreviewed
    val ranges: String get() = recordExplanationProvenance.ranges
    val whoDecides: String get() = recordExplanationProvenance.whoDecides
    val neverChange: String get() = recordExplanationProvenance.neverChange
}
