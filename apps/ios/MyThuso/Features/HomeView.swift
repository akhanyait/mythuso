import SwiftUI

struct HomeView: View {
    let book: () -> Void
    let firstRun: () -> Void
    @EnvironmentObject private var store: PreviewStore
    @State private var query = ""
    @State private var passport = false
    private let trust = [("checkmark.seal", "Verified nurses"), ("tag", "Fixed prices"), ("stethoscope", "Doctor-reviewed")]
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                DemoBadge()
                VStack(alignment: .leading, spacing: 6) {
                    Text("\(thuso(.greeting, store.locale)) 👋").font(.system(size: 25, weight: .bold)).foregroundStyle(ThusoTheme.ink)
                    Text(thuso(.greetingSub, store.locale)).font(.system(size: 13)).foregroundStyle(ThusoTheme.body)
                }.frame(maxWidth: .infinity, alignment: .leading)
                HeroCarousel { position in position == 1 ? (passport = true) : book() }
                searchField
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 11), GridItem(.flexible(), spacing: 11)], spacing: 11) {
                    ForEach(Array(CareService.all.prefix(4).enumerated()), id: \.element) { index, service in
                        NavigationLink { BookingView(service: service) } label: {
                            CareCard(padding: 15) {
                                TileIcon(symbol: service.symbol, tint: tint(index).0, background: tint(index).1)
                                Text(service.name).font(.system(size: 14, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
                                    .frame(maxWidth: .infinity, alignment: .leading).fixedSize(horizontal: false, vertical: true)
                            }
                        }.buttonStyle(.plain)
                    }
                }
                HStack {
                    Text(thuso(.nextVisit, store.locale)).font(.system(size: 17, weight: .semibold))
                    Spacer()
                    NavigationLink("All visits") { VisitsView() }.font(.system(size: 13, weight: .semibold)).foregroundStyle(ThusoTheme.teal)
                }
                if let visit = store.visits.first {
                    NavigationLink { VisitDetailView(visit: visit) } label: {
                        CareCard {
                            HStack(spacing: 12) {
                                TileIcon(symbol: visit.service.symbol)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(visit.service.name).font(.system(size: 15, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
                                    Text(visit.time).font(.system(size: 12)).foregroundStyle(ThusoTheme.body)
                                }
                                Spacer(minLength: 6)
                                StatusPill(text: "Confirmed")
                            }
                            Divider().overlay(ThusoTheme.line)
                            HStack(spacing: 11) {
                                Text("SN").font(.system(size: 13, weight: .bold)).foregroundStyle(ThusoTheme.tealDeep)
                                    .frame(width: 42, height: 42).background(ThusoTheme.mint, in: Circle())
                                VStack(alignment: .leading, spacing: 3) {
                                    Text("Sister Naledi Mokoena").font(.system(size: 14, weight: .semibold)).foregroundStyle(ThusoTheme.ink)
                                    Text("Registered Nurse (SANC)").font(.system(size: 11)).foregroundStyle(ThusoTheme.body)
                                }
                                Spacer(minLength: 4)
                                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(ThusoTheme.body.opacity(0.6))
                            }
                        }
                    }.buttonStyle(.plain)
                }
                NavigationLink { PassportView() } label: { passportPromo }.buttonStyle(.plain)
                NavigationLink { FamilyView() } label: {
                    CareCard { MenuRow(title: "Your circle of care", subtitle: "Looking after your favourite people", symbol: "person.2") }
                }.buttonStyle(.plain)
                Button(action: firstRun) {
                    Label("See the first-run and recovery flow", systemImage: "person.badge.plus").font(.footnote.weight(.semibold))
                }.foregroundStyle(ThusoTheme.teal)
                Text(thuso(.tagline, store.locale)).font(.caption).foregroundStyle(ThusoTheme.body).frame(maxWidth: .infinity)
            }
            .padding(18)
        }
        .background(ThusoTheme.canvas)
        .navigationDestination(isPresented: $passport) { PassportView() }
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.visible, for: .navigationBar).toolbarBackground(ThusoTheme.canvas, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Image("Brand").resizable().scaledToFit().frame(width: 118, height: 42).accessibilityLabel("MyThuso")
            }
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink { NotificationsView() } label: { Image(systemName: "bell") }.accessibilityLabel("Notifications")
            }
        }
    }
    private func tint(_ index: Int) -> (Color, Color) {
        [(ThusoTheme.teal, ThusoTheme.tealSoft),
         (Color(red: 0.71, green: 0.51, blue: 0.31), Color(red: 0.984, green: 0.933, blue: 0.890)),
         (Color(red: 0.66, green: 0.45, blue: 0.57), Color(red: 0.965, green: 0.914, blue: 0.941)),
         (Color(red: 0.36, green: 0.51, blue: 0.67), Color(red: 0.902, green: 0.933, blue: 0.980))][index % 4]
    }
    private var searchField: some View {
        HStack(spacing: 11) {
            Image(systemName: "magnifyingglass").foregroundStyle(ThusoTheme.body.opacity(0.7))
            TextField("What care do you need today?", text: $query).submitLabel(.search).onSubmit(book)
        }
        .padding(.horizontal, 18).frame(height: 52)
        .background(.white, in: Capsule())
        .overlay(Capsule().stroke(ThusoTheme.line, lineWidth: 1))
    }
    private var passportPromo: some View {
        ZStack(alignment: .leading) {
            LinearGradient(colors: [Color(red: 0.071, green: 0.337, blue: 0.294), ThusoTheme.teal], startPoint: .topLeading, endPoint: .bottomTrailing)
            VStack(alignment: .leading, spacing: 10) {
                StatusPill(text: "THUSO PASS", tone: "light")
                Text("Your health.\nOne safe place.").font(.system(size: 23, weight: .bold)).foregroundStyle(.white)
                Text("\(thuso(.openPassport, store.locale)) →").font(.system(size: 14, weight: .semibold)).foregroundStyle(Color(red: 0.788, green: 0.902, blue: 0.867))
            }
            .padding(22)
        }
        .frame(minHeight: 160)
        .clipShape(RoundedRectangle(cornerRadius: 18))
    }
}
