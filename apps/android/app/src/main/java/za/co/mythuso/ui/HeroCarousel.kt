package za.co.mythuso.ui

import android.provider.Settings
import androidx.compose.animation.core.*
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
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
    // "Remove animations" in Android accessibility settings zeroes the animator scale.
    val resolver = LocalContext.current.contentResolver
    val reduceMotion = remember(resolver) {
        Settings.Global.getFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }
    LaunchedEffect(playing, reduceMotion, pager.currentPage) {
        if (!playing || reduceMotion) return@LaunchedEffect
        delay(6500)
        pager.animateScrollToPage((pager.currentPage + 1) % slides.size)
    }
    Column(Modifier.fillMaxWidth().semantics { contentDescription = "MyThuso highlights" }, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        HorizontalPager(pager, Modifier.fillMaxWidth().height(356.dp)) { page ->
            SlideView(slides[page], page, reduceMotion) { onAction(page) }
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            slides.forEachIndexed { position, slide ->
                Box(
                    Modifier.width(if (position == pager.currentPage) 24.dp else 8.dp).height(8.dp)
                        .background(if (position == pager.currentPage) Teal else Line, CircleShape)
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
@Composable private fun SlideView(slide: HeroSlideCopy, tone: Int, reduceMotion: Boolean, onAction: () -> Unit) {
    val banner = when (slide.banner) {
        "care_that_comes_to_you" -> R.drawable.banner_care_that_comes_to_you
        "one_safe_place" -> R.drawable.banner_one_safe_place
        else -> R.drawable.banner_feel_better
    }
    Box(Modifier.fillMaxSize().padding(horizontal = 2.dp).clipToBounds()) {
        Box(Modifier.fillMaxSize().padding(top = 40.dp).clip(RoundedCornerShape(18.dp))) { HeroTexture(tone, reduceMotion) }
        Image(
            painterResource(banner), null,
            Modifier.align(Alignment.BottomEnd).height(356.dp).offset(x = 104.dp),
            contentScale = ContentScale.Fit
        )
        Column(
            Modifier.align(Alignment.BottomStart).widthIn(max = 218.dp).padding(start = 18.dp, end = 6.dp, bottom = 14.dp, top = 40.dp),
            verticalArrangement = Arrangement.spacedBy(0.dp)
        ) {
            Text(slide.title, fontSize = 24.sp, fontWeight = FontWeight.Bold, color = Forest, lineHeight = 28.sp)
            Text(slide.body, fontSize = 12.5.sp, color = BodyText, lineHeight = 18.sp, modifier = Modifier.padding(top = 8.dp))
            Button(onClick = onAction, shape = CircleShape, modifier = Modifier.padding(top = 13.dp)) {
                Text(slide.cta, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.width(9.dp))
                Icon(Icons.Outlined.ArrowForward, null, Modifier.size(16.dp))
            }
            Row(Modifier.padding(top = 11.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                slide.trust.forEachIndexed { spot, label ->
                    Column(Modifier.width(69.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(5.dp)) {
                        Box(Modifier.size(32.dp).background(Color.White.copy(alpha = 0.78f), CircleShape), Alignment.Center) {
                            Icon(trustIcon(slide.symbols[spot]), null, tint = Teal, modifier = Modifier.size(15.dp))
                        }
                        Text(label, fontSize = 9.5.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF42655B), textAlign = TextAlign.Center, lineHeight = 12.sp)
                    }
                }
            }
            Text(
                slide.caption, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = TealDeep,
                modifier = Modifier.padding(top = 10.dp).background(Color.White.copy(alpha = 0.88f), CircleShape).padding(horizontal = 13.dp, vertical = 7.dp)
            )
        }
    }
}
private fun trustIcon(name: String) = when (name) {
    "house" -> Icons.Outlined.Home
    "person.2" -> Icons.Outlined.People
    "sparkles" -> Icons.Outlined.AutoAwesome
    "heart" -> Icons.Outlined.FavoriteBorder
    "stethoscope" -> Icons.Outlined.MedicalServices
    else -> Icons.Outlined.VerifiedUser
}
@Composable private fun HeroTexture(tone: Int, reduceMotion: Boolean) {
    val plate = when (tone) {
        1 -> listOf(Color(0xFFF2F9F9), Color(0xFFDBEEF0))
        2 -> listOf(Color(0xFFF4FAF7), Color(0xFFDDEFE6))
        else -> listOf(Color(0xFFF3FAF8), Color(0xFFDFF0EC))
    }
    val transition = rememberInfiniteTransition(label = "hero")
    val drift by transition.animateFloat(
        -1f, 1f,
        infiniteRepeatable(tween(13000, easing = LinearEasing), RepeatMode.Reverse), label = "drift"
    )
    val shift = if (reduceMotion) 0f else drift
    val bubbles = listOf(
        Triple(0.13f, 0.76f, 30f), Triple(0.30f, 0.20f, 17f), Triple(0.59f, 0.81f, 23f),
        Triple(0.78f, 0.28f, 38f), Triple(0.44f, 0.53f, 11f), Triple(0.93f, 0.68f, 15f)
    )
    Canvas(Modifier.fillMaxSize()) {
        drawRect(Brush.linearGradient(plate, Offset.Zero, Offset(size.width, size.height)), Offset.Zero, Size(size.width, size.height))
        bubbles.forEachIndexed { position, bubble ->
            val sway = shift * (7f + position * 2f)
            drawCircle(
                Teal.copy(alpha = if (position % 3 == 0) 0.07f else 0.10f),
                bubble.third * density,
                Offset(bubble.first * size.width + sway, bubble.second * size.height - sway)
            )
        }
        listOf(0.78f to 24f, 0.90f to -20f).forEach { (lift, travel) ->
            val path = Path().apply {
                moveTo(-30f + shift * travel, size.height * lift)
                cubicTo(
                    size.width * 0.32f + shift * travel, size.height * (lift - 0.22f),
                    size.width * 0.62f + shift * travel, size.height * (lift + 0.10f),
                    size.width + 30f + shift * travel, size.height * (lift - 0.30f)
                )
            }
            drawPath(path, Teal.copy(alpha = 0.16f), style = Stroke(width = 2.5f * density, cap = androidx.compose.ui.graphics.StrokeCap.Round))
        }
    }
}
