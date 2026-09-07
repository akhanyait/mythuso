import Combine
import Foundation

/* Vetting is the gate the whole marketplace rests on, so it is a real pipeline with real refusals
   rather than a list of names. Twelve parties are vetted — not only nurses — and each one is
   refused something specific, in its own words, until its checks pass.

   The roles, checks, issuing authorities, credential formats and refusal sentences are described
   once, as data, in packages/catalog/vetting.json. The native apps do not read JSON at runtime, so
   the table is hand-written here and scripts/check-boundaries.mjs fails the build if the two drift
   apart — which is why every id, pattern and refusal sentence below is character-identical to that
   file rather than tidied for Swift.

   Nothing here is a compliance control. It is the design of one, held in a shape the three apps can
   agree on. No credential is verified, stored or transmitted anywhere, and every party named at the
   bottom of this file is fictional. */

// MARK: - The shared table

struct VettingAuthority: Identifiable, Hashable {
    let id: String
    let name: String
    let short: String
    let verifies: String
    let format: String
    /// Empty for the checks MyThuso completes itself, which have nothing for an applicant to type.
    let pattern: String
    let example: String
    let hint: String
}
struct VettingCapability: Identifiable, Hashable {
    let id: String
    let name: String
    let detail: String
}
/// A capability the role could hold, and the sentence it is refused with until it holds it.
struct VettingGrant: Hashable {
    let capability: String
    let refusal: String
}
struct VettingCheck: Identifiable, Hashable {
    let id: String
    let name: String
    let detail: String
    let authority: String
    let evidence: String
    /// nil where a check is decided once and does not expire — an identity, a birth certificate.
    let renewMonths: Int?
    let risk: String
    var isHighRisk: Bool { risk == "high" }
    var cadence: String {
        guard let renewMonths else { return "Does not expire" }
        return renewMonths % 12 == 0 ? "Renews every \(renewMonths / 12) year\(renewMonths == 12 ? "" : "s")" : "Renews every \(renewMonths) months"
    }
}
struct VettedRole: Identifiable, Hashable {
    let id: String
    let name: String
    let party: String
    let workspace: String
    let summary: String
    let grants: [VettingGrant]
    let checks: [VettingCheck]
    func check(_ id: String) -> VettingCheck? { checks.first { $0.id == id } }
}

enum Vetting {
    static let capabilities: [VettingCapability] = [
        .init(id: "take-visit", name: "Attend a patient visit", detail: "Accept a dispatched visit and enter a patient's home"),
        .init(id: "sign-clinical-review", name: "Sign a clinical decision", detail: "Record an outcome against a nurse's submission, with attribution"),
        .init(id: "prescribe", name: "Issue a prescription", detail: "Prescribe a scheduled medicine"),
        .init(id: "dispense", name: "Dispense a prescription", detail: "Fill and hand over a prescribed medicine"),
        .init(id: "release-lab-result", name: "Release a laboratory result", detail: "Send a result to a patient or a treating clinician"),
        .init(id: "transport-sample", name: "Take custody of a sample", detail: "Carry a clinical sample between a home and a laboratory"),
        .init(id: "view-patient-record", name: "Open a Health Passport", detail: "Read a patient's clinical record"),
        .init(id: "dispatch-nurses", name: "Assign a nurse", detail: "Send a named nurse to a named address"),
        .init(id: "review-vetting", name: "Decide a vetting case", detail: "Approve, decline or suspend another party's credentials"),
        .init(id: "run-programme", name: "Run a programme", detail: "Operate an employer or community health programme"),
        .init(id: "sponsor-care", name: "Sponsor care", detail: "Pay for another person's visits"),
        .init(id: "guardian-access", name: "Hold guardian access", detail: "Act for a minor or a dependent adult"),
        .init(id: "host-screening", name: "Host a screening site", detail: "Receive patients at a community screening location")
    ]
    /* The formats are the ones the issuing bodies actually use, so the preview can say "that is not
       a SANC number" locally, without sending anything anywhere. The numbers entered are fictional. */
    static let authorities: [VettingAuthority] = [
        .init(id: "sanc", name: "South African Nursing Council", short: "SANC",
              verifies: "Registration to practise as a nurse", format: "8 digits",
              pattern: #"^\d{8}$"#, example: "20012345", hint: "A SANC registration number has 8 digits."),
        .init(id: "hpcsa", name: "Health Professions Council of South Africa", short: "HPCSA",
              verifies: "Registration to practise as a doctor", format: "MP followed by 7 digits",
              pattern: #"^MP\d{7}$"#, example: "MP0483217", hint: "An HPCSA medical practitioner number starts with MP and has 7 digits."),
        .init(id: "sapc", name: "South African Pharmacy Council", short: "SAPC",
              verifies: "Pharmacy and responsible-pharmacist registration", format: "Y followed by 6 digits",
              pattern: #"^Y\d{6}$"#, example: "Y041882", hint: "A SAPC pharmacy registration starts with Y and has 6 digits."),
        .init(id: "sanas", name: "South African National Accreditation System", short: "SANAS",
              verifies: "ISO 15189 medical laboratory accreditation", format: "M followed by 4 digits",
              pattern: #"^M\d{4}$"#, example: "M0521", hint: "A SANAS medical accreditation number starts with M and has 4 digits."),
        .init(id: "saps", name: "South African Police Service", short: "SAPS",
              verifies: "Criminal record clearance", format: "13-character clearance reference",
              pattern: #"^[A-Z]{2}\d{11}$"#, example: "ZA20260114772", hint: "A SAPS clearance reference is two letters followed by 11 digits."),
        .init(id: "dha", name: "Department of Home Affairs", short: "Home Affairs",
              verifies: "Identity, through an accredited verification provider", format: "13-digit identity number",
              pattern: "sa-id", example: "8001015009087", hint: "A South African ID number has 13 digits and a check digit."),
        .init(id: "cipc", name: "Companies and Intellectual Property Commission", short: "CIPC",
              verifies: "That the company exists and who may sign for it", format: "YYYY/NNNNNN/NN",
              pattern: #"^\d{4}/\d{6}/\d{2}$"#, example: "2019/443871/07", hint: "A CIPC registration number looks like 2019/443871/07."),
        .init(id: "rtmc", name: "Road Traffic Management Corporation", short: "RTMC",
              verifies: "Driving licence and professional driving permit", format: "12-digit licence number",
              pattern: #"^\d{12}$"#, example: "401220118834", hint: "A driving licence number has 12 digits."),
        .init(id: "sahpra", name: "South African Health Products Regulatory Authority", short: "SAHPRA",
              verifies: "Licence to hold and distribute medicines or devices", format: "Licence reference",
              pattern: #"^[A-Z0-9/-]{6,20}$"#, example: "SAHPRA/24/0117", hint: "Enter the licence reference exactly as it appears on the certificate."),
        .init(id: "insurer", name: "Professional indemnity insurer", short: "Indemnity",
              verifies: "Cover in force for the declared scope of practice", format: "Policy number",
              pattern: #"^[A-Z0-9-]{6,20}$"#, example: "PI-2026-88104", hint: "Enter the policy number from your schedule of cover."),
        .init(id: "institution", name: "Issuing institution", short: "Institution",
              verifies: "Qualifications, checked with the institution that issued them", format: "Certificate number",
              pattern: #"^[A-Z0-9/-]{4,24}$"#, example: "WITS/2018/44120", hint: "Enter the certificate or diploma number."),
        .init(id: "internal", name: "MyThuso Clinical Governance", short: "MyThuso",
              verifies: "Training, references and undertakings held by MyThuso", format: "Recorded internally",
              pattern: "", example: "", hint: "This check is completed by MyThuso and has nothing for you to enter.")
    ]

    static let roles: [VettedRole] = [
        VettedRole(id: "nurse", name: "Registered nurse", party: "person", workspace: "Nurse",
                   summary: "Attends visits in patients' homes, takes observations and escalates.",
                   grants: [
                    .init(capability: "take-visit", refusal: "An unvetted nurse is never offered a visit, and cannot be assigned to one by the Control Tower."),
                    .init(capability: "view-patient-record", refusal: "A nurse sees only the visit in front of them until every check passes.")
                   ],
                   checks: [
                    .init(id: "sanc-registration", name: "SANC registration", detail: "Verified against the South African Nursing Council register", authority: "sanc", evidence: "Registration number and current receipt", renewMonths: 12, risk: "high"),
                    .init(id: "identity", name: "Identity", detail: "Home Affairs verification through an accredited provider", authority: "dha", evidence: "Identity document", renewMonths: nil, risk: "high"),
                    .init(id: "qualifications", name: "Qualifications", detail: "Certified copies checked against the issuing institution", authority: "institution", evidence: "Diploma or degree certificate", renewMonths: nil, risk: "standard"),
                    .init(id: "police-clearance", name: "Police clearance", detail: "SAPS clearance, renewed every two years", authority: "saps", evidence: "SAPS clearance certificate", renewMonths: 24, risk: "high"),
                    .init(id: "indemnity", name: "Professional indemnity", detail: "Cover in force for the scope of practice", authority: "insurer", evidence: "Schedule of cover", renewMonths: 12, risk: "standard"),
                    .init(id: "references", name: "Two clinical references", detail: "Contacted directly, never through the applicant", authority: "internal", evidence: "Two named referees", renewMonths: nil, risk: "standard"),
                    .init(id: "kit-training", name: "Thuso Kit training", detail: "Device handling, infection control and escalation drill", authority: "internal", evidence: "Training record", renewMonths: 24, risk: "standard"),
                    .init(id: "popia-training", name: "POPIA and confidentiality", detail: "Handling special personal information, and the undertaking that goes with it", authority: "internal", evidence: "Signed undertaking", renewMonths: 12, risk: "standard")
                   ]),
        VettedRole(id: "locum", name: "Locum nurse", party: "person", workspace: "Nurse",
                   summary: "Takes shifts through Thuso Locum rather than a standing roster.",
                   grants: [
                    .init(capability: "take-visit", refusal: "A locum cannot pick up a shift until the same checks a rostered nurse passes are in date.")
                   ],
                   checks: [
                    .init(id: "sanc-registration", name: "SANC registration", detail: "Verified against the South African Nursing Council register", authority: "sanc", evidence: "Registration number and current receipt", renewMonths: 12, risk: "high"),
                    .init(id: "identity", name: "Identity", detail: "Home Affairs verification through an accredited provider", authority: "dha", evidence: "Identity document", renewMonths: nil, risk: "high"),
                    .init(id: "police-clearance", name: "Police clearance", detail: "SAPS clearance, renewed every two years", authority: "saps", evidence: "SAPS clearance certificate", renewMonths: 24, risk: "high"),
                    .init(id: "indemnity", name: "Professional indemnity", detail: "Cover in force for the scope of practice", authority: "insurer", evidence: "Schedule of cover", renewMonths: 12, risk: "standard"),
                    .init(id: "shift-eligibility", name: "Shift eligibility", detail: "Hours worked elsewhere declared, so a nurse is not dispatched exhausted", authority: "internal", evidence: "Declared employment", renewMonths: 6, risk: "standard"),
                    .init(id: "popia-training", name: "POPIA and confidentiality", detail: "Handling special personal information, and the undertaking that goes with it", authority: "internal", evidence: "Signed undertaking", renewMonths: 12, risk: "standard")
                   ]),
        VettedRole(id: "doctor", name: "Doctor", party: "person", workspace: "Doctor",
                   summary: "Reviews nurse submissions, signs decisions and prescribes.",
                   grants: [
                    .init(capability: "sign-clinical-review", refusal: "A case cannot be signed by a doctor whose HPCSA registration is not current. The queue refuses the signature rather than warning about it."),
                    .init(capability: "prescribe", refusal: "Prescribing is withheld until the Section 22A prescribing authority is verified alongside the registration."),
                    .init(capability: "view-patient-record", refusal: "The review queue shows nothing until registration and indemnity are both in date.")
                   ],
                   checks: [
                    .init(id: "hpcsa-registration", name: "HPCSA registration", detail: "Verified against the Health Professions Council register", authority: "hpcsa", evidence: "Registration number and annual receipt", renewMonths: 12, risk: "high"),
                    .init(id: "identity", name: "Identity", detail: "Home Affairs verification through an accredited provider", authority: "dha", evidence: "Identity document", renewMonths: nil, risk: "high"),
                    .init(id: "qualifications", name: "Qualifications", detail: "Primary medical qualification checked with the issuing institution", authority: "institution", evidence: "MBChB or equivalent", renewMonths: nil, risk: "standard"),
                    .init(id: "prescribing-authority", name: "Prescribing authority", detail: "Section 22A authority to prescribe scheduled medicines", authority: "sahpra", evidence: "Practice number and authority", renewMonths: 12, risk: "high"),
                    .init(id: "indemnity", name: "Professional indemnity", detail: "Cover in force for telemedicine and asynchronous review", authority: "insurer", evidence: "Schedule of cover naming telemedicine", renewMonths: 12, risk: "high"),
                    .init(id: "police-clearance", name: "Police clearance", detail: "SAPS clearance, renewed every two years", authority: "saps", evidence: "SAPS clearance certificate", renewMonths: 24, risk: "high"),
                    .init(id: "cpd", name: "Continuing professional development", detail: "HPCSA CPD points current for the cycle", authority: "hpcsa", evidence: "CPD statement", renewMonths: 12, risk: "standard"),
                    .init(id: "popia-training", name: "POPIA and confidentiality", detail: "Handling special personal information, and the undertaking that goes with it", authority: "internal", evidence: "Signed undertaking", renewMonths: 12, risk: "standard")
                   ]),
        VettedRole(id: "pharmacy", name: "Pharmacy partner", party: "organisation", workspace: "Partner",
                   summary: "Fills prescriptions raised through Thuso Doctor.",
                   grants: [
                    .init(capability: "dispense", refusal: "A prescription is never routed to a pharmacy whose licence or responsible pharmacist is not current."),
                    .init(capability: "view-patient-record", refusal: "A pharmacy sees the prescription and nothing else, and only once it is licensed to fill it.")
                   ],
                   checks: [
                    .init(id: "company-registration", name: "Company registration", detail: "CIPC record, and who may sign for the company", authority: "cipc", evidence: "CIPC certificate and resolution", renewMonths: nil, risk: "standard"),
                    .init(id: "signatory", name: "Authorised signatory", detail: "The named person who may bind the company, verified as a person", authority: "dha", evidence: "Identity document and board resolution", renewMonths: nil, risk: "high"),
                    .init(id: "pharmacy-registration", name: "Pharmacy registration", detail: "Registered with the South African Pharmacy Council", authority: "sapc", evidence: "SAPC registration certificate", renewMonths: 12, risk: "high"),
                    .init(id: "responsible-pharmacist", name: "Responsible pharmacist", detail: "A named, registered pharmacist accountable for the premises", authority: "sapc", evidence: "Personal SAPC registration", renewMonths: 12, risk: "high"),
                    .init(id: "dispensing-licence", name: "Dispensing licence", detail: "Section 22C(1)(a) licence to dispense from these premises", authority: "sahpra", evidence: "Licence certificate", renewMonths: 36, risk: "high"),
                    .init(id: "cold-chain", name: "Cold chain", detail: "Monitored storage for medicines that require it", authority: "internal", evidence: "Temperature log and calibration record", renewMonths: 12, risk: "standard"),
                    .init(id: "operator-agreement", name: "Operator agreement", detail: "POPIA operator agreement signed, with breach notification terms", authority: "internal", evidence: "Signed agreement", renewMonths: 24, risk: "high")
                   ]),
        VettedRole(id: "laboratory", name: "Laboratory partner", party: "organisation", workspace: "Partner",
                   summary: "Receives samples, runs tests and returns results.",
                   grants: [
                    .init(capability: "release-lab-result", refusal: "A result cannot be released by a laboratory whose ISO 15189 accreditation has lapsed. Held results stay held."),
                    .init(capability: "view-patient-record", refusal: "A laboratory sees the order and the sample, and only while accredited to test it.")
                   ],
                   checks: [
                    .init(id: "company-registration", name: "Company registration", detail: "CIPC record, and who may sign for the company", authority: "cipc", evidence: "CIPC certificate and resolution", renewMonths: nil, risk: "standard"),
                    .init(id: "signatory", name: "Authorised signatory", detail: "The named person who may bind the company, verified as a person", authority: "dha", evidence: "Identity document and board resolution", renewMonths: nil, risk: "high"),
                    .init(id: "iso-15189", name: "ISO 15189 accreditation", detail: "SANAS accreditation for the tests actually offered", authority: "sanas", evidence: "Schedule of accreditation", renewMonths: 36, risk: "high"),
                    .init(id: "pathologist", name: "Responsible pathologist", detail: "A named HPCSA-registered pathologist accountable for the reports", authority: "hpcsa", evidence: "Personal HPCSA registration", renewMonths: 12, risk: "high"),
                    .init(id: "test-scope", name: "Test scope", detail: "Every test on the MyThuso menu appears on the accreditation schedule", authority: "internal", evidence: "Mapped test list", renewMonths: 12, risk: "high"),
                    .init(id: "turnaround", name: "Turnaround commitment", detail: "Agreed times per test, and what happens when they slip", authority: "internal", evidence: "Signed service levels", renewMonths: 12, risk: "standard"),
                    .init(id: "operator-agreement", name: "Operator agreement", detail: "POPIA operator agreement signed, with breach notification terms", authority: "internal", evidence: "Signed agreement", renewMonths: 24, risk: "high")
                   ]),
        VettedRole(id: "courier", name: "Sample courier", party: "person", workspace: "Partner",
                   summary: "Carries clinical samples from a home to a laboratory.",
                   grants: [
                    .init(capability: "transport-sample", refusal: "Chain of custody starts with a vetted courier. An unvetted driver cannot be handed a sealed sample.")
                   ],
                   checks: [
                    .init(id: "identity", name: "Identity", detail: "Home Affairs verification through an accredited provider", authority: "dha", evidence: "Identity document", renewMonths: nil, risk: "high"),
                    .init(id: "driving-licence", name: "Driving licence and PDP", detail: "Valid licence and professional driving permit", authority: "rtmc", evidence: "Licence card and PDP", renewMonths: 24, risk: "high"),
                    .init(id: "police-clearance", name: "Police clearance", detail: "SAPS clearance, renewed every two years", authority: "saps", evidence: "SAPS clearance certificate", renewMonths: 24, risk: "high"),
                    .init(id: "cold-chain-training", name: "Cold chain and biohazard training", detail: "Packaging, temperature and spillage handling", authority: "internal", evidence: "Training record", renewMonths: 12, risk: "standard"),
                    .init(id: "vehicle", name: "Vehicle and container", detail: "Roadworthy vehicle and a calibrated transport container", authority: "internal", evidence: "Roadworthy certificate and calibration record", renewMonths: 12, risk: "standard"),
                    .init(id: "popia-training", name: "POPIA and confidentiality", detail: "A courier learns who is ill from an address. That is special personal information", authority: "internal", evidence: "Signed undertaking", renewMonths: 12, risk: "standard")
                   ]),
        VettedRole(id: "operator", name: "Control Tower operator", party: "person", workspace: "Control Tower",
                   summary: "Dispatches nurses, triages incidents and escalates.",
                   grants: [
                    .init(capability: "dispatch-nurses", refusal: "Sending a named nurse to a named address is the most sensitive thing this platform does. It is not available until vetting completes."),
                    .init(capability: "view-patient-record", refusal: "An operator sees an address and a service, never a clinical record — and nothing at all while unvetted.")
                   ],
                   checks: [
                    .init(id: "identity", name: "Identity", detail: "Home Affairs verification through an accredited provider", authority: "dha", evidence: "Identity document", renewMonths: nil, risk: "high"),
                    .init(id: "police-clearance", name: "Police clearance", detail: "SAPS clearance, renewed every two years", authority: "saps", evidence: "SAPS clearance certificate", renewMonths: 24, risk: "high"),
                    .init(id: "references", name: "Employment references", detail: "Contacted directly, never through the applicant", authority: "internal", evidence: "Two named referees", renewMonths: nil, risk: "standard"),
                    .init(id: "escalation-training", name: "Escalation training", detail: "Incident severity, the five-minute acknowledgement and when to call emergency services", authority: "internal", evidence: "Training record and drill", renewMonths: 12, risk: "high"),
                    .init(id: "popia-training", name: "POPIA and confidentiality", detail: "Handling special personal information, and the undertaking that goes with it", authority: "internal", evidence: "Signed undertaking", renewMonths: 12, risk: "standard")
                   ]),
        VettedRole(id: "admin", name: "Internal admin staff", party: "person", workspace: "Admin",
                   summary: "Back office: catalogue, finance, growth and vetting decisions.",
                   grants: [
                    .init(capability: "review-vetting", refusal: "Nobody decides another party's vetting until their own is complete. A reviewer with lapsed checks loses the queue."),
                    .init(capability: "run-programme", refusal: "Programme administration is withheld until vetting and the confidentiality undertaking are in date.")
                   ],
                   checks: [
                    .init(id: "identity", name: "Identity", detail: "Home Affairs verification through an accredited provider", authority: "dha", evidence: "Identity document", renewMonths: nil, risk: "high"),
                    .init(id: "police-clearance", name: "Police clearance", detail: "SAPS clearance, renewed every two years", authority: "saps", evidence: "SAPS clearance certificate", renewMonths: 24, risk: "high"),
                    .init(id: "references", name: "Employment references", detail: "Contacted directly, never through the applicant", authority: "internal", evidence: "Two named referees", renewMonths: nil, risk: "standard"),
                    .init(id: "access-role", name: "Access role", detail: "The least privilege that lets this person do their job, approved by name", authority: "internal", evidence: "Approved role assignment", renewMonths: 6, risk: "high"),
                    .init(id: "popia-training", name: "POPIA and confidentiality", detail: "Handling special personal information, and the undertaking that goes with it", authority: "internal", evidence: "Signed undertaking", renewMonths: 12, risk: "standard")
                   ]),
        VettedRole(id: "employer", name: "Employer / B2B client", party: "organisation", workspace: "Admin",
                   summary: "Buys wellness days, screening or cover for its staff.",
                   grants: [
                    .init(capability: "run-programme", refusal: "A programme cannot be opened to staff until the company, its signatory and its operator agreement are verified."),
                    .init(capability: "sponsor-care", refusal: "An employer may pay for care and still never see who used it. Payment is verified separately from access, and access is never granted.")
                   ],
                   checks: [
                    .init(id: "company-registration", name: "Company registration", detail: "CIPC record, and who may sign for the company", authority: "cipc", evidence: "CIPC certificate and resolution", renewMonths: nil, risk: "standard"),
                    .init(id: "signatory", name: "Authorised signatory", detail: "The named person who may bind the company, verified as a person", authority: "dha", evidence: "Identity document and board resolution", renewMonths: nil, risk: "high"),
                    .init(id: "tax-clearance", name: "Tax clearance", detail: "A current SARS tax compliance status", authority: "internal", evidence: "Tax compliance pin", renewMonths: 12, risk: "standard"),
                    .init(id: "operator-agreement", name: "Operator agreement", detail: "POPIA operator agreement, stating that the employer receives aggregate figures and never a named result", authority: "internal", evidence: "Signed agreement", renewMonths: 24, risk: "high"),
                    .init(id: "aggregate-only", name: "Aggregate-only undertaking", detail: "Written acknowledgement that no individual employee result is ever disclosed, in any circumstance", authority: "internal", evidence: "Signed undertaking", renewMonths: 24, risk: "high")
                   ]),
        VettedRole(id: "sponsor", name: "Care sponsor", party: "person", workspace: "Patient",
                   summary: "Pays for a family member's or another person's care.",
                   grants: [
                    .init(capability: "sponsor-care", refusal: "Sponsorship is a payment, not a permission. Until identity and the recipient's consent are both recorded, no visit can be paid for.")
                   ],
                   checks: [
                    .init(id: "identity", name: "Identity", detail: "Home Affairs verification through an accredited provider", authority: "dha", evidence: "Identity document", renewMonths: nil, risk: "high"),
                    .init(id: "recipient-consent", name: "Recipient's consent", detail: "The person being sponsored agrees, in their own account, in their own words", authority: "internal", evidence: "Recorded consent with wording and version", renewMonths: 12, risk: "high"),
                    .init(id: "payment-source", name: "Payment source", detail: "Verified through a regulated payment provider", authority: "internal", evidence: "Provider verification reference", renewMonths: 12, risk: "standard"),
                    .init(id: "no-access-acknowledgement", name: "No-access acknowledgement", detail: "Written acknowledgement that paying for care grants no clinical access whatsoever", authority: "internal", evidence: "Signed acknowledgement", renewMonths: nil, risk: "high")
                   ]),
        VettedRole(id: "guardian", name: "Guardian", party: "person", workspace: "Patient",
                   summary: "Acts for a minor or a dependent adult.",
                   grants: [
                    .init(capability: "guardian-access", refusal: "Guardian access is refused until identity and legal authority are both proven. Being a parent in the app is not proof of being a guardian in law."),
                    .init(capability: "view-patient-record", refusal: "Even a verified guardian sees only the scope granted, for the duration granted. Sexual and reproductive health, mental health and HIV-related entries stay hidden under every scope.")
                   ],
                   checks: [
                    .init(id: "identity", name: "Identity", detail: "Home Affairs verification through an accredited provider", authority: "dha", evidence: "Identity document", renewMonths: nil, risk: "high"),
                    .init(id: "legal-authority", name: "Legal authority", detail: "Birth certificate, court order or curatorship, checked as a document", authority: "dha", evidence: "Unabridged birth certificate or court order", renewMonths: nil, risk: "high"),
                    .init(id: "relationship", name: "Relationship to the patient", detail: "Confirmed with the patient or, for a minor, with the registered parent", authority: "internal", evidence: "Confirmation record", renewMonths: 12, risk: "high"),
                    .init(id: "scope-acknowledgement", name: "Scope acknowledgement", detail: "Written acknowledgement of what guardianship does and does not reach", authority: "internal", evidence: "Signed acknowledgement", renewMonths: 12, risk: "standard")
                   ]),
        VettedRole(id: "corner", name: "Thuso Corner site", party: "site", workspace: "Admin",
                   summary: "A community location where screening and identity recovery happen in person.",
                   grants: [
                    .init(capability: "host-screening", refusal: "A site cannot receive patients until it has been inspected. A screening in a room without privacy is not a screening."),
                    .init(capability: "guardian-access", refusal: "In-person identity recovery at a Corner is only offered at inspected sites with a trained, vetted attendant.")
                   ],
                   checks: [
                    .init(id: "site-inspection", name: "Site inspection", detail: "A private consulting space, hand washing, and a lockable record store", authority: "internal", evidence: "Inspection report", renewMonths: 12, risk: "high"),
                    .init(id: "waste-disposal", name: "Medical waste disposal", detail: "A contracted, licensed healthcare risk-waste service", authority: "internal", evidence: "Waste contract and collection manifests", renewMonths: 12, risk: "high"),
                    .init(id: "attendant-vetting", name: "Attendant vetting", detail: "Every person working the site is vetted in their own right", authority: "internal", evidence: "Linked personal vetting records", renewMonths: 12, risk: "high"),
                    .init(id: "privacy-layout", name: "Privacy layout", detail: "Nobody waiting can see or hear a consultation", authority: "internal", evidence: "Floor plan and inspection sign-off", renewMonths: 12, risk: "standard"),
                    .init(id: "landlord-consent", name: "Landlord consent", detail: "Written permission to provide a health service on the premises", authority: "internal", evidence: "Signed consent", renewMonths: 24, risk: "standard")
                   ])
    ]

    static func role(_ id: String) -> VettedRole? { roles.first { $0.id == id } }
    static func authority(_ id: String) -> VettingAuthority? { authorities.first { $0.id == id } }
    static func capability(_ id: String) -> VettingCapability? { capabilities.first { $0.id == id } }
    static func check(_ roleId: String, _ checkId: String) -> VettingCheck? { role(roleId)?.check(checkId) }

    /* Scope of practice is part of the gate, not decoration: a nurse is only ever dispatched inside
       it, and a laboratory only offers what its accreditation schedule covers. It is held in
       packages/catalog/vetting.json with everything else, because three apps offering three
       different scope lists is the same drift as three reference ranges, and harder to notice.
       Roles without a scope simply have none. */
    struct RoleScope { let label: String; let note: String; let options: [String] }
    static let scopes: [String: RoleScope] = [
        "nurse": RoleScope(label: "Scope of practice", note: "You are only ever dispatched to work inside your registered scope. The Control Tower cannot override that.",
                        options: ["Chronic care", "Wound care", "Maternal & child", "Post-operative", "Phlebotomy", "Paediatric", "Elderly care"]),
        "locum": RoleScope(label: "Scope of practice", note: "You are only ever dispatched to work inside your registered scope. The Control Tower cannot override that.",
                        options: ["Chronic care", "Wound care", "Maternal & child", "Post-operative", "Phlebotomy", "Paediatric", "Elderly care"]),
        "doctor": RoleScope(label: "Scope of practice", note: "Asynchronous review and telemedicine are declared separately, because indemnity cover has to name them.",
                        options: ["General practice", "Family medicine", "Internal medicine", "Paediatrics", "Occupational health", "Telemedicine"]),
        "pharmacy": RoleScope(label: "Dispensing scope", note: "A prescription is only ever routed to a pharmacy licensed for the schedule it is written on.",
                        options: ["Schedule 0–2", "Schedule 3–4", "Schedule 5", "Cold-chain items", "Chronic repeats"]),
        "laboratory": RoleScope(label: "Tests offered", note: "A test that is not on your SANAS schedule of accreditation is not on the MyThuso menu, whatever the laboratory can technically run.",
                        options: ["Full blood count", "Fasting glucose", "HbA1c", "Lipogram", "Urea and electrolytes", "Liver function", "Urine dipstick"]),
        "courier": RoleScope(label: "Samples carried", note: "A courier carries only the categories they are trained and equipped for. Cold chain is not a preference.",
                        options: ["Ambient samples", "Cold-chain samples", "Biohazard category B"]),
        "corner": RoleScope(label: "Services offered", note: "A site offers only what its inspection covers. A room that passed for screening has not passed for vaccination.",
                        options: ["Screening", "Identity recovery", "Vaccination support"]),
    ]
    static func scope(for roleId: String) -> RoleScope? { scopes[roleId] }
    static func scopeOptions(for roleId: String) -> [String] { scopes[roleId]?.options ?? [] }
}

// MARK: - Credential formats

/// A real "that is not a SANC number", answered on the device, with nothing sent anywhere.
func validateCredential(_ authorityId: String, _ value: String) -> (ok: Bool, reason: String?) {
    guard let authority = Vetting.authority(authorityId) else { return (false, "Unknown issuing authority.") }
    let entry = value.trimmingCharacters(in: .whitespaces)
    if authority.pattern.isEmpty { return (true, nil) }             // MyThuso-held checks have nothing to type
    if entry.isEmpty { return (false, authority.hint) }
    if authority.pattern == "sa-id" {
        /* Home Affairs verification hangs on an identity number, and the check digit for one is
           already written once in Localisation.swift. A second copy would be a second answer. */
        let result = validateSaId(entry)
        return (result.ok, result.ok ? nil : result.message)
    }
    return entry.range(of: authority.pattern, options: .regularExpression) != nil ? (true, nil) : (false, authority.hint)
}

// MARK: - The state of one check

enum CheckState: String, CaseIterable, Identifiable {
    case outstanding, submitted, inReview = "in-review", verified, expiring, lapsed, declined
    var id: String { rawValue }
    var label: String {
        switch self {
        case .outstanding: return "Outstanding"
        case .submitted: return "Submitted"
        case .inReview: return "In review"
        case .verified: return "Verified"
        case .expiring: return "Expiring"
        case .lapsed: return "Lapsed"
        case .declined: return "Declined"
        }
    }
    /// Which states let the capability through. "Expiring" still passes — a nurse whose clearance
    /// runs out in three weeks is dispatchable today, and is told about it.
    static let passing: [CheckState] = [.verified, .expiring]
    var passes: Bool { CheckState.passing.contains(self) }
    var tone: String {
        switch self {
        case .verified: return "teal"
        case .expiring: return "amber"
        case .lapsed, .declined: return "danger"
        case .submitted, .inReview: return "sky"
        case .outstanding: return "quiet"
        }
    }
}
struct CheckRecord: Identifiable, Hashable {
    let checkId: String
    var state: CheckState = .outstanding
    var decidedOn: Date?
    var expiresOn: Date?
    var decidedBy: String?
    /// High-risk checks need a second, different reviewer before they count as verified.
    var secondedBy: String?
    var evidence: String?
    var note: String?
    var id: String { checkId }
}
struct VettingSubject: Identifiable, Hashable {
    let id: String
    var name: String
    var roleId: String
    var reference: String
    var zone: String?
    var scope: [String] = []
    var records: [CheckRecord] = []
    var suspended = false
    var suspendedReason: String?
    var declined = false
    var declinedReason: String?
    var appealed = false
    var role: VettedRole? { Vetting.role(roleId) }
}

/* A preview has no clock of its own, so every fixture date is written relative to today. "This
   clearance lapsed nine days ago" then stays true whenever the demo is opened. */
enum VettingClock {
    static let expiryWarningDays = 45
    static var today: Date { Calendar.current.startOfDay(for: Date()) }
    static func inDays(_ days: Int) -> Date { Calendar.current.date(byAdding: .day, value: days, to: today) ?? today }
    static func inMonths(_ months: Double) -> Date { inDays(Int((months * 30.44).rounded())) }
    static func adding(months: Int, to date: Date) -> Date { Calendar.current.date(byAdding: .month, value: months, to: date) ?? date }
}
func daysUntil(_ date: Date?) -> Int? {
    guard let date else { return nil }
    let target = Calendar.current.startOfDay(for: date)
    return Calendar.current.dateComponents([.day], from: VettingClock.today, to: target).day
}
private let vettingDayFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_ZA")
    formatter.dateFormat = "d MMM yyyy"
    return formatter
}()
func vettingDate(_ date: Date?) -> String { date.map { vettingDayFormatter.string(from: $0) } ?? "—" }
/// The countdown a dashboard should show, in words, so nobody has to subtract two dates by eye.
func expiryPhrase(_ date: Date?) -> String {
    guard let days = daysUntil(date) else { return "Does not expire" }
    if days < 0 { return "Lapsed \(-days) day\(days == -1 ? "" : "s") ago" }
    if days == 0 { return "Expires today" }
    return "\(days) day\(days == 1 ? "" : "s") left"
}

/* A stored "verified" is only true until its expiry date. Resolving the state at read time —
   rather than trusting what was written down — is what makes scheduled re-vetting real rather
   than a claim in a paragraph of copy. */
func resolveState(_ record: CheckRecord) -> CheckState {
    guard record.state == .verified else { return record.state }
    guard let days = daysUntil(record.expiresOn) else { return .verified }
    if days < 0 { return .lapsed }
    if days <= VettingClock.expiryWarningDays { return .expiring }
    return .verified
}
func recordFor(_ subject: VettingSubject, _ checkId: String) -> CheckRecord {
    subject.records.first { $0.checkId == checkId } ?? CheckRecord(checkId: checkId)
}
func stateOf(_ subject: VettingSubject, _ checkId: String) -> CheckState { resolveState(recordFor(subject, checkId)) }
/// A high-risk check is not verified on one person's say-so.
func needsSecondReviewer(_ subject: VettingSubject, _ checkId: String) -> Bool {
    guard let check = Vetting.check(subject.roleId, checkId) else { return false }
    let record = recordFor(subject, checkId)
    return check.isHighRisk && resolveState(record).passes && (record.secondedBy ?? "").isEmpty
}

// MARK: - The state of a whole party

enum SubjectStatus: String {
    case cleared, expiring, suspended, declined, inProgress = "in-progress"
    var label: String {
        switch self {
        case .cleared: return "Cleared"
        case .expiring: return "Renewal due"
        case .suspended: return "Suspended"
        case .declined: return "Declined"
        case .inProgress: return "In progress"
        }
    }
    var tone: String {
        switch self {
        case .cleared: return "teal"
        case .expiring: return "amber"
        case .suspended, .declined: return "danger"
        case .inProgress: return "sky"
        }
    }
}
struct CheckStanding: Identifiable, Hashable {
    let check: VettingCheck
    let state: CheckState
    let record: CheckRecord
    let awaitingSecond: Bool
    var id: String { check.id }
}
struct VettingSummary {
    let states: [CheckStanding]
    let status: SubjectStatus
    let blocking: [VettingCheck]
    let lapsed: [CheckStanding]
    let expiring: [CheckStanding]
    let awaitingSecond: [CheckStanding]
    let nextDue: CheckStanding?
    let passed: Int
    let total: Int
    var progress: Double { total == 0 ? 0 : Double(passed) / Double(total) }
    var cleared: Bool { status == .cleared || status == .expiring }
}
func summarise(_ subject: VettingSubject) -> VettingSummary {
    let checks = subject.role?.checks ?? []
    let states = checks.map { check -> CheckStanding in
        CheckStanding(check: check, state: stateOf(subject, check.id), record: recordFor(subject, check.id),
                      awaitingSecond: needsSecondReviewer(subject, check.id))
    }
    let lapsed = states.filter { $0.state == .lapsed }
    let declined = states.filter { $0.state == .declined }
    let expiring = states.filter { $0.state == .expiring }
    let awaitingSecond = states.filter(\.awaitingSecond)
    let blocking = states.filter { !$0.state.passes }.map(\.check)
    let status: SubjectStatus
    if subject.declined || !declined.isEmpty { status = .declined }
    else if subject.suspended || !lapsed.isEmpty { status = .suspended }
    else if !blocking.isEmpty || !awaitingSecond.isEmpty { status = .inProgress }
    else if !expiring.isEmpty { status = .expiring }
    else { status = .cleared }
    let nextDue = states.filter { $0.record.expiresOn != nil }
        .min { (daysUntil($0.record.expiresOn) ?? .max) < (daysUntil($1.record.expiresOn) ?? .max) }
    return VettingSummary(states: states, status: status, blocking: blocking, lapsed: lapsed, expiring: expiring,
                          awaitingSecond: awaitingSecond, nextDue: nextDue,
                          passed: states.filter { $0.state.passes }.count, total: checks.count)
}

// MARK: - The blocking matrix

/* This is the whole point of the module: not a list of documents, but a refusal with a reason
   attached to it, that other screens ask about before they offer an action. */
struct VettingDecision {
    let allowed: Bool
    let reason: String?
    let blockedBy: [VettingCheck]
}
func can(_ subject: VettingSubject, _ capabilityId: String) -> VettingDecision {
    let role = subject.role
    guard let grant = role?.grants.first(where: { $0.capability == capabilityId }) else {
        return VettingDecision(allowed: false, reason: "A \((role?.name ?? "party").lowercased()) is never granted this.", blockedBy: [])
    }
    let summary = summarise(subject)
    if subject.declined {
        return VettingDecision(allowed: false, reason: subject.declinedReason ?? grant.refusal, blockedBy: summary.blocking)
    }
    if subject.suspended {
        return VettingDecision(allowed: false, reason: subject.suspendedReason ?? grant.refusal, blockedBy: summary.blocking)
    }
    if !summary.lapsed.isEmpty {
        let names = summary.lapsed.map(\.check.name).joined(separator: " and ")
        return VettingDecision(allowed: false, reason: "\(names) lapsed. \(grant.refusal)", blockedBy: summary.lapsed.map(\.check))
    }
    if !summary.awaitingSecond.isEmpty {
        let names = summary.awaitingSecond.map(\.check.name).joined(separator: " and ")
        return VettingDecision(allowed: false, reason: "\(names) still needs a second reviewer. \(grant.refusal)", blockedBy: summary.awaitingSecond.map(\.check))
    }
    if !summary.blocking.isEmpty {
        return VettingDecision(allowed: false, reason: grant.refusal, blockedBy: summary.blocking)
    }
    return VettingDecision(allowed: true, reason: nil, blockedBy: [])
}
struct CapabilityDecision: Identifiable {
    let capability: VettingCapability
    let grant: VettingGrant
    let decision: VettingDecision
    var id: String { capability.id }
}
/// Every capability the role could hold, with the answer for this party. Drives the matrix view.
func decisions(_ subject: VettingSubject) -> [CapabilityDecision] {
    (subject.role?.grants ?? []).compactMap { grant in
        guard let capability = Vetting.capability(grant.capability) else { return nil }
        return CapabilityDecision(capability: capability, grant: grant, decision: can(subject, grant.capability))
    }
}

// MARK: - Append-only decision audit

/* docs/PRIVACY-AND-SECURITY.md lists an append-only audit as not built. This is the design of one:
   entries are only ever prepended, and nothing in the UI can reach back and rewrite a decision that
   was already taken. */
enum VettingEventKind: String {
    case submitted, verified, seconded, declined, suspended, restored, appealed, renewed, lapsed
    var label: String {
        switch self {
        case .submitted: return "Evidence submitted"
        case .verified: return "Check verified"
        case .seconded: return "Second reviewer agreed"
        case .declined: return "Declined"
        case .suspended: return "Suspended"
        case .restored: return "Restored"
        case .appealed: return "Appeal lodged"
        case .renewed: return "Renewed"
        case .lapsed: return "Lapsed automatically"
        }
    }
}
struct VettingEvent: Identifiable {
    let id: String
    let at: Date
    let subjectId: String
    let subjectName: String
    let roleId: String
    var checkId: String?
    let kind: VettingEventKind
    let actor: String
    var evidence: String?
    var note: String?
}
private let vettingTimeFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_ZA")
    formatter.dateFormat = "d MMM · HH:mm"
    return formatter
}()
func formatEventTime(_ date: Date) -> String { vettingTimeFormatter.string(from: date) }

// MARK: - The parties

/* Fictional parties, one per interesting state, so every refusal in the module can be seen rather
   than described. Nobody here is real; no credential here is valid anywhere. The construction
   mirrors the web fixtures exactly — only the exceptions are written out, and everything unnamed is
   verified, seconded where the risk demands it, and in date. */
enum VettingFixtures {
    static let reviewers = ["M. Sithole · Clinical Governance", "T. van Wyk · Compliance", "P. Mabaso · Clinical Director"]

    struct Override {
        var state: CheckState?
        var expiresOn: Date?
        var note: String?
        /// An override that removes the second reviewer, which is how "waiting on a second pair of
        /// eyes" is written without a state of its own.
        var clearSecond = false
    }
    private struct Seed {
        let id: String
        let name: String
        let roleId: String
        let reference: String
        var zone: String?
        var scope: [String] = []
        var suspended = false
        var suspendedReason: String?
        var declined = false
        var declinedReason: String?
        var appealed = false
        var overrides: [String: Override] = [:]
    }

    /* A verified check carries a real decision date and, where the check renews, a real expiry — so
       the countdown in the console is arithmetic rather than a label somebody typed.

       The decision date is held against the check's own cadence. Spreading every decision four to eight
       months back reads well until it meets a check that renews every six: an access role decided
       eight months ago is lapsed the moment it is written, and a fixture that suspends the reviewers
       by accident makes the console impossible to demonstrate. A check is decided at most two fifths
       of the way through its own cycle. */
    private static func defaultRecord(_ roleId: String, _ checkId: String, _ index: Int) -> CheckRecord {
        guard let check = Vetting.check(roleId, checkId) else { return CheckRecord(checkId: checkId) }
        let spread = 4 + (index % 5)
        let age = check.renewMonths.map { min(spread, max(1, Int(Double($0) * 0.4))) } ?? spread
        let decidedOn = VettingClock.inMonths(Double(-age))
        var record = CheckRecord(checkId: checkId, state: .verified, decidedOn: decidedOn,
                                 decidedBy: reviewers[index % reviewers.count], evidence: check.evidence)
        if let renewMonths = check.renewMonths { record.expiresOn = VettingClock.adding(months: renewMonths, to: decidedOn) }
        if check.isHighRisk { record.secondedBy = reviewers[(index + 1) % reviewers.count] }
        return record
    }
    private static func build(_ seed: Seed) -> VettingSubject {
        let checks = Vetting.role(seed.roleId)?.checks ?? []
        let records = checks.enumerated().map { offset, check -> CheckRecord in
            let base = defaultRecord(seed.roleId, check.id, offset + seed.id.count)
            guard let override = seed.overrides[check.id] else { return base }
            /* An override that only says "outstanding" should not keep the decision fields of a
               check nobody has decided. */
            var record = (override.state != nil && override.state != .verified) ? CheckRecord(checkId: check.id) : base
            if let state = override.state { record.state = state }
            if let expiresOn = override.expiresOn { record.expiresOn = expiresOn }
            if let note = override.note { record.note = note }
            if override.clearSecond { record.secondedBy = nil }
            return record
        }
        return VettingSubject(id: seed.id, name: seed.name, roleId: seed.roleId, reference: seed.reference,
                              zone: seed.zone, scope: seed.scope, records: records,
                              suspended: seed.suspended, suspendedReason: seed.suspendedReason,
                              declined: seed.declined, declinedReason: seed.declinedReason, appealed: seed.appealed)
    }

    static let subjects: [VettingSubject] = [
        build(Seed(id: "N-201", name: "Sister Thandeka Zulu", roleId: "nurse", reference: "SANC 20014477", zone: "Soweto",
                   scope: ["Chronic care", "Wound care"],
                   overrides: ["police-clearance": Override(state: .verified, expiresOn: VettingClock.inDays(21))])),   // renewal due, still dispatchable
        build(Seed(id: "N-202", name: "Sister Boitumelo Nkosi", roleId: "nurse", reference: "SANC 20019902", zone: "Randburg",
                   scope: ["Maternal & child"],
                   overrides: ["police-clearance": Override(state: .inReview), "references": Override(state: .submitted),
                               "kit-training": Override(state: .outstanding), "popia-training": Override(state: .outstanding)])),
        build(Seed(id: "N-203", name: "Brother Lwazi Mahlangu", roleId: "nurse", reference: "SANC 20007731", zone: "Tembisa",
                   scope: ["Post-operative", "Phlebotomy"],
                   overrides: ["sanc-registration": Override(clearSecond: true), "kit-training": Override(state: .inReview)])),  // waiting on a second reviewer
        build(Seed(id: "N-204", name: "Sister Ayanda Dube", roleId: "nurse", reference: "SANC 20022145", zone: "Soweto",
                   scope: ["Elderly care"],
                   overrides: ["police-clearance": Override(state: .verified, expiresOn: VettingClock.inDays(-9))])),   // lapsed: suspended automatically
        build(Seed(id: "N-205", name: "Sister Naledi Mokoena", roleId: "nurse", reference: "SANC 20016688", zone: "Rosebank",
                   scope: ["Wound care", "Chronic care"])),
        build(Seed(id: "N-206", name: "Sister Palesa Khumalo", roleId: "nurse", reference: "SANC 20011203", zone: "Soweto",
                   scope: ["Wound care", "Maternal & child"])),
        build(Seed(id: "N-207", name: "Sister Refilwe Sithole", roleId: "nurse", reference: "SANC 20018844", zone: "Randburg",
                   scope: ["Chronic care", "Paediatric"])),
        build(Seed(id: "N-208", name: "Brother Sipho Ndlovu", roleId: "nurse", reference: "SANC 20013390", zone: "Melville",
                   scope: ["Post-operative", "Chronic care"],
                   overrides: ["indemnity": Override(state: .verified, expiresOn: VettingClock.inDays(33))])),
        build(Seed(id: "N-209", name: "Sister Zanele Mkhize", roleId: "nurse", reference: "SANC 20024401", zone: "Alexandra",
                   scope: ["Chronic care"],
                   declined: true, declinedReason: "Two clinical references could not be confirmed with the institutions named.", appealed: true,
                   overrides: ["references": Override(state: .declined, note: "Referee could not confirm the applicant worked in the unit stated.")])),
        build(Seed(id: "L-301", name: "Sister Karabo Mothibi", roleId: "locum", reference: "SANC 20016688", zone: "Roodepoort",
                   scope: ["Chronic care", "Paediatric"])),
        build(Seed(id: "L-302", name: "Sister Nokuthula Baloyi", roleId: "locum", reference: "SANC 20026117", zone: "Midrand",
                   scope: ["Wound care"],
                   overrides: ["shift-eligibility": Override(state: .inReview, note: "Declared 44 hours a week elsewhere. Clinical Director reviewing.")])),
        build(Seed(id: "D-401", name: "Dr Ayanda Dlamini", roleId: "doctor", reference: "HPCSA MP0483217",
                   scope: ["General practice", "Telemedicine"])),
        build(Seed(id: "D-402", name: "Dr Sanjay Naidoo", roleId: "doctor", reference: "HPCSA MP0559104",
                   scope: ["General practice"],
                   overrides: ["hpcsa-registration": Override(state: .verified, expiresOn: VettingClock.inDays(-4))])),  // lapsed: the queue refuses the signature
        build(Seed(id: "D-403", name: "Dr Lerato Khumalo", roleId: "doctor", reference: "HPCSA MP0612885",
                   scope: ["Family medicine"],
                   overrides: ["prescribing-authority": Override(state: .inReview), "cpd": Override(state: .submitted)])),
        build(Seed(id: "P-501", name: "Rosebank Community Pharmacy", roleId: "pharmacy", reference: "SAPC Y041882", zone: "Rosebank")),
        build(Seed(id: "P-502", name: "Diepkloof Family Pharmacy", roleId: "pharmacy", reference: "SAPC Y058317", zone: "Soweto",
                   overrides: ["responsible-pharmacist": Override(state: .inReview, note: "Named pharmacist resigned. A replacement has been proposed."),
                               "cold-chain": Override(state: .submitted)])),
        build(Seed(id: "B-601", name: "Highveld Pathology", roleId: "laboratory", reference: "SANAS M0521", zone: "Parktown")),
        build(Seed(id: "B-602", name: "Vaal Diagnostics", roleId: "laboratory", reference: "SANAS M0744", zone: "Vereeniging",
                   overrides: ["iso-15189": Override(state: .verified, expiresOn: VettingClock.inDays(-31))])),          // lapsed: results stay held
        build(Seed(id: "C-701", name: "Mandla Nkuna", roleId: "courier", reference: "PDP 401220118834", zone: "Johannesburg")),
        build(Seed(id: "C-702", name: "Johannes Pretorius", roleId: "courier", reference: "PDP 401993220117", zone: "Ekurhuleni",
                   overrides: ["cold-chain-training": Override(state: .outstanding), "vehicle": Override(state: .inReview)])),
        build(Seed(id: "O-801", name: "Kagiso Molefe", roleId: "operator", reference: "Staff 0114", zone: "Control Tower")),
        build(Seed(id: "O-802", name: "Michelle Fourie", roleId: "operator", reference: "Staff 0139", zone: "Control Tower",
                   overrides: ["escalation-training": Override(state: .verified, expiresOn: VettingClock.inDays(12))])),
        build(Seed(id: "A-901", name: "Thandi van Wyk", roleId: "admin", reference: "Staff 0102")),
        build(Seed(id: "A-902", name: "Bongani Mthembu", roleId: "admin", reference: "Staff 0147",
                   overrides: ["access-role": Override(state: .inReview, note: "Requested access to the clinical queue. Least privilege being reassessed.")])),
        build(Seed(id: "E-011", name: "Ubuntu Logistics (Pty) Ltd", roleId: "employer", reference: "CIPC 2019/443871/07",
                   overrides: ["operator-agreement": Override(state: .inReview), "aggregate-only": Override(state: .submitted)])),
        build(Seed(id: "E-012", name: "Highveld Mining Services", roleId: "employer", reference: "CIPC 2014/118203/07")),
        build(Seed(id: "S-021", name: "Themba Molefe", roleId: "sponsor", reference: "Sponsor 0231",
                   overrides: ["recipient-consent": Override(state: .inReview, note: "Waiting for the recipient to confirm in their own account.")])),
        build(Seed(id: "S-022", name: "Zodwa Radebe", roleId: "sponsor", reference: "Sponsor 0244")),
        build(Seed(id: "G-031", name: "Nomsa Molefe", roleId: "guardian", reference: "Guardian 0118",
                   overrides: ["legal-authority": Override(state: .submitted, note: "Unabridged birth certificate uploaded; awaiting document check."),
                               "relationship": Override(state: .outstanding)])),
        build(Seed(id: "G-032", name: "Elizabeth Sithole", roleId: "guardian", reference: "Guardian 0126")),
        build(Seed(id: "T-041", name: "Thuso Corner · Diepkloof", roleId: "corner", reference: "Site 0007", zone: "Soweto")),
        build(Seed(id: "T-042", name: "Thuso Corner · Ivory Park", roleId: "corner", reference: "Site 0011", zone: "Tembisa",
                   overrides: ["privacy-layout": Override(state: .declined, note: "The consulting room opens onto the queue. Re-inspection after alterations."),
                               "waste-disposal": Override(state: .submitted)]))
    ]

    /// A short history so the audit view has something to show on open, in the order it happened.
    static let log: [VettingEvent] = [
        VettingEvent(id: "VE-00001", at: VettingClock.inDays(-31), subjectId: "B-602", subjectName: "Vaal Diagnostics", roleId: "laboratory", checkId: "iso-15189", kind: .lapsed, actor: "System · scheduled re-vetting", note: "SANAS accreditation expired. Result release withdrawn; held results stay held."),
        VettingEvent(id: "VE-00002", at: VettingClock.inDays(-16), subjectId: "N-209", subjectName: "Sister Zanele Mkhize", roleId: "nurse", checkId: "references", kind: .declined, actor: "P. Mabaso · Clinical Director", evidence: "Two named referees", note: "Referee could not confirm the applicant worked in the unit stated."),
        VettingEvent(id: "VE-00003", at: VettingClock.inDays(-11), subjectId: "N-209", subjectName: "Sister Zanele Mkhize", roleId: "nurse", kind: .appealed, actor: "Sister Zanele Mkhize", note: "Applicant states the unit was renamed. New referee details supplied."),
        VettingEvent(id: "VE-00004", at: VettingClock.inDays(-9), subjectId: "N-204", subjectName: "Sister Ayanda Dube", roleId: "nurse", checkId: "police-clearance", kind: .lapsed, actor: "System · scheduled re-vetting", note: "SAPS clearance passed its renewal date. Removed from dispatch automatically."),
        VettingEvent(id: "VE-00005", at: VettingClock.inDays(-6), subjectId: "T-042", subjectName: "Thuso Corner · Ivory Park", roleId: "corner", checkId: "privacy-layout", kind: .declined, actor: "T. van Wyk · Compliance", evidence: "Floor plan and inspection sign-off", note: "The consulting room opens onto the queue. Re-inspection after alterations."),
        VettingEvent(id: "VE-00006", at: VettingClock.inDays(-4), subjectId: "D-402", subjectName: "Dr Sanjay Naidoo", roleId: "doctor", checkId: "hpcsa-registration", kind: .lapsed, actor: "System · scheduled re-vetting", note: "HPCSA registration not renewed. Sign-off withdrawn."),
        VettingEvent(id: "VE-00007", at: VettingClock.inDays(-3), subjectId: "N-201", subjectName: "Sister Thandeka Zulu", roleId: "nurse", checkId: "sanc-registration", kind: .seconded, actor: "M. Sithole · Clinical Governance", note: "Second reviewer agreed. Registration current on the SANC register.")
    ].sorted { $0.at > $1.at }
}

// MARK: - One live pipeline the whole preview shares

/* Dispatch, the clinical queue and the vetting console must answer from the same record, or gating
   is a second list that agrees by luck. One store, held in memory for the life of the app, so a
   decision taken in the console is refused — or allowed — on the dispatch board a moment later. */
@MainActor final class VettingStore: ObservableObject {
    static let shared = VettingStore()
    @Published var subjects: [VettingSubject] = VettingFixtures.subjects
    @Published var log: [VettingEvent] = VettingFixtures.log
    /// Who is deciding. A high-risk check needs two different people, so the reviewer is a choice.
    @Published var reviewer: String = VettingFixtures.reviewers[0]
    private var sequence = VettingFixtures.log.count

    func subject(_ id: String) -> VettingSubject? { subjects.first { $0.id == id } }
    func subject(named name: String) -> VettingSubject? { subjects.first { $0.name == name } }
    func subjects(role roleId: String) -> [VettingSubject] { subjects.filter { $0.roleId == roleId } }
    /// Named rather than `can` so the free function above is never shadowed at a call site.
    func decision(for subjectName: String, _ capability: String) -> VettingDecision? {
        subject(named: subjectName).map { can($0, capability) }
    }

    private func mutate(_ id: String, _ change: (inout VettingSubject) -> Void) {
        guard let index = subjects.firstIndex(where: { $0.id == id }) else { return }
        change(&subjects[index])
    }
    private func record(_ subject: VettingSubject, _ kind: VettingEventKind, checkId: String? = nil, actor: String? = nil, evidence: String? = nil, note: String? = nil) {
        sequence += 1
        log.insert(VettingEvent(id: String(format: "VE-%05d", sequence), at: Date(), subjectId: subject.id,
                                subjectName: subject.name, roleId: subject.roleId, checkId: checkId, kind: kind,
                                actor: actor ?? reviewer, evidence: evidence, note: note), at: 0)
    }

    func submit(_ id: String, check checkId: String, evidence: String?) {
        guard let subject = subject(id) else { return }
        mutate(id) { party in
            guard let index = party.records.firstIndex(where: { $0.checkId == checkId }) else { return }
            party.records[index].state = .submitted
            party.records[index].evidence = evidence
        }
        record(subject, .submitted, checkId: checkId, actor: subject.name, evidence: evidence)
    }
    func verify(_ id: String, check checkId: String) {
        guard let subject = subject(id), let check = Vetting.check(subject.roleId, checkId) else { return }
        let renewed = recordFor(subject, checkId).decidedOn != nil
        mutate(id) { party in
            guard let index = party.records.firstIndex(where: { $0.checkId == checkId }) else { return }
            party.records[index].state = .verified
            party.records[index].decidedOn = VettingClock.today
            party.records[index].decidedBy = self.reviewer
            /* Verifying afresh clears the old second opinion: the point of two reviewers is that
               both looked at this decision, not at a previous one. */
            party.records[index].secondedBy = nil
            party.records[index].expiresOn = check.renewMonths.map { VettingClock.adding(months: $0, to: VettingClock.today) }
            party.suspended = false
            party.declined = false
        }
        record(subject, renewed ? .renewed : .verified, checkId: checkId, evidence: check.evidence)
    }
    /// Refused when the same person tries to agree with themselves, which is the entire point.
    @discardableResult func second(_ id: String, check checkId: String) -> Bool {
        guard let subject = subject(id) else { return false }
        guard recordFor(subject, checkId).decidedBy != reviewer else { return false }
        mutate(id) { party in
            guard let index = party.records.firstIndex(where: { $0.checkId == checkId }) else { return }
            party.records[index].secondedBy = self.reviewer
        }
        record(subject, .seconded, checkId: checkId)
        return true
    }
    func decline(_ id: String, check checkId: String, reason: String) {
        guard let subject = subject(id) else { return }
        mutate(id) { party in
            guard let index = party.records.firstIndex(where: { $0.checkId == checkId }) else { return }
            party.records[index].state = .declined
            party.records[index].note = reason
            party.declined = true
            party.declinedReason = reason
        }
        record(subject, .declined, checkId: checkId, note: reason)
    }
    func appeal(_ id: String, note: String) {
        guard let subject = subject(id) else { return }
        mutate(id) { $0.appealed = true }
        record(subject, .appealed, actor: subject.name, note: note)
    }
    func add(_ subject: VettingSubject) {
        subjects.insert(subject, at: 0)
        record(subject, .submitted, actor: subject.name, note: "Application submitted for \(subject.role?.name ?? subject.roleId) vetting.")
    }
}
