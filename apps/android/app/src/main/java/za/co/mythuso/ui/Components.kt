package za.co.mythuso.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalLayoutApi::class)
@Composable fun FlowRowChips(options: List<String>, selected: Set<String>, onToggle: (String) -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        options.forEach { option ->
            FilterChip(
                selected = option in selected,
                onClick = { onToggle(option) },
                label = { Text(option) },
                modifier = Modifier.semantics { this.selected = option in selected }
            )
        }
    }
}
/**
 * A field and what was chosen for it, on the last screen before a visit is booked.
 *
 * The weight is on the value now and it used to be on the label, which is the whole of the change.
 * A `Row` measures its unweighted children first and against the whole width, and hands the
 * weighted one what is left — so at the largest font scale "Wednesday, 9 September 2026" took the
 * row and the label beside it was given nothing at all. The word "Date" came back zero dp wide: not
 * truncated, not ellipsised, simply not drawn. A review row that shows a date and does not say it
 * is the date is worse than one that shows neither, and the only way to catch it was to measure
 * this screen at the setting it happens at.
 *
 * Round the other way the field name is measured first — it is one or two words and it always fits
 * — and the value takes the rest and wraps inside it. At the default scale the row looks exactly as
 * it did: the name on the left, the value against the right edge, on one line.
 */
@Composable fun ReviewLine(label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyMedium, color = Slate, textAlign = TextAlign.End, modifier = Modifier.weight(1f))
    }
}
@Composable fun Note(text: String) {
    Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

/**
 * A label and a switch, and the whole row is the control. The label used to be a caption beside a
 * target the width of a thumbnail — which is fine if you are pointing at it and hopeless if you are
 * reading “I attest that everything I have entered is true” and then hunting for the switch. The row
 * owns the toggle semantics and the switch is drawn rather than clicked, so a screen reader hears
 * one control with one label instead of a stray sentence and an unnamed switch, and Enter or the
 * D-pad centre works the same as a tap.
 */
@Composable fun Setting(name: String, checked: Boolean, change: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp)
            .toggleable(value = checked, onValueChange = change, role = Role.Switch)
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(name, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.width(12.dp))
        Switch(checked, null)
    }
}
