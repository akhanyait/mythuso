import SwiftUI

struct ServicesView: View {
    @State private var query = ""
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                DemoBadge()
                CareHeading(eyebrow: "Care, on your terms", title: "Professional care at your door", subtitle: "Choose a service and we’ll match you with the nearest qualified nurse.")
                let matches = CareService.all.filter { query.isEmpty || $0.name.localizedCaseInsensitiveContains(query) }
                if matches.isEmpty { ContentUnavailableView.search(text: query) }
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 11), GridItem(.flexible(), spacing: 11)], spacing: 11) {
                    ForEach(matches) { service in
                        NavigationLink { BookingView(service: service) } label: {
                            CareCard(padding: 15) {
                                TileIcon(symbol: service.symbol)
                                Text(service.name).font(.system(size: 14, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
                                    .frame(maxWidth: .infinity, alignment: .leading).fixedSize(horizontal: false, vertical: true)
                                Text(service.detail).font(.system(size: 11)).foregroundStyle(ThusoTheme.body)
                                    .frame(maxWidth: .infinity, alignment: .leading).fixedSize(horizontal: false, vertical: true)
                                HStack {
                                    Text("From R\(service.price)").font(.system(size: 12, weight: .semibold)).foregroundStyle(ThusoTheme.forest)
                                    Spacer()
                                    Image(systemName: "chevron.right").font(.system(size: 11, weight: .semibold)).foregroundStyle(ThusoTheme.body.opacity(0.6))
                                }
                            }
                        }.buttonStyle(.plain)
                    }
                }
                NavigationLink { FeatureDetail(title: "Chat to our care team") } label: {
                    CareCard { MenuRow(title: "Not sure what you need?", subtitle: "Chat to our care team", symbol: "questionmark.circle") }
                }.buttonStyle(.plain)
                Text("All clinical decisions require a registered clinician. Prescription services require a valid prescription.")
                    .font(.footnote).foregroundStyle(ThusoTheme.body)
            }.padding(18)
        }
        .background(ThusoTheme.canvas)
        .navigationTitle("Book care").navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.visible, for: .navigationBar).toolbarBackground(ThusoTheme.canvas, for: .navigationBar)
        .searchable(text: $query, prompt: "Find a service")
    }
}
struct BookingView: View {
    let service: CareService
    @EnvironmentObject private var store: PreviewStore
    @State private var patient = "Lerato Molefe"
    @State private var address = "Home visit · Sandton"
    @State private var day = 0
    @State private var slot = "09:00"
    @State private var payment = "Card"
    @State private var consent = false
    @State private var step = 0
    @State private var booked = false
    private let days = [("Fri", "12", "Sep"), ("Sat", "13", "Sep"), ("Sun", "14", "Sep"), ("Mon", "15", "Sep"), ("Tue", "16", "Sep")]
    private let slots = ["08:00", "09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00"]
    private let labels = ["Who & where", "Date & time", "Payment", "Review"]
    private var endTime: String { String(format: "%02d:00", (Int(slot.prefix(2)) ?? 9) + 1) }
    private var when: String { "\(days[day].0) \(days[day].1) \(days[day].2) · \(slot)" }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if booked { success } else {
                    StepDots(step: step + 1, total: 4, label: labels[step])
                    switch step {
                    case 0: whoAndWhere
                    case 1: dateAndTime
                    case 2: paymentStep
                    default: review
                    }
                }
            }.padding(18)
        }
        .background(ThusoTheme.canvas)
        .navigationTitle(booked ? "All set" : "Your home visit").navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.visible, for: .navigationBar).toolbarBackground(ThusoTheme.canvas, for: .navigationBar)
    }
    private var summary: some View {
        CareCard {
            HStack(spacing: 13) {
                TileIcon(symbol: service.symbol)
                VStack(alignment: .leading, spacing: 4) {
                    Text(service.name).font(.system(size: 15, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
                    Text("Registered nurse").font(.system(size: 12)).foregroundStyle(ThusoTheme.body)
                }
                Spacer(minLength: 6)
                Text("R\(service.price)").font(.system(size: 16, weight: .bold)).foregroundStyle(ThusoTheme.ink)
            }
        }
    }
    @ViewBuilder private var whoAndWhere: some View {
        summary
        CareCard {
            Picker("Who is this visit for?", selection: $patient) { ForEach(["Lerato Molefe"] + store.family, id: \.self) { Text($0) } }
            Divider().overlay(ThusoTheme.line)
            TextField("Visit location", text: $address)
        }
        Text("Sample availability and proposal pricing. Tests, medicines and prescriptions may require separate arrangements.")
            .font(.footnote).foregroundStyle(ThusoTheme.body)
        Button("Continue") { step = 1 }.buttonStyle(CareButton()).disabled(address.trimmingCharacters(in: .whitespaces).count < 5)
    }
    @ViewBuilder private var dateAndTime: some View {
        Text("Choose a date and time").font(.system(size: 17, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 9) {
                ForEach(Array(days.enumerated()), id: \.offset) { index, date in
                    Button { day = index } label: {
                        VStack(spacing: 2) {
                            Text(date.0.uppercased()).font(.system(size: 10, weight: .semibold))
                            Text(date.1).font(.system(size: 17, weight: .bold))
                            Text(date.2.uppercased()).font(.system(size: 10, weight: .semibold))
                        }
                        .frame(width: 66, height: 72)
                        .background(day == index ? ThusoTheme.teal : .white, in: RoundedRectangle(cornerRadius: 14))
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(day == index ? ThusoTheme.teal : ThusoTheme.line, lineWidth: 1))
                        .foregroundStyle(day == index ? .white : ThusoTheme.body)
                    }
                    .accessibilityLabel("\(date.0) \(date.1) \(date.2)")
                    .accessibilityAddTraits(day == index ? [.isSelected] : [])
                }
            }
        }
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 9), count: 3), spacing: 9) {
            ForEach(slots, id: \.self) { time in
                Button { slot = time } label: {
                    Text(time).font(.system(size: 14, weight: .semibold))
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .background(slot == time ? ThusoTheme.teal : .white, in: RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(slot == time ? ThusoTheme.teal : ThusoTheme.line, lineWidth: 1))
                        .foregroundStyle(slot == time ? .white : ThusoTheme.body)
                }.accessibilityAddTraits(slot == time ? [.isSelected] : [])
            }
        }
        Label("Average arrival time: within 60 minutes", systemImage: "bolt.fill")
            .font(.footnote).foregroundStyle(ThusoTheme.body).frame(maxWidth: .infinity)
        HStack(spacing: 10) {
            Button("Back") { step = 0 }.buttonStyle(QuietButton())
            Button("Continue") { step = 2 }.buttonStyle(CareButton())
        }
    }
    @ViewBuilder private var paymentStep: some View {
        Text("How would you like to pay?").font(.system(size: 17, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
        ForEach([("Card", "Visa ending 4242"), ("Cash", "Pay the nurse after the visit"), ("Thuso Wallet", "Demo balance R500.00")], id: \.0) { option in
            Button { payment = option.0 } label: {
                CareCard {
                    HStack(spacing: 12) {
                        Image(systemName: payment == option.0 ? "largecircle.fill.circle" : "circle").foregroundStyle(ThusoTheme.teal)
                        TileIcon(symbol: "creditcard", size: 38)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(option.0).font(.system(size: 15, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
                            Text(option.1).font(.system(size: 12)).foregroundStyle(ThusoTheme.body)
                        }
                        Spacer(minLength: 0)
                    }
                }
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(payment == option.0 ? [.isSelected] : [])
        }
        Text("No card is stored and no payment is taken. Production payments run through a regulated provider, never through MyThuso directly.")
            .font(.footnote).foregroundStyle(ThusoTheme.body)
        HStack(spacing: 10) {
            Button("Back") { step = 1 }.buttonStyle(QuietButton())
            Button("Continue") { step = 3 }.buttonStyle(CareButton())
        }
    }
    @ViewBuilder private var review: some View {
        summary
        CareCard {
            LabeledContent("Date", value: "\(days[day].0) \(days[day].1) \(days[day].2) 2026")
            LabeledContent("Time", value: "\(slot) – \(endTime)")
            LabeledContent("Location", value: address)
            LabeledContent("Patient", value: patient)
            Divider().overlay(ThusoTheme.line)
            HStack(spacing: 11) {
                Text("SN").font(.system(size: 13, weight: .bold)).foregroundStyle(ThusoTheme.tealDeep)
                    .frame(width: 42, height: 42).background(ThusoTheme.mint, in: Circle())
                VStack(alignment: .leading, spacing: 3) {
                    Text("Sister Naledi Mokoena").font(.system(size: 14, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
                    Text("Registered Nurse (SANC)").font(.system(size: 11)).foregroundStyle(ThusoTheme.body)
                }
                Spacer(minLength: 4)
                Text("★ 4.9").font(.system(size: 12, weight: .semibold)).foregroundStyle(ThusoTheme.body)
            }
            Divider().overlay(ThusoTheme.line)
            HStack(spacing: 12) {
                TileIcon(symbol: "creditcard", size: 38)
                Text(payment == "Card" ? "•••• 4242" : payment).font(.system(size: 14, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
                Spacer()
                Button("Change") { step = 2 }.font(.system(size: 13, weight: .semibold)).foregroundStyle(ThusoTheme.teal)
            }
        }
        Toggle("I understand this is a UI preview using fictional information.", isOn: $consent).font(.footnote)
        Button("Confirm & book") {
            store.visits.insert(.init(service: service, patient: patient, time: "\(when) – \(endTime)"), at: 0)
            booked = true
        }.buttonStyle(CareButton()).disabled(!consent)
        Text("You can cancel or reschedule up to 2 hours before the visit.").font(.footnote).foregroundStyle(ThusoTheme.body).frame(maxWidth: .infinity)
        Button("Back") { step = 2 }.buttonStyle(QuietButton())
    }
    @ViewBuilder private var success: some View {
        VStack(spacing: 14) {
            Image(systemName: "checkmark").font(.system(size: 26, weight: .bold)).foregroundStyle(ThusoTheme.teal)
                .frame(width: 64, height: 64).background(ThusoTheme.tealSoft, in: Circle())
            Text("Your demo visit is booked.").font(.system(size: 19, weight: .bold)).foregroundStyle(ThusoTheme.ink)
            Text("\(service.name) for \(patient.split(separator: " ").first ?? "")\n\(when) – \(endTime)")
                .font(.subheadline).foregroundStyle(ThusoTheme.body).multilineTextAlignment(.center)
            Text("This is a preview. No nurse has been dispatched and no payment was taken.")
                .font(.footnote).foregroundStyle(ThusoTheme.body).multilineTextAlignment(.center)
            NavigationLink { VisitsView() } label: { Text("View my visits") }.buttonStyle(CareButton())
        }.frame(maxWidth: .infinity)
    }
}
struct VisitsView: View {
    @EnvironmentObject private var store: PreviewStore
    @State private var tab = "Upcoming"
    @State private var state: LoadState = .ready
    private struct Row: Identifiable { let id = UUID(); let title: String; let time: String; let place: String; let status: String; let tone: String; let date: (String, String, String); let nurse: Bool }
    private var rows: [Row] {
        switch tab {
        case "Past": return [Row(title: "Wound care", time: "10:00 – 10:40", place: "Home visit · Sandton", status: "Completed", tone: "teal", date: ("THU", "4", "SEP"), nurse: false)]
        case "Cancelled": return [Row(title: "Blood tests", time: "08:00 – 08:30", place: "Home visit · Soweto", status: "Cancelled", tone: "amber", date: ("TUE", "26", "AUG"), nurse: false)]
        default:
            return store.visits.enumerated().map { index, visit in
                Row(title: visit.service.name, time: visit.time, place: "Home visit · Sandton · \(visit.patient)", status: "Confirmed", tone: "teal", date: ("FRI", "12", "SEP"), nurse: index == 0)
            } + [Row(title: "Wound care", time: "10:00 – 11:00", place: "Home visit · Sandton", status: "Pending", tone: "amber", date: ("WED", "24", "SEP"), nurse: false),
                 Row(title: "Mother & baby", time: "14:00 – 15:00", place: "Home visit · Rivonia", status: "Scheduled", tone: "sky", date: ("MON", "6", "OCT"), nurse: false)]
        }
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Picker("Visit status", selection: $tab) { ForEach(["Upcoming", "Past", "Cancelled"], id: \.self) { Text($0) } }.pickerStyle(.segmented)
                StatePicker(title: "Preview how this list behaves when the network or service is unavailable", state: $state)
                StateBlock(state: state, subject: "Your visit list", permission: "notifications", retry: { state = .ready }) {
                    VStack(spacing: 14) {
                        ForEach(rows) { row in
                            CareCard {
                                HStack(alignment: .top, spacing: 13) {
                                    VStack(spacing: 1) {
                                        Text(row.date.0).font(.system(size: 9, weight: .bold)).foregroundStyle(ThusoTheme.body)
                                        Text(row.date.1).font(.system(size: 19, weight: .bold)).foregroundStyle(ThusoTheme.ink)
                                        Text(row.date.2).font(.system(size: 9, weight: .bold)).foregroundStyle(ThusoTheme.body)
                                    }
                                    .frame(width: 52, height: 62)
                                    .background(ThusoTheme.canvas, in: RoundedRectangle(cornerRadius: 14))
                                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(ThusoTheme.line, lineWidth: 1))
                                    VStack(alignment: .leading, spacing: 7) {
                                        HStack(alignment: .top) {
                                            Text(row.title).font(.system(size: 15, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
                                            Spacer(minLength: 8)
                                            StatusPill(text: row.status, tone: row.tone)
                                        }
                                        Label(row.time, systemImage: "clock").font(.system(size: 12)).foregroundStyle(ThusoTheme.body)
                                        Label(row.place, systemImage: "mappin.and.ellipse").font(.system(size: 12)).foregroundStyle(ThusoTheme.body)
                                    }
                                }
                                if row.nurse, let visit = store.visits.first {
                                    Divider().overlay(ThusoTheme.line)
                                    HStack(spacing: 11) {
                                        Text("SN").font(.system(size: 13, weight: .bold)).foregroundStyle(ThusoTheme.tealDeep)
                                            .frame(width: 42, height: 42).background(ThusoTheme.mint, in: Circle())
                                        VStack(alignment: .leading, spacing: 3) {
                                            Text("Sister Naledi Mokoena").font(.system(size: 14, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
                                            Text("Registered Nurse (SANC)").font(.system(size: 11)).foregroundStyle(ThusoTheme.body)
                                        }
                                        Spacer(minLength: 0)
                                    }
                                    HStack(spacing: 10) {
                                        NavigationLink { FeatureDetail(title: "Reschedule visit") } label: { Text("Reschedule").frame(maxWidth: .infinity) }.buttonStyle(QuietButton())
                                        NavigationLink { VisitDetailView(visit: visit) } label: { Text("View details").frame(maxWidth: .infinity) }.buttonStyle(CareButton())
                                    }
                                }
                            }
                        }
                        if rows.isEmpty { EmptyStateCard(title: "No \(tab.lowercased()) visits", message: "When you book a visit it appears here, with the nurse’s name and what to have ready.") }
                    }
                }
                promo
            }.padding(18)
        }
        .background(ThusoTheme.canvas)
        .navigationTitle("Your visits").navigationBarTitleDisplayMode(.large)
    }
    private var promo: some View {
        ZStack(alignment: .bottomTrailing) {
            LinearGradient(colors: [Color(red: 0.071, green: 0.337, blue: 0.294), ThusoTheme.teal], startPoint: .topLeading, endPoint: .bottomTrailing)
            Image("Family").resizable().scaledToFit().frame(height: 150).accessibilityHidden(true)
                .frame(maxWidth: .infinity, alignment: .trailing)
            VStack(alignment: .leading, spacing: 9) {
                Text("Care that fits\nyour life.").font(.system(size: 23, weight: .bold)).foregroundStyle(.white)
                Text("Easy booking. Trusted professionals.").font(.system(size: 13)).foregroundStyle(Color(red: 0.788, green: 0.902, blue: 0.867))
                NavigationLink { ServicesView() } label: {
                    Label("Book another visit", systemImage: "arrow.right").font(.system(size: 14, weight: .semibold))
                        .padding(.horizontal, 18).padding(.vertical, 13)
                        .background(.white, in: Capsule()).foregroundStyle(ThusoTheme.tealDeep)
                }
            }
            .padding(20).frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(minHeight: 190)
        .clipShape(RoundedRectangle(cornerRadius: 18))
    }
}
struct VisitDetailView: View {
    let visit: DemoVisit
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                DemoBadge()
                CareHeading(eyebrow: "Confirmed · Demo", title: visit.service.name, subtitle: visit.time)
                CareCard {
                    LabeledContent("Patient", value: visit.patient)
                    LabeledContent("When", value: visit.time)
                    LabeledContent("Nurse", value: "Sister Naledi Mokoena")
                }
                CareCard {
                    Text("Before your visit").font(.system(size: 15, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
                    Text("Have your medication list ready.").font(.subheadline).foregroundStyle(ThusoTheme.ink)
                    Text("Secure messaging, arrival updates and rescheduling will be connected in the functionality phase.")
                        .font(.footnote).foregroundStyle(ThusoTheme.body)
                }
            }.padding(18)
        }
        .background(ThusoTheme.canvas)
        .navigationTitle("Visit details").navigationBarTitleDisplayMode(.inline)
    }
}
