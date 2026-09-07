package za.co.mythuso.ui

import android.provider.Settings
import androidx.compose.animation.core.*
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.border
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.cos
import kotlin.math.sin
import kotlinx.coroutines.delay
import za.co.mythuso.R
import za.co.mythuso.model.HeroSlideCopy
import za.co.mythuso.model.PreviewStore
import za.co.mythuso.model.heroSlides

/**
 * The landing banner. It rotates on its own, stops on request (WCAG 2.2.2) and never rotates when
 * the system asks for reduced motion. The person rises above the plate; the drifting bubbles and
 * currents behind them are decoration and are hidden from TalkBack.
 */
@Composable fun HeroCarousel(store: PreviewStore, onAction: (Int) -> Unit) {
    val slides = heroSlides(store.locale)
    val pager = rememberPagerState(pageCount = { slides.size })
    var playing by remember { mutableStateOf(true) }
    val reduceMotion = prefersReducedMotion()
    LaunchedEffect(playing, reduceMotion, pager.currentPage) {
        if (!playing || reduceMotion) return@LaunchedEffect
        delay(6500)
        pager.animateScrollToPage((pager.currentPage + 1) % slides.size)
    }
    Column(Modifier.fillMaxWidth().semantics { contentDescription = "MyThuso highlights" }, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        HorizontalPager(pager, Modifier.fillMaxWidth().height(376.dp)) { page ->
            SlideView(slides[page], page) { onAction(page) }
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            slides.forEachIndexed { position, slide ->
                Box(
                    Modifier.width(if (position == pager.currentPage) 24.dp else 8.dp).height(8.dp)
                        .background(if (position == pager.currentPage) Indigo else Line, CircleShape)
                        .clickable { playing = false }
                        .semantics {
                            contentDescription = "Highlight ${position + 1} of ${slides.size}: ${slide.title.replace("\n", " ")}"
                            selected = position == pager.currentPage
                        }
                )
            }
            Spacer(Modifier.weight(1f))
            if (!reduceMotion) {
                Box(
                    Modifier.size(32.dp).background(Color.White, CircleShape).border(1.dp, Line, CircleShape)
                        .clickable { playing = !playing }
                        .semantics { contentDescription = if (playing) "Pause the highlights" else "Play the highlights" },
                    Alignment.Center
                ) { Icon(if (playing) Icons.Outlined.Pause else Icons.Outlined.PlayArrow, null, tint = BodyText, modifier = Modifier.size(16.dp)) }
            }
        }
    }
}
@Composable private fun SlideView(slide: HeroSlideCopy, tone: Int, onAction: () -> Unit) {
    val banner = when (slide.banner) {
        "care_that_comes_to_you" -> R.drawable.banner_care_that_comes_to_you
        "one_safe_place" -> R.drawable.banner_one_safe_place
        else -> R.drawable.banner_feel_better
    }
    Box(Modifier.fillMaxSize().padding(horizontal = 4.dp).clipToBounds()) {
        @Suppress("UNUSED_EXPRESSION") tone
        Box(
            Modifier.fillMaxSize().padding(top = 66.dp).clip(RoundedCornerShape(ThusoRadius.card))
                .background(Color.White.copy(alpha = 0.66f))
                .border(1.dp, Color.White.copy(alpha = 0.85f), RoundedCornerShape(ThusoRadius.card))
        )
        Image(
            painterResource(banner), null,
            Modifier.align(Alignment.TopEnd).width(212.dp).padding(top = 4.dp)
                .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
                .drawWithContent {
                    drawContent()
                    drawRect(Brush.verticalGradient(0.87f to Color.Black, 1f to Color.Transparent), blendMode = BlendMode.DstIn)
                },
            contentScale = ContentScale.FillWidth
        )
        Column(
            Modifier.align(Alignment.BottomStart).fillMaxWidth().padding(start = 20.dp, end = 12.dp, bottom = 16.dp, top = 82.dp),
            verticalArrangement = Arrangement.spacedBy(0.dp)
        ) {
            Text(slide.title, style = MaterialTheme.typography.titleLarge, color = Slate, modifier = Modifier.fillMaxWidth(0.5f))
            Text(slide.body, style = MaterialTheme.typography.bodySmall, color = BodyText, modifier = Modifier.fillMaxWidth(0.5f).padding(top = 8.dp))
            Button(onClick = onAction, shape = CircleShape, modifier = Modifier.padding(top = 12.dp)) {
                Text(slide.cta, style = MaterialTheme.typography.titleSmall)
                Spacer(Modifier.width(8.dp))
                Icon(Icons.AutoMirrored.Outlined.ArrowForward, null, Modifier.size(16.dp))
            }
            Row(Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                slide.trust.forEachIndexed { spot, label ->
                    Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Box(Modifier.size(32.dp).background(Color.White.copy(alpha = 0.78f), CircleShape), Alignment.Center) {
                            Icon(trustIcon(slide.symbols[spot]), null, tint = Indigo, modifier = Modifier.size(15.dp))
                        }
                        Text(label, style = MaterialTheme.typography.labelMedium, color = Slate, textAlign = TextAlign.Center)
                    }
                }
            }
            Text(
                slide.caption,
                 style = MaterialTheme.typography.labelMedium, color = IndigoDeep,
                modifier = Modifier.padding(top = 8.dp).background(Color.White.copy(alpha = 0.88f), CircleShape).padding(horizontal = 12.dp, vertical = 8.dp)
            )
        }
    }
}
private data class Bubble(
    val x: Float, val y: Float, val radius: Float,
    val travelX: Float, val travelY: Float, val frequency: Float, val phase: Float
)
private fun trustIcon(name: String) = when (name) {
    "house" -> Icons.Outlined.Home
    "person.2" -> Icons.Outlined.People
    "sparkles" -> Icons.Outlined.AutoAwesome
    "heart" -> Icons.Outlined.FavoriteBorder
    "stethoscope" -> Icons.Outlined.MedicalServices
    else -> Icons.Outlined.VerifiedUser
}
/** "Remove animations" in Android accessibility settings zeroes the animator scale. */
@Composable fun prefersReducedMotion(): Boolean {
    val resolver = LocalContext.current.contentResolver
    return remember(resolver) {
        Settings.Global.getFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }
}
@Composable fun HeroTexture(tone: Int = 0, reduceMotion: Boolean = prefersReducedMotion()) {
    /* The brand's own two soft tints rather than the three hand-mixed mints this used to hold. Teal
       is an accent and this is the one place it is allowed to be a whole surface: a band behind a
       greeting is decoration, carries no text of its own, and is hidden from TalkBack. */
    val plate = when (tone) {
        1 -> listOf(TealSoft, IndigoSoft)
        2 -> listOf(IndigoSoft, AccentSoft)
        else -> listOf(Color.White, TealSoft)
    }
    val transition = rememberInfiniteTransition(label = "hero")
    // One slow clock; each bubble reads it at its own frequency and phase so nothing moves in step.
    val phase by transition.animateFloat(
        0f, (2 * Math.PI).toFloat(),
        infiniteRepeatable(tween(22000, easing = LinearEasing), RepeatMode.Restart), label = "phase"
    )
    val clock = if (reduceMotion) 0f else phase
    // x, y and radius as a fraction of the plate, then travel, frequency and starting phase.
    val bubbles = listOf(
        Bubble(0.13f, 0.76f, 30f, 17f, -24f, 1.0f, 0.0f),
        Bubble(0.30f, 0.20f, 17f, -26f, 15f, 0.8f, 1.1f),
        Bubble(0.59f, 0.81f, 23f, 14f, -18f, 1.3f, 2.2f),
        Bubble(0.78f, 0.28f, 38f, 30f, 12f, 0.6f, 3.4f),
        Bubble(0.44f, 0.53f, 11f, -20f, -22f, 1.6f, 4.1f),
        Bubble(0.93f, 0.68f, 15f, -24f, 16f, 1.1f, 5.0f),
        Bubble(0.05f, 0.34f, 13f, 22f, 20f, 0.9f, 2.7f),
        Bubble(0.67f, 0.42f, 9f, -18f, -26f, 1.8f, 0.6f)
    )
    Canvas(Modifier.fillMaxSize()) {
        drawRect(Brush.linearGradient(plate, Offset.Zero, Offset(size.width, size.height)), Offset.Zero, Size(size.width, size.height))
        bubbles.forEachIndexed { position, bubble ->
            val t = clock * bubble.frequency + bubble.phase
            val breathe = 1f + 0.14f * sin(t * 1.3f)
            drawCircle(
                Indigo.copy(alpha = if (position % 3 == 0) 0.07f else 0.10f),
                bubble.radius * density * breathe,
                Offset(
                    bubble.x * size.width + sin(t) * bubble.travelX * density,
                    bubble.y * size.height + cos(t * 0.8f) * bubble.travelY * density
                )
            )
        }
        listOf(Triple(0.78f, 40f, 1.0f), Triple(0.90f, -38f, 0.7f)).forEach { (lift, travel, speed) ->
            val slide = sin(clock * speed) * travel * density
            val path = Path().apply {
                moveTo(-30f + slide, size.height * lift)
                cubicTo(
                    size.width * 0.32f + slide, size.height * (lift - 0.22f),
                    size.width * 0.62f + slide, size.height * (lift + 0.10f),
                    size.width + 30f + slide, size.height * (lift - 0.30f)
                )
            }
            drawPath(path, Indigo.copy(alpha = 0.16f), style = Stroke(width = 2.5f * density, cap = androidx.compose.ui.graphics.StrokeCap.Round))
        }
    }
}
