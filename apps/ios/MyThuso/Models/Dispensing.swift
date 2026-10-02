import Foundation

/* Substitution, and how long a repeat is allowed to live.

   A pharmacist hands over something other than what was written. A repeat runs out. Both are the
   most ordinary events in a pharmacy and both are where harm hides.

   The table itself — the three substitution classes, the ten grounds, what a substitution may and
   may not change, the six rules, the six refusals, the chronic authorisation and one fictional
   prescription of five items — is generated into DispensingData.swift from
   packages/catalog/dispensing.json, so nothing below is transcribed by hand.

   What is here is the reasoning, and it is worth saying why there are three classes rather than
   two. Section 22F of the Medicines and Related Substances Act 101 of 1965 does not permit generic
   substitution: it requires the pharmacist to tell the patient about an interchangeable multi-source
   medicine and to dispense it, unless the patient forbids it, the prescriber wrote "no substitution"
   in their own hand, the regulator has declared it not substitutable, or the alternative costs the
   patient more. So the lowest class is "may be substituted, and the patient is told". A silent swap
   is not the mild end of this feature; it is outside it, and there is nowhere in this file to
   express one.

   The arithmetic is the other half. A chronic authorisation is boxed twice — by a date and by a
   number of repeats — and it ends on whichever arrives first. Neither is written down as a
   conclusion: the contract carries the day it was authorised and the months it runs for, and the
   expiry is computed here, in Dispensing.kt and in apps/web/src/lib/dispensing.ts from the same two
   numbers, so three platforms cannot disagree about the day a repeat stops.

   Nothing here dispenses anything. No pharmacy is contacted, no medicine exists, and every patient,
   pharmacist and product below is fictional. None of the clinical wording has been read by a
   pharmacist. */

struct SubstitutionClass: Identifiable, Hashable {
    let id: String
    let name: String
    /// For a pill on a crowded item card, where the full name will not fit and must not be invented.
    let shortName: String
    let detail: String
    let whoDecides: String
    /// The middle class, and only the middle class, is a decision that has to be written down.
    let needsWrittenReason: Bool
    let tellsThePrescriber: Bool
    let tone: String
}

struct SubstitutionGround: Identifiable, Hashable {
    let id: String
    let name: String
    /// The four grounds the Act itself names carry a section number; the clinical ones do not.
    let section: String?
    let classId: String
    let detail: String
}

struct MedicineChange: Identifiable, Hashable {
    let what: String
    let why: String
    var id: String { what }
}

struct DispensingRule: Identifiable, Hashable {
    let id: String
    let title: String
    let sentence: String
}

struct DispensingRefusal: Identifiable, Hashable {
    let id: String
    let sentence: String
}

struct HandoverStep: Identifiable, Hashable {
    let id: String
    let label: String
    let detail: String
}

struct DispensingPharmacist: Hashable {
    let name: String
    /// A substitution is not anonymous. This is the registration it is signed with.
    let registration: String
    let role: String
}

struct PrescriptionItem: Identifiable, Hashable {
    let id: String
    let prescribed: String
    let molecule: String
    let strength: String
    let form: String
    let dose: String
    let quantity: String
    let classId: String
    let ground: String
    let secondGround: String?
    /// "substituted", "as-written" or "refused-by-patient".
    let outcome: String
    let dispensed: String
    let sameness: [String]
    let differences: [String]
    /// What is actually said to the patient. Not a label on a box.
    let patientWords: String
    let writtenReason: String?
    let accepted: Bool
    let note: String

    var wasSubstituted: Bool { outcome == "substituted" }
    var patientRefused: Bool { outcome == "refused-by-patient" }
}

/* No patient and no prescriber. The one screen that reads this is the pharmacy's, and
   medicines.json#partnerQueue.neverCarries lists both, so scripts/emit-dispensing.mjs leaves them out
   of the app altogether rather than leaving them here for a screen to draw. */
struct DispensedPrescription {
    let reference: String
    let issuedInDays: Int
    /// A vetting subject id: the pharmacy is the reader's own, so it may be named.
    let pharmacy: String
    let pharmacist: DispensingPharmacist
    let items: [PrescriptionItem]

    var issued: Date { Date().addingTimeInterval(TimeInterval(issuedInDays) * 86_400) }
    var substituted: [PrescriptionItem] { items.filter { $0.wasSubstituted } }
}

struct ChronicAuthorisation {
    let reference: String
    let programme: String
    let condition: String
    let authorisedByDays: Int
    let validMonths: Int
    let repeatsAuthorised: Int
    let repeatsUsed: Int
    let daysPerRepeat: Int
    let minimumDaysBetween: Int
    let lastCollectedDays: Int
    let reviewedBy: String
    let endsWith: String
    let note: String
    let quantityNote: String
}

enum Dispensing {
    static func substitutionClass(_ id: String) -> SubstitutionClass {
        substitutionClasses.first { $0.id == id } ?? substitutionClasses[0]
    }
    static func ground(_ id: String) -> SubstitutionGround { grounds.first { $0.id == id } ?? grounds[0] }
    static func rule(_ id: String) -> DispensingRule { rules.first { $0.id == id } ?? rules[0] }
    static func refusal(_ id: String) -> DispensingRefusal { refusals.first { $0.id == id } ?? refusals[0] }
    /// The four exceptions in section 22F, derived rather than listed a second time: a ground that
    /// stops carrying a section number drops out of here by itself.
    static var statutoryGrounds: [SubstitutionGround] { grounds.filter { $0.section != nil } }

    /* ---- The authorisation, boxed twice -----------------------------------------------------
       The month is the same 30.44 days the vetting module renews a credential on, so an
       authorisation and a check that both run for six months run out on the same day. */
    static let daysPerMonth = 30.44
    static var expiresInDays: Int {
        authorisation.authorisedByDays + Int((Double(authorisation.validMonths) * daysPerMonth).rounded())
    }
    static var expiresOn: Date { Date().addingTimeInterval(TimeInterval(expiresInDays) * 86_400) }
    static var authorisedOn: Date { Date().addingTimeInterval(TimeInterval(authorisation.authorisedByDays) * 86_400) }
    static var repeatsRemaining: Int { authorisation.repeatsAuthorised - authorisation.repeatsUsed }
    static var daysOfMedicineLeft: Int { repeatsRemaining * authorisation.daysPerRepeat }
    /// Which box closes first. Where it is the date, some of what was authorised cannot be
    /// collected at all, and the screen says so rather than letting a patient plan on it.
    static var bindsOnDate: Bool { expiresInDays < daysOfMedicineLeft }
    static var repeatsCollectableBeforeExpiry: Int {
        min(repeatsRemaining, max(0, expiresInDays / authorisation.daysPerRepeat))
    }
    static var strandedRepeats: Int { repeatsRemaining - repeatsCollectableBeforeExpiry }
    /// Said before the last pack is handed over, not at the counter the month after.
    static var isFinalRepeat: Bool { repeatsRemaining == 1 }

    static var nextCollectionInDays: Int { authorisation.lastCollectedDays + authorisation.minimumDaysBetween }
    static var nextCollectionOn: Date { Date().addingTimeInterval(TimeInterval(nextCollectionInDays) * 86_400) }
    static var lastCollectedOn: Date { Date().addingTimeInterval(TimeInterval(authorisation.lastCollectedDays) * 86_400) }

    /* An early collection is refused with a date, not with a shrug. The days between collections
       belong to the authorisation rather than to the person collecting: somebody accumulating a
       chronic medicine at home is the first thing anybody would want to notice. */
    struct CollectionAnswer {
        let allowed: Bool
        let reason: String
    }
    static var collectionAnswer: CollectionAnswer {
        if repeatsRemaining <= 0 {
            return .init(allowed: false, reason: "Every repeat on \(authorisation.reference) has been used. It ends here, in a review — nothing renews on its own.")
        }
        if expiresInDays < 0 {
            return .init(allowed: false, reason: "\(authorisation.reference) expired \(-expiresInDays) days ago. A repeat cannot be collected against it, and extending it is a doctor's decision rather than this screen's.")
        }
        if nextCollectionInDays > 0 {
            return .init(allowed: false, reason: "The last thirty days were collected \(-authorisation.lastCollectedDays) days ago and this authorisation allows one collection every \(authorisation.minimumDaysBetween) days. The next is due in \(nextCollectionInDays) days — and the question worth asking first is how the last month went.")
        }
        return .init(allowed: true, reason: "One repeat of \(authorisation.daysPerRepeat) days may be collected today. \(repeatsRemaining) of \(authorisation.repeatsAuthorised) remain.")
    }

    /* The prescriber as a partner is allowed to know them: the vetting register's answer, and not
       who they are. medicines.json#partnerQueue.neverCarries lists prescriberRef, so the pharmacy's
       substitution screen and the prescription or laboratory order a partner opens draw this where
       a name and an HPCSA number were. The words are dispensing.json#partner's and the checks'
       names vetting.json's, so it reads exactly as Dispensing.kt and apps/web/src/lib/dispensing.ts
       read it. */
    static func prescriberStanding(_ decision: VettingDecision) -> String {
        if decision.allowed { return Partner.prescriberMay }
        let checks = decision.blockedBy.map(\.name).joined(separator: Partner.checksJoinedBy)
        return Partner.prescriberMayNot.replacingOccurrences(of: "{checks}", with: checks.isEmpty ? Partner.noCheckNamed : checks)
    }

    /* The prescriber as a partner reads them, through the system admin's setting and nowhere else. The founder
       decided on 2 October 2026 that a pharmacist sees the prescriber and made it the admin's to change
       (medicines.json's partner-sees-prescriber-identity; partnerQueue.carriesWhenSet). This phone has no admin
       surface, so it reads the default scripts/emit-dispensing.mjs wrote into Partner.seesPrescriberIdentity, and
       the screen says so in Partner.settingPhone. The name and registration are read here, off the register's own
       subject, only while that says yes; the standing is drawn either way, because a name is not a licence. It
       reads exactly as Dispensing.kt and apps/web/src/lib/dispensing.ts read it. */
    static func prescriberAsPartnerSees(_ subject: VettingSubject?, _ decision: VettingDecision) -> String {
        let standing = prescriberStanding(decision)
        guard Partner.seesPrescriberIdentity, let subject else { return standing }
        return Partner.prescriberNamed.replacingOccurrences(of: "{name}", with: subject.name)
            .replacingOccurrences(of: "{registration}", with: subject.reference)
            .replacingOccurrences(of: "{standing}", with: standing)
    }

    /* What the patient is owed, in words. Assembled here rather than in the view so that iOS,
       Android and the web say the same three things: this is a substitution, this is what it
       replaces, this is what will look different. */
    static func headline(_ item: PrescriptionItem) -> String {
        if item.wasSubstituted { return "This is not what was written on your prescription" }
        if item.patientRefused { return "You were offered a swap and said no" }
        return "This is exactly what was written on your prescription"
    }
}
