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
        ZStack(alignment: .top) {
            /* A band of the brand behind the greeting, not a field the height of the screen. */
            HeroTexture().frame(height: 210).ignoresSafeArea(edges: .top).allowsHitTesting(false)
            content
        }
        .background(ThusoTheme.canvas)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Image("Brand").resizable().scaledToFit().frame(height: 34).accessibilityLabel("MyThuso")
            }
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink { NotificationsView() } label: { Image(systemName: "bell") }.accessibilityLabel("Notifications")
            }
        }
    }

    private var content: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                greeting
                arranged
                bookingActions
                shortcuts
                results
                carePlan
                family
                NavigationLink { PassportView() } label: { passportPromo }.buttonStyle(.plain)
                Button(action: firstRun) {
                    Label("See the first-run and recovery flow", systemImage: "person.badge.plus").font(.footnote.weight(.semibold))
                }
                .foregroundStyle(ThusoTheme.teal).frame(minHeight: 44)
                Text(thuso(.tagline, store.locale)).font(.caption).foregroundStyle(ThusoTheme.body).frame(maxWidth: .infinity)
            }
            .padding(18)
        }
        .scrollContentBackground(.hidden)
    }

    // MARK: - Who, and where

    /* The care area and the person a visit is for sit at the top, together, because they change
       what everything under them means. Choosing a family member here opens the family screen,
       where the consent and record-access questions are actually answered — never their record. */
    private var greeting: some View {
        VStack(alignment: .leading, spacing: 11) {
            VStack(alignment: .leading, spacing: 4) {
                Text("\(thuso(.greeting, store.locale)) 👋").font(.title2.weight(.bold)).foregroundStyle(ThusoTheme.ink)
                Text(thuso(.greetingSub, store.locale)).font(.footnote).foregroundStyle(ThusoTheme.body)
            }
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 9) { areaChip; personChip }
                VStack(alignment: .leading, spacing: 9) { areaChip; personChip }
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

    private func chipLabel(symbol: String, text: String) -> some View {
        HStack(spacing: 7) {
            Image(systemName: symbol).font(.footnote)
            Text(text).font(.footnote.weight(.semibold)).lineLimit(2)
            Image(systemName: "chevron.down").font(.caption2.weight(.semibold))
        }
        .foregroundStyle(ThusoTheme.forest)
        .padding(.horizontal, 13).padding(.vertical, 10).frame(minHeight: 44)
        .background(.white.opacity(0.9), in: Capsule())
        .overlay(Capsule().stroke(ThusoTheme.line, lineWidth: 1))
    }

    // MARK: - What is already arranged

    private var arranged: some View {
        VStack(alignment: .leading, spacing: 11) {
            HStack(alignment: .firstTextBaseline) {
                Text(thuso(.nextVisit, store.locale)).font(.headline).foregroundStyle(ThusoTheme.ink)
                Spacer(minLength: 8)
                NavigationLink("All visits") { VisitsView() }.font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.teal)
            }
            if let visit = store.visits.first {
                NavigationLink { VisitDetailView(visit: visit) } label: { visitCard(visit) }.buttonStyle(.plain)
            } else {
                /* Not a blank space and not a fixture. The sentences are the scheduling contract's,
                   so all three apps say the same thing about having nothing booked. */
                CareCard {
                    TileIcon(symbol: "calendar.badge.plus")
                    Text(Scheduling.Label.noUpcoming).font(.headline).foregroundStyle(ThusoTheme.ink)
                    Text(Scheduling.Label.noUpcomingDetail).font(.subheadline).foregroundStyle(ThusoTheme.body)
                    Button(thuso(.bookNurse, store.locale), action: book).buttonStyle(QuietButton())
                }
            }
        }
    }

    private func visitCard(_ visit: BookedVisit) -> some View {
        CareCard {
            let head = HStack(spacing: 12) {
                TileIcon(symbol: visit.service.symbol)
                VStack(alignment: .leading, spacing: 4) {
                    Text(visit.service.name).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.ink)
                    Text(visit.shortWhenText).font(.footnote).foregroundStyle(ThusoTheme.body)
                }
                if !stacked { Spacer(minLength: 6); StatusPill(text: visit.status, tone: visit.isScheduled ? "teal" : "amber") }
            }
            if stacked {
                VStack(alignment: .leading, spacing: 8) { head; StatusPill(text: visit.status, tone: visit.isScheduled ? "teal" : "amber") }
            } else {
                head
            }
            /* An arrival estimate belongs to "come now" and to nothing else; a visit booked for a
               named hour says how long it takes instead, from the catalogue. */
            HStack(spacing: 6) {
                Image(systemName: visit.isScheduled ? "clock" : "bolt.fill").font(.caption)
                Text(visit.isScheduled ? "\(visit.service.duration) minutes" : "Looking for the nearest nurse").font(.footnote)
            }
            .foregroundStyle(ThusoTheme.body)
            HStack(spacing: 6) {
                Image(systemName: "mappin.and.ellipse").font(.caption)
                Text(visit.address).font(.footnote)
            }
            .foregroundStyle(ThusoTheme.body)
            Divider().overlay(ThusoTheme.line)
            HStack(spacing: 11) {
                Text("SN").font(.footnote.weight(.bold)).foregroundStyle(ThusoTheme.tealDeep)
                    .padding(11).background(ThusoTheme.mint, in: Circle())
                VStack(alignment: .leading, spacing: 3) {
                    Text("Sister Naledi Mokoena").font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.ink)
                    Text("Registered Nurse (SANC)").font(.caption).foregroundStyle(ThusoTheme.body)
                }
                Spacer(minLength: 4)
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(ThusoTheme.body.opacity(0.6))
            }
        }
    }

    // MARK: - Arranging the next thing

    private var bookingActions: some View {
        VStack(alignment: .leading, spacing: 11) {
            searchField
            Button(action: book) {
                HStack(spacing: 9) {
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
        HStack(spacing: 11) {
            Image(systemName: "magnifyingglass").foregroundStyle(ThusoTheme.body.opacity(0.7))
            TextField("What care do you need today?", text: $store.careQuery).submitLabel(.search).onSubmit(book)
                .accessibilityLabel("Search for care")
        }
        .padding(.horizontal, 18).padding(.vertical, 12).frame(minHeight: 52)
        .background(.white, in: Capsule())
        .overlay(Capsule().stroke(ThusoTheme.line, lineWidth: 1))
    }

    // MARK: - Care you can book today

    /* One row per service: one icon, the name, what it is, the price and how long it takes. The
       two-up grid this replaces had room for the name and nothing else, and wrapped it over three
       lines on a small phone. Both numbers come from the catalogue rather than being typed here. */
    private var shortcuts: some View {
        VStack(alignment: .leading, spacing: 11) {
            HStack(alignment: .firstTextBaseline) {
                Text("Care you can book today").font(.headline).foregroundStyle(ThusoTheme.ink)
                Spacer(minLength: 8)
                Button(thuso(.bookNurse, store.locale), action: book).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.teal)
            }
            CareCard(padding: 14) {
                ForEach(Array(CareService.all.prefix(4).enumerated()), id: \.element) { index, service in
                    NavigationLink { BookingView(service: service) } label: { shortcutRow(service, index: index) }.buttonStyle(.plain)
                    if index < 3 { Divider().overlay(ThusoTheme.line) }
                }
            }
        }
    }

    private func shortcutRow(_ service: CareService, index: Int) -> some View {
        let layout = stacked ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8)) : AnyLayout(HStackLayout(spacing: 13))
        return layout {
            TileIcon(symbol: service.symbol, tint: tint(index).0, background: tint(index).1)
            VStack(alignment: .leading, spacing: 3) {
                Text(service.name).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.ink)
                Text(service.detail).font(.caption).foregroundStyle(ThusoTheme.body)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: 10) {
                VStack(alignment: stacked ? .leading : .trailing, spacing: 3) {
                    Text("R\(service.price)").font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.forest)
                    Text("\(service.duration) min").font(.caption).foregroundStyle(ThusoTheme.body)
                }
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(ThusoTheme.body.opacity(0.6))
            }
        }
        .padding(.vertical, 6)
        .frame(minHeight: 44)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(service.name). \(service.detail) From R\(service.price), \(service.duration) minutes")
    }

    private func tint(_ index: Int) -> (Color, Color) {
        [(ThusoTheme.teal, ThusoTheme.tealSoft),
         (Color(red: 0.71, green: 0.51, blue: 0.31), Color(red: 0.984, green: 0.933, blue: 0.890)),
         (Color(red: 0.66, green: 0.45, blue: 0.57), Color(red: 0.965, green: 0.914, blue: 0.941)),
         (Color(red: 0.36, green: 0.51, blue: 0.67), Color(red: 0.902, green: 0.933, blue: 0.980))][index % 4]
    }

    // MARK: - Results, plans and family

    private var results: some View {
        VStack(alignment: .leading, spacing: 11) {
            HStack(alignment: .firstTextBaseline) {
                Text("Recent results").font(.headline).foregroundStyle(ThusoTheme.ink)
                Spacer(minLength: 8)
                NavigationLink(thuso(.openPassport, store.locale)) { PassportView() }
                    .font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.teal)
            }
            CareCard(padding: 14) {
                ForEach(Array(sampleResults.enumerated()), id: \.offset) { index, result in
                    NavigationLink { PassportView() } label: {
                        let row = HStack(alignment: .firstTextBaseline) {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(result.0).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.ink)
                                Text(result.1).font(.caption).foregroundStyle(ThusoTheme.body)
                            }
                            if !stacked { Spacer(minLength: 8); StatusPill(text: result.2, tone: result.3) }
                        }
                        if stacked {
                            VStack(alignment: .leading, spacing: 7) { row; StatusPill(text: result.2, tone: result.3) }
                                .frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 6)
                                .frame(minHeight: 44).contentShape(Rectangle())
                        } else {
                            row.padding(.vertical, 6).frame(minHeight: 44).contentShape(Rectangle())
                        }
                    }
                    .buttonStyle(.plain)
                    if index < sampleResults.count - 1 { Divider().overlay(ThusoTheme.line) }
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
        VStack(alignment: .leading, spacing: 11) {
            HStack(alignment: .firstTextBaseline) {
                Text("Care plan").font(.headline).foregroundStyle(ThusoTheme.ink)
                Spacer(minLength: 8)
                NavigationLink("Care plans") { PlansView() }.font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.teal)
            }
            NavigationLink { PlansView() } label: {
                CareCard {
                    MenuRow(title: "Chronic Routine", subtitle: "Monthly check-in · due in 9 days", symbol: "clock")
                }
            }.buttonStyle(.plain)
        }
    }

    private var family: some View {
        VStack(alignment: .leading, spacing: 11) {
            HStack(alignment: .firstTextBaseline) {
                Text("Your circle of care").font(.headline).foregroundStyle(ThusoTheme.ink)
                Spacer(minLength: 8)
                NavigationLink("My family") { FamilyView() }.font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.teal)
            }
            CareCard(padding: 14) {
                ForEach(Array(store.family.enumerated()), id: \.offset) { index, member in
                    NavigationLink { FamilyView() } label: {
                        MenuRow(title: member, subtitle: relationship(index), symbol: "person.crop.circle")
                    }.buttonStyle(.plain)
                    Divider().overlay(ThusoTheme.line)
                }
                NavigationLink { FamilyView() } label: {
                    Label("Add a family member", systemImage: "plus").font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity, alignment: .leading).frame(minHeight: 44).contentShape(Rectangle())
                }
                .buttonStyle(.plain).foregroundStyle(ThusoTheme.teal)
            }
            /* Booking for somebody opens their booking, never their record. What you may see of
               another person is decided in My family, under consent, and nowhere on this screen. */
            Label("Booking for someone opens their booking, never their record. What you may see is decided in My family.",
                  systemImage: "checkmark.shield")
                .font(.caption).foregroundStyle(ThusoTheme.body)
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

    private var passportPromo: some View {
        ZStack(alignment: .leading) {
            LinearGradient(colors: [Color(red: 0.071, green: 0.337, blue: 0.294), ThusoTheme.teal], startPoint: .topLeading, endPoint: .bottomTrailing)
            VStack(alignment: .leading, spacing: 10) {
                StatusPill(text: "THUSO PASS", tone: "light")
                Text("Your health.\nOne safe place.").font(.title3.weight(.bold)).foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Every visit, reading and result, in a record you own and control.")
                    .font(.footnote).foregroundStyle(Color(red: 0.788, green: 0.902, blue: 0.867))
                    .fixedSize(horizontal: false, vertical: true)
                Text("\(thuso(.openPassport, store.locale)) →").font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color(red: 0.788, green: 0.902, blue: 0.867))
            }
            .padding(22)
        }
        .frame(minHeight: 160)
        .clipShape(RoundedRectangle(cornerRadius: 18))
    }
}
