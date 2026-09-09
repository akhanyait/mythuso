package za.co.mythuso.model

import java.time.Duration
import java.time.LocalDateTime
import java.time.LocalTime

/* Cancelling a visit, and moving one.
 *
 * The states, the reasons, the sentences said to a patient and the three things cancelling does not
 * undo are generated into CancellationData.kt from packages/catalog/cancellation.json. What is here
 * is the arithmetic and the types that file needs, and it exists because of a specific defect: the
 * booking confirmation on this app promised, in a hand-typed string, that a visit could be cancelled
 * or rescheduled up to two hours before it — and there was no cancel control anywhere in the patient
 * app. A Cancelled tab held a sample cancelled visit, so the product displayed the outcome of an
 * action it did not offer, and the two hours had no contract behind them for a drift check to
 * compare against.
 *
 * Nothing below types that number. Which state a visit is in is worked out from its own start and
 * the window the contract declares, so changing the window is a decision taken once in the JSON
 * rather than an edit made in four places and missed in a fifth.
 *
 * The refusal that matters is the one that is *not* here: a visit inside the window is still
 * cancelled. The contract's `always` says why — a product that refuses to let a person cancel has
 * not prevented the cancellation, it has only made them not answer the door, and the nurse still
 * travels. The only cancellation this app refuses is one for a visit that has already begun, and
 * that refusal is about where the event belongs rather than about whether it is allowed: a visit
 * that has started and stopped is an outcome of the visit and belongs to the clinical record, not to
 * a booking screen.
 */

/** One of the three states a visit can be in when somebody asks to cancel it. */
data class CancellationState(
    val id: String,
    val name: String,
    val detail: String,
    /** Said to the patient word for word. Never paraphrased at the call site. */
    val patientWords: String,
    /** True on exactly one state, and it is not the late one. */
    val refusesCancellation: Boolean
)

/** A reason somebody may give. None of them asks a person to justify themselves. */
data class CancellationReason(val id: String, val text: String, val offersRescheduleFirst: Boolean)

/* A sentence the product says out loud rather than merely obeys. "You do not have to give a reason"
   is the one that earns its place: a screen can behave permissively and still read as a demand, and
   the person who cannot tell the difference is the one deciding whether to answer it. */
data class CancellationRefusal(val id: String, val sentence: String, val why: String)

/** Something cancelling a visit does not undo, and why it does not. */
data class CancellationLimit(val id: String, val statement: String, val why: String)

/** A visit that was cancelled, the reason given for it, and how late it was. It is kept, not deleted. */
data class CancelledVisit(
    val visit: BookedVisit,
    val reason: CancellationReason,
    val state: CancellationState
) {
    /** True of a visit cancelled inside the window. Recorded, and it costs nothing — see below. */
    val wasLate: Boolean get() = state.id == "inside-window"
}

object Cancellation {
    fun state(id: String): CancellationState =
        CancellationData.states.firstOrNull { it.id == id } ?: CancellationData.states.first()

    fun reason(id: String): CancellationReason =
        CancellationData.reasons.firstOrNull { it.id == id } ?: CancellationData.reasons.first()

    /** The window, as a duration, from the one place the number lives. */
    val window: Duration get() = Duration.ofHours(CancellationData.hoursBefore.toLong())

    /** When a visit begins, or null because it has no hour to begin at. */
    fun startsAt(visit: BookedVisit): LocalDateTime? {
        val date = visit.date ?: return null
        val start = visit.start ?: return null
        return runCatching { date.atTime(LocalTime.parse(start)) }.getOrNull()
    }

    /**
     * Which of the three states a visit is in.
     *
     * Derived from the visit's own start and the contract's window, never from a typed number. The
     * boundary is deliberately inclusive of the window's far edge — a visit exactly two hours away
     * is still outside it — because the promise made on the booking confirmation is "up to 2 hours
     * before", and the reading that costs somebody money is the one they did not make.
     *
     * A visit that has begun is `in-progress`, and so is one whose hour has passed: once the hour
     * has arrived a booking screen is no longer where this belongs, whether the nurse is still in
     * the house or has left it. What happened is an outcome of the visit and it is recorded as one.
     */
    fun stateAt(startsAt: LocalDateTime?, now: LocalDateTime = LocalDateTime.now(Scheduling.zone)): CancellationState =
        when {
            /* A visit asked for as soon as somebody is free has no hour of its own. It is treated as
               inside the window rather than outside it, because that state's words — a nurse may
               already be on the way — are the literal promise "as soon as someone is free" makes.
               Calling it `before-window` would tell a person nothing has been dispatched at the one
               moment when something may just have been. */
            startsAt == null -> state("inside-window")
            !now.isBefore(startsAt) -> state("in-progress")
            Duration.between(now, startsAt) <= window -> state("inside-window")
            else -> state("before-window")
        }

    fun stateOf(visit: BookedVisit, now: LocalDateTime = LocalDateTime.now(Scheduling.zone)): CancellationState =
        stateAt(startsAt(visit), now)

    /**
     * Cancel a visit: take it off the upcoming list and keep it, with the reason given.
     *
     * The visit is moved rather than deleted, which is `doesNotUndo`'s first limit — a visit that
     * vanishes is one nobody can ask about afterwards, not the patient, not the nurse who was
     * dispatched and not whoever has to explain it. Nothing here touches consent, and nothing here
     * touches money: what a late cancellation costs is an open commercial and legal question the
     * contract records as `pendingDecision`, and a field for it would be how a number nobody agreed
     * to arrives later looking like it was always intended.
     */
    fun cancel(store: PreviewStore, visit: BookedVisit, reason: CancellationReason, state: CancellationState) {
        if (state.refusesCancellation) return
        store.visits.remove(visit)
        store.cancelled.add(0, CancelledVisit(visit, reason, state))
    }

    /**
     * Move a visit. It stays the same visit.
     *
     * Its reference, the person it is for, the address and the service all travel across unchanged —
     * which is what makes the interpreter held for it, the consent given for it and the record of it
     * still apply afterwards. Only when it happens changes. `kind` changes with the date because
     * "as soon as someone is free" is itself an answer to *when*: choosing an hour for such a visit
     * is what moving it means, and it is the only thing being chosen.
     */
    fun reschedule(store: PreviewStore, visit: BookedVisit, date: java.time.LocalDate, start: String): BookedVisit {
        val moved = visit.copy(date = date, start = start, kind = "scheduled")
        val index = store.visits.indexOf(visit)
        if (index >= 0) store.visits[index] = moved else store.visits.add(0, moved)
        return moved
    }
}
