import Foundation

/* The reasoning about the record contract, and the fictional patients it is demonstrated on. The
   contract itself is transcribed in RecordsData.swift; this file is what is not in the catalogue.

   Two things here are not in records.json, and both matter.

   The first is that sensitivity is classified twice. A record *type* carries a class — a
   consultation is clinical, social support is protected — and that class is a floor rather than a
   ceiling. records.json says so itself, in the chronic-condition entry: “HIV and mental-health
   conditions are protected and are held separately.” So an individual entry may raise its own
   class above its type's, and everything downstream resolves the higher of the two.

   The second is that vetting is not the only gate on a protected category. vetting.json's own
   refusal says it plainly — “A protected category is released by the patient, entry by entry. It
   is never opened by a scope, however senior the nurse.” A cleared nurse therefore passes
   can(subject, "view-protected-record") and still sees nothing, because the patient has released
   nothing to her. The capability says the party is fit to be trusted with the category; the
   release says this patient trusted this party with this entry.

   Fictional patients, fictional numbers, nothing read from or written to anywhere. */

// MARK: - Sensitivity

/// Anything in the file that can be withheld. The three properties are the whole of what the
/// gating needs to know about an entry, whatever kind of entry it is.
protocol RecordEntry {
    var typeId: String { get }
    /// A class this one entry raises itself to, above its type's. Never below.
    var raised: RecordSensitivity? { get }
    /// The parties this patient released this entry to, by id. Not a scope, and not a role.
    var releasedTo: [String] { get }
}

extension Records {
    static func type(_ id: String) -> RecordType? { types.first { $0.id == id } }
    static func area(_ id: String) -> RecordArea? { areas.first { $0.id == id } }
    static func sensitivity(_ id: RecordSensitivity) -> RecordSensitivityClass { sensitivities.first { $0.id == id }! }
    static func types(in areaId: String) -> [RecordType] { types.filter { $0.area == areaId } }
    static var protectedTypes: [RecordType] { types.filter { $0.sensitivity == .protected } }
    /// The categories the header refuses to name, held as the contract's list rather than as prose.
    /* The contract's named categories, plus the record types that are protected in their own right —
       a type is a category the moment it is the only thing in it. Composed once, here, because a
       notice that names seven things on one screen and eight on the next is a reader wondering which
       screen is lying to them. Web computes the same list the same way. */
    static var protectedCategories: [String] {
        var seen = Set<String>()
        return (sensitivity(.protected).categories + protectedTypes.map(\.name)).filter { seen.insert($0).inserted }
    }
}

private let sensitivityRank: [RecordSensitivity: Int] = [.routine: 0, .clinical: 1, .protected: 2]
/// An entry is at least as sensitive as its type, and may be more. Nothing may be less.
func sensitivityOf(_ typeId: String, _ raised: RecordSensitivity? = nil) -> RecordSensitivity {
    let type = Records.type(typeId)?.sensitivity ?? .clinical
    guard let raised, (sensitivityRank[raised] ?? 0) > (sensitivityRank[type] ?? 0) else { return type }
    return raised
}
func isProtected(_ entry: RecordEntry) -> Bool { sensitivityOf(entry.typeId, entry.raised) == .protected }

// MARK: - Gating

/* A record type names its capabilities. Any one of them opens it: the medication tab is reached
   through view-clinical-record by a doctor and through dispense by a pharmacy, and vetting.json
   says as much — “A pharmacy sees the prescription and the allergies that bear on filling it.”
   When every route is refused the first refusal is the one shown, because the first capability
   listed is the one the reader was most likely reaching for. */
func canAny(_ subject: VettingSubject, _ capabilities: [String]) -> VettingDecision {
    let decisions = capabilities.map { can(subject, $0) }
    return decisions.first(where: \.allowed)
        ?? decisions.first
        ?? VettingDecision(allowed: false, reason: "No capability governs this.", blockedBy: [])
}
func canOpenRecord(_ subject: VettingSubject, _ typeId: String) -> VettingDecision {
    canAny(subject, Records.type(typeId)?.gatedBy ?? ["view-clinical-record"])
}
/// The written sentence a role is refused a protected category with, taken from the vetting
/// contract rather than composed here, so the refusal reads the same wherever it is shown.
func releaseRefusal(_ roleId: String) -> String {
    Vetting.role(roleId)?.grants.first { $0.capability == "view-protected-record" }?.refusal
        ?? "A protected category is released by the patient, entry by entry."
}
/* Vetting first, then the patient. Passing the first and failing the second is the normal case,
   not an error state — it is what “released by the patient” means when nobody has released
   anything. */
func canOpenProtected(_ subject: VettingSubject, _ entry: RecordEntry) -> VettingDecision {
    let vetted = can(subject, "view-protected-record")
    guard vetted.allowed else { return vetted }
    if entry.releasedTo.contains(subject.id) { return VettingDecision(allowed: true, reason: nil, blockedBy: []) }
    return VettingDecision(allowed: false, reason: releaseRefusal(subject.roleId), blockedBy: [])
}
/// One decision for any item in the file, whatever its class. Protected items are never resolved
/// by the type's own capability — that is the whole point of the third class.
func canOpen(_ subject: VettingSubject, _ entry: RecordEntry) -> VettingDecision {
    isProtected(entry) ? canOpenProtected(subject, entry) : canOpenRecord(subject, entry.typeId)
}

// MARK: - The eight tabs

/* Keyed off the contract's navigation array rather than a second list of names, so a tab cannot be
   renamed here and stay Overview there.

   Referrals is the one tab gated on making one rather than reading one. records.json separates the
   two — a referral opens with the clinical record, and `writtenBy` marks refer-patient as what it
   takes to raise one — so gating the tab on refer-patient is narrower than the contract asks. It
   is written down here, and said on the tab, rather than quietly loosened in one app and not the
   others. */
struct PatientFileTab: Identifiable, Hashable {
    let name: String
    let capabilities: [String]
    let holds: String
    let notBuilt: String
    var id: String { name }
}
private let tabGates: [String: [String]] = [
    "Overview": ["view-patient-summary"],
    "Timeline": ["view-clinical-record"],
    "Consultations": ["view-clinical-record"],
    "Medication": ["view-clinical-record", "dispense"],
    "Results": ["view-results"],
    "Referrals": ["refer-patient"],
    "Documents": ["view-clinical-record"],
    "Billing": ["view-billing"]
]
private let tabCopy: [String: (String, String)] = [
    "Overview": ("The summary card from the contract: identity, allergies, current medicine, one contact, the last visit, the next appointment and the latest observations.",
                 "Nothing here is editable, and no action leaves the phone."),
    "Timeline": ("Every consultation, test, prescription, referral and document this viewer may open, newest first, each carrying its record type.",
                 "Filtering is by record type only. Date ranges, search across notes and a printable extract are not built."),
    "Consultations": ("Encounters in the standardised structure — the same twelve sections whoever writes them, with SOAP as the reading order.",
                      "Writing a consultation is a separate surface. This one reads."),
    "Medication": ("Current and past medicine with dose, frequency, repeats and the prescribing clinician, plus what a pharmacy actually handed over.",
                   "Interaction checking, substitution and chronic authorisation are not built."),
    "Results": ("Laboratory and imaging reports with reference ranges, and who released them.",
                "Trend comparison across a whole panel, cumulative reports and imaging viewers are not built."),
    "Referrals": ("Who the patient was sent to, why, how urgently, and what came back.",
                  "Booking the receiving appointment and tracking the reply letter are not built."),
    "Documents": ("Consent forms, referral letters, scheme cards, certificates and reports held against this patient.",
                  "Nothing can be uploaded, opened or downloaded here; the files are titles only."),
    "Billing": ("Invoices, claims and authorisations, by service code and amount.",
                "Submitting a claim, reconciling a payment and appealing a rejection are not built.")
]
extension Records {
    static let fileTabs: [PatientFileTab] = navigation.map { name in
        PatientFileTab(name: name, capabilities: tabGates[name] ?? ["view-patient-summary"],
                       holds: tabCopy[name]?.0 ?? "", notBuilt: tabCopy[name]?.1 ?? "")
    }
}
func canOpenTab(_ subject: VettingSubject, _ tab: PatientFileTab) -> VettingDecision { canAny(subject, tab.capabilities) }

// MARK: - Actions

/* The action row. Every one of them is a capability before it is a button: uploading a document is
   writing into somebody's record, and booking a visit is sending a named person to a named
   address, which is the most sensitive thing this platform does. */
struct PatientFileAction: Identifiable, Hashable {
    let label: String
    let capability: String
    let detail: String
    let symbol: String
    var id: String { label }
}
extension Records {
    static let fileActions: [PatientFileAction] = [
        .init(label: "New consultation", capability: "write-clinical-note",
              detail: "Open the standardised encounter under your own registration", symbol: "stethoscope"),
        .init(label: "Prescription", capability: "prescribe",
              detail: "Issue medicine against this patient", symbol: "pills"),
        .init(label: "Referral", capability: "refer-patient",
              detail: "Send this patient to another provider", symbol: "paperplane"),
        .init(label: "Upload document", capability: "write-clinical-note",
              detail: "Add a letter, report or consent form to the file", symbol: "square.and.arrow.up"),
        .init(label: "Book a visit", capability: "dispatch-nurses",
              detail: "Send a nurse to this address in a chosen window", symbol: "mappin.and.ellipse")
    ]
}

// MARK: - The record shapes

struct Allergy: Hashable {
    let substance: String
    let reaction: String
    let severity: String
}
struct ConditionEntry: RecordEntry, Identifiable, Hashable {
    let typeId: String
    var raised: RecordSensitivity?
    var releasedTo: [String] = []
    let name: String
    let since: String
    let managedBy: String
    let status: String
    var id: String { name }
}
struct Medicine: RecordEntry, Identifiable, Hashable {
    let typeId: String
    var raised: RecordSensitivity?
    var releasedTo: [String] = []
    let at: String
    let name: String
    let dose: String
    let frequency: String
    let started: String
    let repeats: String
    let prescriber: String
    var dispensedBy: String?
    var stopped: String?
    var id: String { name }
}
struct VitalSet: Identifiable, Hashable {
    let at: String
    let systolic: Double
    let diastolic: Double
    let pulse: Double
    let temperature: Double
    let weight: Double
    let oxygen: Double
    /* Six numbers used to be six numbers. They are not: packages/catalog/capture.json says every
       reading carries exactly one provenance and that there is no default and no unknown, so a set
       carries where each of its readings came from and a reading with no entry here is not shown as
       a finding. The absence is the point — a dictionary with nothing under "weight" is how “nobody
       said” is written down, and originOf returns nil for it rather than quietly answering
       “a clinician”.

       A home visit is where this stops being theoretical. A nurse arrives with a manual cuff and an
       oximeter, and the weight is whatever the patient's own bathroom scale said this morning. That
       is three origins in one set of vitals, and a record that flattens them into one has thrown
       away the only thing that tells the next clinician which numbers to trust for what. */
    let origin: [String: Provenance]
    /// Named where an instrument took them, with what its calibration was on the day.
    var instrument: String?
    var calibrationNote: String?
    var id: String { at }
}
/// nil is a real answer and callers must handle it. See the comment above.
func originOf(_ set: VitalSet, _ observationId: String) -> Provenance? { set.origin[observationId] }
extension VitalSet {
    private static let all = ["systolic", "diastolic", "pulse", "temperature", "weight", "oxygen"]
    private static func every(_ provenance: Provenance) -> [String: Provenance] {
        Dictionary(uniqueKeysWithValues: all.map { ($0, provenance) })
    }
    /// A whole set off one paired instrument, which is what a fully equipped visit produces.
    static func measured(at: String, systolic: Double, diastolic: Double, pulse: Double, temperature: Double,
                         weight: Double, oxygen: Double, instrument: String, calibrationNote: String? = nil) -> VitalSet {
        VitalSet(at: at, systolic: systolic, diastolic: diastolic, pulse: pulse, temperature: temperature,
                 weight: weight, oxygen: oxygen, origin: every(.device), instrument: instrument,
                 calibrationNote: calibrationNote)
    }
    /// A whole set taken by hand. Not a lesser set — most home visits in this country are this one.
    static func byHand(at: String, systolic: Double, diastolic: Double, pulse: Double, temperature: Double,
                       weight: Double, oxygen: Double) -> VitalSet {
        VitalSet(at: at, systolic: systolic, diastolic: diastolic, pulse: pulse, temperature: temperature,
                 weight: weight, oxygen: oxygen, origin: every(.manual))
    }
    /// Some of each, named one by one, because that is what actually happens in a front room.
    static func mixed(at: String, systolic: Double, diastolic: Double, pulse: Double, temperature: Double,
                      weight: Double, oxygen: Double, origin: [String: Provenance],
                      instrument: String? = nil, calibrationNote: String? = nil) -> VitalSet {
        VitalSet(at: at, systolic: systolic, diastolic: diastolic, pulse: pulse, temperature: temperature,
                 weight: weight, oxygen: oxygen, origin: origin, instrument: instrument,
                 calibrationNote: calibrationNote)
    }
}
struct ConsultationEntry: RecordEntry, Identifiable, Hashable {
    let typeId: String
    var raised: RecordSensitivity?
    var releasedTo: [String] = []
    let id: String
    let at: String
    let kind: String
    let by: String
    let registration: String
    let place: String
    let reason: String
    let assessment: String
    let plan: String
    /// Which of the twelve sections this encounter actually carries.
    let sections: [String]
}
struct ResultRow: Identifiable, Hashable {
    let name: String
    let value: String
    let range: String
    var flag: String?
    var id: String { name }
}
struct LabReport: RecordEntry, Identifiable, Hashable {
    let typeId: String
    var raised: RecordSensitivity?
    var releasedTo: [String] = []
    let id: String
    let at: String
    let name: String
    let source: String
    let status: String
    let releasedBy: String
    let rows: [ResultRow]
}
struct ReferralRow: RecordEntry, Identifiable, Hashable {
    let typeId: String
    var raised: RecordSensitivity?
    var releasedTo: [String] = []
    let id: String
    let at: String
    let to: String
    let reason: String
    let urgency: String
    let status: String
    let by: String
}
struct DocumentRow: RecordEntry, Identifiable, Hashable {
    let typeId: String
    var raised: RecordSensitivity?
    var releasedTo: [String] = []
    let id: String
    let at: String
    let name: String
    let kind: String
    let by: String
}
struct BillingLine: RecordEntry, Identifiable, Hashable {
    let typeId: String
    var raised: RecordSensitivity?
    var releasedTo: [String] = []
    let id: String
    let at: String
    let code: String
    let service: String
    let amount: Int
    let payer: String
    let status: String
    var note: String?
}
struct CareTeamMember: Identifiable, Hashable {
    let name: String
    let role: String
    let since: String
    var id: String { name }
}
struct MedicalAid: Hashable {
    let scheme: String
    let plan: String
    let member: String
    let status: String
    var tone: String = "teal"
}
struct EmergencyContact: Hashable {
    let name: String
    let relationship: String
    let mobile: String
}
struct LastVisit: Hashable {
    let at: String
    let service: String
    let by: String
    let outcome: String
}
struct NextAppointment: Hashable {
    let at: String
    let time: String
    let service: String
    let place: String
}
struct PatientRecord: Identifiable, Hashable {
    let id: String
    let name: String
    let dob: String
    let sex: String
    let mobile: String
    let address: String
    let facility: String
    let bloodGroup: String
    let medicalAid: MedicalAid
    let emergency: EmergencyContact
    let service: String
    let window: String
    let allergies: [Allergy]
    let conditions: [ConditionEntry]
    let medication: [Medicine]
    let vitals: [VitalSet]
    let careTeam: [CareTeamMember]
    let summaryPoints: [String]
    let lastVisit: LastVisit
    let nextAppointment: NextAppointment?
    let consultations: [ConsultationEntry]
    let results: [LabReport]
    let referrals: [ReferralRow]
    let documents: [DocumentRow]
    let billing: [BillingLine]
    var initials: String { name.split(separator: " ").prefix(2).compactMap { $0.first }.map(String.init).joined() }
}

// MARK: - Fixtures

/* Three fictional patients, the same three the web preview carries, so the two apps demonstrate
   the same cases. One carries nothing protected, one carries three protected entries and one
   carries a fourth, and the header reads identically on all three — which is the point. A notice
   that appeared only when there was something behind it would disclose the thing it is hiding, so
   it appears always.

   Dates are written out rather than held relative to today, because a clinical file that reads
   “next appointment in 11 days” every time it is opened is a demo, and a file dated 18 September
   2026 is a file. They will go stale, and they are fictional anyway. */
enum PatientFixtures {
    static let all: [PatientRecord] = [thando, sipho, lindiwe]
    static func patient(_ id: String) -> PatientRecord? { all.first { $0.id == id } }

    static let thando = PatientRecord(
        id: "THU-0001842", name: "Thando Mokoena", dob: "1987-05-14", sex: "Female", mobile: "082 431 7789",
        address: "14 Mofolo Street, Orlando East, Soweto", facility: "Thuso Health Soweto", bloodGroup: "O+",
        medicalAid: MedicalAid(scheme: "Discovery Health", plan: "Classic Comprehensive",
                               member: "0142 887 331 · dependant 00", status: "Active"),
        emergency: EmergencyContact(name: "Nomsa Mokoena", relationship: "Mother", mobile: "083 552 1140"),
        service: "Vitals & chronic check", window: "Fri 18 Sep, 10:30 – 11:15",
        allergies: [Allergy(substance: "Penicillin", reaction: "Rash and facial swelling", severity: "Severe")],
        conditions: [
            ConditionEntry(typeId: "chronic-condition", raised: nil, name: "Hypertension", since: "March 2021",
                           managedBy: "Dr N. Dlamini", status: "Controlled")
        ],
        medication: [
            Medicine(typeId: "prescription", raised: nil, at: "2026-09-04", name: "Amlodipine", dose: "5 mg",
                     frequency: "Once daily, morning", started: "March 2021", repeats: "5 of 6 remaining",
                     prescriber: "Dr N. Dlamini · HPCSA MP0483217",
                     dispensedBy: "Rosebank Community Pharmacy · 4 Sep 2026"),
            Medicine(typeId: "prescription", raised: nil, at: "2026-06-12", name: "Hydrochlorothiazide", dose: "12.5 mg",
                     frequency: "Once daily, morning", started: "March 2021", repeats: "—",
                     prescriber: "Dr N. Dlamini · HPCSA MP0483217", stopped: "June 2026")
        ],
        vitals: [
            VitalSet.byHand(at: "2026-06-12", systolic: 142, diastolic: 91, pulse: 78, temperature: 36.8, weight: 73.4, oxygen: 97),
            VitalSet.byHand(at: "2026-07-10", systolic: 136, diastolic: 88, pulse: 76, temperature: 36.6, weight: 72.8, oxygen: 98),
            VitalSet.measured(at: "2026-08-07", systolic: 131, diastolic: 85, pulse: 79, temperature: 36.9, weight: 72.1, oxygen: 98,
                              instrument: "Blood-pressure monitor · BP-4471-0092"),
            /* The interesting set, and the ordinary one: a manual blood pressure, an oximeter for the
               pulse and the saturation, a thermometer, and a weight the patient read off her own
               bathroom scale before the nurse arrived. Four origins, one visit, and the file says
               so rather than presenting all six as though somebody measured them. */
            VitalSet.mixed(at: "2026-09-04", systolic: 128, diastolic: 82, pulse: 74, temperature: 36.7, weight: 71.5, oxygen: 98,
                           origin: ["systolic": .manual, "diastolic": .manual, "pulse": .device,
                                    "oxygen": .device, "temperature": .device, "weight": .patientReported],
                           instrument: "Pulse oximeter · OX-2210-0417 and infrared thermometer · TH-8802-1130",
                           calibrationNote: "Both instruments were in calibration on the day.")
        ],
        careTeam: [
            CareTeamMember(name: "Dr N. Dlamini", role: "Treating doctor · General practice", since: "March 2021"),
            CareTeamMember(name: "Sister Thandeka Zulu", role: "Registered nurse · Chronic care", since: "June 2026")
        ],
        summaryPoints: [
            "Hypertension controlled on amlodipine 5 mg. Systolic 142 → 128 over three months, on four recorded readings.",
            "Penicillin allergy recorded 2019: rash and facial swelling. An alternative antibiotic is required, and the pharmacy is shown this before anything else.",
            "Hydrochlorothiazide stopped in June 2026 for postural dizziness. The reason is recorded rather than left to be inferred from the gap.",
            "No admission, procedure or imaging on file."
        ],
        lastVisit: LastVisit(at: "2026-09-04", service: "Chronic hypertension review", by: "Dr N. Dlamini",
                             outcome: "Continue amlodipine 5 mg. Dietitian referral raised."),
        nextAppointment: NextAppointment(at: "2026-09-18", time: "10:30", service: "Vitals & chronic check · home visit",
                                         place: "Thuso Health Soweto · Sister Thandeka Zulu"),
        consultations: [
            ConsultationEntry(typeId: "consultation", raised: nil, id: "ENC-4412", at: "2026-09-04",
                              kind: "Doctor review · telehealth", by: "Dr N. Dlamini", registration: "HPCSA MP0483217",
                              place: "Thuso Health Soweto", reason: "Three-monthly hypertension review",
                              assessment: "Hypertension, controlled. No end-organ symptoms reported.",
                              plan: "Continue amlodipine 5 mg daily. Dietitian referral. Review in 14 days.",
                              sections: ["reason", "history", "observations", "examination", "assessment", "plan", "medication", "referral", "followup", "clinician"]),
            ConsultationEntry(typeId: "home-visit", raised: nil, id: "ENC-4380", at: "2026-08-07",
                              kind: "Nurse home visit", by: "Sister Thandeka Zulu", registration: "SANC 20014477",
                              place: "14 Mofolo Street, Orlando East", reason: "Routine chronic observations",
                              assessment: "Readings within the indicative range. Escalation not required.",
                              plan: "Continue current medicine. Next observations in four weeks.",
                              sections: ["reason", "history", "observations", "assessment", "plan", "followup", "clinician"]),
            ConsultationEntry(typeId: "consultation", raised: nil, id: "ENC-4291", at: "2026-06-12",
                              kind: "Doctor review · telehealth", by: "Dr N. Dlamini", registration: "HPCSA MP0483217",
                              place: "Thuso Health Soweto", reason: "Postural dizziness on waking",
                              assessment: "Likely postural hypotension on combined therapy.",
                              plan: "Stop hydrochlorothiazide. Continue amlodipine. Repeat U&E in eight weeks.",
                              sections: ["reason", "history", "observations", "examination", "assessment", "plan", "medication", "tests", "followup", "clinician"])
        ],
        results: [
            LabReport(typeId: "laboratory", raised: nil, id: "LAB-1188", at: "2026-08-28",
                      name: "Urea, electrolytes and creatinine", source: "Highveld Pathology", status: "Released",
                      releasedBy: "Dr N. Dlamini · 29 Aug 2026",
                      rows: [ResultRow(name: "Sodium", value: "139 mmol/L", range: "135 – 145"),
                             ResultRow(name: "Potassium", value: "4.2 mmol/L", range: "3.5 – 5.1"),
                             ResultRow(name: "Creatinine", value: "74 µmol/L", range: "49 – 90"),
                             ResultRow(name: "eGFR", value: "> 90 mL/min", range: "> 90")]),
            LabReport(typeId: "laboratory", raised: nil, id: "LAB-1104", at: "2026-06-14",
                      name: "Lipogram", source: "Highveld Pathology", status: "Released",
                      releasedBy: "Dr N. Dlamini · 15 Jun 2026",
                      rows: [ResultRow(name: "Total cholesterol", value: "5.4 mmol/L", range: "< 5.0", flag: "high"),
                             ResultRow(name: "LDL cholesterol", value: "3.6 mmol/L", range: "< 3.0", flag: "high"),
                             ResultRow(name: "HDL cholesterol", value: "1.4 mmol/L", range: "> 1.2"),
                             ResultRow(name: "Triglycerides", value: "1.1 mmol/L", range: "< 1.7")])
        ],
        referrals: [
            ReferralRow(typeId: "referral", raised: nil, id: "REF-0311", at: "2026-09-04",
                        to: "K. Petersen · Registered dietitian, Soweto",
                        reason: "Dietary management of hypertension and raised LDL", urgency: "Routine",
                        status: "Accepted · appointment 2 Oct 2026", by: "Dr N. Dlamini")
        ],
        documents: [
            DocumentRow(typeId: "document", raised: nil, id: "DOC-2210", at: "2026-09-04",
                        name: "Visit summary · 4 September 2026", kind: "Clinical summary", by: "Dr N. Dlamini"),
            DocumentRow(typeId: "document", raised: nil, id: "DOC-2140", at: "2026-06-12",
                        name: "Consent to home visits and record keeping", kind: "Consent form", by: "Thando Mokoena"),
            DocumentRow(typeId: "document", raised: nil, id: "DOC-2139", at: "2026-06-12",
                        name: "Discovery Health membership card", kind: "Scheme document", by: "Thando Mokoena")
        ],
        billing: [
            BillingLine(typeId: "claim", raised: nil, id: "CLM-8841", at: "2026-09-04", code: "0191",
                        service: "Consultation · established patient, 15–25 min", amount: 495,
                        payer: "Discovery Health · Classic Comprehensive", status: "Accepted"),
            BillingLine(typeId: "claim", raised: nil, id: "CLM-8802", at: "2026-08-07", code: "0146",
                        service: "Home visit · registered nurse, chronic observations", amount: 650,
                        payer: "Discovery Health · Classic Comprehensive", status: "Accepted"),
            BillingLine(typeId: "claim", raised: nil, id: "CLM-8744", at: "2026-06-14", code: "4025",
                        service: "Pathology · lipogram", amount: 312,
                        payer: "Discovery Health · Classic Comprehensive", status: "Rejected",
                        note: "Benefit exhausted for the calendar year. Reason recorded; no diagnosis is carried on the line.")
        ])

    static let sipho = PatientRecord(
        id: "THU-0002177", name: "Sipho Radebe", dob: "1979-03-02", sex: "Male", mobile: "073 208 4416",
        address: "882 Setswetla Extension, Alexandra", facility: "Thuso Health Alexandra", bloodGroup: "A+",
        medicalAid: MedicalAid(scheme: "No scheme on file", plan: "Self-funded · Thuso Wallet",
                               member: "—", status: "Self-funded", tone: "amber"),
        emergency: EmergencyContact(name: "Busisiwe Radebe", relationship: "Sister", mobile: "072 119 6602"),
        service: "Chronic medicine collection", window: "Tue 22 Sep, 08:00 – 09:00",
        allergies: [],
        conditions: [
            ConditionEntry(typeId: "chronic-condition", raised: nil, name: "Type 2 diabetes", since: "August 2018",
                           managedBy: "Dr N. Dlamini", status: "Fair control"),
            ConditionEntry(typeId: "chronic-condition", raised: .protected, releasedTo: ["D-401"],
                           name: "HIV · on antiretroviral therapy", since: "February 2016",
                           managedBy: "Dr N. Dlamini", status: "Suppressed"),
            ConditionEntry(typeId: "chronic-condition", raised: .protected,
                           name: "Major depressive disorder", since: "November 2024",
                           managedBy: "Alexandra Community Mental Health", status: "In treatment")
        ],
        medication: [
            Medicine(typeId: "prescription", raised: nil, at: "2026-08-26", name: "Metformin", dose: "1 000 mg",
                     frequency: "Twice daily with food", started: "August 2018", repeats: "3 of 6 remaining",
                     prescriber: "Dr N. Dlamini · HPCSA MP0483217",
                     dispensedBy: "Diepkloof Family Pharmacy · 26 Aug 2026"),
            Medicine(typeId: "prescription", raised: .protected, releasedTo: ["D-401"], at: "2026-07-25",
                     name: "Tenofovir / lamivudine / dolutegravir", dose: "300/300/50 mg", frequency: "Once daily",
                     started: "February 2016", repeats: "4 of 6 remaining",
                     prescriber: "Dr N. Dlamini · HPCSA MP0483217"),
            Medicine(typeId: "prescription", raised: .protected, at: "2026-08-12", name: "Escitalopram", dose: "10 mg",
                     frequency: "Once daily", started: "November 2024", repeats: "1 of 3 remaining",
                     prescriber: "Alexandra Community Mental Health")
        ],
        vitals: [
            VitalSet.byHand(at: "2026-06-20", systolic: 141, diastolic: 90, pulse: 84, temperature: 36.5, weight: 90.1, oxygen: 97),
            VitalSet.byHand(at: "2026-07-25", systolic: 139, diastolic: 89, pulse: 86, temperature: 36.6, weight: 89.4, oxygen: 97),
            /* The glucometer was out of calibration that morning and the reading was taken anyway,
               because a nurse in a home with one meter still needs the number. What she must not
               have is the number without the caveat, so the caveat is on the set. */
            VitalSet.measured(at: "2026-08-26", systolic: 138, diastolic: 88, pulse: 82, temperature: 36.4, weight: 88.2, oxygen: 97,
                              instrument: "Blood-pressure monitor · BP-4471-0092",
                              calibrationNote: "The glucose meter used at the same visit was eight months past a six-month calibration cycle. Its reading stands, and it is marked.")
        ],
        careTeam: [CareTeamMember(name: "Dr N. Dlamini", role: "Treating doctor · General practice", since: "February 2016")],
        summaryPoints: [
            "Type 2 diabetes on metformin 1 000 mg twice daily. HbA1c 7.9% in August — above target, discussed at the last review.",
            "No allergy has been recorded. That is not the same as no allergy, and the file does not say it is.",
            "Blood pressure has sat at 138–141 systolic across three readings without a diagnosis of hypertension being made. Flagged for the next review.",
            "Weight down 1.9 kg since June, unplanned. Recorded, not interpreted."
        ],
        lastVisit: LastVisit(at: "2026-08-26", service: "Chronic review and medicine collection", by: "Dr N. Dlamini",
                             outcome: "Continue metformin. Repeat HbA1c in three months."),
        nextAppointment: NextAppointment(at: "2026-09-22", time: "08:00", service: "Chronic medicine collection",
                                         place: "Thuso Corner · Alexandra"),
        consultations: [
            ConsultationEntry(typeId: "consultation", raised: nil, id: "ENC-4402", at: "2026-08-26",
                              kind: "Doctor review · telehealth", by: "Dr N. Dlamini", registration: "HPCSA MP0483217",
                              place: "Thuso Health Alexandra", reason: "Three-monthly diabetes review",
                              assessment: "Type 2 diabetes, fair control. HbA1c 7.9%.",
                              plan: "Continue metformin 1 000 mg twice daily. Repeat HbA1c in three months. Dietary counselling offered.",
                              sections: ["reason", "history", "observations", "assessment", "plan", "medication", "tests", "followup", "clinician"]),
            ConsultationEntry(typeId: "consultation", raised: .protected, releasedTo: ["D-401"], id: "ENC-4371",
                              at: "2026-07-25", kind: "Doctor review · telehealth", by: "Dr N. Dlamini",
                              registration: "HPCSA MP0483217", place: "Thuso Health Alexandra",
                              reason: "Antiretroviral therapy review",
                              assessment: "Viral load suppressed. Adherence good on self-report.",
                              plan: "Continue current regimen. Repeat viral load in six months.",
                              sections: ["reason", "history", "observations", "assessment", "plan", "medication", "followup", "clinician"])
        ],
        results: [
            LabReport(typeId: "laboratory", raised: nil, id: "LAB-1173", at: "2026-08-24", name: "HbA1c",
                      source: "Highveld Pathology", status: "Released", releasedBy: "Dr N. Dlamini · 25 Aug 2026",
                      rows: [ResultRow(name: "HbA1c", value: "7.9 %", range: "< 7.0 (on treatment)", flag: "high")]),
            LabReport(typeId: "laboratory", raised: .protected, releasedTo: ["D-401"], id: "LAB-1150",
                      at: "2026-07-22", name: "HIV viral load", source: "Highveld Pathology", status: "Released",
                      releasedBy: "Dr N. Dlamini · 24 Jul 2026",
                      rows: [ResultRow(name: "HIV-1 RNA", value: "< 50 copies/mL", range: "Target not detected"),
                             ResultRow(name: "CD4 count", value: "612 cells/µL", range: "500 – 1 500")])
        ],
        referrals: [
            ReferralRow(typeId: "referral", raised: .protected, id: "REF-0288", at: "2024-11-14",
                        to: "Alexandra Community Mental Health",
                        reason: "Assessment and management of major depressive disorder", urgency: "Routine",
                        status: "Under care", by: "Dr N. Dlamini")
        ],
        documents: [
            DocumentRow(typeId: "document", raised: nil, id: "DOC-2190", at: "2026-08-26",
                        name: "Visit summary · 26 August 2026", kind: "Clinical summary", by: "Dr N. Dlamini"),
            DocumentRow(typeId: "document", raised: nil, id: "DOC-2101", at: "2026-02-03",
                        name: "Consent to home visits and record keeping", kind: "Consent form", by: "Sipho Radebe")
        ],
        billing: [
            BillingLine(typeId: "claim", raised: nil, id: "CLM-8830", at: "2026-08-26", code: "0191",
                        service: "Consultation · established patient, 15–25 min", amount: 495,
                        payer: "Self-funded · Thuso Wallet", status: "Paid"),
            BillingLine(typeId: "claim", raised: nil, id: "CLM-8798", at: "2026-08-24", code: "4064",
                        service: "Pathology · glycated haemoglobin", amount: 268,
                        payer: "Self-funded · Thuso Wallet", status: "Paid"),
            BillingLine(typeId: "claim", raised: .protected, id: "CLM-8760", at: "2026-07-22", code: "3932",
                        service: "Antiretroviral therapy · monthly supply", amount: 0,
                        payer: "State programme", status: "Covered")
        ])

    static let lindiwe = PatientRecord(
        id: "THU-0002310", name: "Lindiwe Nkosi", dob: "1994-11-09", sex: "Female", mobile: "084 776 3021",
        address: "27 Ivory Park Extension 9, Tembisa", facility: "Thuso Health Tembisa", bloodGroup: "B−",
        medicalAid: MedicalAid(scheme: "Bonitas", plan: "BonStart", member: "8842 110 76 · principal",
                               status: "Active · waiting period", tone: "amber"),
        emergency: EmergencyContact(name: "Thabo Nkosi", relationship: "Partner", mobile: "079 445 8813"),
        service: "Mother & baby check", window: "Thu 24 Sep, 14:00 – 15:00",
        allergies: [Allergy(substance: "Sulfonamides", reaction: "Urticaria", severity: "Moderate")],
        conditions: [
            ConditionEntry(typeId: "chronic-condition", raised: nil, name: "Iron-deficiency anaemia",
                           since: "July 2026", managedBy: "Sister Boitumelo Nkosi", status: "On treatment"),
            ConditionEntry(typeId: "maternal-health", raised: nil, releasedTo: ["N-201"],
                           name: "Antenatal care · 26 weeks", since: "April 2026",
                           managedBy: "Thuso Health Tembisa", status: "Ongoing")
        ],
        medication: [
            Medicine(typeId: "prescription", raised: nil, at: "2026-08-20", name: "Ferrous sulfate", dose: "200 mg",
                     frequency: "Twice daily with food", started: "July 2026", repeats: "2 of 3 remaining",
                     prescriber: "Dr N. Dlamini · HPCSA MP0483217",
                     dispensedBy: "Rosebank Community Pharmacy · 21 Aug 2026")
        ],
        vitals: [
            VitalSet.byHand(at: "2026-07-16", systolic: 112, diastolic: 72, pulse: 84, temperature: 36.7, weight: 62.1, oxygen: 99),
            VitalSet.byHand(at: "2026-08-20", systolic: 108, diastolic: 70, pulse: 86, temperature: 36.5, weight: 63.4, oxygen: 99),
            VitalSet.mixed(at: "2026-09-03", systolic: 106, diastolic: 68, pulse: 88, temperature: 36.6, weight: 64.3, oxygen: 99,
                           origin: ["systolic": .manual, "diastolic": .manual, "pulse": .manual,
                                    "temperature": .manual, "oxygen": .device, "weight": .patientReported],
                           instrument: "Pulse oximeter · OX-2210-0417")
        ],
        careTeam: [CareTeamMember(name: "Sister Boitumelo Nkosi", role: "Registered nurse · Maternal and child", since: "April 2026")],
        summaryPoints: [
            "Iron-deficiency anaemia on ferrous sulfate. Haemoglobin 10.4 g/dL in August, up from 9.6 in July.",
            "Sulfonamide allergy recorded: urticaria, moderate.",
            "Blood pressure low-normal and steady across three readings.",
            "Blood group B negative. Recorded here because it changes what a stranger would do in the next ten minutes."
        ],
        lastVisit: LastVisit(at: "2026-09-03", service: "Nurse home visit · observations",
                             by: "Sister Boitumelo Nkosi",
                             outcome: "Observations recorded. Continue iron. Review in three weeks."),
        nextAppointment: NextAppointment(at: "2026-09-24", time: "14:00", service: "Mother & baby check · home visit",
                                         place: "Thuso Health Tembisa · Sister Boitumelo Nkosi"),
        consultations: [
            ConsultationEntry(typeId: "home-visit", raised: nil, id: "ENC-4408", at: "2026-09-03",
                              kind: "Nurse home visit", by: "Sister Boitumelo Nkosi", registration: "SANC 20019902",
                              place: "27 Ivory Park Extension 9", reason: "Routine observations and iron review",
                              assessment: "Readings within the indicative range. Tolerating iron.",
                              plan: "Continue ferrous sulfate. Repeat full blood count in four weeks.",
                              sections: ["reason", "history", "observations", "assessment", "plan", "followup", "clinician"]),
            ConsultationEntry(typeId: "maternal-health", raised: nil, releasedTo: ["N-201"], id: "ENC-4390",
                              at: "2026-08-20", kind: "Antenatal visit", by: "Sister Boitumelo Nkosi",
                              registration: "SANC 20019902", place: "Thuso Health Tembisa",
                              reason: "Antenatal review at 24 weeks",
                              assessment: "Progressing normally. Fundal height appropriate.",
                              plan: "Next antenatal visit in four weeks. Iron continued.",
                              sections: ["reason", "history", "observations", "examination", "assessment", "plan", "followup", "clinician"])
        ],
        results: [
            LabReport(typeId: "laboratory", raised: nil, id: "LAB-1169", at: "2026-08-19",
                      name: "Full blood count and iron studies", source: "Highveld Pathology", status: "Released",
                      releasedBy: "Dr N. Dlamini · 20 Aug 2026",
                      rows: [ResultRow(name: "Haemoglobin", value: "10.4 g/dL", range: "12.0 – 15.5", flag: "low"),
                             ResultRow(name: "Mean cell volume", value: "76 fL", range: "80 – 100", flag: "low"),
                             ResultRow(name: "Ferritin", value: "14 µg/L", range: "15 – 200", flag: "low")])
        ],
        referrals: [],
        documents: [
            DocumentRow(typeId: "document", raised: nil, id: "DOC-2205", at: "2026-08-20",
                        name: "Consent to home visits and record keeping", kind: "Consent form", by: "Lindiwe Nkosi"),
            DocumentRow(typeId: "document", raised: nil, id: "DOC-2206", at: "2026-08-19",
                        name: "Full blood count report · 19 August 2026", kind: "Laboratory report", by: "Highveld Pathology")
        ],
        billing: [
            BillingLine(typeId: "claim", raised: nil, id: "CLM-8820", at: "2026-09-03", code: "0146",
                        service: "Home visit · registered nurse, observations", amount: 650,
                        payer: "Bonitas · BonStart", status: "Submitted"),
            BillingLine(typeId: "claim", raised: nil, id: "CLM-8795", at: "2026-08-19", code: "3755",
                        service: "Pathology · full blood count", amount: 214,
                        payer: "Bonitas · BonStart", status: "Accepted")
        ])
}

// MARK: - The timeline

/* Derived rather than authored, so a consultation cannot appear in the Consultations tab and be
   missing from the Timeline because somebody forgot to add it twice. */
struct TimelineEntry: RecordEntry, Identifiable, Hashable {
    let typeId: String
    var raised: RecordSensitivity?
    var releasedTo: [String] = []
    let id: String
    let at: String
    let title: String
    let detail: String
    let by: String
}
func timelineFor(_ patient: PatientRecord) -> [TimelineEntry] {
    var entries: [TimelineEntry] = []
    entries += patient.consultations.map {
        TimelineEntry(typeId: $0.typeId, raised: $0.raised, releasedTo: $0.releasedTo, id: $0.id, at: $0.at,
                      title: $0.kind, detail: $0.reason, by: $0.by)
    }
    entries += patient.results.map {
        TimelineEntry(typeId: $0.typeId, raised: $0.raised, releasedTo: $0.releasedTo, id: $0.id, at: $0.at,
                      title: $0.name, detail: "\($0.source) · \($0.status.lowercased())", by: $0.releasedBy)
    }
    entries += patient.medication.filter { $0.stopped == nil }.map {
        TimelineEntry(typeId: $0.typeId, raised: $0.raised, releasedTo: $0.releasedTo,
                      id: "RX-\($0.name.prefix(4).uppercased())", at: $0.at,
                      title: "\($0.name) \($0.dose)", detail: "\($0.frequency) · \($0.repeats)", by: $0.prescriber)
    }
    entries += patient.referrals.map {
        TimelineEntry(typeId: $0.typeId, raised: $0.raised, releasedTo: $0.releasedTo, id: $0.id, at: $0.at,
                      title: "Referral · \($0.to)", detail: "\($0.urgency) · \($0.status)", by: $0.by)
    }
    entries += patient.documents.map {
        TimelineEntry(typeId: $0.typeId, raised: $0.raised, releasedTo: $0.releasedTo, id: $0.id, at: $0.at,
                      title: $0.name, detail: $0.kind, by: $0.by)
    }
    return entries.sorted { $0.at == $1.at ? $0.id < $1.id : $0.at > $1.at }
}

// MARK: - Small shared readings

private let recordIsoFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_ZA")
    formatter.timeZone = TimeZone(identifier: "UTC")
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter
}()
private func recordFormatter(_ format: String) -> DateFormatter {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_ZA")
    formatter.timeZone = TimeZone(identifier: "UTC")
    formatter.dateFormat = format
    return formatter
}
private let recordLongFormatter = recordFormatter("d MMMM yyyy")
private let recordShortFormatter = recordFormatter("d MMM yyyy")
private let recordDayFormatter = recordFormatter("d MMM")

func recordDate(_ iso: String) -> Date? { recordIsoFormatter.date(from: iso) }
func longDate(_ iso: String) -> String { recordDate(iso).map { recordLongFormatter.string(from: $0) } ?? iso }
func shortDate(_ iso: String) -> String { recordDate(iso).map { recordShortFormatter.string(from: $0) } ?? iso }
func dayLabel(_ iso: String) -> String { recordDate(iso).map { recordDayFormatter.string(from: $0) } ?? iso }
func ageFrom(_ dob: String) -> Int {
    guard let born = recordDate(dob) else { return 0 }
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "UTC") ?? .current
    return calendar.dateComponents([.year], from: born, to: Date()).year ?? 0
}
