import SwiftUI

/* The palette itself is generated into DesignSystem/Tokens.swift from
   packages/design-tokens/tokens.json, so a colour is converted from hex once, by a machine, rather
   than three times by hand. Only the alias below is a design decision rather than a token: sage is
   what the clinical chart calls the soft teal it fills an in-range reading with. */
extension ThusoTheme {
    static let sage = tealSoft
}
struct CareCard<Content: View>: View {
    var padding: CGFloat = 18
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 13) { content }
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.white, in: RoundedRectangle(cornerRadius: 18))
            .overlay(RoundedRectangle(cornerRadius: 18).stroke(ThusoTheme.line, lineWidth: 1))
            .shadow(color: Color(red: 0.063, green: 0.176, blue: 0.149).opacity(0.05), radius: 12, y: 4)
    }
}
struct CareHeading: View {
    let eyebrow: String
    let title: String
    let subtitle: String
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !eyebrow.isEmpty {
                Text(eyebrow.uppercased()).font(.caption2.weight(.bold)).tracking(1.5).foregroundStyle(ThusoTheme.indigo)
            }
            Text(title).font(.title2.weight(.bold)).foregroundStyle(ThusoTheme.ink)
            if !subtitle.isEmpty { Text(subtitle).font(.subheadline).foregroundStyle(ThusoTheme.body) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
struct CareButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .padding(15).frame(maxWidth: .infinity, minHeight: 50)
            .background(ThusoTheme.indigo.opacity(configuration.isPressed ? 0.82 : 1), in: RoundedRectangle(cornerRadius: 12))
            .foregroundStyle(.white)
    }
}
struct QuietButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .padding(15).frame(maxWidth: .infinity, minHeight: 50)
            .background(configuration.isPressed ? ThusoTheme.indigoSoft : .white, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(ThusoTheme.line, lineWidth: 1))
            .foregroundStyle(ThusoTheme.slate)
    }
}
/// A soft tinted square holding a symbol — the repeating unit of the whole design.
struct TileIcon: View {
    let symbol: String
    var tint: Color = ThusoTheme.indigo
    var background: Color = ThusoTheme.indigoSoft
    var size: CGFloat = 44
    var body: some View {
        Image(systemName: symbol).font(.system(size: size * 0.44, weight: .medium))
            .foregroundStyle(tint).frame(width: size, height: size)
            .background(background, in: RoundedRectangle(cornerRadius: size * 0.32))
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
        case "light": return (Color.white.opacity(0.18), Color(red: 0.91, green: 0.96, blue: 0.94))
        default: return (ThusoTheme.indigoSoft, ThusoTheme.indigoDeep)
        }
    }
    var body: some View {
        Text(text).font(.caption2.weight(.semibold))
            .padding(.horizontal, 10).padding(.vertical, 5)
            .background(colors.0, in: Capsule()).foregroundStyle(colors.1)
    }
}
struct StepDots: View {
    let step: Int
    let total: Int
    let label: String
    var body: some View {
        HStack(spacing: 10) {
            Text("Step \(step) of \(total)").font(.caption.weight(.semibold)).foregroundStyle(ThusoTheme.indigo)
            Text(label).font(.caption).foregroundStyle(ThusoTheme.body)
            Spacer()
            HStack(spacing: 6) {
                ForEach(1...total, id: \.self) { index in
                    Capsule().fill(index <= step ? ThusoTheme.indigo : ThusoTheme.line)
                        .frame(width: index == step ? 20 : 8, height: 8)
                }
            }
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
    var body: some View {
        ZStack {
            TextField("", text: $code).keyboardType(.numberPad).textContentType(.oneTimeCode)
                .focused($focused).opacity(0.02).accessibilityLabel(label)
                .onChange(of: code) { _, value in code = String(value.filter(\.isNumber).prefix(length)) }
            HStack(spacing: 7) {
                ForEach(0..<length, id: \.self) { index in
                    let digit = index < code.count ? String(Array(code)[index]) : ""
                    Text(digit).font(.title3.weight(.semibold))
                        .frame(maxWidth: .infinity, minHeight: 56)
                        .background(.white, in: RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(
                            invalid ? ThusoTheme.danger : (focused && index == min(code.count, length - 1) ? ThusoTheme.indigo : ThusoTheme.line),
                            lineWidth: 1.5))
                }
                if code.count == length && !invalid {
                    Image(systemName: "checkmark").font(.subheadline.weight(.bold)).foregroundStyle(.white)
                        .frame(width: 34, height: 34).background(ThusoTheme.indigo, in: Circle())
                }
            }
            .allowsHitTesting(false)
        }
        .contentShape(Rectangle())
        .onTapGesture { focused = true }
        .accessibilityElement(children: .contain)
    }
}
struct DemoBadge: View {
    var body: some View {
        Label("Design preview · Fictional data", systemImage: "circle.fill")
            .font(.caption2.weight(.medium)).foregroundStyle(ThusoTheme.indigo)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}
struct MenuRow: View {
    let title: String
    let subtitle: String
    let symbol: String
    var danger = false
    var body: some View {
        HStack(spacing: 13) {
            TileIcon(symbol: symbol, tint: danger ? ThusoTheme.danger : ThusoTheme.indigo,
                     background: danger ? ThusoTheme.danger.opacity(0.1) : ThusoTheme.indigoSoft, size: 38)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(danger ? ThusoTheme.danger : ThusoTheme.ink)
                if !subtitle.isEmpty { Text(subtitle).font(.caption).foregroundStyle(ThusoTheme.body) }
            }
            Spacer(minLength: 8)
            if !danger { Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(ThusoTheme.body.opacity(0.6)) }
        }
        .padding(.vertical, 5)
        .contentShape(Rectangle())
    }
}
struct FeatureDetail: View {
    let title: String
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                DemoBadge()
                CareHeading(eyebrow: "MyThuso", title: title, subtitle: "Connected to your care journey.")
                CareCard {
                    TileIcon(symbol: "sparkles")
                    Text("This workflow will connect to the relevant clinical, operational or partner service in the functionality phase.").font(.subheadline).foregroundStyle(ThusoTheme.ink)
                    Text("No live care, payments, device permissions or clinical decisions are activated.").font(.footnote).foregroundStyle(ThusoTheme.body)
                }
            }.padding(18)
        }
        .background(ThusoTheme.canvas)
        .navigationTitle(title).navigationBarTitleDisplayMode(.inline)
    }
}
