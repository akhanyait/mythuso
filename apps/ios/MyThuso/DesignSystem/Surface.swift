import SwiftUI

/* The dashboard language, as SwiftUI.
 *
 * docs/DESIGN-LANGUAGE.md is the direction and apps/web/src/surface/ is where it was first built.
 * iOS had the palette — DesignSystem/Tokens.swift carries every sage, every grey and the glass
 * floor — and none of the shapes, which is why the two apps looked like relatives rather than one
 * product. The colours were never the recognisable part. These four are:
 *
 *   1. A metric is a status chip floating ABOVE a large thin numeral, with a small label beneath.
 *      This app did the exact inverse on every card — a small label above a bold figure — and that
 *      inversion is most of the difference. Light weight, monospaced digits, so a column of
 *      readings lines up on the decimal instead of shuffling as the values change.
 *   2. Navigation is a pill row: symbol, label, and a circular arrow at the trailing edge that
 *      inverts on the row you are on. The circle is what makes the selected row read as a place
 *      you are rather than a button you could press.
 *   3. Separation is a hairline and a lighter fill, never a shadow. Generous corner radii.
 *   4. The accent is a fill and never a label. That rule outlived the accent it was written for:
 *      it was teal, then sage, and it is `studioLime` now, which measures 1.05:1 on the paper ground
 *      and so may be a word on nothing but `studioNight`. Everything read on a light ground is
 *      charcoal, which clears 15.9:1 on paper and 15.3:1 on the lime plate.
 *
 * GLASS, AND THE FLOOR RULE. A translucent surface has no colour of its own — it is whatever is
 * behind it, tinted — so a contrast figure measured against it is a guess about where the panel
 * happens to be sitting. Every glass surface in this product declares a floor: `glassFloor`, the
 * composite of the tint over the darkest point the ground is allowed to reach, and every contrast
 * pair in tokens.json is measured against that. On iOS the material is far cheaper than the web's
 * backdrop-filter, so glass is affordable — but the rule is a product rule and not a web one, and
 * it has an iOS spelling: with Reduce Transparency on, a material must resolve to the floor colour
 * rather than to whatever UIKit picks. That is not a degraded version. It is precisely the colour
 * every ratio was computed against.
 *
 * Glass is for things that float. A navigation bar, a sheet, a strip pinned over content. Not every
 * card — a screen of frosted cards is a screen with no hierarchy and a slow scroll, and it may
 * never sit on top of text.
 *
 * Nothing in this file knows anything about health. It is shape only. */

// MARK: - The luminous ground

/* THE GROUND IS PAPER NOW.
 *
 * It was a mesh of three pale tints — auroraWarm, auroraCool, auroraSage — drawn so that a frosted
 * panel had something to refract, because glass over a flat colour reads as a grey card.
 *
 * The Care Studio generation the founder chose on 12 September has one ground and it is `studioPaper`,
 * a cream. A mesh of three tints under it would be the old palette showing through the new one, which
 * is the same mistake the sage ramp made when it kept a blue-black gradient from the indigo design.
 *
 * So: paper, with a single soft highlight of white rather than three of anything. Glass still has a
 * gradient to refract and the ground is one colour rather than three. The contrast arithmetic gets
 * easier rather than harder — every point on this ground is at least as light as `mist`, which is
 * what every charcoal pair in tokens.json was measured against, and `glassFloor` is the tint over the
 * darkest point the ground may reach, so a lighter ground makes that floor conservative rather than
 * optimistic. Nothing that was declared stops being true. */
struct StudioGround: View {
    var body: some View {
        GeometryReader { geo in
            let span = max(geo.size.width, geo.size.height)
            ZStack {
                ThusoTheme.studioPaper
                RadialGradient(colors: [ThusoTheme.surface.opacity(0.85), ThusoTheme.surface.opacity(0)],
                               center: UnitPoint(x: 0.85, y: 0), startRadius: 0, endRadius: span * 0.7)
            }
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }
}

extension View {
    /// The ground every screen stands on. One call so a screen cannot invent its own.
    func thusoGround() -> some View { background(StudioGround()) }
}

/* THE DARK HERO, AND WHY IT STOPPED BEING A GRADIENT.
 *
 * Three panels carry white text on a dark ground — the Thuso Pass promo on Home, the passport
 * header, and the booking summary. All three were `LinearGradient(colors: [ink, charcoal])`, and
 * `ink` is the last survivor of the retired slate ramp.
 *
 * The obvious fix is a second dark value, and the palette has none: the sage ramp's darkest,
 * `sageSlate`, measures 5.89 as text on white, which is nowhere near dark enough to be the far end
 * of a dark gradient. So the question was whether these heroes need one, and measuring the old one
 * answered it. `ink` #0F172A has a relative luminance of 0.0088 and `charcoal` #1C1C1C has 0.0116.
 * That is a difference of under three thousandths — invisible as depth. What the eye was actually
 * reading across that ramp was not light, it was *hue*: a blue-black resolving into a neutral one.
 * A blue cast is the indigo design's signature, and this palette deliberately has no blue in it.
 * The gradient was not carrying depth; it was carrying the old brand, faintly.
 *
 * So the second dark value is not needed and is not requested. What replaces it is the ground's own
 * construction, inverted: StudioGround is a flat tint with one soft radial highlight over it, and
 * this is a flat dark with one soft radial highlight over it. Same grammar, opposite polarity, one
 * token. A flat black rectangle 150 points tall — which is the other obvious answer — would have
 * been the same flatness this product already rejected in its corner radii.
 *
 * THE DARK IS `studioNight` RATHER THAN `charcoal`. On a cream ground a neutral black panel reads
 * as a hole cut in the paper; the Care Studio generation's dark is #172B2B, which shares the
 * ground's warmth and is the one token in the palette declared to carry both `studioPaper` and
 * `studioLime` as words. It is what the prototype's phone frames use for the one thing that is
 * live right now, and it is the only place in this palette an accent may be a word at all.
 *
 * MEASURED, NOT EYEBALLED, AND THIS IS WHY IT IS A HIGHLIGHT RATHER THAN AN ALPHA ON THE PANEL.
 * A panel that is dark-at-an-alpha lets the pale ground through, so the colour under the text is
 * wherever the panel happens to be sitting — which is precisely the guess `glassFloor` exists to
 * stop, and it is worse here because the ground is light and the text is not. This panel is fully
 * opaque at every point. The highlight is `surface` at 10%, so the palest point on it composites to
 * #2E4040, where `studioPaper` reads 10.28:1 against 13.95:1 at the darkest and `studioLime` reads
 * 9.80 against 13.31 — all four clear AA, and there is no point on the panel where the arithmetic
 * depends on what is behind it. */
struct NightPanel: View {
    var body: some View {
        GeometryReader { geo in
            let span = max(geo.size.width, geo.size.height)
            ZStack {
                ThusoTheme.studioNight
                RadialGradient(colors: [ThusoTheme.surface.opacity(0.10), ThusoTheme.surface.opacity(0)],
                               center: UnitPoint(x: 0.12, y: 0.02), startRadius: 0, endRadius: span * 0.9)
            }
        }
        .accessibilityHidden(true)
    }
}

// MARK: - Glass

/* The material, with its floor. `raised` is the top edge highlight — one hairline of white is most
   of what makes a panel read as glass rather than as a pale card, and it carries no text. */
struct Frosted: ViewModifier {
    var radius: CGFloat = ThusoRadius.panel
    var edge = true
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        content
            .background {
                if reduceTransparency {
                    shape.fill(ThusoTheme.glassFloor)
                } else {
                    shape.fill(.ultraThinMaterial)
                }
            }
            .overlay {
                shape.stroke(ThusoTheme.studioLine, lineWidth: 1)
                    .overlay(alignment: .top) {
                        if edge && !reduceTransparency {
                            LinearGradient(colors: [ThusoTheme.glassEdge.opacity(0),
                                                    ThusoTheme.glassEdge.opacity(0.7),
                                                    ThusoTheme.glassEdge.opacity(0)],
                                           startPoint: .leading, endPoint: .trailing)
                                .frame(height: 1)
                                .padding(.horizontal, radius / 2)
                        }
                    }
            }
            .clipShape(shape)
    }
}
extension View {
    func frosted(radius: CGFloat = ThusoRadius.panel, edge: Bool = true) -> some View {
        modifier(Frosted(radius: radius, edge: edge))
    }
}

// MARK: - A metric

/// How much a panel is meant to matter, and it is the same three weights the web has.
enum PanelTone { case lead, plain, quiet }

/* A number with its standing above it and its name below.
 *
 * The figure is set in a light weight with monospaced digits at the type scale's `metric` step, and
 * @ScaledMetric grows it with the reader — a numeral frozen at 32 points is a numeral somebody who
 * turned their text up cannot read, and it is the one string on the screen they came for.
 *
 * The chip is a word as well as a fill, always: colour is never the only difference between a
 * reading inside its range and one outside it. */
struct ThusoMetric: View {
    let value: String
    var unit: String?
    /// Leading, for the one case where the unit is written first: R 598, never 598 R.
    var prefix: String?
    let label: String
    var chip: String?
    /// Fills the chip charcoal. For the value on a screen that is out of range.
    var flagged = false
    @ScaledMetric(relativeTo: .largeTitle) private var figure: CGFloat = ThusoType.metric
    @ScaledMetric(relativeTo: .footnote) private var affix: CGFloat = ThusoType.cardTitle
    /* The figures moved onto the night card and took their colours with them. A metric asked for
       charcoal on every ground it had ever stood on, and charcoal on `studioNight` is 1.6:1 — the
       strip would have been there in the layout and gone in the screenshot. Read from the
       environment rather than passed, because the thing that knows is the card, and a strip built
       from a ForEach over a contract has nowhere to put an argument that is the same for all of
       them. StudioNightCard is the only thing that sets it. */
    @Environment(\.onStudioNight) private var onNight
    private var ink: Color { onNight ? ThusoTheme.studioPaper : ThusoTheme.charcoal }
    var body: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
            if let chip {
                MetricChip(text: chip, tone: onNight ? (flagged ? .flaggedOnNight : .onDark)
                                                     : (flagged ? .filled : .neutral))
            }
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                if let prefix {
                    Text(prefix).font(.system(size: affix, weight: .regular)).foregroundStyle(ink)
                }
                Text(value)
                    .font(.system(size: figure, weight: .light).monospacedDigit())
                    .foregroundStyle(ink)
                if let unit {
                    Text(unit).font(.system(size: affix, weight: .regular)).foregroundStyle(ink)
                }
            }
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            /* The ink, muted by opacity rather than by a grey of its own. A metric can sit on white,
               on the palest sage or on the night card, and a fixed grey that reads on one does not
               read on the others — which is exactly what "an accent is a fill and never a label" is
               about. `studioPaper` at 78% over the night composites to #C8CBC6 and reads 9.04:1. */
            Text(label).font(.footnote).foregroundStyle(ink.opacity(ThusoOpacity.charcoalMuted))
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label), \(prefix ?? "")\(value) \(unit ?? "")\(chip.map { ", \($0)" } ?? "")")
    }
}

/* THERE IS ONE CHIP.
 *
 * There were two. `StatusPill` painted a teal, an amber, a sky-blue and a grey; `MetricChip`
 * painted charcoal on white; and several screens carried both, three inches apart, so a reader had
 * to learn two vocabularies to read one card. Worse, the first of them tinted everything: a nurse
 * whose checks are all verified got a teal chip, a submission in review got a blue one, and by the
 * time every row on a screen was coloured the colour had stopped saying anything.
 *
 * So the rule is now the design language's rule, in code rather than in a paragraph: A CHIP IS
 * NEUTRAL UNLESS SOMETHING IS WRONG. `attention` and `refused` are the only two tones that carry a
 * hue, and they are spent on a severity, a refusal, or a value outside its range — the three things
 * a reader has to be able to find without reading. Everything that is merely true is charcoal on
 * white, and the word on it is what distinguishes it: "In review" and "Verified" are two different
 * sentences before they are two different colours, and a chip that had only the colour would fail
 * anybody reading it in greyscale or with a colour vision deficiency.
 *
 * A pill until the words no longer fit on one line, then a rounded chip — a capsule's ends curve in
 * by half its height, and at the accessibility sizes that eats the first and last word of a wrapped
 * status. `.footnote` rather than `.caption2`: the type scale's floor is 13 points and nothing in
 * this product renders below it, including a status somebody is meant to act on. */
enum ChipTone {
    /// True, and nothing is wrong with it. The overwhelming majority.
    case neutral
    /// Nobody has done this yet. Recessed rather than tinted — an absence is not a warning.
    case quiet
    /// Something needs looking at: expiring, conflicted, out of range, a written reason owed.
    case attention
    /// Refused, lapsed, declined, out of date.
    case refused
    /// On a dark ground, where the only ink that reads is white.
    case onDark
    /// The one value on a screen that is being pointed at. Charcoal fill, white word.
    case filled
    /* `filled` on the night card, which is where the accent finally gets to be a fill behind a
       word. A charcoal chip on a near-black card is a chip nobody can find, and the flagged one is
       the single figure on the strip a reader has to find without reading — so it takes `studioLime`
       with `studioInkDeep` on it, the pair tokens.json declares for the heavier label on an accent
       fill. It is the one lime object on the card, which is the whole of why it works. */
    case flaggedOnNight

    /// (ink, fill, edge). Charcoal clears 17.04:1 on surface and 13.53:1 on cloud; mangoInk 6.22
    /// and danger 5.77 on their own washes; white 12.6:1 on the charcoal fill.
    var colours: (Color, Color, Color) {
        switch self {
        case .neutral: return (ThusoTheme.charcoal, ThusoTheme.surface, ThusoTheme.studioLine)
        case .quiet: return (ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted), ThusoTheme.cloud, .clear)
        case .attention: return (ThusoTheme.mangoInk, ThusoTheme.mangoSoft, ThusoTheme.mangoInk.opacity(0.24))
        case .refused: return (ThusoTheme.danger, ThusoTheme.dangerSoft, ThusoTheme.danger.opacity(0.3))
        case .onDark: return (ThusoTheme.surface, ThusoTheme.surface.opacity(0.16), ThusoTheme.surface.opacity(0.3))
        case .filled: return (ThusoTheme.studioPaper, ThusoTheme.studioNight, ThusoTheme.studioNight)
        case .flaggedOnNight: return (ThusoTheme.studioInkDeep, ThusoTheme.studioLime, ThusoTheme.studioLime)
        }
    }

    /* The tone vocabulary the contracts speak. Vetting, capture, dispensing and the household all
       carry a tone string in their own data, and those strings are not this app's to rename — so
       they are read here, once, and the two that used to mean "everything is fine, in teal" and
       "something is happening, in blue" now both resolve to the neutral chip. */
    init(_ contractTone: String) {
        switch contractTone {
        case "amber": self = .attention
        case "danger": self = .refused
        case "quiet": self = .quiet
        case "light": self = .onDark
        default: self = .neutral
        }
    }
}

struct MetricChip: View {
    let text: String
    var tone: ChipTone = .neutral
    /// Kept because a metric asks for it by name: the one value on a card that is out of range.
    init(text: String, flagged: Bool) { self.init(text: text, tone: flagged ? .filled : .neutral) }
    init(text: String, tone: ChipTone = .neutral) { self.text = text; self.tone = tone }
    @Environment(\.dynamicTypeSize) private var typeSize
    private var shape: AnyShape {
        typeSize.isAccessibilitySize
            ? AnyShape(RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous))
            : AnyShape(Capsule())
    }
    var body: some View {
        let (ink, fill, edge) = tone.colours
        Text(text).font(.footnote.weight(.medium))
            .foregroundStyle(ink)
            .padding(.horizontal, ThusoSpacing.space8).padding(.vertical, 3)
            .fixedSize(horizontal: false, vertical: true)
            .background(fill, in: shape)
            .overlay(shape.stroke(edge, lineWidth: 1))
    }
}

/* Figures side by side while they fit and a column when they do not. The column minimum is scaled,
   so a reader at the accessibility sizes gets one metric per row without a size class being asked
   about — the numerals themselves have grown past the point where two share a line. */
struct ThusoMetrics<Content: View>: View {
    @ViewBuilder var content: Content
    @ScaledMetric(relativeTo: .largeTitle) private var column: CGFloat = 128
    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: column), spacing: ThusoSpacing.space16, alignment: .topLeading)],
                  alignment: .leading, spacing: ThusoSpacing.space20) {
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - A panel

/* A hairline and a lighter fill. No shadow, and no second shadow under the first one.
   `lead` takes `studioLilac` as a ground — the one panel a screen is about — and charcoal reads on
   it at 11.93:1. `quiet` recedes into the ground rather than making a second claim. The sage it
   replaces was the palest step of a ramp measured against a grey ground this app no longer has; see
   CareCard in DesignSystem/Theme.swift for the argument, which is spent once and holds for both. */
struct SurfacePanel<Content: View>: View {
    var tone: PanelTone = .plain
    var padding: CGFloat = ThusoSpacing.space20
    var spacing: CGFloat = ThusoSpacing.space12
    @ViewBuilder var content: Content
    private var shape: RoundedRectangle { RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous) }
    private var fill: Color {
        switch tone {
        case .lead: return ThusoTheme.studioLilac
        case .plain: return ThusoTheme.surface
        case .quiet: return ThusoTheme.cloud
        }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: spacing) { content }
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(fill, in: shape)
            .overlay(shape.stroke(tone == .plain ? ThusoTheme.studioLine : .clear, lineWidth: 1))
    }
}

/* A panel's head: what it is, optionally a line about it, and the small circular affordance at the
   trailing edge that opens it. The circle is a real 44-point target rather than a decoration with a
   tap gesture on it. */
struct PanelHead<Trailing: View>: View {
    let title: String
    var note: String?
    @ViewBuilder var trailing: Trailing
    var body: some View {
        HStack(alignment: .top, spacing: ThusoSpacing.space12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).thusoFont(ThusoType.cardTitle, weight: .semibold).foregroundStyle(ThusoTheme.charcoal)
                    .fixedSize(horizontal: false, vertical: true)
                if let note {
                    Text(note).font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 0)
            trailing
        }
    }
}
extension PanelHead where Trailing == EmptyView {
    init(_ title: String, note: String? = nil) { self.init(title: title, note: note) { EmptyView() } }
}

/// The circular affordance itself, so a card that opens somewhere always opens the same way.
struct OpenCircle: View {
    let label: String
    var symbol = "arrow.up.right"
    var body: some View {
        Image(systemName: symbol).font(.subheadline.weight(.semibold))
            .foregroundStyle(ThusoTheme.charcoal)
            .frame(width: 44, height: 44)
            .background(ThusoTheme.surface, in: Circle())
            .overlay(Circle().stroke(ThusoTheme.controlEdge, lineWidth: 1))
            .accessibilityLabel(label)
    }
}

// MARK: - Navigation

/* A pill row: symbol, label, trailing circle. The circle inverts with the row, which is the whole
   trick — an inactive row's circle is an arrow on the pill's own ground, and the row you are on
   turns charcoal with a white disc on it.

   Fully round until the label wraps, for the same reason the chip is. Forty-eight points tall at
   the default size and taller as the text grows, so the target is never the thing that fails. */
struct NavPillLabel: View {
    let title: String
    var subtitle: String = ""
    let symbol: String
    var current = false
    @Environment(\.dynamicTypeSize) private var typeSize
    /* Fully round only when it is one line of text. A capsule's ends curve in by half its height,
       so a two-line pill eats the first and last word of the line it curves past — and at the
       accessibility sizes every pill is a two-line pill. */
    private var shape: AnyShape {
        subtitle.isEmpty && !typeSize.isAccessibilitySize
            ? AnyShape(Capsule())
            : AnyShape(RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous))
    }
    /* The row you are on takes `studioNight` and `studioPaper`, which is the same pair the one live
       card on a screen uses. A neutral black pill on a cream ground reads as a hole rather than as a
       place, and the two darks would have been the only two darks in the app that disagreed. */
    private var ink: Color { current ? ThusoTheme.studioPaper : ThusoTheme.charcoal }
    var body: some View {
        HStack(spacing: ThusoSpacing.space12) {
            /* At the accessibility sizes the symbol is dropped rather than shrunk: the words are
               what the row is for, and a glyph beside six lines of wrapped label is noise
               competing for a narrow column. */
            if !typeSize.isAccessibilitySize {
                Image(systemName: symbol).font(.subheadline).foregroundStyle(ink)
                    .frame(width: 24).accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(title).thusoFont(ThusoType.body, weight: .medium).foregroundStyle(ink)
                    .fixedSize(horizontal: false, vertical: true)
                if !subtitle.isEmpty {
                    /* SAGE IS A FILL AND NEVER A LABEL, AND THIS ROW WAS THE EXCEPTION NOBODY HAD
                       MEASURED. The line under every destination in this app — the sentence that
                       says what is behind the door — was sageSlate on the pill's cloud ground:
                       2.30:1, which clears nothing, on the one string that tells a reader whether
                       the row is the one they want. It is the muted charcoal every other secondary
                       label is, which reads 6.01 on that ground and darkens with it. */
                    Text(subtitle).font(.footnote)
                        .foregroundStyle(current ? ThusoTheme.studioPaper.opacity(0.8)
                                                 : ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            /* The same arithmetic for the arrow. It is hidden from VoiceOver, so it is decoration —
               but it is the decoration that says this row goes somewhere, and at 2.30 it did not
               say it to anybody. */
            Image(systemName: "arrow.right").font(.subheadline.weight(.semibold))
                .foregroundStyle(current ? ThusoTheme.studioNight : ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                .frame(width: 36, height: 36)
                .background(current ? ThusoTheme.studioPaper : .clear, in: Circle())
                .accessibilityHidden(true)
        }
        .padding(.leading, ThusoSpacing.space16).padding(.trailing, 6)
        .padding(.vertical, ThusoSpacing.space8)
        .frame(maxWidth: .infinity, minHeight: 52)
        .background(current ? ThusoTheme.studioNight : ThusoTheme.cloud, in: shape)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(current ? [.isSelected] : [])
    }
}

/// The same pill where the row is the control rather than the label of one.
struct NavPillRow: View {
    let title: String
    var subtitle: String = ""
    let symbol: String
    var current = false
    var action: () -> Void
    var body: some View {
        Button(action: action) {
            NavPillLabel(title: title, subtitle: subtitle, symbol: symbol, current: current)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(.isButton)
    }
}

// MARK: - Progress, as segments

/* Segments rather than one continuous bar. A bar invites somebody to measure a proportion; segments
   say "these many, of these many", which is what a count of visits or checks actually is. */
struct SegmentBar: View {
    let total: Int
    let done: Int
    var now: Int?
    let label: String
    var body: some View {
        HStack(spacing: 5) {
            ForEach(0..<max(total, 1), id: \.self) { index in
                Capsule()
                    .fill(index == now ? ThusoTheme.sageSlate : index < done ? ThusoTheme.softSage : ThusoTheme.cloud)
                    .frame(height: 12)
            }
        }
        .accessibilityElement()
        .accessibilityLabel("\(label): \(done) of \(total)")
    }
}

// MARK: - A heading, in the new voice

/* Headings were bold and indigo and shouted at the top of every screen. In this language emphasis
   comes from size and from space, so a screen title is a regular weight in charcoal and the eyebrow
   above it is the only thing that is tracked out. */
struct SurfaceHeading: View {
    var eyebrow: String = ""
    let title: String
    var subtitle: String = ""
    @ScaledMetric(relativeTo: .largeTitle) private var titleSize: CGFloat = ThusoType.screenTitle
    var body: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            if !eyebrow.isEmpty {
                /* An eyebrow is a label, not a value, so it is the muted charcoal every other
                   label in this language is — never a sage, which reads at 2.30:1 on the cloud
                   ground a quiet panel uses and cannot carry a word anywhere. */
                Text(eyebrow.uppercased()).font(.footnote.weight(.semibold)).tracking(1.1)
                    .foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
            }
            Text(title).font(.system(size: titleSize, weight: .regular)).foregroundStyle(ThusoTheme.charcoal)
                .fixedSize(horizontal: false, vertical: true)
            if !subtitle.isEmpty {
                Text(subtitle).font(.subheadline).foregroundStyle(ThusoTheme.charcoal.opacity(0.75))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

/* A label and a value in two columns, which is the shape three quarters of this product's
   information actually has. It wraps to two rows before it squeezes either side, because a value
   compressed to four characters is a value nobody can read. */
struct FactRow: View {
    let label: String
    let value: String
    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space12) {
                /* Charcoal, muted by opacity rather than by a grey of its own. A metric can sit on
                 white or on the palest sage, and a fixed grey that reads on one does not read on
                 the other — which is exactly what "sage is a fill and never a label" is about. */
            Text(label).font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                Spacer(minLength: ThusoSpacing.space8)
                Text(value).font(.subheadline).foregroundStyle(ThusoTheme.charcoal)
                    .multilineTextAlignment(.trailing)
            }
            VStack(alignment: .leading, spacing: 2) {
                /* Charcoal, muted by opacity rather than by a grey of its own. A metric can sit on
                 white or on the palest sage, and a fixed grey that reads on one does not read on
                 the other — which is exactly what "sage is a fill and never a label" is about. */
            Text(label).font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                Text(value).font(.subheadline).foregroundStyle(ThusoTheme.charcoal)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/* A statement with its heading, and — where there is one — the smaller sentence that says why. The
   web calls this a `dl.stated`; it is how every refusal in this product is presented, so it is one
   component rather than eleven screens each building an HStack. */
struct StatedFact: View {
    let term: String
    let statement: String
    var footnote: String?
    var body: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
            Text(term).font(.footnote.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                .fixedSize(horizontal: false, vertical: true)
            Text(statement).font(.subheadline).foregroundStyle(ThusoTheme.charcoal)
                .fixedSize(horizontal: false, vertical: true)
            if let footnote {
                Text(footnote).font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(0.75))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/* A size from the type scale that still answers Dynamic Type.
 *
 * .font(.system(size: 16)) does not: it is sixteen points at every content size, including the one
 * somebody turned all the way up because they cannot read sixteen points. Nothing about a
 * screenshot shows that — a screen where half the text tripled and half of it did not reads as a
 * layout decision — which is why MyThusoUITests measures the same screen twice and fails a string
 * that came back the same height. This is what the screens use where the type scale's own step is
 * the right size and no semantic style is: it scales relative to .body, so the ratio the design
 * asked for survives the setting. */
private struct ScaledSystemFont: ViewModifier {
    let size: CGFloat
    let weight: Font.Weight
    @ScaledMetric(relativeTo: .body) private var scale: CGFloat = 1
    func body(content: Content) -> some View { content.font(.system(size: size * scale, weight: weight)) }
}
extension View {
    func thusoFont(_ size: CGFloat, weight: Font.Weight = .regular) -> some View {
        modifier(ScaledSystemFont(size: size, weight: weight))
    }
}

/// A hairline. Separation in this language is this and a lighter fill, and nothing else.
struct Hairline: View {
    var body: some View { Rectangle().fill(ThusoTheme.studioLine).frame(height: 1).accessibilityHidden(true) }
}
