import SwiftUI

/* A drawing of an assistant, and nothing else.

   The founder asked for the AI-sphere language: one luminous volumetric orb on a dark ground,
   breathing at rest, reacting when it has something to work through, with minimal centred type
   around it. This screen is that. What it is not — and what nothing on it may ever imply it is —
   is a voice product.

   packages/catalog/capabilities.json carries `voice` with connected: false and three things
   blocking it: no speech model, vendor or licence; no microphone permission declared on either
   native app, deliberately; and nothing designed for what happens to a recording of a person
   describing a symptom under POPIA. Its neverSoften note is the rule this file is written to:

       "No microphone affordance may be drawn — not an enabled one, not a disabled one, not a
        decorative one. A control that looks like it is listening and is not is worse than no
        control, and on a health product it is the kind of worse that gets believed."

   THE SPHERE IS THE ANSWER TO THAT RULE RATHER THAN A DECORATION ON TOP OF IT. Every shape a
   person expects an assistant to be — the capsule, the bar meter, the ring around a glyph — is a
   picture of hearing. A sphere is a picture of presence: it has no mouth and no aperture, it is lit
   rather than listening, and there is nothing on it to press. So there is no microphone glyph here,
   no waveform, no listening ring, no tap-to-speak, and no disabled control with an explanation
   attached. The reason a disabled one is refused as firmly as an enabled one is that a person does
   not read the disabled state — they read the shape, learn that this app listens, and one day say
   something to it that it never heard. On a health product that sentence could be a symptom.

   The contract's own notice sits directly under the sphere, rendered by CapabilityNotice from
   packages/catalog/capabilities.json rather than typed here, on the light panel it has everywhere
   else in the app. It is the second thing on the screen on purpose: the drawing is the first thing
   a person sees and the sentence correcting what they assumed about it is the next.

   What the orb shows is honest on its own terms. It reflects one of four situations, each of which
   is a real thing this product has a contract for: a visit on the first day the scheduling contract
   offers, a laboratory result released, a registration inside the forty-five days after which
   vetting withdraws dispatch by arithmetic, and nothing at all — which is the state a well person
   should be in most of the time. Nothing on the screen is connected to any of them yet, which the
   notice says once, in the contract's own words, and the chooser repeats in its own.

   Two things about how it is drawn.

   Sage is a fill and never a label. The orb is sage; every word on this screen is studioPaper
   (#F5F4EF, 13.6:1 on the ground) or paleSage (#C8D5BB, 9.8:1), and the state is never carried by
   the colour alone either — the line under the sphere says which state this is, in words, for a
   reader who cannot tell four greens apart or is listening to the screen.

   The animation stops rather than slows. Under Reduce Motion the sphere is a still object with
   every layer still drawn, not a blank circle: AssistantSphere pauses its timeline and substitutes
   one fixed moment. The gathering reaction is suppressed on the same setting, here, because it is
   this screen that starts it. */

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
    /// The moment the sphere was last handed something new. It drives the gathering reaction and
    /// nothing else; the sphere ignores it entirely under Reduce Motion.
    @State private var gatheredAt: Date?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var typeSize
    private let states = AssistantState.all
    /// The capability this screen depends on. Named once, here, so the sentence below the sphere
    /// and the reasons further down come from the same row of the contract.
    private let capability = "voice"

    var body: some View {
        ScrollView {
            VStack(spacing: ThusoSpacing.space32) {
                stage
                CapabilityNotice(of: capability)
                chooser
                refusals
            }
            .padding(.top, ThusoSpacing.space16)
            .padding(.bottom, ThusoSpacing.space40)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .background(ground.ignoresSafeArea())
        /* Inline rather than large, and the reason is legibility before taste. The system large
           title ignores toolbarColorScheme on this OS and came out near-black on a night ground —
           about 1.2:1, which is no title at all. The inline title answers the setting. A principal
           toolbar item would have given this screen the colour outright and was tried first; it
           takes the bar's name away with it, and AssistantTests asks the accessibility tree for a
           navigation bar called Assistant to know the screen opened. The name is worth more than
           the control. It also costs the drawing nothing: a hundred points of large title above a
           shape meant to dominate is a hundred points spent arguing with it. */
        .navigationTitle("Assistant").navigationBarTitleDisplayMode(.inline)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .onAppear { gather() }
        .onChange(of: showing.id) { _, _ in gather() }
    }

    /// Reduce Motion is answered by never starting the reaction, not by shortening it. A gathering
    /// that runs for a third of a second is still a thing that moved.
    private func gather() { gatheredAt = reduceMotion ? nil : Date() }

    /* The ground the sphere is lit against. Two steps rather than one: a flat fill under a
       luminous object is the thing that makes it look pasted on, and the darker top gives the
       large title something to sit on. Every word on this screen was measured against the lighter
       of the two — studioNight, #202923 — so the ratios below are the worst case rather than the
       flattering one. */
    private var ground: some View {
        LinearGradient(colors: [ThusoTheme.studioInkDeep, ThusoTheme.studioNight, ThusoTheme.studioInkDeep],
                       startPoint: .top, endPoint: .bottom)
    }

    // MARK: - The sphere and the few words around it

    /* One thing on this screen is large and it is the drawing. Everything under it is centred,
       narrow and quiet: a label, a figure where the app genuinely has one, and a sentence. The
       sphere gives up a little size at the accessibility text sizes so the words it is explaining
       still fit on a screen with it. */
    private var stage: some View {
        VStack(spacing: ThusoSpacing.space24) {
            AssistantSphere(size: typeSize.isAccessibilitySize ? 208 : 276,
                            depth: showing.depth, gatheredAt: gatheredAt)
            VStack(spacing: ThusoSpacing.space12) {
                Text(showing.name)
                    .thusoFont(ThusoType.caption, weight: .semibold)
                    .tracking(1.4)
                    .foregroundStyle(ThusoTheme.paleSage)
                if let figure = showing.figure {
                    /* A semantic style at the lightest weight, not a point size: the genre's big
                       thin numeral, but one that still answers the text-size setting. */
                    Text(figure).font(.system(.largeTitle, design: .default, weight: .ultraLight))
                        .foregroundStyle(ThusoTheme.studioPaper)
                    if let label = showing.figureLabel {
                        Text(label).thusoFont(ThusoType.caption)
                            .foregroundStyle(ThusoTheme.paleSage)
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                Text(showing.sentence)
                    .thusoFont(ThusoType.cardTitle)
                    .foregroundStyle(ThusoTheme.studioPaper)
                    .lineSpacing(5)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            /* Read as one thing. Four fragments of text stacked under a drawing are four stops for
               a listener and one thought for everybody else. */
            .accessibilityElement(children: .combine)
            .frame(maxWidth: 420)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - The legend

    /* Four pills rather than a segmented control: a segmented control is thirty-two points tall at
       every text size, which is the defect that was taken out of the Health Passport. The button's
       own frame is the frame a thumb has to hit, and it is forty-four.

       They choose which of the four the drawing is showing, and the screen says plainly that this
       is a legend rather than a status — nothing here is connected to a visit, a result or a
       register, so there is nothing for the app to work out on its own. */
    private var chooser: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            SceneHeading("What the drawing can say")
            Text("Four situations, and the shape each one takes. Nothing on this screen is watching for them yet — you are choosing which to look at.")
                .thusoFont(ThusoType.caption)
                .foregroundStyle(ThusoTheme.paleSage)
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
                    .foregroundStyle(chosen ? ThusoTheme.studioInkDeep : ThusoTheme.studioPaper)
                    .padding(.horizontal, ThusoSpacing.space12).padding(.vertical, ThusoSpacing.space8)
                    .frame(maxWidth: filling ? .infinity : nil, minHeight: 44)
                    /* The unchosen fill is a seven-per-cent lift off the ground rather than a
                       colour of its own: studioPaper still measures 11.0:1 on it, and mutedSage at
                       seven-tenths gives the edge 3.9:1 against the ground — a control's boundary
                       has a contrast floor of its own and translucency is the usual way it is
                       missed. */
                    .background(chosen ? AnyShapeStyle(ThusoTheme.studioPaper)
                                       : AnyShapeStyle(Color.white.opacity(0.07)),
                                in: RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous)
                        .stroke(chosen ? ThusoTheme.studioPaper : ThusoTheme.mutedSage.opacity(0.7), lineWidth: 1))
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            /* Chosen is said, not only drawn — four identical buttons is what a listener gets
               otherwise, and the pale fill means nothing to them. */
            .accessibilityAddTraits(chosen ? [.isButton, .isSelected] : .isButton)
        }
    }

    /* What is actually in the way, in the contract's own words rather than a summary of them. The
       last block is the rule this screen is held to; it is written for whoever changes the screen
       next, and it is on the screen because a rule kept in a file is a rule somebody breaks by
       accident at eleven at night. */
    private var refusals: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            SceneHeading("Why it cannot listen")
            SceneCard {
                ForEach(Array(Capabilities.blocking(capability).enumerated()), id: \.offset) { index, reason in
                    if index > 0 {
                        Rectangle().fill(ThusoTheme.mutedSage.opacity(0.24)).frame(height: 1)
                            .accessibilityHidden(true)
                    }
                    Text(reason).font(.footnote).foregroundStyle(ThusoTheme.studioPaper)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.vertical, ThusoSpacing.space4)
                }
            }
            if let rule = Capabilities.neverSoften(capability) {
                SceneCard(spacing: ThusoSpacing.space8) {
                    Text("The rule this screen is built to")
                        .thusoFont(ThusoType.caption, weight: .semibold)
                        .foregroundStyle(ThusoTheme.paleSage)
                    Text(rule).font(.footnote).foregroundStyle(ThusoTheme.studioPaper)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }
}

// MARK: - Two small pieces this screen is the only user of

/// A section title on the night ground. The shared CareSectionHeader sets charcoal, which is the
/// right answer on every other screen in this app and unreadable on this one.
private struct SceneHeading: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        Text(text).font(.headline).foregroundStyle(ThusoTheme.studioPaper)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityAddTraits(.isHeader)
    }
}

/// A panel that belongs to the dark ground: a lift rather than a fill, and a hairline rather than a
/// shadow — the same separation rule the light cards follow, spelled the other way up.
private struct SceneCard<Content: View>: View {
    var spacing: CGFloat = ThusoSpacing.space12
    @ViewBuilder var content: Content
    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous)
    }
    var body: some View {
        VStack(alignment: .leading, spacing: spacing) { content }
            .padding(ThusoSpacing.space16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white.opacity(0.06), in: shape)
            .overlay(shape.stroke(ThusoTheme.mutedSage.opacity(0.26), lineWidth: 1))
    }
}
