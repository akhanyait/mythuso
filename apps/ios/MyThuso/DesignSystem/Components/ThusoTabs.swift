import SwiftUI

/* Peer views of one thing, switched without leaving the page — the web's Tabs.tsx.
 *
 * A muted well with the selected tab raised on a surface and the card shadow, its words in the
 * foreground and the others in the muted ink: so a tab says it is selected by its face and its
 * weight as well as its colour, and to VoiceOver by the selected trait. The list wraps rather than
 * scrolling sideways, so no tab is ever hidden off the edge of a phone. Every tab is 44 tall; the
 * well's four-point inset is inside that. */
struct ThusoTabs<ID: Hashable>: View {
    @Binding var selection: ID
    let tabs: [(id: ID, title: String)]

    var body: some View {
        ThusoFlow(spacing: ThusoSpacing.space4) {
            ForEach(tabs, id: \.id) { tab in
                let active = tab.id == selection
                Button { selection = tab.id } label: {
                    Text(tab.title)
                        .font(.thuso(.subheadline, weight: .semibold))
                        .foregroundStyle(active ? ThusoRole.foreground : ThusoRole.mutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, ThusoSpacing.space12)
                        .frame(minHeight: 44)
                        .background(active ? ThusoRole.surface : .clear, in: RoundedRectangle(cornerRadius: ThusoRadius.sm, style: .continuous))
                        .thusoShadow()
                        .opacity(active ? 1 : 0.999)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(active ? [.isButton, .isSelected] : .isButton)
                .animation(ThusoMotion.soft(ThusoMotion.quick), value: active)
            }
        }
        .padding(ThusoSpacing.space4)
        .background(ThusoRole.muted, in: RoundedRectangle(cornerRadius: ThusoRadius.md, style: .continuous))
        .accessibilityElement(children: .contain)
    }
}

/// Rows of as many children as fit, then the next row. iOS 16's Layout, so nothing measures itself.
struct ThusoFlow: Layout {
    var spacing: CGFloat = ThusoSpacing.space8
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(proposal.width ?? .infinity, subviews)
        let height = rows.reduce(CGFloat(0)) { $0 + $1.height } + spacing * CGFloat(max(rows.count - 1, 0))
        let width = rows.map(\.width).max() ?? 0
        return CGSize(width: proposal.width ?? width, height: height)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in arrange(bounds.width, subviews) {
            var x = bounds.minX
            for index in row.indices {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
                x += size.width + spacing
            }
            y += row.height + spacing
        }
    }
    private struct Row { var indices: [Int] = []; var width: CGFloat = 0; var height: CGFloat = 0 }
    private func arrange(_ available: CGFloat, _ subviews: Subviews) -> [Row] {
        var rows: [Row] = [Row()]
        for (index, view) in subviews.enumerated() {
            let size = view.sizeThatFits(.unspecified)
            let needed = rows[rows.count - 1].width + (rows[rows.count - 1].indices.isEmpty ? 0 : spacing) + size.width
            if needed > available && !rows[rows.count - 1].indices.isEmpty { rows.append(Row()) }
            rows[rows.count - 1].indices.append(index)
            rows[rows.count - 1].width += (rows[rows.count - 1].indices.count == 1 ? 0 : spacing) + size.width
            rows[rows.count - 1].height = max(rows[rows.count - 1].height, size.height)
        }
        return rows
    }
}
