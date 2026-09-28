import SwiftUI

/* The handoff's Button, as a SwiftUI ButtonStyle and a view over it.
 *
 * The web's Button.tsx keeps the handoff's cva variants and sizes by name — primary, accent,
 * secondary, ghost and destructive; sm, md, lg and icon — and so does this, so a screen written
 * against the catalogue reads the same on the phone. The colours are the roles in ThusoRole and
 * nothing else; the radii ThusoRadius; the press wash ThusoRole.pressWash, which lightens the fill
 * on either ground the way ui.css's --ui-press-mix does.
 *
 * Three things differ from the handoff, each for a rule of this build rather than for taste, and
 * each the same departure the web made:
 * - every size is at least 44 points tall (tokens.json#targets.minimum): a health app is used
 *   one-handed in a doorway. The small face keeps its lighter padding and type inside a 44 box.
 * - the destructive button's words are the accent foreground rather than the handoff's white: white
 *   on the orange measures 2.99:1 on light and 2.16:1 on dark (knownFailures), and the dark ink the
 *   handoff already sets on its bright fills reads 5.9:1 and 7.4:1. The button stays orange.
 * - the loading glyph turns once as it arrives and rests, rather than spinning for as long as the
 *   wait lasts: a spinner that runs forever is the one piece of motion this codebase refuses. The
 *   button still says it is busy and cannot be pressed twice.
 *
 * Past the accessibility sizes the shape keeps its corner rather than becoming a pill, so a label
 * that wraps is never cut by a curve — the reasoning CareButton and StatusPill already carried. */
enum ThusoButtonVariant { case primary, accent, secondary, ghost, destructive }
enum ThusoButtonSize { case sm, md, lg, icon }

struct ThusoButtonStyle: ButtonStyle {
    var variant: ThusoButtonVariant = .primary
    var size: ThusoButtonSize = .md
    /// Stretch to the column, which is what a phone's one primary action does.
    var fullWidth = false
    @Environment(\.isEnabled) private var enabled

    init(_ variant: ThusoButtonVariant = .primary, size: ThusoButtonSize = .md, fullWidth: Bool = false) {
        self.variant = variant
        self.size = size
        self.fullWidth = fullWidth
    }

    private var fill: Color {
        switch variant {
        case .primary: return ThusoRole.primary
        case .accent: return ThusoRole.accent
        case .secondary: return ThusoRole.surface
        case .ghost: return .clear
        case .destructive: return ThusoRole.danger
        }
    }
    private var ink: Color {
        switch variant {
        case .primary: return ThusoRole.primaryForeground
        case .accent, .destructive: return ThusoRole.accentForeground
        case .secondary, .ghost: return ThusoRole.foreground
        }
    }
    private var edge: Color { variant == .secondary ? ThusoRole.border : .clear }
    private var radius: CGFloat { size == .sm ? ThusoRadius.sm : ThusoRadius.md }
    private var font: Font {
        switch size {
        case .sm: return ThusoFont.text(ThusoType.caption, weight: .semibold, relativeTo: .footnote)
        case .md, .icon: return ThusoFont.text(ThusoType.body, weight: .semibold, relativeTo: .body)
        case .lg: return ThusoFont.text(ThusoType.cardTitle, weight: .semibold, relativeTo: .headline)
        }
    }
    private var horizontal: CGFloat {
        switch size {
        case .sm: return ThusoSpacing.space12
        case .md: return ThusoSpacing.space16
        case .lg: return ThusoSpacing.space20
        case .icon: return 0
        }
    }
    private var height: CGFloat { size == .lg ? ThusoSpacing.space24 * 2 : 44 }

    func makeBody(configuration: Configuration) -> some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        /* A secondary and a ghost answer a press with the muted ground rather than a wash of the
           fill — the handoff's hover — because a wash of white on white is nothing. */
        let pressed: Color = configuration.isPressed
            ? (variant == .secondary || variant == .ghost ? ThusoRole.muted : ThusoRole.pressWash)
            : .clear
        return configuration.label
            .font(font)
            .lineLimit(nil)
            .multilineTextAlignment(.center)
            .padding(.horizontal, horizontal)
            .padding(.vertical, ThusoSpacing.space8)
            .frame(minWidth: size == .icon ? height : nil,
                   maxWidth: fullWidth ? .infinity : nil,
                   minHeight: height)
            .background(fill, in: shape)
            .overlay(shape.fill(pressed))
            .overlay(shape.stroke(edge, lineWidth: 1))
            .foregroundStyle(ink)
            .opacity(enabled ? 1 : 0.45)
            .contentShape(Rectangle())
            .animation(ThusoMotion.soft(ThusoMotion.quick), value: configuration.isPressed)
    }
}

/// A labelled button with, optionally, a symbol either side and a busy state.
struct ThusoButton: View {
    let title: String
    var variant: ThusoButtonVariant = .primary
    var size: ThusoButtonSize = .md
    var fullWidth = false
    var loading = false
    var leadingSymbol: String?
    var trailingSymbol: String?
    let action: () -> Void

    init(_ title: String, variant: ThusoButtonVariant = .primary, size: ThusoButtonSize = .md, fullWidth: Bool = false,
         loading: Bool = false, leadingSymbol: String? = nil, trailingSymbol: String? = nil, action: @escaping () -> Void) {
        self.title = title
        self.variant = variant
        self.size = size
        self.fullWidth = fullWidth
        self.loading = loading
        self.leadingSymbol = leadingSymbol
        self.trailingSymbol = trailingSymbol
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: ThusoSpacing.space8) {
                if loading {
                    ThusoSpinner(size: .sm, tone: .current)
                } else if let leadingSymbol {
                    Image(systemName: leadingSymbol).font(.thuso(.footnote, weight: .semibold)).accessibilityHidden(true)
                }
                if size != .icon { Text(title).fixedSize(horizontal: false, vertical: true) }
                if !loading, let trailingSymbol {
                    Image(systemName: trailingSymbol).font(.thuso(.footnote, weight: .semibold)).accessibilityHidden(true)
                }
            }
        }
        .buttonStyle(ThusoButtonStyle(variant, size: size, fullWidth: fullWidth))
        .disabled(loading)
        .accessibilityLabel(title)
        .accessibilityValue(loading ? "Loading" : "")
    }
}

/// A square button holding one symbol, named for VoiceOver by the caller.
struct ThusoIconButton: View {
    let symbol: String
    let label: String
    var variant: ThusoButtonVariant = .secondary
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: symbol).font(.thuso(.body, weight: .semibold))
        }
        .buttonStyle(ThusoButtonStyle(variant, size: .icon))
        .accessibilityLabel(label)
    }
}
