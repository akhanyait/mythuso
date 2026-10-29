import SwiftUI

/* The v3 pack's helper line (29 October 2026): GilbertOne beside one sentence from
   packages/catalog/gilbertone-states.json, generated into GilbertOneStatesData, so no screen types a word for it.

   GilbertOne is drawn in its still idle pose (GilbertOneIdle, rendered from packages/brand/v3/g1-idle.svg) and is
   decoration: VoiceOver reads the sentence, once. The web's six moving poses are not drawn here yet, so a phone never
   shows a found or success pose it cannot animate the way the web does; the state stays a name in the data. */
struct GilbertOneHelpLine: View {
    let line: GilbertOneHelper

    var body: some View {
        HStack(spacing: ThusoSpacing.space12) {
            Image("GilbertOneIdle").resizable().scaledToFit().frame(width: 46, height: 46).accessibilityHidden(true)
            Text(line.text).font(.thuso(.subheadline)).foregroundStyle(ThusoRole.foreground)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, ThusoSpacing.space12).padding(.vertical, ThusoSpacing.space8)
        .background(ThusoRole.surface, in: RoundedRectangle(cornerRadius: ThusoRadius.lg, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}
