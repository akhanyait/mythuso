import Foundation

struct CareService: Identifiable, Hashable {
    let id: String
    let name: String
    let detail: String
    let price: Int
    /// Minutes. The visit's own length decides when it ends; an hour is not the answer for
    /// every service, and pretending otherwise misstates how long somebody has to be at home.
    let duration: Int
    let symbol: String
    static let all: [CareService] = [
        .init(id: "vitals", name: "Vitals & chronic check", detail: "A little check-in. A healthier you.", price: 249, duration: 30, symbol: "heart.text.square"),
        .init(id: "wound", name: "Wound care", detail: "Expert care for your recovery.", price: 299, duration: 40, symbol: "bandage"),
        .init(id: "mother", name: "Mother & baby", detail: "A caring hand for your new chapter.", price: 349, duration: 45, symbol: "figure.and.child.holdinghands"),
        .init(id: "blood", name: "Blood tests", detail: "Sample collection at home.", price: 299, duration: 25, symbol: "drop"),
        .init(id: "injection", name: "Injection & vaccination", detail: "On a valid prescription.", price: 249, duration: 20, symbol: "syringe"),
        .init(id: "planning", name: "Family planning", detail: "Discreet care on your schedule.", price: 249, duration: 25, symbol: "calendar.badge.clock"),
        .init(id: "postop", name: "Post-operative check", detail: "Support after your procedure.", price: 349, duration: 45, symbol: "cross.case"),
        .init(id: "senior", name: "Elderly care", detail: "A thoughtful one-hour visit.", price: 399, duration: 60, symbol: "person.2"),
        .init(id: "certificate", name: "Sick-note visit", detail: "Assessment with doctor review.", price: 249, duration: 30, symbol: "doc.text")
    ]
}
struct GuardianInvitation: Identifiable, Hashable {
    let id: String
    let name: String
    let relationship: String
    let scope: String
    let expires: String
    var status: String
}
/// In-memory only: leaving a booking screen must not discard an unfinished choice.
struct CareBookingDraft: Equatable {
    var patient: String
    var address: String
    var day: Int
    var selectedDate: Date?
    var slot: String
    var payment: String
    var consent: Bool
    var kind: String
    var step: Int
    /// Who was asked for — nearest, previous or named — and the nurse picked from the named list.
    var choice: String = "nearest"
    var nurseId: String? = nil
}

@MainActor final class PreviewStore: ObservableObject {
    @Published var bookingDrafts: [String: CareBookingDraft] = [:]
    /* Seeded with a real date rather than the string "12 September · 09:00", which stopped being
       true the day after somebody typed it and never matched the weekday shown beside it. */
    @Published var visits = [BookedVisit(service: CareService.all[0], patient: "Lerato Molefe",
                                         address: "Home visit · Melville", kind: "scheduled",
                                         date: Date().addingTimeInterval(5 * 86_400), start: "09:00", payment: "Card")]
    /* Visits that were cancelled, which is a different list rather than a shorter one. A cancelled
       visit is not deleted — packages/catalog/cancellation.json says so under doesNotUndo, and the
       reason is that a visit which vanishes is one nobody can ask about afterwards: not the
       patient, not the nurse who was dispatched, and not whoever has to explain it. */
    @Published var cancelled: [CancelledVisit] = []
    /* The words written on each visit’s thread, by visit. In memory and nowhere else: a thread is not a
       health record, booking.json says so, and a message about a gate code quietly written to the disk
       beside a nurse’s captured work would be special personal information held in the wrong place. */
    @Published var threads: [UUID: [VisitThreadMessage]] = [:]

    /* Cancelling moves a visit between the two lists and records the reason given. It never touches
       money — what a late cancellation costs is the open question the contract holds as
       pendingDecision — and it withdraws no consent, because consent is withdrawn on the consent
       screen, deliberately and separately. */
    func cancel(_ visit: BookedVisit, reason: CancellationReason, state: CancellationState) {
        guard !state.refusesCancellation else { return }
        visits.removeAll { $0.id == visit.id }
        cancelled.insert(CancelledVisit(visit: visit, reason: reason, state: state), at: 0)
    }

    /// Moving a visit replaces it in place: the same visit at a different hour, not a second one.
    func reschedule(_ visit: BookedVisit, to date: Date, start: String) -> BookedVisit {
        let moved = visit.moved(to: date, start: start)
        if let index = visits.firstIndex(where: { $0.id == visit.id }) { visits[index] = moved }
        return moved
    }

    /* What somebody typed on the home screen. It lives here rather than in HomeView because the
       home hands off to the catalogue in a different tab: the search used to call book() and throw
       the words away, so the person arrived at an unfiltered list having already said what they
       wanted. */
    @Published var careQuery = ""
    /* Where the visit would happen. It sits beside the person a visit is for because those are the
       two things that change what everything on the home screen means, and a home that opens with a
       promotion instead of them makes a patient guess at both. No GPS is requested for it. */
    @Published var careArea = PreviewStore.careAreas[0]
    static let careAreas = ["Rosebank, Johannesburg", "Soweto, Johannesburg", "Randburg, Johannesburg"]
    @Published var family = ["Nomsa Molefe", "Thabo Molefe"]
    @Published var role = "Patient"
    @Published var reminders = true
    @Published var wearableSharing = false
    @Published var marketing = false
    @Published var locale: ThusoLocale = .english
    /* What somebody wrote in Live well. In memory and nowhere else — deliberately not in either of
       the ledgers on the disk, because wellbeing.json's no-sharing-by-default refusal says what a
       person writes there is not added to their record and is not sent to anybody, and a diary
       quietly persisted beside a nurse's captured work is the first half of sending it. */
    @Published var wellbeing = Wellbeing.seed
    @Published var invitations = [
        GuardianInvitation(id: "INV-0031", name: "Nomsa Molefe", relationship: "Mother", scope: "Visit summaries only", expires: "Until I revoke it", status: "Active"),
        GuardianInvitation(id: "INV-0034", name: "Kagiso Molefe", relationship: "Brother", scope: "Bookings and payments only", expires: "31 December 2026", status: "Awaiting acceptance")
    ]
}
