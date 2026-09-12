import SwiftUI

/* THE FORM CONTROLS THIS LANGUAGE DID NOT HAVE, AND WHAT WENT WRONG WITHOUT THEM.
 *
 * DesignSystem/Surface.swift has the panels, the metric, the chip and the pill row — everything a
 * screen needs to *show* something. Six screens were still system `Form`s and `List`s because none
 * of it covered the other half: a screen a clinician types into. This file is that half.
 *
 * A `TextField` outside a `Form` has no boundary at all. It is a caret on whatever is behind it,
 * which on `.thusoGround()` is a caret on a gradient. The screens that had already moved each
 * solved that privately — the consultation's note editor grew a cloud fill, a control radius and a
 * `controlEdge` hairline inline — so the treatment existed once per screen and nowhere by name.
 * It is here now, once. Every boundary is `ThusoTheme.controlEdge`, because that is what a control
 * boundary is in this system, while `stone` is what a card edge is.
 *
 * THE LABEL IS NEVER THE PLACEHOLDER. A placeholder disappears the moment somebody types, which
 * means the one word saying what a field is for is gone exactly when a reader looks up to check
 * they are in the right box — and a placeholder is not a label to VoiceOver either. So every
 * control here has a real label above it and the hint inside is a hint.
 *
 * Nothing in this file knows anything about health. It is shape only. */

// MARK: - Things a person types into

struct WriteField: View {
    let label: String
    @Binding var text: String
    var hint: String = ""
    /// The sentence under the field. Red is reserved: `wrong` is what makes it a fault rather than
    /// a note, and the sentence itself still has to say what to do about it.
    var note: String = ""
    var wrong = false
    var keyboard: UIKeyboardType = .default
    var contentType: UITextContentType?
    private var shape: RoundedRectangle { RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous) }
    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label).font(.footnote.weight(.semibold))
                .foregroundStyle(ThusoTheme.studioInkMuted)
                .fixedSize(horizontal: false, vertical: true)
            TextField(hint, text: $text)
                .font(.body).foregroundStyle(ThusoTheme.charcoal)
                .keyboardType(keyboard).textContentType(contentType)
                .padding(.horizontal, ThusoSpacing.space12)
                .frame(minHeight: 48)
                .background(ThusoTheme.surface, in: shape)
                .overlay(shape.stroke(wrong ? ThusoTheme.danger : ThusoTheme.controlEdge, lineWidth: 1))
                .accessibilityLabel(label)
            if !note.isEmpty {
                Text(note).font(.footnote)
                    .foregroundStyle(wrong ? ThusoTheme.danger : ThusoTheme.studioInkMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Several lines of somebody's own words. Recessed rather than white, because a box a person is
/// being asked to fill should look like a hole and not like another card.
struct WriteNote: View {
    let label: String
    @Binding var text: String
    var prompt: String = ""
    var minHeight: CGFloat = 96
    var body: some View {
        let shape = RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous)
        return VStack(alignment: .leading, spacing: 5) {
            Text(label).font(.footnote.weight(.semibold))
                .foregroundStyle(ThusoTheme.studioInkMuted)
                .fixedSize(horizontal: false, vertical: true)
            TextEditor(text: $text)
                .font(.body).foregroundStyle(ThusoTheme.charcoal)
                .frame(minHeight: minHeight).scrollContentBackground(.hidden)
                .padding(ThusoSpacing.space8)
                .background(ThusoTheme.cloud, in: shape)
                .overlay(shape.stroke(ThusoTheme.controlEdge, lineWidth: 1))
                .accessibilityLabel(label)
            if !prompt.isEmpty {
                Text(prompt).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Things a person chooses between

/* One of a few, as rows rather than as a segmented control.
 *
 * `UISegmentedControl` is what this replaces, and it had to go from the dispatch board in
 * particular. It paints iOS's own greys rather than the palette, it cannot wrap, and at the
 * accessibility sizes three visit references in one bar become three ellipses — a controller
 * choosing between jobs by tapping a row of dots. Rows cost vertical space and give back the whole
 * label, a 48-point target each, and a selected state that is a fill and a weight rather than a
 * tint. Horizontal while the labels fit and a column when they do not, decided by ViewThatFits
 * from the scaled text itself rather than from a size class. */
struct ChoiceRow<Value: Hashable>: View {
    let label: String
    @Binding var selection: Value
    let options: [(value: Value, title: String)]
    var body: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            Text(label).font(.footnote.weight(.semibold))
                .foregroundStyle(ThusoTheme.studioInkMuted)
                .fixedSize(horizontal: false, vertical: true)
            ViewThatFits(in: .horizontal) {
                HStack(spacing: ThusoSpacing.space8) { buttons }
                VStack(spacing: ThusoSpacing.space8) { buttons }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(label)
    }
    @ViewBuilder private var buttons: some View {
        ForEach(options, id: \.value) { option in
            let on = option.value == selection
            Button { selection = option.value } label: {
                Text(option.title)
                    .font(.subheadline.weight(on ? .semibold : .regular))
                    .foregroundStyle(on ? ThusoTheme.studioPaper : ThusoTheme.charcoal)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, ThusoSpacing.space12)
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .background(on ? ThusoTheme.studioNight : ThusoTheme.surface,
                                in: RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous)
                        .stroke(on ? ThusoTheme.studioNight : ThusoTheme.controlEdge, lineWidth: 1))
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
        }
    }
}

/* A long list of options — a next step, an outcome, a relationship. A menu rather than rows:
   eleven inline rows is a screen of radio buttons between a nurse and the button she came for, and
   once she has chosen, the chosen one is the only one she needs to see. */
struct PickRow<Value: Hashable>: View {
    let label: String
    @Binding var selection: Value
    let options: [(value: Value, title: String)]
    var note: String = ""
    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            /* Label above rather than beside. A picker's own chosen value can be a whole sentence
               here — "Advise clinic or emergency department now" — and beside a label it gets the
               narrower half of the row and truncates the end, which on a next step is the part that
               says what to do. */
            Text(label).font(.footnote.weight(.semibold))
                .foregroundStyle(ThusoTheme.studioInkMuted)
                .fixedSize(horizontal: false, vertical: true)
            /* The padding is inside the picker rather than around it. A menu picker publishes the
               height of its own content as the control's accessibility frame, so a frame put on the
               outside leaves a 34-point target sitting in a 48-point box — which is what the audit
               measured the first time this shipped. Padding grows the content, and the frame is
               what the eye sees. */
            Picker(label, selection: $selection) {
                ForEach(options, id: \.value) { Text($0.title).tag($0.value) }
            }
            .labelsHidden().tint(ThusoTheme.charcoal)
            .padding(.vertical, ThusoSpacing.space8).padding(.horizontal, ThusoSpacing.space8)
            .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
            .contentShape(Rectangle())
            .background(ThusoTheme.surface, in: RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous)
                .stroke(ThusoTheme.controlEdge, lineWidth: 1))
            .accessibilityLabel(label)
            if !note.isEmpty {
                Text(note).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/* A yes/no somebody is answering about themselves, so the words get the width and the switch gets
   the edge.

   THIS IS A CUSTOM ToggleStyle FOR ONE REASON, AND IT IS NOT DECORATION. A stock SwiftUI `Toggle`
   publishes the geometry of UIKit's own switch as the accessibility frame of the control, and
   nothing outside it changes that: `.frame(minHeight: 44)` on the Toggle, on its label, and padding
   around either, all come back at twenty-eight points. Audit.knownUndersized already carries an
   entry for one such toggle saying exactly that, and it is right — what it could not say, because
   nothing in this app had tried it, is that the fix is to stop letting UIKit own the switch.

   A ToggleStyle's `makeBody` IS the control, so the frame the audit measures is the frame written
   here: a full-width row, at least forty-four points tall, all of it tappable. The traits are still
   a switch's, VoiceOver still says on and off, and the switch is still drawn — it is just drawn out
   of the palette rather than out of UIKit, which is also how it stops being the one blue thing on a
   screen with no blue in it. The knob moves as well as the fill changing, so the state is never
   only a colour. */
struct ThusoSwitchStyle: ToggleStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    func makeBody(configuration: Configuration) -> some View {
        Button {
            configuration.isOn.toggle()
        } label: {
            HStack(alignment: .top, spacing: ThusoSpacing.space12) {
                configuration.label
                    .frame(maxWidth: .infinity, alignment: .leading)
                switchMark(configuration.isOn)
            }
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
    private func switchMark(_ on: Bool) -> some View {
        Capsule()
            .fill(on ? ThusoTheme.studioNight : ThusoTheme.cloud)
            .overlay(Capsule().stroke(on ? ThusoTheme.studioNight : ThusoTheme.controlEdge, lineWidth: 1))
            .frame(width: 50, height: 30)
            .overlay(alignment: on ? .trailing : .leading) {
                Circle().fill(ThusoTheme.surface)
                    .overlay(Circle().stroke(ThusoTheme.controlEdge.opacity(on ? 0 : 1), lineWidth: 1))
                    .frame(width: 24, height: 24)
                    .padding(.horizontal, 3)
            }
            .animation(reduceMotion ? nil : .snappy(duration: 0.18), value: on)
            .accessibilityHidden(true)
    }
}

struct AgreeRow: View {
    let text: String
    @Binding var on: Bool
    var body: some View {
        Toggle(isOn: $on) {
            Text(text).font(.subheadline).foregroundStyle(ThusoTheme.charcoal)
                .fixedSize(horizontal: false, vertical: true)
        }
        .toggleStyle(ThusoSwitchStyle())
    }
}

/// One choice out of a few, where each carries the sentence that explains it. The radio is the
/// mark; the whole card is the target, because a nurse on a doorstep is not aiming at a circle
/// twenty points across.
struct ChoiceCard: View {
    let title: String
    let detail: String
    var footnote: String = ""
    let chosen: Bool
    var choose: () -> Void
    var body: some View {
        Button(action: choose) {
            HStack(alignment: .top, spacing: ThusoSpacing.space12) {
                Image(systemName: chosen ? "largecircle.fill.circle" : "circle")
                    .font(.title3).foregroundStyle(ThusoTheme.charcoal)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
                    Text(title).thusoFont(ThusoType.cardTitle, weight: .semibold).foregroundStyle(ThusoTheme.charcoal)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(detail).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                    if !footnote.isEmpty {
                        Text(footnote).font(.footnote.weight(.medium)).foregroundStyle(ThusoTheme.charcoal)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(ThusoSpacing.space16)
            .frame(maxWidth: .infinity, alignment: .leading)
            /* The soft tile marks the chosen one, and the charcoal hairline marks it a second
               time — colour is never the only difference between two states, and the radio mark is
               the third. Charcoal reads 11.93:1 on studioLilac. Lilac rather than lime because this
               is a full-width card in a list of two or three: a lime panel of that size is the lead
               card the design deliberately does not have. The loud fill is spent on the time-slot
               grid, where the chosen object is one chip out of twelve. */
            .background(chosen ? ThusoTheme.studioLilac : ThusoTheme.surface,
                        in: RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous)
                .stroke(chosen ? ThusoTheme.charcoal : ThusoTheme.studioLine, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(chosen ? [.isButton, .isSelected] : .isButton)
    }
}

/// A checkable line in a list of them — a symptom, an item on a round. Same target rule as
/// ChoiceCard, and the tick is a mark rather than a colour.
struct TickRow: View {
    let title: String
    let ticked: Bool
    var toggle: () -> Void
    var body: some View {
        Button(action: toggle) {
            HStack(spacing: ThusoSpacing.space12) {
                Image(systemName: ticked ? "checkmark.square.fill" : "square")
                    .font(.title3).foregroundStyle(ThusoTheme.charcoal)
                    .accessibilityHidden(true)
                Text(title).font(.subheadline).foregroundStyle(ThusoTheme.charcoal)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(ticked ? [.isButton, .isSelected] : .isButton)
    }
}
