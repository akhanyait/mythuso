import SwiftUI

/* A person's or an organisation's identity — the web's Avatar.tsx. Never a decorative image, and
   never a button on its own: a control that opens a profile wraps it in one. The fallback's initials
   are the primary ink on a primary tint — on dark the handoff's dark accent, because its dark primary
   as words on a tint does not clear 4.5:1.

   The disc grows with the reader's text and past the accessibility sizes it is not drawn at all: the
   person's name is always beside it, and a monogram three times its size beside six lines of wrapped
   name is a decoration that has stopped paying for its space (DesignSystem/Theme.swift's Monogram
   found that first). Hidden from VoiceOver unless the caller names it. */
enum ThusoAvatarSize { case sm, md, lg }

struct ThusoAvatar: View {
    var initials: String = ""
    var image: String?
    var size: ThusoAvatarSize = .md
    var label: String?
    @ScaledMetric(relativeTo: .body) private var scale: CGFloat = 1
    @Environment(\.dynamicTypeSize) private var typeSize

    private var side: CGFloat {
        switch size {
        case .sm: return ThusoSpacing.space32
        case .md: return ThusoSpacing.space40
        case .lg: return ThusoSpacing.space24 * 2
        }
    }

    var body: some View {
        if !typeSize.isAccessibilitySize {
            ZStack {
                if let image {
                    Image(image).resizable().scaledToFill()
                } else {
                    ThusoRole.primaryTint
                    Text(initials).font(.thuso(.caption, weight: .bold)).foregroundStyle(ThusoRole.primaryInk)
                }
            }
            .frame(width: side * scale, height: side * scale)
            .background(ThusoRole.muted)
            .clipShape(Circle())
            .accessibilityHidden(label == nil)
            .accessibilityLabel(label ?? "")
        }
    }
}
