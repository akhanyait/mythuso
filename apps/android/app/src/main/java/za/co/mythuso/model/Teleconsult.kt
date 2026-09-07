package za.co.mythuso.model

/* The teleconsultation call: the types and the reasoning, hand-written.

   The table itself — the roster, the five consent questions, the recording decision, the four
   connection states, the six clinical limits, the reconnection protocol, the seven encounter
   outcomes, the six rules and the six refusals — is generated into TeleconsultData.kt from
   packages/catalog/teleconsult.json, so nothing below is transcribed. What is here is the
   arithmetic, and there are only three pieces of it worth having.

   What the doctor may conclude, given the line and who is in the room. Two gates, not one: the
   connection decides what can be perceived, and the roster decides whether there is anybody there to
   examine on the doctor's behalf. A limit that needs a nurse goes the moment the patient asks her to
   step outside — which is the consequence they were told about before they asked.

   Which outcome an encounter had. Worked out, never chosen. A clinician under time pressure, offered
   a list of outcomes, picks the one nearest the top, and "completed" is nearly always nearest the
   top. So there is no list.

   Which sections of the consultation record an outcome writes. An encounter that did not reach a
   decision writes no assessment and no plan, and cannot be called a consultation. That is the whole
   feature. It is held here as arithmetic and checked in scripts/check-boundaries.mjs, because the
   failure is not somebody writing the wrong sentence — it is a half-finished encounter sitting in a
   record looking exactly like a finished one until somebody relies on it.

   Nobody is named in the contract. A participant carries a roleId into the vetting register and the
   screen resolves the party from there, so the registration the patient reads is the one a reviewer
   verified. Nothing here refuses a clinician in words of its own either: the call asks
   can(subject, "sign-clinical-review") and shows the clinical queue's answer.

   Nothing connects. No media API is used, no camera or microphone is requested, and the manifest
   declares neither permission. Every party below is fictional. */

data class MediaState(val id: String, val name: String, val detail: String)

/** `declared` is a fact about the build, not a setting. It is false, and the screen says so. */
data class MediaPosture(
    val declared: Boolean,
    val state: String,
    val sentence: String,
    val states: List<MediaState>,
    val whyTheDistinctionMatters: String
)

data class CallIdentity(
    val patientSideDetail: String,
    val doctorSideDetail: String,
    /** The same refusal the nurse gets at the door. One identity check, one sentence. */
    val failure: String,
    val whyOneMechanism: String
)

data class CallParticipant(
    val id: String,
    /** The role, not the person. `roleId` reaches into the vetting register for the person. */
    val name: String,
    val roleId: String?,
    /** Emitted as `place` so Swift and Kotlin carry the same field name; `where` is Swift's. */
    val place: String,
    val sees: String,
    val hears: String,
    val essential: Boolean,
    val mayBeAskedToLeave: Boolean,
    val consentQuestion: String?,
    val ifDeclined: String?,
    val note: String
)

data class ConsentItem(
    val id: String,
    val participant: String?,
    val required: Boolean,
    /** Every one of them is. Consent that cannot be taken back mid-call is not consent. */
    val revocable: Boolean,
    val revokedMidCall: String
)

data class RecordingIfItExisted(
    val askedSeparately: String,
    val refusingIsCostless: String,
    val whileRecording: String,
    val whoMayView: List<String>,
    val keptForDays: Int,
    val afterwards: String
)

data class RecordingPolicy(
    /** False. A recording switch this build cannot honour would teach the habit of granting it. */
    val offeredInPreview: Boolean,
    val decision: String,
    val why: String,
    val instead: List<String>,
    val whenItExists: RecordingIfItExisted
)

/** `needs` is "sound", "video" or "nurse" — what has to be true for this to be allowed. */
data class ClinicalLimit(val id: String, val name: String, val needs: String, val detail: String)

data class ConnectionState(
    val id: String,
    val name: String,
    /** 3 down to 0. What each state permits is a subset of the one above it, and the build fails
     *  if that stops being true. */
    val fidelity: Int,
    val patientSees: String,
    val doctorSees: String,
    val permits: List<String>,
    val note: String
)

data class Reconnect(
    val holdSeconds: Int,
    val attempts: Int,
    val whoCallsWhom: String,
    val duringTheHold: String,
    val afterTheHold: String,
    val ifUnreachable: String,
    val nurseInTheRoom: String,
    val whyNotLonger: String
)

data class EncounterOutcome(
    val id: String,
    val name: String,
    val reachedDecision: Boolean,
    val connectionLost: Boolean,
    /** The one that matters. False for every outcome that did not reach a decision. */
    val countsAsConsultation: Boolean,
    val charged: Boolean,
    /** Section ids in packages/catalog/records.json. */
    val writes: List<String>,
    val record: String
)

data class CallRule(val id: String, val title: String, val sentence: String)
data class CallRefusal(val id: String, val sentence: String)

/** One of the three ways a person reaches a doctor. A route names a service in the catalogue rather
 *  than carrying a price: a price lives in one place and this is not it. [serviceId] is null for the
 *  route a patient does not buy — the doctor joining a visit that has already been paid for.
 *  [live] is false for the results review, which is a doctor reading rather than a call; naming it a
 *  consultation would let a review be charged and recorded as one. */
data class CallRoute(
    val id: String,
    val name: String,
    val serviceId: String?,
    val startedBy: String,
    val detail: String,
    val patientWords: String,
    val live: Boolean,
    val phase: Int
)

/** What a person is told between asking for a doctor and getting one. [shows] is what the screen
 *  puts beside the sentence — a name, a position in the queue, a plan. */
data class WaitingState(val id: String, val name: String, val patientWords: String, val shows: String)

/** A document a consultation can produce, and the limit on producing it. A prescription and a
 *  medical certificate are legal documents; a video call is not an examination, which is why two of
 *  these have [mayIssue] false and say so in the patient's own words. */
data class IssuedDocument(
    val id: String,
    val name: String,
    val mayIssue: Boolean,
    val condition: String,
    val goesTo: String?,
    val limit: String
)

fun callRoute(id: String): CallRoute = callRoutes.firstOrNull { it.id == id } ?: callRoutes[0]
fun callWaiting(id: String): WaitingState = callWaitingRoom.firstOrNull { it.id == id } ?: callWaitingRoom[0]
fun callDocument(id: String): IssuedDocument = callIssued.firstOrNull { it.id == id } ?: callIssued[0]

/** The two documents a call may not produce, so a screen lists them from the contract rather than
 *  from somebody remembering which two they were. */
fun callRefusedDocuments(): List<IssuedDocument> = callIssued.filter { !it.mayIssue }

/** What actually happened, in the order the refusals bite. */
data class CallAttempt(
    val clinicianAllowed: Boolean = true,
    val identityConfirmed: Boolean = false,
    val consented: Boolean = false,
    val everConnected: Boolean = false,
    val lineDropped: Boolean = false,
    val resumed: Boolean = false,
    val decisionReached: Boolean = false
)

object Teleconsult {
    fun participant(id: String) = callParticipants.firstOrNull { it.id == id } ?: callParticipants.first()
    fun consentItem(id: String) = callConsent.firstOrNull { it.id == id } ?: callConsent.first()
    fun consentFor(participantId: String) = callConsent.firstOrNull { it.participant == participantId }
    fun connectionState(id: String) = callConnectionStates.firstOrNull { it.id == id } ?: callConnectionStates.first()
    fun limit(id: String) = callClinicalLimits.firstOrNull { it.id == id } ?: callClinicalLimits.first()
    fun outcome(id: String) = callOutcomes.firstOrNull { it.id == id } ?: callOutcomes.first()
    fun rule(id: String) = callRules.firstOrNull { it.id == id } ?: callRules.first()
    fun refusal(id: String) = callRefusals.firstOrNull { it.id == id } ?: callRefusals.first()
    fun mediaState(id: String) = callMedia.states.firstOrNull { it.id == id } ?: callMedia.states.first()

    /** Worst first, which is the order the ladder is read in when something is going wrong. */
    val degradations: List<ConnectionState> get() = callConnectionStates.sortedBy { it.fidelity }

    /* What this doctor may conclude, right now. The line and the room, both. */
    fun permitted(connectionId: String, nursePresent: Boolean): List<ClinicalLimit> {
        val state = connectionState(connectionId)
        return callClinicalLimits.filter { state.permits.contains(it.id) && (it.needs != "nurse" || nursePresent) }
    }
    fun withdrawn(connectionId: String, nursePresent: Boolean): List<ClinicalLimit> {
        val allowed = permitted(connectionId, nursePresent).map { it.id }.toSet()
        return callClinicalLimits.filterNot { allowed.contains(it.id) }
    }
    /** On a dropped line this is false, which is why there is no button to close the encounter. */
    fun mayConclude(connectionId: String, nursePresent: Boolean) =
        permitted(connectionId, nursePresent).any { it.id == "conclude" }

    /* The outcome, worked out rather than picked. */
    fun outcomeOf(attempt: CallAttempt): EncounterOutcome = when {
        !attempt.clinicianAllowed -> outcome("clinician-refused")
        !attempt.identityConfirmed -> outcome("identity-failed")
        !attempt.consented -> outcome("consent-declined")
        !attempt.everConnected -> outcome("never-connected")
        !attempt.decisionReached -> outcome("interrupted")
        attempt.lineDropped && attempt.resumed -> outcome("resumed")
        else -> outcome("completed")
    }

    /** Which sections of the consultation record this outcome writes, resolved against the record
     *  contract itself rather than restated. A section it did not reach is withheld, not empty. */
    fun sectionsFor(outcome: EncounterOutcome): List<Pair<ConsultationSection, Boolean>> =
        consultationSections.map { it to outcome.writes.contains(it.id) }
}
