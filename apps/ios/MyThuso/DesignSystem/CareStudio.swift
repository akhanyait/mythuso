import SwiftUI

/* THE CARE STUDIO, AS SWIFTUI.
 *
 * The founder built a prototype, refined it, and on 12 September said we were finally aligned. What
 * he pointed at for the phones is a cream ground, a very large headline in two tones, lime accent
 * blocks and lime pill actions with ink labels, and a near-black card carrying the one thing that is
 * live right now. The palette landed first — `studioPaper`, `studioNight`, `studioInk`,
 * `studioInkDeep`, `studioLime`, `studioLilac`, `studioPeach`, `studioLine` in tokens.json, with
 * every pair measured. This file is the four shapes that palette is spent on, so that a screen
 * cannot spell one of them slightly differently from the screen next to it.
 *
 * WHAT IS NOT HERE, AND WHY.
 *
 * No second typeface. The 10 September cut of this direction set its accent line in a serif italic,
 * and `typography.families.display` in tokens.json now says in as many words why that was dropped:
 * *a decorative serif across the headlines of a clinical product reads as an editorial about health
 * rather than a tool for managing one*. So the two tones of the headline are two grounds — ink on
 * paper, then ink on a lime block — rather than two faces. The block is the accent; the words never
 * change face.
 *
 * No decorative motion, no orbiting sparkle, no pause control for either. That cut had an infinite
 * rotation with a play/pause button beside it, which is two problems: a forever-changing box, and a
 * control whose only job is to stop the thing we chose to start. The animation here is the one the
 * platform already gives a state change, and it is off under Reduce Motion.
 *
 * `studioLime` IS A FILL AND NEVER A WORD ON A LIGHT GROUND. It measures 1.05:1 against paper, so
 * no such pair is declared and one would fail the build. Everything below spends it as a ground
 * with `studioInk` or `studioInkDeep` on it — both declared — or as a word on `studioNight`, which
 * is the one pair in this palette where the accent is allowed to be read. */

// MARK: - Which ground a thing is standing on

/* A metric strip built from a ForEach over a contract has nowhere to put an argument that is the
   same for every one of its figures, and a card is the only thing that knows what colour it is. So
   the card says, once, and ThusoMetric reads it. StudioNightCard is the only thing that sets this;
   nothing else may, because nothing else is dark. */
private struct StudioNightKey: EnvironmentKey { static let defaultValue = false }
extension EnvironmentValues {
    var onStudioNight: Bool {
        get { self[StudioNightKey.self] }
        set { self[StudioNightKey.self] = newValue }
    }
}

// MARK: - The headline

/* Two lines, two grounds, one voice.
 *
 * The lead line is what the reader is — a greeting, or the framing of the role whose workspace this
 * is. The accent line is what the product is for, and it is `studioOlive`, the token that exists for
 * this line and is declared against the ground at 4.98:1 and against a white card.
 *
 * IT WAS INK ON A LIME BLOCK FIRST, AND THE SCREENSHOT IS WHY IT IS NOT. A full-width lime bar under
 * the greeting is the loudest object on the screen, on every screen carrying a headline, which is the
 * opposite of the rule the rest of this pass spends its time enforcing: one lime object per card,
 * and it is the thing you press. Two ink tones say the same thing quietly and give the accent back to
 * the button and the tile. The tokens settled it independently — a colour meant to sit on lime would
 * have been declared against lime, and studioOlive is declared against paper.
 *
 * SIZE, AND THE POINT AT WHICH IT STOPS. `metricLarge` is 40 and it is the largest step the type
 * scale declares; it grows with the reader like everything else. Past the accessibility sizes it
 * drops to `screenTitle`, because a display line at forty points is already nine characters to a
 * line on a 390-point phone and at three times that it is two — a headline set one word per line
 * has stopped being a headline and become a column of words. The step down is still scaled, so the
 * string still grows with the setting; it simply grows from a smaller start. That is the same
 * reasoning StatusPill and NavPillLabel use when they stop being capsules.
 *
 * One element to VoiceOver, announced as a heading. Read as three it was a greeting, then a slogan,
 * then a sentence, with no indication that the three were one thing. */
struct StudioHeadline: View {
    let lead: String
    let accent: String
    var detail: String = ""
    @Environment(\.dynamicTypeSize) private var typeSize
    @ScaledMetric(relativeTo: .largeTitle) private var display: CGFloat = ThusoType.metricLarge
    @ScaledMetric(relativeTo: .largeTitle) private var displayCompact: CGFloat = ThusoType.screenTitle
    private var size: CGFloat { typeSize.isAccessibilitySize ? displayCompact : display }

    var body: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(lead)
                    .font(.system(size: size, weight: .semibold))
                    .foregroundStyle(ThusoTheme.charcoal)
                    .fixedSize(horizontal: false, vertical: true)
                Text(accent)
                    .font(.system(size: size, weight: .semibold))
                    .foregroundStyle(ThusoTheme.studioOlive)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if !detail.isEmpty {
                Text(detail)
                    .font(.subheadline)
                    .foregroundStyle(ThusoTheme.studioInkMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(detail.isEmpty ? "\(lead) \(accent)" : "\(lead) \(accent). \(detail)")
        .accessibilityAddTraits(.isHeader)
    }
}

// MARK: - The card for the one thing that is live

/* The prototype gives exactly one near-black card to a phone screen, and it carries whatever is
   happening now: the visit somebody has already arranged, or the count of what is waiting for the
   clinician whose workspace this is. Everything else on the screen is paper, white or a hairline.
   That is the whole hierarchy, and it is why the screen has a subject.

   A hairline would be noise on a shape this dark, so there is none, and there is no shadow either:
   the card is separated from the ground by fourteen stops of luminance. */
struct StudioNightCard<Content: View>: View {
    var padding: CGFloat = ThusoSpacing.space20
    var spacing: CGFloat = ThusoSpacing.space16
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: spacing) { content }
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(NightPanel())
            .clipShape(RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous))
            .environment(\.onStudioNight, true)
    }
}

/* The eyebrow on a night card: the accent, as a word, on the one ground where it is allowed to be
   one. `studioLime` on `studioNight` is 13.31:1 and it is a declared pair. */
struct StudioEyebrow: View {
    let text: String
    var body: some View {
        Text(text.uppercased())
            .thusoFont(ThusoType.caption, weight: .semibold)
            .tracking(1.1)
            .foregroundStyle(ThusoTheme.studioLime)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityLabel(text)
    }
}

/* Text on the night card. Two weights, and neither of them is a grey: `studioPaper` is the declared
   ink for this ground and the quiet one is that same paper at the muted opacity, which composites
   to #C8CBC6 and reads 9.04:1. A flattened grey would stop following the card if the card ever
   changes; an alpha has no choice but to follow it. */
extension View {
    func studioNightInk(quiet: Bool = false) -> some View {
        foregroundStyle(quiet ? ThusoTheme.studioPaper.opacity(ThusoOpacity.charcoalMuted)
                              : ThusoTheme.studioPaper)
    }
}
