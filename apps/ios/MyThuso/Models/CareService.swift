import Foundation

struct CareService: Identifiable, Hashable {
    let id: String
    let name: String
    let detail: String
    let price: Int
    let symbol: String
    static let all: [CareService] = [
        .init(id: "vitals", name: "Vitals & chronic check", detail: "A little check-in. A healthier you.", price: 249, symbol: "heart.text.square"),
        .init(id: "wound", name: "Wound care", detail: "Expert care for your recovery.", price: 299, symbol: "bandage"),
        .init(id: "mother", name: "Mother & baby", detail: "A caring hand for your new chapter.", price: 349, symbol: "figure.and.child.holdinghands"),
        .init(id: "blood", name: "Blood tests", detail: "Sample collection at home.", price: 299, symbol: "drop"),
        .init(id: "injection", name: "Injection & vaccination", detail: "On a valid prescription.", price: 249, symbol: "syringe"),
        .init(id: "planning", name: "Family planning", detail: "Discreet care on your schedule.", price: 249, symbol: "flower"),
        .init(id: "postop", name: "Post-operative check", detail: "Support after your procedure.", price: 349, symbol: "cross.case"),
        .init(id: "senior", name: "Elderly care", detail: "A thoughtful one-hour visit.", price: 399, symbol: "person.2"),
        .init(id: "certificate", name: "Sick-note visit", detail: "Assessment with doctor review.", price: 249, symbol: "doc.text")
    ]
}
struct DemoVisit: Identifiable {
    let id = UUID()
    let service: CareService
    let patient: String
    let time: String
}
struct GuardianInvitation: Identifiable, Hashable {
    let id: String
    let name: String
    let relationship: String
    let scope: String
    let expires: String
    var status: String
}
@MainActor final class PreviewStore: ObservableObject {
    @Published var visits = [DemoVisit(service: CareService.all[0], patient: "Lerato Molefe", time: "12 September · 09:00")]
    @Published var family = ["Nomsa Molefe", "Thabo Molefe"]
    @Published var role = "Patient"
    @Published var reminders = true
    @Published var wearableSharing = false
    @Published var marketing = false
    @Published var locale: ThusoLocale = .english
    @Published var invitations = [
        GuardianInvitation(id: "INV-0031", name: "Nomsa Molefe", relationship: "Mother", scope: "Visit summaries only", expires: "Until I revoke it", status: "Active"),
        GuardianInvitation(id: "INV-0034", name: "Kagiso Molefe", relationship: "Brother", scope: "Bookings and payments only", expires: "31 December 2026", status: "Awaiting acceptance")
    ]
}
