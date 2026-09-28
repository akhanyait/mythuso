import SwiftUI

/* One coherent object or tool, framed — the handoff's Card, as the web's Card.tsx keeps it.
 *
 * Three variants: default sits on the card shadow, elevated on the raised one, and interactive
 * answers a press with its border in the accent — never two shadows at once, since elevation is one
 * shadow in this system. A surface fill, a border, the large radius. An interactive card is still a
 * container: what a person presses inside it is a ThusoButton or a NavigationLink the caller puts
 * there, and the card marks the state rather than owning the gesture.
 *
 * WHAT CHANGED FROM CareCard AND SurfacePanel. Both drew "a hairline and a lighter fill, never a
 * shadow", which was the argument of the previous generation's design language. The handoff draws
 * one soft shadow under every card and a raised one under the card a screen leads with, and its look
 * wins; the shadow is tokens.json#elevation's, cast in the light foreground at 6 % or 10 %. */
enum ThusoCardVariant { case standard, elevated, interactive }
enum ThusoCardPadding { case none, sm, md, lg }

struct ThusoCard<Content: View>: View {
    var variant: ThusoCardVariant = .standard
    var padding: ThusoCardPadding = .md
    /// The interactive variant's pressed or current state, so the border says so.
    var active = false
    var spacing: CGFloat = ThusoSpacing.space12
    @ViewBuilder var content: Content

    private var inset: CGFloat {
        switch padding {
        case .none: return 0
        case .sm: return ThusoSpacing.space16
        case .md: return ThusoSpacing.space20
        case .lg: return ThusoSpacing.space24
        }
    }
    private var shape: RoundedRectangle { RoundedRectangle(cornerRadius: ThusoRadius.lg, style: .continuous) }

    var body: some View {
        VStack(alignment: .leading, spacing: spacing) { content }
            .padding(inset)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(ThusoRole.surface, in: shape)
            .overlay(shape.stroke(variant == .interactive && active ? ThusoRole.accent : ThusoRole.border, lineWidth: 1))
            .thusoShadow(raised: variant == .elevated)
            .foregroundStyle(ThusoRole.foreground)
    }
}

/// The head of a card: its title in the display face and, optionally, a line about it, over a rule.
struct ThusoCardHeader: View {
    let title: String
    var description: String?
    var body: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
            ThusoCardTitle(title)
            if let description { ThusoCardDescription(description) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, ThusoSpacing.space20).padding(.vertical, ThusoSpacing.space16)
        .overlay(alignment: .bottom) { ThusoDivider() }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

struct ThusoCardTitle: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        Text(text).font(ThusoFont.sectionTitle).foregroundStyle(ThusoRole.foreground)
            .fixedSize(horizontal: false, vertical: true)
    }
}

struct ThusoCardDescription: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        Text(text).font(.thuso(.subheadline)).foregroundStyle(ThusoRole.mutedForeground)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// The body of a card that has a header: the same inset the header has, so the two line up.
struct ThusoCardContent<Content: View>: View {
    var spacing: CGFloat = ThusoSpacing.space12
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: spacing) { content }
            .padding(ThusoSpacing.space20)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}
