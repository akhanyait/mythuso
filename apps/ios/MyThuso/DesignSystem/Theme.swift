import SwiftUI

enum ThusoTheme {
    static let teal = Color(red: 0.03, green: 0.50, blue: 0.47)
    static let ink = Color(red: 0.09, green: 0.18, blue: 0.20)
    static let canvas = Color(red: 0.96, green: 0.97, blue: 0.96)
    static let sage = Color(red: 0.90, green: 0.95, blue: 0.91)
    static let forest = Color(red: 0.14, green: 0.31, blue: 0.26)
}
struct CareCard<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View { VStack(alignment: .leading, spacing: 16) { content }.padding(20).frame(maxWidth: .infinity, alignment: .leading).background(.white, in: RoundedRectangle(cornerRadius: 20)).overlay(RoundedRectangle(cornerRadius: 20).stroke(.gray.opacity(0.12))) }
}
struct CareHeading: View {
    let eyebrow: String
    let title: String
    let subtitle: String
    var body: some View { VStack(alignment: .leading, spacing: 10) { Text(eyebrow.uppercased()).font(.caption2.weight(.semibold)).tracking(2).foregroundStyle(ThusoTheme.teal); Text(title).font(.largeTitle.weight(.semibold)); Text(subtitle).font(.subheadline).foregroundStyle(.secondary) }.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 8) }
}
struct CareButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View { configuration.label.font(.subheadline.weight(.semibold)).padding(15).frame(maxWidth: .infinity).background(ThusoTheme.teal.opacity(configuration.isPressed ? 0.8 : 1), in: RoundedRectangle(cornerRadius: 12)).foregroundStyle(.white) }
}
struct DemoBadge: View {
    var body: some View { Label("Design preview · Fictional data", systemImage: "circle.fill").font(.caption2).foregroundStyle(ThusoTheme.teal).padding(.vertical, 8).frame(maxWidth: .infinity, alignment: .leading) }
}
struct FeatureDetail: View {
    let title: String
    var body: some View { ScrollView { VStack(alignment: .leading, spacing: 20) { DemoBadge(); CareHeading(eyebrow: "MyThuso", title: title, subtitle: "Connected to your care journey."); CareCard { Label("UI preview", systemImage: "sparkles").foregroundStyle(ThusoTheme.teal); Text("This workflow will connect to the relevant clinical, operational or partner service in the functionality phase."); Text("No live care, payments, device permissions or clinical decisions are activated.").font(.subheadline).foregroundStyle(.secondary) } }.padding(20) }.background(ThusoTheme.canvas).navigationTitle(title).navigationBarTitleDisplayMode(.inline) }
}
