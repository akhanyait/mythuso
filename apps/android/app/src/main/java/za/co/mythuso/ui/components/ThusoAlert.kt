package za.co.mythuso.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import za.co.mythuso.ui.ThusoRadius
import za.co.mythuso.ui.ThusoSpacing
import za.co.mythuso.ui.theme
import za.co.mythuso.ui.tint

/* Feedback that stays on screen (apps/web/src/ui/Alert.tsx). Every variant pairs its Material icon and
   a title in words with its colour, so no alert is told apart by colour alone, and a danger alert is a
   live region announced the moment it appears while the rest wait their turn.

   Two of the handoff's icon colours cannot be seen on a light card: its warning is the brand lime at
   1.21:1 and its danger the brand orange at 2.99:1, both under the 3:1 a meaningful graphic needs. On a
   light ground those two icons are drawn in the inks tokens.json#contrast.knownFailures names — the
   build's warning brown and refusal red; on a dark ground in the handoff's own colours, which clear it.
   The border is a tint of the variant's colour, as the handoff draws it: a hint rather than the message. */
enum class ThusoAlertVariant { Info, Success, Warning, Danger }

@Composable fun ThusoAlert(
    title: String,
    modifier: Modifier = Modifier,
    variant: ThusoAlertVariant = ThusoAlertVariant.Info,
    content: (@Composable ColumnScope.() -> Unit)? = null
) {
    val t = theme
    val (icon, ink, edge) = when (variant) {
        ThusoAlertVariant.Info -> Triple(Icons.Outlined.Info, t.info, t.info.tint(0.35f))
        ThusoAlertVariant.Success -> Triple(Icons.Outlined.CheckCircle, t.success, t.success.tint(0.35f))
        ThusoAlertVariant.Warning -> Triple(Icons.Outlined.WarningAmber, t.warningInk, t.warning.tint(0.50f))
        ThusoAlertVariant.Danger -> Triple(Icons.Outlined.ErrorOutline, t.dangerInk, t.danger.tint(0.35f))
    }
    val shape = RoundedCornerShape(ThusoRadius.control)
    Row(
        modifier.fillMaxWidth().background(t.surface, shape).border(1.dp, edge, shape).padding(ThusoSpacing.space16)
            .semantics(mergeDescendants = true) { if (variant == ThusoAlertVariant.Danger) liveRegion = LiveRegionMode.Assertive },
        horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12), verticalAlignment = Alignment.Top
    ) {
        Icon(icon, null, tint = ink, modifier = Modifier.padding(top = 2.dp).size(20.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
            Text(title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = t.foreground, modifier = Modifier.semantics { heading() })
            if (content != null) content()
        }
    }
}

/** The body of an alert: one sentence in the muted ink. */
@Composable fun ThusoAlertText(text: String) {
    Text(text, style = MaterialTheme.typography.bodyMedium, color = theme.mutedForeground)
}
