import SwiftUI

enum ThusoTheme {
    static let teal = Color(red: 0.055, green: 0.486, blue: 0.420)      // #0E7C6B
    static let tealDeep = Color(red: 0.039, green: 0.388, blue: 0.341)  // #0A6357
    static let tealSoft = Color(red: 0.894, green: 0.949, blue: 0.929)  // #E4F2ED
    static let mint = Color(red: 0.827, green: 0.922, blue: 0.882)      // #D3EBE1
    static let forest = Color(red: 0.071, green: 0.227, blue: 0.196)    // #123A32
    static let ink = Color(red: 0.063, green: 0.141, blue: 0.122)       // #10241F
    static let body = Color(red: 0.357, green: 0.420, blue: 0.400)      // #5B6B66
    static let line = Color(red: 0.906, green: 0.933, blue: 0.922)      // #E7EEEB
    static let canvas = Color(red: 0.957, green: 0.973, blue: 0.969)    // #F4F8F7
    static let amber = Color(red: 0.690, green: 0.478, blue: 0.129)     // #B07A21
    static let amberSoft = Color(red: 0.984, green: 0.941, blue: 0.863) // #FBF0DC
    static let sky = Color(red: 0.235, green: 0.431, blue: 0.624)       // #3C6E9F
    static let skySoft = Color(red: 0.906, green: 0.941, blue: 0.980)   // #E7F0FA
    static let danger = Color(red: 0.761, green: 0.290, blue: 0.243)    // #C24A3E
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
                Text(eyebrow.uppercased()).font(.caption2.weight(.bold)).tracking(1.5).foregroundStyle(ThusoTheme.teal)
            }
            Text(title).font(.system(size: 26, weight: .bold)).foregroundStyle(ThusoTheme.ink)
            if !subtitle.isEmpty { Text(subtitle).font(.subheadline).foregroundStyle(ThusoTheme.body) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
struct CareButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 15, weight: .semibold))
            .padding(15).frame(maxWidth: .infinity, minHeight: 50)
            .background(ThusoTheme.teal.opacity(configuration.isPressed ? 0.82 : 1), in: RoundedRectangle(cornerRadius: 12))
            .foregroundStyle(.white)
    }
}
struct QuietButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 15, weight: .semibold))
            .padding(15).frame(maxWidth: .infinity, minHeight: 50)
            .background(configuration.isPressed ? ThusoTheme.tealSoft : .white, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(ThusoTheme.line, lineWidth: 1))
            .foregroundStyle(ThusoTheme.forest)
    }
}
/// A soft tinted square holding a symbol — the repeating unit of the whole design.
struct TileIcon: View {
    let symbol: String
    var tint: Color = ThusoTheme.teal
    var background: Color = ThusoTheme.tealSoft
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
        case "amber": return (ThusoTheme.amberSoft, ThusoTheme.amber)
        case "sky": return (ThusoTheme.skySoft, ThusoTheme.sky)
        case "light": return (Color.white.opacity(0.18), Color(red: 0.91, green: 0.96, blue: 0.94))
        default: return (ThusoTheme.tealSoft, ThusoTheme.tealDeep)
        }
    }
    var body: some View {
        Text(text).font(.system(size: 11, weight: .semibold))
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
            Text("Step \(step) of \(total)").font(.system(size: 12, weight: .semibold)).foregroundStyle(ThusoTheme.teal)
            Text(label).font(.system(size: 12)).foregroundStyle(ThusoTheme.body)
            Spacer()
            HStack(spacing: 6) {
                ForEach(1...total, id: \.self) { index in
                    Capsule().fill(index <= step ? ThusoTheme.teal : ThusoTheme.line)
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
                    Text(digit).font(.system(size: 19, weight: .semibold))
                        .frame(maxWidth: .infinity, minHeight: 56)
                        .background(.white, in: RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(
                            invalid ? ThusoTheme.danger : (focused && index == min(code.count, length - 1) ? ThusoTheme.teal : ThusoTheme.line),
                            lineWidth: 1.5))
                }
                if code.count == length && !invalid {
                    Image(systemName: "checkmark").font(.system(size: 15, weight: .bold)).foregroundStyle(.white)
                        .frame(width: 34, height: 34).background(ThusoTheme.teal, in: Circle())
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
            .font(.caption2.weight(.medium)).foregroundStyle(ThusoTheme.teal)
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
            TileIcon(symbol: symbol, tint: danger ? ThusoTheme.danger : ThusoTheme.teal,
                     background: danger ? ThusoTheme.danger.opacity(0.1) : ThusoTheme.tealSoft, size: 38)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.system(size: 15, weight: .semibold)).foregroundStyle(danger ? ThusoTheme.danger : ThusoTheme.ink)
                if !subtitle.isEmpty { Text(subtitle).font(.system(size: 12)).foregroundStyle(ThusoTheme.body) }
            }
            Spacer(minLength: 8)
            if !danger { Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(ThusoTheme.body.opacity(0.6)) }
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
