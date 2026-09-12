package za.co.mythuso.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.TableChart
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import kotlin.math.max
import kotlin.math.min

data class Reading(val label: String, val value: Double, val note: String = "—")

/**
 * The drawing carries a spoken summary and every value is also available as a real table,
 * because a reading a patient cannot read is not a reading.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable fun ClinicalChart(title: String, unit: String, readings: List<Reading>, normal: ClosedFloatingPointRange<Double>? = null, decimals: Int = 0) {
    var showTable by remember { mutableStateOf(false) }
    fun format(value: Double) = "%.${decimals}f".format(value)
    val latest = readings.last()
    val first = readings.first()
    val inRange = normal?.contains(latest.value) ?: true
    val delta = latest.value - first.value
    val direction = if (delta > 0) "higher than" else if (delta < 0) "lower than" else "unchanged from"
    val rangeNote = normal?.let { "Indicative reference range ${format(it.start)} to ${format(it.endInclusive)} $unit; the latest reading is ${if (inRange) "inside" else "outside"} that range." } ?: ""
    val summary = "$title. Latest sample reading ${format(latest.value)} $unit on ${latest.label}, $direction the first reading of ${format(first.value)} on ${first.label}. $rangeNote Fictional data."
    /* The metric shape, which this card had upside down: the status was a pill beside the title and
       the reading underneath it was set bold. A chip above a large thin numeral with its name below
       is the signature of the language, and it is what makes a reading here read the same way as a
       balance or a count anywhere else in the product. The number and its unit stay one fact — they
       are drawn by one composable and cannot be separated by a layout at any font scale. */
    CareCard {
        Metric(
            value = format(latest.value), unit = unit, label = title,
            chip = if (inRange) "In range" else "Outside range", flagged = !inRange
        )
        Text(
            if (delta == 0.0) "No change" else "${if (delta > 0) "+" else ""}${format(delta)} since ${first.label}",
            style = MaterialTheme.typography.bodySmall, color = StudioInkMuted
        )
        Canvas(Modifier.fillMaxWidth().height(74.dp).semantics { contentDescription = summary }) {
            val values = readings.map { it.value }
            val low = min(values.min(), normal?.start ?: Double.MAX_VALUE)
            val high = max(values.max(), normal?.endInclusive ?: -Double.MAX_VALUE)
            val pad = max((high - low) * 0.25, 0.5)
            val minimum = low - pad
            val maximum = high + pad
            fun x(index: Int) = if (readings.size < 2) size.width / 2 else size.width * index / (readings.size - 1)
            fun y(value: Double) = size.height - size.height * ((value - minimum) / (maximum - minimum)).toFloat()
            if (normal != null) {
                val top = y(normal.endInclusive)
                drawRect(PaleSage, Offset(0f, top), Size(size.width, max(y(normal.start) - top, 1f)))
            }
            val path = Path()
            readings.forEachIndexed { index, reading ->
                if (index == 0) path.moveTo(x(index), y(reading.value)) else path.lineTo(x(index), y(reading.value))
            }
            drawPath(path, Charcoal, style = Stroke(width = 3f))
            readings.forEachIndexed { index, reading ->
                val last = index == readings.lastIndex
                drawCircle(if (last) SurfaceWhite else Charcoal, if (last) 7f else 4f, Offset(x(index), y(reading.value)))
                if (last) drawCircle(Charcoal, 7f, Offset(x(index), y(reading.value)), style = Stroke(width = 3f))
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Note(first.label); Note(latest.label)
        }
        TextButton(onClick = { showTable = !showTable }, shape = ThusoButtonShape) {
            Icon(Icons.Outlined.TableChart, null, tint = Charcoal)
            Spacer(Modifier.width(8.dp))
            Text(if (showTable) "Hide readings" else "Show readings as a table")
        }
        if (showTable) {
            Column {
                readings.forEach { reading ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                        Text(reading.label, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                        Text("${format(reading.value)} $unit", style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                        Text(reading.note, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                    }
                    HorizontalDivider()
                }
                Spacer(Modifier.height(8.dp))
                Note("Fictional data, not a medical record.")
            }
        }
    }
}
