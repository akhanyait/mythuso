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
 * rather than a list of names. Twelve parties are vetted — not only nurses — and each one is
 * refused something specific, in words, until its checks pass.
 *
 * The roles, checks, issuing authorities and renewal cadences are described once, as data, in
 * packages/catalog/vetting.json. This app does not read that file at runtime: an app that parses
 * JSON to draw a list is a web app wearing a Compose hat, and the whole point of these three
 * codebases is that they are genuinely native. So the model is written out here by hand, with the
 * same ids, patterns and refusal sentences, and scripts/check-boundaries.mjs is what stops the two
 * quietly drifting apart.
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
    val evidence: String, val renewMonths: Int?, val risk: String
)
data class VettingRole(
    val id: String, val name: String, val party: String, val workspace: String,
    val summary: String, val grants: List<VettingGrant>, val checks: List<VettingCheck>
)

val vettingCapabilities = listOf(
    VettingCapability("take-visit", "Attend a patient visit", "Accept a dispatched visit and enter a patient's home"),
    VettingCapability("sign-clinical-review", "Sign a clinical decision", "Record an outcome against a nurse's submission, with attribution"),
    VettingCapability("prescribe", "Issue a prescription", "Prescribe a scheduled medicine"),
    VettingCapability("dispense", "Dispense a prescription", "Fill and hand over a prescribed medicine"),
    VettingCapability("release-lab-result", "Release a laboratory result", "Send a result to a patient or a treating clinician"),
    VettingCapability("transport-sample", "Take custody of a sample", "Carry a clinical sample between a home and a laboratory"),
    VettingCapability("view-patient-record", "Open a Health Passport", "Read a patient's clinical record"),
    VettingCapability("dispatch-nurses", "Assign a nurse", "Send a named nurse to a named address"),
    VettingCapability("review-vetting", "Decide a vetting case", "Approve, decline or suspend another party's credentials"),
    VettingCapability("run-programme", "Run a programme", "Operate an employer or community health programme"),
    VettingCapability("sponsor-care", "Sponsor care", "Pay for another person's visits"),
    VettingCapability("guardian-access", "Hold guardian access", "Act for a minor or a dependent adult"),
    VettingCapability("host-screening", "Host a screening site", "Receive patients at a community screening location")
)

/* The credential formats are the ones the issuing bodies actually use, so the applicant gets a real
   “that is not a SANC number” answer — worked out on the phone, with nothing sent anywhere. Every
   number typed into this preview is fictional. */
val vettingAuthorities = listOf(
    VettingAuthority("sanc", "South African Nursing Council", "SANC", "Registration to practise as a nurse", "8 digits", "^\\d{8}$", "20012345", "A SANC registration number has 8 digits."),
    VettingAuthority("hpcsa", "Health Professions Council of South Africa", "HPCSA", "Registration to practise as a doctor", "MP followed by 7 digits", "^MP\\d{7}$", "MP0483217", "An HPCSA medical practitioner number starts with MP and has 7 digits."),
    VettingAuthority("sapc", "South African Pharmacy Council", "SAPC", "Pharmacy and responsible-pharmacist registration", "Y followed by 6 digits", "^Y\\d{6}$", "Y041882", "A SAPC pharmacy registration starts with Y and has 6 digits."),
    VettingAuthority("sanas", "South African National Accreditation System", "SANAS", "ISO 15189 medical laboratory accreditation", "M followed by 4 digits", "^M\\d{4}$", "M0521", "A SANAS medical accreditation number starts with M and has 4 digits."),
    VettingAuthority("saps", "South African Police Service", "SAPS", "Criminal record clearance", "13-character clearance reference", "^[A-Z]{2}\\d{11}$", "ZA20260114772", "A SAPS clearance reference is two letters followed by 11 digits."),
    VettingAuthority("dha", "Department of Home Affairs", "Home Affairs", "Identity, through an accredited verification provider", "13-digit identity number", "sa-id", "8001015009087", "A South African ID number has 13 digits and a check digit."),
    VettingAuthority("cipc", "Companies and Intellectual Property Commission", "CIPC", "That the company exists and who may sign for it", "YYYY/NNNNNN/NN", "^\\d{4}/\\d{6}/\\d{2}$", "2019/443871/07", "A CIPC registration number looks like 2019/443871/07."),
    VettingAuthority("rtmc", "Road Traffic Management Corporation", "RTMC", "Driving licence and professional driving permit", "12-digit licence number", "^\\d{12}$", "401220118834", "A driving licence number has 12 digits."),
    VettingAuthority("sahpra", "South African Health Products Regulatory Authority", "SAHPRA", "Licence to hold and distribute medicines or devices", "Licence reference", "^[A-Z0-9/-]{6,20}$", "SAHPRA/24/0117", "Enter the licence reference exactly as it appears on the certificate."),
    VettingAuthority("insurer", "Professional indemnity insurer", "Indemnity", "Cover in force for the declared scope of practice", "Policy number", "^[A-Z0-9-]{6,20}$", "PI-2026-88104", "Enter the policy number from your schedule of cover."),
    VettingAuthority("institution", "Issuing institution", "Institution", "Qualifications, checked with the institution that issued them", "Certificate number", "^[A-Z0-9/-]{4,24}$", "WITS/2018/44120", "Enter the certificate or diploma number."),
    VettingAuthority("internal", "MyThuso Clinical Governance", "MyThuso", "Training, references and undertakings held by MyThuso", "Recorded internally", "", "", "This check is completed by MyThuso and has nothing for you to enter.")
)

/* Every check is written out in full for every role, even where two roles ask for the same
   document, because a check that exists only as a shared variable cannot be checked against the
   JSON one role at a time. */
val vettingRoles = listOf(
    VettingRole(
        "nurse", "Registered nurse", "person", "Nurse",
        "Attends visits in patients' homes, takes observations and escalates.",
        listOf(
            VettingGrant("take-visit", "An unvetted nurse is never offered a visit, and cannot be assigned to one by the Control Tower."),
            VettingGrant("view-patient-record", "A nurse sees only the visit in front of them until every check passes.")
        ),
        listOf(
            VettingCheck("sanc-registration", "SANC registration", "Verified against the South African Nursing Council register", "sanc", "Registration number and current receipt", 12, "high"),
            VettingCheck("identity", "Identity", "Home Affairs verification through an accredited provider", "dha", "Identity document", null, "high"),
            VettingCheck("qualifications", "Qualifications", "Certified copies checked against the issuing institution", "institution", "Diploma or degree certificate", null, "standard"),
            VettingCheck("police-clearance", "Police clearance", "SAPS clearance, renewed every two years", "saps", "SAPS clearance certificate", 24, "high"),
            VettingCheck("indemnity", "Professional indemnity", "Cover in force for the scope of practice", "insurer", "Schedule of cover", 12, "standard"),
            VettingCheck("references", "Two clinical references", "Contacted directly, never through the applicant", "internal", "Two named referees", null, "standard"),
            VettingCheck("kit-training", "Thuso Kit training", "Device handling, infection control and escalation drill", "internal", "Training record", 24, "standard"),
            VettingCheck("popia-training", "POPIA and confidentiality", "Handling special personal information, and the undertaking that goes with it", "internal", "Signed undertaking", 12, "standard")
        )
    ),
    VettingRole(
        "locum", "Locum nurse", "person", "Nurse",
        "Takes shifts through Thuso Locum rather than a standing roster.",
        listOf(VettingGrant("take-visit", "A locum cannot pick up a shift until the same checks a rostered nurse passes are in date.")),
        listOf(
            VettingCheck("sanc-registration", "SANC registration", "Verified against the South African Nursing Council register", "sanc", "Registration number and current receipt", 12, "high"),
            VettingCheck("identity", "Identity", "Home Affairs verification through an accredited provider", "dha", "Identity document", null, "high"),
            VettingCheck("police-clearance", "Police clearance", "SAPS clearance, renewed every two years", "saps", "SAPS clearance certificate", 24, "high"),
            VettingCheck("indemnity", "Professional indemnity", "Cover in force for the scope of practice", "insurer", "Schedule of cover", 12, "standard"),
            VettingCheck("shift-eligibility", "Shift eligibility", "Hours worked elsewhere declared, so a nurse is not dispatched exhausted", "internal", "Declared employment", 6, "standard"),
            VettingCheck("popia-training", "POPIA and confidentiality", "Handling special personal information, and the undertaking that goes with it", "internal", "Signed undertaking", 12, "standard")
        )
    ),
    VettingRole(
        "doctor", "Doctor", "person", "Doctor",
        "Reviews nurse submissions, signs decisions and prescribes.",
        listOf(
            VettingGrant("sign-clinical-review", "A case cannot be signed by a doctor whose HPCSA registration is not current. The queue refuses the signature rather than warning about it."),
            VettingGrant("prescribe", "Prescribing is withheld until the Section 22A prescribing authority is verified alongside the registration."),
            VettingGrant("view-patient-record", "The review queue shows nothing until registration and indemnity are both in date.")
        ),
        listOf(
            VettingCheck("hpcsa-registration", "HPCSA registration", "Verified against the Health Professions Council register", "hpcsa", "Registration number and annual receipt", 12, "high"),
            VettingCheck("identity", "Identity", "Home Affairs verification through an accredited provider", "dha", "Identity document", null, "high"),
            VettingCheck("qualifications", "Qualifications", "Primary medical qualification checked with the issuing institution", "institution", "MBChB or equivalent", null, "standard"),
            VettingCheck("prescribing-authority", "Prescribing authority", "Section 22A authority to prescribe scheduled medicines", "sahpra", "Practice number and authority", 12, "high"),
            VettingCheck("indemnity", "Professional indemnity", "Cover in force for telemedicine and asynchronous review", "insurer", "Schedule of cover naming telemedicine", 12, "high"),
            VettingCheck("police-clearance", "Police clearance", "SAPS clearance, renewed every two years", "saps", "SAPS clearance certificate", 24, "high"),
            VettingCheck("cpd", "Continuing professional development", "HPCSA CPD points current for the cycle", "hpcsa", "CPD statement", 12, "standard"),
            VettingCheck("popia-training", "POPIA and confidentiality", "Handling special personal information, and the undertaking that goes with it", "internal", "Signed undertaking", 12, "standard")
        )
    ),
    VettingRole(
        "pharmacy", "Pharmacy partner", "organisation", "Partner",
        "Fills prescriptions raised through Thuso Doctor.",
        listOf(
            VettingGrant("dispense", "A prescription is never routed to a pharmacy whose licence or responsible pharmacist is not current."),
            VettingGrant("view-patient-record", "A pharmacy sees the prescription and nothing else, and only once it is licensed to fill it.")
        ),
        listOf(
            VettingCheck("company-registration", "Company registration", "CIPC record, and who may sign for the company", "cipc", "CIPC certificate and resolution", null, "standard"),
            VettingCheck("signatory", "Authorised signatory", "The named person who may bind the company, verified as a person", "dha", "Identity document and board resolution", null, "high"),
            VettingCheck("pharmacy-registration", "Pharmacy registration", "Registered with the South African Pharmacy Council", "sapc", "SAPC registration certificate", 12, "high"),
            VettingCheck("responsible-pharmacist", "Responsible pharmacist", "A named, registered pharmacist accountable for the premises", "sapc", "Personal SAPC registration", 12, "high"),
            VettingCheck("dispensing-licence", "Dispensing licence", "Section 22C(1)(a) licence to dispense from these premises", "sahpra", "Licence certificate", 36, "high"),
            VettingCheck("cold-chain", "Cold chain", "Monitored storage for medicines that require it", "internal", "Temperature log and calibration record", 12, "standard"),
            VettingCheck("operator-agreement", "Operator agreement", "POPIA operator agreement signed, with breach notification terms", "internal", "Signed agreement", 24, "high")
        )
    ),
    VettingRole(
        "laboratory", "Laboratory partner", "organisation", "Partner",
        "Receives samples, runs tests and returns results.",
        listOf(
            VettingGrant("release-lab-result", "A result cannot be released by a laboratory whose ISO 15189 accreditation has lapsed. Held results stay held."),
            VettingGrant("view-patient-record", "A laboratory sees the order and the sample, and only while accredited to test it.")
        ),
        listOf(
            VettingCheck("company-registration", "Company registration", "CIPC record, and who may sign for the company", "cipc", "CIPC certificate and resolution", null, "standard"),
            VettingCheck("signatory", "Authorised signatory", "The named person who may bind the company, verified as a person", "dha", "Identity document and board resolution", null, "high"),
            VettingCheck("iso-15189", "ISO 15189 accreditation", "SANAS accreditation for the tests actually offered", "sanas", "Schedule of accreditation", 36, "high"),
            VettingCheck("pathologist", "Responsible pathologist", "A named HPCSA-registered pathologist accountable for the reports", "hpcsa", "Personal HPCSA registration", 12, "high"),
            VettingCheck("test-scope", "Test scope", "Every test on the MyThuso menu appears on the accreditation schedule", "internal", "Mapped test list", 12, "high"),
            VettingCheck("turnaround", "Turnaround commitment", "Agreed times per test, and what happens when they slip", "internal", "Signed service levels", 12, "standard"),
            VettingCheck("operator-agreement", "Operator agreement", "POPIA operator agreement signed, with breach notification terms", "internal", "Signed agreement", 24, "high")
        )
    ),
    VettingRole(
        "courier", "Sample courier", "person", "Partner",
        "Carries clinical samples from a home to a laboratory.",
        listOf(VettingGrant("transport-sample", "Chain of custody starts with a vetted courier. An unvetted driver cannot be handed a sealed sample.")),
        listOf(
            VettingCheck("identity", "Identity", "Home Affairs verification through an accredited provider", "dha", "Identity document", null, "high"),
            VettingCheck("driving-licence", "Driving licence and PDP", "Valid licence and professional driving permit", "rtmc", "Licence card and PDP", 24, "high"),
            VettingCheck("police-clearance", "Police clearance", "SAPS clearance, renewed every two years", "saps", "SAPS clearance certificate", 24, "high"),
            VettingCheck("cold-chain-training", "Cold chain and biohazard training", "Packaging, temperature and spillage handling", "internal", "Training record", 12, "standard"),
            VettingCheck("vehicle", "Vehicle and container", "Roadworthy vehicle and a calibrated transport container", "internal", "Roadworthy certificate and calibration record", 12, "standard"),
            VettingCheck("popia-training", "POPIA and confidentiality", "A courier learns who is ill from an address. That is special personal information", "internal", "Signed undertaking", 12, "standard")
        )
    ),
    VettingRole(
        "operator", "Control Tower operator", "person", "Control Tower",
        "Dispatches nurses, triages incidents and escalates.",
        listOf(
            VettingGrant("dispatch-nurses", "Sending a named nurse to a named address is the most sensitive thing this platform does. It is not available until vetting completes."),
            VettingGrant("view-patient-record", "An operator sees an address and a service, never a clinical record — and nothing at all while unvetted.")
        ),
        listOf(
            VettingCheck("identity", "Identity", "Home Affairs verification through an accredited provider", "dha", "Identity document", null, "high"),
            VettingCheck("police-clearance", "Police clearance", "SAPS clearance, renewed every two years", "saps", "SAPS clearance certificate", 24, "high"),
            VettingCheck("references", "Employment references", "Contacted directly, never through the applicant", "internal", "Two named referees", null, "standard"),
            VettingCheck("escalation-training", "Escalation training", "Incident severity, the five-minute acknowledgement and when to call emergency services", "internal", "Training record and drill", 12, "high"),
            VettingCheck("popia-training", "POPIA and confidentiality", "Handling special personal information, and the undertaking that goes with it", "internal", "Signed undertaking", 12, "standard")
        )
    ),
    VettingRole(
        "admin", "Internal admin staff", "person", "Admin",
        "Back office: catalogue, finance, growth and vetting decisions.",
        listOf(
            VettingGrant("review-vetting", "Nobody decides another party's vetting until their own is complete. A reviewer with lapsed checks loses the queue."),
            VettingGrant("run-programme", "Programme administration is withheld until vetting and the confidentiality undertaking are in date.")
        ),
        listOf(
            VettingCheck("identity", "Identity", "Home Affairs verification through an accredited provider", "dha", "Identity document", null, "high"),
            VettingCheck("police-clearance", "Police clearance", "SAPS clearance, renewed every two years", "saps", "SAPS clearance certificate", 24, "high"),
            VettingCheck("references", "Employment references", "Contacted directly, never through the applicant", "internal", "Two named referees", null, "standard"),
            VettingCheck("access-role", "Access role", "The least privilege that lets this person do their job, approved by name", "internal", "Approved role assignment", 6, "high"),
            VettingCheck("popia-training", "POPIA and confidentiality", "Handling special personal information, and the undertaking that goes with it", "internal", "Signed undertaking", 12, "standard")
        )
    ),
    VettingRole(
        "employer", "Employer / B2B client", "organisation", "Admin",
        "Buys wellness days, screening or cover for its staff.",
        listOf(
            VettingGrant("run-programme", "A programme cannot be opened to staff until the company, its signatory and its operator agreement are verified."),
            VettingGrant("sponsor-care", "An employer may pay for care and still never see who used it. Payment is verified separately from access, and access is never granted.")
        ),
        listOf(
            VettingCheck("company-registration", "Company registration", "CIPC record, and who may sign for the company", "cipc", "CIPC certificate and resolution", null, "standard"),
            VettingCheck("signatory", "Authorised signatory", "The named person who may bind the company, verified as a person", "dha", "Identity document and board resolution", null, "high"),
            VettingCheck("tax-clearance", "Tax clearance", "A current SARS tax compliance status", "internal", "Tax compliance pin", 12, "standard"),
            VettingCheck("operator-agreement", "Operator agreement", "POPIA operator agreement, stating that the employer receives aggregate figures and never a named result", "internal", "Signed agreement", 24, "high"),
            VettingCheck("aggregate-only", "Aggregate-only undertaking", "Written acknowledgement that no individual employee result is ever disclosed, in any circumstance", "internal", "Signed undertaking", 24, "high")
        )
    ),
    VettingRole(
        "sponsor", "Care sponsor", "person", "Patient",
        "Pays for a family member's or another person's care.",
        listOf(VettingGrant("sponsor-care", "Sponsorship is a payment, not a permission. Until identity and the recipient's consent are both recorded, no visit can be paid for.")),
        listOf(
            VettingCheck("identity", "Identity", "Home Affairs verification through an accredited provider", "dha", "Identity document", null, "high"),
            VettingCheck("recipient-consent", "Recipient's consent", "The person being sponsored agrees, in their own account, in their own words", "internal", "Recorded consent with wording and version", 12, "high"),
            VettingCheck("payment-source", "Payment source", "Verified through a regulated payment provider", "internal", "Provider verification reference", 12, "standard"),
            VettingCheck("no-access-acknowledgement", "No-access acknowledgement", "Written acknowledgement that paying for care grants no clinical access whatsoever", "internal", "Signed acknowledgement", null, "high")
        )
    ),
    VettingRole(
        "guardian", "Guardian", "person", "Patient",
        "Acts for a minor or a dependent adult.",
        listOf(
            VettingGrant("guardian-access", "Guardian access is refused until identity and legal authority are both proven. Being a parent in the app is not proof of being a guardian in law."),
            VettingGrant("view-patient-record", "Even a verified guardian sees only the scope granted, for the duration granted. Sexual and reproductive health, mental health and HIV-related entries stay hidden under every scope.")
        ),
        listOf(
            VettingCheck("identity", "Identity", "Home Affairs verification through an accredited provider", "dha", "Identity document", null, "high"),
            VettingCheck("legal-authority", "Legal authority", "Birth certificate, court order or curatorship, checked as a document", "dha", "Unabridged birth certificate or court order", null, "high"),
            VettingCheck("relationship", "Relationship to the patient", "Confirmed with the patient or, for a minor, with the registered parent", "internal", "Confirmation record", 12, "high"),
            VettingCheck("scope-acknowledgement", "Scope acknowledgement", "Written acknowledgement of what guardianship does and does not reach", "internal", "Signed acknowledgement", 12, "standard")
        )
    ),
    VettingRole(
        "corner", "Thuso Corner site", "site", "Admin",
        "A community location where screening and identity recovery happen in person.",
        listOf(
            VettingGrant("host-screening", "A site cannot receive patients until it has been inspected. A screening in a room without privacy is not a screening."),
            VettingGrant("guardian-access", "In-person identity recovery at a Corner is only offered at inspected sites with a trained, vetted attendant.")
        ),
        listOf(
            VettingCheck("site-inspection", "Site inspection", "A private consulting space, hand washing, and a lockable record store", "internal", "Inspection report", 12, "high"),
            VettingCheck("waste-disposal", "Medical waste disposal", "A contracted, licensed healthcare risk-waste service", "internal", "Waste contract and collection manifests", 12, "high"),
            VettingCheck("attendant-vetting", "Attendant vetting", "Every person working the site is vetted in their own right", "internal", "Linked personal vetting records", 12, "high"),
            VettingCheck("privacy-layout", "Privacy layout", "Nobody waiting can see or hear a consultation", "internal", "Floor plan and inspection sign-off", 12, "standard"),
            VettingCheck("landlord-consent", "Landlord consent", "Written permission to provide a health service on the premises", "internal", "Signed consent", 24, "standard")
        )
    )
)

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

/* ---- The blocking matrix ---------------------------------------------------------------------
   This is the whole point of the module: not a list of documents, but a refusal with a reason
   attached to it that other screens can ask about before they offer an action. */
data class VettingDecision(val allowed: Boolean, val reason: String?, val blockedBy: List<VettingCheck>)
fun can(subject: VettingSubject, capabilityId: String): VettingDecision {
    val role = vettingRoleById(subject.roleId)
    val grant = role?.grants?.firstOrNull { it.capability == capabilityId }
        ?: return VettingDecision(false, "A ${role?.name?.lowercase() ?: "party"} is never granted this.", emptyList())
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
fun scopeFor(roleId: String): ScopeOfPractice? = when (roleId) {
    "nurse" -> ScopeOfPractice(
        "Scope of practice",
        "You are only ever dispatched to work inside your registered scope. The Control Tower cannot override that.",
        listOf("Chronic care", "Wound care", "Maternal & child", "Post-operative", "Phlebotomy", "Paediatric", "Elderly care")
    )
    "locum" -> ScopeOfPractice(
        "Scope of practice",
        "You are only ever dispatched to work inside your registered scope. The Control Tower cannot override that.",
        listOf("Chronic care", "Wound care", "Maternal & child", "Post-operative", "Phlebotomy", "Paediatric", "Elderly care")
    )
    "doctor" -> ScopeOfPractice(
        "Scope of practice",
        "Asynchronous review and telemedicine are declared separately, because indemnity cover has to name them.",
        listOf("General practice", "Family medicine", "Internal medicine", "Paediatrics", "Occupational health", "Telemedicine")
    )
    "pharmacy" -> ScopeOfPractice(
        "Dispensing scope",
        "A prescription is only ever routed to a pharmacy licensed for the schedule it is written on.",
        listOf("Schedule 0–2", "Schedule 3–4", "Schedule 5", "Cold-chain items", "Chronic repeats")
    )
    "laboratory" -> ScopeOfPractice(
        "Tests offered",
        "A test that is not on your SANAS schedule of accreditation is not on the MyThuso menu, whatever the laboratory can technically run.",
        listOf("Full blood count", "Fasting glucose", "HbA1c", "Lipogram", "Urea and electrolytes", "Liver function", "Urine dipstick")
    )
    "courier" -> ScopeOfPractice(
        "Samples carried",
        "A courier carries only the categories they are trained and equipped for. Cold chain is not a preference.",
        listOf("Ambient samples", "Cold-chain samples", "Biohazard category B")
    )
    "corner" -> ScopeOfPractice(
        "Services offered",
        "A site offers only what its inspection covers. A room that passed for screening has not passed for vaccination.",
        listOf("Screening", "Identity recovery", "Vaccination support")
    )
    else -> null
}

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
