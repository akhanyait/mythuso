import SwiftUI

/* A destination in a navigation rail or a list of doors — the web's NavigationItem.tsx.
 *
 * The current one carries the handoff's aqua tint, its words in the foreground and a heavier weight,
 * so it is never told apart by colour alone; to VoiceOver it is selected. 44 tall rather than the
 * handoff's 40. A count, when there is one, replaces the chevron and is announced with the name.
 *
 * The icon is any view — a MyThusoIcon where the web wears one, an SF Symbol for a utility — because
 * the family's own rule is that a primary destination wears the family and a utility does not. */
struct ThusoNavigationItemLabel<Icon: View>: View {
    let title: String
    var subtitle: String?
    var active = false
    var count: Int?
    @ViewBuilder var icon: Icon
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        HStack(spacing: ThusoSpacing.space12) {
            if !typeSize.isAccessibilitySize {
                icon.frame(width: ThusoSpacing.space20, height: ThusoSpacing.space20)
                    .foregroundStyle(active ? ThusoRole.foreground : ThusoRole.mutedForeground)
                    .accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.thuso(.subheadline, weight: active ? .semibold : .medium))
                    .foregroundStyle(active ? ThusoRole.foreground : ThusoRole.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
                if let subtitle, !subtitle.isEmpty {
                    Text(subtitle).font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if let count {
                Text("\(count)").font(.thuso(.caption, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                    .padding(.horizontal, ThusoSpacing.space12 / 2).padding(.vertical, 2)
                    .background(ThusoRole.muted, in: Capsule())
            } else {
                Image(systemName: "chevron.right").font(.thuso(.caption, weight: .semibold))
                    .foregroundStyle(ThusoRole.mutedForeground).accessibilityHidden(true)
            }
        }
        .padding(.horizontal, ThusoSpacing.space12).padding(.vertical, ThusoSpacing.space8)
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        .background(active ? ThusoRole.accentTint : .clear, in: RoundedRectangle(cornerRadius: ThusoRadius.md, style: .continuous))
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(active ? [.isSelected] : [])
    }
}

extension ThusoNavigationItemLabel where Icon == Image {
    init(title: String, subtitle: String? = nil, symbol: String, active: Bool = false, count: Int? = nil) {
        self.init(title: title, subtitle: subtitle, active: active, count: count) { Image(systemName: symbol) }
    }
}

/// The same row as the control itself.
struct ThusoNavigationItem<Icon: View>: View {
    let title: String
    var subtitle: String?
    var active = false
    var count: Int?
    let action: () -> Void
    @ViewBuilder var icon: Icon
    var body: some View {
        Button(action: action) {
            ThusoNavigationItemLabel(title: title, subtitle: subtitle, active: active, count: count) { icon }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(.isButton)
    }
}
