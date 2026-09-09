import SwiftUI

@main struct MyThusoApp: App {
    @StateObject private var store = PreviewStore()
    var body: some Scene { WindowGroup { RootView().environmentObject(store).tint(ThusoTheme.charcoal) } }
}
struct RootView: View {
    @EnvironmentObject private var store: PreviewStore
    @State private var tab = 0
    @State private var showOnboarding = false
    var body: some View {
        TabView(selection: $tab) {
            NavigationStack { HomeView(book: { tab = 1 }, firstRun: { showOnboarding = true }) }.tabItem { Label(thuso(.home, store.locale), systemImage: "house") }.tag(0)
            NavigationStack { ServicesView() }.tabItem { Label(thuso(.bookCare, store.locale), systemImage: "cross.case") }.tag(1)
            NavigationStack { VisitsView() }.tabItem { Label(thuso(.visits, store.locale), systemImage: "calendar") }.tag(2)
            NavigationStack { PassportView() }.tabItem { Label(thuso(.passport, store.locale), systemImage: "heart.text.square") }.tag(3)
            NavigationStack { MoreView(firstRun: { showOnboarding = true }) }.tabItem { Label(thuso(.more, store.locale), systemImage: "square.grid.2x2") }.tag(4)
        }
        .sheet(isPresented: $showOnboarding) { OnboardingView().environmentObject(store) }
    }
}
