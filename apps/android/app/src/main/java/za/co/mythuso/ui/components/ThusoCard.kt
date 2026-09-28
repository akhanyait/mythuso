package za.co.mythuso.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import za.co.mythuso.ui.ThusoRadius
import za.co.mythuso.ui.ThusoSpacing
import za.co.mythuso.ui.cardShadow
import za.co.mythuso.ui.raisedShadow
import za.co.mythuso.ui.theme

/* One coherent object or tool, framed (apps/web/src/ui/Card.tsx). The handoff's three variants are
   kept: default sits on the card shadow, elevated on the raised one, and interactive answers a press
   with its border in the accent — never two shadows at once, since elevation is one shadow in this
   system. An interactive card is a button to TalkBack only when it is given something to do. */
enum class ThusoCardVariant { Default, Elevated, Interactive }
enum class ThusoCardPadding(val dp: Dp) { None(0.dp), Sm(ThusoSpacing.space16), Md(ThusoSpacing.space20), Lg(ThusoSpacing.space24) }

@Composable fun ThusoCard(
    modifier: Modifier = Modifier,
    variant: ThusoCardVariant = ThusoCardVariant.Default,
    padding: ThusoCardPadding = ThusoCardPadding.Sm,
    onClick: (() -> Unit)? = null,
    gap: Dp = ThusoSpacing.space12,
    content: @Composable ColumnScope.() -> Unit
) {
    val shape = RoundedCornerShape(ThusoRadius.card)
    val edge = if (variant == ThusoCardVariant.Interactive) theme.accent else theme.border
    Column(
        modifier
            .fillMaxWidth()
            .then(if (variant == ThusoCardVariant.Elevated) Modifier.raisedShadow(shape) else Modifier.cardShadow(shape))
            .clip(shape)
            .background(theme.surface, shape)
            .border(1.dp, edge, shape)
            .then(if (onClick != null) Modifier.clickable(role = Role.Button, onClick = onClick) else Modifier)
            .padding(padding.dp),
        verticalArrangement = Arrangement.spacedBy(gap),
        content = content
    )
}

/** The card's head: a title and, under it, what the card is for, above a rule. */
@Composable fun ThusoCardHeader(title: String, description: String? = null, modifier: Modifier = Modifier) {
    Column(
        modifier.fillMaxWidth().padding(horizontal = ThusoSpacing.space20, vertical = ThusoSpacing.space16),
        verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)
    ) {
        ThusoCardTitle(title)
        if (description != null) ThusoCardDescription(description)
    }
    ThusoDivider()
}

@Composable fun ThusoCardTitle(text: String, modifier: Modifier = Modifier) {
    Text(text, style = MaterialTheme.typography.titleLarge, color = theme.foreground, modifier = modifier.semantics { heading() })
}

@Composable fun ThusoCardDescription(text: String, modifier: Modifier = Modifier) {
    Text(text, style = MaterialTheme.typography.bodySmall, color = theme.mutedForeground, modifier = modifier)
}

@Composable fun ThusoCardContent(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(modifier.fillMaxWidth().padding(ThusoSpacing.space20), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12), content = content)
}
