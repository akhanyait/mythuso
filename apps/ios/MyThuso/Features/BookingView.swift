import SwiftUI

struct ServicesView: View {
    @EnvironmentObject private var store: PreviewStore
    /* Bound to the store, so a query typed on the home screen is already applied when this opens. */
    private var query: Binding<String> { Binding(get: { store.careQuery }, set: { store.careQuery = $0 }) }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space20) {
                DemoBadge()
                CareHeading(eyebrow: "Care, on your terms", title: "Professional care at your door", subtitle: "Choose a service and we’ll match you with the nearest qualified nurse.")
                let matches = CareService.all.filter { store.careQuery.isEmpty || $0.name.localizedCaseInsensitiveContains(store.careQuery) }
                if matches.isEmpty {
                    ContentUnavailableView.search(text: store.careQuery)
                } else {
                    CareCard(padding: ThusoSpacing.space16, spacing: 0) {
                        ForEach(Array(matches.enumerated()), id: \.element) { index, service in
                            NavigationLink { BookingView(service: service) } label: { serviceRow(service) }.buttonStyle(.plain)
                            if index < matches.count - 1 { Divider().overlay(ThusoTheme.studioLine) }
                        }
                    }
                }
                NavigationLink { FeatureDetail(title: "Chat to our care team") } label: {
                    CareCard(padding: ThusoSpacing.space16, spacing: 0) {
                        MenuRow(title: "Not sure what you need?", subtitle: "Chat to our care team", symbol: "questionmark.circle", tinted: true)
                    }
                }.buttonStyle(.plain)
                Text("All clinical decisions require a registered clinician. Prescription services require a valid prescription.")
                    .font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted)).fixedSize(horizontal: false, vertical: true)
                    .padding(.bottom, ThusoSpacing.space16)
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle("Book care").navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.visible, for: .navigationBar).toolbarBackground(ThusoTheme.glassFloor, for: .navigationBar)
        .searchable(text: query, prompt: "Find a service")
    }
    @Environment(\.dynamicTypeSize) private var typeSize
    private func serviceRow(_ service: CareService) -> some View {
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: ThusoSpacing.space8))
            : AnyLayout(HStackLayout(alignment: .center, spacing: ThusoSpacing.space12))
        return layout {
            if !typeSize.isAccessibilitySize {
                Image(systemName: service.symbol).font(.body).foregroundStyle(ThusoTheme.charcoal)
                    .frame(width: 28).accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(service.name).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                    .fixedSize(horizontal: false, vertical: true)
                Text(service.detail).font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: ThusoSpacing.space8) {
                VStack(alignment: typeSize.isAccessibilitySize ? .leading : .trailing, spacing: 2) {
                    Text("From R\(service.price)").font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                    Text("\(service.duration) min").font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                }
                Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                    .accessibilityHidden(true)
            }
        }
        .padding(.vertical, ThusoSpacing.space8).frame(minHeight: 44).contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(service.name). \(service.detail) From R\(service.price), \(service.duration) minutes")
    }
}
struct BookingView: View {
    let service: CareService
    @EnvironmentObject private var store: PreviewStore
    @State private var patient = "Lerato Molefe"
    @State private var address = "Home visit · Melville"
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
    private let labels = ["Who & where", "When", "Payment", "Review"]
    private var scheduled: Bool { kind == "scheduled" }
    private var endTime: String { Scheduling.endTime(start: slot, minutes: service.duration) }
    private var chosenDay: OfferedDay { days.indices.contains(day) ? days[day] : days[0] }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
                if booked { success } else {
                    StepDots(step: step + 1, total: 4, label: labels[step])
                    switch step {
                    case 0: whoAndWhere
                    case 1: dateAndTime
                    case 2: paymentStep
                    default: review
                    }
                }
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        /* Three moments worth feeling: a step advancing, a slot chosen, and the booking landing.
           Nothing else in the flow buzzes. */
        .sensoryFeedback(.selection, trigger: step)
        .sensoryFeedback(.success, trigger: booked)
        .thusoGround()
        .navigationTitle(booked ? "All set" : "Your home visit").navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.visible, for: .navigationBar).toolbarBackground(ThusoTheme.glassFloor, for: .navigationBar)
    }
    private var summary: some View {
        CareCard(weight: .lead) {
            HStack(spacing: ThusoSpacing.space12) {
                TileIcon(symbol: service.symbol)
                VStack(alignment: .leading, spacing: 4) {
                    Text(service.name).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                    Text("Registered nurse").font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                }
                Spacer(minLength: 6)
                Text("R\(service.price)").font(.callout.weight(.bold)).foregroundStyle(ThusoTheme.charcoal)
            }
        }
    }
    @ViewBuilder private var whoAndWhere: some View {
        summary
        CareCard {
            Picker("Who is this visit for?", selection: $patient) { ForEach(["Lerato Molefe"] + store.family, id: \.self) { Text($0) } }
            Divider().overlay(ThusoTheme.studioLine)
            TextField("Visit location", text: $address)
        }
        Text("Sample availability and proposal pricing. Tests, medicines and prescriptions may require separate arrangements.")
            .font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
        Button("Continue") { step = 1 }.buttonStyle(CareButton()).disabled(address.trimmingCharacters(in: .whitespaces).count < 5)
    }
    @ViewBuilder private var dateAndTime: some View {
        Text(Scheduling.Label.chooseWhen).font(.body.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
        /* Two different promises, chosen rather than inferred. An arrival estimate answers "when
           will somebody get here", which is only a question for the second one. */
        ForEach(Scheduling.kinds) { option in
            Button { kind = option.id } label: {
                CareCard {
                    HStack(alignment: .top, spacing: ThusoSpacing.space12) {
                        Image(systemName: kind == option.id ? "largecircle.fill.circle" : "circle").foregroundStyle(ThusoTheme.charcoal)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(option.name).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                            Text(option.detail).font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                        }
                        Spacer(minLength: 0)
                    }
                }
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(kind == option.id ? [.isSelected] : [])
        }
        if scheduled { VisitTimePicker(days: days, day: $day, slot: $slot, minutes: service.duration) } else {
            Label("We look for the nearest nurse who is free. Nobody is dispatched in this preview.", systemImage: "bolt.fill")
                .font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
        }
        HStack(spacing: ThusoSpacing.space8) {
            Button("Back") { step = 0 }.buttonStyle(QuietButton())
            Button("Continue") { step = 2 }.buttonStyle(CareButton())
        }
    }
    @ViewBuilder private var paymentStep: some View {
        Text("How would you like to pay?").font(.body.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
        ForEach([("Card", "Visa ending 4242"), ("Cash", "Pay the nurse after the visit"), ("Thuso Wallet", "Demo balance R500.00")], id: \.0) { option in
            Button { payment = option.0 } label: {
                CareCard {
                    HStack(alignment: .top, spacing: ThusoSpacing.space12) {
                        Image(systemName: payment == option.0 ? "largecircle.fill.circle" : "circle").foregroundStyle(ThusoTheme.charcoal)
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(option.0).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                            Text(option.1).font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                        }
                        Spacer(minLength: 0)
                    }
                }
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(payment == option.0 ? [.isSelected] : [])
        }
        Text("No card is stored and no payment is taken. Production payments run through a regulated provider, never through MyThuso directly.")
            .font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
        HStack(spacing: ThusoSpacing.space8) {
            Button("Back") { step = 1 }.buttonStyle(QuietButton())
            Button("Continue") { step = 3 }.buttonStyle(CareButton())
        }
    }
    @ViewBuilder private var review: some View {
        summary
        CareCard(padding: ThusoSpacing.space16) {
            LabeledContent("Date", value: scheduled ? Scheduling.longDate(chosenDay.date) : Scheduling.kind("asap").name)
            if scheduled { LabeledContent("Time", value: "\(slot) – \(endTime)") }
            LabeledContent("Location", value: address)
            LabeledContent("Patient", value: patient)
            Divider().overlay(ThusoTheme.studioLine)
            HStack(spacing: ThusoSpacing.space12) {
                Monogram(text: Arrival.nurse.initials)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Sister Naledi Mokoena").font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                    Text("Registered Nurse (SANC)").font(.caption2).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                }
                Spacer(minLength: ThusoSpacing.space4)
                Text("★ 4.9").font(.caption.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
            }
            .accessibilityElement(children: .combine)
            Divider().overlay(ThusoTheme.studioLine)
            HStack(spacing: ThusoSpacing.space12) {
                Image(systemName: "creditcard").font(.body).foregroundStyle(ThusoTheme.charcoal).accessibilityHidden(true)
                Text(payment == "Card" ? "•••• 4242" : payment).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                Spacer()
                Button("Change") { step = 2 }.frame(minHeight: 44).contentShape(Rectangle()).font(.footnote.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
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
        /* The moment a person commits is the moment they want to know how to get out, which is why
           this sentence is here rather than on the cancellation screen — a right disclosed only
           there is a right disclosed to whoever already found it. It was a hand-typed string in
           this file and in one Kotlin file, promising two hours with nothing behind it and nothing
           to check it against. It is packages/catalog/cancellation.json's now. */
        Text(Cancellation.windowSentence).font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted)).frame(maxWidth: .infinity)
            .fixedSize(horizontal: false, vertical: true)
        Button("Back") { step = 2 }.buttonStyle(QuietButton())
    }
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ViewBuilder private var success: some View {
        VStack(spacing: ThusoSpacing.space12) {
            /* The one animation in the booking flow, and only because a confirmation is the moment
               a person needs to be sure something happened. It is skipped under Reduce Motion. */
            Image(systemName: "checkmark.circle.fill").font(.system(size: 52)).foregroundStyle(ThusoTheme.charcoal)
                .symbolEffect(.bounce, options: .nonRepeating, value: reduceMotion ? false : booked)
                .accessibilityHidden(true)
            Text("Your demo visit is booked.").font(.title3.weight(.bold)).foregroundStyle(ThusoTheme.charcoal)
                .multilineTextAlignment(.center)
            Text("\(service.name) for \(patient.split(separator: " ").first ?? "")")
                .font(.subheadline).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted)).multilineTextAlignment(.center)
            Text("This is a preview. No nurse has been dispatched and no payment was taken.")
                .font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted)).multilineTextAlignment(.center)
            NavigationLink { VisitsView() } label: { Text("View my visits") }.buttonStyle(CareButton())
        }.frame(maxWidth: .infinity)
    }
}
/* The one date-and-time picker in the app.
 *
 * It was BookingView's own until a visit could be moved. Two pickers would be two sets of rules
 * about which days are offered and which hours sit on them, and the second set is always the one
 * nobody remembers to change — which is the shape of the defect the day strip already had once,
 * when its five labels were typed by hand and had not matched the calendar for months. Booking a
 * visit and moving one now choose from the same days, by the same arithmetic, in the same words.
 */
struct VisitTimePicker: View {
    let days: [OfferedDay]
    @Binding var day: Int
    @Binding var slot: String
    /// The visit's own length, so the line underneath ends it when it actually ends.
    let minutes: Int
    private var chosenDay: OfferedDay { days.indices.contains(day) ? days[day] : days[0] }
    private var endTime: String { Scheduling.endTime(start: slot, minutes: minutes) }
    var body: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
            Text(Scheduling.Label.scheduledHeading).font(.body.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            /* The day strip scrolls sideways and now settles on a day rather than between two of
               them — .scrollTargetBehavior is what iOS 17 gives you for exactly this. */
            ScrollView(.horizontal) {
                HStack(spacing: ThusoSpacing.space8) {
                    ForEach(Array(days.enumerated()), id: \.element) { index, offered in
                        Button { day = index } label: {
                            VStack(spacing: 2) {
                                Text(offered.weekday.uppercased()).font(.caption2.weight(.semibold))
                                Text(offered.day).font(.body.weight(.bold))
                                Text(offered.month.uppercased()).font(.caption2.weight(.semibold))
                            }
                            .padding(.horizontal, ThusoSpacing.space12).padding(.vertical, ThusoSpacing.space8)
                            .frame(minWidth: 62, minHeight: 68)
                            .background(day == index ? ThusoTheme.charcoal : ThusoTheme.surface, in: RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous).stroke(day == index ? ThusoTheme.charcoal : ThusoTheme.controlEdge, lineWidth: 1))
                            .foregroundStyle(day == index ? .white : ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                        }
                        .accessibilityLabel(Scheduling.longDate(offered.date))
                        .accessibilityAddTraits(day == index ? [.isSelected] : [])
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.viewAligned)
            .scrollIndicators(.hidden)
            .sensoryFeedback(.selection, trigger: day)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: ThusoSpacing.space8), count: 3), spacing: ThusoSpacing.space8) {
                ForEach(slots, id: \.self) { time in
                    Button { slot = time } label: {
                        Text(time).font(.subheadline.weight(.semibold))
                            .frame(maxWidth: .infinity, minHeight: 48)
                            .background(slot == time ? ThusoTheme.charcoal : ThusoTheme.surface, in: RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous).stroke(slot == time ? ThusoTheme.charcoal : ThusoTheme.controlEdge, lineWidth: 1))
                            .foregroundStyle(slot == time ? .white : ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                    }.accessibilityAddTraits(slot == time ? [.isSelected] : [])
                }
            }
            .sensoryFeedback(.selection, trigger: slot)
            Text("\(Scheduling.longDate(chosenDay.date)) · \(slot) – \(endTime) (\(minutes) minutes)")
                .font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    private let slots = Scheduling.slots
}
struct VisitsView: View {
    @EnvironmentObject private var store: PreviewStore
    @State private var tab: String
    @State private var state: LoadState = .ready
    /// Which list to open on. A cancellation sends somebody straight to where their visit went.
    init(showing: String = "Upcoming") { _tab = State(initialValue: showing) }
    /* A row's date block and its time both come from the same date, so the weekday shown can never
       disagree with the day it names. Every one of these used to be a hand-typed triple, and the
       booked visits all shared one: ("FRI", "12", "SEP"), whatever day they were booked for. */
    private struct Row: Identifiable {
        let id = UUID(); let title: String; let place: String; let status: String; let tone: String
        let date: Date?; let start: String?; let minutes: Int; let nurse: Bool
        /// What was said when this visit was cancelled, and — where it was late — that it was.
        var reason: String? = nil
        var lateness: String? = nil
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
        case "Past": return [sample("Wound care", "Home visit · Melville", "Completed", "teal", -3, "10:00", 40)]
        /* A cancelled visit is not deleted. It stays here with the reason given, because a visit
           that vanishes is one nobody can ask about afterwards — not the patient, not the nurse who
           was dispatched, and not whoever has to explain it. The fictional one below it stays too. */
        case "Cancelled":
            return store.cancelled.map { record in
                Row(title: record.visit.service.name, place: "\(record.visit.address) · \(record.visit.patient)",
                    status: "Cancelled", tone: "amber", date: record.visit.date, start: record.visit.start,
                    minutes: record.visit.service.duration, nurse: false,
                    reason: record.reason.text, lateness: record.wasLate ? record.state.name : nil)
            } + [sample("Blood tests", "Home visit · Soweto", "Cancelled", "amber", -12, "08:00", 25)]
        default:
            return store.visits.enumerated().map { index, visit in
                Row(title: visit.service.name, place: "\(visit.address) · \(visit.patient)",
                    status: visit.status, tone: visit.isScheduled ? "teal" : "amber",
                    date: visit.date, start: visit.start, minutes: visit.service.duration, nurse: index == 0)
            } + [sample("Wound care", "Home visit · Melville", "Pending", "amber", 17, "10:00", 40),
                 sample("Mother & baby", "Home visit · Randburg", "Scheduled", "sky", 29, "14:00", 45)]
        }
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
                DemoBadge()
                Picker("Visit status", selection: $tab) { ForEach(["Upcoming", "Past", "Cancelled"], id: \.self) { Text($0) } }
                    .pickerStyle(.segmented).sensoryFeedback(.selection, trigger: tab)
                StatePicker(title: "Preview how this list behaves when the network or service is unavailable", state: $state)
                StateBlock(state: state, subject: "Your visit list", permission: "notifications", retry: { state = .ready }) {
                    VStack(spacing: ThusoSpacing.space12) {
                        ForEach(rows) { row in
                            CareCard(weight: row.nurse ? .lead : .plain) {
                                HStack(alignment: .top, spacing: ThusoSpacing.space12) {
                                    VStack(spacing: 1) {
                                        Text(row.weekday).font(.caption2.weight(.bold)).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                                        Text(row.dayNumber).font(.title3.weight(.bold)).foregroundStyle(ThusoTheme.charcoal)
                                        Text(row.monthName).font(.caption2.weight(.bold)).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                                    }
                                    .padding(.vertical, ThusoSpacing.space8).frame(minWidth: 52, minHeight: 58)
                                    .background(ThusoTheme.cloud, in: RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous))
                                    .overlay(RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous).stroke(ThusoTheme.studioLine, lineWidth: 1))
                                    /* One element saying the date once. `children: .combine` left the
                                       three parts in the tree beside the combined one, so VoiceOver
                                       read "FRI, 11, SEP" and then "FRI", "11", "SEP" again. */
                                    .accessibilityElement(children: .ignore)
                                    .accessibilityLabel(row.date.map(Scheduling.longDate) ?? Scheduling.Label.asapPending)
                                    VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
                                        HStack(alignment: .top) {
                                            Text(row.title).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                                            Spacer(minLength: 8)
                                            StatusPill(text: row.status, tone: row.tone)
                                        }
                                        Label(row.time, systemImage: "clock").font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                                        Label(row.place, systemImage: "mappin.and.ellipse").font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                                        if let reason = row.reason {
                                            Label(reason, systemImage: "text.bubble").font(.caption).foregroundStyle(ThusoTheme.charcoal)
                                                .fixedSize(horizontal: false, vertical: true)
                                        }
                                        /* Named rather than priced. What a late cancellation costs
                                           is undecided, and a row that showed a figure here would
                                           be inventing the answer. */
                                        if let lateness = row.lateness {
                                            Label(lateness, systemImage: "clock.badge.exclamationmark").font(.caption)
                                                .foregroundStyle(ThusoTheme.charcoal).fixedSize(horizontal: false, vertical: true)
                                        }
                                    }
                                }
                                /* A completed visit is the screen a returning patient wants most,
                                   and the row for it led nowhere: the same shape as an upcoming
                                   visit, three days after it happened. */
                                if row.status == "Completed" {
                                    Divider().overlay(ThusoTheme.studioLine)
                                    NavigationLink { PastVisitView(service: CareService.all[1], address: row.place) } label: {
                                        Text("See what the nurse found").frame(maxWidth: .infinity)
                                    }.buttonStyle(CareButton())
                                }
                                if row.nurse, let visit = store.visits.first {
                                    Divider().overlay(ThusoTheme.studioLine)
                                    NavigationLink { ArrivalView(visit: visit) } label: {
                                        HStack(spacing: ThusoSpacing.space12) {
                                            Monogram(text: Arrival.nurse.initials)
                                            VStack(alignment: .leading, spacing: 2) {
                                                Text(Arrival.nurse.name).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                                                    .fixedSize(horizontal: false, vertical: true)
                                                Text("Where is she?").font(.caption2).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                                            }
                                            Spacer(minLength: 0)
                                            Image(systemName: "location.circle").font(.body)
                                                .foregroundStyle(ThusoTheme.charcoal).accessibilityHidden(true)
                                        }
                                        .frame(minHeight: 44)
                                        .contentShape(Rectangle())
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityElement(children: .combine)
                                    .accessibilityLabel("Where is \(Arrival.nurse.name)?")
                                    ViewThatFits(in: .horizontal) {
                                        HStack(spacing: ThusoSpacing.space8) { visitActions(visit) }
                                        VStack(spacing: ThusoSpacing.space8) { visitActions(visit) }
                                    }
                                }
                            }
                        }
                        if rows.isEmpty { EmptyStateCard(title: "No \(tab.lowercased()) visits", message: "When you book a visit it appears here, with the nurse’s name and what to have ready.") }
                    }
                }
                promo.padding(.bottom, ThusoSpacing.space16)
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle("Your visits").navigationBarTitleDisplayMode(.large)
    }
    /* Moving a visit is a real destination now rather than a roadmap card. It was the only
       "Reschedule" in the app and it led to the sentence that says a workflow will be connected
       later — while the booking confirmation was promising a person they could use it. */
    @ViewBuilder private func visitActions(_ visit: BookedVisit) -> some View {
        NavigationLink { RescheduleVisitView(visit: visit) } label: { Text("Reschedule").frame(maxWidth: .infinity) }.buttonStyle(QuietButton())
        NavigationLink { VisitDetailView(visit: visit) } label: { Text("View details").frame(maxWidth: .infinity) }.buttonStyle(CareButton())
    }
    private var promo: some View {
        ZStack(alignment: .bottomTrailing) {
            NightPanel()
            Image("Family").resizable().scaledToFit().frame(height: 150).accessibilityHidden(true)
                .frame(maxWidth: .infinity, alignment: .trailing)
            VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
                Text("Care that fits\nyour life.").font(.title2.weight(.bold)).foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Easy booking. Trusted professionals.").font(.footnote).foregroundStyle(.white.opacity(0.78))
                NavigationLink { ServicesView() } label: {
                    Label("Book another visit", systemImage: "arrow.right").font(.subheadline.weight(.semibold))
                        .padding(.horizontal, ThusoSpacing.space16).padding(.vertical, ThusoSpacing.space12)
                        .frame(minHeight: 44)
                        .background(.white, in: Capsule()).foregroundStyle(ThusoTheme.charcoal)
                }
            }
            .padding(ThusoSpacing.space20).frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(minHeight: 180)
        .clipShape(RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous))
    }
}
struct VisitDetailView: View {
    let visit: BookedVisit
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
                DemoBadge()
                CareHeading(eyebrow: "\(visit.status) · Demo", title: visit.service.name, subtitle: visit.whenText)
                CareCard(weight: .lead) {
                    LabeledContent("Patient", value: visit.patient)
                    LabeledContent("When", value: visit.whenText)
                    LabeledContent("Where", value: visit.address)
                    LabeledContent("How long", value: "\(visit.service.duration) minutes")
                    LabeledContent("Nurse", value: "Sister Naledi Mokoena")
                }
                CareCard {
                    Text("Before your visit").font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                    Text("Have your medication list ready.").font(.subheadline).foregroundStyle(ThusoTheme.charcoal)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("Secure messaging will be connected in the functionality phase.")
                        .font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted)).fixedSize(horizontal: false, vertical: true)
                }
                /* The one question a person waiting at home actually has. It is a destination now
                   rather than a sentence promising one later — and what it shows on the day, and
                   refuses to show before it, is the whole of Models/Arrival.swift. */
                NavigationLink { ArrivalView(visit: visit) } label: {
                    Label("Where is your nurse?", systemImage: "location.circle").frame(maxWidth: .infinity)
                }.buttonStyle(QuietButton())
                /* The two ways out of a visit, on the visit itself, in the order the contract asks
                   for them: moving it first and taking it away second. A person who wanted a
                   different day and is shown only a cancel button cancels. */
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: ThusoSpacing.space8) { exits }
                    VStack(spacing: ThusoSpacing.space8) { exits }
                }
                Text(Cancellation.windowSentence).font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle("Visit details").navigationBarTitleDisplayMode(.inline)
    }
    @ViewBuilder private var exits: some View {
        NavigationLink { RescheduleVisitView(visit: visit) } label: { Text("Move this visit").frame(maxWidth: .infinity) }.buttonStyle(CareButton())
        NavigationLink { CancelVisitView(visit: visit) } label: { Text("Cancel this visit").frame(maxWidth: .infinity) }.buttonStyle(QuietButton())
    }
}
