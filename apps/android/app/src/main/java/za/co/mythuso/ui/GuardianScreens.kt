package za.co.mythuso.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import za.co.mythuso.model.GuardianInvitation
import za.co.mythuso.model.PreviewStore

/**
 * Paying for someone's care is not the same as being allowed to read their records.
 * Scope, duration and verification are three separate decisions, so they are three separate steps.
 */
@Composable fun InviteGuardianScreen(store: PreviewStore, close: () -> Unit) {
    var step by remember { mutableIntStateOf(0) }
    var name by remember { mutableStateOf("") }
    var relationship by remember { mutableStateOf("Parent") }
    var scope by remember { mutableStateOf("Bookings and payments only") }
    var expires by remember { mutableStateOf("Until I revoke it") }
    var understood by remember { mutableStateOf(false) }
    val minor = relationship == "Child under 18"
    val scopes = listOf(
        "Bookings and payments only" to "They can arrange and pay for visits. They see no clinical information at all.",
        "Visit summaries only" to "They see what happened at a visit and what to do next. No history, results or medicines.",
        "Full Health Passport" to "Everything you can see. Appropriate for a guardian of a child, or where you have chosen to share fully."
    )
    ScreenColumn {
        Text("Step ${step + 1} of 4 · ${listOf("Who", "What they see", "For how long", "Review")[step]}", style = MaterialTheme.typography.labelMedium, color = Indigo)
        when (step) {
            0 -> {
                Heading("Thuso Family", "Who are you inviting?", "They receive an invitation on their own phone and choose whether to accept. You can withdraw it at any time.")
                OutlinedTextField(name, { name = it.take(60) }, label = { Text("Their name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                CareCard {
                    Text("Their relationship to you", style = MaterialTheme.typography.titleMedium)
                    listOf("Parent", "Child under 18", "Adult child", "Partner", "Sibling", "Carer", "Other family member").forEach { option ->
                        Row(
                            Modifier.fillMaxWidth().clickable { relationship = option }.semantics { selected = relationship == option },
                            verticalAlignment = Alignment.CenterVertically
                        ) { RadioButton(relationship == option, { relationship = option }); Text(option, style = MaterialTheme.typography.bodyMedium) }
                    }
                }
                if (minor) Note("For a child under 18 you are asking for guardianship, not sharing. Production requires proof of parental responsibility and a record of the child’s own views as they grow older.")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = close) { Text("Cancel") }
                    Button(onClick = { step = 1 }, enabled = name.isNotBlank()) { Text("Continue") }
                }
            }
            1 -> {
                Heading("Thuso Family", "What should ${name.substringBefore(' ')} see?", "Start with the least you can live with. You can widen it later in one tap.")
                scopes.forEach { (title, body) ->
                    CareCard(Modifier.clickable { scope = title }) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            RadioButton(scope == title, { scope = title })
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(title, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyLarge)
                                Note(body)
                            }
                        }
                    }
                }
                Note("Sexual and reproductive health, mental health and HIV-related entries stay hidden under every scope unless you release them one by one.")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { step = 0 }) { Text("Back") }
                    Button(onClick = { step = 2 }) { Text("Continue") }
                }
            }
            2 -> {
                Heading("Thuso Family", "For how long?", "Time-limited access is the safer default. An open-ended grant is reviewed with you every six months.")
                CareCard {
                    listOf("Until I revoke it", "Until the end of this visit", "For 7 days", "For 30 days", "31 December 2026").forEach { option ->
                        Row(
                            Modifier.fillMaxWidth().clickable { expires = option }.semantics { selected = expires == option },
                            verticalAlignment = Alignment.CenterVertically
                        ) { RadioButton(expires == option, { expires = option }); Text(option, style = MaterialTheme.typography.bodyMedium) }
                    }
                }
                Note("${name.substringBefore(' ')} must verify their identity before the invitation becomes active. An unverified invitation grants nothing.")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { step = 1 }) { Text("Back") }
                    Button(onClick = { step = 3 }) { Text("Review") }
                }
            }
            else -> {
                Heading("Thuso Family", "Check this before you send it.", "No invitation is sent and no access is granted in this preview.")
                CareCard {
                    ReviewLine("Person", name)
                    ReviewLine("Relationship", relationship)
                    ReviewLine("They will see", scope)
                    ReviewLine("Access ends", expires)
                    ReviewLine("Before it starts", "Identity verification${if (minor) " and proof of guardianship" else ""}")
                }
                Setting("I understand this is a design preview.", understood) { understood = it }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { step = 2 }) { Text("Back") }
                    Button(onClick = {
                        store.invitations.add(GuardianInvitation("INV-00${(40..89).random()}", name.trim(), relationship, scope, expires, "Verification pending"))
                        close()
                    }, enabled = understood) { Text("Send demo invitation") }
                }
            }
        }
    }
}
@Composable fun InvitationList(store: PreviewStore, open: (String) -> Unit) {
    CareCard {
        Text("Guardians and shared access", style = MaterialTheme.typography.titleMedium)
        if (store.invitations.isEmpty()) {
            Note("When you invite a guardian or a family member, their access appears here with exactly what they can see and when it ends.")
        }
        store.invitations.forEachIndexed { index, invitation ->
            Column(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("${invitation.name} · ${invitation.relationship}", fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                    Text(invitation.status, style = MaterialTheme.typography.labelMedium, color = if (invitation.status == "Active") Indigo else MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Note("${invitation.scope} · Ends: ${invitation.expires}")
                TextButton(onClick = { store.invitations[index] = invitation.copy(status = "Revoked") }, enabled = invitation.status != "Revoked") { Text("Revoke") }
            }
            HorizontalDivider()
        }
        OutlinedButton(onClick = { open("Invite a guardian") }) { Text("Invite someone") }
        Note("Revoking takes effect immediately and the other person is told. Anything they already saw cannot be un-seen, which is why scope matters more than revocation.")
    }
}
