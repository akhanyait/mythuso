import SwiftUI

/* The palette itself is generated into DesignSystem/Tokens.swift from
   packages/design-tokens/tokens.json, so a colour is converted from hex once, by a machine, rather
   than three times by hand — the clinical chart now names tealSoft and mangoSoft directly rather
   than through an alias, so there is nothing left here that renames a token.

   The radius and spacing tokens are generated beside the palette and, until now, were used by
   nothing: every corner in this app was a number typed into a view — 10, 12, 14, 18 and 24 all at
   once — and every gap was a number typed into a stack. That is why the interface read as soft and
   improvised rather than composed. Everything below is built from ThusoRadius and ThusoSpacing so
   there is one scale and the design system can move it. */
extension ThusoTheme {
    /// Elevation, expressed once. A card that leads a screen may lift; nothing else may.
    static let lift = ink.opacity(0.06)

    /* THE EDGE OF A CONTROL IS NOT A HAIRLINE, AND MEASURING IS WHAT SAID SO.
     *
     * A one-time-code box, a search field, a note editor, an unselected time slot: each of these is
     * a white shape on a near-white ground, and its border is the only thing on the screen saying
     * where it is. WCAG 2.2 SC 1.4.11 holds that border to 3:1, and every one of them was drawn in
     * `line` — #E2E8F0, which measures 1.23:1 on white. `stone` is 1.36. Both are invisible; a
     * reader with ordinary eyesight finds those fields by guessing, and a reader without does not
     * find them at all.
     *
     * Nothing in the sage ramp can carry it either: sageSlate, the darkest the ramp goes, is 2.90
     * on white and fails by a tenth. Charcoal at half alpha reaches 3.28 on white but 2.96 on the
     * palest sage, so it would pass on the screens it was measured on and fail on a lead panel.
     *
     * So it is the muted charcoal the labels already use — 6.69 on white, 6.01 on cloud, 5.37 on
     * paleSage, 4.74 on the deepest sage fill. Past 3:1 on every ground in the palette with room to
     * spare, and, being an alpha rather than a flattened grey, it darkens with whatever it sits on
     * for the same reason ThusoOpacity.charcoalMuted exists at all. It also makes the resting and
     * the active state one progression rather than two ideas: an idle field is charcoal at 72% and
     * one point, the field you are in is charcoal at full weight and one and a half.
     *
     * A DIVIDER IS STILL `stone`. This is not a licence to darken every line in the app. A rule
     * between two rows, the edge of a card, the ring round a monogram — none of those is a control
     * and none of them has to be found, so they stay the hairline the design language asks for. */
    static let controlEdge = charcoal.opacity(ThusoOpacity.charcoalMuted)
}

/* How much a card is meant to matter.
 *
 * A screen where every card is white, rounded and floating has no hierarchy — the reader has to
 * read all of it to find out which part they came for. So a card is flat by default and only the
 * one thing a screen exists for is marked out. `quiet` is for the supporting note that should read
 * as part of the background rather than as another claim.
 *
 * SEPARATION IS A HAIRLINE AND A LIGHTER FILL, NEVER A SHADOW. The lead card used to lift off the
 * canvas on a 10-point shadow, which is how this app came to look like a stack of floating tiles
 * while the web looked like a dashboard. It now takes the palest sage as a ground — charcoal reads
 * on it at 11.11:1 — and nothing on any screen casts a shadow. The radius is the panel step rather
 * than the card step, because the language this product moved to is generous at the corners.
 * docs/DESIGN-LANGUAGE.md is the argument; this is where it is spent, once, for every screen. */
enum CardWeight { case lead, plain, quiet }

struct CareCard<Content: View>: View {
    var padding: CGFloat = ThusoSpacing.space16
    var weight: CardWeight = .plain
    var spacing: CGFloat = ThusoSpacing.space12
    @ViewBuilder var content: Content
    private var shape: RoundedRectangle { RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous) }
    /* THE LEAD FILL IS LILAC NOW, AND THE REASON IS THE GROUND UNDER IT.
       `paleSage` was the palest step of a ramp chosen against a grey #F0F0F0 ground. The ground is
       cream, and a desaturated sage panel on cream is the previous generation's accent showing
       through the new one — the exact fault this file's own comment accuses the indigo gradient of.
       `studioLilac` is one of the three tiles the Care Studio palette declares, charcoal reads
       11.93:1 on it and the muted label 5.59, and it is quiet enough to be on every screen in the
       way `studioLime` is emphatically not. The loud one is spent on a tile plate, a flag chip and
       the one button a screen is for. */
    private var fill: Color {
        switch weight {
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
            .overlay(shape.stroke(weight == .plain ? ThusoTheme.studioLine : .clear, lineWidth: 1))
    }
}

struct CareHeading: View {
    let eyebrow: String
    let title: String
    let subtitle: String
    var body: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            if !eyebrow.isEmpty {
                Text(eyebrow.uppercased()).font(.caption2.weight(.semibold)).tracking(1.1).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
            }
            Text(title).font(.title2.weight(.bold)).foregroundStyle(ThusoTheme.charcoal)
                .fixedSize(horizontal: false, vertical: true)
            if !subtitle.isEmpty {
                Text(subtitle).font(.subheadline).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        /* One heading, read as one thing, announced as a heading — VoiceOver used to stop on the
           eyebrow, the title and the subtitle as three unrelated pieces of text. */
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

/* A section title with, optionally, the one link that section leads to. Six screens were building
   this by hand out of an HStack, a Spacer(minLength: 8) and a font, and at the largest text sizes
   the title and the link fought each other for the same line.

   The trailing link gets forty-four points of its own. It had none: two words set at .subheadline
   measure about eighteen points tall, and "See all" beside Health trends was the only way into the
   trends screen — a target under half the size a thumb needs, in front of the one door. The frame
   goes on the trailing view rather than on the row, so the title keeps its own height. */
struct CareSectionHeader<Trailing: View>: View {
    let title: String
    @ViewBuilder var trailing: Trailing
    private var link: some View {
        trailing.font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            .frame(minHeight: 44).contentShape(Rectangle())
    }
    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space8) {
                Text(title).font(.headline).foregroundStyle(ThusoTheme.charcoal)
                Spacer(minLength: ThusoSpacing.space8)
                link
            }
            VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
                Text(title).font(.headline).foregroundStyle(ThusoTheme.charcoal)
                link
            }
        }
        .accessibilityAddTraits(.isHeader)
    }
}
extension CareSectionHeader where Trailing == EmptyView {
    init(_ title: String) { self.init(title: title) { EmptyView() } }
}

/* Fully round, and charcoal rather than indigo. A secondary is the same pill with a hairline
   instead of a fill, so the two read as one family at two weights — which is what the web does on
   the patient surface, and the reason the two apps stopped looking like one product was partly this
   one control: a square indigo bar under a sage panel belongs to a different design.

   A capsule at the accessibility sizes cuts its own label, so past that point both become the panel
   radius. It is the same reasoning as StatusPill's and NavPillLabel's, and it is why the shape is a
   computed property rather than a constant. */
private func buttonShape(_ accessibility: Bool) -> AnyShape {
    accessibility ? AnyShape(RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous)) : AnyShape(Capsule())
}

/* THE PRIMARY ACTION IS A LIME PILL WITH AN INK LABEL.
 *
 * It was a charcoal pill with a white label, and the prototype's is lime with ink on it — which is
 * the single most recognisable object in the founder's screenshots and the reason the accent exists
 * at all. `studioInkDeep on studioLime` is a declared pair; the accent is a ground here and never a
 * word, which is the rule it has been held to since it was teal.
 *
 * PRESSED IS A DARKENING RATHER THAN A FADE. Lowering the fill's alpha would let the paper through
 * and leave the label sitting on whatever the button happens to be over — the same guess `glassFloor`
 * exists to stop. An ink veil over the lime only ever makes the ratio better. */
struct CareButton: ButtonStyle {
    @Environment(\.dynamicTypeSize) private var typeSize
    func makeBody(configuration: Configuration) -> some View {
        let shape = buttonShape(typeSize.isAccessibilitySize)
        return configuration.label
            .font(.subheadline.weight(.semibold))
            .padding(.horizontal, ThusoSpacing.space16).padding(.vertical, ThusoSpacing.space12)
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(ThusoTheme.studioLime, in: shape)
            .overlay(shape.fill(ThusoTheme.studioInkDeep.opacity(configuration.isPressed ? 0.12 : 0)))
            .foregroundStyle(ThusoTheme.studioInkDeep)
            .contentShape(Rectangle())
    }
}
struct QuietButton: ButtonStyle {
    @Environment(\.dynamicTypeSize) private var typeSize
    func makeBody(configuration: Configuration) -> some View {
        let shape = buttonShape(typeSize.isAccessibilitySize)
        return configuration.label
            .font(.subheadline.weight(.semibold))
            .padding(.horizontal, ThusoSpacing.space16).padding(.vertical, ThusoSpacing.space12)
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(configuration.isPressed ? ThusoTheme.cloud : ThusoTheme.surface, in: shape)
            .overlay(shape.stroke(ThusoTheme.controlEdge, lineWidth: 1))
            .foregroundStyle(ThusoTheme.charcoal)
            .contentShape(Rectangle())
    }
}

/* A monogram, and the one thing every hand-built copy of it got wrong.
 *
 * Two capitals in a fixed circle, on eight screens, each written out as a Text with a
 * .frame(width: 42, height: 42) round it. At AccessibilityXXXL the letters are three times the
 * size and the circle is still forty-two points, so every one of them rendered as "…" — a picture
 * of letters that had become a picture of nothing, beside the name it was standing in for.
 *
 * MyThusoUITests' scaling check could not have caught it: it excuses any string of three capitals
 * or fewer, because a monogram is not read and is not meant to grow. That exemption is right, and
 * it is exactly why this had to be found by looking.
 *
 * So the circle grows with the text, and past the accessibility sizes it is not drawn at all. The
 * person's full name is always next to it, it is hidden from VoiceOver, and a decoration that
 * would take a third of a narrow column at those sizes is a decoration that has stopped paying for
 * its space. */
struct Monogram: View {
    let text: String
    var diameter: CGFloat = 42
    /* White with a hairline, on every ground. A sage disc on a sage lead card was invisible — the
       monogram was there in the layout and gone in the screenshot — and separation in this language
       is a hairline and a lighter fill rather than a second tint per card. */
    var background: Color = ThusoTheme.surface
    @ScaledMetric(relativeTo: .body) private var scale: CGFloat = 1
    @Environment(\.dynamicTypeSize) private var typeSize
    var body: some View {
        if !typeSize.isAccessibilitySize {
            Text(text).font(.footnote.weight(.bold)).foregroundStyle(ThusoTheme.charcoal)
                .frame(width: diameter * scale, height: diameter * scale)
                .background(background, in: Circle())
                .overlay(Circle().stroke(ThusoTheme.studioLine, lineWidth: 1))
                .accessibilityHidden(true)
        }
    }
}

/// A soft tinted square holding a symbol. It marks what leads a section — not every row in it.
struct TileIcon: View {
    let symbol: String
    var tint: Color = ThusoTheme.charcoal
    /* The lime accent block, at the one size it is affordable. A plate is forty points square and
       marks what leads a section rather than every row in it, so the accent stays countable: a
       screen has one or two of these, not eleven. Charcoal reads 15.3:1 on it. */
    var background: Color = ThusoTheme.studioLime
    var size: CGFloat = 40
    /* @ScaledMetric so the plate grows with the reader's text size. It used to be a fixed square
       beside text that could triple in height, which is how a 44-point tile ended up floating
       against six lines of wrapped label. */
    @ScaledMetric(relativeTo: .body) private var scale: CGFloat = 1
    private var side: CGFloat { size * scale }
    var body: some View {
        Image(systemName: symbol).font(.system(size: size * 0.42, weight: .medium))
            .foregroundStyle(tint).frame(width: side, height: side)
            .background(background, in: RoundedRectangle(cornerRadius: ThusoRadius.tile, style: .continuous))
            .accessibilityHidden(true)
    }
}

/* The same chip, spoken to in the contracts' own tone words. Every screen in the app said
   `StatusPill(text:tone:)` and the tone strings come out of vetting, capture and dispensing data,
   so the name and the vocabulary stay; what changed is that there is now one implementation of a
   chip in this product rather than two, and that only a severity or a refusal is allowed a hue.
   MetricChip in DesignSystem/Surface.swift is that implementation and the argument for it. */
struct StatusPill: View {
    let text: String
    var tone: String = "teal"
    var body: some View { MetricChip(text: text, tone: ChipTone(tone)) }
}

struct StepDots: View {
    let step: Int
    let total: Int
    let label: String
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /* The name of the step is what tells a nurse where she is. Set on one line beside the count it
       came out as "Ident…" at the accessibility sizes — a truncation of the only word on the row
       that says anything — so past that point the row becomes two lines and keeps the word. */
    @Environment(\.dynamicTypeSize) private var typeSize
    var body: some View {
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: ThusoSpacing.space8))
            : AnyLayout(HStackLayout(spacing: ThusoSpacing.space8))
        return layout {
            Text("Step \(step) of \(total)").font(.caption.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            Text(label).font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                .lineLimit(typeSize.isAccessibilitySize ? nil : 1)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: ThusoSpacing.space8)
            HStack(spacing: ThusoSpacing.space4) {
                ForEach(1...total, id: \.self) { index in
                    Capsule().fill(index <= step ? ThusoTheme.studioNight : ThusoTheme.cloud)
                        .frame(width: index == step ? 18 : 6, height: 6)
                }
            }
            .animation(reduceMotion ? nil : .snappy(duration: 0.25), value: step)
        }
        .accessibilityElement()
        .accessibilityLabel("Step \(step) of \(total): \(label)")
    }
}

/// One box per digit, as the design asks. A single hidden field owns the text so SMS autofill,
/// paste and VoiceOver all still work; the boxes are a picture of what it holds.
struct CodeBoxes: View {
    @Binding var code: String
    var length = 6
    var invalid = false
    let label: String
    @FocusState private var focused: Bool
    @ScaledMetric(relativeTo: .title3) private var boxHeight: CGFloat = 54
    var body: some View {
        ZStack {
            TextField("", text: $code).keyboardType(.numberPad).textContentType(.oneTimeCode)
                .focused($focused).opacity(0.02).accessibilityLabel(label)
                .onChange(of: code) { _, value in code = String(value.filter(\.isNumber).prefix(length)) }
            HStack(spacing: ThusoSpacing.space8) {
                ForEach(0..<length, id: \.self) { index in
                    let digit = index < code.count ? String(Array(code)[index]) : ""
                    let active = focused && index == min(code.count, length - 1)
                    Text(digit).font(.title3.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                        .frame(maxWidth: .infinity, minHeight: boxHeight)
                        .background(ThusoTheme.surface, in: RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous).stroke(
                            invalid ? ThusoTheme.danger : (active ? ThusoTheme.charcoal : ThusoTheme.controlEdge),
                            lineWidth: active || invalid ? 1.5 : 1))
                }
            }
            .allowsHitTesting(false)
        }
        .contentShape(Rectangle())
        .onTapGesture { focused = true }
        /* A code that is now full, and a code that has just been refused, are both worth feeling. */
        .sensoryFeedback(.success, trigger: code.count == length && !invalid)
        .sensoryFeedback(.error, trigger: invalid)
        .accessibilityElement(children: .contain)
    }
}

/* The standing disclosure. Nothing in this app is a real service, and the sentence saying so is not
   decoration to be tucked into a corner — it is given a ground of its own so it reads as a label on
   the screen rather than as a stray caption belonging to whatever is underneath it. The wording
   does not change. */
struct DemoBadge: View {
    var body: some View {
        Label("Design preview · Fictional data", systemImage: "info.circle")
            .accessibilityElement(children: .ignore).accessibilityLabel("Design preview · Fictional data")
            .font(.caption.weight(.medium))
            .foregroundStyle(ThusoTheme.charcoal)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, ThusoSpacing.space8).padding(.vertical, ThusoSpacing.space4)
            /* A rounded rectangle rather than a capsule: at the accessibility sizes this wraps to
               three lines, and a capsule's ends then curve so far in that they cut the text. */
            .background(ThusoTheme.cloud, in: RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous))
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
    }
}

/* A row in a list of destinations.
 *
 * The tinted plate behind the symbol used to be on every row of every list, so a screen of eleven
 * destinations had eleven identical indigo squares and the tint had stopped meaning anything. It is
 * now off by default: a plain symbol carries the row, and `tinted` is spent where a row genuinely
 * leads its section. A destructive row keeps its plate, because that one is a warning. */
struct MenuRow: View {
    let title: String
    let subtitle: String
    let symbol: String
    var danger = false
    var tinted = false
    @Environment(\.dynamicTypeSize) private var typeSize
    var body: some View {
        HStack(spacing: ThusoSpacing.space12) {
            if tinted || danger {
                TileIcon(symbol: symbol, tint: danger ? ThusoTheme.danger : ThusoTheme.charcoal,
                         background: danger ? ThusoTheme.dangerSoft : ThusoTheme.studioLime, size: 36)
            } else if !typeSize.isAccessibilitySize {
                /* At the accessibility sizes the symbol is dropped rather than shrunk: the words are
                   what the row is for, and a 24-point glyph beside six lines of wrapped label is
                   noise competing for a narrow column. */
                Image(systemName: symbol).font(.body).foregroundStyle(ThusoTheme.charcoal)
                    .frame(width: 26, alignment: .center).accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.semibold))
                    .foregroundStyle(danger ? ThusoTheme.danger : ThusoTheme.charcoal)
                    .fixedSize(horizontal: false, vertical: true)
                if !subtitle.isEmpty {
                    Text(subtitle).font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: ThusoSpacing.space8)
            if !danger {
                Image(systemName: "chevron.right").font(.caption.weight(.semibold))
                    .foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted)).accessibilityHidden(true)
            }
        }
        .padding(.vertical, ThusoSpacing.space8)
        .frame(minHeight: 44)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/* The destination behind a roadmap row. It is not a screen with a feature on it and does not
   pretend to be one — the two sentences below are the whole content, and they say what is not
   activated. They are unchanged. */
struct FeatureDetail: View {
    let title: String
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
                DemoBadge()
                CareCard(weight: .lead) {
                    TileIcon(symbol: "sparkles")
                    Text("This workflow will connect to the relevant clinical, operational or partner service in the functionality phase.")
                        .font(.subheadline).foregroundStyle(ThusoTheme.charcoal).fixedSize(horizontal: false, vertical: true)
                    Text("No live care, payments, device permissions or clinical decisions are activated.")
                        .font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted)).fixedSize(horizontal: false, vertical: true)
                }
                Text("Connected to your care journey.").font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
            }
            .padding(.horizontal, ThusoSpacing.space20).padding(.vertical, ThusoSpacing.space16)
        }
        .thusoGround()
        .navigationTitle(title).navigationBarTitleDisplayMode(.large)
    }
}
