import SwiftUI

// Native care overview. Large text uses a vertical layout so readings stay readable.
struct HomeView: View {
    let book: () -> Void
    let firstRun: () -> Void
    @EnvironmentObject private var store: PreviewStore
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var askingGilbert = false
    private var stacked: Bool { typeSize.isAccessibilitySize }

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
                        Circle().fill(ThusoTheme.brandInk).frame(width: 60, height: 60)
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
                    Image("Brand").resizable().scaledToFit().frame(width: 124, height: 34).accessibilityLabel("MyThuso")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink { NotificationsView() } label: { Image(systemName: "bell") }.accessibilityLabel("Notifications")
                }
            }
    }

    private var content: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space24) {
                greeting
                arranged
                careCover
                healthSnapshot
                searchField
                liveWell
                shortcuts
                results
                carePlan
                family
                NavigationLink { PassportView() } label: { passportPromo }.buttonStyle(.plain)
                Button(action: firstRun) {
                    Label("See the first-run and recovery flow", systemImage: "person.badge.plus").font(.footnote.weight(.semibold))
                }
                .frame(minHeight: 44).contentShape(Rectangle())
                .foregroundStyle(ThusoTheme.charcoal)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.bottom, ThusoSpacing.space16)
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .scrollContentBackground(.hidden)
    }

    // MARK: - Who, and where

    // Location and patient context remain beside the greeting.
    private var greeting: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
            DemoBadge()
            VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
                Text(thuso(FramingData.patientLead, store.locale))
                    .font(.largeTitle.weight(.semibold)).tracking(-1.2)
                    .foregroundStyle(ThusoTheme.studioInkDeep)
                    .fixedSize(horizontal: false, vertical: true)
                Text(thuso(FramingData.patientDetail, store.locale))
                    .font(.subheadline).foregroundStyle(ThusoTheme.studioInkMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            ViewThatFits(in: .horizontal) {
                HStack(spacing: ThusoSpacing.space8) { areaChip; personChip }
                VStack(alignment: .leading, spacing: ThusoSpacing.space8) { areaChip; personChip }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
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

    /* The two chips that say who the care is for and where.
     *
     * They were capsules with `lineLimit(2)` on them, and at the accessibility sizes that is two
     * defects at once: "Rosebank, Johannesburg" came out as "Rosebank, Johanne…" — the suburb
     * somebody had chosen, unreadable in the control that chose it — and a capsule's ends curve in
     * by half its height, so on a two-line chip the first and last words sit inside the curve. It
     * is the same pair of problems MetricChip and NavPillLabel already solved, solved the same way:
     * the text wraps as far as it needs to, and past the accessibility sizes the shape stops being
     * a capsule and becomes a rounded rectangle whose corners leave the words alone. */
    private func chipLabel(symbol: String, text: String) -> some View {
        let shape: AnyShape = typeSize.isAccessibilitySize
            ? AnyShape(RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous))
            : AnyShape(Capsule())
        return HStack(spacing: ThusoSpacing.space8) {
            Image(systemName: symbol).font(.footnote).accessibilityHidden(true)
            Text(text).font(.footnote.weight(.semibold)).fixedSize(horizontal: false, vertical: true)
            Image(systemName: "chevron.down").font(.caption2.weight(.semibold)).accessibilityHidden(true)
        }
        .foregroundStyle(ThusoTheme.charcoal)
        .padding(.horizontal, ThusoSpacing.space12).padding(.vertical, ThusoSpacing.space8).frame(minHeight: 44)
        .background(ThusoTheme.surface, in: shape)
        .overlay(shape.stroke(ThusoTheme.controlEdge, lineWidth: 1))
    }

    // MARK: - What is already arranged

    private var arranged: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            CareSectionHeader(title: thuso(.nextVisit, store.locale)) {
                NavigationLink("All visits") { VisitsView() }
                    .frame(minHeight: 44).contentShape(Rectangle())
            }
            if let visit = store.visits.first {
                NavigationLink { VisitDetailView(visit: visit) } label: { visitCard(visit) }.buttonStyle(.plain)
                CareCard(padding: ThusoSpacing.space16, spacing: ThusoSpacing.space12) {
                    HStack(alignment: .center, spacing: 12) {
                        Image("CareNursePortrait").resizable().scaledToFill().frame(width: 56, height: 64).clipped()
                            .clipShape(RoundedRectangle(cornerRadius: 16)).accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 4) {
                            Label("Before your visit", systemImage: "checklist").font(.subheadline.weight(.semibold))
                            Text("Care at home · Illustrative image").thusoFont(ThusoType.caption).foregroundStyle(ThusoTheme.studioInkMuted)
                        }
                    }
                    Text("Have your medication list ready. Review the address and appointment details before the day.").font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                    ClinicianProfileLink(doctor: false)
                    NavigationLink { VisitDetailView(visit: visit) } label: { Text("Visit details and preparation").frame(minHeight: 44).contentShape(Rectangle()) }.buttonStyle(.plain)
                }
            } else {
                /* Not a blank space and not a fixture. The sentences are the scheduling contract's,
                   so all three apps say the same thing about having nothing booked. */
                CareCard(weight: .lead) {
                    TileIcon(symbol: "calendar.badge.plus")
                    Text(Scheduling.Label.noUpcoming).font(.headline).foregroundStyle(ThusoTheme.charcoal)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(Scheduling.Label.noUpcomingDetail).font(.subheadline).foregroundStyle(ThusoTheme.studioInkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                    Button(thuso(.bookNurse, store.locale), action: book).buttonStyle(QuietButton())
                }
            }
        }
    }

    /* THE ONE NEAR-BLACK CARD ON THIS SCREEN, AND IT CARRIES THE ONE THING THAT IS ALREADY TRUE.
     *
     * The prototype's phone frames spend exactly one dark card per screen, and they spend it on what
     * is live right now. On a returning patient's home that is the visit somebody has already
     * arranged — not the catalogue under it, not the promotion at the foot of it. It was a pale lead
     * card among seven other cards, which is the defect the design language names first: a screen
     * where every card is a rounded box with the same treatment has no subject.
     *
     * Everything on it is `studioPaper`, the declared ink for this ground at 13.95:1, with the
     * supporting lines at the muted opacity — 9.04:1. The chip is `onDark`, which is the tone this
     * app already had for exactly this case and which no longer needs the visit's own tone word: on
     * a card that is one thing to VoiceOver and one object on the screen, a teal chip and an amber
     * chip were two colours saying what the words beside them already say. The monogram takes the
     * paper as its disc, so the initials stay dark on something light rather than vanishing. */
    private func visitCard(_ visit: BookedVisit) -> some View {
        StudioNightCard(spacing: ThusoSpacing.space12) {
            let head = HStack(spacing: ThusoSpacing.space12) {
                TileIcon(symbol: visit.service.symbol, tint: ThusoTheme.studioInkDeep, background: ThusoTheme.studioLime)
                VStack(alignment: .leading, spacing: 4) {
                    Text(visit.service.name).font(.subheadline.weight(.semibold)).studioNightInk()
                    Text(visit.shortWhenText).font(.footnote).studioNightInk(quiet: true)
                }
                if !stacked { Spacer(minLength: 6); MetricChip(text: visit.status, tone: .onDark) }
            }
            if stacked {
                VStack(alignment: .leading, spacing: ThusoSpacing.space8) { head; MetricChip(text: visit.status, tone: .onDark) }
            } else {
                head
            }
            /* An arrival estimate belongs to "come now" and to nothing else; a visit booked for a
               named hour says how long it takes instead, from the catalogue. */
            HStack(spacing: ThusoSpacing.space4) {
                Image(systemName: visit.isScheduled ? "clock" : "bolt.fill").thusoFont(ThusoType.caption)
                Text(visit.isScheduled ? "\(visit.service.duration) minutes" : "Looking for the nearest nurse").font(.footnote)
            }
            .studioNightInk(quiet: true)
            HStack(spacing: ThusoSpacing.space4) {
                Image(systemName: "mappin.and.ellipse").thusoFont(ThusoType.caption)
                Text(visit.address).font(.footnote)
            }
            .studioNightInk(quiet: true)
            /* A rule on a card this dark has to be drawn in the card's own ink. `studioLine` is a
               hairline for a light ground and there is nothing of it to see here. */
            Rectangle().fill(ThusoTheme.studioPaper.opacity(0.18)).frame(height: 1).accessibilityHidden(true)
            HStack(spacing: ThusoSpacing.space12) {
                Monogram(text: Arrival.nurse.initials, background: ThusoTheme.studioPaper)
                VStack(alignment: .leading, spacing: 3) {
                    Text(Arrival.nurse.name).font(.subheadline.weight(.semibold)).studioNightInk()
                    Text(Arrival.nurse.role).thusoFont(ThusoType.caption).studioNightInk(quiet: true)
                }
                Spacer(minLength: 4)
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).studioNightInk(quiet: true)
            }
        }
    }

    // MARK: - Arranging the next thing

    private var careCover: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
            Text("HELP. HEALTH. HOME.").thusoFont(ThusoType.caption, weight: .semibold).tracking(1.5)
                .foregroundStyle(ThusoTheme.studioLime)
            Text("Care that\nfeels like home.").font(.largeTitle.weight(.medium)).tracking(-1.4)
                .foregroundStyle(.white).fixedSize(horizontal: false, vertical: true)
            Button(action: book) {
                Label(thuso(.bookNurse, store.locale), systemImage: "arrow.up.right")
                    .font(.subheadline.weight(.semibold)).fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, ThusoSpacing.space16).padding(.vertical, ThusoSpacing.space12)
                    .frame(minHeight: 44)
                    .background(ThusoTheme.studioLime, in: RoundedRectangle(cornerRadius: ThusoRadius.control))
                    .foregroundStyle(ThusoTheme.studioInkDeep)
            }.buttonStyle(.plain)
            Text("Illustrative image").thusoFont(ThusoType.caption).foregroundStyle(.white)
        }
        .padding(ThusoSpacing.space24)
        .frame(maxWidth: .infinity, minHeight: 254, alignment: .leading)
        .background {
            GeometryReader { geometry in
                Image("CareEditorial").resizable().scaledToFill()
                    .frame(width: geometry.size.width, height: geometry.size.height).clipped()
                    .overlay {
                        LinearGradient(stops: [.init(color: ThusoTheme.studioNight.opacity(0.96), location: 0),
                                               .init(color: ThusoTheme.studioNight.opacity(0.80), location: 0.52),
                                               .init(color: ThusoTheme.studioNight.opacity(0.1), location: 1)],
                                       startPoint: .leading, endPoint: .trailing)
                    }
            }.accessibilityHidden(true)
        }
        .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
    }

    /* The words typed here live on the store, so the catalogue in the next tab opens already
       filtered. The search used to call book() and throw the query away. */
    private var searchField: some View {
        /* Round while the prompt fits on one line, and a rounded rectangle once it does not. A
           search prompt at three times the type wraps, and a capsule wrapping is a capsule cutting
           the first and last word of the line it curves past. */
        let shape: AnyShape = typeSize.isAccessibilitySize
            ? AnyShape(RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous))
            : AnyShape(Capsule())
        return HStack(spacing: ThusoSpacing.space12) {
            Image(systemName: "magnifyingglass").foregroundStyle(ThusoTheme.studioInkMuted).accessibilityHidden(true)
            /* One line, deliberately. A vertical axis would let the prompt wrap, and it would also
               turn Return into a newline — which is the one key this field has a job for. */
            TextField("What care do you need today?", text: $store.careQuery).submitLabel(.search).onSubmit(book)
                .accessibilityLabel("Search for care")
        }
        .padding(.horizontal, ThusoSpacing.space16).padding(.vertical, ThusoSpacing.space12).frame(minHeight: 48)
        .contentShape(Rectangle())
        .background(ThusoTheme.surface, in: shape)
        .overlay(shape.stroke(ThusoTheme.controlEdge, lineWidth: 1))
    }

    // MARK: - Care you can book today

    /* One row per service: one icon, the name, what it is, the price and how long it takes. The
       two-up grid this replaces had room for the name and nothing else, and wrapped it over three
       lines on a small phone. Both numbers come from the catalogue rather than being typed here. */
    private var shortcuts: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            CareSectionHeader(title: "Care you can book today") {
                Button("See all care", action: book).frame(minHeight: 44).contentShape(Rectangle())
            }
            CareCard(padding: ThusoSpacing.space16, spacing: 0) {
                ForEach(Array(CareService.all.prefix(4).enumerated()), id: \.element) { index, service in
                    NavigationLink { BookingView(service: service) } label: { shortcutRow(service, index: index) }.buttonStyle(.plain)
                    if index < 3 { Divider().overlay(ThusoTheme.studioLine) }
                }
            }
        }
    }

    private func shortcutRow(_ service: CareService, index: Int) -> some View {
        let layout = stacked ? AnyLayout(VStackLayout(alignment: .leading, spacing: ThusoSpacing.space8)) : AnyLayout(HStackLayout(spacing: ThusoSpacing.space12))
        return layout {
            if !stacked {
                Image(systemName: service.symbol).font(.body).foregroundStyle(ThusoTheme.charcoal)
                    .frame(width: 28).accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(service.name).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                Text(service.detail).thusoFont(ThusoType.caption).foregroundStyle(ThusoTheme.studioInkMuted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: ThusoSpacing.space8) {
                VStack(alignment: stacked ? .leading : .trailing, spacing: 2) {
                    Text("R\(service.price)").font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                    Text("\(service.duration) min").thusoFont(ThusoType.caption).foregroundStyle(ThusoTheme.studioInkMuted)
                }
                Image(systemName: "chevron.right").thusoFont(ThusoType.caption, weight: .semibold).foregroundStyle(ThusoTheme.studioInkMuted)
                    .accessibilityHidden(true)
            }
        }
        .padding(.vertical, ThusoSpacing.space8)
        .frame(minHeight: 44)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(service.name). \(service.detail) From R\(service.price), \(service.duration) minutes")
    }

    // MARK: - Results, plans and family

    // The home and Passport read the same fixture; a redesign must not invent new readings.
    private var healthSnapshot: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            Text("Your care at a glance").font(.headline).foregroundStyle(ThusoTheme.studioInk)
            Text("Sample readings · \(Scheduling.shortDate(Passport.latestSet.date))")
                .thusoFont(ThusoType.caption).foregroundStyle(ThusoTheme.studioInkMuted)
            let layout = stacked ? AnyLayout(VStackLayout(spacing: ThusoSpacing.space12))
                                 : AnyLayout(HStackLayout(alignment: .top, spacing: ThusoSpacing.space12))
            layout {
                snapshotCard(id: "systolic", symbol: "heart", fill: ThusoTheme.surface)
                snapshotCard(id: "glucose", symbol: "waveform.path.ecg", fill: ThusoTheme.studioLime)
            }
        }
    }

    private func snapshotCard(id: String, symbol: String, fill: Color) -> some View {
        NavigationLink { PassportView() } label: {
            VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
                HStack {
                    Image(systemName: symbol)
                    Spacer()
                    Image(systemName: "arrow.up.right").thusoFont(ThusoType.caption)
                }.foregroundStyle(ThusoTheme.studioInk)
                if let observation = Passport.spec(id), let value = Passport.latestSet.values[id] {
                    let display = id == "systolic"
                        ? "\(Int(value))/\(Int(Passport.latestSet.values["diastolic"] ?? 0))"
                        : Passport.format(observation, value)
                    Text(id == "systolic" ? "Blood pressure" : observation.label)
                        .thusoFont(ThusoType.caption).foregroundStyle(ThusoTheme.studioInkMuted)
                    Text(display).font(.title.weight(.semibold)).tracking(-1.2)
                        .foregroundStyle(ThusoTheme.studioInkDeep)
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(alignment: .bottom) {
                        Text(observation.unit).thusoFont(ThusoType.caption).foregroundStyle(ThusoTheme.studioInkMuted)
                        Spacer(minLength: 4)
                        HStack(alignment: .bottom, spacing: 3) {
                            ForEach(Array(Passport.series(observation).enumerated()), id: \.offset) { index, reading in
                                Capsule().fill(ThusoTheme.studioOlive.opacity(0.45))
                                    .frame(width: 7, height: max(5, reading.value / (id == "systolic" ? 160 : 8) * 30))
                                    .studioBarEntrance(delay: Double(index) * 0.08, identity: "\(id):\(reading.value)")
                            }
                        }.frame(height: 30).accessibilityHidden(true)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(ThusoSpacing.space16)
            .background(fill, in: RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous))
        }.buttonStyle(.plain)
    }

    private var results: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            CareSectionHeader(title: "Your health over time") {
                NavigationLink(thuso(.openPassport, store.locale)) { PassportView() }
            }
            if let observation = Passport.spec("systolic") {
                ClinicalChart(title: "Systolic blood pressure", unit: observation.unit,
                              readings: Passport.series(observation), normal: observation.range,
                              symbol: "heart")
            }
            NavigationLink { PassportView() } label: {
                CareCard {
                    Text("Full blood count").font(.headline).foregroundStyle(ThusoTheme.studioInk)
                    Text("Awaiting doctor review").font(.subheadline).foregroundStyle(ThusoTheme.studioInkMuted)
                    StatusPill(text: "With a doctor", tone: "amber")
                }
            }.buttonStyle(.plain)
        }
    }

    private var liveWell: some View {
        NavigationLink { LiveWellView() } label: {
            VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
                Text("YOUR EVERYDAY WELLBEING").thusoFont(ThusoType.caption, weight: .semibold).tracking(1.2)
                    .foregroundStyle(ThusoTheme.studioInkMuted)
                HStack(alignment: .center, spacing: 8) {
                    Text("Make room\nfor you.").font(.largeTitle.weight(.medium)).tracking(-1.4)
                        .foregroundStyle(ThusoTheme.studioInkDeep).fixedSize(horizontal: false, vertical: true)
                    if !stacked { Spacer(minLength: 0); MoonArtwork().frame(width: 120, height: 120) }
                }
                Text("How have you been feeling? A quiet space for your own words.")
                    .font(.subheadline).foregroundStyle(ThusoTheme.studioInkMuted).fixedSize(horizontal: false, vertical: true)
                HStack {
                    Text("Open your journal").font(.subheadline.weight(.semibold))
                    Spacer(minLength: 8)
                    Image(systemName: "arrow.up.right")
                }
                .foregroundStyle(ThusoTheme.studioInk)
                .padding(ThusoSpacing.space16)
                .background(ThusoTheme.surface, in: RoundedRectangle(cornerRadius: ThusoRadius.control))
            }
            .padding(ThusoSpacing.space24)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(ThusoTheme.studioLilac, in: RoundedRectangle(cornerRadius: 30, style: .continuous))
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
                    .frame(minHeight: 44).contentShape(Rectangle())
            }
            CareCard(padding: ThusoSpacing.space16, spacing: 0) {
                ForEach(Array(store.family.enumerated()), id: \.offset) { index, member in
                    NavigationLink { FamilyView() } label: {
                        MenuRow(title: member, subtitle: relationship(index), symbol: "person.crop.circle")
                    }.buttonStyle(.plain)
                    Divider().overlay(ThusoTheme.studioLine)
                }
                NavigationLink { FamilyView() } label: {
                    Label("Add a family member", systemImage: "plus").font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity, alignment: .leading).frame(minHeight: 44).contentShape(Rectangle())
                }
                .buttonStyle(.plain).foregroundStyle(ThusoTheme.charcoal)
            }
            /* Booking for somebody opens their booking, never their record. What you may see of
               another person is decided in My family, under consent, and nowhere on this screen. */
            /* One element with the sentence as its label. `children: .combine` left the shield in the
               tree as an element of its own, so VoiceOver read "checkmark shield" before the words
               it decorates. */
            Label("Booking for someone opens their booking, never their record. What you may see is decided in My family.",
                  systemImage: "checkmark.shield")
                .thusoFont(ThusoType.caption).foregroundStyle(ThusoTheme.studioInkMuted)
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

    /* THE PROMOTION GAVE UP THE DARK CARD, BECAUSE THERE IS ONLY ONE OF THOSE.
     *
     * It was a NightPanel, and so is the visit at the top of this screen now — two near-black cards
     * on one page, which is two subjects, which is none. The offer is the quieter of the two claims
     * by a long way: one of them is a nurse coming to somebody's house on Thursday and the other is
     * an invitation to look at a record.
     *
     * So it takes `studioPeach`, one of the three tiles the Care Studio palette declares, with
     * charcoal on it. It is still the warmest object at the foot of the screen and it is no longer
     * competing with the thing that is actually happening. */
    private var passportPromo: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            StatusPill(text: "THUSO PASS")
            Text("Your health.\nOne safe place.").font(.title3.weight(.bold)).foregroundStyle(ThusoTheme.charcoal)
                .fixedSize(horizontal: false, vertical: true)
            Text("Every visit, reading and result, in a record you own and control.")
                .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                .fixedSize(horizontal: false, vertical: true)
            Text("\(thuso(.openPassport, store.locale)) →").font(.subheadline.weight(.semibold))
                .foregroundStyle(ThusoTheme.charcoal)
        }
        .padding(ThusoSpacing.space20)
        .frame(maxWidth: .infinity, minHeight: 150, alignment: .leading)
        .background(ThusoTheme.studioPeach,
                    in: RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}
