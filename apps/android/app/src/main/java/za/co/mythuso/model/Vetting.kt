package za.co.mythuso.model

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale

/*
 * Vetting is the gate the whole marketplace rests on, so it is a real pipeline with real refusals
 * rather than a list of names. Thirteen parties are vetted — not only nurses — and each one is
 * refused something specific, in words, until its checks pass.
 *
 * The roles, checks, issuing authorities and renewal cadences are described once, as data, in
 * packages/catalog/vetting.json. This app does not read that file at runtime: an app that parses
 * JSON to draw a list is a web app wearing a Compose hat, and the whole point of these three
 * codebases is that they are genuinely native. So scripts/emit-vetting.mjs writes the table out as
 * Kotlin into VettingData.kt, compiled into the APK like any other source. It used to be typed here
 * by hand and compared substring by substring; generating it means the two cannot disagree.
 *
 * None of this is a compliance control. It is the design of one. Nothing is verified, stored or
 * transmitted, and every party named below is fictional.
 */

data class VettingCapability(val id: String, val name: String, val detail: String)
data class VettingAuthority(
    val id: String, val name: String, val short: String, val verifies: String,
    val format: String, val pattern: String, val example: String, val hint: String
)
data class VettingGrant(val capability: String, val refusal: String)
data class VettingCheck(
    val id: String, val name: String, val detail: String, val authority: String,
    val evidence: String, val renewMonths: Int?, val risk: String,
    /* Which of the seven onboarding gates this check sits at. */
    val gate: String
)
/* One of the seven onboarding gates, generated into VettingData.kt. `evidencedBy` is "enrolment" for
   Apply and "gates" for Activate: the two gates no check carries. */
data class VettingGate(
    val id: String, val order: Int, val name: String, val hardStop: Boolean, val evidencedBy: String?,
    val failRule: String, val statement: String
)
data class VettingGateRules(val lapse: String, val suspended: String, val declined: String, val notActivated: String, val status: String)
data class VettingGateNote(val kind: String, val sentence: String)
data class VettingRole(
    val id: String, val name: String, val party: String, val workspace: String,
    val summary: String, val grants: List<VettingGrant>, val checks: List<VettingCheck>
)

/* The capabilities, the issuing authorities and their credential formats, the thirteen roles with
   their refusal sentences and checks, and the scopes of practice are generated into VettingData.kt
   from packages/catalog/vetting.json. Everything in this file is the reasoning about that table,
   which is not data and is not generated. */

fun vettingRoleById(id: String): VettingRole? = vettingRoles.firstOrNull { it.id == id }
fun vettingAuthorityById(id: String): VettingAuthority? = vettingAuthorities.firstOrNull { it.id == id }
fun vettingCapabilityById(id: String): VettingCapability? = vettingCapabilities.firstOrNull { it.id == id }
fun vettingCheckById(roleId: String, checkId: String): VettingCheck? = vettingRoleById(roleId)?.checks?.firstOrNull { it.id == checkId }

/* ---- Credential formats ---------------------------------------------------------------------
   A real refusal, worked out on the phone, with nothing sent anywhere. The identity number reuses
   the Luhn check digit already written for first-run rather than growing a second copy of it. */
data class CredentialCheck(val ok: Boolean, val reason: String?)
fun validateCredential(authorityId: String, value: String): CredentialCheck {
    val authority = vettingAuthorityById(authorityId) ?: return CredentialCheck(false, "Unknown issuing authority.")
    val entry = value.trim()
    if (authority.pattern.isEmpty()) return CredentialCheck(true, null)     // MyThuso-held checks have nothing to type
    if (entry.isEmpty()) return CredentialCheck(false, authority.hint)
    if (authority.pattern == "sa-id") {
        val (ok, reason) = validateSaId(entry)
        return CredentialCheck(ok, if (ok) null else reason)
    }
    return if (Regex(authority.pattern).matches(entry)) CredentialCheck(true, null) else CredentialCheck(false, authority.hint)
}

/* ---- The state of one check ----------------------------------------------------------------- */
enum class CheckState(val id: String, val label: String) {
    OUTSTANDING("outstanding", "Outstanding"), SUBMITTED("submitted", "Submitted"), IN_REVIEW("in-review", "In review"),
    VERIFIED("verified", "Verified"), EXPIRING("expiring", "Expiring"), LAPSED("lapsed", "Lapsed"), DECLINED("declined", "Declined")
}
/* “Expiring” still passes. A nurse whose clearance runs out in three weeks is dispatchable today,
   and is told about it — refusing her early would be a different kind of dishonesty. */
val passingStates = listOf(CheckState.VERIFIED, CheckState.EXPIRING)

data class CheckRecord(
    val checkId: String,
    val state: CheckState,
    val decidedOn: LocalDate? = null,
    val expiresOn: LocalDate? = null,
    val decidedBy: String? = null,
    /* High-risk checks are not verified on one person's say-so. */
    val secondedBy: String? = null,
    val evidence: String? = null,
    val note: String? = null
)
data class VettingSubject(
    val id: String,
    val name: String,
    val roleId: String,
    val reference: String,
    val zone: String? = null,
    val scope: List<String> = emptyList(),
    val records: List<CheckRecord> = emptyList(),
    val suspended: Boolean = false,
    val suspendedReason: String? = null,
    val declined: Boolean = false,
    val declinedReason: String? = null,
    val appealed: Boolean = false
)

const val EXPIRY_WARNING_DAYS = 45L
fun vettingToday(): LocalDate = LocalDate.now()
/* Fixtures say “three weeks from now” rather than a date, so the preview never goes stale and
   “this clearance lapsed nine days ago” stays true whenever it is opened. */
fun inDays(days: Long): LocalDate = vettingToday().plusDays(days)
fun inMonths(months: Int): LocalDate = inDays(Math.round(months * 30.44).toLong())
fun daysUntil(date: LocalDate?): Long? = date?.let { ChronoUnit.DAYS.between(vettingToday(), it) }
private val dateFormat = DateTimeFormatter.ofPattern("d MMM yyyy", Locale("en", "ZA"))
private val timeFormat = DateTimeFormatter.ofPattern("d MMM · HH:mm", Locale("en", "ZA"))
fun formatVettingDate(date: LocalDate?): String = date?.format(dateFormat) ?: "—"
fun formatVettingTime(at: LocalDateTime): String = at.format(timeFormat)

/* A stored “verified” is only true until its expiry date. Resolving the state on every read —
   rather than trusting what somebody wrote down — is what makes scheduled re-vetting real instead
   of a sentence in a paragraph of marketing copy. */
fun resolveState(record: CheckRecord): CheckState {
    if (record.state != CheckState.VERIFIED) return record.state
    val days = daysUntil(record.expiresOn) ?: return CheckState.VERIFIED
    return when {
        days < 0 -> CheckState.LAPSED
        days <= EXPIRY_WARNING_DAYS -> CheckState.EXPIRING
        else -> CheckState.VERIFIED
    }
}
fun recordFor(subject: VettingSubject, checkId: String): CheckRecord =
    subject.records.firstOrNull { it.checkId == checkId } ?: CheckRecord(checkId, CheckState.OUTSTANDING)
fun stateOf(subject: VettingSubject, checkId: String): CheckState = resolveState(recordFor(subject, checkId))
fun needsSecondReviewer(subject: VettingSubject, checkId: String): Boolean {
    val check = vettingCheckById(subject.roleId, checkId) ?: return false
    val record = recordFor(subject, checkId)
    return check.risk == "high" && resolveState(record) in passingStates && record.secondedBy.isNullOrBlank()
}

/* ---- The state of a whole party -------------------------------------------------------------- */
enum class SubjectStatus(val id: String, val label: String) {
    CLEARED("cleared", "Cleared"), EXPIRING("expiring", "Renewal due"), SUSPENDED("suspended", "Suspended"),
    DECLINED("declined", "Declined"), IN_PROGRESS("in-progress", "In progress")
}
data class VettingSummary(
    val checks: List<VettingCheck>,
    val states: List<Pair<VettingCheck, CheckState>>,
    val status: SubjectStatus,
    val blocking: List<VettingCheck>,
    val lapsed: List<VettingCheck>,
    val expiring: List<VettingCheck>,
    val awaitingSecond: List<VettingCheck>,
    val nextDue: Pair<VettingCheck, Long>?,
    val passed: Int,
    val total: Int,
    val progress: Float,
    val cleared: Boolean
)
fun summarise(subject: VettingSubject): VettingSummary {
    val checks = vettingRoleById(subject.roleId)?.checks.orEmpty()
    val states = checks.map { it to stateOf(subject, it.id) }
    val passing = states.filter { it.second in passingStates }
    val lapsed = states.filter { it.second == CheckState.LAPSED }.map { it.first }
    val declined = states.filter { it.second == CheckState.DECLINED }.map { it.first }
    val expiring = states.filter { it.second == CheckState.EXPIRING }.map { it.first }
    val awaitingSecond = states.filter { needsSecondReviewer(subject, it.first.id) }.map { it.first }
    val blocking = states.filter { it.second !in passingStates }.map { it.first }
    val status = when {
        subject.declined || declined.isNotEmpty() -> SubjectStatus.DECLINED
        subject.suspended || lapsed.isNotEmpty() -> SubjectStatus.SUSPENDED
        blocking.isNotEmpty() || awaitingSecond.isNotEmpty() -> SubjectStatus.IN_PROGRESS
        expiring.isNotEmpty() -> SubjectStatus.EXPIRING
        else -> SubjectStatus.CLEARED
    }
    /* The soonest renewal, which is what a dashboard should be counting down to. */
    val nextDue = checks.mapNotNull { check -> daysUntil(recordFor(subject, check.id).expiresOn)?.let { check to it } }
        .minByOrNull { it.second }
    return VettingSummary(
        checks, states, status, blocking, lapsed, expiring, awaitingSecond, nextDue,
        passing.size, checks.size, if (checks.isEmpty()) 0f else passing.size.toFloat() / checks.size,
        status == SubjectStatus.CLEARED || status == SubjectStatus.EXPIRING
    )
}

/* ---- The seven gates -------------------------------------------------------------------------
   Apply, identity, credentials, background, assess, train, activate. Every check in the contract
   names its gate, and where a party stands is worked out from the checks every time it is asked and
   never written down: a stored "gate 3" stops being true the night a clearance lapses. The same
   arithmetic is in apps/api/src/vetting/gates.ts and lib/vetting.ts, and every sentence comes out of
   VettingData — the fail rules are rendered word for word, never paraphrased.

   A declined check at a hard-stop gate stops the party there and outranks anything still pending
   earlier. A lapsed check holds the party at its gate with the lapse sentence rather than the gate's
   fail rule, because a clearance that ran out is not a listing on a register. */
enum class GateState { PASSED, NOT_CHECKED, PENDING, HELD, FAILED, NOT_REACHED }
enum class GateOutcome { ACTIVATED, IN_PROGRESS, HELD, FAILED, STOPPED, SUSPENDED, DECLINED }
data class GateStanding(val gate: VettingGate, val state: GateState, val outstanding: List<VettingCheck>, val note: VettingGateNote?)
data class GateProgress(
    val gates: List<GateStanding>, val at: VettingGate, val status: String,
    val outcome: GateOutcome, val sentence: String?
) {
    val activated: Boolean get() = outcome == GateOutcome.ACTIVATED
}
fun gateStatus(gate: VettingGate): String = vettingGateRules.status
    .replace("{order}", gate.order.toString())
    .replace("{total}", vettingGates.size.toString())
    .replace("{name}", gate.name)
fun gateProgress(subject: VettingSubject): GateProgress {
    val checks = vettingRoleById(subject.roleId)?.checks.orEmpty()
    val notes = vettingGateNotes[subject.roleId].orEmpty()
    var standings = vettingGates.sortedBy { it.order }.map { gate ->
        when (gate.evidencedBy) {
            "enrolment" -> GateStanding(gate, GateState.PASSED, emptyList(), null)
            "gates" -> GateStanding(gate, GateState.PENDING, emptyList(), null)
            else -> {
                val here = checks.filter { it.gate == gate.id }
                if (here.isEmpty()) GateStanding(gate, GateState.NOT_CHECKED, emptyList(), notes[gate.id])
                else {
                    val states = here.map { stateOf(subject, it.id) }
                    val outstanding = here.filter { check ->
                        val record = recordFor(subject, check.id)
                        !(resolveState(record) in passingStates && (check.risk != "high" || !record.secondedBy.isNullOrBlank()))
                    }
                    val state = when {
                        CheckState.DECLINED in states -> GateState.FAILED
                        CheckState.LAPSED in states -> GateState.HELD
                        outstanding.isNotEmpty() -> GateState.PENDING
                        else -> GateState.PASSED
                    }
                    GateStanding(gate, state, outstanding, null)
                }
            }
        }
    }
    fun finish(at: VettingGate, outcome: GateOutcome, sentence: String?): GateProgress {
        val suspended = subject.suspended && outcome == GateOutcome.IN_PROGRESS
        return GateProgress(
            standings, at, gateStatus(at),
            if (suspended) GateOutcome.SUSPENDED else outcome,
            if (suspended) subject.suspendedReason ?: vettingGateRules.suspended else sentence
        )
    }
    val stop = standings.firstOrNull { it.gate.hardStop && it.state == GateState.FAILED }
    if (stop != null) {
        standings = standings.map { if (it.gate.order > stop.gate.order) it.copy(state = GateState.NOT_REACHED) else it }
        return finish(stop.gate, GateOutcome.STOPPED, stop.gate.failRule)
    }
    val first = standings.firstOrNull { it.gate.evidencedBy != "gates" && it.state != GateState.PASSED && it.state != GateState.NOT_CHECKED }
    if (first != null) return when (first.state) {
        GateState.FAILED -> finish(first.gate, GateOutcome.FAILED, first.gate.failRule)
        GateState.HELD -> finish(first.gate, GateOutcome.HELD, vettingGateRules.lapse)
        else -> finish(first.gate, GateOutcome.IN_PROGRESS, null)
    }
    val activate = standings.first { it.gate.evidencedBy == "gates" }.gate
    if (subject.declined) return finish(activate, GateOutcome.DECLINED, subject.declinedReason ?: vettingGateRules.declined)
    if (subject.suspended) return finish(activate, GateOutcome.SUSPENDED, subject.suspendedReason ?: vettingGateRules.suspended)
    standings = standings.map { if (it.gate.id == activate.id) it.copy(state = GateState.PASSED) else it }
    return finish(activate, GateOutcome.ACTIVATED, null)
}

/* ---- The blocking matrix ---------------------------------------------------------------------
   This is the whole point of the module: not a list of documents, but a refusal with a reason
   attached to it that other screens can ask about before they offer an action. */
data class VettingDecision(val allowed: Boolean, val reason: String?, val blockedBy: List<VettingCheck>)
/* Role names are written for people, so “Internal admin staff” is plural and “Employer” takes “an”.
   A refusal that reads “A internal admin staff is never granted this” is a refusal nobody trusts.
   The name is used as written: lowercasing it would turn “Thuso Corner site” into “thuso corner
   site”, and a refusal that misspells the reader's own role is not trusted either. */
fun neverGranted(role: VettingRole?): String {
    if (role == null) return "This party is never granted that."
    if (role.name.endsWith("staff", ignoreCase = true)) return "${role.name} are never granted this."
    val article = if (role.name.firstOrNull()?.uppercaseChar() in listOf('A', 'E', 'I', 'O', 'U')) "An" else "A"
    return "$article ${role.name} is never granted this."
}
fun can(subject: VettingSubject, capabilityId: String): VettingDecision {
    val role = vettingRoleById(subject.roleId)
    val grant = role?.grants?.firstOrNull { it.capability == capabilityId }
        ?: return VettingDecision(false, neverGranted(role), emptyList())
    val summary = summarise(subject)
    if (subject.declined) return VettingDecision(false, subject.declinedReason ?: grant.refusal, summary.blocking)
    if (subject.suspended) return VettingDecision(false, subject.suspendedReason ?: grant.refusal, summary.blocking)
    if (summary.lapsed.isNotEmpty())
        return VettingDecision(false, "${summary.lapsed.joinToString(" and ") { it.name }} lapsed. ${grant.refusal}", summary.lapsed)
    if (summary.awaitingSecond.isNotEmpty())
        return VettingDecision(false, "${summary.awaitingSecond.joinToString(" and ") { it.name }} still needs a second reviewer. ${grant.refusal}", summary.awaitingSecond)
    if (summary.blocking.isNotEmpty()) return VettingDecision(false, grant.refusal, summary.blocking)
    return VettingDecision(true, null, emptyList())
}
data class CapabilityDecision(val capability: VettingCapability, val grant: VettingGrant, val decision: VettingDecision)
fun capabilityDecisions(subject: VettingSubject): List<CapabilityDecision> =
    vettingRoleById(subject.roleId)?.grants.orEmpty().mapNotNull { grant ->
        vettingCapabilityById(grant.capability)?.let { CapabilityDecision(it, grant, can(subject, grant.capability)) }
    }

/* Countdown wording, kept beside the arithmetic so a screen cannot say “renews soon” about a date
   that has already gone. */
fun expiryWording(record: CheckRecord): String {
    val days = daysUntil(record.expiresOn) ?: return "This check does not expire"
    val date = formatVettingDate(record.expiresOn)
    return when {
        days < 0 -> "Lapsed ${-days} day${if (days == -1L) "" else "s"} ago · $date"
        days == 0L -> "Renews today · $date"
        else -> "Renews in $days day${if (days == 1L) "" else "s"} · $date"
    }
}

/* ---- Scope of practice ------------------------------------------------------------------------
   Only some parties have one. A courier has no scope of practice, and inventing a set of chips for
   one would be design for its own sake. */
/* Scope of practice is part of the gate, not decoration: a nurse is only ever dispatched inside it,
   and a laboratory only offers what its accreditation schedule covers. It is held in
   packages/catalog/vetting.json with everything else, because three apps offering three different
   scope lists is the same drift as three reference ranges, and harder to notice. */
data class ScopeOfPractice(val title: String, val detail: String, val options: List<String>)
fun scopeFor(roleId: String): ScopeOfPractice? = vettingScopes[roleId]

/* ---- Declarations -----------------------------------------------------------------------------
   The undertaking is written in the first person and says what the party gives up, not what
   MyThuso gains. Each role is asked for the one that matters to the people it can reach. */
fun declarationsFor(roleId: String): List<String> {
    val role = vettingRoleById(roleId)
    val shared = listOf(
        "I confirm that everything above is true, and I will report any change to my registration, clearance or cover within seven days.",
        "I have read the confidentiality undertaking. I accept that a breach ends my access immediately, and that MyThuso must report it."
    )
    val specific = when (roleId) {
        "nurse", "locum" -> listOf("I will work only inside my registered scope of practice, and I will refuse a visit that falls outside it.")
        "doctor" -> listOf("I will not sign a clinical decision, or prescribe, while my registration, prescribing authority or indemnity cover is not current.")
        "pharmacy" -> listOf("We will not dispense from these premises without a responsible pharmacist on the register and on duty.")
        "laboratory" -> listOf("We will not release a result for a test that is not on our schedule of accreditation, and held results stay held.")
        "courier" -> listOf("I will not open a sealed sample or leave one unattended, and I accept that an address on my list is special personal information.")
        "operator" -> listOf("I will not open a clinical record. Dispatch needs an address and a service, and nothing more than that.")
        "admin" -> listOf("I will hold the least privilege that lets me do my job, and I will not decide a vetting case I am connected to.")
        "employer" -> listOf("We accept aggregate figures only. We will never ask for, and will never be given, a named employee’s result.")
        "sponsor" -> listOf("I accept that paying for someone’s care gives me no access to their record, in any circumstance.")
        "guardian" -> listOf("I accept that guardian access is limited in scope and in duration, and that some entries stay hidden under every scope.")
        "corner" -> listOf("The site will not receive a patient while the inspection, the waste contract or an attendant’s own vetting is out of date.")
        else -> emptyList()
    }
    val refusals = role?.grants.orEmpty().map { "I understand: ${it.refusal}" }
    return shared + specific + refusals
}

/* ---- An append-only decision log --------------------------------------------------------------
   docs/PRIVACY-AND-SECURITY.md lists an append-only audit as not built. This is the design of one:
   entries are only ever added, so nothing in this UI can quietly rewrite a decision already taken. */
enum class VettingEventKind(val id: String, val label: String) {
    SUBMITTED("submitted", "Evidence submitted"), VERIFIED("verified", "Check verified"), SECONDED("seconded", "Second reviewer agreed"),
    DECLINED("declined", "Declined"), SUSPENDED("suspended", "Suspended"), RESTORED("restored", "Restored"),
    APPEALED("appealed", "Appeal lodged"), RENEWED("renewed", "Renewed"), LAPSED("lapsed", "Lapsed automatically")
}
data class VettingEvent(
    val id: String, val at: LocalDateTime, val subjectId: String, val subjectName: String, val roleId: String,
    val checkId: String?, val kind: VettingEventKind, val actor: String, val evidence: String? = null, val note: String? = null
)

/* ---- Fictional parties, one per interesting state ---------------------------------------------
   Nobody here is real and no credential here is valid anywhere. The dates are relative, and a
   verified check carries a real decision date and a real expiry, so every countdown on screen is
   arithmetic rather than a label somebody typed. */
val vettingReviewers = listOf("M. Sithole · Clinical Governance", "T. van Wyk · Compliance", "P. Mabaso · Clinical Director")

private data class Override(
    val state: CheckState? = null, val expiresOn: LocalDate? = null,
    val note: String? = null, val clearSecond: Boolean = false
)
/* The decision date is held against the check's own cadence. Spreading every decision four to eight
   months back reads well until it meets a check that renews every six: an access role decided eight
   months ago is lapsed the moment it is written, and a fixture that suspends the reviewers by
   accident makes the console impossible to demonstrate. A check is decided at most two fifths of the
   way through its own cycle. */
private fun defaultRecord(roleId: String, checkId: String, index: Int): CheckRecord {
    val check = vettingCheckById(roleId, checkId)!!
    val spread = 4 + index % 5
    val age = check.renewMonths?.let { minOf(spread, maxOf(1, (it * 0.4).toInt())) } ?: spread
    val decidedOn = inMonths(-age)
    var record = CheckRecord(
        checkId, CheckState.VERIFIED, decidedOn = decidedOn,
        decidedBy = vettingReviewers[index % vettingReviewers.size], evidence = check.evidence
    )
    if (check.renewMonths != null) record = record.copy(expiresOn = decidedOn.plusMonths(check.renewMonths.toLong()))
    if (check.risk == "high") record = record.copy(secondedBy = vettingReviewers[(index + 1) % vettingReviewers.size])
    return record
}
private fun build(
    id: String, name: String, roleId: String, reference: String, zone: String? = null, scope: List<String> = emptyList(),
    suspended: Boolean = false, suspendedReason: String? = null, declined: Boolean = false, declinedReason: String? = null,
    appealed: Boolean = false, overrides: Map<String, Override> = emptyMap()
): VettingSubject {
    val records = vettingRoleById(roleId)?.checks.orEmpty().mapIndexed { position, check ->
        val base = defaultRecord(roleId, check.id, position + id.length)
        val override = overrides[check.id] ?: return@mapIndexed base
        /* An override that only says “outstanding” must not keep the decision fields of a check
           nobody has decided. */
        val start = if (override.state != null && override.state != CheckState.VERIFIED)
            CheckRecord(check.id, override.state) else base
        start.copy(
            state = override.state ?: start.state,
            expiresOn = override.expiresOn ?: start.expiresOn,
            note = override.note ?: start.note,
            secondedBy = if (override.clearSecond) null else start.secondedBy
        )
    }
    return VettingSubject(id, name, roleId, reference, zone, scope, records, suspended, suspendedReason, declined, declinedReason, appealed)
}

val seededSubjects: List<VettingSubject> = listOf(
    build("N-201", "Sister Thandeka Zulu", "nurse", "SANC 20014477", "Soweto", listOf("Chronic care", "Wound care"),
        overrides = mapOf("police-clearance" to Override(CheckState.VERIFIED, expiresOn = inDays(21)))),             // renewal due, still dispatchable
    build("N-202", "Sister Boitumelo Nkosi", "nurse", "SANC 20019902", "Randburg", listOf("Maternal & child"),
        overrides = mapOf("police-clearance" to Override(CheckState.IN_REVIEW), "references" to Override(CheckState.SUBMITTED),
            "kit-training" to Override(CheckState.OUTSTANDING), "popia-training" to Override(CheckState.OUTSTANDING))),
    build("N-203", "Brother Lwazi Mahlangu", "nurse", "SANC 20007731", "Tembisa", listOf("Post-operative", "Phlebotomy"),
        overrides = mapOf("sanc-registration" to Override(clearSecond = true), "kit-training" to Override(CheckState.IN_REVIEW))),   // waiting on a second reviewer
    build("N-204", "Sister Ayanda Dube", "nurse", "SANC 20022145", "Soweto", listOf("Elderly care"),
        overrides = mapOf("police-clearance" to Override(CheckState.VERIFIED, expiresOn = inDays(-9)))),             // lapsed: suspended automatically
    build("N-205", "Sister Naledi Mokoena", "nurse", "SANC 20016688", "Rosebank", listOf("Wound care", "Chronic care")),
    build("N-206", "Sister Palesa Khumalo", "nurse", "SANC 20011203", "Soweto", listOf("Wound care", "Maternal & child")),
    build("N-207", "Sister Refilwe Sithole", "nurse", "SANC 20018844", "Randburg", listOf("Chronic care", "Paediatric")),
    build("N-208", "Brother Sipho Ndlovu", "nurse", "SANC 20013390", "Melville", listOf("Post-operative", "Chronic care"),
        overrides = mapOf("indemnity" to Override(CheckState.VERIFIED, expiresOn = inDays(33)))),
    build("N-209", "Sister Zanele Mkhize", "nurse", "SANC 20024401", "Alexandra", listOf("Chronic care"),
        declined = true, declinedReason = "Two clinical references could not be confirmed with the institutions named.", appealed = true,
        overrides = mapOf("references" to Override(CheckState.DECLINED, note = "Referee could not confirm the applicant worked in the unit stated."))),
    build("L-301", "Sister Karabo Mothibi", "locum", "SANC 20016688", "Roodepoort", listOf("Chronic care", "Paediatric")),
    build("L-302", "Sister Nokuthula Baloyi", "locum", "SANC 20026117", "Midrand", listOf("Wound care"),
        overrides = mapOf("shift-eligibility" to Override(CheckState.IN_REVIEW, note = "Declared 44 hours a week elsewhere. Clinical Director reviewing."))),
    build("D-401", "Dr Ayanda Dlamini", "doctor", "HPCSA MP0483217", scope = listOf("General practice", "Telemedicine")),
    build("D-402", "Dr Sanjay Naidoo", "doctor", "HPCSA MP0559104", scope = listOf("General practice"),
        overrides = mapOf("hpcsa-registration" to Override(CheckState.VERIFIED, expiresOn = inDays(-4)))),           // lapsed: the queue refuses the signature
    build("D-403", "Dr Lerato Khumalo", "doctor", "HPCSA MP0612885", scope = listOf("Family medicine"),
        overrides = mapOf("prescribing-authority" to Override(CheckState.IN_REVIEW), "cpd" to Override(CheckState.SUBMITTED))),
    build("P-501", "Rosebank Community Pharmacy", "pharmacy", "SAPC Y041882", "Rosebank"),
    build("P-502", "Diepkloof Family Pharmacy", "pharmacy", "SAPC Y058317", "Soweto",
        overrides = mapOf("responsible-pharmacist" to Override(CheckState.IN_REVIEW, note = "Named pharmacist resigned. A replacement has been proposed."),
            "cold-chain" to Override(CheckState.SUBMITTED))),
    build("B-601", "Highveld Pathology", "laboratory", "SANAS M0521", "Parktown"),
    build("B-602", "Vaal Diagnostics", "laboratory", "SANAS M0744", "Vereeniging",
        overrides = mapOf("iso-15189" to Override(CheckState.VERIFIED, expiresOn = inDays(-31)))),                   // lapsed: results stay held
    build("C-701", "Mandla Nkuna", "courier", "PDP 401220118834", "Johannesburg"),
    build("C-702", "Johannes Pretorius", "courier", "PDP 401993220117", "Ekurhuleni",
        overrides = mapOf("cold-chain-training" to Override(CheckState.OUTSTANDING), "vehicle" to Override(CheckState.IN_REVIEW))),
    build("O-801", "Kagiso Molefe", "operator", "Staff 0114", "Control Tower"),
    build("O-802", "Michelle Fourie", "operator", "Staff 0139", "Control Tower",
        overrides = mapOf("escalation-training" to Override(CheckState.VERIFIED, expiresOn = inDays(12)))),
    build("A-901", "Thandi van Wyk", "admin", "Staff 0102"),
    build("A-902", "Bongani Mthembu", "admin", "Staff 0147",
        overrides = mapOf("access-role" to Override(CheckState.IN_REVIEW, note = "Requested access to the clinical queue. Least privilege being reassessed."))),
    build("E-011", "Ubuntu Logistics (Pty) Ltd", "employer", "CIPC 2019/443871/07",
        overrides = mapOf("operator-agreement" to Override(CheckState.IN_REVIEW), "aggregate-only" to Override(CheckState.SUBMITTED))),
    build("E-012", "Highveld Mining Services", "employer", "CIPC 2014/118203/07"),
    build("S-021", "Themba Molefe", "sponsor", "Sponsor 0231",
        overrides = mapOf("recipient-consent" to Override(CheckState.IN_REVIEW, note = "Waiting for the recipient to confirm in their own account."))),
    build("S-022", "Zodwa Radebe", "sponsor", "Sponsor 0244"),
    build("G-031", "Nomsa Molefe", "guardian", "Guardian 0118",
        overrides = mapOf("legal-authority" to Override(CheckState.SUBMITTED, note = "Unabridged birth certificate uploaded; awaiting document check."),
            "relationship" to Override(CheckState.OUTSTANDING))),
    build("G-032", "Elizabeth Sithole", "guardian", "Guardian 0126"),
    build("T-041", "Thuso Corner · Diepkloof", "corner", "Site 0007", "Soweto"),
    build("T-042", "Thuso Corner · Ivory Park", "corner", "Site 0011", "Tembisa",
        overrides = mapOf("privacy-layout" to Override(CheckState.DECLINED, note = "The consulting room opens onto the queue. Re-inspection after alterations."),
            "waste-disposal" to Override(CheckState.SUBMITTED)))
)

/* A short history, so the audit view has something to show on open. The two lapses at the top were
   not decided by anybody: they are what the expiry arithmetic did on its own. */
private val chronologicalSeed = listOf(
    VettingEvent("", inDays(-31).atTime(4, 0), "B-602", "Vaal Diagnostics", "laboratory", "iso-15189", VettingEventKind.LAPSED,
        "System · scheduled re-vetting", note = "SANAS accreditation expired. Result release withdrawn; held results stay held."),
    VettingEvent("", inDays(-16).atTime(9, 24), "N-209", "Sister Zanele Mkhize", "nurse", "references", VettingEventKind.DECLINED,
        "P. Mabaso · Clinical Director", "Two named referees", "Referee could not confirm the applicant worked in the unit stated."),
    VettingEvent("", inDays(-11).atTime(15, 2), "N-209", "Sister Zanele Mkhize", "nurse", null, VettingEventKind.APPEALED,
        "Sister Zanele Mkhize", note = "Applicant states the unit was renamed. New referee details supplied."),
    VettingEvent("", inDays(-9).atTime(4, 0), "N-204", "Sister Ayanda Dube", "nurse", "police-clearance", VettingEventKind.LAPSED,
        "System · scheduled re-vetting", note = "SAPS clearance passed its renewal date. Removed from dispatch automatically."),
    VettingEvent("", inDays(-6).atTime(11, 40), "T-042", "Thuso Corner · Ivory Park", "corner", "privacy-layout", VettingEventKind.DECLINED,
        "T. van Wyk · Compliance", "Floor plan and inspection sign-off", "The consulting room opens onto the queue. Re-inspection after alterations."),
    VettingEvent("", inDays(-4).atTime(4, 0), "D-402", "Dr Sanjay Naidoo", "doctor", "hpcsa-registration", VettingEventKind.LAPSED,
        "System · scheduled re-vetting", note = "HPCSA registration not renewed. Sign-off withdrawn."),
    VettingEvent("", inDays(-3).atTime(8, 15), "N-201", "Sister Thandeka Zulu", "nurse", "sanc-registration", VettingEventKind.SECONDED,
        "M. Sithole · Clinical Governance", note = "Second reviewer agreed. Registration current on the SANC register.")
)
val seededLog: List<VettingEvent> = chronologicalSeed
    .mapIndexed { index, event -> event.copy(id = "VE-%05d".format(index + 1)) }
    .reversed()

data class RenewalDue(val subject: VettingSubject, val check: VettingCheck, val record: CheckRecord, val days: Long)

/**
 * Vetting state for the preview. Decisions change the record and are appended to the log; nothing
 * is ever edited in place, because an audit that can be rewritten is not an audit.
 */
class VettingStore {
    val subjects = mutableStateListOf<VettingSubject>().also { it.addAll(seededSubjects) }
    val log = mutableStateListOf<VettingEvent>().also { it.addAll(seededLog) }
    /* Who you are acting as. It is a picker rather than a sign-in because the second-reviewer rule
       is only demonstrable if the demo can be two different people. */
    var reviewer by mutableStateOf(vettingReviewers[0])
    private var sequence = seededLog.size
    private var applications = 0

    fun subject(id: String): VettingSubject? = subjects.firstOrNull { it.id == id }
    fun byRole(roleId: String): List<VettingSubject> = subjects.filter { it.roleId == roleId }
    /* The named nurses the dispatch board and the clinical queue already use, so gating there reads
       the same record the pipeline decides on rather than a second list that agrees by luck. */
    fun byName(name: String): VettingSubject? = subjects.firstOrNull { it.name == name }

    private fun append(subject: VettingSubject, checkId: String?, kind: VettingEventKind, actor: String, evidence: String? = null, note: String? = null) {
        sequence += 1
        log.add(0, VettingEvent("VE-%05d".format(sequence), LocalDateTime.now(), subject.id, subject.name, subject.roleId, checkId, kind, actor, evidence, note))
    }
    private fun edit(subjectId: String, change: (VettingSubject) -> VettingSubject) {
        val index = subjects.indexOfFirst { it.id == subjectId }
        if (index >= 0) subjects[index] = change(subjects[index])
    }
    private fun editRecord(subjectId: String, checkId: String, change: (CheckRecord) -> CheckRecord) =
        edit(subjectId) { subject ->
            val existing = recordFor(subject, checkId)
            subject.copy(records = subject.records.filter { it.checkId != checkId } + change(existing))
        }

    fun submitEvidence(subjectId: String, checkId: String, actor: String) {
        val subject = subject(subjectId) ?: return
        val check = vettingCheckById(subject.roleId, checkId) ?: return
        editRecord(subjectId, checkId) { it.copy(state = CheckState.SUBMITTED, evidence = check.evidence, note = null) }
        append(subject, checkId, VettingEventKind.SUBMITTED, actor, check.evidence)
    }
    /** Verifying restarts the clock — and clears any second reviewer, because a new decision needs a new second. */
    fun verify(subjectId: String, checkId: String, renewal: Boolean = false) {
        val subject = subject(subjectId) ?: return
        val check = vettingCheckById(subject.roleId, checkId) ?: return
        val decidedOn = vettingToday()
        editRecord(subjectId, checkId) {
            it.copy(
                state = CheckState.VERIFIED, decidedOn = decidedOn,
                expiresOn = check.renewMonths?.let { months -> decidedOn.plusMonths(months.toLong()) },
                decidedBy = reviewer, secondedBy = null, evidence = check.evidence, note = null
            )
        }
        append(subject, checkId, if (renewal) VettingEventKind.RENEWED else VettingEventKind.VERIFIED, reviewer, check.evidence)
    }
    /** A second reviewer has to be a different person. The same signature twice is one signature. */
    fun second(subjectId: String, checkId: String): Boolean {
        val subject = subject(subjectId) ?: return false
        if (recordFor(subject, checkId).decidedBy == reviewer) return false
        editRecord(subjectId, checkId) { it.copy(secondedBy = reviewer) }
        append(subject, checkId, VettingEventKind.SECONDED, reviewer, note = "Second reviewer agreed.")
        return true
    }
    fun decline(subjectId: String, checkId: String, note: String) {
        val subject = subject(subjectId) ?: return
        editRecord(subjectId, checkId) { it.copy(state = CheckState.DECLINED, decidedOn = vettingToday(), decidedBy = reviewer, secondedBy = null, note = note) }
        append(subject, checkId, VettingEventKind.DECLINED, reviewer, note = note)
    }
    /** Upholding an appeal lifts the decline on the party. The declined check still has to be re-decided. */
    fun restore(subjectId: String, note: String) {
        val subject = subject(subjectId) ?: return
        edit(subjectId) { it.copy(declined = false, declinedReason = null, suspended = false, suspendedReason = null) }
        append(subject, null, VettingEventKind.RESTORED, reviewer, note = note)
    }
    fun suspend(subjectId: String, note: String) {
        val subject = subject(subjectId) ?: return
        edit(subjectId) { it.copy(suspended = true, suspendedReason = note) }
        append(subject, null, VettingEventKind.SUSPENDED, reviewer, note = note)
    }

    /** The applicant flow ends here: a real party in the pipeline, with only what was actually attached. */
    fun startApplication(roleId: String, name: String, reference: String, scope: List<String>, attached: Set<String>): VettingSubject {
        applications += 1
        val prefix = roleId.take(2).uppercase()
        val id = "$prefix-%03d".format(900 + applications)
        val records = vettingRoleById(roleId)?.checks.orEmpty().map { check ->
            if (check.id in attached) CheckRecord(check.id, CheckState.SUBMITTED, evidence = check.evidence)
            else CheckRecord(check.id, CheckState.OUTSTANDING)
        }
        val subject = VettingSubject(id, name, roleId, reference, scope = scope, records = records)
        subjects.add(0, subject)
        append(subject, null, VettingEventKind.SUBMITTED, name, note = "${attached.size} of ${records.size} checks have evidence attached. Nothing was transmitted.")
        return subject
    }

    /** Renewals, soonest first — the only order a re-vetting queue can sensibly be worked in. */
    fun renewalsDue(withinDays: Long = 120): List<RenewalDue> = subjects.flatMap { subject ->
        vettingRoleById(subject.roleId)?.checks.orEmpty().mapNotNull { check ->
            val record = recordFor(subject, check.id)
            val days = daysUntil(record.expiresOn) ?: return@mapNotNull null
            if (record.state != CheckState.VERIFIED || days > withinDays) null else RenewalDue(subject, check, record, days)
        }
    }.sortedBy { it.days }
}
