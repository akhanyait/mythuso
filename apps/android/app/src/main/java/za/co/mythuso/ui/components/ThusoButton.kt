package za.co.mythuso.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import za.co.mythuso.ui.ThusoButtonShape
import za.co.mythuso.ui.ThusoRadius
import za.co.mythuso.ui.ThusoSpacing
import za.co.mythuso.ui.TouchTarget
import za.co.mythuso.ui.theme
import za.co.mythuso.ui.tint
import androidx.compose.foundation.shape.RoundedCornerShape

/* The handoff's Button, as Compose (apps/web/src/ui/Button.tsx is the same object on the web): its
   cva variants and sizes kept by name so a screen written against the handoff's catalogue reads the
   same here — primary, accent, secondary, ghost and destructive; sm, md, lg and icon. Every colour is
   a role of the palette in force, so the same call is right on the dark ground.

   Three things differ from the handoff, each for a rule of this build rather than for taste:
   - every size is at least 48 tall, Android's own floor and above the 44 the tokens hold the web to.
     The small button keeps its compact face — its type and padding — over that height; a health app
     is used one-handed in a doorway.
   - the loading glyph turns once as it arrives rather than spinning for as long as the wait lasts: a
     spinner that runs forever is the one piece of motion this codebase refuses outright. The button
     still says it is busy, and it cannot be pressed twice.
   - the destructive button's words are the dark ink the handoff sets on its bright fills, not white:
     white on the orange measures 2.99:1 (tokens.json#contrast.knownFailures). The button stays
     orange; only its words change. */
enum class ThusoButtonVariant { Primary, Accent, Secondary, Ghost, Destructive }
enum class ThusoButtonSize { Sm, Md, Lg, Icon }

@Composable fun ThusoButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    variant: ThusoButtonVariant = ThusoButtonVariant.Primary,
    size: ThusoButtonSize = ThusoButtonSize.Md,
    enabled: Boolean = true,
    loading: Boolean = false,
    leadingIcon: ImageVector? = null,
    trailingIcon: ImageVector? = null,
    leading: (@Composable () -> Unit)? = null
) {
    val t = theme
    val (fill, words) = when (variant) {
        ThusoButtonVariant.Primary -> t.primary to t.primaryForeground
        ThusoButtonVariant.Accent -> t.accent to t.accentForeground
        ThusoButtonVariant.Secondary -> t.surface to t.foreground
        ThusoButtonVariant.Ghost -> Color.Transparent to t.foreground
        ThusoButtonVariant.Destructive -> t.danger to t.accentForeground
    }
    /* The compact face keeps the handoff's small corner; md and above take the control radius. */
    val shape = if (size == ThusoButtonSize.Sm) RoundedCornerShape(ThusoRadius.sm) else ThusoButtonShape
    val textStyle = when (size) {
        ThusoButtonSize.Sm -> MaterialTheme.typography.labelMedium
        ThusoButtonSize.Lg -> MaterialTheme.typography.labelLarge.copy(fontSize = 16.sp)
        else -> MaterialTheme.typography.labelLarge
    }
    val horizontal = when (size) {
        ThusoButtonSize.Sm -> ThusoSpacing.space12
        ThusoButtonSize.Lg -> ThusoSpacing.space20
        ThusoButtonSize.Icon -> 0.dp
        else -> ThusoSpacing.space16
    }
    val height = if (size == ThusoButtonSize.Lg) TouchTarget else TouchTarget
    val glyph = when (size) { ThusoButtonSize.Sm -> 16.dp; ThusoButtonSize.Icon -> 20.dp; else -> 16.dp }
    Button(
        onClick = onClick,
        enabled = enabled && !loading,
        shape = shape,
        colors = ButtonDefaults.buttonColors(
            containerColor = fill, contentColor = words,
            /* Disabled is the same button at 45%, as ui.css draws it, never a different colour. */
            disabledContainerColor = fill.tint(0.45f), disabledContentColor = words.tint(0.45f)
        ),
        border = if (variant == ThusoButtonVariant.Secondary) BorderStroke(1.dp, t.border) else null,
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = horizontal, vertical = ThusoSpacing.space8),
        modifier = modifier
            .heightIn(min = height)
            .then(if (size == ThusoButtonSize.Icon) Modifier.size(TouchTarget) else Modifier.widthIn(min = TouchTarget))
            .semantics { if (loading) contentDescription = "$label, busy" }
    ) {
        if (loading) {
            ThusoSpinner(size = ThusoSpinnerSize.Sm, tone = ThusoSpinnerTone.Current, label = "")
            if (size != ThusoButtonSize.Icon) Spacer(Modifier.width(ThusoSpacing.space8))
        } else if (leading != null) {
            leading()
            if (size != ThusoButtonSize.Icon) Spacer(Modifier.width(ThusoSpacing.space8))
        } else if (leadingIcon != null) {
            Icon(leadingIcon, null, Modifier.size(glyph))
            if (size != ThusoButtonSize.Icon) Spacer(Modifier.width(ThusoSpacing.space8))
        }
        if (size != ThusoButtonSize.Icon) Text(label, style = textStyle, fontWeight = FontWeight.SemiBold)
        if (!loading && trailingIcon != null && size != ThusoButtonSize.Icon) {
            Spacer(Modifier.width(ThusoSpacing.space8))
            Icon(trailingIcon, null, Modifier.size(glyph))
        }
    }
}

/** A button that is only an icon, so its name is required rather than hoped for: `label` is what a
    screen reader announces. */
@Composable fun ThusoIconButton(
    label: String,
    icon: ImageVector,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    variant: ThusoButtonVariant = ThusoButtonVariant.Secondary,
    enabled: Boolean = true
) {
    ThusoButton(
        label, onClick, modifier.semantics { contentDescription = label }, variant, ThusoButtonSize.Icon, enabled,
        leadingIcon = icon
    )
}

/* A row scope helper for callers that want the button's own content slot. */
@Composable fun RowScope.ThusoButtonGap() { Spacer(Modifier.width(ThusoSpacing.space8)) }
