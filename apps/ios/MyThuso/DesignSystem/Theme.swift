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
/* `lift` and `controlEdge` used to live here. Since 28 September 2026 elevation is `thusoShadow()` from
   the tokens' two shadows and a control's edge is ThusoRole.inputEdge, so nothing is renamed here. */

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
        case .lead: return ThusoRole.surfaceRaised
        case .plain: return ThusoRole.surface
        case .quiet: return ThusoRole.muted
        }
    }
    /* The handoff's Card since 28 September 2026 — a border and the one card shadow on every weight;
       the lead card is the raised surface rather than a tint of its own. ThusoCard in Components/ is
       the same shape for a screen written against the catalogue's names. */
    var body: some View {
        VStack(alignment: .leading, spacing: spacing) { content }
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(fill, in: shape)
            .overlay(shape.stroke(ThusoRole.border, lineWidth: 1))
            .thusoShadow()
    }
}

struct CareHeading: View {
    let eyebrow: String
    let title: String
    let subtitle: String
    var body: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            if !eyebrow.isEmpty {
                Text(eyebrow.uppercased()).font(.thuso(.caption2, weight: .semibold)).tracking(1.1).foregroundStyle(ThusoRole.mutedForeground)
            }
            Text(title).font(.thuso(.title2, weight: .bold)).foregroundStyle(ThusoRole.foreground)
                .fixedSize(horizontal: false, vertical: true)
            if !subtitle.isEmpty {
                Text(subtitle).font(.thuso(.subheadline)).foregroundStyle(ThusoRole.mutedForeground)
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
        trailing.font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
            .frame(minHeight: 44).contentShape(Rectangle())
    }
    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space8) {
                Text(title).font(.thuso(.headline)).foregroundStyle(ThusoRole.foreground)
                Spacer(minLength: ThusoSpacing.space8)
                link
            }
            VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
                Text(title).font(.thuso(.headline)).foregroundStyle(ThusoRole.foreground)
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

/* Since 28 September 2026 both are the handoff's Button, full width: CareButton its primary at the
   large size and QuietButton its secondary. The two names stay because every screen already asks for
   them by name; the look is ThusoButtonStyle's, so there is one button in this product. */
struct CareButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        ThusoButtonStyle(.primary, size: .lg, fullWidth: true).makeBody(configuration: configuration)
    }
}
struct QuietButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        ThusoButtonStyle(.secondary, size: .lg, fullWidth: true).makeBody(configuration: configuration)
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
    var background: Color = ThusoRole.surface
    @ScaledMetric(relativeTo: .body) private var scale: CGFloat = 1
    @Environment(\.dynamicTypeSize) private var typeSize
    var body: some View {
        if !typeSize.isAccessibilitySize {
            Text(text).font(.thuso(.footnote, weight: .bold)).foregroundStyle(ThusoRole.foreground)
                .frame(width: diameter * scale, height: diameter * scale)
                .background(background, in: Circle())
                .overlay(Circle().stroke(ThusoRole.border, lineWidth: 1))
                .accessibilityHidden(true)
        }
    }
}

/// A soft tinted square holding a symbol. It marks what leads a section — not every row in it.
struct TileIcon: View {
    let symbol: String
    var tint: Color = ThusoRole.foreground
    /* THE DEFAULT IS THE QUIET PLATE, AND THE LOUD ONE IS ASKED FOR BY NAME.
       This was studioLime for an afternoon, and the emulator screenshot of the care catalogue is why
       it is not: six rows, six lime squares, straight down the screen. A plate marks what leads a
       section rather than every row in it — that is the sentence above this control — and a default
       is precisely what every row gets, so a loud default is the one thing that rule cannot survive.
       Charcoal reads 13.53:1 on cloud and 15.3:1 on the lime a caller passes deliberately. */
    var background: Color = ThusoRole.muted
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
            Text("Step \(step) of \(total)").font(.thuso(.caption, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
            Text(label).font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
                .lineLimit(typeSize.isAccessibilitySize ? nil : 1)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: ThusoSpacing.space8)
            HStack(spacing: ThusoSpacing.space4) {
                ForEach(1...total, id: \.self) { index in
                    Capsule().fill(index <= step ? ThusoRole.primary : ThusoRole.muted)
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
                    Text(digit).font(.thuso(.title3, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                        .frame(maxWidth: .infinity, minHeight: boxHeight)
                        .background(ThusoRole.surface, in: RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous).stroke(
                            invalid ? ThusoRole.dangerInk : (active ? ThusoRole.foreground : ThusoRole.inputEdge),
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
            .font(.thuso(.caption, weight: .medium))
            .foregroundStyle(ThusoRole.foreground)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, ThusoSpacing.space8).padding(.vertical, ThusoSpacing.space4)
            /* A rounded rectangle rather than a capsule: at the accessibility sizes this wraps to
               three lines, and a capsule's ends then curve so far in that they cut the text. */
            .background(ThusoRole.muted, in: RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous))
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
                TileIcon(symbol: symbol, tint: danger ? ThusoRole.dangerInk : ThusoRole.foreground,
                         background: danger ? ThusoRole.dangerTint : ThusoRole.highlight, size: 36)
            } else if !typeSize.isAccessibilitySize {
                /* At the accessibility sizes the symbol is dropped rather than shrunk: the words are
                   what the row is for, and a 24-point glyph beside six lines of wrapped label is
                   noise competing for a narrow column. */
                Image(systemName: symbol).font(.thuso(.body)).foregroundStyle(ThusoRole.foreground)
                    .frame(width: 26, alignment: .center).accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.thuso(.subheadline, weight: .semibold))
                    .foregroundStyle(danger ? ThusoRole.dangerInk : ThusoRole.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                if !subtitle.isEmpty {
                    Text(subtitle).font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: ThusoSpacing.space8)
            if !danger {
                Image(systemName: "chevron.right").font(.thuso(.caption, weight: .semibold))
                    .foregroundStyle(ThusoRole.mutedForeground).accessibilityHidden(true)
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
                        .font(.thuso(.subheadline)).foregroundStyle(ThusoRole.foreground).fixedSize(horizontal: false, vertical: true)
                    Text("No live care, payments, device permissions or clinical decisions are activated.")
                        .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground).fixedSize(horizontal: false, vertical: true)
                }
                Text("Connected to your care journey.").font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
            }
            .padding(.horizontal, ThusoSpacing.space20).padding(.vertical, ThusoSpacing.space16)
        }
        .thusoGround()
        .navigationTitle(title).navigationBarTitleDisplayMode(.large)
    }
}
