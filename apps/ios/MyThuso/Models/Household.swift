import Foundation

/* A household is the one screen whose whole purpose is showing several people’s health at once,
   which makes it the easiest place in the product to undo everything the guardian flow promises.
   packages/catalog/records.json says it plainly — “Membership is not consent: each member’s record
   stays their own” — so the rule here is that living at one address grants nothing at all. Every
   clinical line on this screen is asked for twice: once of the vetting module (may this party ever
   hold this capability?) and once of the record itself (has this person granted it, to whom, for
   how long?). A yes to one is not a yes.

   The record contract itself is in RecordsData.swift, generated from the catalogue. What is here is
   the household the contract is demonstrated on, and the arithmetic that decides who may read it.

   Fictional household, fictional scheme, fictional numbers. Nothing is stored or sent. */

// MARK: - The people

/// A protected entry is held with its detail, so the export guard further down has something real
/// to fail on. Nothing renders these but the person’s own view, and no artefact carries them.
struct RestrictedEntry: Hashable {
    let category: String
    let detail: String
}
struct ImmunisationDue: Hashable {
    let vaccine: String
    let due: Date
}
struct CollectionDue: Hashable {
    let medicine: String
    let ready: Date
    let pharmacy: String
}
struct HouseholdConsultation: Hashable {
    let on: Date
    let with: String
    let about: String
}
struct HouseholdReadings: Hashable {
    let bp: String
    let weight: String
    let on: Date
}
struct HouseholdMember: Identifiable, Hashable {
    let id: String
    let name: String
    let relation: String
    /// An ISO birth date rather than an age, so the arithmetic below has something to be right about.
    let born: String
    let reference: String
    let dependant: String
    let bloodGroup: String
    let allergies: [String]
    let conditions: [String]
    let medication: [String]
    let lastConsultation: HouseholdConsultation
    let emergencyContact: String
    let vitals: HouseholdReadings
    let careTeam: [String]
    var immunisations: [ImmunisationDue] = []
    var collections: [CollectionDue] = []
    var restricted: [RestrictedEntry] = []

    var firstName: String { name.split(separator: " ").first.map(String.init) ?? name }
    var initials: String { name.split(separator: " ").compactMap { $0.first }.map(String.init).joined() }
}
struct HouseholdScheme: Hashable {
    let name: String
    let plan: String
    let membership: String
    /// The member id of the principal, so the dependant codes are held against a person rather than
    /// against a position in a list.
    let principal: String
}
struct HouseholdRecord: Identifiable, Hashable {
    let id: String
    let name: String
    let area: String
    let scheme: HouseholdScheme
    let members: [HouseholdMember]
    func member(_ id: String) -> HouseholdMember? { members.first { $0.id == id } }
}
struct HouseholdAppointment: Identifiable, Hashable {
    let id: String
    let memberId: String
    let when: Date
    let time: String
    let service: String
}

/* The Children’s Act lets a child of 12 consent to their own medical treatment, and to an HIV test
   with counselling. The design treats 12 as the age at which a record stops being automatically a
   parent’s to open; a real product must also record the maturity assessment the Act asks for, and
   this preview does not pretend to make it. */
let householdOwnConsentAge = 12

/* Ages are arithmetic on a birth date rather than a number somebody typed, so Amahle passes into
   adulthood — and out of every guardian grant below — on the day she actually does. `ageFrom` is
   the one in Records.swift; a second implementation here would be a second answer. */
func householdAge(_ member: HouseholdMember) -> Int { ageFrom(member.born) }

// MARK: - Who is looking

/// Six levels, in order of how much they open. The order is the whole comparison, so it is written
/// once and `atLeast` reads it.
enum HouseholdLevel: String, CaseIterable, Identifiable {
    /// `own` rather than `self`, which is a keyword. It is the person’s own record either way.
    case none, admin, emergency, summary, clinical, own
    var id: String { rawValue }
    var label: String {
        switch self {
        case .none: return "No access"
        case .admin: return "Household admin only"
        case .emergency: return "Emergency details only"
        case .summary: return "Health summary"
        case .clinical: return "Full record"
        case .own: return "Your own record"
        }
    }
    var tone: String {
        switch self {
        case .own: return "teal"
        case .none, .admin: return "danger"
        default: return "sky"
        }
    }
    private var rank: Int { HouseholdLevel.allCases.firstIndex(of: self) ?? 0 }
    func atLeast(_ floor: HouseholdLevel) -> Bool { rank >= floor.rank }
}
enum HouseholdBasis: String {
    case guardian, shared, visit
}
struct HouseGrant: Hashable {
    let memberId: String
    let basis: String
    let asks: HouseholdLevel
    let until: Date
    let period: String
    let verified: Bool
}
struct HouseholdViewer: Identifiable, Hashable {
    let id: String
    let name: String
    let role: String
    /// Set only for somebody who actually lives here. Everything else is a claim from outside.
    var memberId: String?
    var subject: VettingSubject?
    var grants: [HouseGrant] = []
}
struct HouseholdVisibility {
    let level: HouseholdLevel
    let reason: String
}

/* The whole rule, in one function, so no screen can quietly reach past it. Order matters: the
   household floor is administrative and never clinical; a grant is checked for life and for
   verification before it is checked for scope; the vetting module has the last word on anyone
   acting in a role; and a minor old enough to consent for themselves is not reachable through
   their parent at all. */
func visibilityFor(_ viewer: HouseholdViewer, _ member: HouseholdMember) -> HouseholdVisibility {
    if viewer.memberId == member.id { return HouseholdVisibility(level: .own, reason: "Your own record, in full.") }
    let floor: HouseholdLevel = viewer.memberId != nil ? .admin : .none
    let who = member.firstName
    guard let grant = viewer.grants.first(where: { $0.memberId == member.id }) else {
        return HouseholdVisibility(level: floor, reason: viewer.memberId != nil
            ? "\(who) has not given you access to their record. Sharing a household is not consent, and paying for care is not a permission."
            : "Nothing has been granted for this person, so nothing about them is shown here — not even that there is a record.")
    }
    if (daysUntil(grant.until) ?? 0) < 0 {
        return HouseholdVisibility(level: floor, reason: "That access ended on \(vettingDate(grant.until)). It does not renew by being asked for again; \(who) grants it.")
    }
    if !grant.verified {
        return HouseholdVisibility(level: floor, reason: "Identity verification is outstanding. An unverified invitation grants nothing.")
    }
    if grant.basis != HouseholdBasis.shared.rawValue {
        /* Acting in a role — guardian, nurse — means the vetting record decides, and it is resolved
           against its own expiry dates every time it is read rather than trusted as written down. */
        guard let subject = viewer.subject else {
            return HouseholdVisibility(level: floor, reason: "No vetting record stands behind this claim, so it grants nothing.")
        }
        let holds = can(subject, grant.basis == HouseholdBasis.guardian.rawValue ? "guardian-access" : "view-patient-summary")
        guard holds.allowed else { return HouseholdVisibility(level: floor, reason: holds.reason ?? "Refused.") }
        let scoped = can(subject, "view-clinical-record")
        guard scoped.allowed else { return HouseholdVisibility(level: floor, reason: scoped.reason ?? "Refused.") }
    }
    let age = householdAge(member)
    if grant.basis == HouseholdBasis.guardian.rawValue && age >= householdOwnConsentAge && age < 18 {
        return HouseholdVisibility(level: .emergency, reason:
            "\(who) is \(age). From 12 a child may consent to their own medical treatment, and to an HIV test with counselling — so this record is theirs to open, not yours. Blood group, allergies and one contact stay here because an emergency cannot wait for a conversation; conditions, medicines and visits are released by \(who) from their own account.")
    }
    let reason: String
    switch grant.basis {
    case HouseholdBasis.visit.rawValue:
        reason = "Open for \(grant.period.lowercased()), because \(who) is expecting you. It closes on its own."
    case HouseholdBasis.shared.rawValue:
        reason = "\(who) shared this directly, \(grant.period.lowercased()). Nobody had to be vetted for it: the person it belongs to is the shortest route to it, and the easiest to withdraw."
    default:
        reason = "Guardian access, \(grant.period.lowercased()), until \(vettingDate(grant.until))."
    }
    return HouseholdVisibility(level: grant.asks, reason: reason)
}

// MARK: - The household

enum HouseholdFixtures {
    static let mokoena = HouseholdRecord(
        id: "HH-0184", name: "Mokoena Household", area: "Rosebank, Johannesburg",
        scheme: HouseholdScheme(name: "Motswedi Medical Scheme", plan: "Family Option",
                                membership: "MMS 4417 883", principal: "thando"),
        members: [
            HouseholdMember(
                id: "thando", name: "Thando Mokoena", relation: "Mother", born: "1987-05-14",
                reference: "THU-0001842", dependant: "00", bloodGroup: "O positive",
                allergies: ["Penicillin — rash and facial swelling, 2016"],
                conditions: ["Hypertension, diagnosed 2021, managed at home"],
                medication: ["Amlodipine 5 mg, once daily, morning"],
                lastConsultation: HouseholdConsultation(on: VettingClock.inDays(-11),
                                                        with: "Dr Ayanda Dlamini · HPCSA MP0483217",
                                                        about: "Blood-pressure review"),
                emergencyContact: "Nomsa Mokoena · Mother · 071 000 0000",
                vitals: HouseholdReadings(bp: "136/84 mmHg", weight: "74.2 kg", on: VettingClock.inDays(-11)),
                careTeam: ["Sister Palesa Khumalo · SANC 20011203", "Dr Ayanda Dlamini · HPCSA MP0483217"],
                immunisations: [ImmunisationDue(vaccine: "Influenza, annual", due: VettingClock.inDays(24))],
                collections: [CollectionDue(medicine: "Amlodipine 5 mg · 3 months", ready: VettingClock.inDays(3),
                                            pharmacy: "Rosebank community pharmacy")],
                restricted: [RestrictedEntry(category: "Sexual and reproductive health",
                                             detail: "Contraceptive implant inserted 2025, review 2028"),
                             RestrictedEntry(category: "Social support",
                                             detail: "Referred to a social worker after the 2024 retrenchment")]),
            HouseholdMember(
                id: "sipho", name: "Sipho Mokoena", relation: "Father", born: "1984-02-02",
                reference: "THU-0001843", dependant: "01", bloodGroup: "A positive",
                allergies: ["None recorded"],
                conditions: ["Type 2 diabetes, diagnosed 2019"],
                medication: ["Metformin 850 mg, twice daily"],
                lastConsultation: HouseholdConsultation(on: VettingClock.inDays(-38),
                                                        with: "Dr Ayanda Dlamini · HPCSA MP0483217",
                                                        about: "Six-month diabetic review"),
                emergencyContact: "Thando Mokoena · Wife · 071 000 0000",
                vitals: HouseholdReadings(bp: "128/80 mmHg", weight: "88.6 kg", on: VettingClock.inDays(-38)),
                careTeam: ["Dr Ayanda Dlamini · HPCSA MP0483217"],
                collections: [CollectionDue(medicine: "Metformin 850 mg · 3 months", ready: VettingClock.inDays(9),
                                            pharmacy: "Rosebank community pharmacy")]),
            HouseholdMember(
                id: "lebo", name: "Lebo Mokoena", relation: "Child", born: "2018-03-03",
                reference: "THU-0001844", dependant: "02", bloodGroup: "O positive",
                allergies: ["None recorded"],
                conditions: ["Mild asthma, reliever inhaler as needed"],
                medication: ["Salbutamol inhaler, as needed"],
                lastConsultation: HouseholdConsultation(on: VettingClock.inDays(-64),
                                                        with: "Sister Palesa Khumalo · SANC 20011203",
                                                        about: "Winter chest check"),
                emergencyContact: "Thando Mokoena · Mother · 071 000 0000",
                vitals: HouseholdReadings(bp: "Not taken", weight: "26.4 kg", on: VettingClock.inDays(-64)),
                careTeam: ["Sister Palesa Khumalo · SANC 20011203"],
                immunisations: [ImmunisationDue(vaccine: "Td booster, school age", due: VettingClock.inDays(41))]),
            HouseholdMember(
                id: "amahle", name: "Amahle Mokoena", relation: "Child", born: "2009-09-21",
                reference: "THU-0001845", dependant: "03", bloodGroup: "B positive",
                allergies: ["None recorded"],
                conditions: ["None recorded"],
                medication: ["None recorded"],
                lastConsultation: HouseholdConsultation(on: VettingClock.inDays(-27),
                                                        with: "Sister Palesa Khumalo · SANC 20011203",
                                                        about: "Recorded in her own account"),
                emergencyContact: "Thando Mokoena · Mother · 071 000 0000",
                vitals: HouseholdReadings(bp: "112/70 mmHg", weight: "54.1 kg", on: VettingClock.inDays(-27)),
                careTeam: ["Sister Palesa Khumalo · SANC 20011203"],
                restricted: [RestrictedEntry(category: "Sexual and reproductive health",
                                             detail: "HIV test with counselling, consented to on her own account")])
        ])

    /// A household calendar. The time and the person are the household’s business; what the visit is
    /// for is the member’s, and the screen keeps them apart.
    static let appointments: [HouseholdAppointment] = [
        HouseholdAppointment(id: "AP-9001", memberId: "thando", when: VettingClock.inDays(2), time: "09:00", service: "Vitals & chronic check"),
        HouseholdAppointment(id: "AP-9002", memberId: "lebo", when: VettingClock.inDays(2), time: "10:30", service: "Childhood immunisation"),
        HouseholdAppointment(id: "AP-9003", memberId: "amahle", when: VettingClock.inDays(5), time: "15:00", service: "Follow-up visit"),
        HouseholdAppointment(id: "AP-9004", memberId: "sipho", when: VettingClock.inDays(12), time: "08:00", service: "Diabetic review")
    ]

    /* Two guardian records built here rather than borrowed, because the household needs guardians by
       these names. Every renewable check is given a real expiry, so nobody is verified forever. */
    private static func vetted(_ id: String, _ name: String, _ roleId: String, _ reference: String,
                               overrides: [String: CheckState] = [:], notes: [String: String] = [:]) -> VettingSubject {
        let records = (Vetting.role(roleId)?.checks ?? []).map { check -> CheckRecord in
            var record = CheckRecord(checkId: check.id, state: overrides[check.id] ?? .verified,
                                     decidedOn: VettingClock.inMonths(-3), decidedBy: "T. van Wyk · Compliance",
                                     evidence: check.evidence, note: notes[check.id])
            if let renewMonths = check.renewMonths { record.expiresOn = VettingClock.inMonths(Double(renewMonths) - 3) }
            if check.isHighRisk { record.secondedBy = "M. Sithole · Clinical Governance" }
            return record
        }
        return VettingSubject(id: id, name: name, roleId: roleId, reference: reference, records: records)
    }
    private static func guardianOf(_ memberId: String) -> HouseGrant {
        HouseGrant(memberId: memberId, basis: HouseholdBasis.guardian.rawValue, asks: .clinical,
                   until: VettingClock.inMonths(6), period: "Reviewed every six months", verified: true)
    }
    private static func visitTo(_ memberId: String) -> HouseGrant {
        HouseGrant(memberId: memberId, basis: HouseholdBasis.visit.rawValue, asks: .clinical,
                   until: VettingClock.inDays(1), period: "Today’s visit only", verified: true)
    }

    /* The vetted parties are looked up in the live pipeline rather than copied, so a clearance
       withdrawn in the vetting console closes this household a moment later. Where the lookup finds
       nothing the viewer keeps no vetting record at all, and `visibilityFor` refuses the claim
       rather than waving it through. */
    static func viewers(_ lookup: (String) -> VettingSubject?) -> [HouseholdViewer] {
        [
            HouseholdViewer(id: "v-thando", name: "Thando Mokoena", role: "Household organiser · you", memberId: "thando",
                            subject: vetted("G-101", "Thando Mokoena", "guardian", "Guardian 0184"),
                            grants: [guardianOf("lebo"), guardianOf("amahle")]),
            HouseholdViewer(id: "v-sipho", name: "Sipho Mokoena", role: "Household member", memberId: "sipho",
                            subject: vetted("G-102", "Sipho Mokoena", "guardian", "Guardian 0185",
                                            overrides: ["legal-authority": .submitted],
                                            notes: ["legal-authority": "Birth certificates uploaded; awaiting the document check."]),
                            grants: [guardianOf("lebo"), guardianOf("amahle")]),
            HouseholdViewer(id: "v-amahle", name: "Amahle Mokoena", role: "Household member · 16", memberId: "amahle"),
            /* The nurse reaches Thando through today’s visit and Sipho through a summary he handed
               over himself. Two different authorities, neither of them the household. */
            HouseholdViewer(id: "v-nurse", name: "Sister Palesa Khumalo", role: "Visiting nurse · vetting current",
                            subject: lookup("N-206"),
                            grants: [visitTo("thando"),
                                     HouseGrant(memberId: "sipho", basis: HouseholdBasis.shared.rawValue, asks: .summary,
                                                until: VettingClock.inDays(1), period: "Until this evening", verified: true)]),
            HouseholdViewer(id: "v-lapsed", name: "Sister Ayanda Dube", role: "Visiting nurse · clearance lapsed",
                            subject: lookup("N-204"), grants: [visitTo("thando")]),
            HouseholdViewer(id: "v-sponsor", name: "Zodwa Radebe", role: "Care sponsor · pays for Thando’s visits",
                            subject: lookup("S-022"))
        ]
    }
}

// MARK: - The health summary

/* packages/catalog/records.json defines this card: nine fields, and a rule that protected
   categories never appear but are never silently omitted either. Both halves matter. A clinician
   who reads a summary with no mention of mental health concludes there is nothing to know.

   The card is built by walking the contract’s own field list, so it cannot grow a tenth field that
   the contract does not have, and cannot quietly reorder the nine it does. */
struct SummaryField: Identifiable, Hashable {
    let key: String
    let label: String
    let value: String
    var id: String { key }
}
private let summaryBuilders: [String: (HouseholdMember) -> (String, String)] = [
    "patient": { ("Patient", "\($0.name) · \($0.reference) · born \(shortDate($0.born))") },
    "bloodGroup": { ("Blood group", $0.bloodGroup) },
    "allergies": { ("Allergies", $0.allergies.joined(separator: "; ")) },
    "chronicConditions": { ("Chronic conditions", $0.conditions.joined(separator: "; ")) },
    "currentMedication": { ("Current medication", $0.medication.joined(separator: "; ")) },
    "lastConsultation": { ("Last consultation", "\(vettingDate($0.lastConsultation.on)) · \($0.lastConsultation.with) · \($0.lastConsultation.about)") },
    "emergencyContact": { ("Emergency contact", $0.emergencyContact) },
    "latestVitals": { ("Latest readings", "BP \($0.vitals.bp) · \($0.vitals.weight) · \(vettingDate($0.vitals.on))") },
    "careTeam": { ("Care team", $0.careTeam.joined(separator: "; ")) }
]
func summaryValues(_ member: HouseholdMember, fields: [String]) -> [SummaryField] {
    Records.summaryCard.fields.compactMap { key in
        guard fields.contains(key), let build = summaryBuilders[key] else { return nil }
        let entry = build(member)
        return SummaryField(key: key, label: entry.0, value: entry.1)
    }
}
func summaryLabel(_ key: String, _ member: HouseholdMember) -> String { summaryBuilders[key]?(member).0 ?? key }

/* The withheld list is the same on every summary of every person, and is taken from the contract’s
   own list rather than from prose, so a category added there is refused here without anyone editing
   a screen. The record types marked protected are folded in as well, because a record type is a
   category the moment it is the only thing in it. Naming only the categories a person actually has
   would turn the honesty of the notice into the leak it was written to prevent — the list is
   constant precisely so that its presence discloses nothing. */
let householdProtectedCategories: [String] = Records.protectedCategories

/* A shared summary is bound to a purpose and to a period, and the purpose chooses the fields. A
   pharmacist dispensing this afternoon needs allergies and medicines; they do not need where the
   patient was last seen or by whom. An undated summary with every field in it is the artefact that
   ends up forwarded, so it is the one thing this flow will not produce. */
struct SharePurpose: Identifiable, Hashable {
    let id: String
    let name: String
    let recipient: String
    let hours: Int
    let fields: [String]
}
let sharePurposes: [SharePurpose] = [
    SharePurpose(id: "visit", name: "The nurse at my door, today", recipient: "Sister Palesa Khumalo · SANC 20011203", hours: 6,
                 fields: ["patient", "allergies", "chronicConditions", "currentMedication", "latestVitals", "emergencyContact", "lastConsultation"]),
    SharePurpose(id: "pharmacy", name: "A pharmacy, dispensing one prescription", recipient: "Rosebank community pharmacy", hours: 4,
                 fields: ["patient", "allergies", "currentMedication"]),
    SharePurpose(id: "casualty", name: "A casualty unit, admitting me", recipient: "The admitting clinician", hours: 24,
                 fields: Records.summaryCard.fields),
    SharePurpose(id: "opinion", name: "A doctor giving a second opinion", recipient: "Dr Sanjay Naidoo · HPCSA MP0559104", hours: 168,
                 fields: ["patient", "chronicConditions", "currentMedication", "lastConsultation", "latestVitals", "careTeam"])
]
struct SummaryShare: Identifiable, Hashable {
    let id: String
    let token: String
    let purpose: SharePurpose
    let recipient: String
    let createdAt: Date
    let validUntil: Date
    var revoked = false
}

/* Twenty characters from a 32-symbol alphabet — 100 bits from the system’s cryptographic
   generator, with no modulo bias because 256 divides by 32. It is not the patient number, not a
   hash of it and not a counter, so there is nothing to guess at and nothing to walk through. I, L,
   O and U are left out so that reading one over a counter cannot turn it into a different
   valid-looking one. */
private let shareAlphabet = Array("0123456789ABCDEFGHJKMNPQRSTVWXYZ")
func shareToken() -> String {
    var bytes = [UInt8](repeating: 0, count: 20)
    if SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) != errSecSuccess {
        /* Both of these are the system’s cryptographic generator. The fallback is a second door to
           the same room, not a weaker one, and it means a token is never made from a counter
           because a call returned an error nobody was watching for. */
        var generator = SystemRandomNumberGenerator()
        bytes = (0..<bytes.count).map { _ in UInt8.random(in: 0...255, using: &generator) }
    }
    let characters = bytes.map { shareAlphabet[Int($0) % shareAlphabet.count] }
    return stride(from: 0, to: characters.count, by: 5)
        .map { String(characters[$0..<min($0 + 5, characters.count)]) }
        .joined(separator: "-")
}

private let shareInstantFormatter: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]
    return formatter
}()

/// The artefact. It says when it was produced, by whom, for whom, for what, and when it stops being
/// valid — because an undated health summary in a forwarded message is valid forever.
struct SharedSummary: Encodable {
    struct Verification: Encodable {
        let link: String
        let returns: [String]
        let neverReturns: [String]
        let note: String
    }
    struct Entry: Encodable {
        let field: String
        let label: String
        let value: String
    }
    struct Withheld: Encodable {
        let categories: [String]
        let rule: String
        let whatToDo: String
    }
    let document = "MyThuso health summary"
    let version = 1
    let demo = true
    let notice = "Fictional preview data for design review. This is not a medical record and nothing in it was produced by a clinician."
    let producedAt: String
    let producedBy: String
    let purpose: String
    let sharedWith: String
    let validUntil: String
    let validFor: String
    let afterThat = "The summary stops being valid. A copy kept after that date is a copy of an expired document, and the verification link says so."
    let reference: String
    let verification: Verification
    /// An ordered list rather than an object, so the nine fields keep the contract’s order in the
    /// artefact as well as on the screen. A dictionary would have reordered them on the way out.
    let summary: [Entry]
    let withheld: Withheld
}
func buildSharedSummary(_ member: HouseholdMember, _ share: SummaryShare) -> SharedSummary {
    SharedSummary(
        producedAt: shareInstantFormatter.string(from: share.createdAt),
        producedBy: "\(member.name) — the person this summary is about",
        purpose: share.purpose.name, sharedWith: share.recipient,
        validUntil: shareInstantFormatter.string(from: share.validUntil),
        validFor: "\(share.purpose.hours) hours from the moment it was produced",
        reference: share.token,
        verification: SharedSummary.Verification(
            link: "https://verify.mythuso.co.za/s/\(share.token.lowercased())",
            returns: ["the patient’s initials", "valid, expired or revoked", "the purpose it was made for", "the moment it stops being valid"],
            neverReturns: ["name", "identity number", "patient reference", "date of birth", "address", "contact number", "any clinical content"],
            note: "There is no server in this preview, so the link resolves to nothing at all."),
        summary: summaryValues(member, fields: share.purpose.fields)
            .map { SharedSummary.Entry(field: $0.key, label: $0.label, value: $0.value) },
        withheld: SharedSummary.Withheld(
            categories: householdProtectedCategories, rule: Records.summaryCard.withheld,
            whatToDo: "Ask the patient. MyThuso will not release these on their behalf, and this list is the same on every summary it produces — it does not say that this person has entries in any of them."))
}

/* The rule is checked against the bytes that would actually leave, not against the intention of the
   code that wrote them. A protected entry reaching this artefact at all should stop the export
   rather than travel in it, and a rule nobody tests is a rule somebody hopes about.

   The refusal does not name what it found. Saying which category leaked would be the disclosure the
   guard exists to prevent, said by the guard itself. */
enum SummaryExport {
    case ready(String)
    case refused(String)
}
func exportSummary(_ member: HouseholdMember, _ share: SummaryShare) -> SummaryExport {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .withoutEscapingSlashes]
    guard let data = try? encoder.encode(buildSharedSummary(member, share)),
          let body = String(data: data, encoding: .utf8) else {
        return .refused("The summary could not be written out, so nothing is offered. An artefact nobody could inspect is not an artefact worth sharing.")
    }
    if member.restricted.contains(where: { body.contains($0.detail) }) {
        return .refused("Export refused: a protected entry reached the artefact. Nothing was shared.")
    }
    return .ready(body)
}
