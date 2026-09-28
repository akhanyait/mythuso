package za.co.mythuso.ui.components

import android.provider.Settings
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import za.co.mythuso.ui.ThusoMotion
import za.co.mythuso.ui.theme

/* An indeterminate wait, announced (apps/web/src/ui/Spinner.tsx): a live region with its label in words.

   The handoff spins it for as long as the wait lasts. This build refuses a spinner that runs forever —
   an endless animation is motion nobody asked for and nobody can stop — so the arc turns once as it
   arrives, on the tokens' entrance duration and curve, and then rests; the ring with its one coloured
   quarter is the familiar mark of a wait without moving.

   Reduced motion REMOVES the turn rather than shortening it, through the system's own animator
   duration scale: "Remove animations" in Android's accessibility settings zeroes it, and a duration
   multiplied by it is genuinely none. A reader who has halved the scale gets a turn half as long. */
enum class ThusoSpinnerSize(val dp: Dp) { Sm(16.dp), Md(24.dp), Lg(32.dp) }
enum class ThusoSpinnerTone { Primary, Accent, Current }

/** The system animator duration scale: 1 by default, 0 when animations are removed. */
@Composable fun animatorScale(): Float {
    val resolver = LocalContext.current.contentResolver
    return remember(resolver) { Settings.Global.getFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f).coerceIn(0f, 10f) }
}

@Composable fun ThusoSpinner(
    modifier: Modifier = Modifier,
    size: ThusoSpinnerSize = ThusoSpinnerSize.Md,
    tone: ThusoSpinnerTone = ThusoSpinnerTone.Primary,
    label: String = "Loading"
) {
    val scale = animatorScale()
    val turn = remember { Animatable(if (scale == 0f) 0f else -270f) }
    LaunchedEffect(scale) {
        if (scale == 0f) turn.snapTo(0f)
        else turn.animateTo(0f, tween((ThusoMotion.enterMs * scale).toInt(), easing = ThusoMotion.EaseSoft))
    }
    val track = theme.muted
    val arc = when (tone) {
        ThusoSpinnerTone.Primary -> theme.primary
        ThusoSpinnerTone.Accent -> theme.accent
        ThusoSpinnerTone.Current -> LocalContentColor.current
    }
    Canvas(
        modifier.size(size.dp).semantics {
            if (label.isNotEmpty()) { contentDescription = label; liveRegion = LiveRegionMode.Polite }
        }
    ) {
        val stroke = 2.dp.toPx()
        val inset = stroke / 2
        val box = Size(this.size.width - stroke, this.size.height - stroke)
        drawArc(track, 0f, 360f, false, Offset(inset, inset), box, style = Stroke(stroke))
        drawArc(arc, -90f + turn.value, 90f, false, Offset(inset, inset), box, style = Stroke(stroke, cap = StrokeCap.Butt))
    }
}
