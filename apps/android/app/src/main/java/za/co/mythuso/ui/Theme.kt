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
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
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

/* The palette itself is generated into Tokens.kt from packages/design-tokens/tokens.json, so a
   colour is converted from hex once, by a machine, rather than three times by hand. Only the alias
   below is a design decision rather than a token: sage is what the clinical chart calls the soft
   teal it fills an in-range reading with. It had been pointed at the soft indigo, which made every
   in-range reading the same colour as the brand and left the chart with nothing to say when a
   reading was fine — teal is the one accent that means "this is as it should be". */
val Sage = TealSoft

/* One tap target, one number. WCAG 2.2 puts the AAA figure at 44x44 and the token file holds this
   design to it, because it is a health app operated one-handed on a doorstep. */
val TouchTarget = 48.dp

@Composable fun ThusoTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = Indigo, onPrimary = Color.White,
            primaryContainer = IndigoSoft, onPrimaryContainer = IndigoDeep,
            secondary = Slate, onSecondary = Color.White,
            secondaryContainer = IndigoSoft, onSecondaryContainer = IndigoDeep,
            tertiary = Indigo, tertiaryContainer = AccentSoft, onTertiaryContainer = IndigoDeep,
            background = Canvas, surface = Color.White, onBackground = Ink, onSurface = Ink,
            surfaceVariant = Canvas, onSurfaceVariant = BodyText,
            outline = Line, outlineVariant = Line, error = Danger
        ),
        typography = ThusoTypography,
        shapes = Shapes(
            extraSmall = RoundedCornerShape(ThusoRadius.tile),
            small = RoundedCornerShape(ThusoRadius.control),
            medium = RoundedCornerShape(ThusoRadius.card),
            large = RoundedCornerShape(ThusoRadius.card),
            extraLarge = RoundedCornerShape(ThusoRadius.card)
        ),
        content = content
    )
}

/* Three card weights, and the reason there are three.
 *
 * Every card on every screen used to be the same object: white, an 18dp radius, a hairline border
 * and a one-point shadow. A screen of eleven of those has no hierarchy at all — a person opening it
 * has to read all eleven to find out which one they came for. So:
 *
 *   CareCard   — the default, and the quiet one. A border, no shadow. Most things are this.
 *   LeadCard   — one per screen at most: the thing the screen is for. It is lifted off the ground by
 *                a shadow rather than by a colour, so that lifting it does not spend an accent.
 *   TonedCard  — a tinted panel with no border for material that has to be present and must not
 *                compete: a note, a disclosure, a refusal.
 *
 * Radius comes from the token file rather than the 18dp that was typed at each site — 12 is what
 * `radius.card` says, and the difference between the two is most of what "rounded" looked like. */
@Composable fun CareCard(modifier: Modifier = Modifier, padding: Dp = ThusoSpacing.space16, content: @Composable ColumnScope.() -> Unit) {
    Card(
        modifier.fillMaxWidth(), shape = RoundedCornerShape(ThusoRadius.card),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, Line),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) { Column(Modifier.padding(padding), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12), content = content) }
}

@Composable fun LeadCard(modifier: Modifier = Modifier, padding: Dp = ThusoSpacing.space20, content: @Composable ColumnScope.() -> Unit) {
    Card(
        modifier.fillMaxWidth(), shape = RoundedCornerShape(ThusoRadius.card),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 3.dp)
    ) { Column(Modifier.padding(padding), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12), content = content) }
}

@Composable fun TonedCard(
    modifier: Modifier = Modifier,
    background: Color = IndigoSoft,
    padding: Dp = ThusoSpacing.space16,
    content: @Composable ColumnScope.() -> Unit
) {
    Column(
        modifier.fillMaxWidth().background(background, RoundedCornerShape(ThusoRadius.card)).padding(padding),
        verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space8), content = content
    )
}

/* The screen's own title, announced as a heading so TalkBack's heading navigation has somewhere to
   land. The eyebrow used to be 10sp bold with 1.4sp of tracking, which is a fashion rather than a
   label; at the caption size it is readable and still reads as a category. */
@Composable fun Heading(eyebrow: String, title: String, subtitle: String) {
    Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
        if (eyebrow.isNotEmpty()) Text(
            eyebrow.uppercase(), style = MaterialTheme.typography.labelSmall,
            letterSpacing = 0.8.sp, color = Indigo
        )
        Text(
            title, style = MaterialTheme.typography.headlineSmall, color = Ink,
            modifier = Modifier.semantics { heading() }
        )
        if (subtitle.isNotEmpty()) Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = BodyText)
    }
}

/* A section title and, optionally, the one action that belongs to it. Related things close: the
   header sits 12dp above its own content and 24dp below whatever came before, which is the whole of
   what makes a long screen readable. */
@Composable fun SectionHeader(title: String, action: String? = null, onAction: (() -> Unit)? = null) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(
            title, style = MaterialTheme.typography.titleLarge, color = Ink,
            modifier = Modifier.weight(1f).semantics { heading() }
        )
        if (action != null && onAction != null) TextButton(
            onClick = onAction,
            modifier = Modifier.heightIn(min = TouchTarget),
            contentPadding = PaddingValues(horizontal = ThusoSpacing.space12, vertical = ThusoSpacing.space8)
        ) { Text(action, style = MaterialTheme.typography.labelMedium) }
    }
}

/** A section: a heading, then its content, held together at one gap. */
@Composable fun Section(
    title: String,
    action: String? = null,
    onAction: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit
) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
        SectionHeader(title, action, onAction)
        content()
    }
}

/* The preview disclosure. It is not decoration and it is not a tidy-up candidate: nothing in this
   app is a real service, and a screen that could be mistaken for one has to say so. */
@Composable fun DemoBadge() {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
        Box(Modifier.size(6.dp).background(Indigo, CircleShape))
        Text("Design preview · Fictional data", style = MaterialTheme.typography.labelMedium, color = Indigo)
    }
}

/** A soft tinted square holding a symbol. Indigo by default, and an accent only when it means one. */
@Composable fun TileIcon(icon: ImageVector, tint: Color = Indigo, background: Color = IndigoSoft, size: Dp = 40.dp) {
    Box(Modifier.size(size).background(background, RoundedCornerShape(ThusoRadius.tile)), Alignment.Center) {
        Icon(icon, null, tint = tint, modifier = Modifier.size(size * 0.5f))
    }
}

@Composable fun StatusPill(text: String, tone: String = "teal") {
    val (bg, fg) = when (tone) {
        "amber" -> MangoSoft to MangoInk
        "sky" -> InfoSoft to Info
        /* A refusal is not a warning. Vetting needs a pill that says so without shouting. */
        "danger" -> DangerSoft to Danger
        "quiet" -> Canvas to BodyText
        "light" -> Color.White.copy(alpha = 0.20f) to Color.White
        else -> IndigoSoft to IndigoDeep
    }
    Text(
        text, style = MaterialTheme.typography.labelSmall, color = fg,
        modifier = Modifier.background(bg, CircleShape).padding(horizontal = ThusoSpacing.space12, vertical = 4.dp)
    )
}

@Composable fun StepDots(step: Int, total: Int, label: String) {
    Row(
        Modifier.fillMaxWidth().semantics(mergeDescendants = true) { contentDescription = "Step $step of $total: $label" },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)
    ) {
        Text("Step $step of $total", style = MaterialTheme.typography.labelMedium, color = Indigo)
        Text(label, style = MaterialTheme.typography.bodySmall, color = BodyText, modifier = Modifier.weight(1f))
        Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space4), verticalAlignment = Alignment.CenterVertically) {
            (1..total).forEach { index ->
                Box(
                    Modifier.width(if (index == step) 20.dp else 8.dp).height(8.dp)
                        .background(if (index <= step) Indigo else Line, CircleShape)
                )
            }
        }
    }
}

/* Material's own list row rather than a Row of Text.
 *
 * ListItem already knows the leading/headline/supporting/trailing arrangement, the minimum heights
 * for one, two and three lines, and how to grow when the reader enlarges the type. The hand-rolled
 * Row it replaces knew none of that: it had a fixed 38dp tile, a 12sp subtitle and a 48dp floor that
 * a two-line subtitle at the largest font scale walked straight out of. Merged semantics because a
 * row is one thing to a screen reader, not four. */
@Composable fun MenuRow(title: String, subtitle: String, icon: ImageVector, danger: Boolean = false, click: () -> Unit) {
    ListItem(
        headlineContent = { Text(title, style = MaterialTheme.typography.titleSmall, color = if (danger) Danger else Ink) },
        supportingContent = if (subtitle.isEmpty()) null else ({
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = BodyText)
        }),
        leadingContent = { TileIcon(icon, if (danger) Danger else Indigo, if (danger) DangerSoft else IndigoSoft, 40.dp) },
        trailingContent = if (danger) null else ({
            Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null, tint = Faint)
        }),
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier
            .clip(RoundedCornerShape(ThusoRadius.control))
            .clickable(onClick = click)
            .heightIn(min = TouchTarget)
            .semantics(mergeDescendants = true) {}
    )
}

/** A row of text with a chevron — a menu row with nothing worth a symbol beside it. */
@Composable fun PlainRow(title: String, subtitle: String = "", click: () -> Unit) {
    ListItem(
        headlineContent = { Text(title, style = MaterialTheme.typography.titleSmall, color = Ink) },
        supportingContent = if (subtitle.isEmpty()) null else ({
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = BodyText)
        }),
        trailingContent = { Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null, tint = Faint) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier
            .clip(RoundedCornerShape(ThusoRadius.control))
            .clickable(onClick = click)
            .heightIn(min = TouchTarget)
            .semantics(mergeDescendants = true) {}
    )
}

/** The full-width primary action. One per screen, and it is the thing the screen is for. */
@Composable fun PrimaryAction(label: String, modifier: Modifier = Modifier, icon: ImageVector? = null, click: () -> Unit) {
    Button(
        onClick = click,
        modifier = modifier.fillMaxWidth().heightIn(min = 56.dp),
        shape = RoundedCornerShape(ThusoRadius.control),
        contentPadding = PaddingValues(horizontal = ThusoSpacing.space20, vertical = ThusoSpacing.space12)
    ) {
        if (icon != null) { Icon(icon, null, Modifier.size(20.dp)); Spacer(Modifier.width(ThusoSpacing.space12)) }
        Text(label, style = MaterialTheme.typography.labelLarge)
        Spacer(Modifier.width(ThusoSpacing.space8))
        Icon(Icons.AutoMirrored.Outlined.ArrowForward, null, Modifier.size(18.dp))
    }
}

/**
 * One box per digit, as the design asks. A single hidden field owns the text so autofill, paste and
 * TalkBack all still work; the boxes are a picture of what it holds. The boxes have a minimum height
 * rather than a fixed one, so a reader at the largest font scale gets a taller box instead of a
 * clipped digit.
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
            horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8),
            verticalAlignment = Alignment.CenterVertically
        ) {
            repeat(length) { index ->
                val active = focused && index == minOf(code.length, length - 1)
                Box(
                    Modifier.weight(1f).heightIn(min = 56.dp)
                        .background(Color.White, RoundedCornerShape(ThusoRadius.control))
                        .border(if (active || invalid) 2.dp else 1.dp, if (invalid) Danger else if (active) Indigo else Line, RoundedCornerShape(ThusoRadius.control))
                        .padding(vertical = ThusoSpacing.space16),
                    Alignment.Center
                ) {
                    Text(
                        code.getOrNull(index)?.toString() ?: " ",
                        style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = Ink
                    )
                }
            }
            if (code.length == length && !invalid) {
                Box(Modifier.size(32.dp).background(Indigo, CircleShape), Alignment.Center) {
                    Icon(Icons.Outlined.Check, null, tint = Color.White, modifier = Modifier.size(18.dp))
                }
            }
        }
    }
}
