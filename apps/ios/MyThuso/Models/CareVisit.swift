import Foundation

/* The Care engine's rules for the visit the nurse workspace walks, hand-written for iOS.
 *
 * The sentences, the service requirements, the stages and the preview visit are CareData, generated
 * from packages/catalog/care.json and the route contract. What is hand-written here is the arithmetic
 * packages/engines/src/care/domain decides with, for the one nurse this phone belongs to: whether she
 * may be offered the visit at all and in what words she is withheld, when the offer lapses, whether
 * the code opens and closes the visit, whether a checklist may run, and whether the patient may still
 * be shown where she is. The gates are asked in the domain's order — scope of practice, a place to
 * measure from, a current badge — so a nurse withheld on the web is withheld here for the same reason.
 *
 * WHAT STANDS IN FOR THE PLATFORM, as on the web. Verify's badge is the preview's own vetting summary
 * of this nurse; the record's answer about the encounter is the visit queue's sign-off for this visit.
 * Nothing is sent anywhere. The store is in memory: a visit accepted here is gone when the app is.
 *
 * WHAT IT DOES NOT PORT. The ranking of other nurses and the cascade to them. This phone belongs to one
 * nurse and is never shown who else was asked, so a decline and a lapse end here with the contract's
 * sentence that the visit has gone on, and who it went to is the engine's business. */
@MainActor final class CareVisitStore: ObservableObject {
    static let shared = CareVisitStore()

    enum OfferState: Equatable { case open, accepted, declined, lapsed }

    enum Stage: String, CaseIterable, Identifiable {
        case route, start, checklist, record, handover, complete
        var id: String { rawValue }
        var name: String { CareData.stages.first { $0.id == rawValue }?.name ?? rawValue }
    }

    struct Offer: Equatable {
        let expiresAt: Date
        let marker: String?
        let distanceKm: Double
        var state: OfferState
    }

    /// A refusal, with the stage whose control was refused so it is shown beside that control.
    struct Refusal: Equatable {
        let stage: Stage?
        let statement: String
    }

    @Published private(set) var offer: Offer?
    @Published private(set) var withheld: String?
    @Published private(set) var stage: Stage = .route
    @Published private(set) var startedAt: Date?
    @Published private(set) var handedOver = false
    @Published private(set) var completedAt: Date?
    @Published private(set) var refusal: Refusal?
    @Published private(set) var now = Date()

    let service = CareService.all.first { $0.id == CareData.Preview.serviceId }
    let visitZone = Geography.zone(id: CareData.Preview.zone)
    let nurseBase: Geography.Zone?
    let scheduledFor: Date

    var accepted: Bool { offer?.state == .accepted }
    var completed: Bool { completedAt != nil }

    private init() {
        let clock = Date()
        now = clock
        scheduledFor = Self.instant(on: clock, dayOffset: CareData.Preview.dayOffset, slot: CareData.Preview.slot)
        let nurse = VettingStore.shared.subject(CareData.Preview.clinicianRef)
        nurseBase = nurse?.zone.flatMap { Geography.zone(named: $0) }
        guard let nurse, let requirement = CareData.requirement(CareData.Preview.serviceId) else {
            withheld = CareData.noEligibleClinician
            return
        }
        /* Scope first: nothing about a badge changes whether she is registered to do the work. */
        if let scope = requirement.scope, !nurse.scope.contains(scope) { withheld = CareData.outsideScope; return }
        /* Then a place to measure from, because a distance invented for her would rank her against people
           whose distance is real. */
        guard let base = nurseBase, let to = visitZone else { withheld = CareData.noBase; return }
        /* Then the badge. Withheld, never offered last. */
        guard summarise(nurse).cleared else { withheld = CareData.noCurrentTrustScore; return }
        offer = Offer(
            expiresAt: clock.addingTimeInterval(TimeInterval(CareData.offerExpiresAfterMinutes * 60)),
            marker: CareData.Preview.previousClinicianRefs.contains(nurse.id) ? CareData.markerPrevious : nil,
            distanceKm: Geography.distanceKm(base.at, to.at),
            state: .open
        )
    }

    // MARK: - The offer

    /// Time passing. An open offer past its expiry lapses, and a lapsed offer cannot be accepted however
    /// close to the line the tap was.
    func tick(_ at: Date = Date()) {
        now = at
        if var current = offer, current.state == .open, at >= current.expiresAt {
            current.state = .lapsed
            offer = current
        }
    }

    var minutesLeft: Int {
        guard let offer else { return 0 }
        return max(0, Int((offer.expiresAt.timeIntervalSince(now) / 60).rounded(.up)))
    }

    func accept(_ at: Date = Date()) {
        tick(at)
        guard var current = offer else { return }
        guard current.state == .open else { refusal = Refusal(stage: nil, statement: CareData.offerExpired); return }
        current.state = .accepted
        offer = current
        refusal = nil
        stage = .route
    }

    func decline(_ at: Date = Date()) {
        tick(at)
        guard var current = offer, current.state == .open else { return }
        current.state = .declined
        offer = current
        refusal = nil
    }

    // MARK: - The visit

    func go(to next: Stage) {
        stage = next
        refusal = nil
    }

    /* The day is asked before the code, so a wrong-day attempt learns nothing about whether its code was
       right. A wrong code changes nothing and counts nothing: there is no number of attempts that
       quietly opens the door. */
    func start(code: String, at: Date = Date()) {
        guard accepted else { return }
        if startedAt != nil { stage = .checklist; return }
        guard sameDay(scheduledFor, at) else { refusal = Refusal(stage: .start, statement: CareData.notToday); return }
        guard Self.matches(code) else { refusal = Refusal(stage: .start, statement: CareData.startCodeWrong); return }
        startedAt = at
        refusal = nil
        stage = .checklist
    }

    var protocols: [ProtocolsData.Entry] {
        (CareData.requirement(CareData.Preview.serviceId)?.protocolIds ?? []).compactMap { ProtocolsData.entry($0) }
    }
    /// True only when every protocol the service names is ratified. Today none is.
    var checklistRunnable: Bool { !protocols.isEmpty && protocols.allSatisfy(\.ratified) }
    var checklistRefusal: String? {
        protocols.isEmpty ? CareData.checklistNoProtocol : (checklistRunnable ? nil : CareData.checklistNotRatified)
    }
    var checklistWhy: String? { protocols.contains { $0.status == "draft" } ? CareData.draftCarriesNothing : nil }

    /// The record's answer in this preview: the visit assessment for this visit has been signed off on this phone.
    var signedOff: Bool {
        VisitQueueStore.shared.parts.contains { $0.visitReference == CareData.Preview.appointmentRef && $0.kind == .signOff }
    }

    func handOver() {
        guard startedAt != nil else { refusal = Refusal(stage: .handover, statement: CareData.handoverWithoutVisit); return }
        /* Whether a signed-off assessment counts as a signed encounter is a setting; the phone uses its generated
           default, which is today's behaviour. Switched off in the contract, nothing on this phone can prove a
           signature, so handover and completion are refused in the engine's sentence naming the missing route. */
        guard CareData.encounterEntryCountsAsSigned else { refusal = Refusal(stage: .handover, statement: CareData.encounterSignatureUnconfirmed); return }
        guard signedOff else { refusal = Refusal(stage: .handover, statement: CareData.encounterIncomplete); return }
        handedOver = true
        refusal = nil
        stage = .complete
    }

    func complete(code: String, at: Date = Date()) {
        guard startedAt != nil else { refusal = Refusal(stage: .complete, statement: CareData.completeWithoutStart); return }
        guard Self.matches(code) else { refusal = Refusal(stage: .complete, statement: CareData.completeCodeWrong); return }
        guard CareData.encounterEntryCountsAsSigned else { refusal = Refusal(stage: .complete, statement: CareData.encounterSignatureUnconfirmed); return }
        guard signedOff else { refusal = Refusal(stage: .complete, statement: CareData.encounterUnsigned); return }
        completedAt = at
        refusal = nil
    }

    /// Whether the patient may be shown where the nurse is: on the visit's day, and only until it is complete.
    var locationShared: Bool { accepted && completedAt == nil && sameDay(scheduledFor, now) }
    var locationSentence: String { locationShared ? CareData.locationWhileShared : CareData.locationBeyondTheVisit }

    // MARK: - Arithmetic

    /* Compared across the whole length whatever the first difference, so the time a refusal takes does
       not say how many leading digits were right. */
    private static func matches(_ offered: String) -> Bool {
        let held = Array(CareData.Preview.visitCode.utf8), given = Array(offered.utf8)
        var difference = held.count ^ given.count
        for index in 0..<max(held.count, given.count) {
            difference |= Int(index < held.count ? held[index] : 0) ^ Int(index < given.count ? given[index] : 0)
        }
        return !held.isEmpty && difference == 0
    }

    static var zone: TimeZone { TimeZone(identifier: Scheduling.timezone) ?? .current }

    private func sameDay(_ a: Date, _ b: Date) -> Bool {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = Self.zone
        return calendar.isDate(a, inSameDayAs: b)
    }

    /// A slot on a day offset from `clock`, in the contract's timezone rather than the phone's.
    static func instant(on clock: Date, dayOffset: Int, slot: String) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        let day = calendar.date(byAdding: .day, value: dayOffset, to: clock) ?? clock
        let pieces = slot.split(separator: ":").compactMap { Int($0) }
        return calendar.date(bySettingHour: pieces.first ?? 0, minute: pieces.dropFirst().first ?? 0, second: 0, of: day) ?? day
    }

    /// A time of day as the visit's timezone reads it.
    static func clock(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.timeZone = zone
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: date)
    }
}
