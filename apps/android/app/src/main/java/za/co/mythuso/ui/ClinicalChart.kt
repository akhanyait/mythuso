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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlin.math.max
import kotlin.math.min

data class Reading(val label: String, val value: Double, val note: String = "—")

/**
 * The drawing carries a spoken summary and every value is also available as a real table,
 * because a reading a patient cannot read is not a reading.
 */
@Composable fun ClinicalChart(title: String, unit: String, readings: List<Reading>, normal: ClosedFloatingPointRange<Double>? = null, decimals: Int = 0, icon: androidx.compose.ui.graphics.vector.ImageVector? = null) {
    var showTable by remember { mutableStateOf(false) }
    fun format(value: Double) = "%.${decimals}f".format(value)
    val latest = readings.last()
    val first = readings.first()
    val inRange = normal?.contains(latest.value) ?: true
    val delta = latest.value - first.value
    val direction = if (delta > 0) "higher than" else if (delta < 0) "lower than" else "unchanged from"
    val rangeNote = normal?.let { "Indicative reference range ${format(it.start)} to ${format(it.endInclusive)} $unit; the latest reading is ${if (inRange) "inside" else "outside"} that range." } ?: ""
    val summary = "$title. Latest sample reading ${format(latest.value)} $unit on ${latest.label}, $direction the first reading of ${format(first.value)} on ${first.label}. $rangeNote Fictional data."
    CareCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (icon != null) { Icon(icon, null, tint = Teal, modifier = Modifier.size(17.dp)); Spacer(Modifier.width(8.dp)) }
            Text(title, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
            Surface(color = if (inRange) Sage else Color(0xFFFAF0E6), shape = RoundedCornerShape(6.dp)) {
                Text(
                    if (inRange) "Within sample range" else "Outside sample range",
                    style = MaterialTheme.typography.labelSmall,
                    color = if (inRange) Forest else Color(0xFF96552C),
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                )
            }
        }
        Row(verticalAlignment = Alignment.Bottom) {
            Text(format(latest.value), style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.width(6.dp))
            Text(unit, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
            Text(
                if (delta == 0.0) "No change" else "${if (delta > 0) "+" else ""}${format(delta)} since ${first.label}",
                style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
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
                drawRect(Color(0xFFF1F2EE), Offset(0f, top), Size(size.width, max(y(normal.start) - top, 1f)))
            }
            val path = Path()
            readings.forEachIndexed { index, reading ->
                if (index == 0) path.moveTo(x(index), y(reading.value)) else path.lineTo(x(index), y(reading.value))
            }
            drawPath(path, Teal, style = Stroke(width = 4f))
            readings.forEachIndexed { index, reading ->
                val last = index == readings.lastIndex
                drawCircle(if (last) Color.White else Teal, if (last) 7f else 5f, Offset(x(index), y(reading.value)))
                if (last) drawCircle(Teal, 7f, Offset(x(index), y(reading.value)), style = Stroke(width = 3f))
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Note(first.label); Note(latest.label)
        }
        TextButton(onClick = { showTable = !showTable }) {
            Icon(Icons.Outlined.TableChart, null, tint = Teal)
            Spacer(Modifier.width(8.dp))
            Text(if (showTable) "Hide readings" else "Show readings as a table")
        }
        if (showTable) {
            Column {
                readings.forEach { reading ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 7.dp)) {
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
