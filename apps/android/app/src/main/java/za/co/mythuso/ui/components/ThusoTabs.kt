package za.co.mythuso.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import za.co.mythuso.ui.ThusoRadius
import za.co.mythuso.ui.ThusoSpacing
import za.co.mythuso.ui.TouchTarget
import za.co.mythuso.ui.cardShadow
import za.co.mythuso.ui.theme

/* Peer views of one thing, switched without leaving the page (apps/web/src/ui/Tabs.tsx). The list
   wraps rather than scrolling sideways, so no tab is ever hidden off the edge of a phone, and each tab
   is a selectable in one group, so TalkBack reads "selected, 2 of 4". A tab says it is selected on
   screen by its raised face and shadow as well as its colour. Every tab is 48 tall. */
@OptIn(ExperimentalLayoutApi::class)
@Composable fun ThusoTabs(
    tabs: List<String>,
    selected: String,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val outer = RoundedCornerShape(ThusoRadius.control)
    val inner = RoundedCornerShape(ThusoRadius.sm)
    FlowRow(
        modifier.background(theme.muted, outer).padding(ThusoSpacing.space4).selectableGroup(),
        horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space4),
        verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)
    ) {
        tabs.forEach { tab ->
            val active = tab == selected
            Box(
                Modifier
                    .then(if (active) Modifier.cardShadow(inner) else Modifier)
                    .clip(inner)
                    .background(if (active) theme.surface else theme.muted, inner)
                    .selectable(selected = active, role = Role.Tab, onClick = { onSelect(tab) })
                    .heightIn(min = TouchTarget)
                    .padding(horizontal = ThusoSpacing.space12)
                    .semantics { stateDescription = if (active) "Selected" else "Not selected" },
                Alignment.Center
            ) {
                Text(
                    tab, style = MaterialTheme.typography.labelLarge,
                    color = if (active) theme.foreground else theme.mutedForeground, maxLines = 1
                )
            }
        }
    }
}
