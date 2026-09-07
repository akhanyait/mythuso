package za.co.mythuso.model

import java.time.LocalDate

/* The South African Sign Language accommodation.
 *
 * packages/catalog/locales.json already said what is owed to a Deaf patient: a booking that will
 * not complete without an interpreter, a nurse told before she leaves, an interpreter named on the
 * call roster, and six things that must never happen. It said, at the bottom, that none of it was
 * built. This file and InterpretingData.kt beside it are the half that makes it arithmetic.
 *
 * The table — the three modes, four fictional interpreters and the hours they are free, the hold,
 * the wait, the free cancellation, the seven rules and the eight refusals — is generated into
 * InterpretingData.kt from packages/catalog/interpreting.json, so nothing below is transcribed.
 *
 * What is here is the arithmetic, and one line of it is the whole point:
 *
 *     fun firstFree(...): FreeSlot?
 *
 * The nullable is not a convenience. A function that cannot return "I do not know" is a function
 * somebody will one day make return something, and the something will be a number a person takes a
 * morning off work for. packages/catalog/sos.json holds an ambulance's arrival to the same rule
 * under the same id — an estimate that is honest on one screen and confident on another is worse
 * than either — and scripts/check-boundaries.mjs fails the build if this signature, or the Swift
 * one, or the TypeScript one, stops being able to return nothing.
 *
 * The other half is `resolve`, which has three outcomes and no fourth. An interpreter is free at the
 * hour chosen and the visit is confirmed with them named on it; or one is free later and the visit
 * is held with that hour shown; or nobody is and the visit is held with the contract's sentence
 * about not knowing. There is no branch here that produces a dispatchable visit with the requirement
 * on and no interpreter against it.
 *
 * Nothing here contacts an interpreter, holds a real visit or books anybody's time. Every person on
 * the roster is fictional, and the accreditation route in the vetting table is drafted rather than
 * confirmed with the body it names. */

data class InterpreterAccreditation(
    val body: String,
    val short: String,
    val authorityId: String,
    val route: String,
    /** Null until a named person at the accrediting body has read it. Every screen says which. */
    val confirmedBy: String?,
    val confirmedOrganisation: String?,
    val confirmedOn: String?,
    val uncertainty: String,
    val whatWouldMakeItTrue: String
) {
    val isConfirmed: Boolean
        get() = confirmedBy != null && confirmedOrganisation != null && confirmedOn != null
}

data class InterpretingMode(val id: String, val name: String, val detail: String, val note: String)

data class FreeDay(val dayOffset: Int, val slots: List<String>)

data class Interpreter(
    val id: String,
    val name: String,
    /** Their number with the accrediting body, in whatever shape that body actually issues it. */
    val reference: String,
    val mode: String,
    val area: String,
    val settings: List<String>,
    /** Free hours, unresolved. Which one answers a request is decided below, not in the generator. */
    val free: List<FreeDay>
)

data class InterpreterHold(
    val status: String,
    val title: String,
    val sentence: String,
    val whyNotDispatched: String,
    val whatHappensNext: String
)

data class InterpreterEstimate(
    val knownPrefix: String,
    val unknown: String,
    val unknownDetail: String,
    val horizonNote: String
)

data class InterpreterCancellation(
    val fee: Int,
    /** MyThuso. A service failure filed under the patient's name is a failure that stops being seen. */
    val attributedTo: String,
    val label: String,
    val sentence: String,
    val notThePatientsChoice: String,
    val keepsTheRequirement: String
)

data class InterpreterWithdrawal(
    val endsTheConsultation: Boolean,
    val question: String,
    val sentence: String,
    val why: String,
    val notAPunishment: String
)

data class InterpreterCost(val charged: Boolean, val sentence: String)

data class InterpretingRule(val id: String, val title: String, val sentence: String)
data class InterpretingRefusal(val id: String, val title: String, val sentence: String)

data class InterpretingLabels(
    val heading: String,
    val requirementOn: String,
    val chooseMode: String,
    val rosterHeading: String,
    val noneFree: String,
    val matched: String,
    val heldBadge: String,
    val vettingHeading: String,
    val refusalsHeading: String,
    val modeUnavailable: String
)

/** One hour somebody is actually free, resolved against the days this app offers a visit on. */
data class FreeSlot(val interpreter: Interpreter, val date: LocalDate, val slot: String) {
    val iso: String get() = date.toString()
}

/** Three outcomes and no fourth. */
sealed interface InterpreterOutcome {
    data class Matched(val slot: FreeSlot) : InterpreterOutcome
    data class Held(val slot: FreeSlot, val days: Int) : InterpreterOutcome
    data object HeldUnknown : InterpreterOutcome

    val isHeld: Boolean get() = this !is Matched
    val found: FreeSlot?
        get() = when (this) {
            is Matched -> slot
            is Held -> slot
            HeldUnknown -> null
        }
}

object Interpreting {
    fun mode(id: String) = interpretingModes.firstOrNull { it.id == id } ?: interpretingModes.first()
    fun rule(id: String) = interpretingRules.firstOrNull { it.id == id } ?: interpretingRules.first()
    fun refusal(id: String) = interpretingRefusals.firstOrNull { it.id == id } ?: interpretingRefusals.first()
    fun role(): VettingRole? = vettingRoles.firstOrNull { it.id == interpreterRoleId }

    /* The window is scheduling's, not a second copy of it: the same five days from tomorrow and the
       same nine hours. An interpreter free on the sixth day is one this cannot see, and
       `interpreterEstimate.horizonNote` is what says so on the screen rather than a silence. */
    fun availability(mode: String, from: LocalDate = Scheduling.today()): List<FreeSlot> {
        val offered = Scheduling.offeredDays(from).map { it.date }.toSet()
        val free = mutableListOf<FreeSlot>()
        for (interpreter in interpreterRoster.filter { it.mode == mode }) {
            for (day in interpreter.free) {
                val date = from.plusDays(day.dayOffset.toLong())
                if (date !in offered) continue
                for (slot in day.slots.filter { it in SchedulingData.slots }) {
                    free += FreeSlot(interpreter, date, slot)
                }
            }
        }
        return free.sortedWith(compareBy({ it.iso }, { it.slot }))
    }

    fun freeAt(mode: String, iso: String, slot: String, from: LocalDate = Scheduling.today()): FreeSlot? =
        availability(mode, from).firstOrNull { it.iso == iso && it.slot == slot }

    /** The first free hour at or after the one asked for — and null when there is not one. The
        nullable is the feature; see the header. */
    fun firstFree(mode: String, iso: String, slot: String, from: LocalDate = Scheduling.today()): FreeSlot? =
        availability(mode, from).firstOrNull { it.iso > iso || (it.iso == iso && it.slot >= slot) }

    fun waitDays(from: String, to: FreeSlot): Int =
        runCatching {
            val asked = LocalDate.parse(from)
            maxOf(0, (to.date.toEpochDay() - asked.toEpochDay()).toInt())
        }.getOrDefault(0)

    fun resolve(mode: String, iso: String, slot: String, from: LocalDate = Scheduling.today()): InterpreterOutcome {
        freeAt(mode, iso, slot, from)?.let { return InterpreterOutcome.Matched(it) }
        val next = firstFree(mode, iso, slot, from) ?: return InterpreterOutcome.HeldUnknown
        return InterpreterOutcome.Held(next, waitDays(iso, next))
    }

    /** The status a visit carries out of that decision. Matched keeps whatever it had; the other two
        are held, in the contract's word, and a held visit is not dispatched. */
    fun status(outcome: InterpreterOutcome, ifMatched: String): String =
        if (outcome.isHeld) interpreterHold.status else ifMatched

    /** The wait as a sentence, or the admission that there is not one. No third form, and no number
        to fall through to. */
    fun waitSentence(outcome: InterpreterOutcome): String {
        val found = outcome.found ?: return interpreterEstimate.unknown
        return "${interpreterEstimate.knownPrefix} ${found.interpreter.name}, ${Scheduling.longDate(found.date)} at ${found.slot}."
    }
}
