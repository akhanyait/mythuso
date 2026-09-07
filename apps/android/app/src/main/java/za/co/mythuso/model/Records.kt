package za.co.mythuso.model

import java.time.LocalDate
import java.time.Period
import java.time.format.DateTimeFormatter
import java.util.Locale

/*
 * The reasoning about the record contract, kept apart from the contract itself in RecordsData.kt
 * the way Vetting.kt is kept apart from the generated vetting table. Everything here is a decision
 * somebody made; nothing here is data waiting to be emitted.
 *
 * Two of those decisions are not in packages/catalog/records.json, and both matter.
 *
 * The first is that sensitivity is classified twice. A record *type* carries a class — a
 * consultation is clinical, social support is protected — and that class is a floor rather than a
 * ceiling. The contract says so itself, in the chronic-condition entry: “HIV and mental-health
 * conditions are protected and are held separately.” So an individual entry may raise its own class
 * above its type's, and everything downstream resolves the higher of the two.
 *
 * The second is that vetting is not the only gate on a protected category. The vetting contract's
 * own refusal says it plainly — “A protected category is released by the patient, entry by entry.
 * It is never opened by a scope, however senior the nurse.” A cleared nurse therefore passes
 * can(subject, "view-protected-record") and still sees nothing, because this patient has released
 * nothing to her. The capability says the party is fit to be trusted with the category; the release
 * says this patient trusted this party with this entry.
 *
 * Fictional patients, fictional numbers, and no record reached from anywhere.
 */

fun recordAreaById(id: String): RecordArea? = recordAreas.firstOrNull { it.id == id }
fun recordTypeById(id: String): RecordType? = recordTypes.firstOrNull { it.id == id }
fun recordSensitivityById(id: String): RecordSensitivity? = recordSensitivities.firstOrNull { it.id == id }
fun recordsInArea(areaId: String): List<RecordType> = recordTypes.filter { it.area == areaId }
val protectedRecordTypes: List<RecordType> = recordTypes.filter { it.sensitivity == "protected" }
/* The categories are read from the contract rather than split out of the sentence that describes
   them, so a category added there is withheld here without anyone editing a screen. */
/* The contract's named categories, plus the record types protected in their own right — a type is a
   category the moment it is the only thing in it. Composed once, here, because a notice naming seven
   things on one screen and eight on the next leaves a reader wondering which screen is lying. Web
   and iOS compose the same list the same way. */
val protectedCategories: List<String> =
    (recordSensitivityById("protected")?.categories.orEmpty() + protectedRecordTypes.map { it.name }).distinct()

/* ---- Sensitivity -----------------------------------------------------------------------------
   An entry is at least as sensitive as its type, and may be more. Nothing may be less. */
private val sensitivityRank = mapOf("routine" to 0, "clinical" to 1, "protected" to 2)
fun sensitivityOf(typeId: String, entry: String? = null): String {
    val type = recordTypeById(typeId)?.sensitivity ?: "clinical"
    val floor = sensitivityRank[type] ?: 1
    val raised = entry?.let { sensitivityRank[it] } ?: return type
    return if (raised <= floor) type else entry
}
/** Anything in the file that can be withheld: it knows its record type and who it was released to. */
interface Sensitive {
    val typeId: String
    val sensitivity: String?
    val releasedTo: List<String>
}
fun isProtected(item: Sensitive): Boolean = sensitivityOf(item.typeId, item.sensitivity) == "protected"

/* ---- Gating ------------------------------------------------------------------------------------
   A record type names its capabilities. Any one of them opens it: the medication tab is reached
   through view-clinical-record by a doctor and through dispense by a pharmacy, and the vetting
   contract says as much — “A pharmacy sees the prescription and the allergies that bear on filling
   it.” When every route is refused the first refusal is the one shown, because the first capability
   listed is the one the reader was most likely reaching for. */
fun canAny(subject: VettingSubject, capabilities: List<String>): VettingDecision {
    val decisions = capabilities.map { can(subject, it) }
    return decisions.firstOrNull { it.allowed }
        ?: decisions.firstOrNull()
        ?: VettingDecision(false, "No capability governs this.", emptyList())
}
fun canOpenRecord(subject: VettingSubject, typeId: String): VettingDecision =
    canAny(subject, recordTypeById(typeId)?.gatedBy ?: listOf("view-clinical-record"))
/* The written sentence a role is refused a protected category with, taken from the vetting contract
   rather than composed here, so the refusal reads the same wherever it is shown. */
fun releaseRefusal(roleId: String): String =
    vettingRoleById(roleId)?.grants?.firstOrNull { it.capability == "view-protected-record" }?.refusal
        ?: "A protected category is released by the patient, entry by entry."
/* Vetting first, then the patient. Passing the first and failing the second is the normal case,
   not an error state — it is what “released by the patient” means when nobody has released
   anything. */
fun canOpenProtected(subject: VettingSubject, entry: Sensitive): VettingDecision {
    val vetted = can(subject, "view-protected-record")
    if (!vetted.allowed) return vetted
    if (subject.id in entry.releasedTo) return VettingDecision(true, null, emptyList())
    return VettingDecision(false, releaseRefusal(subject.roleId), emptyList())
}
/* One decision for any item in the file, whatever its class. A protected item is never resolved by
   its type's own capability — that is the whole point of the third class. */
fun canOpen(subject: VettingSubject, item: Sensitive): VettingDecision =
    if (isProtected(item)) canOpenProtected(subject, item) else canOpenRecord(subject, item.typeId)

/* ---- The eight tabs ------------------------------------------------------------------------
   Keyed off the contract's navigation list rather than a second list of names, so a tab cannot be
   renamed there and stay Overview here. Referrals opens on view-clinical-record because that is what
   the contract says: reading a referral and making one are different acts, and a nurse who may not
   refer still has to know her patient was referred. refer-patient is the write, and the contract
   holds it in the referral type's writtenBy rather than in its gate. */
private val tabGates = mapOf(
    "Overview" to listOf("view-patient-summary"),
    "Timeline" to listOf("view-clinical-record"),
    "Consultations" to listOf("view-clinical-record"),
    "Medication" to listOf("view-clinical-record", "dispense"),
    "Results" to listOf("view-results"),
    "Referrals" to listOf("view-clinical-record"),
    "Documents" to listOf("view-clinical-record"),
    "Billing" to listOf("view-billing")
)
private val tabCopy = mapOf(
    "Overview" to ("The summary card from the contract: identity, allergies, current medicine, one contact, the last visit, the next appointment and the latest observations." to
        "Nothing here is editable, and no action leaves the phone."),
    "Timeline" to ("Every consultation, test, prescription, referral and document this viewer may open, newest first, each carrying its record type." to
        "Filtering is by record type only. Date ranges, search across notes and a printable extract are not built."),
    "Consultations" to ("Encounters in the standardised structure — the same twelve sections whoever writes them, with SOAP as the reading order." to
        "Writing a consultation is a separate surface. This one reads."),
    "Medication" to ("Current and past medicine with dose, frequency, repeats and the prescribing clinician, plus what a pharmacy actually handed over." to
        "Interaction checking, substitution and chronic authorisation are not built."),
    "Results" to ("Laboratory and imaging reports with reference ranges, and who released them." to
        "Trend comparison across a whole panel, cumulative reports and imaging viewers are not built."),
    "Referrals" to ("Who the patient was sent to, why, how urgently, and what came back." to
        "Booking the receiving appointment and tracking the reply letter are not built."),
    "Documents" to ("Consent forms, referral letters, scheme cards, certificates and reports held against this patient." to
        "Nothing can be uploaded, opened or downloaded here; the files are titles only."),
    "Billing" to ("Invoices, claims and authorisations, by service code and amount." to
        "Submitting a claim, reconciling a payment and appealing a rejection are not built.")
)
data class FileTab(val name: String, val capabilities: List<String>, val holds: String, val notBuilt: String)
val fileTabs: List<FileTab> = recordNavigation.map { name ->
    FileTab(name, tabGates[name] ?: listOf("view-patient-summary"), tabCopy[name]?.first.orEmpty(), tabCopy[name]?.second.orEmpty())
}
fun canOpenTab(subject: VettingSubject, tab: FileTab): VettingDecision = canAny(subject, tab.capabilities)

/* ---- Actions ---------------------------------------------------------------------------------
   Every one of them is a capability before it is a button: uploading a document is writing into
   somebody's record, and booking a visit is sending a named person to a named address, which is the
   most sensitive thing this platform does. */
data class FileAction(val label: String, val capability: String, val detail: String)
val fileActions = listOf(
    FileAction("New consultation", "write-clinical-note", "Open the standardised encounter under your own registration"),
    FileAction("Prescription", "prescribe", "Issue medicine against this patient"),
    FileAction("Referral", "refer-patient", "Send this patient to another provider"),
    FileAction("Upload document", "write-clinical-note", "Add a letter, report or consent form to the file"),
    FileAction("Book a visit", "dispatch-nurses", "Send a nurse to this address in a chosen window")
)

/* ---- Fixtures --------------------------------------------------------------------------------
   The same three fictional patients the web preview uses, so the two apps demonstrate the same
   cases rather than two sets of names that happen to look alike. One carries nothing protected, one
   carries three protected entries and one carries a maternal record — and the header reads
   identically on all three, which is the point. A notice that appeared only when there was
   something behind it would disclose the thing it is hiding, so it appears always.

   Dates are written out rather than held relative to today, because a clinical file that reads
   “next appointment in 11 days” every time it is opened is a demo, and a file dated 18 September
   2026 is a file. They will go stale, and they are fictional anyway. */
data class Allergy(val substance: String, val reaction: String, val severity: String)
data class ConditionEntry(
    override val typeId: String, val name: String, val since: String, val managedBy: String, val status: String,
    override val sensitivity: String? = null, override val releasedTo: List<String> = emptyList()
) : Sensitive
data class Medicine(
    override val typeId: String, val at: String, val name: String, val dose: String, val frequency: String,
    val started: String, val repeats: String, val prescriber: String,
    val dispensedBy: String? = null, val stopped: String? = null,
    override val sensitivity: String? = null, override val releasedTo: List<String> = emptyList()
) : Sensitive
data class VitalSet(
    val at: String, val systolic: Int, val diastolic: Int, val pulse: Int,
    val temperature: Double, val weight: Double, val oxygen: Int
)
data class ConsultationEntry(
    override val typeId: String, val id: String, val at: String, val kind: String, val by: String,
    val registration: String, val place: String, val reason: String, val assessment: String, val plan: String,
    val sections: List<String>,
    override val sensitivity: String? = null, override val releasedTo: List<String> = emptyList()
) : Sensitive
data class ResultRow(val name: String, val value: String, val range: String, val flag: String? = null)
data class LabReport(
    override val typeId: String, val id: String, val at: String, val name: String, val source: String,
    val status: String, val releasedBy: String, val rows: List<ResultRow>,
    override val sensitivity: String? = null, override val releasedTo: List<String> = emptyList()
) : Sensitive
data class ReferralRow(
    override val typeId: String, val id: String, val at: String, val to: String, val reason: String,
    val urgency: String, val status: String, val by: String,
    override val sensitivity: String? = null, override val releasedTo: List<String> = emptyList()
) : Sensitive
data class DocumentRow(
    override val typeId: String, val id: String, val at: String, val name: String, val kind: String, val by: String,
    override val sensitivity: String? = null, override val releasedTo: List<String> = emptyList()
) : Sensitive
data class BillingLine(
    override val typeId: String, val id: String, val at: String, val code: String, val service: String,
    val amount: Int, val payer: String, val status: String, val note: String? = null,
    override val sensitivity: String? = null, override val releasedTo: List<String> = emptyList()
) : Sensitive
data class CareTeamMember(val name: String, val role: String, val since: String)
data class MedicalAid(val scheme: String, val plan: String, val member: String, val status: String, val tone: String)
data class EmergencyContact(val name: String, val relationship: String, val mobile: String)
data class LastVisit(val at: String, val service: String, val by: String, val outcome: String)
data class NextAppointment(val at: String, val time: String, val service: String, val place: String)
data class PatientRecord(
    val id: String, val name: String, val dob: String, val sex: String, val mobile: String, val address: String,
    val facility: String, val bloodGroup: String, val medicalAid: MedicalAid, val emergency: EmergencyContact,
    val service: String, val window: String,
    val allergies: List<Allergy>, val conditions: List<ConditionEntry>, val medication: List<Medicine>,
    val vitals: List<VitalSet>, val careTeam: List<CareTeamMember>, val summaryPoints: List<String>,
    val lastVisit: LastVisit, val nextAppointment: NextAppointment?,
    val consultations: List<ConsultationEntry>, val results: List<LabReport>, val referrals: List<ReferralRow>,
    val documents: List<DocumentRow>, val billing: List<BillingLine>
)

val filePatients: List<PatientRecord> = listOf(
    PatientRecord(
        id = "THU-0001842", name = "Thando Mokoena", dob = "1987-05-14", sex = "Female", mobile = "082 431 7789",
        address = "14 Mofolo Street, Orlando East, Soweto", facility = "Thuso Health Soweto", bloodGroup = "O+",
        medicalAid = MedicalAid("Discovery Health", "Classic Comprehensive", "0142 887 331 · dependant 00", "Active", ""),
        emergency = EmergencyContact("Nomsa Mokoena", "Mother", "083 552 1140"),
        service = "Vitals & chronic check", window = "Fri 18 Sep, 10:30 – 11:15",
        allergies = listOf(Allergy("Penicillin", "Rash and facial swelling", "Severe")),
        conditions = listOf(ConditionEntry("chronic-condition", "Hypertension", "March 2021", "Dr N. Dlamini", "Controlled")),
        medication = listOf(
            Medicine("prescription", "2026-09-04", "Amlodipine", "5 mg", "Once daily, morning", "March 2021",
                "5 of 6 remaining", "Dr N. Dlamini · HPCSA MP0483217", dispensedBy = "Rosebank Community Pharmacy · 4 Sep 2026"),
            Medicine("prescription", "2026-06-12", "Hydrochlorothiazide", "12.5 mg", "Once daily, morning", "March 2021",
                "—", "Dr N. Dlamini · HPCSA MP0483217", stopped = "June 2026")
        ),
        vitals = listOf(
            VitalSet("2026-06-12", 142, 91, 78, 36.8, 73.4, 97),
            VitalSet("2026-07-10", 136, 88, 76, 36.6, 72.8, 98),
            VitalSet("2026-08-07", 131, 85, 79, 36.9, 72.1, 98),
            VitalSet("2026-09-04", 128, 82, 74, 36.7, 71.5, 98)
        ),
        careTeam = listOf(
            CareTeamMember("Dr N. Dlamini", "Treating doctor · General practice", "March 2021"),
            CareTeamMember("Sister Thandeka Zulu", "Registered nurse · Chronic care", "June 2026")
        ),
        summaryPoints = listOf(
            "Hypertension controlled on amlodipine 5 mg. Systolic 142 → 128 over three months, on four recorded readings.",
            "Penicillin allergy recorded 2019: rash and facial swelling. An alternative antibiotic is required, and the pharmacy is shown this before anything else.",
            "Hydrochlorothiazide stopped in June 2026 for postural dizziness. The reason is recorded rather than left to be inferred from the gap.",
            "No admission, procedure or imaging on file."
        ),
        lastVisit = LastVisit("2026-09-04", "Chronic hypertension review", "Dr N. Dlamini", "Continue amlodipine 5 mg. Dietitian referral raised."),
        nextAppointment = NextAppointment("2026-09-18", "10:30", "Vitals & chronic check · home visit", "Thuso Health Soweto · Sister Thandeka Zulu"),
        consultations = listOf(
            ConsultationEntry("consultation", "ENC-4412", "2026-09-04", "Doctor review · telehealth", "Dr N. Dlamini",
                "HPCSA MP0483217", "Thuso Health Soweto", "Three-monthly hypertension review",
                "Hypertension, controlled. No end-organ symptoms reported.",
                "Continue amlodipine 5 mg daily. Dietitian referral. Review in 14 days.",
                listOf("reason", "history", "observations", "examination", "assessment", "plan", "medication", "referral", "followup", "clinician")),
            ConsultationEntry("home-visit", "ENC-4380", "2026-08-07", "Nurse home visit", "Sister Thandeka Zulu",
                "SANC 20014477", "14 Mofolo Street, Orlando East", "Routine chronic observations",
                "Readings within the indicative range. Escalation not required.",
                "Continue current medicine. Next observations in four weeks.",
                listOf("reason", "history", "observations", "assessment", "plan", "followup", "clinician")),
            ConsultationEntry("consultation", "ENC-4291", "2026-06-12", "Doctor review · telehealth", "Dr N. Dlamini",
                "HPCSA MP0483217", "Thuso Health Soweto", "Postural dizziness on waking",
                "Likely postural hypotension on combined therapy.",
                "Stop hydrochlorothiazide. Continue amlodipine. Repeat U&E in eight weeks.",
                listOf("reason", "history", "observations", "examination", "assessment", "plan", "medication", "tests", "followup", "clinician"))
        ),
        results = listOf(
            LabReport("laboratory", "LAB-1188", "2026-08-28", "Urea, electrolytes and creatinine", "Highveld Pathology",
                "Released", "Dr N. Dlamini · 29 Aug 2026", listOf(
                    ResultRow("Sodium", "139 mmol/L", "135 – 145"),
                    ResultRow("Potassium", "4.2 mmol/L", "3.5 – 5.1"),
                    ResultRow("Creatinine", "74 µmol/L", "49 – 90"),
                    ResultRow("eGFR", "> 90 mL/min", "> 90")
                )),
            LabReport("laboratory", "LAB-1104", "2026-06-14", "Lipogram", "Highveld Pathology",
                "Released", "Dr N. Dlamini · 15 Jun 2026", listOf(
                    ResultRow("Total cholesterol", "5.4 mmol/L", "< 5.0", "high"),
                    ResultRow("LDL cholesterol", "3.6 mmol/L", "< 3.0", "high"),
                    ResultRow("HDL cholesterol", "1.4 mmol/L", "> 1.2"),
                    ResultRow("Triglycerides", "1.1 mmol/L", "< 1.7")
                ))
        ),
        referrals = listOf(
            ReferralRow("referral", "REF-0311", "2026-09-04", "K. Petersen · Registered dietitian, Soweto",
                "Dietary management of hypertension and raised LDL", "Routine", "Accepted · appointment 2 Oct 2026", "Dr N. Dlamini")
        ),
        documents = listOf(
            DocumentRow("document", "DOC-2210", "2026-09-04", "Visit summary · 4 September 2026", "Clinical summary", "Dr N. Dlamini"),
            DocumentRow("document", "DOC-2140", "2026-06-12", "Consent to home visits and record keeping", "Consent form", "Thando Mokoena"),
            DocumentRow("document", "DOC-2139", "2026-06-12", "Discovery Health membership card", "Scheme document", "Thando Mokoena")
        ),
        billing = listOf(
            BillingLine("claim", "CLM-8841", "2026-09-04", "0191", "Consultation · established patient, 15–25 min", 495,
                "Discovery Health · Classic Comprehensive", "Accepted"),
            BillingLine("claim", "CLM-8802", "2026-08-07", "0146", "Home visit · registered nurse, chronic observations", 650,
                "Discovery Health · Classic Comprehensive", "Accepted"),
            BillingLine("claim", "CLM-8744", "2026-06-14", "4025", "Pathology · lipogram", 312,
                "Discovery Health · Classic Comprehensive", "Rejected",
                note = "Benefit exhausted for the calendar year. Reason recorded; no diagnosis is carried on the line.")
        )
    ),
    PatientRecord(
        id = "THU-0002177", name = "Sipho Radebe", dob = "1979-03-02", sex = "Male", mobile = "073 208 4416",
        address = "882 Setswetla Extension, Alexandra", facility = "Thuso Health Alexandra", bloodGroup = "A+",
        medicalAid = MedicalAid("No scheme on file", "Self-funded · Thuso Wallet", "—", "Self-funded", "amber"),
        emergency = EmergencyContact("Busisiwe Radebe", "Sister", "072 119 6602"),
        service = "Chronic medicine collection", window = "Tue 22 Sep, 08:00 – 09:00",
        allergies = emptyList(),
        conditions = listOf(
            ConditionEntry("chronic-condition", "Type 2 diabetes", "August 2018", "Dr N. Dlamini", "Fair control"),
            ConditionEntry("chronic-condition", "HIV · on antiretroviral therapy", "February 2016", "Dr N. Dlamini", "Suppressed",
                sensitivity = "protected", releasedTo = listOf("D-401")),
            ConditionEntry("chronic-condition", "Major depressive disorder", "November 2024", "Alexandra Community Mental Health", "In treatment",
                sensitivity = "protected")
        ),
        medication = listOf(
            Medicine("prescription", "2026-08-26", "Metformin", "1 000 mg", "Twice daily with food", "August 2018",
                "3 of 6 remaining", "Dr N. Dlamini · HPCSA MP0483217", dispensedBy = "Diepkloof Family Pharmacy · 26 Aug 2026"),
            Medicine("prescription", "2026-07-25", "Tenofovir / lamivudine / dolutegravir", "300/300/50 mg", "Once daily", "February 2016",
                "4 of 6 remaining", "Dr N. Dlamini · HPCSA MP0483217",
                sensitivity = "protected", releasedTo = listOf("D-401")),
            Medicine("prescription", "2026-08-12", "Escitalopram", "10 mg", "Once daily", "November 2024",
                "1 of 3 remaining", "Alexandra Community Mental Health", sensitivity = "protected")
        ),
        vitals = listOf(
            VitalSet("2026-06-20", 141, 90, 84, 36.5, 90.1, 97),
            VitalSet("2026-07-25", 139, 89, 86, 36.6, 89.4, 97),
            VitalSet("2026-08-26", 138, 88, 82, 36.4, 88.2, 97)
        ),
        careTeam = listOf(CareTeamMember("Dr N. Dlamini", "Treating doctor · General practice", "February 2016")),
        summaryPoints = listOf(
            "Type 2 diabetes on metformin 1 000 mg twice daily. HbA1c 7.9% in August — above target, discussed at the last review.",
            "No allergy has been recorded. That is not the same as no allergy, and the file does not say it is.",
            "Blood pressure has sat at 138–141 systolic across three readings without a diagnosis of hypertension being made. Flagged for the next review.",
            "Weight down 1.9 kg since June, unplanned. Recorded, not interpreted."
        ),
        lastVisit = LastVisit("2026-08-26", "Chronic review and medicine collection", "Dr N. Dlamini", "Continue metformin. Repeat HbA1c in three months."),
        nextAppointment = NextAppointment("2026-09-22", "08:00", "Chronic medicine collection", "Thuso Corner · Alexandra"),
        consultations = listOf(
            ConsultationEntry("consultation", "ENC-4402", "2026-08-26", "Doctor review · telehealth", "Dr N. Dlamini",
                "HPCSA MP0483217", "Thuso Health Alexandra", "Three-monthly diabetes review",
                "Type 2 diabetes, fair control. HbA1c 7.9%.",
                "Continue metformin 1 000 mg twice daily. Repeat HbA1c in three months. Dietary counselling offered.",
                listOf("reason", "history", "observations", "assessment", "plan", "medication", "tests", "followup", "clinician")),
            ConsultationEntry("consultation", "ENC-4371", "2026-07-25", "Doctor review · telehealth", "Dr N. Dlamini",
                "HPCSA MP0483217", "Thuso Health Alexandra", "Antiretroviral therapy review",
                "Viral load suppressed. Adherence good on self-report.",
                "Continue current regimen. Repeat viral load in six months.",
                listOf("reason", "history", "observations", "assessment", "plan", "medication", "followup", "clinician"),
                sensitivity = "protected", releasedTo = listOf("D-401"))
        ),
        results = listOf(
            LabReport("laboratory", "LAB-1173", "2026-08-24", "HbA1c", "Highveld Pathology",
                "Released", "Dr N. Dlamini · 25 Aug 2026", listOf(ResultRow("HbA1c", "7.9 %", "< 7.0 (on treatment)", "high"))),
            LabReport("laboratory", "LAB-1150", "2026-07-22", "HIV viral load", "Highveld Pathology",
                "Released", "Dr N. Dlamini · 24 Jul 2026", listOf(
                    ResultRow("HIV-1 RNA", "< 50 copies/mL", "Target not detected"),
                    ResultRow("CD4 count", "612 cells/µL", "500 – 1 500")
                ), sensitivity = "protected", releasedTo = listOf("D-401"))
        ),
        referrals = listOf(
            ReferralRow("referral", "REF-0288", "2024-11-14", "Alexandra Community Mental Health",
                "Assessment and management of major depressive disorder", "Routine", "Under care", "Dr N. Dlamini",
                sensitivity = "protected")
        ),
        documents = listOf(
            DocumentRow("document", "DOC-2190", "2026-08-26", "Visit summary · 26 August 2026", "Clinical summary", "Dr N. Dlamini"),
            DocumentRow("document", "DOC-2101", "2026-02-03", "Consent to home visits and record keeping", "Consent form", "Sipho Radebe")
        ),
        billing = listOf(
            BillingLine("claim", "CLM-8830", "2026-08-26", "0191", "Consultation · established patient, 15–25 min", 495,
                "Self-funded · Thuso Wallet", "Paid"),
            BillingLine("claim", "CLM-8798", "2026-08-24", "4064", "Pathology · glycated haemoglobin", 268,
                "Self-funded · Thuso Wallet", "Paid"),
            BillingLine("claim", "CLM-8760", "2026-07-22", "3932", "Antiretroviral therapy · monthly supply", 0,
                "State programme", "Covered", sensitivity = "protected")
        )
    ),
    PatientRecord(
        id = "THU-0002310", name = "Lindiwe Nkosi", dob = "1994-11-09", sex = "Female", mobile = "084 776 3021",
        address = "27 Ivory Park Extension 9, Tembisa", facility = "Thuso Health Tembisa", bloodGroup = "B−",
        medicalAid = MedicalAid("Bonitas", "BonStart", "8842 110 76 · principal", "Active · waiting period", "amber"),
        emergency = EmergencyContact("Thabo Nkosi", "Partner", "079 445 8813"),
        service = "Mother & baby check", window = "Thu 24 Sep, 14:00 – 15:00",
        allergies = listOf(Allergy("Sulfonamides", "Urticaria", "Moderate")),
        conditions = listOf(
            ConditionEntry("chronic-condition", "Iron-deficiency anaemia", "July 2026", "Sister Boitumelo Nkosi", "On treatment"),
            ConditionEntry("maternal-health", "Antenatal care · 26 weeks", "April 2026", "Thuso Health Tembisa", "Ongoing",
                releasedTo = listOf("N-201"))
        ),
        medication = listOf(
            Medicine("prescription", "2026-08-20", "Ferrous sulfate", "200 mg", "Twice daily with food", "July 2026",
                "2 of 3 remaining", "Dr N. Dlamini · HPCSA MP0483217", dispensedBy = "Rosebank Community Pharmacy · 21 Aug 2026")
        ),
        vitals = listOf(
            VitalSet("2026-07-16", 112, 72, 84, 36.7, 62.1, 99),
            VitalSet("2026-08-20", 108, 70, 86, 36.5, 63.4, 99),
            VitalSet("2026-09-03", 106, 68, 88, 36.6, 64.3, 99)
        ),
        careTeam = listOf(CareTeamMember("Sister Boitumelo Nkosi", "Registered nurse · Maternal and child", "April 2026")),
        summaryPoints = listOf(
            "Iron-deficiency anaemia on ferrous sulfate. Haemoglobin 10.4 g/dL in August, up from 9.6 in July.",
            "Sulfonamide allergy recorded: urticaria, moderate.",
            "Blood pressure low-normal and steady across three readings.",
            "Blood group B negative. Recorded here because it changes what a stranger would do in the next ten minutes."
        ),
        lastVisit = LastVisit("2026-09-03", "Nurse home visit · observations", "Sister Boitumelo Nkosi", "Observations recorded. Continue iron. Review in three weeks."),
        nextAppointment = NextAppointment("2026-09-24", "14:00", "Mother & baby check · home visit", "Thuso Health Tembisa · Sister Boitumelo Nkosi"),
        consultations = listOf(
            ConsultationEntry("home-visit", "ENC-4408", "2026-09-03", "Nurse home visit", "Sister Boitumelo Nkosi",
                "SANC 20019902", "27 Ivory Park Extension 9", "Routine observations and iron review",
                "Readings within the indicative range. Tolerating iron.",
                "Continue ferrous sulfate. Repeat full blood count in four weeks.",
                listOf("reason", "history", "observations", "assessment", "plan", "followup", "clinician")),
            ConsultationEntry("maternal-health", "ENC-4390", "2026-08-20", "Antenatal visit", "Sister Boitumelo Nkosi",
                "SANC 20019902", "Thuso Health Tembisa", "Antenatal review at 24 weeks",
                "Progressing normally. Fundal height appropriate.",
                "Next antenatal visit in four weeks. Iron continued.",
                listOf("reason", "history", "observations", "examination", "assessment", "plan", "followup", "clinician"),
                releasedTo = listOf("N-201"))
        ),
        results = listOf(
            LabReport("laboratory", "LAB-1169", "2026-08-19", "Full blood count and iron studies", "Highveld Pathology",
                "Released", "Dr N. Dlamini · 20 Aug 2026", listOf(
                    ResultRow("Haemoglobin", "10.4 g/dL", "12.0 – 15.5", "low"),
                    ResultRow("Mean cell volume", "76 fL", "80 – 100", "low"),
                    ResultRow("Ferritin", "14 µg/L", "15 – 200", "low")
                ))
        ),
        referrals = emptyList(),
        documents = listOf(
            DocumentRow("document", "DOC-2205", "2026-08-20", "Consent to home visits and record keeping", "Consent form", "Lindiwe Nkosi"),
            DocumentRow("document", "DOC-2206", "2026-08-19", "Full blood count report · 19 August 2026", "Laboratory report", "Highveld Pathology")
        ),
        billing = listOf(
            BillingLine("claim", "CLM-8820", "2026-09-03", "0146", "Home visit · registered nurse, observations", 650,
                "Bonitas · BonStart", "Submitted"),
            BillingLine("claim", "CLM-8795", "2026-08-19", "3755", "Pathology · full blood count", 214,
                "Bonitas · BonStart", "Accepted")
        )
    )
)
fun filePatientById(id: String): PatientRecord? = filePatients.firstOrNull { it.id == id }

/* ---- The timeline ----------------------------------------------------------------------------
   Derived rather than authored, so a consultation cannot appear in the Consultations tab and be
   missing from the Timeline because somebody forgot to add it twice. */
data class TimelineEntry(
    override val typeId: String, val id: String, val at: String, val title: String, val detail: String, val by: String,
    override val sensitivity: String? = null, override val releasedTo: List<String> = emptyList()
) : Sensitive
fun timelineFor(patient: PatientRecord): List<TimelineEntry> {
    val entries = patient.consultations.map {
        TimelineEntry(it.typeId, it.id, it.at, it.kind, it.reason, it.by, it.sensitivity, it.releasedTo)
    } + patient.results.map {
        TimelineEntry(it.typeId, it.id, it.at, it.name, "${it.source} · ${it.status.lowercase()}", it.releasedBy, it.sensitivity, it.releasedTo)
    } + patient.medication.filter { it.stopped == null }.map {
        TimelineEntry(it.typeId, "RX-${it.name.take(4).uppercase()}", it.at, "${it.name} ${it.dose}",
            "${it.frequency} · ${it.repeats}", it.prescriber, it.sensitivity, it.releasedTo)
    } + patient.referrals.map {
        TimelineEntry(it.typeId, it.id, it.at, "Referral · ${it.to}", "${it.urgency} · ${it.status}", it.by, it.sensitivity, it.releasedTo)
    } + patient.documents.map {
        TimelineEntry(it.typeId, it.id, it.at, it.name, it.kind, it.by, it.sensitivity, it.releasedTo)
    }
    return entries.sortedWith(compareByDescending<TimelineEntry> { it.at }.thenBy { it.id })
}

/* ---- Small shared readings -------------------------------------------------------------------- */
private val southAfrica = Locale("en", "ZA")
private val longDateFormat = DateTimeFormatter.ofPattern("d MMMM yyyy", southAfrica)
private val shortDateFormat = DateTimeFormatter.ofPattern("d MMM yyyy", southAfrica)
private val dayMonthFormat = DateTimeFormatter.ofPattern("d MMM", southAfrica)
fun ageFrom(dob: String): Int = Period.between(LocalDate.parse(dob), LocalDate.now()).years
fun longDate(iso: String): String = LocalDate.parse(iso).format(longDateFormat)
fun shortDate(iso: String): String = LocalDate.parse(iso).format(shortDateFormat)
fun dayMonth(iso: String): String = LocalDate.parse(iso).format(dayMonthFormat)
/* Rands, in the same shape the service catalogue prints them. A claim line for a state programme is
   R0 rather than blank: nothing charged is a fact, not a missing value. */
fun rands(amount: Int): String = "R$amount"
