package za.co.mythuso.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import za.co.mythuso.ui.ThusoMetricStyle
import za.co.mythuso.ui.ThusoSpacing
import za.co.mythuso.ui.theme

/* One figure a screen is opened for, with its label and an optional trend (apps/web/src/ui/MetricCard.tsx).
   The value is the metric size of the type scale (32) in the display face, not the handoff's 30, which the
   scale does not have.

   The trend is the success ink: on a light ground the handoff's green measures 3.64:1 on white and clears
   the 3:1 floor for a mark but not 4.5:1 for text, so there it is the teal ink the build already measures
   for "a value in range", and on a dark ground the handoff's own green, which reads. The trend's words say
   which way it went; the colour never has to.

   `foot` is for a badge or a sparkline under the value, as the patient's home puts a range badge there.
   The whole card is one thing to TalkBack: the label, the value and the trend read as a sentence. */
@Composable fun ThusoMetricCard(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    trend: String? = null,
    unit: String? = null,
    icon: ImageVector? = null,
    iconSlot: (@Composable () -> Unit)? = null,
    onClick: (() -> Unit)? = null,
    foot: (@Composable () -> Unit)? = null
) {
    val spoken = listOfNotNull(label, listOfNotNull(value, unit).joinToString(" "), trend).joinToString(", ")
    ThusoCard(
        modifier.semantics(mergeDescendants = true) { contentDescription = spoken },
        padding = ThusoCardPadding.Md, onClick = onClick, gap = ThusoSpacing.space4
    ) {
        Row(
            Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)
        ) {
            Text(
                label.uppercase(), style = MaterialTheme.typography.labelSmall, color = theme.mutedForeground,
                letterSpacing = 0.5.sp, modifier = Modifier.weight(1f)
            )
            Box(Modifier.size(20.dp), Alignment.Center) {
                if (iconSlot != null) iconSlot()
                else if (icon != null) Icon(icon, null, tint = theme.mutedForeground, modifier = Modifier.size(20.dp))
            }
        }
        Row(verticalAlignment = Alignment.Bottom, modifier = Modifier.padding(top = ThusoSpacing.space12)) {
            Text(value, style = ThusoMetricStyle, color = theme.foreground, maxLines = 1)
            if (unit != null) Text(
                " $unit", style = MaterialTheme.typography.bodySmall, color = theme.mutedForeground,
                modifier = Modifier.padding(bottom = 4.dp)
            )
        }
        if (trend != null) Text(trend, style = MaterialTheme.typography.bodySmall, color = theme.successInk)
        if (foot != null) Box(Modifier.padding(top = ThusoSpacing.space8)) { foot() }
    }
}
