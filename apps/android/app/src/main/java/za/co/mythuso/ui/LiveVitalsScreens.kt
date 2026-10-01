package za.co.mythuso.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Block
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import za.co.mythuso.model.LiveRangePlace
import za.co.mythuso.model.LiveReading
import za.co.mythuso.model.LiveStreamSpec
import za.co.mythuso.model.LiveVitals
import za.co.mythuso.model.LiveVitalsData
import za.co.mythuso.ui.components.ThusoButton
import za.co.mythuso.ui.components.ThusoButtonSize
import za.co.mythuso.ui.components.ThusoButtonVariant

/* The patient's devices, live and simulated, beside the doctor's consultation on Android — the compact panel
   the web draws in the call room and the consultation record's rail (the founder, 1 October 2026: "even on
   consultation the doctor sees them").

   Every stream, scenario, sentence and refusal is LiveVitalsData.kt's, generated from
   packages/catalog/live-vitals.json; every number is LiveVitals.kt's arithmetic. A row says the reading, its
   unit, the instrument it stands for, that it is simulated, how long ago it arrived and where it stands
   against the record's range in words. Where the Lovable export drew a score, a triage colour, an
   interpretation, alarms and a heatmap, the panel draws the contract's sentence saying why not.

   MOTION. None. The numbers change every two seconds while the simulation runs; nothing animates, so the
   system's animation scale has nothing to stop. The clock is a LaunchedEffect, cancelled when the panel
   leaves the composition. TalkBack reads each row as one node; nothing is a live region, because a panel
   announcing itself every two seconds would talk over the consultation it sits beside. */
@Composable fun LiveVitalsPanel(subject: String) {
    val w = LiveVitalsData.Words
    var presetId by remember { mutableStateOf(LiveVitalsData.defaultPreset) }
    var tick by remember { mutableIntStateOf(0) }
    var running by remember { mutableStateOf(true) }
    var startedAt by remember { mutableLongStateOf(System.currentTimeMillis()) }
    var receivedAt by remember { mutableLongStateOf(startedAt) }
    var now by remember { mutableLongStateOf(startedAt) }
    val seed = remember(subject) { LiveVitals.seedOf(subject) }
    val live = LiveVitals.streamsLive(presetId)

    LaunchedEffect(presetId, running) {
        while (true) {
            delay(LiveVitalsData.tickMs)
            val at = System.currentTimeMillis()
            now = at
            if (running && live) { tick += 1; receivedAt = at }
        }
    }

    CareCard {
        Text(w.compactHeading, style = MaterialTheme.typography.titleMedium, color = theme.foreground,
             modifier = Modifier.semantics { heading() })
        Row(
            Modifier.fillMaxWidth().background(theme.muted, RoundedCornerShape(ThusoRadius.tile)).padding(ThusoSpacing.space12)
                .semantics(mergeDescendants = true) {},
            horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)
        ) {
            Icon(Icons.Outlined.WarningAmber, null, tint = theme.warningInk)
            Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
                Text(w.banner, style = MaterialTheme.typography.titleSmall, color = theme.foreground)
                Text(w.notice, style = MaterialTheme.typography.bodySmall, color = theme.mutedForeground)
            }
        }
        Text(w.scenario, style = MaterialTheme.typography.labelMedium, color = theme.mutedForeground)
        FlowRowChips(LiveVitalsData.presets.map { it.name }, setOf(LiveVitals.preset(presetId)?.name ?: "")) { name ->
            val next = LiveVitalsData.presets.firstOrNull { it.name == name } ?: return@FlowRowChips
            if (next.id != presetId) {
                val at = System.currentTimeMillis()
                presetId = next.id; tick = 0; startedAt = at; receivedAt = at; now = at
            }
        }
        ThusoButton(if (running) w.pause else w.resume, onClick = { running = !running },
                    variant = ThusoButtonVariant.Secondary, size = ThusoButtonSize.Md, enabled = live)
        Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8), verticalAlignment = Alignment.CenterVertically) {
            StatusPill(w.simulatedMark, tone = "quiet")
            Text(if (!live) w.stale else if (running) LiveVitals.fill(w.running, mapOf("seconds" to "${LiveVitalsData.tickMs / 1000}")) else w.paused,
                 style = MaterialTheme.typography.bodySmall, color = theme.foreground)
        }
        LiveVitalsData.streams.forEachIndexed { index, stream ->
            StreamRow(stream, LiveVitals.history(presetId, seed, index, tick), live, receivedAt, startedAt, now)
        }
        LiveVitalsData.notStreamed.forEach { line ->
            Text(line, style = MaterialTheme.typography.bodySmall, color = theme.mutedForeground)
        }
        Text("${w.simulatedSentence} ${w.rangeNote}", style = MaterialTheme.typography.bodySmall, color = theme.mutedForeground)
        Text(w.refusalsHeading, style = MaterialTheme.typography.titleSmall, color = theme.foreground,
             modifier = Modifier.semantics { heading() })
        LiveVitalsData.refusals.forEach { refusal ->
            Row(Modifier.semantics(mergeDescendants = true) {}, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
                Icon(Icons.Outlined.Block, null, tint = theme.mutedForeground)
                Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
                    Text(refusal.heading, style = MaterialTheme.typography.labelLarge, color = theme.foreground)
                    Text(refusal.sentence, style = MaterialTheme.typography.bodySmall, color = theme.mutedForeground)
                }
            }
        }
    }
}

@Composable private fun StreamRow(stream: LiveStreamSpec, history: List<LiveReading>, live: Boolean, receivedAt: Long, startedAt: Long, now: Long) {
    val w = LiveVitalsData.Words
    val latest = history.lastOrNull()
    Column(
        Modifier.fillMaxWidth().border(1.dp, theme.border, RoundedCornerShape(ThusoRadius.tile)).padding(ThusoSpacing.space12)
            .semantics(mergeDescendants = true) {},
        verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)
    ) {
        Row(verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f)) {
                Text(stream.label, style = MaterialTheme.typography.labelLarge, color = theme.foreground)
                Text("${w.simulatedClass} · ${LiveVitals.fill(w.standsFor, mapOf("instrument" to stream.instrument))}",
                     style = MaterialTheme.typography.bodySmall, color = theme.mutedForeground)
            }
            if (latest != null) {
                Text("${LiveVitals.format(latest.value, stream.step)} ${stream.unit}", style = MaterialTheme.typography.titleLarge,
                     fontWeight = FontWeight.SemiBold, color = theme.foreground)
            }
        }
        if (latest != null) {
            Spark(stream, history)
            val outside = LiveVitals.place(stream, latest.value) != LiveRangePlace.Inside
            Text(LiveVitals.rangeWords(stream, latest.value), style = MaterialTheme.typography.bodySmall,
                 fontWeight = if (outside) FontWeight.SemiBold else FontWeight.Normal, color = theme.foreground)
            val at = if (live) receivedAt else startedAt + latest.atOffsetMs
            Text("${w.provenance} · ${w.simulatedMark} · ${LiveVitals.ago(now - at)}", style = MaterialTheme.typography.bodySmall, color = theme.mutedForeground)
        } else {
            Text(w.nothing, style = MaterialTheme.typography.bodySmall, color = theme.mutedForeground)
        }
    }
}

/* The trend line over the record's range as a band of the muted ground, the newest reading at the right edge.
   The same two colours whatever the value: a line that turned red would be the severity colour this panel
   refuses. Its words are the row's, so TalkBack is given nothing to read here. */
@Composable private fun Spark(stream: LiveStreamSpec, history: List<LiveReading>) {
    val band = theme.muted
    val line = theme.primary
    Canvas(Modifier.fillMaxWidth().height(28.dp).clearAndSetSemantics {}) {
        val values = history.map { it.value }
        val lo = values.minOrNull() ?: 0.0
        val hi = values.maxOrNull() ?: 0.0
        val pad = maxOf(stream.step * 2, (hi - lo) * 0.2)
        val minV = lo - pad
        val maxV = hi + pad
        val span = (size.width - 4f) / (LiveVitalsData.history - 1)
        fun x(i: Int) = 2f + (i + LiveVitalsData.history - history.size) * span
        fun y(v: Double) = size.height - 2f - ((v - minV) / (maxV - minV)).toFloat() * (size.height - 4f)
        val top = y(stream.high).coerceIn(0f, size.height)
        val bottom = y(stream.low).coerceIn(0f, size.height)
        if (bottom > top) drawRect(band, topLeft = Offset(0f, top), size = androidx.compose.ui.geometry.Size(size.width, bottom - top))
        if (history.size > 1) {
            val path = Path()
            history.forEachIndexed { i, r -> if (i == 0) path.moveTo(x(i), y(r.value)) else path.lineTo(x(i), y(r.value)) }
            drawPath(path, line, style = Stroke(width = 1.5.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
    }
}
