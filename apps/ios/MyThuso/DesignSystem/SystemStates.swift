import SwiftUI

/// Every screen that will one day talk to a clinical, payment, partner or device integration
/// needs these five states designed, not improvised at integration time.
enum LoadState: String, CaseIterable, Identifiable {
    case ready = "Loaded", loading = "Loading", error = "Service error", offline = "Offline", denied = "Permission denied"
    var id: String { rawValue }
}
struct SkeletonRows: View {
    var rows = 3
    @State private var shimmer = false
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            ForEach(0..<rows, id: \.self) { index in
                HStack(spacing: 14) {
                    RoundedRectangle(cornerRadius: 12).fill(.gray.opacity(0.12)).frame(width: 44, height: 44)
                    VStack(alignment: .leading, spacing: 8) {
                        Capsule().fill(.gray.opacity(0.12)).frame(width: 190 - CGFloat(index) * 26, height: 9)
                        Capsule().fill(.gray.opacity(0.1)).frame(width: 120 - CGFloat(index) * 18, height: 9)
                    }
                    Spacer()
                }
            }
        }
        .opacity(shimmer ? 0.55 : 1)
        .animation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true), value: shimmer)
        .onAppear { shimmer = true }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Loading care information")
    }
}
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
        case .offline: return "\(subject) needs a connection. What you’ve already opened stays available, and nothing you entered has been lost."
        case .denied: return "MyThuso cannot show \(subject.lowercased()) until you allow \(permission). You can change your mind at any time, and declining never blocks a visit."
        default: return "\(subject) did not load. This is a preview, so nothing was lost — in production this would retry automatically and log the failure for the care team."
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
            CareCard {
                Label(heading, systemImage: symbol).font(.headline).foregroundStyle(ThusoTheme.ink)
                Text(body_).font(.subheadline).foregroundStyle(.secondary)
                if let retry {
                    Button(state == .denied ? "Review permission" : "Try again", action: retry).buttonStyle(.bordered)
                }
            }
            .accessibilityElement(children: .combine)
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
            VStack(alignment: .leading, spacing: 8) {
                Text(title).font(.caption2).foregroundStyle(ThusoTheme.body)
                Picker(title, selection: $state) { ForEach(LoadState.allCases) { Text($0.rawValue).tag($0) } }
                    .pickerStyle(.segmented).labelsHidden()
            }.padding(.top, 8)
        } label: {
            HStack(spacing: 8) {
                Text("Preview states").font(.system(size: 12, weight: .semibold)).foregroundStyle(ThusoTheme.body)
                if state != .ready { StatusPill(text: state.rawValue, tone: "amber") }
            }
        }
        .padding(14)
        .background(.white, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [4, 3])).foregroundStyle(ThusoTheme.line))
    }
}
struct EmptyStateCard: View {
    let title: String
    let message: String
    var body: some View {
        CareCard {
            Label(title, systemImage: "tray").font(.headline)
            Text(message).font(.subheadline).foregroundStyle(.secondary)
        }
    }
}
