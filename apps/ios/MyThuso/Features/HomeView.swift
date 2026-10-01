import SwiftUI

/* The patient's home, on the Lovable handoff's dashboard since 28 September 2026 — the same
   composition as apps/web/src/features/Dashboard.tsx, in the same order: a welcome carrying the one
   next step, a row of four figures from the record, the readings as tabs of trends, the care a
   person can book, what happened lately, and the rest of the home in the order a person needs it.

   Every figure is the record's (Models/Passport.swift, the four reading sets and the last review in
   packages/catalog/passport.json) or the booked visit's; nothing is typed here. No goals — the
   handoff draws goal bars and no contract defines a health goal. No medicines count — no patient-side
   medicine list exists in any contract — so the doctor's review is the fourth figure. The editorial
   hero and the peach promotion the home used to carry are gone: the handoff refuses oversized
   marketing layouts and decorative artwork, and the one dark card is gone with them, because the
   dashboard is white cards on one ground with a raised one where the person came for.

   Large text uses a vertical layout so readings stay readable. */
struct HomeView: View {
    let book: () -> Void
    let firstRun: () -> Void
    @EnvironmentObject private var store: PreviewStore
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.colorScheme) private var colorScheme
    @State private var askingGilbert = false
    @State private var trend = "pressure"
    private var stacked: Bool { typeSize.isAccessibilitySize }
    /* The visit at the door first, not the one booked last: a booking is inserted at the top of the
       store's list, so `visits.first` was the newest. Scheduling.nextFirst says why the order is this one. */
    private var next: BookedVisit? { Scheduling.nextFirst(store.visits).first }

    var body: some View {
        content
            .thusoGround()
            /* GilbertOne floats bottom right on the patient's home, as it does on every patient page on the
               web: presence and placement, a lit thing in reach of a thumb. Pressing it opens GilbertOne in a
               sheet and asks the phone for nothing — the microphone is asked for on GilbertOne's own screen,
               the first time somebody taps to talk. The sphere is a still frame under Reduce Motion. */
            .overlay(alignment: .bottomTrailing) {
                Button { askingGilbert = true } label: {
                    ZStack {
                        Circle().fill(ThusoRole.night).frame(width: 60, height: 60)
                        AssistantSphere(size: 76)
                    }
                    .frame(width: 64, height: 64)
                    .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Gilbert.callToAction)
                .accessibilityHint(Gilbert.descriptorLine)
                .padding(.trailing, ThusoSpacing.space16)
                .padding(.bottom, ThusoSpacing.space12)
            }
            .sheet(isPresented: $askingGilbert) { NavigationStack { AssistantView() } }
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    /* The wordmark's reversed cut on the dark ground, so its ink is not lost against it. */
                    Image(colorScheme == .dark ? "BrandReversed" : "Brand").resizable().scaledToFit().frame(width: 124, height: 34).accessibilityLabel("MyThuso")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink { NotificationsView() } label: { Image(systemName: "bell") }.accessibilityLabel("Notifications")
                }
            }
    }

    private var content: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space24) {
                DemoBadge()
                welcome
                metrics
                arranged
                shortcuts
                trends
                history
                liveWell
                carePlan
                family
                NavigationLink { PassportView() } label: { passportPromo }.buttonStyle(.plain)
                Button(action: firstRun) {
                    Label("See the first-run and recovery flow", systemImage: "person.badge.plus").font(.thuso(.footnote, weight: .semibold))
                }
                .frame(minHeight: 44).contentShape(Rectangle())
                .foregroundStyle(ThusoRole.foreground)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.bottom, ThusoSpacing.space16)
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .scrollContentBackground(.hidden)
    }

    // MARK: - The welcome, and in it the next step

    /* Location and who the visit is for are the two things that change what everything below means,
       so they sit together at the top rather than being buried in a booking step. The next step is the
       one thing a person opened the home for, and the one primary button on the screen is its. */
    private var welcome: some View {
        ThusoCard(variant: .elevated, padding: .md, spacing: ThusoSpacing.space16) {
            VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
                Text("Your everyday care".uppercased()).font(.thuso(.caption, weight: .semibold)).tracking(0.8)
                    .foregroundStyle(ThusoRole.mutedForeground)
                Text(thuso(FramingData.patientLead, store.locale))
                    .font(ThusoFont.screenTitle)
                    .foregroundStyle(ThusoRole.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                Text(thuso(FramingData.patientDetail, store.locale))
                    .font(.thuso(.subheadline)).foregroundStyle(ThusoRole.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            ViewThatFits(in: .horizontal) {
                HStack(spacing: ThusoSpacing.space8) { areaChip; personChip }
                VStack(alignment: .leading, spacing: ThusoSpacing.space8) { areaChip; personChip }
            }
            nextStep
        }
    }

    private var nextStep: some View {
        let visit = next
        let confirmed = visit?.status == "Confirmed"
        return VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            HStack(alignment: .top, spacing: ThusoSpacing.space12) {
                if !stacked {
                    MyThusoIcon(icon: MyThusoIconsData.visit, size: 22, animated: visit?.isScheduled == false)
                        .frame(width: 40, height: 40)
                        .background(ThusoRole.accentTint, in: RoundedRectangle(cornerRadius: ThusoRadius.md, style: .continuous))
                }
                VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
                    Text(visit == nil ? "Find the care you need" : confirmed ? "Get ready for your visit" : "Review your visit request")
                        .font(ThusoFont.cardTitle).foregroundStyle(ThusoRole.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(visit.map { "\($0.service.name) · \($0.shortWhenText) · \($0.patient)" }
                         ?? "Compare care options, then choose a time that suits you.")
                        .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            if let visit {
                NavigationLink { VisitDetailView(visit: visit) } label: {
                    Label(confirmed ? "Prepare for my visit" : "View visit details", systemImage: "arrow.right")
                        .labelStyle(TrailingIconLabelStyle())
                }
                .buttonStyle(ThusoButtonStyle(.primary, fullWidth: true))
            } else {
                ThusoButton("Explore care", fullWidth: true, trailingSymbol: "arrow.right", action: book)
            }
        }
        .padding(ThusoSpacing.space16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ThusoRole.surfaceRaised, in: RoundedRectangle(cornerRadius: ThusoRadius.md, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Your next care action")
    }

    private var areaChip: some View {
        Menu {
            Picker("Care area", selection: $store.careArea) {
                ForEach(PreviewStore.careAreas, id: \.self) { Text($0).tag($0) }
            }
        } label: {
            chipLabel(symbol: "mappin.and.ellipse", text: store.careArea)
        }
        .accessibilityLabel("Care area: \(store.careArea)")
        .accessibilityHint("Choose a demo care area. No location access is requested.")
    }

    private var personChip: some View {
        NavigationLink { FamilyView() } label: { chipLabel(symbol: "person.crop.circle", text: "Lerato Molefe") }
            .buttonStyle(.plain)
            .accessibilityLabel("Care is for Lerato Molefe. Open your circle of care")
    }

    /* The two chips that say who the care is for and where: the handoff's secondary button at the
       small size, with compact corners rather than a capsule, so a wrapped suburb is never cut by
       its own curve. */
    private func chipLabel(symbol: String, text: String) -> some View {
        let shape = RoundedRectangle(cornerRadius: ThusoRadius.sm, style: .continuous)
        return HStack(spacing: ThusoSpacing.space8) {
            Image(systemName: symbol).font(.thuso(.footnote)).accessibilityHidden(true)
            Text(text).font(.thuso(.footnote, weight: .semibold)).fixedSize(horizontal: false, vertical: true)
            Image(systemName: "chevron.down").font(.thuso(.caption2, weight: .semibold)).accessibilityHidden(true)
        }
        .foregroundStyle(ThusoRole.foreground)
        .padding(.horizontal, ThusoSpacing.space12).padding(.vertical, ThusoSpacing.space8).frame(minHeight: 44)
        .background(ThusoRole.surface, in: shape)
        .overlay(shape.stroke(ThusoRole.border, lineWidth: 1))
    }

    // MARK: - The figures, from the record

    /* Two of them are readings and open the record they came from; the other two are facts about the
       account and are not buttons, because nothing is behind them to open. */
    private var metrics: some View {
        let visit = next
        /* A reading the latest set does not hold is drawn as a dash with no badge — never as 0/0 mmHg,
           and never judged "Outside range" against a number nobody measured. */
        let systolic = Passport.latestSet.values["systolic"]
        let diastolic = Passport.latestSet.values["diastolic"]
        let glucose = Passport.latestSet.values["glucose"]
        let pressureInRange: Bool? = systolic.flatMap { s in diastolic.map { d in Passport.flag("systolic", s).isNormal && Passport.flag("diastolic", d).isNormal } }
        let glucoseInRange: Bool? = glucose.map { Passport.flag("glucose", $0).isNormal }
        let rangeBadge: (Bool?) -> (text: String, good: Bool)? = { inRange in inRange.map { (text: $0 ? "In range" : "Outside range", good: $0) } }
        let columns = stacked ? [GridItem(.flexible(), alignment: .top)] : [GridItem(.flexible(), spacing: ThusoSpacing.space12, alignment: .top), GridItem(.flexible(), alignment: .top)]
        return LazyVGrid(columns: columns, alignment: .leading, spacing: ThusoSpacing.space12) {
            ThusoMetricCard(label: "Next visit",
                            value: visit.map { $0.isScheduled ? ($0.start ?? "Soon") : "Soon" } ?? "None",
                            trend: visit.flatMap { $0.isScheduled ? $0.date.map(Scheduling.shortDate) : Optional($0.service.name) }) {
                MyThusoIcon(icon: MyThusoIconsData.visit, size: 20)
            }
            NavigationLink { PassportView() } label: {
                ThusoMetricCard(label: "Blood pressure",
                                value: systolic.flatMap { s in diastolic.map { d in "\(Int(s))/\(Int(d))" } } ?? "—", unit: "mmHg",
                                badge: rangeBadge(pressureInRange)) {
                    MyThusoIcon(icon: MyThusoIconsData.health, size: 20)
                }
            }
            .buttonStyle(.plain)
            .accessibilityHint("Opens your Health Passport")
            NavigationLink { PassportView() } label: {
                ThusoMetricCard(label: "Blood glucose",
                                value: Passport.spec("glucose").flatMap { spec in glucose.map { Passport.format(spec, $0) } } ?? "—",
                                unit: Passport.spec("glucose")?.unit,
                                badge: rangeBadge(glucoseInRange)) {
                    MyThusoIcon(icon: MyThusoIconsData.results, size: 20)
                }
            }
            .buttonStyle(.plain)
            .accessibilityHint("Opens your Health Passport")
            ThusoMetricCard(label: "Doctor's review", value: Scheduling.shortDate(Passport.lastReview.date),
                            trend: Passport.reviewer.name) {
                MyThusoIcon(icon: MyThusoIconsData.health, size: 20)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Your care at a glance")
    }

    // MARK: - What is already arranged

    private var arranged: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            CareSectionHeader(title: thuso(.nextVisit, store.locale)) {
                NavigationLink("All visits") { VisitsView() }
                    .frame(minHeight: 44).contentShape(Rectangle())
            }
            if let visit = next {
                NavigationLink { VisitDetailView(visit: visit) } label: { visitCard(visit) }.buttonStyle(.plain)
                CareCard(padding: ThusoSpacing.space16, spacing: ThusoSpacing.space12) {
                    HStack(alignment: .center, spacing: 12) {
                        Image("CareNursePortrait").resizable().scaledToFill().frame(width: 56, height: 64).clipped()
                            .clipShape(RoundedRectangle(cornerRadius: ThusoRadius.md)).accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 4) {
                            Label("Before your visit", systemImage: "checklist").font(.thuso(.subheadline, weight: .semibold))
                            Text("Care at home · Illustrative image").thusoFont(ThusoType.caption).foregroundStyle(ThusoRole.mutedForeground)
                        }
                    }
                    Text("Have your medication list ready. Review the address and appointment details before the day.").font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                    ClinicianProfileLink(doctor: false)
                    NavigationLink { VisitDetailView(visit: visit) } label: { Text("Visit details and preparation").frame(minHeight: 44).contentShape(Rectangle()) }.buttonStyle(.plain)
                }
            } else {
                /* Not a blank space and not a fixture. The sentences are the scheduling contract's,
                   so all three apps say the same thing about having nothing booked. */
                CareCard(weight: .lead) {
                    TileIcon(symbol: "calendar.badge.plus")
                    Text(Scheduling.Label.noUpcoming).font(.thuso(.headline)).foregroundStyle(ThusoRole.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(Scheduling.Label.noUpcomingDetail).font(.thuso(.subheadline)).foregroundStyle(ThusoRole.mutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                    Button(thuso(.bookNurse, store.locale), action: book).buttonStyle(QuietButton())
                }
            }
        }
    }

    /* The visit as a white card with the tile the family draws for a visit, the status as a badge in
       the contract's own word, and the nurse beneath a rule. An arrival estimate belongs to "come now"
       and to nothing else; a visit booked for a named hour says how long it takes instead. */
    private func visitCard(_ visit: BookedVisit) -> some View {
        ThusoCard(padding: .sm, spacing: ThusoSpacing.space12) {
            let head = HStack(spacing: ThusoSpacing.space12) {
                TileIcon(symbol: visit.service.symbol, tint: ThusoRole.foreground, background: ThusoRole.accentTint)
                VStack(alignment: .leading, spacing: 4) {
                    Text(visit.service.name).font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                    Text(visit.shortWhenText).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                }
                if !stacked { Spacer(minLength: 6); StatusPill(text: visit.status) }
            }
            if stacked {
                VStack(alignment: .leading, spacing: ThusoSpacing.space8) { head; StatusPill(text: visit.status) }
            } else {
                head
            }
            HStack(spacing: ThusoSpacing.space4) {
                Image(systemName: visit.isScheduled ? "clock" : "bolt.fill").thusoFont(ThusoType.caption)
                Text(visit.isScheduled ? "\(visit.service.duration) minutes" : "Looking for the nearest nurse").font(.thuso(.footnote))
            }
            .foregroundStyle(ThusoRole.mutedForeground)
            HStack(spacing: ThusoSpacing.space4) {
                Image(systemName: "mappin.and.ellipse").thusoFont(ThusoType.caption)
                Text(visit.address).font(.thuso(.footnote))
            }
            .foregroundStyle(ThusoRole.mutedForeground)
            ThusoDivider()
            HStack(spacing: ThusoSpacing.space12) {
                ThusoAvatar(initials: Arrival.nurse.initials, size: .md)
                VStack(alignment: .leading, spacing: 3) {
                    Text(Arrival.nurse.name).font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                    Text(Arrival.nurse.role).thusoFont(ThusoType.caption).foregroundStyle(ThusoRole.mutedForeground)
                }
                Spacer(minLength: 4)
                Image(systemName: "chevron.right").font(.thuso(.footnote, weight: .semibold)).foregroundStyle(ThusoRole.mutedForeground)
            }
        }
    }

    // MARK: - Care you can book today

    /* The words typed here live on the store, so the catalogue in the next tab opens already
       filtered. The search used to call book() and throw the query away. One line, deliberately: a
       vertical axis would let the prompt wrap, and it would also turn Return into a newline — which
       is the one key this field has a job for. */
    private var searchField: some View {
        HStack(spacing: ThusoSpacing.space12) {
            Image(systemName: "magnifyingglass").foregroundStyle(ThusoRole.mutedForeground).accessibilityHidden(true)
            TextField("What care do you need today?", text: $store.careQuery).submitLabel(.search).onSubmit(book)
                .font(.thuso(.subheadline))
                .accessibilityLabel("Search for care")
        }
        .padding(.horizontal, ThusoSpacing.space12).frame(minHeight: 44)
        .contentShape(Rectangle())
        .background(ThusoRole.surface, in: RoundedRectangle(cornerRadius: ThusoRadius.md, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: ThusoRadius.md, style: .continuous).stroke(ThusoRole.inputEdge, lineWidth: 1))
        .thusoShadow()
    }

    /* One row per service: one icon, the name, what it is, the price and how long it takes. Both
       numbers come from the catalogue rather than being typed here. */
    private var shortcuts: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            CareSectionHeader(title: "Care you can book today") {
                Button("See all care", action: book).frame(minHeight: 44).contentShape(Rectangle())
            }
            searchField
            CareCard(padding: ThusoSpacing.space16, spacing: 0) {
                ForEach(Array(CareService.all.prefix(4).enumerated()), id: \.element) { index, service in
                    NavigationLink { BookingView(service: service) } label: { shortcutRow(service, index: index) }.buttonStyle(.plain)
                    if index < 3 { ThusoDivider() }
                }
            }
        }
    }

    private func shortcutRow(_ service: CareService, index: Int) -> some View {
        let layout = stacked ? AnyLayout(VStackLayout(alignment: .leading, spacing: ThusoSpacing.space8)) : AnyLayout(HStackLayout(spacing: ThusoSpacing.space12))
        return layout {
            if !stacked {
                Image(systemName: service.symbol).font(.thuso(.body)).foregroundStyle(ThusoRole.foreground)
                    .frame(width: 28).accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(service.name).font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                Text(service.detail).thusoFont(ThusoType.caption).foregroundStyle(ThusoRole.mutedForeground)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: ThusoSpacing.space8) {
                VStack(alignment: stacked ? .leading : .trailing, spacing: 2) {
                    Text("R\(service.price)").font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                    Text("\(service.duration) min").thusoFont(ThusoType.caption).foregroundStyle(ThusoRole.mutedForeground)
                }
                Image(systemName: "chevron.right").thusoFont(ThusoType.caption, weight: .semibold).foregroundStyle(ThusoRole.mutedForeground)
                    .accessibilityHidden(true)
            }
        }
        .padding(.vertical, ThusoSpacing.space8)
        .frame(minHeight: 44)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(service.name). \(service.detail) From R\(service.price), \(service.duration) minutes")
    }

    // MARK: - The readings as trends

    /* The trends a person watches, as peer views of one record: blood pressure, pulse and glucose,
       one drawn at a time. Drawn only through readings on record — two or more of the measure — and
       otherwise the honest empty state, never a figure invented to fill a chart. The home and the
       Passport read the same fixture; a redesign must not invent new readings. */
    private static let trendTabs: [(id: String, title: String, measure: String)] = [
        ("pressure", "Blood pressure", "systolic"), ("pulse", "Pulse", "pulse"), ("glucose", "Glucose", "glucose")
    ]
    private var trends: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            CareSectionHeader(title: "Your health over time") {
                NavigationLink(thuso(.openPassport, store.locale)) { PassportView() }
            }
            ThusoCard(padding: .md, spacing: ThusoSpacing.space12) {
                Text(PassportData.onRecord(lastOn: Scheduling.format(Passport.latestSet.date, "d MMM")))
                    .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
                ThusoTabs(selection: $trend, tabs: Self.trendTabs.map { ($0.id, $0.title) })
                let current = Self.trendTabs.first { $0.id == trend } ?? Self.trendTabs[0]
                if let observation = Passport.spec(current.measure), Passport.series(observation).count > 1 {
                    ClinicalChart(title: observation.label, unit: observation.unit,
                                  readings: Passport.series(observation), normal: observation.range,
                                  decimals: Passport.decimals(observation), symbol: Passport.symbol(observation.id))
                    if current.id == "pressure" {
                        Text("Systolic is drawn here; the diastolic readings are in your Passport beside it.")
                            .font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                } else {
                    EmptyStateCard(title: "No trend yet", message: "A trend is drawn once two readings of \(current.title.lowercased()) are on your record. Nothing is drawn from a reading that is not there.", symbol: "chart.xyaxis.line")
                }
            }
        }
    }

    // MARK: - What happened lately

    /* Newest first: each visit that took readings, and the doctor's review of the last one on the day it
       was written. Read from the Passport rather than composed here. */
    private struct HistoryItem: Identifiable { let id: String; let day: Int; let title: String; let detail: String; let badge: String?; let good: Bool }
    private var historyItems: [HistoryItem] {
        let review = HistoryItem(id: "review", day: Passport.lastReview.reviewedDayOffset,
                                 title: "\(Passport.reviewer.name) reviewed your readings",
                                 detail: Passport.lastReview.next, badge: "Reviewed", good: true)
        let visits: [HistoryItem] = Passport.readingSets.map { set in
            let systolic = set.values["systolic"] ?? 0, diastolic = set.values["diastolic"] ?? 0
            let inRange = Passport.flag("systolic", systolic).isNormal && Passport.flag("diastolic", diastolic).isNormal
            return HistoryItem(id: String(set.dayOffset), day: set.dayOffset, title: "Home visit · readings taken",
                               detail: "Blood pressure \(Int(systolic))/\(Int(diastolic)) mmHg\(set.note.map { " · \($0)" } ?? "")",
                               badge: inRange ? nil : "Outside range", good: false)
        }
        return ([review] + visits).sorted { $0.day > $1.day }
    }
    private var history: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            CareSectionHeader("Recent care")
            ThusoCard(padding: .md, spacing: 0) {
                Text("What your nurse recorded, and what the doctor said about it.")
                    .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.bottom, ThusoSpacing.space8)
                ForEach(Array(historyItems.enumerated()), id: \.element.id) { index, item in
                    if index > 0 { ThusoDivider() }
                    HStack(alignment: .top, spacing: ThusoSpacing.space12) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(Scheduling.shortDate(Date().addingTimeInterval(TimeInterval(item.day) * 86_400)))
                                .font(.thuso(.caption, weight: .semibold)).foregroundStyle(ThusoRole.mutedForeground)
                            Text(item.title).font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                                .fixedSize(horizontal: false, vertical: true)
                            Text(item.detail).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        if let badge = item.badge, !stacked {
                            ThusoBadge(badge, variant: item.good ? .success : .warning, size: .sm)
                        }
                    }
                    .padding(.vertical, ThusoSpacing.space12)
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }

    // MARK: - Live well, plans and family

    private var liveWell: some View {
        NavigationLink { LiveWellView() } label: {
            ThusoCard(padding: .md, spacing: ThusoSpacing.space12) {
                Text("YOUR EVERYDAY WELLBEING").thusoFont(ThusoType.caption, weight: .semibold).tracking(1.2)
                    .foregroundStyle(ThusoRole.mutedForeground)
                HStack(alignment: .center, spacing: ThusoSpacing.space12) {
                    Text("Make room\nfor you.").font(ThusoFont.heading)
                        .foregroundStyle(ThusoRole.foreground).fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                    if !stacked {
                        MyThusoIcon(icon: MyThusoIconsData.mind, size: 28)
                            .frame(width: 48, height: 48)
                            .background(ThusoRole.accentTint, in: RoundedRectangle(cornerRadius: ThusoRadius.md, style: .continuous))
                    }
                }
                Text("How have you been feeling? A quiet space for your own words.")
                    .font(.thuso(.subheadline)).foregroundStyle(ThusoRole.mutedForeground).fixedSize(horizontal: false, vertical: true)
                HStack {
                    Text("Open your journal").font(.thuso(.subheadline, weight: .semibold))
                    Spacer(minLength: 8)
                    Image(systemName: "arrow.right")
                }
                .foregroundStyle(ThusoRole.foreground)
                .frame(minHeight: 44)
            }
        }.buttonStyle(.plain)
    }

    private var carePlan: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            CareSectionHeader(title: "Care plan") {
                NavigationLink("Care plans") { PlansView() }
                    .frame(minHeight: 44).contentShape(Rectangle())
            }
            NavigationLink { PlansView() } label: {
                CareCard(padding: ThusoSpacing.space16, spacing: 0) {
                    MenuRow(title: "Chronic Routine", subtitle: "Monthly check-in · due in 9 days", symbol: "clock")
                }
            }.buttonStyle(.plain)
        }
    }

    private var family: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            CareSectionHeader(title: "Your circle of care") {
                NavigationLink("My family") { FamilyView() }.frame(minHeight: 44).contentShape(Rectangle())
            }
            CareCard(padding: ThusoSpacing.space16, spacing: 0) {
                ForEach(Array(store.family.enumerated()), id: \.offset) { index, member in
                    NavigationLink { FamilyView() } label: {
                        MenuRow(title: member, subtitle: relationship(index), symbol: "person.crop.circle")
                    }.buttonStyle(.plain)
                    ThusoDivider()
                }
                NavigationLink { FamilyView() } label: {
                    Label("Add a family member", systemImage: "plus").font(.thuso(.subheadline, weight: .semibold))
                        .frame(maxWidth: .infinity, alignment: .leading).frame(minHeight: 44).contentShape(Rectangle())
                }
                .buttonStyle(.plain).foregroundStyle(ThusoRole.foreground)
            }
            /* Booking for somebody opens their booking, never their record. What you may see of
               another person is decided in My family, under consent, and nowhere on this screen.
               One element with the sentence as its label, so VoiceOver does not read the shield first. */
            Label("Booking for someone opens their booking, never their record. What you may see is decided in My family.",
                  systemImage: "checkmark.shield")
                .thusoFont(ThusoType.caption).foregroundStyle(ThusoRole.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Booking for someone opens their booking, never their record. What you may see is decided in My family.")
        }
    }

    /* A member somebody added in this preview has no relationship recorded, and is not given one.
       Inventing "Your son" for a name typed a moment ago would be the app asserting something about
       a person it was never told. */
    private func relationship(_ index: Int) -> String {
        switch index {
        case 0: return "Mother · Sponsored care"
        case 1: return "Your son · 8 years"
        default: return "Added in this preview"
        }
    }

    /// The invitation to look at the record, as a white card: the quieter of the screen's claims.
    private var passportPromo: some View {
        ThusoCard(padding: .md, spacing: ThusoSpacing.space8) {
            ThusoBadge("Thuso Pass", variant: .accent, size: .sm)
            Text("Your health.\nOne safe place.").font(.thuso(.title3, weight: .bold)).foregroundStyle(ThusoRole.foreground)
                .fixedSize(horizontal: false, vertical: true)
            Text("Every visit, reading and result, in a record you own and control.")
                .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
            Text("\(thuso(.openPassport, store.locale)) →").font(.thuso(.subheadline, weight: .semibold))
                .foregroundStyle(ThusoRole.foreground)
        }
        .accessibilityElement(children: .combine)
    }
}

/// A label with its symbol after the words, for the button that points onwards.
struct TrailingIconLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: ThusoSpacing.space8) { configuration.title; configuration.icon }
    }
}
