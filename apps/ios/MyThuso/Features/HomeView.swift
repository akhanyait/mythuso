import SwiftUI

/* The returning patient's home.
 *
 * It used to open with a 470-point green field behind a carousel that rotated on its own, then a
 * search box, then a two-up grid of service tiles whose names wrapped to three lines on a narrow
 * phone — and the services began below the fold. A person who has already decided to book saw a
 * promotion first and the thing they came for last.
 *
 * The order below is what a returning patient needs, in the order they need it: who they are and
 * where, what is already arranged, how to arrange the next thing, and then results, plans and
 * family. The shortcuts are rows rather than tiles because a row has somewhere to put the price and
 * the length of the visit without squeezing the name. One promotional card is still here, once,
 * near the bottom, where it is an offer rather than an obstacle; the rotating one moved to the
 * roadmap, which is the screen rotating promotion is actually for.
 *
 * Nothing on this screen has a fixed height around text. At the largest Dynamic Type sizes the
 * rows lay themselves out vertically instead of clipping, which is what the frames removed from
 * here used to do. */
struct HomeView: View {
    let book: () -> Void
    let firstRun: () -> Void
    @EnvironmentObject private var store: PreviewStore
    @Environment(\.dynamicTypeSize) private var typeSize
    private var stacked: Bool { typeSize.isAccessibilitySize }

    var body: some View {
        /* THE BAND BEHIND THE GREETING IS GONE.
           It was 210 points of brand texture under the first thing on the first screen, and on the
           Care Studio ground it is a second surface drawn on top of the one the whole app now stands
           on — two grounds arguing along a hard edge, which is what the Android shell already removed
           for the same reason. The headline is the hero. Paper, and a very large sentence on it. */
        content
            .thusoGround()
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                /* The mark, not the lockup. "Brand" is the full horizontal lockup — icon, wordmark and
                   the tagline "Help. Health. Home." — and the web gives it 168 points of width to be
                   read in. This slot is a 34-point circle, so the same file arrived with its wordmark
                   about three points tall and its tagline under two: not a small logo, an illegible
                   one, and the first thing on the first screen. BrandMark is the icon out of that same
                   artwork, measured off its own alpha rather than cropped by eye. */
                    Image("BrandMark").resizable().scaledToFit().frame(height: 30).accessibilityLabel("MyThuso")
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
                bookingActions
                shortcuts
                results
                carePlan
                family
                NavigationLink { PassportView() } label: { passportPromo }.buttonStyle(.plain)
                /* The tagline used to close this screen in thirteen-point grey. It opens it now, at
                   forty points on a lime block, so it is not repeated down here. */
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

    /* The care area and the person a visit is for sit at the top, together, because they change
       what everything under them means. Choosing a family member here opens the family screen,
       where the consent and record-access questions are actually answered — never their record.

       THE HEADLINE IS THE CONTRACT'S OWN WORDS, IN ELEVEN LANGUAGES.
       The prototype's patient frame is a greeting over a short line about what the product is for,
       both set very large. The temptation was to type the second line in English and let ten locales
       show a slogan nobody had translated — on the one screen a person opens first. There was no
       need: `shell.greeting` and `shell.tagline` are both in locales.json, reviewed to the same
       standard as everything else on the shell, and "Help. Health. Home." is three words in every
       one of them. So the tagline is promoted from a grey caption at the very bottom of this screen
       — where it had been since the first cut and where nobody would ever read it — to the second
       line of the headline. Nothing new was written and nothing is only in English. */
    private var greeting: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
            DemoBadge()
            StudioHeadline(lead: thuso(.greeting, store.locale),
                           accent: thuso(.tagline, store.locale),
                           detail: thuso(.greetingSub, store.locale))
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
            } else {
                /* Not a blank space and not a fixture. The sentences are the scheduling contract's,
                   so all three apps say the same thing about having nothing booked. */
                CareCard(weight: .lead) {
                    TileIcon(symbol: "calendar.badge.plus")
                    Text(Scheduling.Label.noUpcoming).font(.headline).foregroundStyle(ThusoTheme.charcoal)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(Scheduling.Label.noUpcomingDetail).font(.subheadline).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
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
                TileIcon(symbol: visit.service.symbol, tint: ThusoTheme.studioInkDeep)
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
                    Text("Sister Naledi Mokoena").font(.subheadline.weight(.semibold)).studioNightInk()
                    Text("Registered Nurse (SANC)").thusoFont(ThusoType.caption).studioNightInk(quiet: true)
                }
                Spacer(minLength: 4)
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).studioNightInk(quiet: true)
            }
        }
    }

    // MARK: - Arranging the next thing

    private var bookingActions: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            searchField
            Button(action: book) {
                HStack(spacing: ThusoSpacing.space8) {
                    Image(systemName: "stethoscope")
                    Text(thuso(.bookNurse, store.locale))
                    Image(systemName: "arrow.right")
                }
            }
            .buttonStyle(CareButton())
        }
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
            Image(systemName: "magnifyingglass").foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted)).accessibilityHidden(true)
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
                Text(service.detail).font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: ThusoSpacing.space8) {
                VStack(alignment: stacked ? .leading : .trailing, spacing: 2) {
                    Text("R\(service.price)").font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                    Text("\(service.duration) min").font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                }
                Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
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

    private var results: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            CareSectionHeader(title: "Recent results") {
                NavigationLink(thuso(.openPassport, store.locale)) { PassportView() }.frame(minHeight: 44).contentShape(Rectangle())
            }
            CareCard(padding: ThusoSpacing.space16, spacing: 0) {
                ForEach(Array(sampleResults.enumerated()), id: \.offset) { index, result in
                    NavigationLink { PassportView() } label: {
                        let row = HStack(alignment: .firstTextBaseline) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(result.0).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                                Text(result.1).font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                            }
                            if !stacked { Spacer(minLength: 8); StatusPill(text: result.2, tone: result.3) }
                        }
                        if stacked {
                            VStack(alignment: .leading, spacing: ThusoSpacing.space8) { row; StatusPill(text: result.2, tone: result.3) }
                                .frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, ThusoSpacing.space8)
                                .frame(minHeight: 44).contentShape(Rectangle())
                        } else {
                            row.padding(.vertical, ThusoSpacing.space8).frame(minHeight: 44).contentShape(Rectangle())
                        }
                    }
                    .buttonStyle(.plain)
                    if index < sampleResults.count - 1 { Divider().overlay(ThusoTheme.studioLine) }
                }
            }
        }
    }

    private var sampleResults: [(String, String, String, String)] {
        [("Blood pressure", "118/78 mmHg", "In range", "teal"),
         ("Blood glucose", "5.4 mmol/L", "In range", "teal"),
         ("Full blood count", "Awaiting doctor review", "With a doctor", "amber")]
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
                .font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
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
                .font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
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
