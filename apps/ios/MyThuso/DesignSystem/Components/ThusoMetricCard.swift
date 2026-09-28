import SwiftUI

/* One figure a screen is opened for, with its label and an optional trend — the web's
   MetricCard.tsx. The value is the metric step of the type scale (32) in the display face, tabular
   so a row of them lines up on the digit; the label is the caption step, tracked out and uppercased;
   the icon, when there is one, sits at the label's end in the muted ink.

   The trend is drawn in the success ink — on light the teal ink the build already measures for "a
   value in range", on dark the handoff's own green — and its words say which way it went, so the
   colour never has to. */
struct ThusoMetricCard<Icon: View>: View {
    let label: String
    let value: String
    var unit: String?
    var trend: String?
    /// A state said in words under the figure — "In range" on the success tint, "Outside range" on the
    /// warning tint — where the web's metric puts its badge.
    var badge: (text: String, good: Bool)?
    @ViewBuilder var icon: Icon

    init(label: String, value: String, unit: String? = nil, trend: String? = nil, badge: (text: String, good: Bool)? = nil, @ViewBuilder icon: () -> Icon) {
        self.label = label
        self.value = value
        self.unit = unit
        self.trend = trend
        self.badge = badge
        self.icon = icon()
    }

    var body: some View {
        ThusoCard(padding: .md, spacing: ThusoSpacing.space4) {
            HStack(alignment: .center, spacing: ThusoSpacing.space8) {
                Text(label.uppercased()).font(.thuso(.caption, weight: .semibold)).tracking(0.6)
                    .foregroundStyle(ThusoRole.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                icon.foregroundStyle(ThusoRole.mutedForeground).accessibilityHidden(true)
            }
            .padding(.bottom, ThusoSpacing.space12)
            HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space4) {
                /* One line, shrinking before it wraps: a figure broken across two lines is two figures. */
                Text(value).font(ThusoFont.metric).monospacedDigit().foregroundStyle(ThusoRole.foreground)
                    .lineLimit(1).minimumScaleFactor(0.6)
                if let unit {
                    Text(unit).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                }
            }
            if let trend {
                Text(trend).font(.thuso(.caption, weight: .medium)).foregroundStyle(ThusoRole.successInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let badge {
                ThusoBadge(badge.text, variant: badge.good ? .success : .warning, size: .sm, dot: true)
                    .padding(.top, ThusoSpacing.space4)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

extension ThusoMetricCard where Icon == EmptyView {
    init(label: String, value: String, unit: String? = nil, trend: String? = nil, badge: (text: String, good: Bool)? = nil) {
        self.init(label: label, value: value, unit: unit, trend: trend, badge: badge) { EmptyView() }
    }
}
