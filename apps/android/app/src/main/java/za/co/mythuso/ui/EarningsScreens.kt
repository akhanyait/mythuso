package za.co.mythuso.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountBalance
import androidx.compose.material.icons.outlined.Block
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Payments
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

/* Internal rather than private since the workspace strip started deriving “this week so far” from
   Earnings.currentWeek rather than typing a figure: a second money formatter beside this one would
   be two ways of writing the same rands, and they would disagree on the day somebody changed one. */
internal fun rand(amount: Int): String {
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

    /* Oldest week first, so the panel's columns run the way time does. The lit ones are the weeks the
       figure over them adds up — settled nowhere and no longer accruing — which is exactly
       Earnings.owedNotYetPaid's own filter, so the drawing and the number cannot disagree. */
    val chronological = payWeeks.sortedBy { it.ends }

    ScreenColumn {
        /* THE MONEY IS THE DECK, AND THE STANDING STANDS ON IT.
           Three white cards of equal weight used to hold this week, what is owed and the tax year, so
           the one figure a nurse opens this screen for was the same size as the two she reads once a
           month. This week is the lead now, on glass, with the four completed weeks drawn behind it;
           what is owed is the pale panel, its columns the weeks themselves; and the tax year is the
           night card crossing the panel's edge. The banner that reads the vetting register is the sheet
           on the canvas's edge, tinted mango when it refuses, and switching the nurse on the canvas
           changes the banner and not one figure — which is the rule, made visible. */
        DeckHero(
            sheetFill = if (dispatchable.allowed) SurfaceWhite else DeckInk.attentionWash,
            content = {
                DeckPreviewMark()
                DeckHeadline(
                    "Nurse workspace",
                    listOf(DeckWord.Words("Earnings"), DeckWord.Glyph(Icons.Outlined.Payments), DeckWord.Words("& payouts")),
                    tail = "Fictional visits, a fictional bank, and nothing transferred."
                )
                DeckPills("Preview this screen as", nurse.id, nurses.map { it.id to it.name }) { nurseId = it }
                Text(
                    "The same earnings, seen by a cleared nurse and by one whose police clearance lapsed nine days ago. Only the banner changes — which is the rule.",
                    style = MaterialTheme.typography.bodySmall, color = DeckInk.quiet
                )
                DeckGlassCard {
                    DeckFigure(
                        value = rand(Earnings.currentWeek.total).removePrefix("R "), prefix = "R", label = "This week so far",
                        chip = "${Earnings.currentWeek.visits} visits · closes ${payCycle.closesOn}, pays ${payCycle.paysOn}",
                        shape = DeckShape.Spark(chronological.filter { it.state != "accruing" }.map { it.total })
                    )
                }
                DeckPanel(float = {
                    DeckFigure(
                        value = rand(Earnings.paidThisTaxYear).removePrefix("R "), prefix = "R",
                        label = "Reached your account this tax year",
                        chip = "Since ${payTaxYear.startsOn} · ${payTaxYear.label}", ground = DeckGround.NIGHT
                    )
                }) {
                    DeckFigure(
                        value = rand(Earnings.owedNotYetPaid).removePrefix("R "), prefix = "R",
                        label = "Owed, not yet in your account", chip = "On its way, or waiting on a bank",
                        shape = DeckShape.Columns(
                            chronological.map { it.total },
                            chronological.map { !Earnings.state(it.state).settled && it.state != "accruing" }
                        ),
                        ground = DeckGround.PANEL
                    )
                }
            },
            sheet = {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
                    Icon(if (dispatchable.allowed) Icons.Outlined.Verified else Icons.Outlined.WarningAmber, null,
                        tint = if (dispatchable.allowed) DeckInk.sheetInk else MangoInk)
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(if (dispatchable.allowed) "Cleared for visits" else "You will not be sent new visits",
                            style = MaterialTheme.typography.titleMedium, color = DeckInk.sheetInk)
                        Text(
                            if (dispatchable.allowed) "Every check is verified and in date. Visits can be sent to you."
                            else dispatchable.reason.orEmpty(),
                            style = MaterialTheme.typography.bodyMedium, color = DeckInk.sheetQuiet
                        )
                        if (!dispatchable.allowed) Text(Earnings.rule("suspension-is-not-confiscation").sentence,
                            style = MaterialTheme.typography.bodyMedium, color = DeckInk.sheetInk)
                    }
                }
            }
        )
        Note(Earnings.rule("accrued-is-not-paid").sentence)

        DeckSectionHead("Where the money goes")
        CareCard {
            DeckPills("Show the split for", service.id, Earnings.pricedServices.map { it.id to it.name }, onNight = false) { serviceId = it }
            val split = Earnings.split(service)
            Row(
                Modifier.fillMaxWidth().height(16.dp).studioChartEntrance(service.id).semantics {
                    contentDescription = "Of ${rand(split.price)}, ${rand(split.nurse)} is yours, " +
                        "${rand(split.payment)} is the card fee and ${rand(split.platform)} is what MyThuso keeps"
                },
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Bar(DeckInk.sheetInk, split.nurse)
                Bar(Mango, split.payment)
                Bar(AccentSoft, split.platform)
            }
            Legend(DeckInk.sheetInk, rand(split.nurse), "Yours · ${(split.nurseShareOfPrice * 100).roundToInt()}% of the price")
            Legend(Mango, rand(split.payment), "The card fee, paid by MyThuso")
            Legend(AccentSoft, rand(split.platform), "What MyThuso keeps")
            /* Opened by what the share is, in Money's setting as generated, which never states a fraction:
               the share above it is not the same part of every visit. */
            Text("${za.co.mythuso.model.MoneyData.nurseShareSentence} ${Earnings.rule("share-is-not-reduced").sentence}", style = MaterialTheme.typography.bodyMedium, color = DeckInk.sheetQuiet)
            Note("Across the nine services at launch that is ${rand(Earnings.shareLow)} to ${rand(Earnings.shareHigh)} a visit — the same range the public page advertises, read from the same catalogue.")
        }

        DeckSectionHead("Your weeks", count = "${payWeeks.size}", note = payCycle.note)
        payWeeks.forEach { week ->
            WeekCard(week, openWeek == week.id) { openWeek = if (openWeek == week.id) null else week.id }
        }

        DeckSectionHead("Tax")
        CareCard {
            LabelledAmount("Reached your account since ${payTaxYear.startsOn}", rand(Earnings.paidThisTaxYear))
            LabelledAmount("Tax withheld by MyThuso", rand(0))
            Note(payTaxYear.note)
            Text(Earnings.rule("no-tax-withheld").sentence, style = MaterialTheme.typography.bodyMedium, color = DeckInk.sheetQuiet)
            Refusal(Earnings.refusal("advise-on-tax"))
        }

        DeckSectionHead("Where you are paid")
        CareCard {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                TileIcon(Icons.Outlined.AccountBalance, size = 38.dp)
                Column {
                    Text("${payoutAccount.bank} · ${payoutAccount.maskedNumber}",
                        style = MaterialTheme.typography.titleMedium, color = DeckInk.sheetInk)
                    Text(payoutAccount.holder, style = MaterialTheme.typography.bodySmall, color = DeckInk.sheetQuiet)
                }
            }
            Note(payoutAccount.note)
            when (accountStage) {
                "settled" -> {
                    OutlinedButton({ accountStage = "verifying" }, shape = ThusoButtonShape) { Text("Change account") }
                    Text(Earnings.rule("account-change-waits").sentence,
                        style = MaterialTheme.typography.bodyMedium, color = DeckInk.sheetQuiet)
                }
                "verifying" -> {
                    Note("Before anything changes, we check it is you. Nothing here is sent.")
                    payoutAccount.reverify.forEach { step ->
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Top) {
                            Icon(Icons.Outlined.Lock, null, tint = DeckInk.sheetInk)
                            Text(step, style = MaterialTheme.typography.bodyMedium, color = DeckInk.sheetInk)
                        }
                    }
                    OutlinedTextField(code, { code = it.filter(Char::isDigit).take(6) },
                        label = { Text("One-time code") }, modifier = Modifier.fillMaxWidth())
                    DeckButton({ accountStage = "pending" }, enabled = code.length == 6, shape = ThusoButtonShape) { Text("Verify and start the wait") }
                    OutlinedButton({ accountStage = "settled"; code = "" }, shape = ThusoButtonShape) { Text("Cancel") }
                }
                else -> {
                    Text("Waiting ${payoutAccount.coolingOffHours} hours",
                        style = MaterialTheme.typography.titleMedium, color = DeckInk.sheetInk)
                    Text(Earnings.rule("account-change-waits").sentence,
                        style = MaterialTheme.typography.bodyMedium, color = DeckInk.sheetQuiet)
                    OutlinedButton({ accountStage = "settled"; code = "" }, shape = ThusoButtonShape) { Text("Cancel the change") }
                }
            }
        }

        DeckSectionHead("What this screen will not do", count = "${payRefusals.count { it.id != "advise-on-tax" }}")
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
            Text(amount, style = MaterialTheme.typography.titleMedium, color = DeckInk.sheetInk)
            Text(note, style = MaterialTheme.typography.bodySmall, color = DeckInk.sheetQuiet)
        }
    }
}

@Composable private fun LabelledAmount(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = DeckInk.sheetQuiet, modifier = Modifier.weight(1f))
        Text(value, style = MaterialTheme.typography.titleMedium, color = DeckInk.sheetInk)
    }
}

@Composable private fun Refusal(item: PayRefusal) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
        Icon(Icons.Outlined.Block, null, tint = Danger)
        Text(item.sentence, style = MaterialTheme.typography.bodyMedium, color = DeckInk.sheetInk)
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
                Text(rand(week.total), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = DeckInk.sheetInk)
                Text("Week to ${Scheduling.shortDate(week.ends)} · ${week.visits} visits",
                    style = MaterialTheme.typography.bodySmall, color = DeckInk.sheetQuiet)
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
                            style = MaterialTheme.typography.bodyLarge, color = DeckInk.sheetInk, modifier = Modifier.weight(1f))
                        Text(if (line.amount < 0) "− ${rand(line.amount)}" else rand(line.amount),
                            style = MaterialTheme.typography.titleSmall,
                            color = if (line.amount < 0) Danger else DeckInk.sheetInk)
                    }
                    Text("${line.reference} · ${line.patient}", style = MaterialTheme.typography.bodySmall, color = DeckInk.sheetQuiet)
                    line.plan?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = DeckInk.sheetInk) }
                    line.reason?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = DeckInk.sheetQuiet) }
                }
            }
            HorizontalDivider()
            LabelledAmount("Total for the week", rand(week.total))
            if (week.hasDeduction) Note(Earnings.rule("every-deduction-is-named").sentence)
        }
    }
}
