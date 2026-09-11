package za.co.mythuso.ui

import androidx.compose.animation.Crossfade
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.*
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import za.co.mythuso.R

/** Native care focus selector: actions use the existing booking, family and passport routes. */
@Composable fun CareStudio(book: () -> Unit, open: (String) -> Unit) {
    var chapter by rememberSaveable { mutableIntStateOf(0) }
    var motion by rememberSaveable { mutableStateOf(true) }
    val night = Color(0xFF172B2B)
    val tint by animateColorAsState(
        listOf(Color(0xFFDFFF92), Color(0xFFFFCEAD), Color(0xFFDED3FF))[chapter],
        animationSpec = tween(if (motion) 350 else 0), label = "Care focus colour"
    )
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(night).padding(22.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.AutoAwesome, null, tint = tint, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text("THE CARE STUDIO", color = tint, fontSize = 13.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            IconButton(onClick = { motion = !motion }) {
                Icon(if (motion) Icons.Outlined.Pause else Icons.Outlined.PlayArrow,
                    if (motion) "Pause decorative motion" else "Enable decorative motion", tint = Color.White)
            }
        }
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color.White.copy(alpha = .08f))
            .horizontalScroll(rememberScrollState()).selectableGroup().padding(4.dp)) {
            listOf("For me", "For family", "My records").forEachIndexed { index, label ->
                Box(Modifier.clip(RoundedCornerShape(12.dp))
                    .background(if (chapter == index) tint else Color.Transparent)
                    .selectable(selected = chapter == index, role = Role.Tab, onClick = { chapter = index })
                    .heightIn(min = 48.dp).padding(horizontal = 13.dp, vertical = 12.dp), contentAlignment = Alignment.Center) {
                    Text(label, color = if (chapter == index) night else Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
        Crossfade(targetState = chapter, animationSpec = tween(if (motion) 300 else 0), label = "Care chapter") { current ->
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Column {
                    Text(listOf("Feel good.", "Close to heart.", "Every chapter.")[current], color = Color.White,
                        fontSize = 36.sp, lineHeight = 40.sp, fontWeight = FontWeight.SemiBold)
                    Text(listOf("Live fully.", "Closer to care.", "Connected.")[current], color = tint,
                        fontSize = 36.sp, lineHeight = 40.sp, fontFamily = FontFamily.Serif, fontStyle = FontStyle.Italic)
                }
                Text(listOf(
                    "Your next chapter of feeling better starts at home. Find a little help that fits your everyday.",
                    "Bring your people into your circle. Arrange care for someone you love, while keeping their records private.",
                    "Readings, results and visits, all in your Health Passport. A clearer picture, with you in control."
                )[current], color = Color(0xFFD1DDD4), fontSize = 15.sp, lineHeight = 24.sp)
                Button(onClick = { when(current) { 0 -> book(); 1 -> open("My family"); else -> open("Health Passport") } },
                    colors = ButtonDefaults.buttonColors(containerColor = tint, contentColor = night),
                    modifier = Modifier.heightIn(min = 52.dp), shape = CircleShape) {
                    Text(listOf("Explore care", "Meet your circle", "Open my passport")[current])
                    Spacer(Modifier.width(15.dp)); Icon(Icons.Outlined.NorthEast, null)
                }
            }
        }
        StudioArtwork(chapter, tint, motion)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text("A more human kind of healthcare", color = Color(0xFFD1DDD4), fontSize = 13.sp, modifier = Modifier.weight(1f))
            Text("0${chapter + 1} / 03", color = Color(0xFFD1DDD4), fontSize = 13.sp)
        }
    }
}

@Composable private fun StudioArtwork(chapter: Int, tint: Color, motion: Boolean) {
    // Compose animation uses the system animator duration scale, including its zero-motion setting.
    var angle = 0f
    if (motion) {
        val transition = rememberInfiniteTransition(label = "Care illustration")
        val rotation by transition.animateFloat(0f, 360f,
            infiniteRepeatable(tween(24000, easing = LinearEasing)), label = "Decorative sparkle")
        angle = rotation
    }
    Box(Modifier.fillMaxWidth().height(220.dp), contentAlignment = Alignment.Center) {
        Box(Modifier.fillMaxSize().padding(12.dp).graphicsLayer { rotationZ = -15f }
            .border(1.dp, tint.copy(alpha = .4f), CircleShape))
        Box(Modifier.size(205.dp).background(tint, CircleShape))
        Image(painterResource(listOf(R.drawable.mythuso_nurse, R.drawable.mythuso_family, R.drawable.mythuso_elder)[chapter]),
            contentDescription = null, modifier = Modifier.fillMaxSize().padding(top = 8.dp))
        Icon(Icons.Outlined.AutoAwesome, null, tint = tint,
            modifier = Modifier.align(Alignment.TopStart).size(42.dp).graphicsLayer { rotationZ = angle })
        Text("HELP. HEALTH. HOME.", color = Color(0xFF243630), fontSize = 13.sp, fontWeight = FontWeight.Bold,
            modifier = Modifier.align(Alignment.BottomCenter).graphicsLayer { rotationZ = -5f }
                .background(Color(0xFFFFF8E9), RoundedCornerShape(12.dp)).padding(14.dp))
    }
}
