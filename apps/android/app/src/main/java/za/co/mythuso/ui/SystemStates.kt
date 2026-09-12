package za.co.mythuso.ui

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

/**
 * Every screen that will one day talk to a clinical, payment, partner or device integration
 * needs these five states designed, not improvised at integration time.
 */
enum class LoadState(val label: String) { READY("Loaded"), LOADING("Loading"), ERROR("Service error"), OFFLINE("Offline"), DENIED("Permission denied") }

/* The one animation on this screen, and it stops when the system asks it to. "Remove animations"
   exists for people for whom a pulsing rectangle is not a nice touch; a skeleton that keeps
   breathing through it is the app deciding it knows better. Held still it is still a skeleton — the
   shapes say what is loading — so nothing is lost by obeying. */
@Composable fun SkeletonRows(rows: Int = 3) {
    val still = prefersReducedMotion()
    val transition = rememberInfiniteTransition(label = "skeleton")
    val pulse by transition.animateFloat(0.45f, 1f, infiniteRepeatable(tween(900), RepeatMode.Reverse), label = "alpha")
    val alpha = if (still) 0.7f else pulse
    Column(
        Modifier.fillMaxWidth().alpha(alpha).semantics { contentDescription = "Loading care information" },
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        repeat(rows) { index ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.size(44.dp).background(Color(0x14000000), RoundedCornerShape(ThusoRadius.control)))
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.height(9.dp).width((190 - index * 26).dp).background(Color(0x14000000), RoundedCornerShape(5.dp)))
                    Box(Modifier.height(9.dp).width((120 - index * 18).dp).background(Color(0x0F000000), RoundedCornerShape(5.dp)))
                }
            }
        }
    }
}
@Composable fun StateBlock(state: LoadState, subject: String, permission: String = "device access", retry: (() -> Unit)? = null, content: @Composable () -> Unit) {
    when (state) {
        LoadState.READY -> content()
        LoadState.LOADING -> SkeletonRows()
        else -> {
            val heading = when (state) {
                LoadState.OFFLINE -> "You’re offline"
                LoadState.DENIED -> "We need your permission first"
                else -> "We couldn’t load this just now"
            }
            val body = when (state) {
                LoadState.OFFLINE -> "$subject needs a connection. What you’ve already opened stays available, and nothing you entered has been lost."
                LoadState.DENIED -> "MyThuso cannot show ${subject.lowercase()} until you allow $permission. You can change your mind at any time, and declining never blocks a visit."
                else -> "$subject did not load. This is a preview, so nothing was lost — in production this would retry automatically and log the failure for the care team."
            }
            val icon = when (state) {
                LoadState.OFFLINE -> Icons.Outlined.CloudOff
                LoadState.DENIED -> Icons.Outlined.Lock
                else -> Icons.Outlined.WarningAmber
            }
            CareCard {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(icon, null, tint = Charcoal)
                    Text(heading, style = MaterialTheme.typography.titleMedium)
                }
                Text(body, style = MaterialTheme.typography.bodyMedium)
                if (retry != null) OutlinedButton(onClick = retry, shape = ThusoButtonShape) { Text(if (state == LoadState.DENIED) "Review permission" else "Try again") }
            }
        }
    }
}
/** A design-review control, not part of the product surface — so it stays collapsed until asked for. */
@Composable fun StatePicker(title: String, state: LoadState, onChange: (LoadState) -> Unit) {
    var open by remember { mutableStateOf(false) }
    /* `heightIn` before the ground, so the ground and the tap region are the same 48dp rather than
       the ground being 48 and the target 42. Collapsed, this row's own content came to 42dp — under
       the floor `TouchTarget` sets and under Material's minimum — and it is a disclosure that
       nothing else on the screen duplicates, so somebody who missed it twice has no other way in. */
    Column(
        Modifier.fillMaxWidth().heightIn(min = TouchTarget)
            .background(Color.White, RoundedCornerShape(ThusoRadius.control))
            .border(1.dp, StudioLine, RoundedCornerShape(ThusoRadius.control)).clickable { open = !open }.padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(if (open) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore, null, tint = BodyText, modifier = Modifier.size(18.dp))
            Text("Preview states", style = MaterialTheme.typography.labelLarge, color = BodyText, modifier = Modifier.weight(1f))
            if (state != LoadState.READY) StatusPill(state.label, "amber")
        }
        if (open) {
            Text(title, style = MaterialTheme.typography.labelSmall, color = BodyText)
            FlowRowChips(LoadState.entries.map { it.label }, setOf(state.label)) { label -> onChange(LoadState.entries.first { it.label == label }) }
        }
    }
}
@Composable fun EmptyStateCard(title: String, message: String) {
    CareCard {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Icons.Outlined.Inbox, null, tint = Charcoal)
            Text(title, style = MaterialTheme.typography.titleMedium)
        }
        Text(message, style = MaterialTheme.typography.bodyMedium)
    }
}
