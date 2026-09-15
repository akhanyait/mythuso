package za.co.mythuso.model

import java.security.MessageDigest
import java.security.SecureRandom

/* The chain of custody on Android: a nurse, a sample courier or a Thuso Ride responder at a patient's door with a
 * sealed medicine bag, and the only three things that let it change hands.
 *
 * MedicinesData.kt is written by scripts/emit-medicines.mjs from packages/catalog/medicines.json, dispensing.json
 * and apis/medicines.json: the PIN's length, lifetime and attempts, the window, which schedules a driver may carry,
 * every heading and every refusal sentence. This file is the arithmetic of
 * packages/engines/src/medicines/domain/collections.ts, hand-written because a phone cannot run the engine, and it
 * asks the engine's questions in the engine's order, so the sentence a collector reads here is the sentence the
 * route would answer with.
 *
 * WHAT A COLLECTION KEEPS. An authorisation reads the PIN lifetime, the window and the attempt limit once, when the
 * patient authorises, and keeps them. The generated constants are proposals an admin may change on the web; a PIN
 * already shown keeps the terms it was shown with either way.
 *
 * THE PIN IS NEVER KEPT. An authorisation holds a random salt and the SHA-256 of salt and PIN, as the engine does,
 * and a hand-over is told only whether the PIN matched. The comparison runs the whole length whatever the first
 * difference, so the time it takes says nothing about how close a guess was.
 *
 * A refusal is looked up by id and never typed. An id the contract does not declare throws rather than drawing a
 * blank where a refusal should be: a hand-over refused in silence is a collector who tries again.
 */
data class MedicineSchedule(val id: String, val name: String, val driverMayCarry: Boolean)
data class MedicinesChoice(val id: String, val label: String)
data class MedicinesRefusal(val id: String, val status: Int, val statement: String)

sealed class MedicinesOutcome<out T> {
    data class Done<T>(val value: T) : MedicinesOutcome<T>()
    data class Refused(val refusal: MedicinesRefusal) : MedicinesOutcome<Nothing>()
}

object Medicines {
    fun refusal(id: String): MedicinesRefusal =
        MedicinesData.refusals.firstOrNull { it.id == id }
            ?: error("packages/catalog/apis/medicines.json declares no live refusal \"$id\", so there is no sentence to refuse with.")

    fun fill(sentence: String, values: Map<String, String>): String =
        values.entries.fold(sentence) { text, (key, value) -> text.replace("{$key}", value) }

    fun label(list: List<MedicinesChoice>, id: String): String = list.firstOrNull { it.id == id }?.label ?: id
    fun minutesToMillis(count: Int): Long = count * 60_000L

    fun schedule(code: String): MedicineSchedule? = MedicinesData.schedules.firstOrNull { it.id == code }
    /** Whether somebody in this role may hold a bag of this schedule. A schedule the contract does not list is held by nobody. */
    fun mayCarry(role: String, scheduleCode: String): Boolean {
        val schedule = schedule(scheduleCode) ?: return false
        return schedule.driverMayCarry || role !in MedicinesData.driverRoles
    }

    data class Terms(val pinLifetimeMs: Long, val windowMs: Long, val pinAttempts: Int) {
        companion object {
            val defaults get() = Terms(
                minutesToMillis(MedicinesData.pinLifetimeMinutes), minutesToMillis(MedicinesData.collectionWindowMinutes), MedicinesData.pinAttempts
            )
        }
    }

    data class Prescription(
        val prescriptionRef: String, val subjectRef: String, val scheduleCode: String,
        val dispensedAt: Long?, val sealRef: String?, val collectedAt: Long? = null, val deliveredAt: Long? = null
    )

    data class Authorisation(
        val authorisationRef: String, val prescriptionRef: String, val collectorRef: String, val collectorRole: String,
        val pinSalt: String, val pinDigest: String, val authorisedAt: Long, val pinExpiresAt: Long, val windowEndsAt: Long,
        val pinAttempts: Int
    )

    data class CollectionRecord(
        val collectionRef: String, val authorisationRef: String, val prescriptionRef: String, val collectorRef: String,
        val collectorRole: String, val sealRef: String, val collectedAt: Long, val handedOverAt: Long?
    )

    /** `outcome` is "wrong-pin" or "broken-seal", the engine's own words for what an attempt was. */
    data class Attempt(val outcome: String, val byRef: String, val at: Long)
    data class Caller(val ref: String?, val role: String)
    data class Custody(val collection: CollectionRecord, val prescription: Prescription)
    /** What a hand-over answers, and the attempt the refusal keeps: a wrong PIN or a broken seal is counted even though the hand-over was refused. */
    data class Handover(val result: MedicinesOutcome<Custody>, val keep: Attempt?)

    private fun refused(id: String) = MedicinesOutcome.Refused(refusal(id))

    /** Why a collection has ended without a hand-over — a void reason's id — or null while it may still be handed over. */
    fun voidedBy(attempts: List<Attempt>, authorisation: Authorisation): String? {
        if (attempts.any { it.outcome == "broken-seal" }) return "broken-seal"
        return if (attempts.count { it.outcome == "wrong-pin" } >= authorisation.pinAttempts) "pin-attempts-exhausted" else null
    }

    /** How many wrong PINs a collector may still enter before the bag goes back. */
    fun attemptsLeft(attempts: List<Attempt>, authorisation: Authorisation): Int =
        maxOf(0, authorisation.pinAttempts - attempts.count { it.outcome == "wrong-pin" })

    /* The patient's side of the chain. Its refusals (whose prescription it is, a collection already under way) are
       the patient's route's, which this phone does not call and carries no sentences for, so here it only keeps the
       terms and the digest. The PIN never outlives the window, whatever the two settings say. */
    fun authorise(
        p: Prescription, authorisationRef: String, collectorRef: String, collectorRole: String,
        pin: String, terms: Terms, now: Long
    ): Authorisation {
        val salt = newSalt()
        return Authorisation(
            authorisationRef, p.prescriptionRef, collectorRef, collectorRole, salt, digest(salt, pin), now,
            now + minOf(terms.pinLifetimeMs, terms.windowMs), now + terms.windowMs, terms.pinAttempts
        )
    }

    /* A driver is refused a Schedule 5 or 6 bag from the schedule the prescription carries, never one the carrier
       declares, and before anything about time or the seal: what they may hold does not depend on when they ask. */
    fun collect(
        p: Prescription, authorisation: Authorisation?, existing: CollectionRecord?,
        collectionRef: String, sealRef: String, who: Caller, now: Long
    ): MedicinesOutcome<Custody> {
        val ref = who.ref ?: return refused("unnamed-caller")
        if (authorisation == null || authorisation.prescriptionRef != p.prescriptionRef) return refused("no-authorisation")
        if (ref != authorisation.collectorRef || who.role != authorisation.collectorRole) return refused("not-the-authorised-collector")
        if (!mayCarry(who.role, p.scheduleCode)) return refused("schedule-five-six-by-driver")
        if (now >= authorisation.windowEndsAt) return refused("authorisation-lapsed")
        if (existing != null) return refused("already-collected")
        if (p.dispensedAt == null || p.sealRef == null) return refused("not-dispensed")
        if (sealRef != p.sealRef) return refused("seal-does-not-match")
        return MedicinesOutcome.Done(
            Custody(
                CollectionRecord(collectionRef, authorisation.authorisationRef, p.prescriptionRef, ref, who.role, sealRef, now, null),
                p.copy(collectedAt = now)
            )
        )
    }

    /* At the door the order is the order of what is already true: a bag handed over or a collection voided says so
       first, then the person holding it must be the one the patient chose, then time (the window, then the PIN),
       then the seal — a broken seal voids the delivery whatever PIN is given — and only then the PIN. The PIN that
       uses the last attempt voids the collection in its own sentence rather than as one more wrong PIN. */
    fun handOver(
        c: CollectionRecord, p: Prescription, authorisation: Authorisation, attempts: List<Attempt>,
        pinMatches: Boolean, sealIntact: Boolean, who: Caller, now: Long
    ): Handover {
        fun no(id: String, keep: Attempt? = null) = Handover(refused(id), keep)
        val ref = who.ref ?: return no("unnamed-caller")
        if (c.handedOverAt != null) return no("already-handed-over")
        if (voidedBy(attempts, authorisation) != null) return no("collection-voided")
        if (ref != c.collectorRef) return no("not-the-authorised-collector")
        if (now >= authorisation.windowEndsAt) return no("authorisation-lapsed")
        if (now >= authorisation.pinExpiresAt) return no("pin-expired")
        if (!sealIntact) return no("broken-seal", Attempt("broken-seal", ref, now))
        if (!pinMatches) {
            val wrong = attempts.count { it.outcome == "wrong-pin" } + 1
            return no(if (wrong >= authorisation.pinAttempts) "pin-attempts-exhausted" else "wrong-pin", Attempt("wrong-pin", ref, now))
        }
        return Handover(MedicinesOutcome.Done(Custody(c.copy(handedOverAt = now), p.copy(deliveredAt = now))), null)
    }

    /** Where a collection stands, as one of the contract's custody states. */
    fun custodyState(collection: CollectionRecord?, attempts: List<Attempt>, authorisation: Authorisation): String = when {
        collection?.handedOverAt != null -> "handed-over"
        voidedBy(attempts, authorisation) != null -> "voided"
        collection == null -> "authorised"
        else -> "collected"
    }

    /* ---- The PIN, which only the patient is shown ---------------------------------------------------------------
       SecureRandom, and nextInt(10) draws each digit without modulo bias. A PIN made from a clock or a counter is a
       PIN somebody can work out. */
    private val random = SecureRandom()

    fun newPin(): String = (1..MedicinesData.pinDigits).joinToString("") { random.nextInt(10).toString() }
    fun newSalt(): String = ByteArray(16).also { random.nextBytes(it) }.joinToString("") { "%02x".format(it) }
    fun digest(salt: String, pin: String): String =
        MessageDigest.getInstance("SHA-256").digest("$salt:$pin".toByteArray()).joinToString("") { "%02x".format(it) }

    fun pinMatches(pin: String, authorisation: Authorisation): Boolean =
        MessageDigest.isEqual(digest(authorisation.pinSalt, pin).toByteArray(), authorisation.pinDigest.toByteArray())
}
