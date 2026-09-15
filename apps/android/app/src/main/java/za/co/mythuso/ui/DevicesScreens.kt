package za.co.mythuso.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import za.co.mythuso.model.*

/* Thuso Kit's registry on Android, and the one sentence none of these screens may soften.
 *
 * The nurse sees each instrument in her kit: whether it is reporting, stale or recalled, its calibration,
 * battery and firmware, and what Devices knows about each reading taken on it — where it came from, the
 * sample, whether it carries clinical weight, and its marks. The patient asking to link Health Connect
 * records a request and is told, in the contract's words, that nothing is connected and why.
 *
 * Every sentence is DevicesData.kt's, every number is the setting in force or model/Devices.kt's
 * arithmetic, and no reading's value is on any of these screens, because Devices never holds one. There is
 * no Android admin surface, so there is no recall desk here: the registry's recall is the seeded one.
 */

private fun healthTone(state: String) = when (state) {
    "reporting" -> "teal"
    "stale" -> "amber"
    "recalled" -> "danger"
    else -> "quiet"
}
/* The capture screens' rule, kept: an instrument out of calibration is a thing to look at and never a
   refusal, so overdue is amber and never the danger tone. A recall is the refusal, and it has that tone. */
private fun calibrationTone(state: String) = when (state) {
    "in-date" -> "teal"
    "due" -> "sky"
    "overdue" -> "amber"
    else -> "quiet"
}

/* ---- The nurse's kit ------------------------------------------------------------------------------ */

@Composable fun KitHealthSection(capture: CaptureStore? = null) {
    val text = DevicesData.NurseText
    remember(capture) { DevicesRegistry.ensureSeeded(capture); true }
    val now = System.currentTimeMillis()
    Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
        DeckSectionHead(text.heading, count = "${DevicesRegistry.devices.size}", note = text.intro)
        DevicesRegistry.devices.forEach { device -> key(device.deviceRef) { DeviceHealthCard(device, now) } }
        TonedCard {
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
                Icon(Icons.Outlined.Info, null, tint = MangoInk, modifier = Modifier.size(16.dp))
                Text(DevicesData.RuleText.calibrationNeverRefuses, style = MaterialTheme.typography.bodySmall, color = Charcoal)
            }
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
                Icon(Icons.Outlined.SensorsOff, null, tint = Charcoal, modifier = Modifier.size(16.dp))
                Text(DevicesData.RuleText.preview, style = MaterialTheme.typography.bodySmall, color = Charcoal)
            }
        }
    }
}

@Composable private fun DeviceHealthCard(device: RegisteredDevice, now: Long) {
    val text = DevicesData.NurseText
    val health = Devices.healthOf(device, now)
    val calibration = health.calibration
    CareCard {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
            TileIcon(Icons.Outlined.Sensors, size = 40.dp)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
                Text(device.model, style = MaterialTheme.typography.titleSmall, color = DeckInk.sheetInk)
                Note("${device.serial} · ${Devices.classOf(device.deviceClass)?.label ?: device.deviceClass}")
            }
            StatusPill(Devices.label(DevicesData.healthStates, health.stateId), healthTone(health.stateId))
        }
        val recall = device.recall
        if (health.recalled && recall != null) Column(
            Modifier.fillMaxWidth().background(DangerSoft, RoundedCornerShape(ThusoRadius.control)).padding(ThusoSpacing.space12)
                .semantics(mergeDescendants = true) {},
            verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)
        ) {
            Text(
                Devices.fill(text.recalledFrom, mapOf("when" to stampText(recall.effectiveFrom), "reason" to Devices.label(DevicesData.recallReasons, recall.reasonId))),
                style = MaterialTheme.typography.titleSmall, color = Charcoal
            )
            Text(text.doNotUse, style = MaterialTheme.typography.bodyMedium, color = Charcoal)
        }
        Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
            val lastSync = health.lastSyncAt
            Text(if (lastSync == null) text.neverSynced else Devices.fill(text.lastSync, mapOf("when" to stampText(lastSync))),
                style = MaterialTheme.typography.bodyMedium, color = DeckInk.sheetInk)
            if (health.stale) Text(Devices.fill(text.staleSince, mapOf("interval" to Devices.intervalText(DevicesData.staleAfterMinutes))),
                style = MaterialTheme.typography.bodySmall, color = MangoInk)
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
            StatusPill(Devices.label(DevicesData.calibrationStates, calibration.stateId), calibrationTone(calibration.stateId))
        }
        val dueOn = calibration.dueOn
        Note(when {
            calibration.stateId == "not-tracked" || dueOn == null -> text.calibrationNotTracked
            calibration.stateId == "overdue" -> Devices.fill(text.calibrationOverdue, mapOf("on" to formatVettingDate(dueOn)))
            calibration.stateId == "due" -> Devices.fill(text.calibrationDue, mapOf("on" to formatVettingDate(dueOn)))
            else -> Devices.fill(text.calibrationInDate, mapOf("on" to formatVettingDate(dueOn)))
        })
        val battery = health.batteryPercent
        Note((if (battery == null) text.batteryUnknown else Devices.fill(text.battery, mapOf("percent" to battery.toString()))) +
            " · " + Devices.fill(text.firmware, mapOf("version" to health.firmware)))
        val readings = DevicesRegistry.readingsOf(device.deviceRef)
        readings.forEach { reading ->
            HorizontalDivider(color = DeckInk.sheetLine)
            ReadingFacts(reading)
        }
    }
}

/* What Devices knows about one reading, which is everything but the number. A mark is drawn with its
   sentence wherever the reading is, because a caveat that lives only on the screen that made it is gone
   the second time anybody reads the reading. */
@Composable private fun ReadingFacts(reading: DeviceReading) {
    val text = DevicesData.NurseText
    val carries = Devices.carriesWeight(reading)
    Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
            Text(Devices.metricLabel(reading.metric), style = MaterialTheme.typography.labelLarge, color = DeckInk.sheetInk, modifier = Modifier.weight(1f))
            Text(stampText(reading.takenAt), style = MaterialTheme.typography.labelMedium, color = DeckInk.sheetQuiet)
        }
        ReviewLine(text.readingSource, Devices.sourceOf(reading.source)?.label ?: reading.source)
        ReviewLine(text.readingQuality, Devices.qualityOf(reading.quality)?.label ?: reading.quality)
        ReviewLine(text.readingWeight, if (carries) text.carries else text.carriesNot)
        reading.marks.mapNotNull(Devices::markOf).forEach { mark ->
            Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
                Icon(Icons.Outlined.Info, null, tint = MangoInk, modifier = Modifier.size(15.dp))
                Text("${mark.label}. ${mark.sentence}", style = MaterialTheme.typography.bodySmall, color = DeckInk.sheetQuiet)
            }
        }
    }
}

/* The source and the sample beside a reading on the capture queue. Only a reading taken on an instrument
   has a device source; a typed, reported or calculated one gets nothing rather than a guess. */
@OptIn(ExperimentalLayoutApi::class)
@Composable fun CaptureSourcePills(reading: CapturedReading) {
    if (reading.provenance != Provenance.DEVICE) return
    val text = DevicesData.NurseText
    val quality = Devices.captureQualityOf(reading)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
        StatusPill("${text.readingSource}: ${Devices.sourceOf("kit-instrument")?.label.orEmpty()}", "quiet")
        StatusPill("${text.readingQuality}: ${Devices.qualityOf(quality)?.label.orEmpty()}", "quiet")
    }
}

/* ---- The patient's wearable link ------------------------------------------------------------------ */

@Composable private fun CheckLine(label: String, checked: Boolean, change: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = TouchTarget).toggleable(checked, role = Role.Checkbox, onValueChange = change),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)
    ) {
        Checkbox(checked, null)
        Text(label, style = MaterialTheme.typography.bodyMedium, color = Charcoal, modifier = Modifier.weight(1f))
    }
}

/* A request, recorded, and nothing connected. There is no Connect button on this screen of any kind,
   enabled or not: the only action is recording what the patient agreed to, and the first sentence under
   the heading says in bold that nothing is read from the phone. */
@Composable fun WearableLinkScreen(platformId: String) {
    val platform = Devices.platformOf(platformId) ?: return
    val text = DevicesData.WearableText
    var chosen by remember { mutableStateOf(listOf<String>()) }
    var agreed by remember { mutableStateOf(false) }
    var refused by remember { mutableStateOf<DevicesRefusal?>(null) }
    val last = WearableLinks.last(platform.id)
    val open = last?.takeIf { it.withdrawnAt == null }
    ScreenColumn {
        DemoBadge()
        Heading(platform.phone, Devices.wearableLinkTitle(platform.id), "")
        NotConnected("wearables")
        if (open != null) CareCard {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
                TileIcon(Icons.Outlined.Watch)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
                    Text(platform.name, style = MaterialTheme.typography.titleMedium, color = Charcoal)
                    Note(platform.phone)
                }
                StatusPill(text.stateLabel, "amber")
            }
        }
        Text(text.notConnected, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold, color = Charcoal,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
        Note(text.why)
        Note(text.notInThisBuild)
        if (open != null) CareCard {
            Text(text.scopeHeading, style = MaterialTheme.typography.titleMedium, color = Charcoal)
            open.metrics.forEach { metric -> Text("· ${Devices.metricLabel(metric)}", style = MaterialTheme.typography.bodyMedium, color = Charcoal) }
            OutlinedButton(
                onClick = { refused = WearableLinks.withdraw(platform.id) },
                modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget), shape = ThusoButtonShape
            ) { Text(text.withdraw) }
        } else CareCard {
            Text(text.scopeHeading, style = MaterialTheme.typography.titleMedium, color = Charcoal)
            DevicesData.measureUnits.forEach { (id, _) ->
                CheckLine(Devices.metricLabel(id), id in chosen) { on -> chosen = if (on) chosen + id else chosen - id; refused = null }
            }
            HorizontalDivider(color = StudioLine)
            Text(text.consentHeading, style = MaterialTheme.typography.titleMedium, color = Charcoal)
            /* The purpose's name, not its wording: the consent's words live only where its fingerprint is built. */
            CheckLine(text.consentName, agreed) { agreed = it; refused = null }
            Note(text.consentWithdrawal)
            Button(
                onClick = {
                    refused = WearableLinks.request(platform.id, chosen, agreed)
                    if (refused == null) { chosen = emptyList(); agreed = false }
                },
                enabled = agreed && chosen.isNotEmpty(),
                modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget), shape = ThusoButtonShape
            ) { Text(text.request) }
        }
        if (last?.withdrawnAt != null) Text(text.withdrawn, style = MaterialTheme.typography.bodyMedium, color = Charcoal,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
        refused?.let { Text(it.statement, style = MaterialTheme.typography.bodyMedium, color = Danger) }
    }
}
