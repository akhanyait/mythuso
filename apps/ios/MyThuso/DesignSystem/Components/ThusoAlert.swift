import SwiftUI

/* Feedback that stays on screen — the web's Alert.tsx, with SF Symbols where it has Lucide.
 *
 * Every variant pairs its symbol and a title in words with its colour, so no alert is told apart by
 * colour alone. Its border is a tint of its role, as the handoff draws it; the icon and the title
 * carry the variant, so the tint is a hint rather than the message. A danger alert is announced the
 * moment it appears; the rest wait their turn.
 *
 * Two of the handoff's icon colours cannot be seen on a light card — its warning is the brand lime
 * at 1.21:1 and its danger the brand orange at 2.99:1, under the 3:1 a meaningful graphic needs — so
 * those two icons are the warning and danger inks (ThusoRole says which colour on which ground). */
enum ThusoAlertVariant { case info, success, warning, danger }

struct ThusoAlert<Message: View>: View {
    var variant: ThusoAlertVariant = .info
    let title: String
    @ViewBuilder var message: Message

    init(_ variant: ThusoAlertVariant = .info, title: String, @ViewBuilder message: () -> Message) {
        self.variant = variant
        self.title = title
        self.message = message()
    }

    private var symbol: String {
        switch variant {
        case .info: return "info.circle"
        case .success: return "checkmark.circle"
        case .warning: return "exclamationmark.triangle"
        case .danger: return "exclamationmark.circle"
        }
    }
    private var mark: Color {
        switch variant {
        case .info: return ThusoRole.info
        case .success: return ThusoRole.success
        case .warning: return ThusoRole.warningInk
        case .danger: return ThusoRole.dangerInk
        }
    }
    private var edge: Color {
        switch variant {
        case .info: return ThusoRole.info.opacity(0.35)
        case .success: return ThusoRole.success.opacity(0.35)
        case .warning: return ThusoRole.warning.opacity(0.50)
        case .danger: return ThusoRole.danger.opacity(0.35)
        }
    }

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: ThusoRadius.md, style: .continuous)
        HStack(alignment: .top, spacing: ThusoSpacing.space12) {
            Image(systemName: symbol).font(.thuso(.body, weight: .semibold)).foregroundStyle(mark)
                .padding(.top, 2).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
                Text(title).font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                message.font(.thuso(.subheadline)).foregroundStyle(ThusoRole.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(ThusoSpacing.space16)
        .background(ThusoRole.surface, in: shape)
        .overlay(shape.stroke(edge, lineWidth: 1))
        .accessibilityElement(children: .combine)
        .onAppear {
            if variant == .danger { AccessibilityNotification.Announcement(title).post() }
        }
    }
}

extension ThusoAlert where Message == EmptyView {
    init(_ variant: ThusoAlertVariant = .info, title: String) { self.init(variant, title: title) { EmptyView() } }
}
extension ThusoAlert where Message == Text {
    init(_ variant: ThusoAlertVariant = .info, title: String, text: String) { self.init(variant, title: title) { Text(text) } }
}
