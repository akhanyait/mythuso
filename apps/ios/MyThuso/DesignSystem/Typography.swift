import SwiftUI

/* The identity's two typefaces, asked for by role rather than by name.
 *
 * The Lovable handoff of 28 September 2026 sets Outfit for page titles and compact feature headings
 * and Figtree for everything a person has to read carefully, and the Founder decided that day that
 * the handoff's look wins. On the web they arrive as --font-display and --font-sans; here the family
 * names come from the generated TypographyData.swift, so nothing in this app types "Outfit".
 *
 * WHY A TEXT STYLE MAPS TO A SIZE FROM THE SCALE. Every screen was written against the system
 * styles — .footnote four hundred times, .subheadline, .headline — and the handoff states no sizes
 * of its own, so tokens.json keeps the product's one scale (13 to 40). `Font.thuso(_:weight:)` is
 * the bridge: a system style names a role, the role names a step on the scale and a family, and
 * Dynamic Type still applies because every face is asked for `relativeTo` the style it stands in
 * for. Nothing renders below ThusoType.minimumRendered, which is why .caption2 (eleven points on
 * the system) lands on the caption step here rather than on its own.
 *
 * WEIGHTS ARE THE FACES THE OFL SOURCES SHIP. A weight the family is not carried at is the nearest
 * one it is: Outfit has no regular, so a display line asked for at regular is medium, and Figtree
 * has no black, so heavy and black are extra-bold. Static faces rather than the variable file,
 * because a static face resolves by one PostScript name on iOS 17 and a variable axis does not
 * always answer `.weight()` on a custom font. */
enum ThusoFont {
    private static func hundred(_ weight: Font.Weight) -> Int {
        switch weight {
        case .ultraLight: return 100
        case .thin: return 200
        case .light: return 300
        case .regular: return 400
        case .medium: return 500
        case .semibold: return 600
        case .bold: return 700
        case .heavy: return 800
        case .black: return 900
        default: return 400
        }
    }
    /// The PostScript name of a family's face at a weight, clamped to the faces it is carried at.
    static func face(_ family: String, _ weight: Font.Weight) -> String {
        let carried = family == ThusoTypography.display ? ThusoTypography.displayWeights : ThusoTypography.textWeights
        let wanted = hundred(weight)
        let nearest = carried.min { abs($0 - wanted) < abs($1 - wanted) } ?? wanted
        return ThusoTypography.faces["\(family)-\(nearest)"] ?? family
    }
    /// A display face — Outfit — at a step of the scale, scaling with the text style it stands in for.
    static func display(_ size: CGFloat, weight: Font.Weight = .semibold, relativeTo style: Font.TextStyle = .title) -> Font {
        .custom(face(ThusoTypography.display, weight), size: size, relativeTo: style)
    }
    /// A text face — Figtree — at a step of the scale, scaling with the text style it stands in for.
    static func text(_ size: CGFloat, weight: Font.Weight = .regular, relativeTo style: Font.TextStyle = .body) -> Font {
        .custom(face(ThusoTypography.text, weight), size: size, relativeTo: style)
    }

    // The scale, by name, for the places that reach for a step rather than a style.
    static let screenTitle = display(ThusoType.screenTitle, weight: .bold, relativeTo: .largeTitle)
    static let heading = display(ThusoType.heading, relativeTo: .title2)
    static let sectionTitle = display(ThusoType.sectionTitle, relativeTo: .title3)
    static let cardTitle = text(ThusoType.cardTitle, weight: .semibold, relativeTo: .headline)
    static let body = text(ThusoType.body)
    static let caption = text(ThusoType.caption, relativeTo: .footnote)
    static let metric = display(ThusoType.metric, relativeTo: .largeTitle)
    static let metricLarge = display(ThusoType.metricLarge, relativeTo: .largeTitle)
}

extension Font {
    /* A system text style, on the identity. The step and the family each style resolves to:
       largeTitle and title are the screen title in Outfit; title2 the heading and title3 the section
       title, both Outfit; headline the card title in Figtree semibold; body, callout and subheadline
       the body step; footnote, caption and caption2 the caption step, which is the floor. */
    static func thuso(_ style: Font.TextStyle, weight: Font.Weight? = nil) -> Font {
        switch style {
        case .largeTitle: return ThusoFont.display(ThusoType.screenTitle, weight: weight ?? .bold, relativeTo: .largeTitle)
        case .title: return ThusoFont.display(ThusoType.screenTitle, weight: weight ?? .semibold, relativeTo: .title)
        case .title2: return ThusoFont.display(ThusoType.heading, weight: weight ?? .semibold, relativeTo: .title2)
        case .title3: return ThusoFont.display(ThusoType.sectionTitle, weight: weight ?? .semibold, relativeTo: .title3)
        case .headline: return ThusoFont.text(ThusoType.cardTitle, weight: weight ?? .semibold, relativeTo: .headline)
        case .body: return ThusoFont.text(ThusoType.body, weight: weight ?? .regular, relativeTo: .body)
        case .callout: return ThusoFont.text(ThusoType.body, weight: weight ?? .regular, relativeTo: .callout)
        case .subheadline: return ThusoFont.text(ThusoType.body, weight: weight ?? .regular, relativeTo: .subheadline)
        case .footnote: return ThusoFont.text(ThusoType.caption, weight: weight ?? .regular, relativeTo: .footnote)
        case .caption: return ThusoFont.text(ThusoType.caption, weight: weight ?? .regular, relativeTo: .caption)
        case .caption2: return ThusoFont.text(ThusoType.caption, weight: weight ?? .regular, relativeTo: .caption2)
        @unknown default: return ThusoFont.text(ThusoType.body, weight: weight ?? .regular, relativeTo: .body)
        }
    }
}

extension ThusoFont {
    /// A display face at a size the caller has already scaled with @ScaledMetric — never scaled twice.
    static func displayFixed(_ size: CGFloat, weight: Font.Weight = .semibold) -> Font {
        .custom(face(ThusoTypography.display, weight), fixedSize: size)
    }
    /// A text face at a size the caller has already scaled.
    static func textFixed(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .custom(face(ThusoTypography.text, weight), fixedSize: size)
    }
}
