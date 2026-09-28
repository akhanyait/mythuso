import SwiftUI
import UIKit

/* THE SEMANTIC ROLES, LIGHT AND DARK, AS ONE COLOUR EACH.
 *
 * tokens.json#semantic is the Lovable handoff's theme — nineteen roles, each with a light and a
 * dark value — generated into ThusoSemantic.Light and ThusoSemantic.Dark. A screen that read
 * ThusoSemantic.Light.foreground would be a screen that ignores the reader's appearance setting,
 * and a screen that threaded @Environment(\.colorScheme) through every view to choose would be
 * five hundred decisions where one is enough. So each role is one dynamic colour here, resolved
 * by UIKit against the trait collection it is drawn in: the environment's colour scheme, including
 * a `.preferredColorScheme` set above it, is what decides. iOS is the first platform to read the
 * dark values; the web emits them and, as tokens.json says, nothing there reads them yet.
 *
 * THE FOUR INKS, AND WHY THEY ARE HERE AND NOT IN THE TOKENS. The handoff's orange (danger, coral),
 * lime (warning, highlight) and green (success, info, accent) are fills and marks on a light ground
 * and cannot carry words there: tokens.json#contrast.knownFailures parks the orange at 2.99:1 and
 * the lime at 1.21:1 on white, and the green clears only the 3:1 non-text floor. On a dark ground
 * every one of them reads. apps/web/src/ui/ui.css made the same four departures and named them
 * --ui-danger-ink, --ui-warning-ink, --ui-success-ink and --ui-primary-ink: on light the measured
 * replacement the knownFailures row names (the build's refusal red, its amber ink, its teal ink,
 * the primary itself), on dark the handoff's own colour. They are mappings between tokens that
 * already exist, and they belong in tokens.json#semantic as roles of their own so all three platforms
 * get one answer; until then they live here, beside the roles, as the web's live in ui.css.
 *
 * A TINT IS THE ROLE AT AN OPACITY, never a flattened colour of its own, so a badge's ground darkens
 * with the card it sits on in dark mode the way the web's color-mix does. */
enum ThusoRole {
    private static func dynamic(_ light: Color, _ dark: Color) -> Color {
        Color(uiColor: UIColor { traits in traits.userInterfaceStyle == .dark ? UIColor(dark) : UIColor(light) })
    }

    static let background = dynamic(ThusoSemantic.Light.background, ThusoSemantic.Dark.background)
    static let foreground = dynamic(ThusoSemantic.Light.foreground, ThusoSemantic.Dark.foreground)
    static let surface = dynamic(ThusoSemantic.Light.surface, ThusoSemantic.Dark.surface)
    static let surfaceRaised = dynamic(ThusoSemantic.Light.surfaceRaised, ThusoSemantic.Dark.surfaceRaised)
    static let primary = dynamic(ThusoSemantic.Light.primary, ThusoSemantic.Dark.primary)
    static let primaryForeground = dynamic(ThusoSemantic.Light.primaryForeground, ThusoSemantic.Dark.primaryForeground)
    static let accent = dynamic(ThusoSemantic.Light.accent, ThusoSemantic.Dark.accent)
    static let accentForeground = dynamic(ThusoSemantic.Light.accentForeground, ThusoSemantic.Dark.accentForeground)
    static let muted = dynamic(ThusoSemantic.Light.muted, ThusoSemantic.Dark.muted)
    static let mutedForeground = dynamic(ThusoSemantic.Light.mutedForeground, ThusoSemantic.Dark.mutedForeground)
    static let success = dynamic(ThusoSemantic.Light.success, ThusoSemantic.Dark.success)
    static let warning = dynamic(ThusoSemantic.Light.warning, ThusoSemantic.Dark.warning)
    static let danger = dynamic(ThusoSemantic.Light.danger, ThusoSemantic.Dark.danger)
    static let info = dynamic(ThusoSemantic.Light.info, ThusoSemantic.Dark.info)
    static let highlight = dynamic(ThusoSemantic.Light.highlight, ThusoSemantic.Dark.highlight)
    static let coral = dynamic(ThusoSemantic.Light.coral, ThusoSemantic.Dark.coral)
    static let border = dynamic(ThusoSemantic.Light.border, ThusoSemantic.Dark.border)
    static let input = dynamic(ThusoSemantic.Light.input, ThusoSemantic.Dark.input)
    static let ring = dynamic(ThusoSemantic.Light.ring, ThusoSemantic.Dark.ring)

    // The four inks — ui.css's departures, made once for every SwiftUI screen.
    static let dangerInk = dynamic(ThusoTheme.danger, ThusoSemantic.Dark.danger)
    static let warningInk = dynamic(ThusoTheme.mangoInk, ThusoSemantic.Dark.warning)
    static let successInk = dynamic(ThusoTheme.tealInk, ThusoSemantic.Dark.success)
    static let primaryInk = dynamic(ThusoSemantic.Light.primary, ThusoSemantic.Dark.accent)

    /* A field's resting edge is the muted ink rather than the handoff's --color-input: a text field's
       boundary is how a reader finds it, SC 1.4.11 holds it to 3:1, and the handoff's input colour
       measures 1.3:1 on a card. ui.css, "Fields". */
    static let inputEdge = mutedForeground

    /* A press lightens the fill on either ground. The web mixes the fill with transparent on light and
       with the foreground on dark (its --ui-press-mix), because mixing towards transparent darkens a
       dark fill under its dark words; a wash of the surface on light and of the foreground on dark is
       the same answer as an overlay. */
    static let pressWash = dynamic(ThusoSemantic.Light.surface, ThusoSemantic.Dark.foreground).opacity(0.10)

    // Tints: the role at the opacity ui.css mixes it at.
    static let primaryTint = primary.opacity(0.10)
    static let accentTint = accent.opacity(0.15)
    static let successTint = success.opacity(0.15)
    static let warningTint = warning.opacity(0.20)
    static let dangerTint = danger.opacity(0.12)
    static let infoTint = info.opacity(0.15)

    /// The colour every shadow is cast in: light.foreground, as tokens.json#elevation writes it.
    static let shadow = ThusoSemantic.Light.foreground
}

/* Elevation is one shadow — tokens.json#elevation's card (0 1 2 at 6 %) or raised (0 8 24 at 10 %) —
   and never two at once. */
extension View {
    func thusoShadow(raised: Bool = false) -> some View {
        shadow(color: ThusoRole.shadow.opacity(raised ? 0.10 : 0.06), radius: raised ? 12 : 1, x: 0, y: raised ? 8 : 1)
    }
}

/* THE NIGHT GROUND. A handful of surfaces are dark on purpose in both appearances — the one card a
   screen leads with when something is live, the clinical deck, the ground GilbertOne's sphere is lit
   against. In light they are the primary; in dark the primary is the handoff's green, and a whole
   panel of it would be the loudest thing in the app, so they take the raised surface instead and
   their ink is the foreground. `night` and `onNight` are that pair, so a dark card is the same
   decision in both appearances rather than two. `nightAccent` is the accent as a word on it: the
   brand mint the assistant already measured on the brand ink, and on dark the handoff's accent. */
extension ThusoRole {
    static let night = dynamicPublic(ThusoSemantic.Light.primary, ThusoSemantic.Dark.surfaceRaised)
    static let onNight = dynamicPublic(ThusoSemantic.Light.primaryForeground, ThusoSemantic.Dark.foreground)
    static let nightAccent = dynamicPublic(ThusoTheme.brandMint, ThusoSemantic.Dark.accent)
    /// The quiet ink on the night ground: the same alpha every muted label on all three platforms takes.
    static let onNightQuiet = onNight.opacity(ThusoOpacity.charcoalMuted)
    fileprivate static func dynamicPublic(_ light: Color, _ dark: Color) -> Color {
        Color(uiColor: UIColor { traits in traits.userInterfaceStyle == .dark ? UIColor(dark) : UIColor(light) })
    }
}

/* A tint composited over a ground, resolved in the appearance it is drawn in. The clinical deck
   washes its sheets with the accent at six per cent and its refusal sheet with the coral at eight;
   a wash mixed once from the light values would stay light-mode arithmetic on a dark screen, so the
   mix is done per trait collection, and it is done here, where colour arithmetic lives, rather than
   in a screen. */
extension ThusoRole {
    static func wash(_ tint: Color, _ amount: Double, over ground: Color) -> Color {
        Color(uiColor: UIColor { traits in
            var (tr, tg, tb, ta) = (CGFloat(0), CGFloat(0), CGFloat(0), CGFloat(0))
            var (gr, gg, gb, ga) = (CGFloat(0), CGFloat(0), CGFloat(0), CGFloat(0))
            UIColor(tint).resolvedColor(with: traits).getRed(&tr, green: &tg, blue: &tb, alpha: &ta)
            UIColor(ground).resolvedColor(with: traits).getRed(&gr, green: &gg, blue: &gb, alpha: &ga)
            let a = CGFloat(amount)
            return UIColor(red: gr + (tr - gr) * a, green: gg + (tg - gg) * a, blue: gb + (tb - gb) * a, alpha: 1)
        })
    }
}
