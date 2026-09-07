import SwiftUI

struct ServicesView: View {
    @EnvironmentObject private var store: PreviewStore
    /* Bound to the store, so a query typed on the home screen is already applied when this opens. */
    private var query: Binding<String> { Binding(get: { store.careQuery }, set: { store.careQuery = $0 }) }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                DemoBadge()
                CareHeading(eyebrow: "Care, on your terms", title: "Professional care at your door", subtitle: "Choose a service and we’ll match you with the nearest qualified nurse.")
                let matches = CareService.all.filter { store.careQuery.isEmpty || $0.name.localizedCaseInsensitiveContains(store.careQuery) }
                if matches.isEmpty { ContentUnavailableView.search(text: store.careQuery) }
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
                                    Text("From R\(service.price)").font(.system(size: 12, weight: .semibold)).foregroundStyle(ThusoTheme.slate)
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
        .searchable(text: query, prompt: "Find a service")
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
    /* Computed once when the view appears rather than typed. The strip used to be five hand-written
       labels beginning ("Fri", "12", "Sep") — a weekday that had not matched its date for months,
       and which disagreed with the date printed on the review screen two steps later. */
    @State private var days = Scheduling.offeredDays()
    @State private var kind = "scheduled"
    private let slots = Scheduling.slots
    private let labels = ["Who & where", "When", "Payment", "Review"]
    private var scheduled: Bool { kind == "scheduled" }
    private var endTime: String { Scheduling.endTime(start: slot, minutes: service.duration) }
    private var chosenDay: OfferedDay { days.indices.contains(day) ? days[day] : days[0] }
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
        Text(Scheduling.Label.chooseWhen).font(.system(size: 17, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
        /* Two different promises, chosen rather than inferred. An arrival estimate answers "when
           will somebody get here", which is only a question for the second one. */
        ForEach(Scheduling.kinds) { option in
            Button { kind = option.id } label: {
                CareCard {
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: kind == option.id ? "largecircle.fill.circle" : "circle").foregroundStyle(ThusoTheme.indigo)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(option.name).font(.system(size: 15, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
                            Text(option.detail).font(.system(size: 12.5)).foregroundStyle(ThusoTheme.body)
                        }
                        Spacer(minLength: 0)
                    }
                }
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(kind == option.id ? [.isSelected] : [])
        }
        if scheduled { scheduledPicker } else {
            Label("We look for the nearest nurse who is free. Nobody is dispatched in this preview.", systemImage: "bolt.fill")
                .font(.footnote).foregroundStyle(ThusoTheme.body)
        }
        HStack(spacing: 10) {
            Button("Back") { step = 0 }.buttonStyle(QuietButton())
            Button("Continue") { step = 2 }.buttonStyle(CareButton())
        }
    }
    @ViewBuilder private var scheduledPicker: some View {
        Text(Scheduling.Label.scheduledHeading).font(.system(size: 17, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 9) {
                ForEach(Array(days.enumerated()), id: \.element) { index, offered in
                    Button { day = index } label: {
                        VStack(spacing: 2) {
                            Text(offered.weekday.uppercased()).font(.system(size: 10, weight: .semibold))
                            Text(offered.day).font(.system(size: 17, weight: .bold))
                            Text(offered.month.uppercased()).font(.system(size: 10, weight: .semibold))
                        }
                        .frame(minWidth: 66, minHeight: 72)
                        .background(day == index ? ThusoTheme.indigo : .white, in: RoundedRectangle(cornerRadius: 14))
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(day == index ? ThusoTheme.indigo : ThusoTheme.line, lineWidth: 1))
                        .foregroundStyle(day == index ? .white : ThusoTheme.body)
                    }
                    .accessibilityLabel(Scheduling.longDate(offered.date))
                    .accessibilityAddTraits(day == index ? [.isSelected] : [])
                }
            }
        }
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 9), count: 3), spacing: 9) {
            ForEach(slots, id: \.self) { time in
                Button { slot = time } label: {
                    Text(time).font(.system(size: 14, weight: .semibold))
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .background(slot == time ? ThusoTheme.indigo : .white, in: RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(slot == time ? ThusoTheme.indigo : ThusoTheme.line, lineWidth: 1))
                        .foregroundStyle(slot == time ? .white : ThusoTheme.body)
                }.accessibilityAddTraits(slot == time ? [.isSelected] : [])
            }
        }
        Text("\(Scheduling.longDate(chosenDay.date)) · \(slot) – \(endTime) (\(service.duration) minutes)")
            .font(.footnote).foregroundStyle(ThusoTheme.body)
    }
    @ViewBuilder private var paymentStep: some View {
        Text("How would you like to pay?").font(.system(size: 17, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
        ForEach([("Card", "Visa ending 4242"), ("Cash", "Pay the nurse after the visit"), ("Thuso Wallet", "Demo balance R500.00")], id: \.0) { option in
            Button { payment = option.0 } label: {
                CareCard {
                    HStack(spacing: 12) {
                        Image(systemName: payment == option.0 ? "largecircle.fill.circle" : "circle").foregroundStyle(ThusoTheme.indigo)
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
            LabeledContent("Date", value: scheduled ? Scheduling.longDate(chosenDay.date) : Scheduling.kind("asap").name)
            if scheduled { LabeledContent("Time", value: "\(slot) – \(endTime)") }
            LabeledContent("Location", value: address)
            LabeledContent("Patient", value: patient)
            Divider().overlay(ThusoTheme.line)
            HStack(spacing: 11) {
                Text("SN").font(.system(size: 13, weight: .bold)).foregroundStyle(ThusoTheme.indigoDeep)
                    .frame(width: 42, height: 42).background(ThusoTheme.accentSoft, in: Circle())
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
                Button("Change") { step = 2 }.font(.system(size: 13, weight: .semibold)).foregroundStyle(ThusoTheme.indigo)
            }
        }
        Toggle("I understand this is a UI preview using fictional information.", isOn: $consent).font(.footnote)
        Button("Confirm & book") {
            /* The whole choice, not a time with the day dropped off it. */
            store.visits.insert(BookedVisit(service: service, patient: patient, address: address, kind: kind,
                                            date: scheduled ? chosenDay.date : nil,
                                            start: scheduled ? slot : nil, payment: payment), at: 0)
            booked = true
        }.buttonStyle(CareButton()).disabled(!consent)
        Text("You can cancel or reschedule up to 2 hours before the visit.").font(.footnote).foregroundStyle(ThusoTheme.body).frame(maxWidth: .infinity)
        Button("Back") { step = 2 }.buttonStyle(QuietButton())
    }
    @ViewBuilder private var success: some View {
        VStack(spacing: 14) {
            Image(systemName: "checkmark").font(.system(size: 26, weight: .bold)).foregroundStyle(ThusoTheme.indigo)
                .frame(width: 64, height: 64).background(ThusoTheme.indigoSoft, in: Circle())
            Text("Your demo visit is booked.").font(.system(size: 19, weight: .bold)).foregroundStyle(ThusoTheme.ink)
            Text("\(service.name) for \(patient.split(separator: " ").first ?? "")")
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
    /* A row's date block and its time both come from the same date, so the weekday shown can never
       disagree with the day it names. Every one of these used to be a hand-typed triple, and the
       booked visits all shared one: ("FRI", "12", "SEP"), whatever day they were booked for. */
    private struct Row: Identifiable {
        let id = UUID(); let title: String; let place: String; let status: String; let tone: String
        let date: Date?; let start: String?; let minutes: Int; let nurse: Bool
        var weekday: String { date.map { Scheduling.format($0, "EEE").uppercased() } ?? "NOW" }
        var dayNumber: String { date.map { Scheduling.format($0, "d") } ?? "" }
        var monthName: String { date.map { Scheduling.format($0, "MMM").uppercased() } ?? "" }
        var time: String {
            guard let start else { return Scheduling.Label.asapPending }
            return "\(start) – \(Scheduling.endTime(start: start, minutes: minutes))"
        }
    }
    private func sample(_ title: String, _ place: String, _ status: String, _ tone: String,
                        _ dayOffset: Int, _ start: String, _ minutes: Int) -> Row {
        Row(title: title, place: place, status: status, tone: tone,
            date: Date().addingTimeInterval(TimeInterval(dayOffset) * 86_400), start: start, minutes: minutes, nurse: false)
    }
    private var rows: [Row] {
        switch tab {
        case "Past": return [sample("Wound care", "Home visit · Sandton", "Completed", "teal", -3, "10:00", 40)]
        case "Cancelled": return [sample("Blood tests", "Home visit · Soweto", "Cancelled", "amber", -12, "08:00", 25)]
        default:
            return store.visits.enumerated().map { index, visit in
                Row(title: visit.service.name, place: "\(visit.address) · \(visit.patient)",
                    status: visit.status, tone: visit.isScheduled ? "teal" : "amber",
                    date: visit.date, start: visit.start, minutes: visit.service.duration, nurse: index == 0)
            } + [sample("Wound care", "Home visit · Sandton", "Pending", "amber", 17, "10:00", 40),
                 sample("Mother & baby", "Home visit · Rivonia", "Scheduled", "sky", 29, "14:00", 45)]
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
                                        Text(row.weekday).font(.system(size: 9, weight: .bold)).foregroundStyle(ThusoTheme.body)
                                        Text(row.dayNumber).font(.system(size: 19, weight: .bold)).foregroundStyle(ThusoTheme.ink)
                                        Text(row.monthName).font(.system(size: 9, weight: .bold)).foregroundStyle(ThusoTheme.body)
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
                                        Text("SN").font(.system(size: 13, weight: .bold)).foregroundStyle(ThusoTheme.indigoDeep)
                                            .frame(width: 42, height: 42).background(ThusoTheme.accentSoft, in: Circle())
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
            LinearGradient(colors: [Color(red: 0.071, green: 0.337, blue: 0.294), ThusoTheme.indigo], startPoint: .topLeading, endPoint: .bottomTrailing)
            Image("Family").resizable().scaledToFit().frame(height: 150).accessibilityHidden(true)
                .frame(maxWidth: .infinity, alignment: .trailing)
            VStack(alignment: .leading, spacing: 9) {
                Text("Care that fits\nyour life.").font(.system(size: 23, weight: .bold)).foregroundStyle(.white)
                Text("Easy booking. Trusted professionals.").font(.system(size: 13)).foregroundStyle(Color(red: 0.788, green: 0.902, blue: 0.867))
                NavigationLink { ServicesView() } label: {
                    Label("Book another visit", systemImage: "arrow.right").font(.system(size: 14, weight: .semibold))
                        .padding(.horizontal, 18).padding(.vertical, 13)
                        .background(.white, in: Capsule()).foregroundStyle(ThusoTheme.indigoDeep)
                }
            }
            .padding(20).frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(minHeight: 190)
        .clipShape(RoundedRectangle(cornerRadius: 18))
    }
}
struct VisitDetailView: View {
    let visit: BookedVisit
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                DemoBadge()
                CareHeading(eyebrow: "\(visit.status) · Demo", title: visit.service.name, subtitle: visit.whenText)
                CareCard {
                    LabeledContent("Patient", value: visit.patient)
                    LabeledContent("When", value: visit.whenText)
                    LabeledContent("Where", value: visit.address)
                    LabeledContent("How long", value: "\(visit.service.duration) minutes")
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
