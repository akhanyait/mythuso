import SwiftUI

@main struct MyThusoApp: App {
    @StateObject private var store = PreviewStore()
    /* UIKit draws the navigation bar's titles and the tab bar's labels, and it does not read
       Font.thuso — so the identity's two faces are handed to it once here, by the same PostScript
       names, at the sizes the system would have used, and Dynamic Type scales them through the
       metrics of the styles they stand in for. */
    init() {
        let display = { (weight: Font.Weight, style: UIFont.TextStyle, size: CGFloat) -> UIFont in
            let face = UIFont(name: ThusoFont.face(ThusoTypography.display, weight), size: size) ?? .preferredFont(forTextStyle: style)
            return UIFontMetrics(forTextStyle: style).scaledFont(for: face)
        }
        let text = { (weight: Font.Weight, style: UIFont.TextStyle, size: CGFloat) -> UIFont in
            let face = UIFont(name: ThusoFont.face(ThusoTypography.text, weight), size: size) ?? .preferredFont(forTextStyle: style)
            return UIFontMetrics(forTextStyle: style).scaledFont(for: face)
        }
        let bar = UINavigationBar.appearance()
        bar.largeTitleTextAttributes = [.font: display(.bold, .largeTitle, ThusoType.screenTitle)]
        bar.titleTextAttributes = [.font: text(.semibold, .headline, ThusoType.cardTitle)]
        UITabBarItem.appearance().setTitleTextAttributes([.font: text(.medium, .caption1, ThusoType.minimumRendered)], for: .normal)
    }
    var body: some Scene { WindowGroup { RootView().environmentObject(store).tint(ThusoRole.primaryInk) } }
}
struct RootView: View {
    @EnvironmentObject private var store: PreviewStore
    @State private var tab = 0
    @State private var showOnboarding = false
    var body: some View {
        #if DEBUG
        /* `-ThusoScreen <name>` opens one screen as the root, so a design review can screenshot the
           passport or the kit from `xcrun simctl launch` without driving the app. Debug builds only,
           and only when the argument is present; a release build has no such door. */
        if let screen = ReviewScreen.requested {
            NavigationStack { screen }
        } else {
            tabs
        }
        #else
        tabs
        #endif
    }
    /* The patient's four primary destinations wear the MyThuso family, as on the web's tab bar: the
       dashboard, the quick action, the visit and the health icon. More is the family's settings
       icon — the patient's own privacy, access and preferences live behind it. */
    private var tabs: some View {
        TabView(selection: $tab) {
            NavigationStack { HomeView(book: { tab = 1 }, firstRun: { showOnboarding = true }) }
                .tabItem { Label { Text(thuso(.home, store.locale)) } icon: { Image(uiImage: MyThusoTabIcon.image(MyThusoIconsData.dashboard)) } }.tag(0)
            NavigationStack { ServicesView() }
                .tabItem { Label { Text(thuso(.bookCare, store.locale)) } icon: { Image(uiImage: MyThusoTabIcon.image(MyThusoIconsData.quick)) } }.tag(1)
            NavigationStack { VisitsView() }
                .tabItem { Label { Text(thuso(.visits, store.locale)) } icon: { Image(uiImage: MyThusoTabIcon.image(MyThusoIconsData.visit)) } }.tag(2)
            NavigationStack { PassportView() }
                .tabItem { Label { Text(thuso(.passport, store.locale)) } icon: { Image(uiImage: MyThusoTabIcon.image(MyThusoIconsData.health)) } }.tag(3)
            NavigationStack { MoreView(firstRun: { showOnboarding = true }) }
                .tabItem { Label { Text(thuso(.more, store.locale)) } icon: { Image(uiImage: MyThusoTabIcon.image(MyThusoIconsData.settings)) } }.tag(4)
        }
        .sheet(isPresented: $showOnboarding) { OnboardingView().environmentObject(store) }
    }
}

#if DEBUG
enum ReviewScreen {
    @ViewBuilder static var requested: (some View)? {
        let arguments = ProcessInfo.processInfo.arguments
        if let at = arguments.firstIndex(of: "-ThusoScreen"), at + 1 < arguments.count {
            switch arguments[at + 1] {
            case "booking": BookingView(service: CareService.all[0])
            case "passport": PassportView()
            case "kit": ThusoKitView()
            case "inbox": ClinicalInboxView()
            case "assistant": AssistantView()
            case "medicines": MedicinesView()
            case "caretips": CareTipsView()
            case "mentalhealth": MentalHealthPageView()
            case "activity": ActivityPageView()
            case "visit": CareVisitView()
            case "teleconsult": TeleconsultView()
            case "nurse": WorkspaceShell(role: "Nurse", leave: {})
            case "doctor": WorkspaceShell(role: "Doctor", leave: {})
            default: HomeView(book: {}, firstRun: {})
            }
        }
    }
}
#endif
