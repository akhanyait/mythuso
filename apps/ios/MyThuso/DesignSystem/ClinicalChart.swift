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
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /* The plot is a drawing, not text, so it does not grow on its own — and a 74-point plot under a
       headline that has tripled in height reads as an afterthought. It grows with the reader. */
    @ScaledMetric(relativeTo: .body) private var plotHeight: CGFloat = 76
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
            /* The metric shape, so a reading on a chart is read the same way as a reading anywhere
               else in this product: the standing above, the figure large and thin, the name below.
               It used to be a title with a pill beside it and a bold rounded numeral under both,
               which is the inversion docs/DESIGN-LANGUAGE.md is mostly about. */
            ThusoMetric(value: format(latest.value), unit: unit, label: title,
                        chip: inRange ? "Within sample range" : "Outside sample range",
                        flagged: !inRange)
            /* The symbol sits with the movement rather than beside the title. It is what tells one
               chart from another at a glance in a column of them, and it is decoration, so it goes
               with the quiet line rather than competing with the figure. */
            HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space8) {
                if let symbol {
                    Image(systemName: symbol).font(.footnote)
                        .foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted)).accessibilityHidden(true)
                }
                Text(latest.value == first.value ? "No change since \(first.label)" : "\(latest.value > first.value ? "+" : "")\(format(latest.value - first.value)) since \(first.label)")
                    .font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                    .fixedSize(horizontal: false, vertical: true)
            }
            plot.frame(height: plotHeight).accessibilityElement().accessibilityLabel(summary)
            HStack { Text(first.label); Spacer(); Text(latest.label) }.font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
            /* A button rather than a DisclosureGroup.
             *
             * MyThusoUITests found this twice, on two screens and at two content sizes: "Show
             * readings as a table is laid out clear of the bars and still cannot be tapped". A
             * DisclosureGroup outside a Form keeps its gesture on its own chevron, so a
             * contentShape put on the label — which is what the previous attempt at this did —
             * widens a rectangle nothing is listening to. The table underneath is every value on
             * the chart in words, so the control that opens it is the whole of this chart's
             * accessibility story, and it has to be a target rather than nearly one. */
            Button { withAnimation(reduceMotion ? nil : .snappy(duration: 0.2)) { showTable.toggle() } } label: {
                HStack(spacing: ThusoSpacing.space8) {
                    Text(showTable ? "Hide readings" : "Show readings as a table")
                        .font(.footnote.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                    Image(systemName: showTable ? "chevron.up" : "chevron.down")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted)).accessibilityHidden(true)
                }
                .frame(maxWidth: .infinity, minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(.isButton)
            .accessibilityHint(showTable ? "Hides the table of readings" : "Shows every reading on this chart as a table")
            if showTable {
                VStack(spacing: 0) {
                    ForEach(readings) { reading in
                        HStack {
                            Text(reading.label).frame(maxWidth: .infinity, alignment: .leading)
                            Text("\(format(reading.value)) \(unit)").frame(maxWidth: .infinity, alignment: .leading)
                            Text(reading.note).frame(maxWidth: .infinity, alignment: .leading).foregroundStyle(.secondary)
                        }
                        .font(.caption).padding(.vertical, ThusoSpacing.space8)
                        .accessibilityElement(children: .combine)
                        Divider()
                    }
                    Text("Fictional data, not a medical record.").font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted)).frame(maxWidth: .infinity, alignment: .leading).padding(.top, ThusoSpacing.space8)
                }
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
                    Rectangle().fill(ThusoTheme.paleSage).frame(height: max(bottom - top, 1)).position(x: geo.size.width / 2, y: (top + bottom) / 2)
                }
                Path { path in
                    for (index, reading) in readings.enumerated() {
                        let next = point(index, reading.value)
                        index == 0 ? path.move(to: next) : path.addLine(to: next)
                    }
                }.stroke(ThusoTheme.charcoal, style: StrokeStyle(lineWidth: 2, lineJoin: .round))
                ForEach(Array(readings.enumerated()), id: \.element) { index, reading in
                    Circle().fill(index == readings.count - 1 ? ThusoTheme.surface : ThusoTheme.charcoal)
                        .overlay(Circle().stroke(ThusoTheme.charcoal, lineWidth: index == readings.count - 1 ? 2 : 0))
                        .frame(width: index == readings.count - 1 ? 9 : 6)
                        .position(point(index, reading.value))
                }
            }
        }
    }
}
