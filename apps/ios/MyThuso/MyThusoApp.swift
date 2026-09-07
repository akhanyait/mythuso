import SwiftUI

@main struct MyThusoApp: App {
    @StateObject private var store = PreviewStore()
    var body: some Scene {
        WindowGroup {
            Group {
                if let screen = ProcessInfo.processInfo.environment["THUSO_SCREEN"] { ReviewHarness(name: screen) } else { RootView() }
            }
            .environmentObject(store).tint(ThusoTheme.indigo)
        }
    }
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

// TEMPORARY design-review harness — removed before commit.
struct ReviewHarness: View {
    let name: String
    var body: some View {
        NavigationStack {
            switch name {
            case "services": ServicesView()
            case "visits": VisitsView()
            case "passport": PassportView()
            case "more": MoreView(firstRun: {})
            case "roadmap": RoadmapView()
            case "booking": BookingView(service: CareService.all[0])
            case "plans": PlansView()
            case "family": FamilyView()
            case "sos": SosView()
            case "earnings": EarningsView()
            case "kit": ThusoKitView()
            case "vetting": VettingDirectoryView()
            case "patientfile": PatientFileView()
            case "assessment": VisitAssessmentView()
            case "teleconsult": TeleconsultView()
            case "dispensing": DispensingView()
            case "programmes": ProgrammesView()
            case "interpreting": InterpretingView()
            case "onboarding": OnboardingView()
            case "states": SystemStatesView()
            case "household": HouseholdView()
            case "capture": CaptureQueueView()
            case "dispatch": DispatchBoardView()
            case "consultation": ConsultationRecordView()
            case "summary": HealthSummaryView()
            case "feature": FeatureDetail(title: "Thuso Screen")
            default: HomeView(book: {}, firstRun: {})
            }
        }
    }
}
