package za.co.mythuso.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.outlined.Block
import androidx.compose.material.icons.outlined.Call
import androidx.compose.material.icons.outlined.LocalHospital
import androidx.compose.material.icons.outlined.Luggage
import androidx.compose.material.icons.outlined.Medication
import androidx.compose.material.icons.outlined.MonitorHeart
import androidx.compose.material.icons.outlined.Replay
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material.icons.outlined.WaterDrop
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import za.co.mythuso.model.CareTip
import za.co.mythuso.model.CareTips
import za.co.mythuso.model.CareTipsData

/* Care tips, after a visit: one card in front, the next two behind it, read one at a time.
 *
 * Ported from apps/web/src/features/CareTips.tsx. Every word is CareTipsData's, generated from
 * packages/catalog/care-tips.json — the tips, the buttons, the three refusals and the reviewer
 * notice — so the phone cannot word a caution differently from the web.
 *
 * The reviewer notice sits directly under the two buttons: it qualifies every card, and at font
 * scale 2.0 the refusals panel is several screens further down.
 *
 * Motion: the front card is AnimatedContent keyed on the tip, rising a little and growing from 96
 * per cent on the tokens' curve and entrance duration. Under the system's animations-off setting the
 * duration is zero, so the new card is simply there. */

@Composable fun CareTipsScreen(open: (String) -> Unit) {
    var at by rememberSaveable { mutableIntStateOf(0) }
    val tips = CareTips.all
    val last = at == tips.lastIndex
    val still = prefersReducedMotion()
    ScreenColumn {
        Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
            Text(CareTipsData.Screen.eyebrow, style = MaterialTheme.typography.labelMedium, color = StudioInkMuted)
            Text(CareTipsData.Screen.heading, style = MaterialTheme.typography.headlineSmall, color = Charcoal,
                 modifier = Modifier.semantics { heading() })
            Text(CareTipsData.Screen.lead, style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted)
        }

        Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space16)) {
            /* One segment per tip, each a whole touch-target-tall button with a bar drawn inside it. Read
               and unread differ in colour, the current one is also thicker, and the card's counter says
               it in words. */
            Row(Modifier.fillMaxWidth().semantics { contentDescription = CareTipsData.Screen.progressLabel },
                horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
                tips.forEachIndexed { index, _ ->
                    Box(
                        Modifier.weight(1f).heightIn(min = TouchTarget)
                            .semantics { selected = index == at }
                            .clickableSegment(CareTips.jumpLabel(index)) { at = index },
                        contentAlignment = Alignment.Center
                    ) {
                        Box(Modifier.fillMaxWidth().height(if (index == at) 8.dp else 4.dp)
                            .background(if (index <= at) StudioInk else SageSlate, CircleShape))
                    }
                }
            }

            TipStack(at, still)

            Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
                OutlinedButton(
                    onClick = { at -= 1 }, enabled = at > 0,
                    modifier = Modifier.weight(1f).heightIn(min = TouchTarget), shape = ThusoButtonShape
                ) {
                    Icon(Icons.AutoMirrored.Outlined.ArrowBack, null, Modifier.size(18.dp))
                    Spacer(Modifier.width(ThusoSpacing.space8))
                    Text(CareTipsData.Screen.back)
                }
                StudioButton(
                    onClick = { at = if (last) 0 else at + 1 },
                    modifier = Modifier.weight(2f).heightIn(min = TouchTarget)
                ) {
                    if (last) {
                        Icon(Icons.Outlined.Replay, null, Modifier.size(18.dp))
                        Spacer(Modifier.width(ThusoSpacing.space8))
                        Text(CareTipsData.Screen.startAgain)
                    } else {
                        Text(CareTipsData.Screen.next)
                        Spacer(Modifier.width(ThusoSpacing.space8))
                        Icon(Icons.AutoMirrored.Outlined.ArrowForward, null, Modifier.size(18.dp))
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8), verticalAlignment = Alignment.Top) {
                Icon(Icons.Outlined.Shield, null, Modifier.size(18.dp), tint = StudioInk)
                Text(CareTipsData.Review.notice, style = MaterialTheme.typography.bodyMedium, color = StudioInk)
            }
        }

        CareCard(padding = ThusoSpacing.space20) {
            Text(CareTipsData.Screen.refusalsHeading, style = MaterialTheme.typography.titleLarge, color = Charcoal,
                 modifier = Modifier.semantics { heading() })
            CareTipsData.refusals.forEach { sentence ->
                Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12), verticalAlignment = Alignment.Top) {
                    Icon(Icons.Outlined.Block, null, Modifier.size(18.dp), tint = StudioInkMuted)
                    Text(sentence, style = MaterialTheme.typography.bodyMedium, color = StudioInk)
                }
            }
            OutlinedButton(
                onClick = { open("Thuso SOS") },
                modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget), shape = ThusoButtonShape
            ) {
                Icon(Icons.Outlined.LocalHospital, null, Modifier.size(18.dp))
                Spacer(Modifier.width(ThusoSpacing.space8))
                Text(CareTipsData.Screen.emergencyLabel)
            }
        }
    }
}

/* A segment of the progress bar as a button: the role, the name TalkBack reads, and the press. */
private fun Modifier.clickableSegment(label: String, onClick: () -> Unit): Modifier =
    this.semantics { contentDescription = label }.clickable(role = Role.Button, onClick = onClick)

/* The front card decides the height, so it grows with the text at any font scale; the two behind
   are drawn from its edges, inset and dropped, so they peek out underneath it. The live region is the
   stack rather than the card, so TalkBack reads the new tip when Next is pressed. */
@Composable private fun TipStack(at: Int, still: Boolean) {
    val behind = CareTips.behind(at)
    val shape = RoundedCornerShape(ThusoRadius.card)
    Box(Modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite }) {
        if (behind.size > 1) Box(Modifier.matchParentSize().padding(start = ThusoSpacing.space24, end = ThusoSpacing.space24, top = ThusoSpacing.space24)
            .background(behind[1].fill, shape).semantics { hideFromAccessibility() })
        if (behind.isNotEmpty()) Box(Modifier.matchParentSize().padding(ThusoSpacing.space12)
            .background(behind[0].fill, shape).semantics { hideFromAccessibility() })
        AnimatedContent(
            targetState = at,
            transitionSpec = {
                val enter = if (still) 0 else ThusoMotion.enterMs
                (fadeIn(tween(enter, easing = ThusoMotion.EaseSoft)) +
                    slideInVertically(tween(enter, easing = ThusoMotion.EaseSoft)) { it / 12 } +
                    scaleIn(tween(enter, easing = ThusoMotion.EaseSoft), initialScale = 0.96f)) togetherWith
                    fadeOut(tween(if (still) 0 else ThusoMotion.quickMs))
            },
            modifier = Modifier.padding(bottom = ThusoSpacing.space24),
            label = "care-tip"
        ) { index -> TipCard(CareTips.all[index], index) }
    }
}

/* The chip and the drawing sit at the top and the words at the bottom, with the card's minimum height
   between them; past that height — a large font scale — the card simply grows. */
@OptIn(ExperimentalLayoutApi::class)
@Composable private fun TipCard(tip: CareTip, index: Int) {
    val chip = if (tip.dark) StudioLime else SurfaceWhite
    val chipInk = if (tip.dark) StudioInk else tip.ink
    Column(
        Modifier.fillMaxWidth().heightIn(min = 340.dp)
            .background(tip.fill, RoundedCornerShape(ThusoRadius.card))
            .padding(ThusoSpacing.space24),
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space16)) {
            FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
                Text(tip.tag, style = MaterialTheme.typography.labelMedium, color = chipInk,
                     modifier = Modifier.background(chip, RoundedCornerShape(ThusoRadius.pill))
                         .padding(horizontal = ThusoSpacing.space12, vertical = ThusoSpacing.space4))
                Text(CareTips.counter(index), style = MaterialTheme.typography.bodySmall, color = tip.ink)
            }
            Box(Modifier.sizeIn(minWidth = 72.dp, minHeight = 72.dp).background(chip, RoundedCornerShape(ThusoRadius.tile)),
                contentAlignment = Alignment.Center) {
                Icon(iconFor(tip.category), null, Modifier.size(36.dp), tint = chipInk)
            }
        }
        Column(Modifier.padding(top = ThusoSpacing.space16), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
            Text(tip.title, style = MaterialTheme.typography.headlineSmall, color = tip.ink,
                 modifier = Modifier.semantics { heading() })
            Text(tip.body, style = MaterialTheme.typography.bodyLarge, color = tip.ink)
        }
    }
}

/* A picture, not a sentence, so it lives with the screen; a category the contract adds later draws
   the generic mark rather than nothing. */
private fun iconFor(category: String): ImageVector = when (category) {
    "medicines" -> Icons.Outlined.Medication
    "blood-pressure" -> Icons.Outlined.MonitorHeart
    "be-ready" -> Icons.Outlined.Luggage
    "water" -> Icons.Outlined.WaterDrop
    "when-to-call" -> Icons.Outlined.Call
    else -> Icons.Outlined.Shield
}
