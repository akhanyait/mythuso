package za.co.mythuso.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountBalance
import androidx.compose.material.icons.outlined.Block
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Verified
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import za.co.mythuso.model.*
import kotlin.math.abs
import kotlin.math.roundToInt
import androidx.compose.ui.semantics.Role

/* Earnings and payouts, for the nurse.

   The public page tells South Africa that a MyThuso nurse keeps three quarters of every visit and
   is paid weekly. This is where that promise has to survive contact with a real week: a payout the
   bank sent back, a visit refunded to the patient after it was counted, and a police clearance that
   lapsed on Tuesday.

   Four numbers in a card would have been the easy version. What matters is what a payout screen
   refuses:

     Nothing comes off the nurse's share. The card fee comes out of MyThuso's quarter, and the whole
     split is shown — including what MyThuso keeps — because a marketplace that hides its own cut is
     asking to be guessed at.

     A suspension is not a confiscation. The banner reads the same vetting record that stops
     dispatch, so the two can never disagree. The chips under it switch between a cleared nurse and
     one whose clearance lapsed nine days ago: the banner changes and not one figure moves.

     Nothing is money until it says paid. One of the four weeks below did not go through.

     No tax is withheld, and MyThuso will not advise on it.

     Changing where you are paid waits 48 hours, because account takeover is how a stolen sign-in
     becomes a stolen payout.

   Nothing is transferred. No bank is contacted and every visit, patient and account number here is
   fictional. */

private val payPreviewNurses = listOf("N-205", "N-204")

private fun rand(amount: Int): String {
    val digits = abs(amount).toString().reversed().chunked(3).joinToString(" ").reversed()
    return "R $digits"
}

@Composable fun EarningsScreen(store: PreviewStore, open: (String) -> Unit) {
    val nurses = remember(store) { payPreviewNurses.mapNotNull { store.vetting.subject(it) } }
    var nurseId by remember { mutableStateOf(nurses.first().id) }
    val nurse = nurses.firstOrNull { it.id == nurseId } ?: nurses.first()
    /* Read from the vetting register rather than from a flag on the payout. If the two could be set
       separately, a nurse could be told she is cleared on one screen and refused on another. */
    val dispatchable = can(nurse, "take-visit")
    var serviceId by remember { mutableStateOf("wound") }
    val service = Earnings.pricedServices.firstOrNull { it.id == serviceId } ?: Earnings.pricedServices.first()
    var openWeek by remember { mutableStateOf(payWeeks.getOrNull(1)?.id) }
    var accountStage by remember { mutableStateOf("settled") }
    var code by remember { mutableStateOf("") }

    ScreenColumn {
        DemoBadge()
        Heading("Nurse workspace", "Earnings & payouts", "Fictional visits, a fictional bank, and nothing transferred.")

        Column(
            Modifier.fillMaxWidth()
                .background(if (dispatchable.allowed) IndigoSoft else MangoSoft, RoundedCornerShape(ThusoRadius.card))
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
                Icon(if (dispatchable.allowed) Icons.Outlined.Verified else Icons.Outlined.WarningAmber, null,
                    tint = if (dispatchable.allowed) Indigo else MangoInk)
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(if (dispatchable.allowed) "Cleared for visits" else "You will not be sent new visits",
                        style = MaterialTheme.typography.titleMedium, color = Ink)
                    Text(
                        if (dispatchable.allowed) "Every check is verified and in date. Visits can be sent to you."
                        else dispatchable.reason.orEmpty(),
                        style = MaterialTheme.typography.bodyMedium, color = BodyText
                    )
                    if (!dispatchable.allowed) Text(Earnings.rule("suspension-is-not-confiscation").sentence,
                        style = MaterialTheme.typography.bodyMedium, color = Slate)
                }
            }
        }
        FlowRowChips(nurses.map { it.name }, setOf(nurse.name)) { name -> nurseId = nurses.first { it.name == name }.id }
        Note("The same earnings, seen by a cleared nurse and by one whose police clearance lapsed nine days ago. Only the banner changes — which is the rule.")

        Metric("This week so far", rand(Earnings.currentWeek.total),
            "${Earnings.currentWeek.visits} visits · closes ${payCycle.closesOn}, pays ${payCycle.paysOn}")
        Metric("Owed, not yet in your account", rand(Earnings.owedNotYetPaid), "On its way, or waiting on a bank")
        Metric("Reached your account this tax year", rand(Earnings.paidThisTaxYear),
            "Since ${payTaxYear.startsOn} · ${payTaxYear.label}")
        Note(Earnings.rule("accrued-is-not-paid").sentence)

        Text("Where the money goes", style = MaterialTheme.typography.titleLarge, color = Ink)
        CareCard {
            FlowRowChips(Earnings.pricedServices.map { it.name }, setOf(service.name)) { name ->
                serviceId = Earnings.pricedServices.first { it.name == name }.id
            }
            val split = Earnings.split(service)
            Row(
                Modifier.fillMaxWidth().height(16.dp).semantics {
                    contentDescription = "Of ${rand(split.price)}, ${rand(split.nurse)} is yours, " +
                        "${rand(split.payment)} is the card fee and ${rand(split.platform)} is what MyThuso keeps"
                },
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Bar(Indigo, split.nurse)
                Bar(Mango, split.payment)
                Bar(AccentSoft, split.platform)
            }
            Legend(Indigo, rand(split.nurse), "Yours · ${(split.nurseShareOfPrice * 100).roundToInt()}% of the price")
            Legend(Mango, rand(split.payment), "The card fee, paid by MyThuso")
            Legend(AccentSoft, rand(split.platform), "What MyThuso keeps")
            Text(Earnings.rule("share-is-not-reduced").sentence, style = MaterialTheme.typography.bodyMedium, color = BodyText)
            Note("Across the nine services at launch that is ${rand(Earnings.shareLow)} to ${rand(Earnings.shareHigh)} a visit — the same range the public page advertises, read from the same catalogue.")
        }

        Text("Your weeks", style = MaterialTheme.typography.titleLarge, color = Ink)
        Note(payCycle.note)
        payWeeks.forEach { week ->
            WeekCard(week, openWeek == week.id) { openWeek = if (openWeek == week.id) null else week.id }
        }

        Text("Tax", style = MaterialTheme.typography.titleLarge, color = Ink)
        CareCard {
            LabelledAmount("Reached your account since ${payTaxYear.startsOn}", rand(Earnings.paidThisTaxYear))
            LabelledAmount("Tax withheld by MyThuso", rand(0))
            Note(payTaxYear.note)
            Text(Earnings.rule("no-tax-withheld").sentence, style = MaterialTheme.typography.bodyMedium, color = BodyText)
            Refusal(Earnings.refusal("advise-on-tax"))
        }

        Text("Where you are paid", style = MaterialTheme.typography.titleLarge, color = Ink)
        CareCard {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                TileIcon(Icons.Outlined.AccountBalance, size = 38.dp)
                Column {
                    Text("${payoutAccount.bank} · ${payoutAccount.maskedNumber}",
                        style = MaterialTheme.typography.titleMedium, color = Ink)
                    Text(payoutAccount.holder, style = MaterialTheme.typography.bodySmall, color = BodyText)
                }
            }
            Note(payoutAccount.note)
            when (accountStage) {
                "settled" -> {
                    OutlinedButton({ accountStage = "verifying" }, shape = ThusoButtonShape) { Text("Change account") }
                    Text(Earnings.rule("account-change-waits").sentence,
                        style = MaterialTheme.typography.bodyMedium, color = BodyText)
                }
                "verifying" -> {
                    Note("Before anything changes, we check it is you. Nothing here is sent.")
                    payoutAccount.reverify.forEach { step ->
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Top) {
                            Icon(Icons.Outlined.Lock, null, tint = Indigo)
                            Text(step, style = MaterialTheme.typography.bodyMedium, color = Slate)
                        }
                    }
                    OutlinedTextField(code, { code = it.filter(Char::isDigit).take(6) },
                        label = { Text("One-time code") }, modifier = Modifier.fillMaxWidth())
                    Button({ accountStage = "pending" }, enabled = code.length == 6, shape = ThusoButtonShape) { Text("Verify and start the wait") }
                    OutlinedButton({ accountStage = "settled"; code = "" }, shape = ThusoButtonShape) { Text("Cancel") }
                }
                else -> {
                    Text("Waiting ${payoutAccount.coolingOffHours} hours",
                        style = MaterialTheme.typography.titleMedium, color = Ink)
                    Text(Earnings.rule("account-change-waits").sentence,
                        style = MaterialTheme.typography.bodyMedium, color = BodyText)
                    OutlinedButton({ accountStage = "settled"; code = "" }, shape = ThusoButtonShape) { Text("Cancel the change") }
                }
            }
        }

        Text("What this screen will not do", style = MaterialTheme.typography.titleLarge, color = Ink)
        payRefusals.filter { it.id != "advise-on-tax" }.forEach { CareCard { Refusal(it) } }
        Note("No money moves in this preview. Payment runs, bank verification and a real ledger arrive with the payment provider, and every amount above is arithmetic on the demo catalogue.")
    }
}

@Composable private fun RowScope.Bar(colour: Color, part: Int) {
    Box(Modifier.weight(part.toFloat()).fillMaxHeight().background(colour, RoundedCornerShape(4.dp)))
}

@Composable private fun Legend(colour: Color, amount: String, note: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Top) {
        Box(Modifier.padding(top = 4.dp).size(11.dp).background(colour, RoundedCornerShape(3.dp)))
        Column {
            Text(amount, style = MaterialTheme.typography.titleMedium, color = Ink)
            Text(note, style = MaterialTheme.typography.bodySmall, color = Faint)
        }
    }
}

@Composable private fun Metric(label: String, value: String, note: String) {
    CareCard {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = BodyText)
        Text(value, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, color = Ink)
        Text(note, style = MaterialTheme.typography.bodySmall, color = Faint)
    }
}

@Composable private fun LabelledAmount(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = BodyText, modifier = Modifier.weight(1f))
        Text(value, style = MaterialTheme.typography.titleMedium, color = Ink)
    }
}

@Composable private fun Refusal(item: PayRefusal) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
        Icon(Icons.Outlined.Block, null, tint = Danger)
        Text(item.sentence, style = MaterialTheme.typography.bodyMedium, color = Slate)
    }
}

@Composable private fun WeekCard(week: PayWeek, open: Boolean, toggle: () -> Unit) {
    val state = Earnings.state(week.state)
    CareCard {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 48.dp)
                .clickable(onClickLabel = if (open) "Collapse the week" else "Show every line in the week", role = Role.Button, onClick = toggle),
            horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top
        ) {
            Column {
                Text(rand(week.total), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = Ink)
                Text("Week to ${Scheduling.shortDate(week.ends)} · ${week.visits} visits",
                    style = MaterialTheme.typography.bodySmall, color = Faint)
            }
            StatusPill(state.name, when (week.state) {
                "paid" -> "teal"; "failed" -> "danger"; "in-transit" -> "sky"; else -> "amber"
            })
        }
        if (open) {
            Note(state.detail)
            week.failure?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium, color = Danger,
                    modifier = Modifier.fillMaxWidth().background(DangerSoft, RoundedCornerShape(ThusoRadius.card)).padding(12.dp))
            }
            week.lines.forEach { line ->
                Column(Modifier.padding(vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(line.service ?: Earnings.lineKind(line.kind).name,
                            style = MaterialTheme.typography.bodyLarge, color = Ink, modifier = Modifier.weight(1f))
                        Text(if (line.amount < 0) "− ${rand(line.amount)}" else rand(line.amount),
                            style = MaterialTheme.typography.titleSmall,
                            color = if (line.amount < 0) Danger else Ink)
                    }
                    Text("${line.reference} · ${line.patient}", style = MaterialTheme.typography.bodySmall, color = Faint)
                    line.plan?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = Indigo) }
                    line.reason?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = BodyText) }
                }
            }
            HorizontalDivider()
            LabelledAmount("Total for the week", rand(week.total))
            if (week.hasDeduction) Note(Earnings.rule("every-deduction-is-named").sentence)
        }
    }
}
