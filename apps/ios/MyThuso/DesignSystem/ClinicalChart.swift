import SwiftUI

struct Reading: Identifiable, Hashable {
    let label: String
    let value: Double
    var note: String = "—"
    var id: String { label }
}
/// The drawing carries a spoken summary and every value is also available as a real table,
/// because a reading a patient cannot read is not a reading.
struct ClinicalChart: View {
    let title: String
    let unit: String
    let readings: [Reading]
    var normal: ClosedRange<Double>?
    var decimals = 0
    var symbol: String? = nil
    @State private var showTable = false
    private func format(_ value: Double) -> String { String(format: "%.\(decimals)f", value) }
    private var latest: Reading { readings.last! }
    private var first: Reading { readings.first! }
    private var inRange: Bool { normal.map { $0.contains(latest.value) } ?? true }
    private var summary: String {
        let delta = latest.value - first.value
        let direction = delta > 0 ? "higher than" : delta < 0 ? "lower than" : "unchanged from"
        let range = normal.map { "Indicative reference range \(format($0.lowerBound)) to \(format($0.upperBound)) \(unit); the latest reading is \(inRange ? "inside" : "outside") that range." } ?? ""
        return "\(title). Latest sample reading \(format(latest.value)) \(unit) on \(latest.label), \(direction) the first reading of \(format(first.value)) on \(first.label). \(range) Fictional data."
    }
    var body: some View {
        CareCard {
            HStack(alignment: .top) {
                if let symbol { Image(systemName: symbol).font(.subheadline).foregroundStyle(ThusoTheme.indigo) }
                Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.ink)
                Spacer()
                Text(inRange ? "Within sample range" : "Outside sample range")
                    .font(.caption2.weight(.semibold))
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(inRange ? ThusoTheme.sage : Color(red: 0.98, green: 0.94, blue: 0.90), in: Capsule())
                    .foregroundStyle(inRange ? ThusoTheme.slate : Color(red: 0.59, green: 0.33, blue: 0.17))
            }
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(format(latest.value)).font(.system(.largeTitle, design: .rounded, weight: .semibold))
                Text(unit).font(.caption).foregroundStyle(.secondary)
                Spacer()
                Text(latest.value == first.value ? "No change" : "\(latest.value > first.value ? "+" : "")\(format(latest.value - first.value)) since \(first.label)")
                    .font(.caption2).foregroundStyle(.secondary)
            }
            plot.frame(height: 74).accessibilityElement().accessibilityLabel(summary)
            HStack { Text(first.label); Spacer(); Text(latest.label) }.font(.caption2).foregroundStyle(.secondary)
            DisclosureGroup(isExpanded: $showTable) {
                VStack(spacing: 0) {
                    ForEach(readings) { reading in
                        HStack {
                            Text(reading.label).frame(maxWidth: .infinity, alignment: .leading)
                            Text("\(format(reading.value)) \(unit)").frame(maxWidth: .infinity, alignment: .leading)
                            Text(reading.note).frame(maxWidth: .infinity, alignment: .leading).foregroundStyle(.secondary)
                        }
                        .font(.caption).padding(.vertical, 9)
                        .accessibilityElement(children: .combine)
                        Divider()
                    }
                    Text("Fictional data, not a medical record.").font(.caption2).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading).padding(.top, 8)
                }
            } label: {
                Text(showTable ? "Hide readings" : "Show readings as a table").font(.caption.weight(.semibold)).foregroundStyle(ThusoTheme.indigo)
            }
        }
    }
    private var plot: some View {
        GeometryReader { geo in
            let values = readings.map(\.value)
            let low = min(values.min() ?? 0, normal?.lowerBound ?? .greatestFiniteMagnitude)
            let high = max(values.max() ?? 1, normal?.upperBound ?? -.greatestFiniteMagnitude)
            let pad = max((high - low) * 0.25, 0.5)
            let minimum = low - pad, maximum = high + pad
            let point: (Int, Double) -> CGPoint = { index, value in
                CGPoint(x: readings.count < 2 ? geo.size.width / 2 : geo.size.width * CGFloat(index) / CGFloat(readings.count - 1),
                        y: geo.size.height - geo.size.height * CGFloat((value - minimum) / (maximum - minimum)))
            }
            ZStack {
                if let normal {
                    let top = point(0, normal.upperBound).y, bottom = point(0, normal.lowerBound).y
                    Rectangle().fill(Color(white: 0.95)).frame(height: max(bottom - top, 1)).position(x: geo.size.width / 2, y: (top + bottom) / 2)
                }
                Path { path in
                    for (index, reading) in readings.enumerated() {
                        let next = point(index, reading.value)
                        index == 0 ? path.move(to: next) : path.addLine(to: next)
                    }
                }.stroke(ThusoTheme.indigo, style: StrokeStyle(lineWidth: 2, lineJoin: .round))
                ForEach(Array(readings.enumerated()), id: \.element) { index, reading in
                    Circle().fill(index == readings.count - 1 ? .white : ThusoTheme.indigo)
                        .overlay(Circle().stroke(ThusoTheme.indigo, lineWidth: index == readings.count - 1 ? 2 : 0))
                        .frame(width: index == readings.count - 1 ? 9 : 6)
                        .position(point(index, reading.value))
                }
            }
        }
    }
}
