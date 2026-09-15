package za.co.mythuso.ui

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import za.co.mythuso.model.Groups
import za.co.mythuso.model.GroupsData
import za.co.mythuso.model.Money

/*
 * A group that pays for you, on a phone: an invitation, the choice of what the group may see, and leaving.
 *
 * Nobody is made a member. The group invites; she agrees here, as herself, choosing how its screen reads what it paid
 * for her — and where her group is an employer there is one choice and the screen says why, rather than a refusal she
 * meets after choosing. Nothing is charged: this app runs no payment provider, so the screen carries the payments
 * capability's notice and offers no way to pay.
 *
 * Every sentence is GroupsData's, generated from packages/catalog/groups.json.
 */
@Composable fun GroupOptInScreen() {
    var stateCode by rememberSaveable { mutableStateOf("invited") }
    val offered = Groups.offered(Groups.previewKind)
    var chosen by rememberSaveable { mutableStateOf(offered.first().id) }

    ScreenColumn {
        Heading(GroupsData.Words.heading, "Thuso Money", GroupsData.Words.intro)
        CapabilityNotice("payments")

        CareCard {
            Text(GroupsData.previewGroupName, style = MaterialTheme.typography.titleMedium, color = Charcoal)
            Text(Groups.words(Groups.state(stateCode).memberWords), style = MaterialTheme.typography.bodyMedium, color = Charcoal)
            Text(Groups.words(GroupsData.Words.limit), style = MaterialTheme.typography.bodySmall, color = InkMuted)
        }

        when (stateCode) {
            "invited" -> CareCard {
                Text(GroupsData.Words.choose, style = MaterialTheme.typography.titleSmall.copy(), color = Charcoal, modifier = Modifier.semantics { heading() })
                offered.forEach { detail ->
                    Row(modifier = Modifier.selectable(selected = chosen == detail.id, onClick = { chosen = detail.id })) {
                        RadioButton(selected = chosen == detail.id, onClick = { chosen = detail.id })
                        Text("${detail.name}. ${detail.detail}", style = MaterialTheme.typography.bodySmall, color = Charcoal)
                    }
                }
                /* One choice means an employer, and the reason is said here rather than met as a refusal. */
                if (offered.size == 1) Text(GroupsData.Words.employerOnly, style = MaterialTheme.typography.bodySmall, color = InkMuted)
                OutlinedButton(onClick = { stateCode = "member" }) { Text(Groups.words(GroupsData.Words.agree)) }
            }
            "member" -> CareCard {
                /* No way to pay on a phone: no provider is connected, and the contract's sentence says so. */
                Text(Money.providerlessWords, style = MaterialTheme.typography.bodySmall, color = InkMuted)
                OutlinedButton(onClick = { stateCode = "left" }) { Text(Groups.words(GroupsData.Words.leave)) }
            }
        }

        CareCard { Text(GroupsData.noPooledMoney, style = MaterialTheme.typography.bodySmall, color = InkMuted) }
        Text(GroupsData.Words.preview, style = MaterialTheme.typography.bodySmall, color = InkMuted)
    }
}
