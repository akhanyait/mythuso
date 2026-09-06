import SwiftUI

struct HomeView: View {
    let book: () -> Void
    let firstRun: () -> Void
    @EnvironmentObject private var store: PreviewStore
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                DemoBadge()
                CareHeading(eyebrow: "A little care goes a long way", title: thuso(.greeting, store.locale), subtitle: thuso(.greetingSub, store.locale))
                VStack(alignment: .leading, spacing: 16) {
                    Label("CARE THAT COMES TO YOU", systemImage: "house.fill").font(.caption2.weight(.semibold)).tracking(1)
                    HStack { Text(thuso(.heroTitle, store.locale)).font(.system(.largeTitle, design: .rounded).weight(.semibold)); Spacer(); Image(systemName: "heart.circle.fill").font(.system(size: 65)).foregroundStyle(ThusoTheme.teal.opacity(0.7)).accessibilityHidden(true) }
                    Text(thuso(.heroBody, store.locale)).font(.subheadline).foregroundStyle(.secondary)
                    Button(action: book) { Label(thuso(.bookNurse, store.locale), systemImage: "arrow.right") }.buttonStyle(CareButton())
                    Label(thuso(.heroTrust, store.locale), systemImage: "checkmark.shield").font(.caption)
                }.padding(24).background(ThusoTheme.sage, in: RoundedRectangle(cornerRadius: 24))
                HStack { Text(thuso(.helpWith, store.locale)).font(.headline); Spacer(); Button("See all", action: book).font(.caption) }
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                    ForEach(CareService.all.prefix(4)) { service in NavigationLink { BookingView(service: service) } label: { CareCard { Image(systemName: service.symbol).font(.title2).foregroundStyle(ThusoTheme.teal); Text(service.name).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.ink); Text("From R\(service.price)").font(.caption).foregroundStyle(.secondary) } }.buttonStyle(.plain) }
                }
                Text(thuso(.nextVisit, store.locale)).font(.headline)
                if let visit = store.visits.first { NavigationLink { VisitDetailView(visit: visit) } label: { CareCard { Label("Confirmed · Demo", systemImage: "checkmark.circle.fill").font(.caption).foregroundStyle(ThusoTheme.teal); Text(visit.service.name).font(.headline); Label(visit.time, systemImage: "calendar").font(.subheadline); Divider(); Label("Sister Naledi Mokoena", systemImage: "person.crop.circle").font(.subheadline) } }.buttonStyle(.plain) }
                NavigationLink { PassportView() } label: { VStack(alignment: .leading, spacing: 14) { Label("THUSO PASS", systemImage: "heart.text.square").font(.caption).tracking(2); Text("Your health.\nOne safe place.").font(.title.weight(.medium)); Text(thuso(.openPassport, store.locale) + " →").font(.subheadline) }.padding(24).frame(maxWidth: .infinity, alignment: .leading).background(ThusoTheme.forest, in: RoundedRectangle(cornerRadius: 22)).foregroundStyle(.white) }
                NavigationLink { FamilyView() } label: { CareCard { Label("Your circle of care", systemImage: "person.2").font(.headline); Text("Looking after your favourite people.").font(.subheadline).foregroundStyle(.secondary) } }.buttonStyle(.plain)
                Button(action: firstRun) { Label("See the first-run and recovery flow", systemImage: "person.badge.plus").font(.caption) }
                Text(thuso(.tagline, store.locale)).font(.caption).foregroundStyle(.secondary).frame(maxWidth: .infinity)
            }.padding(20)
        }.background(ThusoTheme.canvas).navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.visible, for: .navigationBar).toolbarBackground(ThusoTheme.canvas, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) { Image("Brand").resizable().scaledToFit().frame(width: 123, height: 45).accessibilityLabel("MyThuso") }
            ToolbarItem(placement: .topBarTrailing) { NavigationLink { NotificationsView() } label: { Image(systemName: "bell") }.accessibilityLabel("Notifications") }
        }
    }
}
