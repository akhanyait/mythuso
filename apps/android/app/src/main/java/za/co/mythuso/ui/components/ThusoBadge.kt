package za.co.mythuso.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import za.co.mythuso.ui.ThusoRadius
import za.co.mythuso.ui.ThusoSpacing
import za.co.mythuso.ui.theme
import za.co.mythuso.ui.tint

/* Compact metadata — a category, a non-urgent state (apps/web/src/ui/Badge.tsx). Never a button: it has
   no press. Both sizes set their words at 13, the smallest size this product renders; sm and md differ
   by their padding. The danger badge's words are the measured replacement on light and the handoff's
   orange on dark, because the brand orange as text measures 2.99:1; the primary badge's words on dark
   are the handoff's dark accent, because its dark primary as text on a tint measures under 4.5:1. */
enum class ThusoBadgeVariant { Neutral, Primary, Accent, Success, Warning, Danger }
enum class ThusoBadgeSize { Sm, Md }

@Composable fun ThusoBadge(
    text: String,
    modifier: Modifier = Modifier,
    variant: ThusoBadgeVariant = ThusoBadgeVariant.Neutral,
    size: ThusoBadgeSize = ThusoBadgeSize.Md,
    dot: Boolean = false
) {
    val t = theme
    val (fill, ink) = when (variant) {
        ThusoBadgeVariant.Neutral -> t.muted to t.mutedForeground
        ThusoBadgeVariant.Primary -> t.primary.tint(0.10f) to t.primaryInk
        ThusoBadgeVariant.Accent -> t.accent.tint(0.15f) to t.foreground
        ThusoBadgeVariant.Success -> t.success.tint(0.15f) to t.foreground
        ThusoBadgeVariant.Warning -> t.warning.tint(0.20f) to t.foreground
        ThusoBadgeVariant.Danger -> t.danger.tint(0.12f) to t.dangerInk
    }
    val shape = RoundedCornerShape(ThusoRadius.pill)
    Row(
        modifier.background(fill, shape)
            .padding(horizontal = if (size == ThusoBadgeSize.Sm) ThusoSpacing.space8 else 10.dp, vertical = if (size == ThusoBadgeSize.Sm) 2.dp else ThusoSpacing.space4)
            .semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        if (dot) Box(Modifier.size(6.dp).background(ink, CircleShape).clearAndSetSemantics {})
        /* Wraps rather than clips: at the largest font scales a badge beside an avatar has half a phone,
           and "Thuso Pa" cut at the card's edge is worse than a badge two lines tall. */
        Text(text, style = MaterialTheme.typography.labelSmall, color = ink)
    }
}

/* Live availability, said in words (apps/web/src/ui/StatusIndicator.tsx): the label is the thing a reader
   reads, and the dot beside it is decoration hidden from TalkBack. The dot differs by shape as well as
   colour — offline is a hollow ring — so the three states survive a greyscale screen. Busy is the measured
   amber ink on a light ground, because the handoff's lime dot measures 1.21:1 on white and cannot be seen. */
enum class ThusoStatus { Online, Busy, Offline }

@Composable fun ThusoStatusIndicator(status: ThusoStatus, label: String, modifier: Modifier = Modifier) {
    val t = theme
    Row(
        modifier.semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)
    ) {
        Box(
            Modifier.size(8.dp).clearAndSetSemantics {}.then(
                when (status) {
                    ThusoStatus.Online -> Modifier.background(t.success, CircleShape)
                    ThusoStatus.Busy -> Modifier.background(t.warningInk, CircleShape)
                    ThusoStatus.Offline -> Modifier.background(Color.Transparent, CircleShape).border(2.dp, t.mutedForeground, CircleShape)
                }
            )
        )
        Text(label, style = MaterialTheme.typography.bodyMedium, color = t.foreground)
    }
}
