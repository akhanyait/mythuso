import SwiftUI

/* Care tips, after a visit: one card in front, the next two behind it, read one at a time.
 *
 * Ported from apps/web/src/features/CareTips.tsx. Every word is CareTipsData's, generated from
 * packages/catalog/care-tips.json — the tips, the buttons, the three refusals and the reviewer
 * notice — so the phone cannot word a caution differently from the web.
 *
 * The reviewer notice sits directly under the two buttons, never in the panel below: it qualifies
 * every card, and at the accessibility sizes that panel is several screens away.
 *
 * Motion: the front card is keyed on the tip, so a change inserts a new card with a rise and a
 * slight scale, on the tokens' curve and entrance duration, and removes the old one by fading. Under
 * Reduce Motion there is no animation at all — the new card is simply there. */

struct CareTipsView: View {
    @State private var at = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var tips: [CareTip] { CareTips.all }
    private var tip: CareTip { tips[at] }
    private var last: Bool { at == tips.count - 1 }

    private func go(_ index: Int) {
        withAnimation(reduceMotion ? nil : ThusoMotion.soft(ThusoMotion.enter)) { at = index }
        AccessibilityNotification.Announcement("\(CareTips.counter(index)). \(tips[index].title)").post()
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space20) {
                DemoBadge()
                intro
                progress
                stack
                actions
                HStack(alignment: .top, spacing: ThusoSpacing.space8) {
                    Image(systemName: "checkmark.shield").accessibilityHidden(true)
                    Text(CareTipsData.Review.notice).fixedSize(horizontal: false, vertical: true)
                }
                .font(.subheadline).foregroundStyle(ThusoTheme.studioInk)
                .accessibilityElement(children: .combine)
                refusals
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle(CareTipsData.Door.opens).navigationBarTitleDisplayMode(.inline)
    }

    private var intro: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            Text(CareTipsData.Screen.eyebrow).thusoFont(ThusoType.caption, weight: .semibold).foregroundStyle(ThusoTheme.studioInkMuted)
            Text(CareTipsData.Screen.heading).thusoFont(ThusoType.heading, weight: .semibold)
                .foregroundStyle(ThusoTheme.charcoal).fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            Text(CareTipsData.Screen.lead).font(.subheadline).foregroundStyle(ThusoTheme.studioInkMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    /* One segment per tip, each a whole 44-point button with a bar drawn inside it. Read and unread
       differ in colour, the current one is also thicker, and the card's counter says it in words. */
    private var progress: some View {
        HStack(spacing: ThusoSpacing.space8) {
            ForEach(Array(tips.enumerated()), id: \.element.id) { index, _ in
                Button { go(index) } label: {
                    Capsule().fill(index <= at ? ThusoTheme.studioInk : ThusoTheme.sageSlate)
                        .frame(height: index == at ? 8 : 4)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(CareTips.jumpLabel(index))
                .accessibilityAddTraits(index == at ? .isSelected : [])
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(CareTipsData.Screen.progressLabel)
    }

    /* The front card decides the height, so it grows with the text; the two behind are drawn in its
       background, inset and dropped, so they peek out underneath it. */
    private var stack: some View {
        let behind = CareTips.behind(at)
        let shape = RoundedRectangle(cornerRadius: ThusoRadius.card, style: .continuous)
        return ZStack {
            card(tip)
                .id(tip.id)
                .transition(reduceMotion ? .identity : .asymmetric(
                    insertion: .opacity.combined(with: .offset(y: ThusoSpacing.space24)).combined(with: .scale(scale: 0.96)),
                    removal: .opacity))
        }
        .padding(.bottom, ThusoSpacing.space24)
        .background(alignment: .top) {
            ZStack(alignment: .top) {
                if behind.count > 1 {
                    shape.fill(behind[1].fill).padding(.horizontal, ThusoSpacing.space24).padding(.top, ThusoSpacing.space24)
                }
                if let next = behind.first {
                    shape.fill(next.fill).padding(.horizontal, ThusoSpacing.space12).padding(.vertical, ThusoSpacing.space12)
                }
            }
            .accessibilityHidden(true)
        }
    }

    private func card(_ tip: CareTip) -> some View {
        let chip = tip.dark ? ThusoTheme.studioLime : ThusoTheme.surface
        let chipInk = tip.dark ? ThusoTheme.studioInk : tip.ink
        return VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
            ViewThatFits(in: .horizontal) {
                HStack {
                    Text(tip.tag).font(.footnote.weight(.semibold)).foregroundStyle(chipInk)
                        .padding(.horizontal, ThusoSpacing.space12).padding(.vertical, ThusoSpacing.space4)
                        .background(chip, in: Capsule())
                    Spacer(minLength: ThusoSpacing.space8)
                    Text(CareTips.counter(at)).font(.footnote.monospacedDigit()).foregroundStyle(tip.ink)
                }
                VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
                    Text(tip.tag).font(.footnote.weight(.semibold)).foregroundStyle(chipInk)
                        .padding(.horizontal, ThusoSpacing.space12).padding(.vertical, ThusoSpacing.space4)
                        .background(chip, in: RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous))
                    Text(CareTips.counter(at)).font(.footnote.monospacedDigit()).foregroundStyle(tip.ink)
                }
            }
            Image(systemName: symbol(tip.category))
                .font(.largeTitle.weight(.light))
                .foregroundStyle(chipInk)
                .padding(ThusoSpacing.space8)
                .frame(minWidth: 72, minHeight: 72)
                .background(chip, in: RoundedRectangle(cornerRadius: ThusoRadius.tile, style: .continuous))
                .accessibilityHidden(true)
            Spacer(minLength: ThusoSpacing.space8)
            Text(tip.title).thusoFont(24, weight: .semibold).foregroundStyle(tip.ink)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            Text(tip.body).font(.body).foregroundStyle(tip.ink)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(ThusoSpacing.space24)
        .frame(maxWidth: .infinity, minHeight: 340, alignment: .topLeading)
        .background(tip.fill, in: RoundedRectangle(cornerRadius: ThusoRadius.card, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    /* A picture, not a sentence, so it lives with the screen; a category the contract adds later
       draws the generic mark rather than nothing. */
    private func symbol(_ category: String) -> String {
        switch category {
        case "medicines": return "pills"
        case "blood-pressure": return "heart.text.square"
        case "be-ready": return "bag"
        case "water": return "drop"
        case "when-to-call": return "phone"
        default: return "checkmark.shield"
        }
    }

    private var actions: some View {
        HStack(spacing: ThusoSpacing.space12) {
            Button { go(at - 1) } label: {
                Label(CareTipsData.Screen.back, systemImage: "arrow.left")
            }
            .buttonStyle(QuietButton())
            .disabled(at == 0)
            .frame(maxWidth: .infinity)
            .layoutPriority(1)
            Button { go(last ? 0 : at + 1) } label: {
                if last { Label(CareTipsData.Screen.startAgain, systemImage: "arrow.counterclockwise") }
                else { Label(CareTipsData.Screen.next, systemImage: "arrow.right") }
            }
            .buttonStyle(CareButton())
            .frame(maxWidth: .infinity)
            .layoutPriority(2)
        }
    }

    private var refusals: some View {
        SurfacePanel(spacing: ThusoSpacing.space12) {
            Text(CareTipsData.Screen.refusalsHeading).font(.headline).foregroundStyle(ThusoTheme.charcoal)
                .accessibilityAddTraits(.isHeader)
            ForEach(CareTipsData.refusals, id: \.self) { sentence in
                HStack(alignment: .top, spacing: ThusoSpacing.space12) {
                    Image(systemName: "nosign").foregroundStyle(ThusoTheme.studioInkMuted).accessibilityHidden(true)
                    Text(sentence).font(.subheadline).foregroundStyle(ThusoTheme.studioInk)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .accessibilityElement(children: .combine)
            }
            NavigationLink { SosView() } label: {
                Label(CareTipsData.Screen.emergencyLabel, systemImage: "cross.case")
            }
            .buttonStyle(QuietButton())
        }
    }
}
