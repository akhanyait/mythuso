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
}

/* How much a card is meant to matter.
 *
 * A screen where every card is white, rounded and floating has no hierarchy — the reader has to
 * read all of it to find out which part they came for. So a card is flat by default and only the
 * one thing a screen exists for is allowed to lift off the canvas. `quiet` is for the supporting
 * note that should read as part of the background rather than as another claim. */
enum CardWeight { case lead, plain, quiet }

struct CareCard<Content: View>: View {
    var padding: CGFloat = ThusoSpacing.space16
    var weight: CardWeight = .plain
    var spacing: CGFloat = ThusoSpacing.space12
    @ViewBuilder var content: Content
    private var shape: RoundedRectangle { RoundedRectangle(cornerRadius: ThusoRadius.card, style: .continuous) }
    var body: some View {
        VStack(alignment: .leading, spacing: spacing) { content }
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(weight == .quiet ? AnyShapeStyle(ThusoTheme.canvas) : AnyShapeStyle(ThusoTheme.surface), in: shape)
            .overlay(shape.stroke(ThusoTheme.line, lineWidth: 1))
            .shadow(color: weight == .lead ? ThusoTheme.lift : .clear, radius: weight == .lead ? 10 : 0, y: weight == .lead ? 3 : 0)
    }
}

struct CareHeading: View {
    let eyebrow: String
    let title: String
    let subtitle: String
    var body: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            if !eyebrow.isEmpty {
                Text(eyebrow.uppercased()).font(.caption2.weight(.semibold)).tracking(1.1).foregroundStyle(ThusoTheme.indigo)
            }
            Text(title).font(.title2.weight(.bold)).foregroundStyle(ThusoTheme.ink)
                .fixedSize(horizontal: false, vertical: true)
            if !subtitle.isEmpty {
                Text(subtitle).font(.subheadline).foregroundStyle(ThusoTheme.body)
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
   the title and the link fought each other for the same line. */
struct CareSectionHeader<Trailing: View>: View {
    let title: String
    @ViewBuilder var trailing: Trailing
    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space8) {
                Text(title).font(.headline).foregroundStyle(ThusoTheme.ink)
                Spacer(minLength: ThusoSpacing.space8)
                trailing.font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.indigo)
            }
            VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
                Text(title).font(.headline).foregroundStyle(ThusoTheme.ink)
                trailing.font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.indigo)
            }
        }
        .accessibilityAddTraits(.isHeader)
    }
}
extension CareSectionHeader where Trailing == EmptyView {
    init(_ title: String) { self.init(title: title) { EmptyView() } }
}

struct CareButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .padding(.horizontal, ThusoSpacing.space16).padding(.vertical, ThusoSpacing.space12)
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(ThusoTheme.indigo.opacity(configuration.isPressed ? 0.82 : 1),
                        in: RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous))
            .foregroundStyle(.white)
            .contentShape(Rectangle())
    }
}
struct QuietButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .padding(.horizontal, ThusoSpacing.space16).padding(.vertical, ThusoSpacing.space12)
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(configuration.isPressed ? ThusoTheme.indigoSoft : ThusoTheme.surface,
                        in: RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous).stroke(ThusoTheme.line, lineWidth: 1))
            .foregroundStyle(ThusoTheme.slate)
            .contentShape(Rectangle())
    }
}

/// A soft tinted square holding a symbol. It marks what leads a section — not every row in it.
struct TileIcon: View {
    let symbol: String
    var tint: Color = ThusoTheme.indigo
    var background: Color = ThusoTheme.indigoSoft
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

struct StatusPill: View {
    let text: String
    var tone: String = "teal"
    private var colors: (Color, Color) {
        switch tone {
        case "amber": return (ThusoTheme.mangoSoft, ThusoTheme.mangoInk)
        case "sky": return (ThusoTheme.infoSoft, ThusoTheme.info)
        /* A refusal has to be able to look like one. Vetting says "lapsed" and "declined" often
           enough that the pill needs a tone for it, and a quiet one for what nobody has done yet. */
        case "danger": return (ThusoTheme.danger.opacity(0.11), ThusoTheme.danger)
        case "quiet": return (ThusoTheme.canvas, ThusoTheme.body)
        /* On a dark indigo ground, where the only readable ink is white. The mint-tinged white this
           used to be was left over from the palette the brand replaced. */
        case "light": return (Color.white.opacity(0.16), Color.white)
        /* Teal is an accent, so it marks a good clinical standing as a tinted ground with the dark
           tealInk on it — teal itself cannot carry text on a light ground. */
        default: return (ThusoTheme.tealSoft, ThusoTheme.tealInk)
        }
    }
    /* A pill's ends curve in by half its height, so a status that has wrapped to three lines at the
       accessibility sizes has its first and last words cut off by its own background. Past that
       point the pill becomes a rounded chip and keeps all of its words. */
    @Environment(\.dynamicTypeSize) private var typeSize
    private var shape: AnyShape {
        typeSize.isAccessibilitySize ? AnyShape(RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous)) : AnyShape(Capsule())
    }
    var body: some View {
        Text(text).font(.caption2.weight(.semibold))
            .padding(.horizontal, ThusoSpacing.space8).padding(.vertical, ThusoSpacing.space4)
            .fixedSize(horizontal: false, vertical: true)
            .background(colors.0, in: shape).foregroundStyle(colors.1)
    }
}

struct StepDots: View {
    let step: Int
    let total: Int
    let label: String
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        HStack(spacing: ThusoSpacing.space8) {
            Text("Step \(step) of \(total)").font(.caption.weight(.semibold)).foregroundStyle(ThusoTheme.indigo)
            Text(label).font(.caption).foregroundStyle(ThusoTheme.body).lineLimit(1)
            Spacer(minLength: ThusoSpacing.space8)
            HStack(spacing: ThusoSpacing.space4) {
                ForEach(1...total, id: \.self) { index in
                    Capsule().fill(index <= step ? ThusoTheme.indigo : ThusoTheme.line)
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
                    Text(digit).font(.title3.weight(.semibold)).foregroundStyle(ThusoTheme.ink)
                        .frame(maxWidth: .infinity, minHeight: boxHeight)
                        .background(ThusoTheme.surface, in: RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous).stroke(
                            invalid ? ThusoTheme.danger : (active ? ThusoTheme.indigo : ThusoTheme.line),
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
        Label("Design preview · Fictional data", systemImage: "info.circle").accessibilityElement(children: .combine)
            .font(.caption.weight(.medium))
            .foregroundStyle(ThusoTheme.indigoDeep)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, ThusoSpacing.space8).padding(.vertical, ThusoSpacing.space4)
            /* A rounded rectangle rather than a capsule: at the accessibility sizes this wraps to
               three lines, and a capsule's ends then curve so far in that they cut the text. */
            .background(ThusoTheme.indigoSoft, in: RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous))
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
                TileIcon(symbol: symbol, tint: danger ? ThusoTheme.danger : ThusoTheme.indigo,
                         background: danger ? ThusoTheme.dangerSoft : ThusoTheme.indigoSoft, size: 36)
            } else if !typeSize.isAccessibilitySize {
                /* At the accessibility sizes the symbol is dropped rather than shrunk: the words are
                   what the row is for, and a 24-point glyph beside six lines of wrapped label is
                   noise competing for a narrow column. */
                Image(systemName: symbol).font(.body).foregroundStyle(ThusoTheme.indigo)
                    .frame(width: 26, alignment: .center).accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.semibold))
                    .foregroundStyle(danger ? ThusoTheme.danger : ThusoTheme.ink)
                    .fixedSize(horizontal: false, vertical: true)
                if !subtitle.isEmpty {
                    Text(subtitle).font(.caption).foregroundStyle(ThusoTheme.body)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: ThusoSpacing.space8)
            if !danger {
                Image(systemName: "chevron.right").font(.caption.weight(.semibold))
                    .foregroundStyle(ThusoTheme.faint).accessibilityHidden(true)
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
                        .font(.subheadline).foregroundStyle(ThusoTheme.ink).fixedSize(horizontal: false, vertical: true)
                    Text("No live care, payments, device permissions or clinical decisions are activated.")
                        .font(.footnote).foregroundStyle(ThusoTheme.body).fixedSize(horizontal: false, vertical: true)
                }
                Text("Connected to your care journey.").font(.footnote).foregroundStyle(ThusoTheme.faint)
            }
            .padding(.horizontal, ThusoSpacing.space20).padding(.vertical, ThusoSpacing.space16)
        }
        .background(ThusoTheme.canvas)
        .navigationTitle(title).navigationBarTitleDisplayMode(.large)
    }
}
