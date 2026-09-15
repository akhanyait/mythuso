package za.co.mythuso.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import za.co.mythuso.model.MomInclusion
import za.co.mythuso.model.MomTier
import za.co.mythuso.model.PlanSubscription
import za.co.mythuso.model.momEssentialTitle
import za.co.mythuso.model.momGroups
import za.co.mythuso.model.momPlan
import za.co.mythuso.model.momPrices

/*
 * MyThuso for Mom on Android: three prices, what each would bring, and what is not real yet.
 *
 * The web draws the three tiers as one row of choices. At font scale 2.0 a third of a phone's width
 * cannot hold "R 1 299 / month", so here they are stacked rows — the same choice and the same words,
 * with one tier's inclusions shown beneath.
 *
 * Every number and sentence is generated into PlansData.kt. Each group of inclusions ends with
 * NotConnected for the capability it waits on, so the sentence is the contract's and leaves the day
 * that capability is connected. Nothing here joins a plan: there is no button for it, and the payments
 * notice sits above the prices. The heading says "would bring" rather than "includes" because a plan
 * does not include a device that has not been built.
 *
 * The names, "Everything in Essential", Plus's call-outs, the report's wording and what priority SOS
 * means are Money's settings. This app has no admin surface, so it shows their defaults as generated,
 * and the two questions this screen used to list as not decided are those settings.
 */
@Composable fun MomPlanScreen() {
    var chosen by rememberSaveable { mutableStateOf(momPlan.tiers.first().id) }
    /* The Essential journey opens under the plan, in the same column, rather than as a screen of its own: it is read
       after the plan's refusals, and a back step that returns to the plan would lose the choices made in the journey. */
    var journeyOpen by rememberSaveable { mutableStateOf(false) }
    val tier = momPlan.tiers.firstOrNull { it.id == chosen } ?: momPlan.tiers.first()
    ScreenColumn {
        Heading(momPlan.payerHeadline, momPlan.name, momPlan.payerStatement)
        NotConnected("payments")
        Column(Modifier.selectableGroup(), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
            momPlan.tiers.forEach { option -> TierRow(option, option.id == chosen) { chosen = option.id } }
        }
        CareCard {
            Text(
                "What ${tier.name} would bring · Phase ${tier.phase}", style = MaterialTheme.typography.titleMedium,
                color = Charcoal, modifier = Modifier.semantics { heading() }
            )
            tier.inherits?.let { Text(it, style = MaterialTheme.typography.titleSmall, color = Charcoal) }
            momGroups(tier).forEach { group ->
                Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
                    group.items.forEach { InclusionRow(it) }
                    NotConnected(group.capability)
                }
            }
        }
        Section("What no plan does") {
            momPlan.refusals.forEach { refusal ->
                Text(
                    refusal.sentence, style = MaterialTheme.typography.bodyMedium, color = Charcoal,
                    modifier = Modifier.drawBehind { drawRect(Charcoal, size = Size(2.dp.toPx(), size.height)) }
                        .padding(start = ThusoSpacing.space12)
                )
            }
        }
        Section("Add-ons") {
            Note(momPlan.addOnsStatement)
            momPlan.addOns.forEach { Text(it.name, style = MaterialTheme.typography.bodyMedium, color = Charcoal) }
        }
        Section("Sharing the cost") { Note(momPlan.splittingStatement) }
        /* The way into the Essential journey, under everything the plan says it will not do. A preview that charges
           nothing, and the journey says so. */
        if (journeyOpen) MomEssentialContent()
        else OutlinedButton(onClick = { journeyOpen = true }, shape = ThusoButtonShape, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)) {
            Text(momEssentialTitle(), color = Charcoal)
        }
    }
}

/* Selected by a lilac ground and a charcoal border together, and announced as a selected radio button
   — never by the fill alone. The whole row is the target, at least 48dp tall. */
@Composable private fun TierRow(tier: MomTier, selected: Boolean, choose: () -> Unit) {
    val shape = RoundedCornerShape(ThusoRadius.control)
    Row(
        Modifier.fillMaxWidth().heightIn(min = TouchTarget).clip(shape)
            .background(if (selected) StudioLilac else SurfaceWhite, shape)
            .border(1.dp, if (selected) Charcoal else StudioLine, shape)
            .selectable(selected = selected, onClick = choose, role = Role.RadioButton)
            .padding(ThusoSpacing.space12),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)
    ) {
        Column(Modifier.weight(1f)) {
            Text(tier.name, style = MaterialTheme.typography.titleSmall, color = Charcoal)
            Text(tier.cadence, style = MaterialTheme.typography.bodySmall, color = if (selected) Charcoal else StudioInkMuted)
        }
        Text("${rand(tier.price)} / month", style = MaterialTheme.typography.titleMedium, color = Charcoal, textAlign = TextAlign.End)
    }
}

@Composable private fun InclusionRow(item: MomInclusion) {
    Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
        Text("•", style = MaterialTheme.typography.bodyMedium, color = Charcoal)
        Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
            Text(item.text, style = MaterialTheme.typography.bodyMedium, color = Charcoal)
            item.detail?.let { Note(it) }
        }
    }
}

/* What a plans row says a plan costs each month. A tiered plan reads as its range rather than its
   cheapest price: "R 399 / month" beside a plan whose Premium is R 1 299 is a figure somebody would
   reasonably expect to pay for everything the plan is known for. */
internal fun planMonthly(plan: PlanSubscription): String = when {
    plan.tiered -> "${rand(momPrices.minOrNull() ?: 0)} to ${rand(momPrices.maxOrNull() ?: 0)} / month"
    plan.price == null -> "Custom pricing"
    else -> "${rand(plan.price)} / month"
}
