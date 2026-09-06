import SwiftUI

struct ServicesView: View {
    @State private var query = ""
    var body: some View {
        ScrollView { VStack(alignment: .leading, spacing: 16) { DemoBadge(); CareHeading(eyebrow: "Care, on your terms", title: "A little help, at home.", subtitle: "Choose the care you need."); ForEach(CareService.all.filter { query.isEmpty || $0.name.localizedCaseInsensitiveContains(query) }) { service in NavigationLink { BookingView(service: service) } label: { CareCard { HStack { Image(systemName: service.symbol).font(.title2).foregroundStyle(ThusoTheme.teal).frame(width: 40); VStack(alignment: .leading, spacing: 6) { Text(service.name).font(.headline); Text(service.detail).font(.caption).foregroundStyle(.secondary) }; Spacer(); Text("R\(service.price)").font(.subheadline.weight(.semibold)) } } }.buttonStyle(.plain) }; if !query.isEmpty && !CareService.all.contains(where: { $0.name.localizedCaseInsensitiveContains(query) }) { ContentUnavailableView.search(text: query) } }.padding(20) }.background(ThusoTheme.canvas).navigationTitle("Book care").searchable(text: $query, prompt: "Find a service")
    }
}
struct BookingView: View {
    let service: CareService
    @EnvironmentObject private var store: PreviewStore
    @State private var patient = "Lerato Molefe"
    @State private var time = "Tomorrow · 09:00–10:00"
    @State private var address = "Rosebank, Johannesburg"
    @State private var payment = "Card after visit"
    @State private var consent = false
    @State private var step = 0
    var body: some View {
        Form {
            Section { Label("Demo booking · No charge", systemImage: "sparkles").foregroundStyle(ThusoTheme.teal); Text(service.name).font(.title2.weight(.semibold)); Text("Visit fee: R\(service.price)") }
            if step == 0 {
                Section("Your visit") { Picker("Who is this for?", selection: $patient) { ForEach(["Lerato Molefe"] + store.family, id: \.self) { Text($0) } }; TextField("Visit location", text: $address); Picker("Time", selection: $time) { Text("Tomorrow · 09:00–10:00"); Text("Tomorrow · 14:00–15:00"); Text("Friday · 10:00–11:00") }; Picker("Payment", selection: $payment) { Text("Card after visit"); Text("Cash after visit"); Text("Thuso Wallet") } }
                Section { Button("Review visit →") { step = 1 }.disabled(address.trimmingCharacters(in: .whitespaces).count < 5) }
            } else if step == 1 {
                Section("Review") { LabeledContent("Patient", value: patient); LabeledContent("Time", value: time); LabeledContent("Location", value: address); LabeledContent("Payment", value: payment); Toggle("I understand this uses fictional data and does not dispatch a nurse.", isOn: $consent) }
                Section { Button("Confirm demo visit") { store.visits.insert(.init(service: service, patient: patient, time: time), at: 0); step = 2 }.disabled(!consent); Button("Back") { step = 0 } }
            } else { Section { Label("Your demo visit is booked", systemImage: "checkmark.circle.fill").foregroundStyle(ThusoTheme.teal); Text("No nurse has been dispatched and no payment was taken."); NavigationLink("View visits") { VisitsView() } } }
            Section { Text("Prices and availability are illustrative. Prescription services require a valid prescription. Production bookings require appropriate identity and consent checks.").font(.caption).foregroundStyle(.secondary) }
        }.navigationTitle(step == 2 ? "All set" : "Your home visit").navigationBarTitleDisplayMode(.inline)
    }
}
struct VisitsView: View {
    @EnvironmentObject private var store: PreviewStore
    var body: some View { List { Section { DemoBadge() } ; Section("Upcoming visits") { ForEach(store.visits) { visit in NavigationLink { VisitDetailView(visit: visit) } label: { VStack(alignment: .leading, spacing: 8) { Text(visit.service.name).font(.headline); Text(visit.time).font(.subheadline).foregroundStyle(.secondary); Text("For \(visit.patient) · Demo").font(.caption).foregroundStyle(ThusoTheme.teal) }.padding(.vertical, 8) } } }; Section { NavigationLink("Book another visit") { ServicesView() } } }.navigationTitle("Your visits") }
}
struct VisitDetailView: View {
    let visit: DemoVisit
    var body: some View { List { Section("Confirmed · Demo") { Text(visit.service.name).font(.title2); LabeledContent("Patient", value: visit.patient); LabeledContent("When", value: visit.time); LabeledContent("Nurse", value: "Sister Naledi Mokoena") }; Section("Before your visit") { Text("Have your medication list ready."); Text("Secure messaging, arrival updates and rescheduling will be connected in the functionality phase.").foregroundStyle(.secondary) } }.navigationTitle("Visit details") }
}
