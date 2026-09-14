package za.co.mythuso.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import za.co.mythuso.model.Capabilities

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
        Text(label, style = MaterialTheme.typography.bodyMedium, color = LocalSecondaryText.current)
        Text(value, style = MaterialTheme.typography.bodyMedium, color = Charcoal, textAlign = TextAlign.End, modifier = Modifier.weight(1f))
    }
}
/* Secondary text reads its colour from the surface it is on rather than from the theme, because the
   two disagree on exactly one ground: faint is 5.05 on mist, 4.57 on cloud and 5.75 on a white card,
   and 3.75 on the sage lead panel, which fails. A LeadCard and an SPanel(LEAD) both provide charcoal
   at 11.11 for this, so a note dropped into one is right without anybody checking. */
@Composable fun Note(text: String) {
    Text(text, style = MaterialTheme.typography.bodySmall, color = LocalSecondaryText.current)
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

/**
 * The one way a screen here says it is not wired to anything yet.
 *
 * It draws nothing when the capability is connected, which is the whole point: nobody has to
 * remember to go and delete a banner when an integration lands, because there is no banner to
 * delete. There is a boolean in packages/catalog/capabilities.json and a build that refuses to let
 * it be flipped without evidence. The web has had this since the notices were swept up
 * (apps/web/src/components/NotConnected.tsx) and iOS has `CapabilityNotice`; Android had neither,
 * so its screens said nothing at all about what is real.
 *
 * One per screen. A reader told the same thing three times has been told it none.
 */
@Composable fun NotConnected(of: String) {
    val notice = Capabilities.notice(of) ?: return
    /* Which ground it stands on. The clinical decks put this notice on the night canvas, where the cloud
       plate it wears on paper is a pale lozenge pulling the eye off the headline; there it takes the
       deck's glass and paper ink, which reads 10.78 on it. Still this one component rather than a second
       drawn for the dark, so the sentence and the rule that it draws nothing once the capability is
       connected stay in one place. */
    val night = LocalOnStudioNight.current
    TonedCard(background = if (night) SurfaceWhite.copy(alpha = 0.08f) else Cloud) {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Icons.Outlined.Info, null, tint = if (night) SurfaceWhite else Charcoal, modifier = Modifier.size(18.dp))
            Text(notice, style = MaterialTheme.typography.bodySmall, color = if (night) SurfaceWhite else StudioInkMuted)
        }
    }
}
