import Foundation

/* The member's half of a group that pays for its members, on a phone.
 *
 * The words, the kinds, the two ways a member may let her group read what it paid for her and the limit are
 * GroupsData's, generated from packages/catalog/groups.json. What is hand-written here is the arithmetic a screen
 * needs: which ways her group's kind offers — an employer offers one, and the reason is on the screen rather than in
 * a refusal she meets — and the sentences filled with her group's name and the limit in force.
 *
 * This app charges nothing. A member on a phone is invited, agrees and may leave; asking a group to pay happens where
 * a payment provider does, and neither exists here. */

struct GroupKind: Identifiable, Hashable { let id: String; let name: String; let lineDetails: [String] }
struct GroupLineDetail: Identifiable, Hashable { let id: String; let name: String; let detail: String }
struct GroupState: Identifiable, Hashable { let id: String; let name: String; let memberWords: String }

enum Groups {
    /// The kind of group the preview's member was invited to, from the contract's preview.
    static let previewKind = "stokvel"

    static func kind(_ id: String) -> GroupKind {
        GroupsData.kinds.first { $0.id == id } ?? GroupsData.kinds[0]
    }

    /// The ways this kind of group offers. An employer offers one, because a day is health.
    static func offered(for kindId: String) -> [GroupLineDetail] {
        let allowed = kind(kindId).lineDetails
        return GroupsData.lineDetails.filter { allowed.contains($0.id) }
    }

    static func state(_ id: String) -> GroupState {
        GroupsData.states.first { $0.id == id } ?? GroupsData.states[0]
    }

    /// The most a group is charged for one member in a month, as a person reads it.
    static var limit: String { Money.randCents(GroupsData.memberMonthlyLimitCents) }

    /// A sentence with the group's name, and the limit where one belongs.
    static func words(_ sentence: String, group: String = GroupsData.previewGroupName) -> String {
        sentence.replacingOccurrences(of: "{group}", with: group).replacingOccurrences(of: "{limit}", with: limit)
    }
}
