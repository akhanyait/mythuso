import SwiftUI

/// A rule in the border colour, one point, either way — the web's Divider.tsx.
struct ThusoDivider: View {
    var vertical = false
    var body: some View {
        Rectangle().fill(ThusoRole.border)
            .frame(width: vertical ? 1 : nil, height: vertical ? nil : 1)
            .frame(maxWidth: vertical ? nil : .infinity, maxHeight: vertical ? .infinity : nil)
            .accessibilityHidden(true)
    }
}
