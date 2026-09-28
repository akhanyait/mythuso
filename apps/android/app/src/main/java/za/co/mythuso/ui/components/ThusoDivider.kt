package za.co.mythuso.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import za.co.mythuso.ui.theme

/* A rule between two groups, used sparingly: spacing is usually the better separator
   (apps/web/src/ui/Divider.tsx). It is the border colour and one dp, and it says nothing to TalkBack. */
@Composable fun ThusoDivider(modifier: Modifier = Modifier, vertical: Boolean = false) {
    Box(
        modifier.then(if (vertical) Modifier.width(1.dp).fillMaxHeight() else Modifier.fillMaxWidth().height(1.dp))
            .background(theme.border).clearAndSetSemantics {}
    )
}
