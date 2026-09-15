package za.co.mythuso.model

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.time.Instant
import java.time.LocalTime
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

/*
 * The Care engine's rules for the visit the nurse workspace walks, hand-written for Android.
 *
 * The sentences, the service requirements, the stages and the preview visit are CareData, generated
 * from packages/catalog/care.json and the route contract. What is hand-written here is the arithmetic
 * packages/engines/src/care/domain decides with, for the one nurse this phone belongs to: whether she
 * may be offered the visit at all and in what words she is withheld, when the offer lapses, whether
 * the code opens and closes the visit, whether a checklist may run, and whether the patient may still
 * be shown where she is. The gates are asked in the domain's order — scope of practice, a place to
 * measure from, a current badge — so a nurse withheld on the web is withheld here for the same reason.
 *
 * WHAT STANDS IN FOR THE PLATFORM, as on the web and iOS. Verify's badge is the preview's own vetting
 * summary of this nurse; the record's answer about the encounter is the visit queue's sign-off for this
 * visit. Nothing is sent anywhere, and this state is held in memory: a visit accepted here is gone when
 * the process is.
 *
 * WHAT IT DOES NOT PORT. The ranking of other nurses and the cascade to them. This phone belongs to one
 * nurse and is never shown who else was asked, so a decline and a lapse end here with the contract's
 * sentence that the visit has gone on.
 */

enum class CareOfferState { OPEN, ACCEPTED, DECLINED, LAPSED }

enum class CareStage(val id: String) {
    ROUTE("route"), START("start"), CHECKLIST("checklist"), RECORD("record"), HANDOVER("handover"), COMPLETE("complete");
    val stageName: String get() = CareData.stages.firstOrNull { it.id == id }?.name ?: id
}

data class CareOffer(val expiresAtMillis: Long, val marker: String?, val distanceKm: Double, val state: CareOfferState)

/** A refusal, with the stage whose control was refused so it is shown beside that control. */
data class CareRefusal(val stage: CareStage?, val statement: String)

class CareVisitState(vetting: VettingStore, private val queue: VisitQueueStore, clockMillis: Long = System.currentTimeMillis()) {
    var offer by mutableStateOf<CareOffer?>(null)
        private set
    var withheld by mutableStateOf<String?>(null)
        private set
    var stage by mutableStateOf(CareStage.ROUTE)
        private set
    var startedAtMillis by mutableStateOf<Long?>(null)
        private set
    var handedOver by mutableStateOf(false)
        private set
    var completedAtMillis by mutableStateOf<Long?>(null)
        private set
    var refusal by mutableStateOf<CareRefusal?>(null)
        private set
    var nowMillis by mutableLongStateOf(clockMillis)
        private set

    val service: CareService? = services.firstOrNull { it.id == CareData.Preview.serviceId }
    val visitZone: Zone? = Geography.zoneById(CareData.Preview.zone)
    val nurseBase: Zone?
    val scheduledFor: ZonedDateTime = instant(clockMillis, CareData.Preview.dayOffset, CareData.Preview.slot)

    val accepted: Boolean get() = offer?.state == CareOfferState.ACCEPTED
    val completed: Boolean get() = completedAtMillis != null

    init {
        val nurse = vetting.subject(CareData.Preview.clinicianRef)
        nurseBase = nurse?.zone?.let { Geography.zoneNamed(it) }
        val requirement = CareData.requirement(CareData.Preview.serviceId)
        val base = nurseBase
        val to = visitZone
        /* Scope first: nothing about a badge changes whether she is registered to do the work. Then a
           place to measure from, because an invented distance would rank her against real ones. Then the
           badge. Withheld, never offered last. */
        withheld = when {
            nurse == null || requirement == null -> CareData.noEligibleClinician
            requirement.scope != null && requirement.scope !in nurse.scope -> CareData.outsideScope
            base == null || to == null -> CareData.noBase
            !summarise(nurse).cleared -> CareData.noCurrentTrustScore
            else -> null
        }
        if (withheld == null && nurse != null && base != null && to != null) {
            offer = CareOffer(
                expiresAtMillis = clockMillis + CareData.offerExpiresAfterMinutes * 60_000L,
                marker = if (nurse.id in CareData.Preview.previousClinicianRefs) CareData.markerPrevious else null,
                distanceKm = Geography.distanceKm(base.at, to.at),
                state = CareOfferState.OPEN
            )
        }
    }

    // ---- The offer ------------------------------------------------------------------------------

    /** Time passing. An open offer past its expiry lapses, and a lapsed offer cannot be accepted. */
    fun tick(at: Long = System.currentTimeMillis()) {
        nowMillis = at
        val current = offer ?: return
        if (current.state == CareOfferState.OPEN && at >= current.expiresAtMillis) offer = current.copy(state = CareOfferState.LAPSED)
    }

    val minutesLeft: Int
        get() {
            val current = offer ?: return 0
            val millis = current.expiresAtMillis - nowMillis
            return if (millis <= 0) 0 else ((millis + 59_999) / 60_000).toInt()
        }

    fun accept(at: Long = System.currentTimeMillis()) {
        tick(at)
        val current = offer ?: return
        if (current.state != CareOfferState.OPEN) {
            refusal = CareRefusal(null, CareData.offerExpired)
            return
        }
        offer = current.copy(state = CareOfferState.ACCEPTED)
        refusal = null
        stage = CareStage.ROUTE
    }

    fun decline(at: Long = System.currentTimeMillis()) {
        tick(at)
        val current = offer ?: return
        if (current.state != CareOfferState.OPEN) return
        offer = current.copy(state = CareOfferState.DECLINED)
        refusal = null
    }

    // ---- The visit ------------------------------------------------------------------------------

    fun go(next: CareStage) {
        stage = next
        refusal = null
    }

    /* The day is asked before the code, so a wrong-day attempt learns nothing about whether its code was
       right. A wrong code changes nothing and counts nothing. */
    fun start(code: String, at: Long = System.currentTimeMillis()) {
        if (!accepted) return
        if (startedAtMillis != null) { stage = CareStage.CHECKLIST; return }
        if (!sameDay(scheduledFor, at)) { refusal = CareRefusal(CareStage.START, CareData.notToday); return }
        if (!matches(code)) { refusal = CareRefusal(CareStage.START, CareData.startCodeWrong); return }
        startedAtMillis = at
        refusal = null
        stage = CareStage.CHECKLIST
    }

    val protocols: List<ProtocolsData.Entry>
        get() = CareData.requirement(CareData.Preview.serviceId)?.protocolIds.orEmpty().mapNotNull { ProtocolsData.entry(it) }
    /** True only when every protocol the service names is ratified. Today none is. */
    val checklistRunnable: Boolean get() = protocols.isNotEmpty() && protocols.all { it.ratified }
    val checklistRefusal: String?
        get() = if (protocols.isEmpty()) CareData.checklistNoProtocol else if (checklistRunnable) null else CareData.checklistNotRatified
    val checklistWhy: String? get() = if (protocols.any { it.status == "draft" }) CareData.draftCarriesNothing else null

    /** The record's answer in this preview: the assessment for this visit has been signed off on this phone. */
    val signedOff: Boolean
        get() = queue.parts.any { it.visit == CareData.Preview.appointmentRef && it.kind == VisitPartKind.SIGN_OFF }

    fun handOver() {
        if (startedAtMillis == null) { refusal = CareRefusal(CareStage.HANDOVER, CareData.handoverWithoutVisit); return }
        /* Whether a signed-off assessment counts as a signed encounter is a setting; the phone uses its generated
           default, which is today's behaviour. Switched off in the contract, nothing on this phone can prove a
           signature, so handover and completion are refused in the engine's sentence naming the missing route. */
        if (!CareData.encounterEntryCountsAsSigned) { refusal = CareRefusal(CareStage.HANDOVER, CareData.encounterSignatureUnconfirmed); return }
        if (!signedOff) { refusal = CareRefusal(CareStage.HANDOVER, CareData.encounterIncomplete); return }
        handedOver = true
        refusal = null
        stage = CareStage.COMPLETE
    }

    fun complete(code: String, at: Long = System.currentTimeMillis()) {
        if (startedAtMillis == null) { refusal = CareRefusal(CareStage.COMPLETE, CareData.completeWithoutStart); return }
        if (!matches(code)) { refusal = CareRefusal(CareStage.COMPLETE, CareData.completeCodeWrong); return }
        if (!CareData.encounterEntryCountsAsSigned) { refusal = CareRefusal(CareStage.COMPLETE, CareData.encounterSignatureUnconfirmed); return }
        if (!signedOff) { refusal = CareRefusal(CareStage.COMPLETE, CareData.encounterUnsigned); return }
        completedAtMillis = at
        refusal = null
    }

    /** Whether the patient may be shown where the nurse is: on the visit's day, and only until it is complete. */
    val locationShared: Boolean get() = accepted && completedAtMillis == null && sameDay(scheduledFor, nowMillis)
    val locationSentence: String get() = if (locationShared) CareData.locationWhileShared else CareData.locationBeyondTheVisit

    companion object {
        private val clockFormat: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

        /* Compared across the whole length whatever the first difference, so the time a refusal takes
           does not say how many leading digits were right. */
        fun matches(offered: String): Boolean {
            val held = CareData.Preview.visitCode
            var difference = held.length xor offered.length
            for (index in 0 until maxOf(held.length, offered.length)) {
                difference = difference or ((held.getOrNull(index)?.code ?: 0) xor (offered.getOrNull(index)?.code ?: 0))
            }
            return held.isNotEmpty() && difference == 0
        }

        /** A slot on a day offset from the clock, in the contract's timezone rather than the phone's. */
        fun instant(clockMillis: Long, dayOffset: Int, slot: String): ZonedDateTime {
            val day = Instant.ofEpochMilli(clockMillis).atZone(Scheduling.zone).toLocalDate().plusDays(dayOffset.toLong())
            return ZonedDateTime.of(day, LocalTime.parse(slot), Scheduling.zone)
        }

        fun sameDay(visit: ZonedDateTime, atMillis: Long): Boolean =
            Instant.ofEpochMilli(atMillis).atZone(Scheduling.zone).toLocalDate() == visit.toLocalDate()

        fun clock(at: ZonedDateTime): String = at.format(clockFormat)
        fun clock(atMillis: Long): String = Instant.ofEpochMilli(atMillis).atZone(Scheduling.zone).format(clockFormat)
    }
}
