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
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import za.co.mythuso.model.Disclosure
import za.co.mythuso.model.MomEssentialData
import za.co.mythuso.model.MomEssentialJourney
import za.co.mythuso.model.lineDetailChoices
import za.co.mythuso.model.momEssentialPlanName
import za.co.mythuso.model.momEssentialTier
import za.co.mythuso.model.momFill
import za.co.mythuso.model.momFirstName
import za.co.mythuso.model.momPlan
import za.co.mythuso.model.sponsorNeverSees
import za.co.mythuso.model.sponsorSees

/*
 * MyThuso for Mom Essential on Android, as the two people it is between.
 *
 * The reader is usually the son or daughter far away, and what they opened this for is a yes: will a nurse start going
 * to their mother. So the screen leads with the state of that yes, in the contract's words, and under it only the next
 * step. The parent's side is a different perspective on the same screen, named at the top, because the preview has no
 * second phone and a reader who lost track of whose screen this is could agree as the wrong person.
 *
 * A sponsor is shown no control for agreeing: the route's refusal is said where the button would have been. Nothing is
 * charged — this app runs no payment provider, and the pay step says so in the contract's sentence — so a plan never
 * starts here. Every word is generated and every figure is PlansData's. Full-width rows throughout, at least 48dp tall,
 * so font scale 2.0 reflows rather than clips.
 */
private val dayFormat: DateTimeFormatter = DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.forLanguageTag("en-ZA"))

/** The journey, in a column of its own, drawn by the Mom plan screen under the plan so it shares that screen's scroll. */
@Composable fun MomEssentialContent() {
    var journey by remember { mutableStateOf(MomEssentialJourney()) }
    var refused by remember { mutableStateOf<String?>(null) }
    val w = MomEssentialData.Words
    val values = mapOf("plan" to momEssentialPlanName, "parent" to momFirstName(journey.parent), "sponsor" to momFirstName(journey.sponsor))
    fun say(text: String, extra: Map<String, String> = emptyMap()) = momFill(text, values + extra)
    fun switchTo(parent: Boolean) { journey = journey.copy(actingAsParent = parent); refused = null }

    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space24)) {
        Heading(say(if (journey.actingAsParent) w.actingParent else w.actingSponsor), say(w.sponsorHeading), w.previewNote)
        journey.state?.let { state ->
            CareCard {
                Text(state.name, style = MaterialTheme.typography.titleSmall, color = Charcoal)
                Text(say(if (journey.actingAsParent) state.parentWords else state.sponsorWords), style = MaterialTheme.typography.bodyLarge, color = Charcoal)
            }
        }
        refused?.let { Ruled(it) }

        when {
            journey.stage == 0 -> {
                momEssentialTier?.let { tier ->
                    CareCard {
                        Text(momEssentialPlanName, style = MaterialTheme.typography.titleMedium, color = Charcoal)
                        Text("${rand(tier.price)} / month", style = MaterialTheme.typography.titleMedium, color = Charcoal)
                        Text(tier.cadence, style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
                        tier.includes.forEach { Text("• ${it.text}", style = MaterialTheme.typography.bodyMedium, color = Charcoal) }
                    }
                }
                NotConnected("payments")
                Ruled(momPlan.refusals.first { it.id == "paying-is-not-seeing" }.sentence)
                Ruled(w.guardian)
                Action(say(w.ask), prominent = true) { journey = journey.ask(); refused = null }
            }
            journey.stage == 1 && !journey.actingAsParent -> {
                Note(w.onlyTheParentAgrees)
                Action(say(w.openAsParent)) { switchTo(true) }
            }
            journey.stage == 1 -> {
                Text(say(w.parentHeading), style = MaterialTheme.typography.titleMedium, color = Charcoal, modifier = Modifier.semantics { heading() })
                Text(say(w.lineDetailLegend), style = MaterialTheme.typography.titleSmall, color = Charcoal)
                Column(Modifier.selectableGroup(), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
                    lineDetailChoices.forEach { choice ->
                        ChoiceRow(choice.name, choice.detail, journey.lineDetail == choice.id) { journey = journey.copy(lineDetail = choice.id) }
                    }
                }
                val until = LocalDate.now().plusDays(MomEssentialData.summaryDays.toLong()).format(dayFormat)
                Row(
                    Modifier.fillMaxWidth().heightIn(min = TouchTarget)
                        .toggleable(value = journey.shareSummaries, role = Role.Checkbox) { journey = journey.copy(shareSummaries = it) },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)
                ) {
                    Checkbox(checked = journey.shareSummaries, onCheckedChange = null)
                    Column(Modifier.weight(1f)) {
                        Text(say(w.summariesLabel), style = MaterialTheme.typography.titleSmall, color = Charcoal)
                        Text(say(w.summariesDetail, mapOf("until" to until)), style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
                    }
                }
                Action(say(w.agree), prominent = true) { val (next, refusal) = journey.agree(); journey = next; refused = refusal }
                Action(say(w.backToSponsor)) { switchTo(false) }
            }
            !journey.actingAsParent -> {
                NotConnected("payments")
                Action(w.pay, prominent = true) { journey = journey.pay() }
                if (journey.paymentTried) Ruled(w.nothingCharged)
                Text(say(w.view), style = MaterialTheme.typography.titleMedium, color = Charcoal, modifier = Modifier.semantics { heading() })
                Note(journey.sharedUntil?.let { say(w.summariesShared, mapOf("until" to it.format(dayFormat))) } ?: say(w.summariesNone))
                Disclosures(w.seesHeading, sponsorSees)
                Disclosures(w.neverSeesHeading, sponsorNeverSees)
                Note(w.notBuilt)
                Action(say(w.openAsParent)) { switchTo(true) }
            }
            else -> {
                Text(w.medicineHeading, style = MaterialTheme.typography.titleMedium, color = Charcoal, modifier = Modifier.semantics { heading() })
                Text(say(w.medicine), style = MaterialTheme.typography.bodyLarge, color = Charcoal)
                Note(w.delegate)
                NotConnected("medicine-collection")
                Action(say(w.backToSponsor)) { switchTo(false) }
            }
        }
    }
}

@Composable private fun Action(title: String, prominent: Boolean = false, onClick: () -> Unit) {
    val modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget)
    if (prominent) Button(onClick = onClick, shape = ThusoButtonShape, modifier = modifier, colors = ButtonDefaults.buttonColors(containerColor = Charcoal)) { Text(title) }
    else OutlinedButton(onClick = onClick, shape = ThusoButtonShape, modifier = modifier) { Text(title, color = Charcoal) }
}

/* Selected by a lilac ground and a charcoal border together, and announced as a selected radio button — never by the
   fill alone. The whole row is the target. */
@Composable private fun ChoiceRow(title: String, detail: String, selected: Boolean, choose: () -> Unit) {
    val shape = RoundedCornerShape(ThusoRadius.control)
    Column(
        Modifier.fillMaxWidth().heightIn(min = TouchTarget).clip(shape)
            .background(if (selected) StudioLilac else SurfaceWhite, shape)
            .border(1.dp, if (selected) Charcoal else StudioLine, shape)
            .selectable(selected = selected, onClick = choose, role = Role.RadioButton)
            .padding(ThusoSpacing.space12),
        verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)
    ) {
        Text(title, style = MaterialTheme.typography.titleSmall, color = Charcoal)
        Text(detail, style = MaterialTheme.typography.bodySmall, color = if (selected) Charcoal else StudioInkMuted)
    }
}

@Composable private fun Disclosures(heading: String, items: List<Disclosure>) {
    Section(heading) { items.forEach { Text(it.what, style = MaterialTheme.typography.bodyMedium, color = Charcoal) } }
}

@Composable private fun Ruled(text: String) {
    Text(
        text, style = MaterialTheme.typography.bodyMedium, color = Charcoal,
        modifier = Modifier.drawBehind { drawRect(Charcoal, size = Size(2.dp.toPx(), size.height)) }.padding(start = ThusoSpacing.space12)
    )
}
