package za.co.mythuso.model

/* The emergency pathway.

   This is the one screen in MyThuso where being wrong is dangerous rather than inconvenient, and
   the shape of the model is the argument. Three things are true of it and none of them is
   decoration:

   MyThuso is not an ambulance service. `sosEmergency` — the three real South African numbers — is
   the first value in the generated table and the first thing on the screen, above anything MyThuso
   sells. It does not move, and no answer to any question moves it.

   Software does not triage. `route(...)` below takes the ticked conditions and the two routing
   answers and returns a door. It does not score, weight, rank or add anything up, and any ticked
   condition returns EmergencyServices before the other two answers are even read. That early
   return is the design: a question asked after a red flag would only be there to talk somebody out
   of an ambulance.

   A promise about time is a promise. `sosTargetMinutes` is the duration of the `sos` row in the
   service catalogue, generated into SosData.kt rather than typed, and the copy calls it a target
   every time it says it. It is never used as an arrival estimate. Arrival estimates come from
   Geo.kt, which returns an Eta with null minutes and a reason rather than a plausible number — the
   rule this app already holds on the dispatch board, and the rule that matters most here.

   The table itself is generated from packages/catalog/sos.json. What is here is the reasoning.

   Nothing dials. No telephony, no location permission, no dispatch, no ambulance partner. */

/** A real South African emergency number, written from the contract rather than typed here. */
data class SosNumber(
    val id: String,
    val number: String,
    val name: String,
    val detail: String,
    val whenToUse: String
)

data class SosEmergency(
    val headline: String,
    val lead: String,
    val notAnAmbulance: String,
    val previewNote: String,
    val whyFirst: String,
    val numbers: List<SosNumber>
)

/** One of the eight conditions that ends the questions. There is no severity on it, on purpose:
 *  severity is the judgement this app refuses to make. */
data class SosCondition(val id: String, val name: String, val detail: String)

data class SosRedFlags(
    val prompt: String,
    val help: String,
    val noneLabel: String,
    val endsTheQuestions: String,
    val conditions: List<SosCondition>
)

/** `kind` is what a question routes on — "red-flags", "area" or "callback". None of them carries a
 *  weight, because nothing is being weighed. */
data class SosQuestion(val id: String, val prompt: String, val help: String, val kind: String)

data class SosRouting(val isNotTriage: String, val noAlgorithm: String, val questions: List<SosQuestion>)

data class SosOutcome(
    val id: String,
    val name: String,
    val headline: String,
    val detail: String,
    val offersVisit: Boolean
)

data class SosTarget(
    val title: String,
    val statement: String,
    val whenItCannotBeMet: String,
    val arrivalUnknown: String,
    val estimateIsNotTheTarget: String
)

data class SosHours(val opensAt: String, val closesAt: String, val days: String, val note: String)

/** `areas` is what dispatch can actually reach. A coverage list drawn optimistically is a person
 *  waiting at a window. */
data class SosCoverage(
    val statement: String,
    val areas: List<String>,
    val hours: SosHours,
    val honestNote: String
)

/** `nurseIsTold` is one line with nothing clinical in it: a cancelled visit is not a consultation. */
data class SosStandDownReason(
    val id: String,
    val label: String,
    val nurseIsTold: String,
    val recorded: String
)

data class SosStandDown(
    val title: String,
    val statement: String,
    val reasons: List<SosStandDownReason>,
    val noAnswerRule: String,
    val chargeRule: String,
    val nurseNote: String
)

/** A way this pathway fails, and what to do instead. The second half is not optional: a failure
 *  screen without it is a dead end wearing an apology. */
data class SosFailure(val id: String, val name: String, val what: String, val instead: String)

data class SosAlertNote(val id: String, val sentence: String)

data class SosAlert(
    val name: String,
    val what: String,
    val phaseNote: String,
    val honesty: List<SosAlertNote>,
    val notCover: String
)

data class SosRecord(val title: String, val statement: String, val kept: List<String>, val notKept: List<String>)

data class SosRule(val id: String, val title: String, val sentence: String)
data class SosRefusal(val id: String, val sentence: String)

/** What the person answered. Three fields, and not one of them is a severity. */
data class SosAnswers(
    val flagged: Set<String> = emptySet(),
    val area: String? = null,
    val canAnswerAPhone: Boolean? = null
)

/** Where an answer sends somebody. A refusal is a door too, and it is named, so that "we cannot
 *  help" always arrives with the reason attached rather than as a spinner that never resolves. */
sealed interface SosDoor {
    data object EmergencyServices : SosDoor
    data object UrgentVisit : SosDoor
    data class Refused(val failureId: String) : SosDoor
}

val SosDoor.outcomeId: String
    get() = when (this) {
        SosDoor.EmergencyServices -> "emergency-services"
        SosDoor.UrgentVisit -> "urgent-visit"
        is SosDoor.Refused -> "cannot-help"
    }

object Sos {
    fun outcome(id: String) = sosOutcomes.firstOrNull { it.id == id } ?: sosOutcomes.first()
    fun failure(id: String) = sosFailures.firstOrNull { it.id == id } ?: sosFailures.first()
    fun rule(id: String) = sosRules.firstOrNull { it.id == id } ?: sosRules.first()
    fun refusal(id: String) = sosRefusals.firstOrNull { it.id == id } ?: sosRefusals.first()
    fun condition(id: String) = sosRedFlags.conditions.firstOrNull { it.id == id }

    /* Routing, not triage.

       Read the order. A ticked condition returns immediately, before the area and before the
       callback — one tick is enough, and nothing after it can downgrade the answer. Then the two
       questions that are genuinely about reach rather than about the person: can a nurse get
       there, and is there a phone to ring. Neither is a judgement about how sick anybody is, and
       there is deliberately no branch in this function that makes one. */
    fun route(answers: SosAnswers, openNow: Boolean, cleared: Boolean): SosDoor {
        if (answers.flagged.isNotEmpty()) return SosDoor.EmergencyServices
        val area = answers.area
        if (area == null || area !in sosCoverage.areas) return SosDoor.Refused("outside-coverage")
        if (!openNow) return SosDoor.Refused("outside-hours")
        if (answers.canAnswerAPhone == false) return SosDoor.Refused("no-callback")
        /* Urgency does not relax vetting. The nurse who would be sent is checked against the same
           register that gates the dispatch board, and a lapsed check refuses here exactly as it
           refuses there. There is no override in this function and none anywhere above it. */
        if (!cleared) return SosDoor.Refused("vetting")
        return SosDoor.UrgentVisit
    }

    /** The label the pathway shows for the target. Never the arrival estimate — those are two
     *  different things and the copy says so. */
    val targetLabel: String get() = "Under $sosTargetMinutes minutes · target"
}
