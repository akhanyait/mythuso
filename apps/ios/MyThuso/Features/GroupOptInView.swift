import SwiftUI

/* A group that pays for you, on a phone: an invitation, the choice of what the group may see, and leaving.
 *
 * Nobody is made a member. The group invites; she agrees here, as herself, choosing how its screen reads what it paid
 * for her — and where her group is an employer there is one choice and the screen says why, rather than a refusal she
 * meets after choosing. Nothing is charged: this app runs no payment provider, so the screen carries the payments
 * capability's notice and offers no way to pay.
 *
 * Every sentence is GroupsData's, generated from packages/catalog/groups.json. */
struct GroupOptInView: View {
    @State private var stateCode = "invited"
    @State private var chosen: String = Groups.offered(for: Groups.previewKind).first?.id ?? ""
    private let offered = Groups.offered(for: Groups.previewKind)

    private var words: String { Groups.words(Groups.state(stateCode).memberWords) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
                CareHeading(eyebrow: "Thuso Money", title: GroupsData.Words.heading, subtitle: GroupsData.Words.intro)
                CapabilityNotice(of: "payments")

                CareCard(padding: ThusoSpacing.space16) {
                    Text(GroupsData.previewGroupName).font(.headline).foregroundStyle(ThusoTheme.charcoal)
                    Text(words).font(.subheadline).foregroundStyle(ThusoTheme.charcoal)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("group-state")
                    Text(Groups.words(GroupsData.Words.limit)).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if stateCode == "invited" {
                    CareCard(padding: ThusoSpacing.space16) {
                        Text(GroupsData.Words.choose).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                        Picker(GroupsData.Words.choose, selection: $chosen) {
                            ForEach(offered) { detail in Text(detail.name).tag(detail.id) }
                        }.pickerStyle(.inline).labelsHidden()
                        if let detail = offered.first(where: { $0.id == chosen }) {
                            Text(detail.detail).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        /* One choice means an employer, and the reason is said here rather than met as a refusal. */
                        if offered.count == 1 {
                            Text(GroupsData.Words.employerOnly).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Button(Groups.words(GroupsData.Words.agree)) { stateCode = "member" }.buttonStyle(PrimaryButton())
                    }
                } else if stateCode == "member" {
                    CareCard(padding: ThusoSpacing.space16) {
                        /* No way to pay on a phone: no provider is connected, and the contract's sentence says so. */
                        Text(Money.providerlessWords).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                            .fixedSize(horizontal: false, vertical: true)
                        Button(Groups.words(GroupsData.Words.leave)) { stateCode = "left" }.buttonStyle(QuietButton())
                    }
                }

                CareCard(padding: ThusoSpacing.space16) {
                    Text(GroupsData.noPooledMoney).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Text(GroupsData.Words.preview).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle(GroupsData.Words.heading)
        .navigationBarTitleDisplayMode(.inline)
    }
}
