package za.co.mythuso.model

import java.security.SecureRandom
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.Period
import java.time.format.DateTimeFormatter

/*
 * A household is the one screen whose whole purpose is showing several people's health at once,
 * which makes it the easiest place in the product to undo everything the guardian flow promises.
 * packages/catalog/records.json says it plainly — “Membership is not consent: each member's record
 * stays their own” — so the rule here is that living at one address grants nothing at all. Every
 * clinical line on this screen is asked for twice: once of the vetting module (may this party ever
 * hold this capability?) and once of the record itself (has this person granted it, to whom, for
 * how long?). A yes to one is not a yes.
 *
 * The health summary lives here too, because it is the same question read from the other side: not
 * “what may this viewer reach” but “what may this person hand over, to whom, and for how long”.
 *
 * Fictional household, fictional scheme, fictional numbers. Nothing is stored or sent.
 */

/* ---- The people --------------------------------------------------------------------------- */
data class RestrictedEntry(val category: String, val detail: String)
data class ImmunisationDue(val vaccine: String, val due: LocalDate)
data class CollectionDue(val medicine: String, val ready: LocalDate, val pharmacy: String)
data class LastConsultation(val on: LocalDate, val with: String, val about: String)
data class HouseholdVitals(val bp: String, val weight: String, val on: LocalDate)
data class HouseholdMember(
    val id: String, val name: String, val relation: String, val born: LocalDate,
    val reference: String, val dependant: String,
    val bloodGroup: String, val allergies: List<String>, val conditions: List<String>, val medication: List<String>,
    val lastConsultation: LastConsultation, val emergencyContact: String,
    val vitals: HouseholdVitals, val careTeam: List<String>,
    val immunisations: List<ImmunisationDue> = emptyList(),
    val collections: List<CollectionDue> = emptyList(),
    /* Protected entries are held here with their detail so the export guard below has something
       real to fail on. Nothing renders them but the person's own view, and no artefact carries
       them. */
    val restricted: List<RestrictedEntry> = emptyList()
)
data class HouseholdScheme(val name: String, val plan: String, val membership: String, val principal: String)
data class Household(
    val id: String, val name: String, val area: String,
    val scheme: HouseholdScheme, val members: List<HouseholdMember>
)

val mokoenaHousehold = Household(
    "HH-0184", "Mokoena Household", "Rosebank, Johannesburg",
    HouseholdScheme("Motswedi Medical Scheme", "Family Option", "MMS 4417 883", "thando"),
    listOf(
        HouseholdMember(
            "thando", "Thando Mokoena", "Mother", LocalDate.parse("1987-05-14"), "THU-0001842", "00",
            "O positive", listOf("Penicillin — rash and facial swelling, 2016"),
            listOf("Hypertension, diagnosed 2021, managed at home"),
            listOf("Amlodipine 5 mg, once daily, morning"),
            LastConsultation(inDays(-11), "Dr Ayanda Dlamini · HPCSA MP0483217", "Blood-pressure review"),
            "Nomsa Mokoena · Mother · 071 000 0000",
            HouseholdVitals("136/84 mmHg", "74.2 kg", inDays(-11)),
            listOf("Sister Palesa Khumalo · SANC 20011203", "Dr Ayanda Dlamini · HPCSA MP0483217"),
            listOf(ImmunisationDue("Influenza, annual", inDays(24))),
            listOf(CollectionDue("Amlodipine 5 mg · 3 months", inDays(3), "Rosebank community pharmacy")),
            listOf(
                RestrictedEntry("Sexual and reproductive health", "Contraceptive implant inserted 2025, review 2028"),
                RestrictedEntry("Social support", "Referred to a social worker after the 2024 retrenchment")
            )
        ),
        HouseholdMember(
            "sipho", "Sipho Mokoena", "Father", LocalDate.parse("1984-02-02"), "THU-0001843", "01",
            "A positive", listOf("None recorded"), listOf("Type 2 diabetes, diagnosed 2019"),
            listOf("Metformin 850 mg, twice daily"),
            LastConsultation(inDays(-38), "Dr Ayanda Dlamini · HPCSA MP0483217", "Six-month diabetic review"),
            "Thando Mokoena · Wife · 071 000 0000",
            HouseholdVitals("128/80 mmHg", "88.6 kg", inDays(-38)),
            listOf("Dr Ayanda Dlamini · HPCSA MP0483217"),
            collections = listOf(CollectionDue("Metformin 850 mg · 3 months", inDays(9), "Rosebank community pharmacy"))
        ),
        HouseholdMember(
            "lebo", "Lebo Mokoena", "Child", LocalDate.parse("2018-03-03"), "THU-0001844", "02",
            "O positive", listOf("None recorded"), listOf("Mild asthma, reliever inhaler as needed"),
            listOf("Salbutamol inhaler, as needed"),
            LastConsultation(inDays(-64), "Sister Palesa Khumalo · SANC 20011203", "Winter chest check"),
            "Thando Mokoena · Mother · 071 000 0000",
            HouseholdVitals("Not taken", "26.4 kg", inDays(-64)),
            listOf("Sister Palesa Khumalo · SANC 20011203"),
            listOf(ImmunisationDue("Td booster, school age", inDays(41)))
        ),
        HouseholdMember(
            "amahle", "Amahle Mokoena", "Child", LocalDate.parse("2009-09-21"), "THU-0001845", "03",
            "B positive", listOf("None recorded"), listOf("None recorded"), listOf("None recorded"),
            LastConsultation(inDays(-27), "Sister Palesa Khumalo · SANC 20011203", "Recorded in her own account"),
            "Thando Mokoena · Mother · 071 000 0000",
            HouseholdVitals("112/70 mmHg", "54.1 kg", inDays(-27)),
            listOf("Sister Palesa Khumalo · SANC 20011203"),
            restricted = listOf(
                RestrictedEntry("Sexual and reproductive health", "HIV test with counselling, consented to on her own account")
            )
        )
    )
)
fun householdMemberById(id: String): HouseholdMember? = mokoenaHousehold.members.firstOrNull { it.id == id }
fun firstName(member: HouseholdMember): String = member.name.substringBefore(' ')

/* Ages are arithmetic on a birth date rather than a number somebody typed, so Amahle passes into
   adulthood — and out of every guardian grant below — on the day she actually does. */
fun ageOf(born: LocalDate): Int = Period.between(born, LocalDate.now()).years
/* The Children's Act lets a child of 12 consent to their own medical treatment, and to an HIV test
   with counselling. The design treats 12 as the age at which a record stops being automatically a
   parent's to open; a real product must also record the maturity assessment the Act asks for, and
   this preview does not pretend to make it. */
const val OWN_CONSENT_AGE = 12

/* ---- Who is looking ------------------------------------------------------------------------ */
enum class AccessLevel(val label: String) {
    NONE("No access"), ADMIN("Household admin only"), EMERGENCY("Emergency details only"),
    SUMMARY("Health summary"), CLINICAL("Full record"), SELF("Your own record")
}
fun atLeast(level: AccessLevel, floor: AccessLevel): Boolean = level.ordinal >= floor.ordinal

enum class GrantBasis { GUARDIAN, SHARED, VISIT }
data class HouseGrant(
    val memberId: String, val basis: GrantBasis, val asks: AccessLevel,
    val until: LocalDate, val period: String, val verified: Boolean
)
data class HouseholdViewer(
    val id: String, val name: String, val role: String,
    val memberId: String? = null, val subject: VettingSubject? = null,
    val grants: List<HouseGrant> = emptyList()
)

/* Two guardian records built here rather than borrowed, because the household needs guardians by
   these names. Every renewable check is given a real expiry, so nobody is verified forever. */
private fun householdGuardian(
    id: String, name: String, reference: String, overrides: Map<String, CheckRecord> = emptyMap()
): VettingSubject = VettingSubject(
    id, name, "guardian", reference,
    records = vettingRoleById("guardian")?.checks.orEmpty().map { check ->
        overrides[check.id] ?: CheckRecord(
            check.id, CheckState.VERIFIED, decidedOn = inMonths(-3), decidedBy = "T. van Wyk · Compliance",
            expiresOn = check.renewMonths?.let { inMonths(it - 3) },
            secondedBy = if (check.risk == "high") "M. Sithole · Clinical Governance" else null,
            evidence = check.evidence
        )
    }
)
private fun guardianOf(memberId: String, verified: Boolean = true) =
    HouseGrant(memberId, GrantBasis.GUARDIAN, AccessLevel.CLINICAL, inMonths(6), "Reviewed every six months", verified)
private fun visitTo(memberId: String) =
    HouseGrant(memberId, GrantBasis.VISIT, AccessLevel.CLINICAL, inDays(1), "Today’s visit only", true)

/**
 * The viewers are assembled against the live vetting store, so a clearance suspended in the Control
 * Tower closes this household a screen later rather than two lists agreeing by luck.
 */
fun householdViewers(vetting: VettingStore): List<HouseholdViewer> = listOf(
    HouseholdViewer(
        "v-thando", "Thando Mokoena", "Household organiser · you", memberId = "thando",
        subject = householdGuardian("G-101", "Thando Mokoena", "Guardian 0184"),
        grants = listOf(guardianOf("lebo"), guardianOf("amahle"))
    ),
    HouseholdViewer(
        "v-sipho", "Sipho Mokoena", "Household member", memberId = "sipho",
        subject = householdGuardian(
            "G-102", "Sipho Mokoena", "Guardian 0185",
            mapOf("legal-authority" to CheckRecord("legal-authority", CheckState.SUBMITTED,
                note = "Birth certificates uploaded; awaiting the document check."))
        ),
        grants = listOf(guardianOf("lebo"), guardianOf("amahle"))
    ),
    HouseholdViewer("v-amahle", "Amahle Mokoena", "Household member · ${ageOf(householdMemberById("amahle")!!.born)}", memberId = "amahle"),
    /* The nurse reaches Thando through today's visit and Sipho through a summary he handed over
       himself. Two different authorities, neither of them the household. */
    HouseholdViewer(
        "v-nurse", "Sister Palesa Khumalo", "Visiting nurse · vetting current", subject = vetting.subject("N-206"),
        grants = listOf(
            visitTo("thando"),
            HouseGrant("sipho", GrantBasis.SHARED, AccessLevel.SUMMARY, inDays(1), "Until this evening", true)
        )
    ),
    HouseholdViewer(
        "v-lapsed", "Sister Ayanda Dube", "Visiting nurse · clearance lapsed", subject = vetting.subject("N-204"),
        grants = listOf(visitTo("thando"))
    ),
    HouseholdViewer("v-sponsor", "Zodwa Radebe", "Care sponsor · pays for Thando’s visits", subject = vetting.subject("S-022"))
)

data class Visibility(val level: AccessLevel, val reason: String)
/* The whole rule, in one function, so no screen can quietly reach past it. Order matters: the
   household floor is administrative and never clinical; a grant is checked for life and for
   verification before it is checked for scope; the vetting module has the last word on anyone
   acting in a role; and a minor old enough to consent for themselves is not reachable through
   their parent at all. */
fun visibilityFor(viewer: HouseholdViewer, member: HouseholdMember): Visibility {
    if (viewer.memberId == member.id) return Visibility(AccessLevel.SELF, "Your own record, in full.")
    val floor = if (viewer.memberId != null) AccessLevel.ADMIN else AccessLevel.NONE
    val who = firstName(member)
    val grant = viewer.grants.firstOrNull { it.memberId == member.id }
        ?: return Visibility(floor, if (viewer.memberId != null)
            "$who has not given you access to their record. Sharing a household is not consent, and paying for care is not a permission."
        else "Nothing has been granted for this person, so nothing about them is shown here — not even that there is a record.")
    if ((daysUntil(grant.until) ?: 0L) < 0L) return Visibility(floor,
        "That access ended on ${formatVettingDate(grant.until)}. It does not renew by being asked for again; $who grants it.")
    if (!grant.verified) return Visibility(floor, "Identity verification is outstanding. An unverified invitation grants nothing.")
    if (grant.basis != GrantBasis.SHARED) {
        /* Acting in a role — guardian, nurse — means the vetting record decides, and it is resolved
           against its own expiry dates every time it is read rather than trusted as written down. */
        val subject = viewer.subject
            ?: return Visibility(floor, "No vetting record stands behind this claim, so it grants nothing.")
        val holds = can(subject, if (grant.basis == GrantBasis.GUARDIAN) "guardian-access" else "view-patient-summary")
        if (!holds.allowed) return Visibility(floor, holds.reason ?: "Refused.")
        val scoped = can(subject, "view-clinical-record")
        if (!scoped.allowed) return Visibility(floor, scoped.reason ?: "Refused.")
    }
    val age = ageOf(member.born)
    if (grant.basis == GrantBasis.GUARDIAN && age >= OWN_CONSENT_AGE && age < 18) return Visibility(AccessLevel.EMERGENCY,
        "$who is $age. From 12 a child may consent to their own medical treatment, and to an HIV test with counselling — " +
            "so this record is theirs to open, not yours. Blood group, allergies and one contact stay here because an " +
            "emergency cannot wait for a conversation; conditions, medicines and visits are released by $who from their own account.")
    return Visibility(grant.asks, when (grant.basis) {
        GrantBasis.VISIT -> "Open for ${grant.period.lowercase()}, because $who is expecting you. It closes on its own."
        GrantBasis.SHARED -> "$who shared this directly, ${grant.period.lowercase()}. Nobody had to be vetted for it: " +
            "the person it belongs to is the shortest route to it, and the easiest to withdraw."
        GrantBasis.GUARDIAN -> "Guardian access, ${grant.period.lowercase()}, until ${formatVettingDate(grant.until)}."
    })
}

/* ---- The household's own facts --------------------------------------------------------------- */
data class HouseholdAppointment(val id: String, val memberId: String, val on: LocalDate, val time: String, val service: String)
val householdAppointments = listOf(
    HouseholdAppointment("AP-9001", "thando", inDays(2), "09:00", "Vitals & chronic check"),
    HouseholdAppointment("AP-9002", "lebo", inDays(2), "10:30", "Childhood immunisation"),
    HouseholdAppointment("AP-9003", "amahle", inDays(5), "15:00", "Follow-up visit"),
    HouseholdAppointment("AP-9004", "sipho", inDays(12), "08:00", "Diabetic review")
)

/* ---- The health summary -----------------------------------------------------------------------
   packages/catalog/records.json defines this card: nine fields, and a rule that protected
   categories never appear but are never silently omitted either. Both halves matter. A clinician
   who reads a summary with no mention of mental health concludes there is nothing to know. */
data class SummaryField(val label: String, val value: String)
private val summaryFieldReaders: Map<String, (HouseholdMember) -> SummaryField> = mapOf(
    "patient" to { m -> SummaryField("Patient", "${m.name} · ${m.reference} · born ${formatVettingDate(m.born)}") },
    "bloodGroup" to { m -> SummaryField("Blood group", m.bloodGroup) },
    "allergies" to { m -> SummaryField("Allergies", m.allergies.joinToString("; ")) },
    "chronicConditions" to { m -> SummaryField("Chronic conditions", m.conditions.joinToString("; ")) },
    "currentMedication" to { m -> SummaryField("Current medication", m.medication.joinToString("; ")) },
    "lastConsultation" to { m ->
        SummaryField("Last consultation",
            "${formatVettingDate(m.lastConsultation.on)} · ${m.lastConsultation.with} · ${m.lastConsultation.about}")
    },
    "emergencyContact" to { m -> SummaryField("Emergency contact", m.emergencyContact) },
    "latestVitals" to { m -> SummaryField("Latest readings", "BP ${m.vitals.bp} · ${m.vitals.weight} · ${formatVettingDate(m.vitals.on)}") },
    "careTeam" to { m -> SummaryField("Care team", m.careTeam.joinToString("; ")) }
)
/* The contract's own order, filtered by the purpose rather than assembled by it, so a card cannot
   grow a field the contract does not have — nor quietly reorder one. */
fun summaryValues(member: HouseholdMember, fields: List<String>): List<SummaryField> =
    recordSummaryCard.fields.filter { it in fields }.mapNotNull { summaryFieldReaders[it]?.invoke(member) }
fun summaryFieldLabel(field: String, member: HouseholdMember): String? = summaryFieldReaders[field]?.invoke(member)?.label

/* The contract names the protected categories explicitly, so a category added there is withheld
   here without anyone editing a screen. The records marked protected are folded in as well, because
   a record type is a category the moment it is the only thing in it. Naming only the categories a
   person actually has would turn the honesty of the notice into the leak it was written to prevent
   — the list is constant precisely so that its presence discloses nothing. */
val summaryWithheldCategories: List<String> =
    protectedCategories

/* A shared summary is bound to a purpose and to a period, and the purpose chooses the fields. A
   pharmacist dispensing this afternoon needs allergies and medicines; they do not need where the
   patient was last seen or by whom. An undated summary with every field in it is the artefact that
   ends up forwarded, so it is the one thing this flow will not produce. */
data class SharePurpose(val id: String, val name: String, val recipient: String, val hours: Long, val fields: List<String>)
val sharePurposes = listOf(
    SharePurpose("visit", "The nurse at my door, today", "Sister Palesa Khumalo · SANC 20011203", 6,
        listOf("patient", "allergies", "chronicConditions", "currentMedication", "latestVitals", "emergencyContact", "lastConsultation")),
    SharePurpose("pharmacy", "A pharmacy, dispensing one prescription", "Rosebank community pharmacy", 4,
        listOf("patient", "allergies", "currentMedication")),
    SharePurpose("casualty", "A casualty unit, admitting me", "The admitting clinician", 24, recordSummaryCard.fields),
    SharePurpose("opinion", "A doctor giving a second opinion", "Dr Sanjay Naidoo · HPCSA MP0559104", 168,
        listOf("patient", "chronicConditions", "currentMedication", "lastConsultation", "latestVitals", "careTeam"))
)
data class SummaryShare(
    val id: String, val token: String, val purpose: SharePurpose, val recipient: String,
    val createdAt: LocalDateTime, val validUntil: LocalDateTime, val revoked: Boolean = false
)

/* Twenty characters from a 32-symbol alphabet — 100 bits from the platform's own CSPRNG, with no
   modulo bias because 256 divides by 32. It is not the patient number, not a hash of it and not a
   counter, so there is nothing to guess at and nothing to walk through. I, L, O and U are left out
   so that reading one over a counter cannot turn it into a different valid-looking one. */
private const val TOKEN_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
private val tokenRandom = SecureRandom()
fun shareToken(): String {
    val bytes = ByteArray(20).also(tokenRandom::nextBytes)
    val raw = bytes.map { TOKEN_ALPHABET[it.toInt() and 0xFF and 31] }.joinToString("")
    return raw.chunked(5).joinToString("-")
}

/* ---- The artefact ------------------------------------------------------------------------------
   Written out by hand rather than by a serialiser, because the whole point of the guard below is
   that it reads the bytes that would actually leave. A library that decided for itself how to
   render a field would be one more thing between the rule and the artefact. */
private fun jsonString(value: String): String {
    val out = StringBuilder("\"")
    for (character in value) when (character) {
        '"' -> out.append("\\\"")
        '\\' -> out.append("\\\\")
        '\n' -> out.append("\\n")
        '\r' -> out.append("\\r")
        '\t' -> out.append("\\t")
        else -> if (character < ' ') out.append("\\u%04x".format(character.code)) else out.append(character)
    }
    return out.append('"').toString()
}
private fun jsonArray(values: List<String>, indent: String): String =
    if (values.isEmpty()) "[]" else values.joinToString(",\n$indent  ", "[\n$indent  ", "\n$indent]") { jsonString(it) }
private fun jsonObject(pairs: List<Pair<String, String>>, indent: String): String =
    if (pairs.isEmpty()) "{}"
    else pairs.joinToString(",\n$indent  ", "{\n$indent  ", "\n$indent}") { "${jsonString(it.first)}: ${jsonString(it.second)}" }

private val artefactTime: DateTimeFormatter = DateTimeFormatter.ISO_LOCAL_DATE_TIME

/**
 * The artefact itself. It says when it was produced, by whom, for whom, for what, and when it stops
 * being valid, because an undated health summary in a forwarded message is valid forever.
 *
 * [plant] exists only so the guard can be watched refusing something. Nothing built with it is ever
 * offered for sharing.
 */
fun buildSharedSummary(member: HouseholdMember, share: SummaryShare, plant: RestrictedEntry? = null): String {
    val fields = summaryValues(member, share.purpose.fields).map { it.label to it.value } +
        listOfNotNull(plant?.let { "Clinical note" to it.detail })
    return buildString {
        append("{\n")
        append("  \"document\": ${jsonString("MyThuso health summary")},\n")
        append("  \"version\": 1,\n")
        append("  \"demo\": true,\n")
        append("  \"notice\": ${jsonString("Fictional preview data for design review. This is not a medical record and nothing in it was produced by a clinician.")},\n")
        append("  \"producedAt\": ${jsonString(share.createdAt.format(artefactTime))},\n")
        append("  \"producedBy\": ${jsonString("${member.name} — the person this summary is about")},\n")
        append("  \"purpose\": ${jsonString(share.purpose.name)},\n")
        append("  \"sharedWith\": ${jsonString(share.recipient)},\n")
        append("  \"validUntil\": ${jsonString(share.validUntil.format(artefactTime))},\n")
        append("  \"validFor\": ${jsonString("${share.purpose.hours} hours from the moment it was produced")},\n")
        append("  \"afterThat\": ${jsonString("The summary stops being valid. A copy kept after that date is a copy of an expired document, and the verification link says so.")},\n")
        append("  \"reference\": ${jsonString(share.token)},\n")
        append("  \"verification\": {\n")
        append("    \"link\": ${jsonString("https://verify.mythuso.co.za/s/${share.token.lowercase()}")},\n")
        append("    \"returns\": ${jsonArray(listOf("the patient’s initials", "valid, expired or revoked", "the purpose it was made for", "the moment it stops being valid"), "    ")},\n")
        append("    \"neverReturns\": ${jsonArray(listOf("name", "identity number", "patient reference", "date of birth", "address", "contact number", "any clinical content"), "    ")},\n")
        append("    \"note\": ${jsonString("There is no server in this preview, so the link resolves to nothing at all.")}\n")
        append("  },\n")
        append("  \"summary\": ${jsonObject(fields, "  ")},\n")
        append("  \"withheld\": {\n")
        append("    \"categories\": ${jsonArray(summaryWithheldCategories, "    ")},\n")
        append("    \"rule\": ${jsonString(recordSummaryCard.withheld)},\n")
        append("    \"whatToDo\": ${jsonString("Ask the patient. MyThuso will not release these on their behalf, and this list is the same on every summary it produces — it does not say that this person has entries in any of them.")}\n")
        append("  }\n")
        append("}\n")
    }
}

/**
 * The rule is checked against the bytes that would actually leave, not against the intention of the
 * code that wrote them. A protected entry reaching the artefact at all should stop the export
 * rather than travel in it, and a rule nobody tests is a rule somebody hopes about.
 *
 * It searches for the entry's own detail rather than its category name, because the artefact names
 * every protected category on purpose — searching for those would refuse every export ever made,
 * which is the same as checking nothing.
 */
fun protectedLeakIn(member: HouseholdMember, body: String): RestrictedEntry? =
    member.restricted.firstOrNull { body.contains(it.detail) }
