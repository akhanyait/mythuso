import SwiftUI

/* An indeterminate wait, announced — the web's Spinner.tsx.
 *
 * The handoff spins it for as long as the wait lasts. This build refuses a spinner that runs forever,
 * because an endless animation is motion nobody asked for and nobody can stop. So the arc turns once
 * as it arrives, over the enter duration on the shared curve, and then rests; the ring with its one
 * coloured quarter is the familiar mark of a wait without moving. Under Reduce Motion it does not
 * turn at all — removed, not shortened. The tone is a mark, held to 3:1: the handoff's primary and
 * its accent both clear it on either ground. */
enum ThusoSpinnerSize { case sm, md, lg }
enum ThusoSpinnerTone { case primary, accent, current }

struct ThusoSpinner: View {
    var size: ThusoSpinnerSize = .md
    var tone: ThusoSpinnerTone = .primary
    var label = "Loading"
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var turned = false

    private var side: CGFloat {
        switch size {
        case .sm: return ThusoSpacing.space16
        case .md: return ThusoSpacing.space24
        case .lg: return ThusoSpacing.space32
        }
    }
    private var colour: Color {
        switch tone {
        case .primary: return ThusoRole.primary
        case .accent: return ThusoRole.accent
        case .current: return Color.primary
        }
    }

    var body: some View {
        ZStack {
            Circle().stroke(ThusoRole.muted, lineWidth: 2)
            Circle().trim(from: 0, to: 0.25).stroke(colour, style: StrokeStyle(lineWidth: 2, lineCap: .butt))
                .rotationEffect(.degrees(turned || reduceMotion ? 0 : -270))
        }
        .frame(width: side, height: side)
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(ThusoMotion.soft(ThusoMotion.enter)) { turned = true }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
    }
}
