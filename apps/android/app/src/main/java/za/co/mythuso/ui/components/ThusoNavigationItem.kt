package za.co.mythuso.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import za.co.mythuso.ui.ThusoRadius
import za.co.mythuso.ui.ThusoSpacing
import za.co.mythuso.ui.TouchTarget
import za.co.mythuso.ui.theme
import za.co.mythuso.ui.tint

/* A destination in a navigation rail (apps/web/src/ui/NavigationItem.tsx). The current one is said in
   words to TalkBack, and on screen carries the handoff's aqua tint, its words in the ink colour, and a
   heavier weight — so it is never told apart by colour alone. 48 tall rather than the handoff's 40. A
   count, when there is one, replaces the chevron; the count is text, so it is announced with the name.

   The icon is a slot, because the MyThuso family arrives as vector drawables (painterResource) and the
   utility icons as ImageVectors, and a destination takes one or the other, never both for one concept. */
@Composable fun ThusoNavigationItem(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    active: Boolean = false,
    count: Int? = null,
    icon: (@Composable () -> Unit)? = null
) {
    val shape = RoundedCornerShape(ThusoRadius.control)
    Row(
        modifier.fillMaxWidth().heightIn(min = TouchTarget).clip(shape)
            .background(if (active) theme.accent.tint(0.15f) else Color.Transparent, shape)
            .clickable(role = Role.Tab, onClick = onClick)
            .padding(horizontal = ThusoSpacing.space12, vertical = ThusoSpacing.space8)
            .semantics(mergeDescendants = true) { selected = active; if (active) contentDescription = "$label, current" },
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)
    ) {
        if (icon != null) Box(Modifier.size(20.dp), Alignment.Center) { icon() }
        Text(
            label, style = MaterialTheme.typography.bodyMedium,
            fontWeight = if (active) FontWeight.SemiBold else FontWeight.Medium,
            color = if (active) theme.foreground else theme.mutedForeground,
            maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f)
        )
        if (count != null) Text(
            "$count", style = MaterialTheme.typography.labelSmall, color = theme.foreground,
            modifier = Modifier.background(theme.muted, RoundedCornerShape(ThusoRadius.pill)).padding(horizontal = 6.dp, vertical = 2.dp)
        ) else Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null, tint = theme.mutedForeground, modifier = Modifier.size(16.dp))
    }
}

@Composable fun ThusoNavigationItem(
    label: String,
    icon: ImageVector,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    active: Boolean = false,
    count: Int? = null
) {
    ThusoNavigationItem(label, onClick, modifier, active, count) {
        Icon(icon, null, tint = if (active) theme.foreground else theme.mutedForeground, modifier = Modifier.size(20.dp))
    }
}
