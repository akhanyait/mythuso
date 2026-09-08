import SwiftUI

/* A drawing of an assistant, and nothing else.

   The founder saw PulseBuddy's soft luminous blob and wanted that visual language: a shape that
   sits with you and changes with what is going on. This screen is that shape. What it is not — and
   what nothing on it may ever imply it is — is a voice product.

   packages/catalog/capabilities.json carries `voice` with connected: false and three things
   blocking it: no speech model, vendor or licence; no microphone permission declared on either
   native app, deliberately; and nothing designed for what happens to a recording of a person
   describing a symptom under POPIA. Its neverSoften note is the rule this file is written to:

       "No microphone affordance may be drawn — not an enabled one, not a disabled one, not a
        decorative one. A control that looks like it is listening and is not is worse than no
        control, and on a health product it is the kind of worse that gets believed."

   So there is no microphone glyph here, no waveform, no listening ring, no tap-to-speak, and no
   disabled control with an explanation attached. The reason a disabled one is refused as firmly as
   an enabled one is that a person does not read the disabled state — they read the shape, learn
   that this app listens, and one day say something to it that it never heard. On a health product
   that sentence could be a symptom.

   What is left is honest on its own terms. The orb reflects one of four situations, each of which
   is a real thing this product has a contract for: a visit on the first day the scheduling contract
   offers, a laboratory result released, a registration inside the forty-five days after which
   vetting withdraws dispatch by arithmetic, and nothing at all — which is the state a well person
   should be in most of the time. Nothing on the screen is connected to any of them yet, which is
   what the notice above the orb says, once, in the contract's own words.

   Two things about how it is drawn.

   Sage is a fill and never a label. The darkest of the four sages measures 2.54:1 as text on the
   mist ground and clears nothing, so the orb is sage and every word on the screen is charcoal. The
   state is never carried by the colour alone either: the chip above the orb says which state this
   is, in words, for a reader who cannot tell the four greens apart or is listening to the screen.

   The animation stops rather than slows. A shape that breathes forever is exactly what Reduce
   Motion exists for, and it is also a battery cost on a phone somebody uses to book a nurse — so it
   runs only while this screen is on screen, it stops when the screen goes away, and under Reduce
   Motion it never starts. Nothing under it changes a box: the drift is scale and offset on layers
   that nothing else is measured against. */

// MARK: - The four things the drawing can say

/// One situation the orb can be in. `depth` is where it sits on the sage ramp: 0 is the lightest
/// and widest, 3 the deepest and most concentrated. It is never the only thing that says which
/// state this is — `name` says it in words, and the words are what a screen reader gets.
struct AssistantState: Identifiable, Hashable {
    let id: String
    let name: String
    let sentence: String
    /// A figure worth setting large, where the app genuinely has one. Nil where a number would have
    /// to be invented to fill the space, which is most of the time.
    let figure: String?
    let figureLabel: String?
    let depth: Int
}

extension AssistantState {
    /* Each of these derives from a contract this app already holds rather than from a sentence
       typed here. The date is the first day packages/catalog/scheduling.json offers, so it moves
       with the calendar instead of going stale; the result is the laboratory record type from
       packages/catalog/records.json; and forty-five is VettingClock.expiryWarningDays, the point at
       which a lapsing registration starts removing what it carried. */
    static var all: [AssistantState] {
        let firstOffered = Scheduling.offeredDays().first
        let firstSlot = Scheduling.slots.first ?? ""
        let laboratory = Records.type("laboratory")?.name ?? "Laboratory"
        return [
            .init(id: "settled", name: "Nothing waiting",
                  sentence: "Nothing needs you. This is the state a well person is in most of the time, and it is the one the drawing is quietest in.",
                  figure: nil, figureLabel: nil, depth: 0),
            .init(id: "visit", name: "Visit confirmed",
                  sentence: "A nurse is expected on \(firstOffered.map { Scheduling.longDate($0.date) } ?? "the first day offered"). You will be told who is coming before they leave.",
                  figure: firstOffered?.day, figureLabel: "\(firstOffered?.month ?? "") · \(firstSlot)", depth: 1),
            .init(id: "result", name: "Result ready",
                  sentence: "\(laboratory) results have been released to your record. A doctor reads them before you are asked to do anything about them.",
                  figure: nil, figureLabel: nil, depth: 2),
            .init(id: "credential", name: "Credential lapsing",
                  sentence: "A registration on your team is inside its last weeks. When it lapses, the work it carried is withdrawn by arithmetic rather than by anybody remembering to.",
                  figure: "\(VettingClock.expiryWarningDays)",
                  figureLabel: "days before it stops carrying anything", depth: 3)
        ]
    }
}

// MARK: - The screen

struct AssistantView: View {
    @State private var showing = AssistantState.all[0]
    private let states = AssistantState.all
    /// The capability this screen depends on. Named once, here, so the sentence below it and the
    /// reasons further down come from the same row of the contract.
    private let capability = "voice"

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space20) {
                CapabilityNotice(of: capability)
                orbCard
                stateChooser
                refusals
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .background(ThusoTheme.mist)
        .navigationTitle("Assistant").navigationBarTitleDisplayMode(.large)
    }

    /* The chip floats above the drawing and the figure sits under it — the reference's own
       arrangement, and the reason it reads as calm is that only one thing on the card is large. */
    private var orbCard: some View {
        CareCard(padding: ThusoSpacing.space24, spacing: ThusoSpacing.space16) {
            VStack(spacing: ThusoSpacing.space16) {
                StateChip(showing.name)
                AssistantOrb(state: showing)
                if let figure = showing.figure {
                    VStack(spacing: ThusoSpacing.space4) {
                        /* A semantic style at a light weight, not a point size: the reference's big
                           thin numeral, but one that still answers the text-size setting. */
                        Text(figure).font(.system(.largeTitle, design: .default, weight: .light))
                            .foregroundStyle(ThusoTheme.charcoal)
                        if let label = showing.figureLabel {
                            Text(label).font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(0.7))
                                .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .accessibilityElement(children: .combine)
                }
                Text(showing.sentence).font(.subheadline).foregroundStyle(ThusoTheme.charcoal)
                    .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity)
        }
    }

    /* Four pills rather than a segmented control: a segmented control is thirty-two points tall at
       every text size, which is the defect that was just taken out of the Health Passport. The
       button's own frame is the frame a thumb has to hit, and it is forty-four.

       They choose which of the four the drawing is showing, and the screen says plainly that this
       is a legend rather than a status — nothing here is connected to a visit, a result or a
       register, so there is nothing for the app to work out on its own. */
    private var stateChooser: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            CareSectionHeader("What the drawing can say")
            Text("Four situations, and the shape each one takes. Nothing on this screen is watching for them yet — you are choosing which to look at.")
                .font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(0.7))
                .fixedSize(horizontal: false, vertical: true)
            ViewThatFits(in: .horizontal) {
                HStack(spacing: ThusoSpacing.space8) { pills(filling: false) }
                VStack(spacing: ThusoSpacing.space8) { pills(filling: true) }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("What the drawing can say")
        }
    }

    @ViewBuilder private func pills(filling: Bool) -> some View {
        ForEach(states) { state in
            let chosen = state.id == showing.id
            Button { showing = state } label: {
                Text(state.name).font(.footnote.weight(.semibold))
                    .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
                    .foregroundStyle(chosen ? Color.white : ThusoTheme.charcoal)
                    .padding(.horizontal, ThusoSpacing.space12).padding(.vertical, ThusoSpacing.space8)
                    .frame(maxWidth: filling ? .infinity : nil, minHeight: 44)
                    .background(chosen ? ThusoTheme.charcoal : ThusoTheme.surface,
                                in: RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous)
                        .stroke(chosen ? ThusoTheme.charcoal : ThusoTheme.stone, lineWidth: 1))
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            /* Chosen is said, not only drawn — four identical buttons is what a listener gets
               otherwise, and the charcoal fill means nothing to them. */
            .accessibilityAddTraits(chosen ? [.isButton, .isSelected] : .isButton)
        }
    }

    /* What is actually in the way, in the contract's own words rather than a summary of them. The
       last line is the rule this screen is held to; it is written for whoever changes the screen
       next, and it is on the screen because a rule kept in a file is a rule somebody breaks by
       accident at eleven at night. */
    private var refusals: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            CareSectionHeader("Why it cannot listen")
            CareCard {
                ForEach(Array(Capabilities.blocking(capability).enumerated()), id: \.offset) { index, reason in
                    if index > 0 { Divider().overlay(ThusoTheme.stone) }
                    Text(reason).font(.footnote).foregroundStyle(ThusoTheme.charcoal)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.vertical, ThusoSpacing.space4)
                }
            }
            if let rule = Capabilities.neverSoften(capability) {
                CareCard(weight: .quiet) {
                    Text("The rule this screen is built to").font(.caption.weight(.semibold))
                        .foregroundStyle(ThusoTheme.charcoal)
                    Text(rule).font(.footnote).foregroundStyle(ThusoTheme.charcoal)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }
}

// MARK: - The orb

/// The drawing itself: a bloom, a body and two soft masses moving slowly against each other inside
/// it. Nothing in here is a control and nothing in here can be operated.
private struct AssistantOrb: View {
    let state: AssistantState
    var size: CGFloat = 232

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var drifting = false

    /* The four sages, in order. The state moves along this ramp and the shape tightens with it, so
       the difference between "nothing waiting" and "something is lapsing" is visible as form as
       well as tone — never as tone alone. */
    private let ramp = [ThusoTheme.paleSage, ThusoTheme.softSage, ThusoTheme.mutedSage, ThusoTheme.sageSlate]
    private var tint: Color { ramp[min(max(state.depth, 0), ramp.count - 1)] }
    private var core: Color { ramp[min(max(state.depth, 0) + 1, ramp.count - 1)] }
    /// A settled state blooms wide and soft; a state with something in it draws in on itself.
    private var spread: CGFloat { 0.52 - CGFloat(state.depth) * 0.03 }

    var body: some View {
        ZStack {
            /* The glow. This is the whole difference between a luminous shape and a green circle,
               and it costs one gradient. */
            Circle()
                .fill(RadialGradient(colors: [tint.opacity(0.5), tint.opacity(0.16), tint.opacity(0)],
                                     center: .center, startRadius: size * 0.16, endRadius: size * spread))
                .scaleEffect(drifting ? 1.05 : 0.95)
            ZStack {
                Circle().fill(RadialGradient(colors: [ThusoTheme.paleSage.opacity(0.9), tint, core],
                                             center: UnitPoint(x: 0.36, y: 0.30),
                                             startRadius: size * 0.06, endRadius: size * 0.44))
                Ellipse().fill(core.opacity(0.75))
                    .frame(width: size * 0.52, height: size * 0.44).blur(radius: size * 0.08)
                    .offset(x: drifting ? size * 0.08 : -size * 0.06, y: drifting ? size * 0.10 : size * 0.03)
                Ellipse().fill(ThusoTheme.paleSage.opacity(0.85))
                    .frame(width: size * 0.34, height: size * 0.30).blur(radius: size * 0.07)
                    .offset(x: drifting ? -size * 0.12 : -size * 0.02, y: drifting ? -size * 0.09 : size * 0.06)
                /* One highlight, well off centre. Centred it hollows the shape out into a ring —
                   which is what a first pass at this looked like. */
                Circle().fill(Color.white.opacity(0.42))
                    .frame(width: size * 0.20, height: size * 0.20).blur(radius: size * 0.07)
                    .offset(x: -size * 0.15, y: -size * 0.17)
            }
            .frame(width: size * 0.76, height: size * 0.76)
            /* The edge is a gradient rather than a clip. A clipped circle reads as a ball with a
               cut edge; a mask that falls away over the last tenth of the radius is what makes the
               shape look lit from inside rather than drawn on top. */
            .mask(RadialGradient(colors: [.black, .black, .black.opacity(0.86), .clear],
                                 center: .center, startRadius: size * 0.10, endRadius: size * 0.38))
            .scaleEffect(drifting ? 1.02 : 0.98)
        }
        .frame(width: size, height: size)
        /* Hidden rather than described. Everything the drawing means is in the chip and the sentence
           beside it, and "a soft green shape" read aloud is furniture rather than information. */
        .accessibilityHidden(true)
        .onAppear(perform: start)
        /* Stopped when the screen goes away. A repeating animation left running behind a screen
           nobody is looking at is the cost this app can least justify: a phone somebody keeps for
           booking a nurse. */
        .onDisappear { drifting = false }
        .onChange(of: reduceMotion) { _, nowReduced in
            if nowReduced { drifting = false } else { start() }
        }
    }

    /* Reduce Motion stops it rather than slowing it, and the still arrangement is the one the layers
       are laid out for — the two masses balanced rather than caught mid-drift. */
    private func start() {
        guard !reduceMotion else { return }
        withAnimation(.easeInOut(duration: 7).repeatForever(autoreverses: true)) { drifting = true }
    }
}

// MARK: - Two small pieces this screen is the first to need

/* The one way an iOS screen says it is not wired to anything yet.
 *
 * It is the half of apps/web/src/components/NotConnected.tsx that iOS was missing: the sentence is
 * never typed into a screen, it is the sentence in packages/catalog/capabilities.json, and when the
 * capability is connected this renders nothing at all — so nobody has to remember to delete a
 * banner when an integration lands.
 *
 * It lives beside the first screen that needed it rather than in the design system, because moving
 * it there is a change to files this one is not the only session in tonight. The second screen to
 * name a capability should move it. */
struct CapabilityNotice: View {
    /// An id in packages/catalog/capabilities.json.
    let of: String
    var body: some View {
        if let notice = Capabilities.notice(for: of) {
            HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space8) {
                Image(systemName: "info.circle").font(.footnote).foregroundStyle(ThusoTheme.charcoal)
                    .accessibilityHidden(true)
                Text(notice).font(.footnote).foregroundStyle(ThusoTheme.charcoal)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(ThusoSpacing.space12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(ThusoTheme.cloud, in: RoundedRectangle(cornerRadius: ThusoRadius.card, style: .continuous))
            /* A note rather than a status: it is true when the screen opens and does not change, so
               announcing it as a live update would interrupt a reader mid-sentence for old news. */
            .accessibilityElement(children: .combine)
        }
    }
}

/// The small charcoal chip that floats above the drawing and says, in words, which state this is.
private struct StateChip: View {
    let text: String
    init(_ text: String) { self.text = text }
    @Environment(\.dynamicTypeSize) private var typeSize
    /* A capsule's ends curve in by half its height, so a label that has wrapped is cut off by its
       own background. Past the accessibility sizes it becomes a rounded chip — the trade the rest
       of this app's chips already make. */
    private var shape: AnyShape {
        typeSize.isAccessibilitySize ? AnyShape(RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous)) : AnyShape(Capsule())
    }
    var body: some View {
        Text(text).font(.caption.weight(.semibold)).foregroundStyle(.white)
            .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, ThusoSpacing.space12).padding(.vertical, ThusoSpacing.space8)
            .background(ThusoTheme.charcoal, in: shape)
    }
}
