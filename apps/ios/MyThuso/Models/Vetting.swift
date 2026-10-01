import Combine
import Foundation

/* Vetting is the gate the whole marketplace rests on, so it is a real pipeline with real refusals
   rather than a list of names. Thirteen parties are vetted — not only nurses — and each one is
   refused something specific, in its own words, until its checks pass.

   The roles, checks, issuing authorities, credential formats and refusal sentences are described
   once, as data, in packages/catalog/vetting.json. The native apps do not read JSON at runtime, so
   scripts/emit-vetting.mjs writes that table out as Swift into VettingData.swift, which is compiled
   into the binary like any other source. The table used to be typed here by hand and compared
   substring by substring; generating it means the two cannot disagree in the first place.

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
    /// Which of the seven onboarding gates this check sits at.
    let gate: String
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
/// One of the seven onboarding gates, generated into VettingData.swift. `evidencedBy` is "enrolment"
/// for Apply and "gates" for Activate: the two gates no check carries.
struct VettingGate: Identifiable, Hashable {
    let id: String
    let order: Int
    let name: String
    let hardStop: Bool
    let evidencedBy: String?
    let failRule: String
    let statement: String
}
struct VettingGateRules {
    let lapse: String
    let suspended: String
    let declined: String
    let notActivated: String
    let status: String
}
struct VettingGateNote: Hashable {
    let kind: String
    let sentence: String
}

enum Vetting {
    /* The capabilities, the issuing authorities and their credential formats, the vetted roles
       with their refusal sentences and checks, and the scopes of practice are generated into
       VettingData.swift from packages/catalog/vetting.json. Everything below is the reasoning
       about that table, which is not data and is not generated. */

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

// MARK: - The seven gates

/* Apply, identity, credentials, background, assess, train, activate. Every check in the contract
   names its gate, and where a party stands is worked out from the checks every time it is asked and
   never written down: a stored "gate 3" stops being true the night a clearance lapses. The same
   arithmetic is in apps/api/src/vetting/gates.ts and lib/vetting.ts, and every sentence comes out of
   VettingData — the fail rules are rendered word for word, never paraphrased.

   A declined check at a hard-stop gate stops the party there and outranks anything still pending
   earlier. A lapsed check holds the party at its gate with the lapse sentence rather than the gate's
   fail rule, because a clearance that ran out is not a listing on a register. */
enum GateState: String { case passed, notChecked = "not-checked", pending, held, failed, notReached = "not-reached" }
enum GateOutcome: String { case activated, inProgress = "in-progress", held, failed, stopped, suspended, declined }
struct GateStanding: Identifiable {
    let gate: VettingGate
    var state: GateState
    let outstanding: [VettingCheck]
    let note: VettingGateNote?
    var id: String { gate.id }
}
struct GateProgress {
    let gates: [GateStanding]
    let at: VettingGate
    let status: String
    let outcome: GateOutcome
    let sentence: String?
    var activated: Bool { outcome == .activated }
}
func gateStatus(_ gate: VettingGate) -> String {
    Vetting.gateRules.status
        .replacingOccurrences(of: "{order}", with: "\(gate.order)")
        .replacingOccurrences(of: "{total}", with: "\(Vetting.gates.count)")
        .replacingOccurrences(of: "{name}", with: gate.name)
}
func gateProgress(_ subject: VettingSubject) -> GateProgress {
    let checks = subject.role?.checks ?? []
    let notes = Vetting.gateNotes[subject.roleId] ?? [:]
    var standings: [GateStanding] = Vetting.gates.sorted { $0.order < $1.order }.map { gate in
        if gate.evidencedBy == "enrolment" { return GateStanding(gate: gate, state: .passed, outstanding: [], note: nil) }
        if gate.evidencedBy == "gates" { return GateStanding(gate: gate, state: .pending, outstanding: [], note: nil) }
        let here = checks.filter { $0.gate == gate.id }
        if here.isEmpty { return GateStanding(gate: gate, state: .notChecked, outstanding: [], note: notes[gate.id]) }
        let states = here.map { stateOf(subject, $0.id) }
        let outstanding = here.filter { check in
            let record = recordFor(subject, check.id)
            return !(resolveState(record).passes && (!check.isHighRisk || !(record.secondedBy ?? "").isEmpty))
        }
        let state: GateState = states.contains(.declined) ? .failed : states.contains(.lapsed) ? .held : outstanding.isEmpty ? .passed : .pending
        return GateStanding(gate: gate, state: state, outstanding: outstanding, note: nil)
    }
    func finish(_ at: VettingGate, _ outcome: GateOutcome, _ sentence: String?) -> GateProgress {
        let suspended = subject.suspended && outcome == .inProgress
        return GateProgress(gates: standings, at: at, status: gateStatus(at),
                            outcome: suspended ? .suspended : outcome,
                            sentence: suspended ? (subject.suspendedReason ?? Vetting.gateRules.suspended) : sentence)
    }
    if let stop = standings.first(where: { $0.gate.hardStop && $0.state == .failed }) {
        for index in standings.indices where standings[index].gate.order > stop.gate.order { standings[index].state = .notReached }
        return finish(stop.gate, .stopped, stop.gate.failRule)
    }
    if let first = standings.first(where: { $0.gate.evidencedBy != "gates" && $0.state != .passed && $0.state != .notChecked }) {
        switch first.state {
        case .failed: return finish(first.gate, .failed, first.gate.failRule)
        case .held: return finish(first.gate, .held, Vetting.gateRules.lapse)
        default: return finish(first.gate, .inProgress, nil)
        }
    }
    guard let activateIndex = standings.firstIndex(where: { $0.gate.evidencedBy == "gates" }) else {
        return finish(standings[standings.count - 1].gate, .inProgress, nil)
    }
    let activate = standings[activateIndex].gate
    if subject.declined { return finish(activate, .declined, subject.declinedReason ?? Vetting.gateRules.declined) }
    if subject.suspended { return finish(activate, .suspended, subject.suspendedReason ?? Vetting.gateRules.suspended) }
    standings[activateIndex].state = .passed
    return finish(activate, .activated, nil)
}

// MARK: - The blocking matrix

/* This is the whole point of the module: not a list of documents, but a refusal with a reason
   attached to it, that other screens ask about before they offer an action. */
struct VettingDecision {
    let allowed: Bool
    let reason: String?
    let blockedBy: [VettingCheck]
}
/* Role names are written for people, so "Internal admin staff" is plural and "Employer" takes "an",
   and lowercasing the whole name turns "Thuso Corner site" into "thuso corner site". A refusal that
   misspells the reader's own role is a refusal nobody trusts. Web and Android say it this way too. */
func neverGranted(_ role: VettedRole?) -> String {
    guard let role else { return "This party is never granted that." }
    if role.name.hasSuffix("staff") { return "\(role.name) are never granted this." }
    let article = "AEIOU".contains(role.name.uppercased().first ?? " ") ? "An" : "A"
    return "\(article) \(role.name) is never granted this."
}

func can(_ subject: VettingSubject, _ capabilityId: String) -> VettingDecision {
    let role = subject.role
    guard let grant = role?.grants.first(where: { $0.capability == capabilityId }) else {
        return VettingDecision(allowed: false, reason: neverGranted(role), blockedBy: [])
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
