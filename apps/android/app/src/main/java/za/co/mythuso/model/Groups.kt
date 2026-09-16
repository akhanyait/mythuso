package za.co.mythuso.model

/*
 * The member's half of a group that pays for its members, on a phone.
 *
 * The words, the kinds, the two ways a member may let her group read what it paid for her and the limit are
 * GroupsData's, generated from packages/catalog/groups.json. What is hand-written here is the arithmetic a screen
 * needs: which ways her group's kind offers — an employer offers one, and the reason is on the screen rather than in
 * a refusal she meets — and the sentences filled with her group's name and the limit in force.
 *
 * This app charges nothing. A member on a phone is invited, agrees and may leave; asking a group to pay happens where
 * a payment provider does, and neither exists here.
 */

data class GroupKind(val id: String, val name: String, val lineDetails: List<String>)
data class GroupLineDetail(val id: String, val name: String, val detail: String)
data class GroupState(val id: String, val name: String, val memberWords: String)

object Groups {
    /** The kind of group the preview's member was invited to, from the contract's preview. */
    const val previewKind = "stokvel"

    fun kind(id: String): GroupKind = GroupsData.kinds.firstOrNull { it.id == id } ?: GroupsData.kinds.first()

    /** The ways this kind of group offers. An employer offers one, because a day is health. */
    fun offered(kindId: String): List<GroupLineDetail> {
        val allowed = kind(kindId).lineDetails
        return GroupsData.lineDetails.filter { it.id in allowed }
    }

    fun state(id: String): GroupState = GroupsData.states.firstOrNull { it.id == id } ?: GroupsData.states.first()

    /** The most a group is charged for one member in a month, as a person reads it. */
    fun limit(): String = rands(GroupsData.memberMonthlyLimitCents / 100)

    /** A sentence with the group's name, and the limit where one belongs. */
    fun words(sentence: String, group: String = GroupsData.previewGroupName): String =
        sentence.replace("{group}", group).replace("{limit}", limit())
}
