import SwiftUI

/* A label, its control, and the hint or the error beneath it — the web's Field.tsx.
 *
 * THE LABEL IS NEVER THE PLACEHOLDER. A placeholder disappears the moment somebody types, and it is
 * not a label to VoiceOver either; so every field has a real label above it and the prompt inside
 * the control is a prompt. The asterisk is decoration hidden from assistive technology, because the
 * label announces "required" in words. An error replaces the hint rather than sitting beside it, as
 * on the web — two sentences under one field is one more than a person reads.
 *
 * The control is whatever the caller puts inside: a ThusoTextField, a ThusoTextEditor, a
 * ThusoPicker, a ThusoCheckbox — or any view. The field gives it the label for VoiceOver and the
 * message as its hint, so a caller cannot forget to. */
struct ThusoField<Control: View>: View {
    let label: String
    var hint: String?
    var error: String?
    var required = false
    @ViewBuilder var control: Control

    private var message: String? { error ?? hint }

    var body: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space4 + 2) {
            HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space4) {
                Text(label).font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                if required {
                    Text("*").font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(ThusoRole.dangerInk)
                        .accessibilityHidden(true)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(required ? "\(label), required" : label)
            control
                .environment(\.thusoFieldInvalid, error != nil)
                .accessibilityLabel(required ? "\(label), required" : label)
                .accessibilityHint(message ?? "")
            if let message {
                Text(message).font(.thuso(.caption))
                    .foregroundStyle(error != nil ? ThusoRole.dangerInk : ThusoRole.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Whether the field a control sits in is showing an error, so the control's edge can say so.
private struct ThusoFieldInvalidKey: EnvironmentKey { static let defaultValue = false }
extension EnvironmentValues {
    var thusoFieldInvalid: Bool {
        get { self[ThusoFieldInvalidKey.self] }
        set { self[ThusoFieldInvalidKey.self] = newValue }
    }
}

/* The boundary every typed-into control wears. 44 tall rather than the handoff's 40. The resting
   edge is the muted ink rather than the handoff's input colour (ThusoRole.inputEdge says why),
   focus turns it to the ring, and invalid turns it to the danger ink, which a boundary can be seen
   in — the words under the field say what is wrong. */
struct ThusoControlChrome: ViewModifier {
    var focused = false
    var multiline = false
    @Environment(\.thusoFieldInvalid) private var invalid
    @Environment(\.isEnabled) private var enabled
    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: ThusoRadius.md, style: .continuous)
        content
            .font(.thuso(.subheadline))
            .foregroundStyle(ThusoRole.foreground)
            .padding(.horizontal, ThusoSpacing.space12)
            .padding(.vertical, multiline ? ThusoSpacing.space20 / 2 : 0)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .background(ThusoRole.surface, in: shape)
            .overlay(shape.stroke(invalid ? ThusoRole.dangerInk : focused ? ThusoRole.ring : ThusoRole.inputEdge,
                                  lineWidth: focused || invalid ? 1.5 : 1))
            .thusoShadow()
            .opacity(enabled ? 1 : 0.5)
    }
}

struct ThusoTextField: View {
    @Binding var text: String
    var prompt: String = ""
    var keyboard: UIKeyboardType = .default
    var contentType: UITextContentType?
    var submitLabel: SubmitLabel = .done
    var onSubmit: () -> Void = {}
    @FocusState private var focused: Bool
    var body: some View {
        TextField(prompt, text: $text)
            .keyboardType(keyboard).textContentType(contentType)
            .submitLabel(submitLabel).onSubmit(onSubmit)
            .focused($focused)
            .modifier(ThusoControlChrome(focused: focused))
    }
}

struct ThusoTextEditor: View {
    @Binding var text: String
    var prompt: String = ""
    var minHeight: CGFloat = ThusoSpacing.space32 * 3
    @FocusState private var focused: Bool
    var body: some View {
        TextEditor(text: $text)
            .scrollContentBackground(.hidden)
            .frame(minHeight: minHeight)
            .focused($focused)
            .overlay(alignment: .topLeading) {
                if text.isEmpty && !prompt.isEmpty {
                    Text(prompt).font(.thuso(.subheadline)).foregroundStyle(ThusoRole.mutedForeground)
                        .padding(.top, ThusoSpacing.space8).padding(.leading, ThusoSpacing.space4 + 1)
                        .allowsHitTesting(false).accessibilityHidden(true)
                }
            }
            .modifier(ThusoControlChrome(focused: focused, multiline: true))
    }
}

/// A menu picker in the same chrome, its chevron drawn by the component.
struct ThusoPicker<Value: Hashable>: View {
    @Binding var selection: Value
    let options: [(value: Value, title: String)]
    var body: some View {
        Menu {
            ForEach(options, id: \.value) { option in
                Button(option.title) { selection = option.value }
            }
        } label: {
            HStack(spacing: ThusoSpacing.space8) {
                Text(options.first { $0.value == selection }?.title ?? "")
                    .font(.thuso(.subheadline)).foregroundStyle(ThusoRole.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                Image(systemName: "chevron.down").font(.thuso(.footnote, weight: .semibold))
                    .foregroundStyle(ThusoRole.mutedForeground).accessibilityHidden(true)
            }
            .contentShape(Rectangle())
        }
        .modifier(ThusoControlChrome())
        .accessibilityValue(options.first { $0.value == selection }?.title ?? "")
    }
}

/* An independent yes-or-no drawn as the handoff's checkbox: a sixteen-point box beside its words,
   on a 44-tall row that is the target — the exemption tokens.json writes down for an input a design
   hides behind its own label. Checked differs from unchecked by the drawn tick, never by the fill
   alone, and to VoiceOver it is still a toggle. */
struct ThusoCheckbox: View {
    @Binding var isOn: Bool
    let label: String
    var body: some View {
        Toggle(isOn: $isOn) {
            Text(label).font(.thuso(.subheadline)).foregroundStyle(ThusoRole.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
        .toggleStyle(ThusoCheckboxStyle())
    }
}

struct ThusoCheckboxStyle: ToggleStyle {
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        Button { configuration.isOn.toggle() } label: {
            HStack(alignment: .top, spacing: ThusoSpacing.space20 / 2) {
                RoundedRectangle(cornerRadius: ThusoRadius.sm, style: .continuous)
                    .fill(configuration.isOn ? ThusoRole.primary : ThusoRole.surface)
                    .overlay(RoundedRectangle(cornerRadius: ThusoRadius.sm, style: .continuous)
                        .stroke(configuration.isOn ? ThusoRole.primary : ThusoRole.inputEdge, lineWidth: 1))
                    .overlay {
                        if configuration.isOn {
                            /* Drawn to the box rather than set at a size: the tick is a glyph, not text. */
                            Image(systemName: "checkmark").resizable().scaledToFit().fontWeight(.bold)
                                .foregroundStyle(ThusoRole.primaryForeground).padding(3)
                        }
                    }
                    .frame(width: ThusoSpacing.space16, height: ThusoSpacing.space16)
                    .padding(.top, 2)
                    .accessibilityHidden(true)
                configuration.label.frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.vertical, ThusoSpacing.space12)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
            .opacity(enabled ? 1 : 0.5)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(configuration.isOn ? [.isSelected] : [])
    }
}
