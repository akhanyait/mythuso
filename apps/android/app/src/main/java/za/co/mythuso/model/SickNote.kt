package za.co.mythuso.model

import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/*
 * The doctor's medical certificate (2 October 2026): the types and the arithmetic, by hand, beside the
 * generated SickNoteData.kt that holds every sentence, limit and consultation from
 * packages/catalog/sick-note.json.
 *
 * The rules are the web's lib/sick-note.ts, in the same order and with the same sentences, because a
 * certificate is a legal document and a phone that backdated further than the web would be a phone
 * nobody decided should. No limit is typed here: how far back and how long are SickNoteData.Period's.
 * Who may sign is the vetting register's `can`, asked for the contract's capability, so a nurse is
 * refused with the sentence she already reads on her assessment and a doctor whose registration lapsed
 * with the register's own refusal.
 *
 * Days are offsets from today, never dates, so the preview's consultations never go stale. Nothing here
 * issues anything: the certificate this builds is what the patient would read, and the screen marks it
 * not issued in the contract's words.
 */

data class SickNoteFitness(val id: String, val label: String, val statement: String)
data class SickNoteConsultation(val reference: String, val patient: String, val kind: String, val nurse: String?, val dayOffset: Int, val time: String)
data class SickNoteDraft(
    val reference: String, val patient: String, val fromOffset: Int, val toOffset: Int,
    val fitness: String, val consent: Boolean, val description: String
) {
    val daysCovered: Int get() = toOffset - fromOffset + 1
}
data class SickNoteIssuer(val granted: Boolean, val allowed: Boolean, val reason: String, val name: String, val registration: String)
data class SickNoteRefusal(val id: String, val sentence: String)
data class SickNoteLine(val id: String, val label: String, val value: String)

object SickNote {
    private val dayFormat = DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.forLanguageTag("en-ZA"))

    fun consultation(reference: String): SickNoteConsultation? =
        SickNoteData.consultations.firstOrNull { it.reference == reference.trim() }

    /* The rule 16(1)(f) proviso is where a draft starts: unfit for duty, and nothing described. */
    fun draft(reference: String, patient: String): SickNoteDraft {
        val from = minOf(consultation(reference)?.dayOffset ?: 0, 0)
        return SickNoteDraft(reference, patient, from, from + SickNoteData.Period.defaultDays - 1, "unfit", false, "")
    }

    /* The register decides, through the same `can` every other screen asks. Granted and allowed are kept
       apart because they are two refusals: a nurse is never granted it; a lapsed doctor holds it. */
    fun issuer(subject: VettingSubject?): SickNoteIssuer {
        if (subject == null) return SickNoteIssuer(false, false, SickNoteData.notADoctor, "", "")
        val granted = vettingRoleById(subject.roleId)?.grants.orEmpty().any { it.capability == SickNoteData.capability }
        val decision = can(subject, SickNoteData.capability)
        return SickNoteIssuer(granted, decision.allowed, decision.reason.orEmpty(), subject.name, subject.reference)
    }

    private fun sentence(id: String, days: Int? = null): String {
        val words = SickNoteData.refusals[id].orEmpty()
        return if (days == null) words else words.replace("{days}", days.toString())
    }

    /* Every rule, in the web's order, all at once rather than the first: a doctor told one reason at a
       time fixes the form three times. */
    fun refusals(draft: SickNoteDraft, issuer: SickNoteIssuer): List<SickNoteRefusal> {
        val out = mutableListOf<SickNoteRefusal>()
        fun refuse(id: String, words: String = sentence(id)) { out += SickNoteRefusal(id, words) }
        val seen = consultation(draft.reference)
        if (seen == null) refuse("no-consultation")
        else {
            if (seen.kind != "home-visit") refuse("from-a-call")
            if (seen.dayOffset > 0) refuse("not-yet-seen")
            if (seen.patient != draft.patient.trim()) refuse("not-this-patient")
        }
        if (!issuer.granted) refuse("not-a-doctor")
        else if (!issuer.allowed) refuse("registration", issuer.reason)
        if (draft.toOffset < draft.fromOffset) refuse("period-backwards")
        if (draft.fromOffset > 0) refuse("starts-after-issue")
        if (seen != null && seen.dayOffset - draft.fromOffset > SickNoteData.Period.backdateDays)
            refuse("backdated-too-far", sentence("backdated-too-far", SickNoteData.Period.backdateDays))
        if (draft.daysCovered > SickNoteData.Period.maxDays)
            refuse("period-too-long", sentence("period-too-long", SickNoteData.Period.maxDays))
        val described = draft.description.isNotBlank()
        if (described && !draft.consent) refuse("diagnosis-without-consent")
        if (draft.consent && !described) refuse("consent-without-description")
        return out
    }

    /* Rule 16(1)(j): initials and surname in block letters. "Dr Ayanda Dlamini" is "A. DLAMINI". */
    fun blockLetters(name: String): String {
        val words = name.trim().split(Regex("\\s+")).toMutableList()
        if (words.firstOrNull()?.lowercase() in listOf("dr", "dr.", "sister", "sr", "prof")) words.removeAt(0)
        val surname = words.removeLastOrNull().orEmpty()
        return (words.map { "${it.take(1).uppercase()}." } + surname.uppercase()).joinToString(" ")
    }

    fun day(offset: Int): String = LocalDate.now().plusDays(offset.toLong()).format(dayFormat)

    private fun label(id: String) = SickNoteData.labels[id] ?: id

    /* Rule 16's items in rule 16's order, as the patient would read them. What the register does not hold
       is printed as not held; the identity and employment numbers are never carried at all. */
    fun certificate(draft: SickNoteDraft, issuer: SickNoteIssuer): List<SickNoteLine> {
        val seen = consultation(draft.reference)
        val fitness = SickNoteData.fitness.firstOrNull { it.id == draft.fitness } ?: SickNoteData.fitness.first()
        val backdated = seen != null && draft.fromOffset < seen.dayOffset
        val basis = (listOf(SickNoteData.Basis.homeVisit) + if (backdated) listOf(SickNoteData.Basis.backdated) else emptyList()).joinToString(" ")
        val description = if (draft.consent && draft.description.isNotBlank()) draft.description.trim() else SickNoteData.Diagnosis.withheld
        return listOf(
            SickNoteLine("practitioner", label("practitioner"), issuer.name),
            SickNoteLine("registration", label("registration"), issuer.registration),
            SickNoteLine("qualification", label("qualification"), SickNoteData.notHeld),
            SickNoteLine("practiceNumber", label("practiceNumber"), SickNoteData.notHeld),
            SickNoteLine("practiceAddress", label("practiceAddress"), SickNoteData.notHeld),
            SickNoteLine("patient", label("patient"), draft.patient),
            SickNoteLine("consultation", label("consultation"), seen?.let { "${it.reference} · ${day(it.dayOffset)} at ${it.time}" } ?: draft.reference),
            SickNoteLine("basis", label("basis"), basis),
            SickNoteLine("statement", label("statement"), fitness.statement),
            SickNoteLine("description", SickNoteData.Diagnosis.descriptionLabel, description),
            SickNoteLine("period", label("period"), "${day(draft.fromOffset)} to ${day(draft.toOffset)} · ${draft.daysCovered} ${SickNoteData.Screen.daysLabel}"),
            SickNoteLine("issued", label("issued"), day(0)),
            SickNoteLine("signature", label("signature"), "${blockLetters(issuer.name)} · ${SickNoteData.Screen.unsigned}")
        )
    }
}
