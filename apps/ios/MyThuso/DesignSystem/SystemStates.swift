import SwiftUI

/// Every screen that will one day talk to a clinical, payment, partner or device integration
/// needs these five states designed, not improvised at integration time.
enum LoadState: String, CaseIterable, Identifiable {
    case ready = "Loaded", loading = "Loading", error = "Service error", offline = "Offline", denied = "Permission denied"
    var id: String { rawValue }
}

/* A placeholder for content that has not arrived. It is a redacted shape of the rows underneath,
   not a spinner, so the screen does not jump when the real rows replace it. The pulse respects
   Reduce Motion: with it on, the placeholder simply sits there at its resting opacity. */
struct SkeletonRows: View {
    var rows = 3
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shimmer = false
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
            ForEach(0..<rows, id: \.self) { index in
                HStack(spacing: ThusoSpacing.space12) {
                    RoundedRectangle(cornerRadius: ThusoRadius.tile, style: .continuous)
                        .fill(ThusoTheme.cloud).frame(width: 40, height: 40)
                    VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
                        Capsule().fill(ThusoTheme.cloud).frame(width: 190 - CGFloat(index) * 26, height: 9)
                        Capsule().fill(ThusoTheme.cloud.opacity(0.7)).frame(width: 120 - CGFloat(index) * 18, height: 9)
                    }
                    Spacer(minLength: 0)
                }
            }
        }
        .opacity(shimmer ? 0.55 : 1)
        .animation(reduceMotion || scenePhase != .active ? nil : .easeInOut(duration: 0.9).repeatForever(autoreverses: true), value: shimmer)
        .onAppear { if !reduceMotion { shimmer = true } }
        .onChange(of: reduceMotion) { _, reduced in shimmer = !reduced }
        .onDisappear { shimmer = false }
        .onChange(of: scenePhase) { _, phase in shimmer = phase == .active && !reduceMotion }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Loading care information")
    }
}

/* The four states that are not "here is your content".
 *
 * These were hand-built out of a card, a Label and a bordered button. iOS 17 has the shape of this
 * exact thing — ContentUnavailableView — and it already gets the typography, the metrics, the
 * centring, Dynamic Type and the VoiceOver grouping right, at every text size, for free. The
 * sentences below are unchanged: they are what the app promises about what has and has not
 * happened to a person's information, and they are the reason this component exists. */
struct StateBlock<Content: View>: View {
    let state: LoadState
    let subject: String
    var permission = "device access"
    var retry: (() -> Void)?
    @ViewBuilder var content: Content
    private var heading: String {
        switch state {
        case .offline: return "You’re offline"
        case .denied: return "We need your permission first"
        default: return "We couldn’t load this just now"
        }
    }
    private var body_: String {
        switch state {
        case .offline: return "\(subject) cannot refresh while you’re offline. Your choices on this screen are kept. Reconnect, then try again."
        case .denied: return "MyThuso cannot show \(subject.lowercased()) until you allow \(permission). You can change your mind at any time, and declining never blocks a visit."
        default: return "\(subject) could not load. Your choices on this screen are kept. Try again when you’re ready."
        }
    }
    private var symbol: String {
        switch state {
        case .offline: return "wifi.slash"
        case .denied: return "lock.shield"
        default: return "exclamationmark.triangle"
        }
    }
    var body: some View {
        switch state {
        case .ready: content
        case .loading: SkeletonRows()
        default:
            ContentUnavailableView {
                Label(heading, systemImage: symbol)
            } description: {
                Text(body_)
            } actions: {
                if let retry {
                    Button(state == .denied ? "Review permission" : "Try again", action: retry)
                        .buttonStyle(CareButton()).frame(maxWidth: 260)
                }
            }
            .padding(.vertical, ThusoSpacing.space8)
            .background(ThusoTheme.surface, in: RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous).stroke(ThusoTheme.studioLine, lineWidth: 1))
        }
    }
}

/// A design-review control, not part of the product surface — so it stays collapsed until asked for.
struct StatePicker: View {
    let title: String
    @Binding var state: LoadState
    @State private var open = false
    var body: some View {
        DisclosureGroup(isExpanded: $open) {
            VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
                Text(title).font(.caption2).foregroundStyle(ThusoTheme.studioInkMuted)
                Picker(title, selection: $state) { ForEach(LoadState.allCases) { Text($0.rawValue).tag($0) } }
                    .pickerStyle(.segmented).labelsHidden()
            }.padding(.top, ThusoSpacing.space8)
        } label: {
            /* A DisclosureGroup publishes its label's height as the control's, and two words at
               .caption came back twenty-two points — half a target, and the only way into the
               state a reviewer opened the screen to see. The frame is on the label rather than on
               the group, because the group's frame is the whole expanded panel. */
            HStack(spacing: ThusoSpacing.space8) {
                Text("Preview states").font(.footnote.weight(.semibold)).foregroundStyle(ThusoTheme.studioInkMuted)
                if state != .ready { StatusPill(text: state.rawValue, tone: "amber") }
                Spacer(minLength: 0)
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .padding(ThusoSpacing.space12)
        .background(ThusoTheme.cloud, in: RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous)
            .strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [4, 3])).foregroundStyle(ThusoTheme.studioLine))
    }
}

/// Nothing here yet, said in the platform's own words rather than in a card pretending to be one.
struct EmptyStateCard: View {
    let title: String
    let message: String
    var symbol = "tray"
    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: symbol)
        } description: {
            Text(message)
        }
        .padding(.vertical, ThusoSpacing.space8)
        .background(ThusoTheme.surface, in: RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous).stroke(ThusoTheme.studioLine, lineWidth: 1))
    }
}

/* The one way an iOS screen says it is not wired to anything yet.
 *
 * It is the half of apps/web/src/components/NotConnected.tsx that iOS was missing: the sentence is
 * never typed into a screen, it is the sentence in packages/catalog/capabilities.json, and when the
 * capability is connected this renders nothing at all — so nobody has to remember to delete a
 * banner when an integration lands.
 *
 * It lived beside the assistant, the first screen that needed it, with a note saying the second
 * screen to name a capability should move it here. The cancellation screen is that second screen:
 * it names the payments capability, because what happens to money when a visit is cancelled is a
 * fact about a payment provider that does not exist yet. */
struct CapabilityNotice: View {
    /// An id in packages/catalog/capabilities.json.
    let of: String
    /* Which ground it stands on. The clinical decks put this notice on the night canvas, where the cloud
       plate it wears on paper is a pale lozenge pulling the eye off the headline; there it takes the
       glass the deck's lead figure stands on, and paper ink, which reads 10.78 on it. It is still this
       component rather than a second one drawn for the dark, so the sentence, the identifier and the
       rule that it draws nothing once the capability is connected stay in one place. */
    @Environment(\.onStudioNight) private var onNight
    var body: some View {
        if let notice = Capabilities.notice(for: of) {
            HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space8) {
                Image(systemName: "info.circle").font(.footnote)
                    .foregroundStyle(onNight ? ThusoTheme.surface : ThusoTheme.charcoal)
                    .accessibilityHidden(true)
                Text(notice).font(.footnote).foregroundStyle(onNight ? ThusoTheme.surface : ThusoTheme.charcoal)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(ThusoSpacing.space12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(onNight ? ThusoTheme.surface.opacity(0.08) : ThusoTheme.cloud,
                        in: RoundedRectangle(cornerRadius: onNight ? ThusoRadius.control : ThusoRadius.panel, style: .continuous))
            /* A note rather than a status: it is true when the screen opens and does not change, so
               announcing it as a live update would interrupt a reader mid-sentence for old news. */
            .accessibilityElement(children: .combine)
            /* Named, so a test can ask whether the notice is there without knowing what it says.
               CancellationTests asserted the literal "No payment is taken" and went red the day
               payments became a simulated capability and started saying something else — a test
               holding its own copy of a contract sentence, which is the drift this whole file exists
               to remove, in the file that removes it. The identifier is the capability's id, so the
               question a test asks is the question that matters: is this screen still speaking. */
            .accessibilityIdentifier("capability-notice-\(of)")
        }
    }
}
