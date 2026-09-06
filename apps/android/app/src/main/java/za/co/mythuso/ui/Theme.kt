package za.co.mythuso.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.outlined.Check
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

val Teal = Color(0xFF0E7C6B)
val TealDeep = Color(0xFF0A6357)
val TealSoft = Color(0xFFE4F2ED)
val Mint = Color(0xFFD3EBE1)
val Forest = Color(0xFF123A32)
val Ink = Color(0xFF10241F)
val BodyText = Color(0xFF5B6B66)
val Line = Color(0xFFE7EEEB)
val Canvas = Color(0xFFF4F8F7)
val Amber = Color(0xFFB07A21)
val AmberSoft = Color(0xFFFBF0DC)
val Sky = Color(0xFF3C6E9F)
val SkySoft = Color(0xFFE7F0FA)
val Danger = Color(0xFFC24A3E)
val Sage = TealSoft

@Composable fun ThusoTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = Teal, onPrimary = Color.White,
            primaryContainer = TealSoft, onPrimaryContainer = TealDeep,
            secondary = Forest, onSecondary = Color.White,
            secondaryContainer = TealSoft, onSecondaryContainer = TealDeep,
            tertiary = Teal, tertiaryContainer = Mint, onTertiaryContainer = TealDeep,
            background = Canvas, surface = Color.White, onBackground = Ink, onSurface = Ink,
            surfaceVariant = Canvas, onSurfaceVariant = BodyText,
            outline = Line, outlineVariant = Line, error = Danger
        ),
        content = content
    )
}
@Composable fun CareCard(modifier: Modifier = Modifier, padding: Dp = 18.dp, content: @Composable ColumnScope.() -> Unit) {
    Card(
        modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, Line),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) { Column(Modifier.padding(padding), verticalArrangement = Arrangement.spacedBy(13.dp), content = content) }
}
@Composable fun Heading(eyebrow: String, title: String, subtitle: String) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (eyebrow.isNotEmpty()) Text(eyebrow.uppercase(), fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.4.sp, color = Teal)
        Text(title, fontSize = 26.sp, fontWeight = FontWeight.Bold, lineHeight = 31.sp, color = Ink)
        if (subtitle.isNotEmpty()) Text(subtitle, fontSize = 13.sp, color = BodyText, lineHeight = 20.sp)
    }
}
@Composable fun DemoBadge() {
    Text("●  Design preview · Fictional data", fontSize = 11.sp, fontWeight = FontWeight.Medium, color = Teal)
}
/** A soft tinted square holding a symbol — the repeating unit of the whole design. */
@Composable fun TileIcon(icon: ImageVector, tint: Color = Teal, background: Color = TealSoft, size: Dp = 44.dp) {
    Box(Modifier.size(size).background(background, RoundedCornerShape(size * 0.32f)), Alignment.Center) {
        Icon(icon, null, tint = tint, modifier = Modifier.size(size * 0.46f))
    }
}
@Composable fun StatusPill(text: String, tone: String = "teal") {
    val (bg, fg) = when (tone) {
        "amber" -> AmberSoft to Amber
        "sky" -> SkySoft to Sky
        "light" -> Color.White.copy(alpha = 0.18f) to Color(0xFFE8F5EF)
        else -> TealSoft to TealDeep
    }
    Text(text, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = fg,
        modifier = Modifier.background(bg, CircleShape).padding(horizontal = 10.dp, vertical = 5.dp))
}
@Composable fun StepDots(step: Int, total: Int, label: String) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text("Step $step of $total", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Teal)
        Spacer(Modifier.width(10.dp))
        Text(label, fontSize = 12.sp, color = BodyText, modifier = Modifier.weight(1f))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            (1..total).forEach { index ->
                Box(Modifier.width(if (index == step) 20.dp else 8.dp).height(8.dp)
                    .background(if (index <= step) Teal else Line, CircleShape))
            }
        }
    }
}
@Composable fun MenuRow(title: String, subtitle: String, icon: ImageVector, danger: Boolean = false, click: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable(onClick = click).padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(13.dp)
    ) {
        TileIcon(icon, if (danger) Danger else Teal, if (danger) Danger.copy(alpha = 0.10f) else TealSoft, 38.dp)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(title, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = if (danger) Danger else Ink)
            if (subtitle.isNotEmpty()) Text(subtitle, fontSize = 12.sp, color = BodyText, lineHeight = 17.sp)
        }
        if (!danger) Icon(Icons.Outlined.ChevronRight, null, tint = BodyText.copy(alpha = 0.7f))
    }
}
/**
 * One box per digit, as the design asks. A single hidden field owns the text so autofill, paste and
 * TalkBack all still work; the boxes are a picture of what it holds.
 */
@Composable fun CodeBoxes(code: String, onChange: (String) -> Unit, length: Int = 6, invalid: Boolean = false, label: String) {
    val focus = remember { FocusRequester() }
    var focused by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxWidth()) {
        BasicTextField(
            value = code,
            onValueChange = { onChange(it.filter { c -> c.isDigit() }.take(length)) },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
            modifier = Modifier.matchParentSize().alpha(0.01f).focusRequester(focus)
                .onFocusChanged { focused = it.isFocused }
                .semantics { contentDescription = label }
        )
        Row(
            Modifier.fillMaxWidth().clickable { focus.requestFocus() },
            horizontalArrangement = Arrangement.spacedBy(7.dp)
        ) {
            repeat(length) { index ->
                val active = focused && index == minOf(code.length, length - 1)
                Box(
                    Modifier.weight(1f).height(56.dp)
                        .background(Color.White, RoundedCornerShape(12.dp))
                        .border(1.5.dp, if (invalid) Danger else if (active) Teal else Line, RoundedCornerShape(12.dp)),
                    Alignment.Center
                ) { Text(code.getOrNull(index)?.toString() ?: "", fontSize = 19.sp, fontWeight = FontWeight.SemiBold, color = Ink) }
            }
            if (code.length == length && !invalid) {
                Box(Modifier.size(34.dp).background(Teal, CircleShape), Alignment.Center) {
                    Icon(Icons.Outlined.Check, null, tint = Color.White, modifier = Modifier.size(18.dp))
                }
            }
        }
    }
}
