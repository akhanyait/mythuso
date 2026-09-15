import SwiftUI

struct ServicesView: View {
    @EnvironmentObject private var store: PreviewStore
    @State private var category = "All care"
    private let categories = ["All care", "Everyday health", "Recovery", "Family care"]
    private func belongs(_ service: CareService) -> Bool {
        switch category {
        case "Recovery": return ["wound", "postop"].contains(service.id)
        case "Family care": return ["mother", "planning", "senior"].contains(service.id)
        case "Everyday health": return ["vitals", "blood", "injection", "certificate"].contains(service.id)
        default: return true
        }
    }
    /* Bound to the store, so a query typed on the home screen is already applied when this opens. */
    private var query: Binding<String> { Binding(get: { store.careQuery }, set: { store.careQuery = $0 }) }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space20) {
                DemoBadge()
                CareHeading(eyebrow: "Care, on your terms", title: "Professional care at your door", subtitle: "Choose a service and we’ll match you with the nearest qualified nurse.")
                SectionTabs(sections: categories, groupLabel: "Care categories", selection: $category)
                let term = store.careQuery.trimmingCharacters(in: .whitespacesAndNewlines)
                let matches = CareService.all.filter { belongs($0) && (term.isEmpty || "\($0.name) \($0.detail)".localizedCaseInsensitiveContains(term)) }
                Text("\(matches.count) services · Sample prices and availability").font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                if matches.isEmpty {
                    EmptyStateCard(title: "No matching care", message: "Try a different word or see all services. Your search stays here until you change it.", symbol: "magnifyingglass")
                    Button("Clear filters") { store.careQuery = ""; category = "All care" }.buttonStyle(QuietButton())
                } else {
                    CareCard(padding: ThusoSpacing.space16, spacing: 0) {
                        ForEach(Array(matches.enumerated()), id: \.element) { index, service in
                            NavigationLink { BookingView(service: service) } label: { serviceRow(service) }.buttonStyle(.plain)
                            if index < matches.count - 1 { Divider().overlay(ThusoTheme.studioLine) }
                        }
                    }
                }
                CareCard(padding: ThusoSpacing.space16) {
                    HStack(alignment: .center, spacing: 12) {
                        Image("CareDoctorPortrait").resizable().scaledToFill().frame(width: 56, height: 64).clipped()
                            .clipShape(RoundedRectangle(cornerRadius: 16)).accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Care, with clinical support").font(.headline)
                            Text("Illustrative image").thusoFont(ThusoType.caption).foregroundStyle(ThusoTheme.studioInkMuted)
                        }
                    }
                    Text("A doctor reviews clinical findings and may recommend a home visit when appropriate. This catalogue offers nurse visits; a doctor home visit is a separate clinical decision.")
                        .font(.subheadline).foregroundStyle(ThusoTheme.studioInkMuted)
                }
                Text("All clinical decisions require a registered clinician. Prescription services require a valid prescription.")
                    .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted).fixedSize(horizontal: false, vertical: true)
                    .padding(.bottom, ThusoSpacing.space16)
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle("Book care").navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.visible, for: .navigationBar).toolbarBackground(ThusoTheme.glassFloor, for: .navigationBar)
        .searchable(text: query, prompt: "Find a service")
        .sensoryFeedback(.selection, trigger: category)
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
                Text(service.detail).font(.caption).foregroundStyle(ThusoTheme.studioInkMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: ThusoSpacing.space8) {
                VStack(alignment: typeSize.isAccessibilitySize ? .leading : .trailing, spacing: 2) {
                    Text("From R\(service.price)").font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                    Text("\(service.duration) min").font(.caption).foregroundStyle(ThusoTheme.studioInkMuted)
                }
                Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(ThusoTheme.studioInkMuted)
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
    /* The register is observed rather than copied, so a nurse suspended in the console while this flow is
       open leaves the list here by the same arithmetic. */
    @ObservedObject private var register = VettingStore.shared
    @State private var patient = "Lerato Molefe"
    @State private var address = "Home visit · Melville"
    @State private var day = 0
    @State private var slot = "09:00"
    @State private var payment = "Card"
    @State private var consent = false
    @State private var step = 0
    @State private var booked = false
    @State private var restoredDraft = false
    /// nearest, previous or named, and the nurse picked from the named list.
    @State private var choiceKind = "nearest"
    @State private var namedNurse: String?
    /// Where the booking stood when it landed, for the confirmation.
    @State private var bookedState: BookingState = .requested
    @State private var bookedAsap = false
    private var draft: CareBookingDraft {
        CareBookingDraft(patient: patient, address: address, day: day, selectedDate: scheduled ? chosenDay.date : nil, slot: slot, payment: payment,
                         consent: consent, kind: kind, step: step, choice: choiceKind, nurseId: namedNurse)
    }
    /* Computed once when the view appears rather than typed. The strip used to be five hand-written
       labels beginning ("Fri", "12", "Sep") — a weekday that had not matched its date for months,
       and which disagreed with the date printed on the review screen two steps later. */
    @State private var days = Scheduling.offeredDays()
    @State private var kind = "scheduled"
    private let labels = ["Who", "Where", BookingData.Person.stepLabel, "When", "Payment", "Review"]
    private var scheduled: Bool { kind == "scheduled" }
    private var endTime: String { Scheduling.endTime(start: slot, minutes: service.duration) }
    private var chosenDay: OfferedDay { days.indices.contains(day) ? days[day] : days[0] }

    // MARK: Who comes

    private var candidates: [NurseCandidate] {
        Booking.candidates(register: register.subjects, near: Booking.visitZone(address: address, area: store.careArea))
    }
    private var personOptions: PersonOptions {
        Booking.options(candidates, previous: Booking.previousNurseId(for: patient, register: register.subjects))
    }
    /* The choice as the contract means it, or nil while it cannot be booked against: a named nurse not
       picked yet, or one who stopped being offered after she was picked. */
    private var choice: PersonChoice? {
        switch choiceKind {
        case "previous": return personOptions.previous.flatMap { $0.offered ? PersonChoice.previous($0.candidate.id) : nil }
        case "named": return namedNurse.flatMap { id in personOptions.offered.contains { $0.id == id } ? PersonChoice.named(id) : nil }
        default: return .nearest
        }
    }
    private var chosenNurse: NurseCandidate? { choice?.nurseId.flatMap { id in candidates.first { $0.id == id } } }
    private var nurseSummary: String {
        chosenNurse.map { "\($0.name) · \(BookingData.Person.badgeName)" } ?? BookingData.Review.nearestValue
    }
    /// The hours on the chosen day, less any already held with the nurse asked for.
    private var hours: [String] {
        Booking.offeredHours(on: chosenDay.date, minutes: service.duration, nurseId: chosenNurse?.id, visits: store.visits)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
                if booked { success } else {
                    StepDots(step: step + 1, total: labels.count, label: labels[step])
                    compactSummary
                    switch step {
                    case 0: whoStep
                    case 1: whereStep
                    case 2: personStep
                    case 3: dateAndTime
                    case 4: paymentStep
                    default: review
                    }
                }
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        /* Three moments worth feeling: a step advancing, a slot chosen, and the booking landing.
           Nothing else in the flow buzzes. */
        .onAppear(perform: restore)
        .onChange(of: draft) { _, updated in
            if restoredDraft && !booked { store.bookingDrafts[service.id] = updated }
        }
        .onChange(of: booked) { _, completed in
            if completed { store.bookingDrafts.removeValue(forKey: service.id) }
        }
        /* As soon as possible belongs to whoever is nearest, so asking for somebody in particular turns the
           request into a visit at an hour she is offered. */
        .onChange(of: choice) { _, now in if now != .nearest && kind == "asap" { kind = "scheduled" } }
        .sensoryFeedback(.selection, trigger: step)
        .sensoryFeedback(.selection, trigger: kind)
        .sensoryFeedback(.selection, trigger: payment)
        .sensoryFeedback(.success, trigger: booked)
        .thusoGround()
        .navigationTitle(booked ? "All set" : "Your home visit").navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.visible, for: .navigationBar).toolbarBackground(ThusoTheme.glassFloor, for: .navigationBar)
    }
    private func restore() {
        guard !restoredDraft else { return }
        if let saved = store.bookingDrafts[service.id] {
            patient = saved.patient; address = saved.address
            slot = saved.slot; payment = saved.payment; consent = saved.consent
            kind = saved.kind; step = min(max(saved.step, 0), labels.count - 1)
            choiceKind = saved.choice; namedNurse = saved.nurseId
            let offeredIndex = days.firstIndex { offered in
                saved.selectedDate.map { Scheduling.format(offered.date, "yyyy-MM-dd") == Scheduling.format($0, "yyyy-MM-dd") } ?? false
            }
            day = offeredIndex ?? 0
            // An expired date must be chosen again, never silently shifted to a different day.
            if saved.kind == "scheduled" && offeredIndex == nil { step = min(step, 3); consent = false }
            /* A nurse picked before may have stopped being offered since — a lapse overnight is the case this
               exists for. The step that chooses her is shown again, with her reason, rather than a review
               that books against her or quietly swaps in somebody else. */
            if choice == nil {
                if choiceKind == "named" { namedNurse = nil }
                step = min(step, 2); consent = false
            }
        }
        restoredDraft = true
    }

    private var compactSummary: some View {
        VStack(alignment: .leading, spacing: 6) {
            ViewThatFits(in: .horizontal) {
                HStack { Text(service.name).font(.subheadline.weight(.semibold)); Spacer(); Text("R\(service.price)").font(.headline).monospacedDigit() }
                VStack(alignment: .leading) { Text(service.name).font(.subheadline.weight(.semibold)); Text("R\(service.price)").font(.headline).monospacedDigit() }
            }
            Text("\(patient) · \(service.duration) min").font(.footnote)
            if step > 1 { Text(address).font(.footnote).fixedSize(horizontal: false, vertical: true) }
            if step > 2 { Text(nurseSummary).font(.footnote).fixedSize(horizontal: false, vertical: true) }
            if step > 3 { Text(scheduled ? "\(Scheduling.shortDate(chosenDay.date)) · \(slot) – \(endTime)" : Scheduling.kind("asap").name).font(.footnote) }
        }
        .foregroundStyle(ThusoTheme.studioInkDeep).padding(ThusoSpacing.space16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ThusoTheme.studioLime, in: RoundedRectangle(cornerRadius: ThusoRadius.card, style: .continuous))
        .accessibilityElement(children: .combine).accessibilityIdentifier("bookingSummary")
    }
    @ViewBuilder private var whoStep: some View {
        Text("Who needs care?").font(.title2.weight(.semibold))
        CareCard {
            Picker("Who is this visit for?", selection: $patient) { ForEach(["Lerato Molefe"] + store.family, id: \.self) { Text($0) } }
        }
        Text("Choose yourself or someone in your circle of care. Your choices are kept while this app stays open.").font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
        Button("Continue") { step = 1 }.buttonStyle(CareButton())
    }
    @ViewBuilder private var whereStep: some View {
        Text("Where should we come?").font(.title2.weight(.semibold))
        CareCard { TextField("Visit location", text: $address).textContentType(.fullStreetAddress) }
        Text("Sample availability and proposal pricing. Tests, medicines and prescriptions may require separate arrangements.")
            .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
        HStack(spacing: ThusoSpacing.space8) {
            Button("Back") { step = 0 }.buttonStyle(QuietButton())
            Button("Continue") { step = 2 }.buttonStyle(CareButton()).disabled(address.trimmingCharacters(in: .whitespacesAndNewlines).count < 5)
        }
    }
    /* Who comes, between where and when: the nurses offered depend on where the visit is, and the hours
       offered depend on who was asked for. */
    @ViewBuilder private var personStep: some View {
        NurseChoiceView(options: personOptions, patient: patient, kind: $choiceKind, named: $namedNurse)
        HStack(spacing: ThusoSpacing.space8) {
            Button("Back") { step = 1 }.buttonStyle(QuietButton())
            Button("Continue") { step = 3 }.buttonStyle(CareButton()).disabled(choice == nil)
        }
    }
    @ViewBuilder private var dateAndTime: some View {
        Text(Scheduling.Label.chooseWhen).font(.body.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
        /* Two different promises, chosen rather than inferred. An arrival estimate answers "when will
           somebody get here", which is only a question for the second one — and the second one belongs to
           whoever is nearest, so it is not offered beside a nurse asked for by name. */
        ForEach(Scheduling.kinds.filter { choice == .nearest || $0.id != "asap" }) { option in
            Button { kind = option.id } label: {
                CareCard {
                    HStack(alignment: .top, spacing: ThusoSpacing.space12) {
                        Image(systemName: kind == option.id ? "largecircle.fill.circle" : "circle").foregroundStyle(ThusoTheme.charcoal)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(option.name).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                            Text(option.detail).font(.caption).foregroundStyle(ThusoTheme.studioInkMuted)
                        }
                        Spacer(minLength: 0)
                    }
                }
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(kind == option.id ? [.isSelected] : [])
        }
        if choice != .nearest {
            Text(BookingData.Person.asapNeedsNearest).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
        if scheduled {
            VisitTimePicker(days: days, day: $day, slot: $slot, minutes: service.duration, slots: hours)
            if let note = Booking.hoursNote(offered: hours, nurseName: chosenNurse?.name) {
                Label(note, systemImage: "clock.badge.xmark").font(.footnote).foregroundStyle(ThusoTheme.charcoal)
                    .fixedSize(horizontal: false, vertical: true)
            }
        } else {
            Label("We look for the nearest nurse who is free. Nobody is dispatched in this preview.", systemImage: "bolt.fill")
                .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
        }
        HStack(spacing: ThusoSpacing.space8) {
            Button("Back") { step = 2 }.buttonStyle(QuietButton())
            Button("Continue") { step = 4 }.buttonStyle(CareButton()).disabled(scheduled && !hours.contains(slot))
        }
    }
    @ViewBuilder private var paymentStep: some View {
        Text("How would you like to pay?").font(.body.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
        /* The ways to pay are packages/catalog/money.json's, generated into MoneyData. No card is shown,
           not even the last four digits of a made-up one: a fragment of a card number on a screen is a
           fragment in a screenshot, and the payment-result door refuses the same fragment by name. */
        ForEach(Money.visitMethods) { option in
            Button { payment = option.name } label: {
                CareCard {
                    HStack(alignment: .top, spacing: ThusoSpacing.space12) {
                        Image(systemName: payment == option.name ? "largecircle.fill.circle" : "circle").foregroundStyle(ThusoTheme.charcoal)
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(option.name).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                            Text(option.detail).font(.caption).foregroundStyle(ThusoTheme.studioInkMuted)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 0)
                    }
                }
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(payment == option.name ? [.isSelected] : [])
        }
        CapabilityNotice(of: "payments")
        HStack(spacing: ThusoSpacing.space8) {
            Button("Back") { step = 3 }.buttonStyle(QuietButton())
            Button("Continue") { step = 5 }.buttonStyle(CareButton())
        }
    }
    @ViewBuilder private var review: some View {
        CareCard(padding: ThusoSpacing.space16) {
            LabeledContent("Date", value: scheduled ? Scheduling.longDate(chosenDay.date) : Scheduling.kind("asap").name)
            if scheduled { LabeledContent("Time", value: "\(slot) – \(endTime)") }
            LabeledContent("Location", value: address)
            LabeledContent("Patient", value: patient)
            Divider().overlay(ThusoTheme.studioLine)
            /* Who comes, with her badge in words, or the promise that whoever is nearest and cleared is named
               before she sets off. The typed name that stood here named one nurse whoever had been chosen. */
            LabeledContent(BookingData.Review.nurseLabel, value: nurseSummary)
                .accessibilityHint(chosenNurse == nil ? "" : BookingData.Person.badgeSentence)
            /* The moment a person commits is the moment they want to know what it costs and how to get out
               of it. Both are read from the one place each lives — the price from the catalogue, the window
               from packages/catalog/cancellation.json — so this card cannot quote either differently. */
            LabeledContent(BookingData.Review.priceLabel, value: "R\(service.price)")
            VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
                Text(BookingData.Review.cancellingLabel).font(.subheadline).foregroundStyle(ThusoTheme.charcoal)
                Text(Cancellation.windowSentence).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
            Divider().overlay(ThusoTheme.studioLine)
            HStack(spacing: ThusoSpacing.space12) {
                Image(systemName: Money.method(named: payment)?.id == "cash-otp" ? "banknote" : "creditcard").font(.body).foregroundStyle(ThusoTheme.charcoal).accessibilityHidden(true)
                Text(payment).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                Spacer()
                Button("Change") { step = 4 }.frame(minHeight: 44).contentShape(Rectangle()).font(.footnote.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            }
        }
        CapabilityNotice(of: "booking")
        Toggle("I understand this is a UI preview using fictional information.", isOn: $consent).font(.footnote)
        Button("Confirm & book", action: confirm).buttonStyle(CareButton()).disabled(!consent)
        Button("Back") { step = 4 }.buttonStyle(QuietButton())
    }
    /* The whole choice, not a time with the day dropped off it — and who was asked for, which travels into
       the visit. The booking is asked for and the simulated roster answers at once: an hour is accepted,
       and a request with no hour is refused acceptance and stays asked for. The confirmation says which. */
    private func confirm() {
        let visit = BookedVisit(service: service, patient: patient, address: address, kind: kind,
                                date: scheduled ? chosenDay.date : nil, start: scheduled ? slot : nil, payment: payment,
                                nurseId: chosenNurse?.id, nurseName: chosenNurse?.name)
        store.visits.insert(visit, at: 0)
        bookedState = Booking.state(of: visit)
        bookedAsap = !visit.isScheduled
        booked = true
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
                .font(.subheadline).foregroundStyle(ThusoTheme.studioInkMuted).multilineTextAlignment(.center)
            Text("This is a preview. No nurse has been dispatched.")
                .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted).multilineTextAlignment(.center)
            /* What happened to the money, in packages/catalog/money.json's words: cash is owed at the
               door, and anything else would have gone to a provider this phone does not have. */
            Text(Money.afterBooking(methodName: payment))
                .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted).multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            CapabilityNotice(of: "payments")
        }.frame(maxWidth: .infinity)
        BookingStatusView(state: bookedState, asap: bookedAsap)
        NavigationLink { VisitsView() } label: { Text("View my visits") }.buttonStyle(CareButton())
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
    /* The hours on offer for the chosen day. A booking that names a nurse passes her day less the hours
       already held against her, so an hour she cannot take is never drawn — not drawn and then refused. */
    var slots: [String] = Scheduling.slots
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
                            /* TWO CHOICES ON ONE SCREEN, AT TWO WEIGHTS. The day is where you
                               are — the same studioNight the navigation pill and the tab bar use —
                               and the hour is the choice being made, which is the one lime object.
                               Both were pure black, which put two identical near-black chips on a
                               cream screen and said nothing about which of them was the decision. */
                            .background(day == index ? ThusoTheme.studioNight : ThusoTheme.surface, in: RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous).stroke(day == index ? ThusoTheme.studioNight : ThusoTheme.controlEdge, lineWidth: 1))
                            .foregroundStyle(day == index ? ThusoTheme.studioPaper : ThusoTheme.studioInkMuted)
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
                            .background(slot == time ? ThusoTheme.studioLime : ThusoTheme.surface, in: RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous).stroke(slot == time ? ThusoTheme.studioInkDeep : ThusoTheme.controlEdge, lineWidth: 1))
                            .foregroundStyle(slot == time ? ThusoTheme.studioInkDeep : ThusoTheme.studioInkMuted)
                    }.accessibilityAddTraits(slot == time ? [.isSelected] : [])
                }
            }
            .sensoryFeedback(.selection, trigger: slot)
            if slots.contains(slot) {
                Text("\(Scheduling.longDate(chosenDay.date)) · \(slot) – \(endTime) (\(minutes) minutes)")
                    .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
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
        /// The thread a finished or cancelled row opens, and why it is closed.
        var threadKey: UUID? = nil
        var closedBecause: BookingThreadClosed? = nil
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
    /// A row whose visit is over or called off, carrying the reason its thread is closed.
    private func closed(because id: String, key: UUID? = nil, _ row: Row) -> Row {
        var closing = row
        closing.threadKey = key
        closing.closedBecause = Booking.closedBecause(id)
        return closing
    }
    private var rows: [Row] {
        switch tab {
        case "Past": return [closed(because: "visit-completed", sample("Wound care", "Home visit · Melville", "Completed", "teal", -3, "10:00", 40))]
        /* A cancelled visit is not deleted. It stays here with the reason given, because a visit
           that vanishes is one nobody can ask about afterwards — not the patient, not the nurse who
           was dispatched, and not whoever has to explain it. The fictional one below it stays too. */
        case "Cancelled":
            return store.cancelled.map { record in
                closed(because: "booking-cancelled", key: record.visit.id, Row(title: record.visit.service.name, place: "\(record.visit.address) · \(record.visit.patient)",
                    status: "Cancelled", tone: "amber", date: record.visit.date, start: record.visit.start,
                    minutes: record.visit.service.duration, nurse: false,
                    reason: record.reason.text, lateness: record.wasLate ? record.state.name : nil))
            } + [closed(because: "booking-cancelled", sample("Blood tests", "Home visit · Soweto", "Cancelled", "amber", -12, "08:00", 25))]
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
                                        Text(row.weekday).font(.caption2.weight(.bold)).foregroundStyle(ThusoTheme.studioInkMuted)
                                        Text(row.dayNumber).font(.title3.weight(.bold)).foregroundStyle(ThusoTheme.charcoal)
                                        Text(row.monthName).font(.caption2.weight(.bold)).foregroundStyle(ThusoTheme.studioInkMuted)
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
                                        Label(row.time, systemImage: "clock").font(.caption).foregroundStyle(ThusoTheme.studioInkMuted)
                                        Label(row.place, systemImage: "mappin.and.ellipse").font(.caption).foregroundStyle(ThusoTheme.studioInkMuted)
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
                                /* A finished or cancelled visit keeps its thread readable and says why it is
                                   closed, rather than losing the way to what was said. */
                                if let closed = row.closedBecause {
                                    if row.status != "Completed" { Divider().overlay(ThusoTheme.studioLine) }
                                    NavigationLink { VisitThreadView(threadKey: row.threadKey, closed: closed) } label: {
                                        Label(BookingData.Thread.openLabel, systemImage: "text.bubble").frame(maxWidth: .infinity)
                                    }.buttonStyle(QuietButton())
                                }
                                if row.nurse, let visit = store.visits.first {
                                    Divider().overlay(ThusoTheme.studioLine)
                                    NavigationLink { ArrivalView(visit: visit) } label: {
                                        HStack(spacing: ThusoSpacing.space12) {
                                            Monogram(text: Arrival.nurse.initials)
                                            VStack(alignment: .leading, spacing: 2) {
                                                Text(Arrival.nurse.name).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                                                    .fixedSize(horizontal: false, vertical: true)
                                                Text("Where is she?").font(.caption2).foregroundStyle(ThusoTheme.studioInkMuted)
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
                    /* The nurse the booking asked for, carried into the visit rather than typed here. A visit
                       booked for whoever is nearest says so, because nobody has been named yet. */
                    LabeledContent(BookingData.Review.nurseLabel, value: visit.nurseName ?? BookingData.Review.nearestValue)
                }
                BookingStatusView(state: Booking.state(of: visit), asap: !visit.isScheduled)
                /* The thread belongs to this visit, so it is opened from it. Once the visit is over it opens
                   closed, with the reason, and what was said stays readable. */
                NavigationLink {
                    VisitThreadView(threadKey: visit.id, closed: Booking.threadClosed(for: visit, cancelled: false), nurseName: visit.nurseName)
                } label: {
                    Label(BookingData.Thread.openLabel, systemImage: "text.bubble").frame(maxWidth: .infinity)
                }.buttonStyle(QuietButton())
                CareCard {
                    Text("Before your visit").font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                    Text("Have your medication list ready.").font(.subheadline).foregroundStyle(ThusoTheme.charcoal)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("Messaging and calls are not connected in this preview. No message can be sent from this screen.")
                        .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted).fixedSize(horizontal: false, vertical: true)
                }
                ClinicianProfileLink(doctor: false)
                CareCard {
                    Label("Your care team", systemImage: "stethoscope").font(.headline)
                    Text("A doctor reviews clinical findings and may recommend a home visit when appropriate. Doctor home visits are not booked through this nurse booking flow.").font(.subheadline).foregroundStyle(ThusoTheme.studioInkMuted)
                    ClinicianProfileLink(doctor: true)
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
                Text(Cancellation.windowSentence).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
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

/// A native sheet showing only identity and credentials present in the preview register.
struct ClinicianProfileLink: View {
    var doctor = false
    @State private var presented = false
    var body: some View {
        Button { presented = true } label: {
            Label(doctor ? "Meet your reviewing doctor" : "Meet your nurse", systemImage: "person.crop.circle")
                .font(.subheadline.weight(.semibold)).frame(minHeight: 44)
        }
        .sensoryFeedback(.selection, trigger: presented)
        .sheet(isPresented: $presented) {
            NavigationStack { CareClinicianProfile(doctor: doctor) }
                .presentationDetents([.large]).presentationDragIndicator(.visible)
        }
    }
}

struct CareClinicianProfile: View {
    let doctor: Bool
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var register = VettingStore.shared
    private var subject: VettingSubject? { register.subject(doctor ? "D-403" : "N-205") }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                DemoBadge()
                HStack(alignment: .top, spacing: 16) {
                    Monogram(text: doctor ? "LK" : Arrival.nurse.initials)
                    VStack(alignment: .leading, spacing: 8) {
                        Text(subject?.name ?? (doctor ? Passport.reviewer.name : Arrival.nurse.name)).font(.title2.weight(.semibold))
                        Text(doctor ? "Reviewing doctor" : Arrival.nurse.role).font(.subheadline)
                        Text("Fictional profile · Preview register").thusoFont(ThusoType.caption).foregroundStyle(ThusoTheme.studioInkMuted)
                    }
                }
                if let subject {
                    let standing = summarise(subject)
                    CareCard {
                        Text("Professional record").font(.headline)
                        LabeledContent("Registration", value: subject.reference)
                        if let zone = subject.zone { LabeledContent("Care area", value: zone) }
                        if !subject.scope.isEmpty { LabeledContent("Recorded scope", value: subject.scope.joined(separator: ", ")) }
                        Divider()
                        StatusPill(text: standing.status.label, tone: standing.status.tone)
                        Text("\(standing.passed) of \(standing.total) checks passed in the demo register.").font(.subheadline)
                        if !standing.cleared {
                            Text("This profile is not fully cleared. Showing a profile does not authorise care or prescribing.").font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                        }
                    }
                }
                CareCard {
                    Text(doctor ? "Clinical decisions" : "At your home visit").font(.headline)
                    Text(doctor
                         ? "The doctor reviews findings and decides the next step. A doctor may recommend a home visit when appropriate; this preview does not arrange one."
                         : "Your nurse records findings for clinical review. Have your medication list ready and check your visit details before the day.")
                        .font(.subheadline).foregroundStyle(ThusoTheme.studioInkMuted)
                    Text("Messaging and calls are not connected in this preview.").font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                }
            }.padding(20)
        }
        .thusoGround().navigationTitle("Your care professional").navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
    }
}
