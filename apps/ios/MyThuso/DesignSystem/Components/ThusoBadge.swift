import SwiftUI

/* Compact metadata — a category, a non-urgent state. Never a button: it has no press. The web's
   Badge.tsx, and beside it the StatusIndicator, which says availability in words.
 *
 * Both sizes set their words at the caption step, the smallest size this product renders; the
 * handoff's 11 and 12 are below it, so sm and md differ by their padding. The danger badge's words
 * are the danger ink and the primary badge's the primary ink (on dark the handoff's dark accent,
 * because its dark primary as words on a tint measures under 4.5:1). A pill while the words fit on
 * one line, a rounded rectangle past the accessibility sizes so a curve never cuts a word. */
enum ThusoBadgeVariant { case neutral, primary, accent, success, warning, danger }
enum ThusoBadgeSize { case sm, md }

struct ThusoBadge: View {
    let text: String
    var variant: ThusoBadgeVariant = .neutral
    var size: ThusoBadgeSize = .md
    var dot = false
    @Environment(\.dynamicTypeSize) private var typeSize

    init(_ text: String, variant: ThusoBadgeVariant = .neutral, size: ThusoBadgeSize = .md, dot: Bool = false) {
        self.text = text
        self.variant = variant
        self.size = size
        self.dot = dot
    }

    private var colours: (ink: Color, fill: Color) {
        switch variant {
        case .neutral: return (ThusoRole.mutedForeground, ThusoRole.muted)
        case .primary: return (ThusoRole.primaryInk, ThusoRole.primaryTint)
        case .accent: return (ThusoRole.foreground, ThusoRole.accentTint)
        case .success: return (ThusoRole.foreground, ThusoRole.successTint)
        case .warning: return (ThusoRole.foreground, ThusoRole.warningTint)
        case .danger: return (ThusoRole.dangerInk, ThusoRole.dangerTint)
        }
    }
    private var shape: AnyShape {
        typeSize.isAccessibilitySize ? AnyShape(RoundedRectangle(cornerRadius: ThusoRadius.sm, style: .continuous)) : AnyShape(Capsule())
    }

    var body: some View {
        HStack(spacing: ThusoSpacing.space12 / 2) {
            if dot { Circle().fill(colours.ink).frame(width: 6, height: 6).accessibilityHidden(true) }
            Text(text).font(.thuso(.caption, weight: .semibold)).foregroundStyle(colours.ink)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, size == .sm ? ThusoSpacing.space8 : ThusoSpacing.space20 / 2)
        .padding(.vertical, size == .sm ? 2 : ThusoSpacing.space4)
        .background(colours.fill, in: shape)
        .accessibilityElement(children: .combine)
    }
}

/* Live availability, said in words: the label is the thing a reader reads, and the dot beside it is
   decoration. The dot differs by shape as well as colour — offline is a hollow ring — so the three
   states survive a greyscale screen. Busy is the warning ink, because the handoff's lime dot measures
   1.21:1 on white and cannot be seen. */
enum ThusoStatus { case online, busy, offline }

struct ThusoStatusIndicator: View {
    var status: ThusoStatus = .online
    let label: String
    var body: some View {
        HStack(spacing: ThusoSpacing.space8) {
            Group {
                switch status {
                case .online: Circle().fill(ThusoRole.success)
                case .busy: Circle().fill(ThusoRole.warningInk)
                case .offline: Circle().stroke(ThusoRole.mutedForeground, lineWidth: 2)
                }
            }
            .frame(width: ThusoSpacing.space8, height: ThusoSpacing.space8)
            .accessibilityHidden(true)
            Text(label).font(.thuso(.subheadline)).foregroundStyle(ThusoRole.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }
}
