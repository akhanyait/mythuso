package za.co.mythuso.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import za.co.mythuso.model.*

/* Sentinel and safeguarding on Android, where a nurse carries them: under her kit, the patient's
 * baselines, why nothing is evaluated, a tier raised by hand and the sentence tier four is refused in;
 * and a safeguarding concern recorded by choosing who it is about and the kind, with nothing typed. The
 * Control Tower's safeguarding list is web-only, because the desk works at a desk.
 *
 * Every sentence is SentinelData.kt's, generated from packages/catalog/sentinel.json and
 * packages/catalog/apis/safety.json, and every state is model/Sentinel.kt's arithmetic. No reading's
 * value is on any of these screens, and the kind of concern is never shown again after it is chosen.
 */

private fun baselineTone(state: String) = when (state) {
    "formed" -> "teal"
    "suspended" -> "amber"
    else -> "quiet"
}
private fun toldTone(code: String) = when (code) {
    "core-loop" -> "danger"
    "nurse-queue" -> "amber"
    else -> "quiet"
}

@Composable fun SentinelSection(patient: String, capture: CaptureStore? = null) {
    val text = SentinelData.SentinelText
    remember(capture) { SentinelStore.ensureSeeded(capture); true }
    val now = System.currentTimeMillis()
    var entry by remember { mutableStateOf<String?>(null) }
    var rung by remember { mutableStateOf<Int?>(null) }
    var refused by remember { mutableStateOf<SentinelRefusal?>(null) }
    var notice by remember { mutableStateOf("") }
    var reporting by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
        DeckSectionHead(text.heading, count = "${SentinelStore.baselines.size}", note = text.intro)
        CareCard {
            Text(Sentinel.fill(text.patient, mapOf("patient" to patient)), style = MaterialTheme.typography.titleSmall, color = DeckInk.sheetInk)
            StatusPill(text.evaluation, "quiet")
            Text(SentinelData.RuleText.notEvaluated, style = MaterialTheme.typography.bodyMedium, color = DeckInk.sheetInk)
        }
        SentinelStore.views(now).forEach { view ->
            key(view.metric) {
                CareCard {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
                        Text(Devices.metricLabel(view.metric), style = MaterialTheme.typography.titleSmall, color = DeckInk.sheetInk, modifier = Modifier.weight(1f))
                        StatusPill(Sentinel.label(SentinelData.baselineStates, view.stateId), baselineTone(view.stateId))
                    }
                    Note(Sentinel.fill(text.counted, mapOf("counted" to "${view.counted}", "needed" to "${view.needed}", "days" to "${view.windowDays}")))
                    view.suspendedSince?.let { since ->
                        Text(Sentinel.fill(text.suspendedSince, mapOf("time" to stampText(since))), style = MaterialTheme.typography.bodySmall, color = MangoInk)
                    }
                    if (view.leftByRecall > 0) Text(Sentinel.fill(text.leftByRecall, mapOf("count" to "${view.leftByRecall}")), style = MaterialTheme.typography.bodySmall, color = Charcoal)
                }
            }
        }
        Note(SentinelData.RuleText.suspendedMeans)
        Note(SentinelData.RuleText.recalledMeans)
        Note(Sentinel.fill(text.staleFrom, mapOf("interval" to Devices.intervalText(DevicesData.staleAfterMinutes))))

        CareCard {
            Text(text.raiseHeading, style = MaterialTheme.typography.titleSmall, color = DeckInk.sheetInk)
            Note(text.raiseIntro)
            Text(text.entry, style = MaterialTheme.typography.labelLarge, color = DeckInk.sheetInk)
            SentinelStore.entries().forEach { reading ->
                ChoiceRow("${Devices.metricLabel(reading.metric)} · ${stampText(reading.heardAt)}", null, entry == reading.readingRef) { entry = reading.readingRef; refused = null }
            }
            Text(text.rung, style = MaterialTheme.typography.labelLarge, color = DeckInk.sheetInk)
            SentinelData.rungs.forEach { option ->
                ChoiceRow(option.label, option.whoIsTold, rung == option.rung) { rung = option.rung; refused = null }
            }
            Button(onClick = {
                val refusal = SentinelStore.raise(entry, rung)
                refused = refusal
                if (refusal == null) {
                    SentinelStore.raised.firstOrNull()?.let {
                        notice = Sentinel.fill(text.raised, mapOf("rung" to "${it.rung.rung}", "time" to stampText(it.raisedAt))) + " " + it.rung.whoIsTold
                    }
                    entry = null
                    rung = null
                }
            }, modifier = Modifier.fillMaxWidth()) { Text(text.raise) }
            refused?.let { Text(it.statement, style = MaterialTheme.typography.bodyMedium, color = Charcoal) }
            if (notice.isNotEmpty()) Note(notice)
        }

        CareCard {
            Text(text.tierFourHeading, style = MaterialTheme.typography.titleSmall, color = DeckInk.sheetInk)
            Text(SentinelData.tierFourRefusal, style = MaterialTheme.typography.bodyMedium, color = DeckInk.sheetInk)
            SentinelData.tierFourNeeds.forEach { Note(it) }
        }

        DeckSectionHead(text.raisedList, count = "${SentinelStore.raised.size}")
        if (SentinelStore.raised.isEmpty()) Note(text.noneRaised)
        SentinelStore.raised.forEach { item ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
                StatusPill(item.rung.label, toldTone(item.rung.toldCode))
                Note("${Devices.metricLabel(item.metric)} · ${stampText(item.raisedAt)}")
            }
        }

        OutlinedButton(onClick = { reporting = !reporting }, modifier = Modifier.fillMaxWidth()) { Text(SentinelData.ReportText.heading) }
        if (reporting) SafeguardingReportCard(patient)
        Note(SentinelData.RuleText.preview)
    }
}

/* One choice among a few, read out as a radio button: a reading, a tier, a group or a kind. */
@Composable private fun ChoiceRow(label: String, detail: String?, selected: Boolean, onSelect: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().selectable(selected = selected, role = Role.RadioButton, onClick = onSelect).padding(vertical = ThusoSpacing.space4),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)
    ) {
        RadioButton(selected = selected, onClick = null)
        Column(Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.bodyMedium, color = DeckInk.sheetInk)
            detail?.let { Note(it) }
        }
    }
}

/* Recording a safeguarding concern. Nothing is typed, and the button is never disabled, so a report
   without who it is about or its kind is refused in the route's own sentence. Once recorded, the card
   says it is open, held for an officer nobody holds yet and not sent, and never shows the kind again. */
@Composable private fun SafeguardingReportCard(patient: String) {
    val text = SentinelData.ReportText
    var group by remember { mutableStateOf<String?>(null) }
    var category by remember { mutableStateOf<String?>(null) }
    var recorded by remember { mutableStateOf<SentinelReport?>(null) }
    var refused by remember { mutableStateOf<SentinelRefusal?>(null) }
    CareCard {
        Text(text.heading, style = MaterialTheme.typography.titleSmall, color = DeckInk.sheetInk)
        Note(text.intro)
        Text(Sentinel.fill(text.patient, mapOf("patient" to patient)), style = MaterialTheme.typography.bodyMedium, color = DeckInk.sheetInk)
        Text(text.group, style = MaterialTheme.typography.labelLarge, color = DeckInk.sheetInk)
        SentinelData.groups.forEach { g -> ChoiceRow(g.label, null, group == g.id) { group = g.id; refused = null } }
        Text(text.category, style = MaterialTheme.typography.labelLarge, color = DeckInk.sheetInk)
        SentinelData.categories.forEach { c -> ChoiceRow(c.label, null, category == c.id) { category = c.id; refused = null } }
        Note(SentinelData.RuleText.categoryIsProtected)
        Note(SentinelData.RuleText.noNarrative)
        Button(onClick = {
            val (report, refusal) = SentinelStore.record(group, category)
            refused = refusal
            if (report != null) {
                recorded = report
                group = null
                category = null
            }
        }, modifier = Modifier.fillMaxWidth()) { Text(text.record) }
        refused?.let { Text(it.statement, style = MaterialTheme.typography.bodyMedium, color = Charcoal) }
        recorded?.let { report ->
            HorizontalDivider(color = DeckInk.sheetLine)
            Text(Sentinel.fill(text.recorded, mapOf("time" to stampText(report.recordedAt))), style = MaterialTheme.typography.titleSmall, color = DeckInk.sheetInk)
            Text(SentinelData.RuleText.notSent, style = MaterialTheme.typography.bodyMedium, color = Charcoal)
            SentinelData.statutoryMayApply.firstOrNull { it.id == report.groupCode }?.let { Note(it.sentence) }
            Note(SentinelData.RuleText.heldFor)
            Note(SentinelData.RuleText.neverAutoCloses)
            Note(SentinelData.RuleText.reporterNeverShown)
        }
    }
}
