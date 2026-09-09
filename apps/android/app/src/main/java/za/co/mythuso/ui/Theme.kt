package za.co.mythuso.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.layout.ContentScale
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
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/* The palette is generated into Tokens.kt from packages/design-tokens/tokens.json, so a colour is
   converted from hex once, by a machine, rather than three times by hand. There is no local alias
   any more: this file used to declare `val Sage = TealSoft` for the band the clinical chart fills an
   in-range reading with, which was a reasonable name when the palette had no sage in it. The palette
   has four now — paleSage, softSage, mutedSage, sageSlate, all generated — and a hand-written fifth
   pointing at a teal is how a word stops meaning one thing. The chart fills the band with paleSage,
   which is the token that means what the name says. */

/* One tap target, one number. WCAG 2.2 puts the AAA figure at 44x44 and the token file holds this
   design to it, because it is a health app operated one-handed on a doorstep. */
val TouchTarget = 48.dp

/* Material's button is a pill and this design system's is a 10dp rectangle — styles.css gives
   .primary, .secondary and .ghost `border-radius: var(--r-control)`, and three platforms drawing the
   same button three shapes is the kind of drift the token file exists to stop. Buttons cannot take
   their shape from the theme in material3 1.3, so every button is passed this. */
val ThusoButtonShape = RoundedCornerShape(ThusoRadius.control)

/* The scheme, in the language docs/DESIGN-LANGUAGE.md describes.
 *
 * Charcoal is primary. That is the whole shift: a primary action, an active navigation pill and a
 * filled status chip are charcoal on this palette, and indigo — which used to be all three — is now
 * one accent among the semantic colours rather than the thing that carries the interface. Sage is a
 * fill and never a label, so it appears here only as a container, never as an `on-` colour.
 *
 * `mist` is the ground and white is the card, which is the inversion of what a light theme usually
 * does and is most of why the reference reads as calm: the page is the darker surface and the thing
 * you are meant to read is the lighter one.
 *
 * Every pair below is one packages/design-tokens/tokens.json declares and the build computes:
 * charcoal on mist 14.95, on surface 17.04, on cloud 13.53, on paleSage 11.11; surface on charcoal;
 * faint on mist and on cloud. Nothing here is a ratio anybody guessed. */
@Composable fun ThusoTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = Charcoal, onPrimary = SurfaceWhite,
            primaryContainer = PaleSage, onPrimaryContainer = Charcoal,
            secondary = Charcoal, onSecondary = SurfaceWhite,
            secondaryContainer = Cloud, onSecondaryContainer = Charcoal,
            tertiary = Charcoal, tertiaryContainer = PaleSage, onTertiaryContainer = Charcoal,
            background = Mist, surface = SurfaceWhite, onBackground = Charcoal, onSurface = Charcoal,
            surfaceVariant = Cloud, onSurfaceVariant = Faint,
            outline = Faint, outlineVariant = Stone, error = Danger
        ),
        typography = ThusoTypography,
        /* Generous, as the reference is: a card takes the panel radius rather than the card one, and
           the two smaller steps stay where they are so a chip and a field are not suddenly round. */
        shapes = Shapes(
            extraSmall = RoundedCornerShape(ThusoRadius.tile),
            small = RoundedCornerShape(ThusoRadius.control),
            medium = RoundedCornerShape(ThusoRadius.panel),
            large = RoundedCornerShape(ThusoRadius.panel),
            extraLarge = RoundedCornerShape(ThusoRadius.panel)
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
        modifier.fillMaxWidth(), shape = RoundedCornerShape(ThusoRadius.panel),
        colors = CardDefaults.cardColors(containerColor = SurfaceWhite),
        border = BorderStroke(1.dp, Stone),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) { Column(Modifier.padding(padding), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12), content = content) }
}

/* The lead card no longer lifts. It used to be separated from the ground by a 3dp shadow, which is
   the one thing this language does not do — and on a mist ground a shadow under a white card reads
   as a smudge rather than as height. It is separated by being the sage panel instead: charcoal on
   paleSage is 11.11:1, so the emphasis is a fill nobody pays for in legibility. */
@Composable fun LeadCard(modifier: Modifier = Modifier, padding: Dp = ThusoSpacing.space20, content: @Composable ColumnScope.() -> Unit) {
    Card(
        modifier.fillMaxWidth(), shape = RoundedCornerShape(ThusoRadius.panel),
        colors = CardDefaults.cardColors(containerColor = PaleSage),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) {
        androidx.compose.runtime.CompositionLocalProvider(LocalSecondaryText provides Charcoal) {
            Column(Modifier.padding(padding), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12), content = content)
        }
    }
}

/* A recessed panel rather than a tinted one. The default was indigoSoft, which put a blue wash
   behind every notice, every disclosure and every refusal in the app — colour spent on the fact
   that a paragraph exists. Cloud is the reference's own recessed fill and carries both charcoal and
   faint at ratios the token file declares. A caller that means a warning still passes mangoSoft. */
@Composable fun TonedCard(
    modifier: Modifier = Modifier,
    background: Color = Cloud,
    padding: Dp = ThusoSpacing.space16,
    content: @Composable ColumnScope.() -> Unit
) {
    Column(
        modifier.fillMaxWidth().background(background, RoundedCornerShape(ThusoRadius.panel)).padding(padding),
        verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space8), content = content
    )
}

/* The screen's own title, announced as a heading so TalkBack's heading navigation has somewhere to
   land. The eyebrow used to be 10sp bold with 1.4sp of tracking, which is a fashion rather than a
   label; at the caption size it is readable and still reads as a category. */
@Composable fun Heading(eyebrow: String, title: String, subtitle: String) {
    Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
        /* Faint rather than indigo. An eyebrow names a category; it is not an action, and colouring
           every one of them the brand colour is how a palette stops meaning anything. */
        if (eyebrow.isNotEmpty()) Text(
            eyebrow.uppercase(), style = MaterialTheme.typography.labelSmall,
            letterSpacing = 0.8.sp, color = Faint
        )
        Text(
            title, style = MaterialTheme.typography.headlineSmall, color = Charcoal,
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
            title, style = MaterialTheme.typography.titleLarge, color = Charcoal,
            modifier = Modifier.weight(1f).semantics { heading() }
        )
        if (action != null && onAction != null) TextButton(
            onClick = onAction,
            modifier = Modifier.heightIn(min = TouchTarget).widthIn(max = 180.dp),
            contentPadding = PaddingValues(horizontal = ThusoSpacing.space12, vertical = ThusoSpacing.space8)
        , shape = ThusoButtonShape) { Text(action, style = MaterialTheme.typography.labelMedium) }
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
        Box(Modifier.size(6.dp).background(Charcoal, CircleShape))
        Text("Design preview · Fictional data", style = MaterialTheme.typography.labelMedium, color = Faint)
    }
}

/* A soft tinted square holding a symbol. Cloud and charcoal by default, and an accent only when it
   means one — every row in the app used to carry an indigo tile on an indigo wash, which is colour
   spent on the fact that a row exists rather than on anything about it. */
@Composable fun TileIcon(icon: ImageVector, tint: Color = Charcoal, background: Color = Cloud, size: Dp = 40.dp) {
    Box(Modifier.size(size).background(background, RoundedCornerShape(ThusoRadius.tile)), Alignment.Center) {
        Icon(icon, null, tint = tint, modifier = Modifier.size(size * 0.5f))
    }
}

/* The tone is what the pill means, and each pair is one the token file has measured. "teal" had been
   falling through to the indigo default since the palette changed, so a reading in range was the
   same colour as the brand and the design's only word for "as it should be" had gone missing —
   tokens.json lists tealInk on tealSoft as "an accent label inside its own tint … a value in range",
   which is this pill and nothing else. */
@Composable fun StatusPill(text: String, tone: String = "teal") {
    val (bg, fg) = when (tone) {
        "teal" -> TealSoft to TealInk
        "amber" -> MangoSoft to MangoInk
        "sky" -> InfoSoft to Info
        /* A refusal is not a warning. Vetting needs a pill that says so without shouting. */
        "danger" -> DangerSoft to Danger
        "quiet" -> Cloud to Faint
        "light" -> Color.White.copy(alpha = 0.20f) to Color.White
        /* The default is the language's own chip: white, a stone hairline, charcoal on it. It was an
           indigo wash, which made the commonest state on every screen the loudest thing on it. */
        else -> SurfaceWhite to Charcoal
    }
    Text(
        text, style = MaterialTheme.typography.labelSmall, color = fg, maxLines = 1, softWrap = false,
        modifier = Modifier
            .background(bg, CircleShape)
            .then(if (tone == "teal" || tone == "amber" || tone == "sky" || tone == "danger" || tone == "light" || tone == "quiet") Modifier else Modifier.border(1.dp, Stone, CircleShape))
            .padding(horizontal = ThusoSpacing.space12, vertical = 4.dp)
    )
}

/* A title and the state of the thing it names.
 *
 * Beside each other while there is room, and stacked when there is not. At the largest font scales
 * "Confirmed" is two hundred points wide on a phone that has already given a hundred to the
 * navigation rail, and a pill that keeps its intrinsic width leaves a card title with sixty — which
 * Compose spends breaking "Vitals" across four lines. Capping the pill instead only moves the
 * problem into the pill, which then reads "Co / nfir / me / d". So above the title it goes, where it
 * has the whole width and the title has the whole width, and neither is broken to fit the other.
 *
 * 1.3 is where the two stop fitting on a 393dp phone, which is the phone this is built for. */
@Composable fun StatusHeader(
    status: String,
    tone: String,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit
) {
    val stacked = LocalDensity.current.fontScale >= 1.3f
    if (stacked) Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
        StatusPill(status, tone)
        Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4), content = content)
    } else Row(
        modifier.fillMaxWidth(), verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4), content = content)
        StatusPill(status, tone)
    }
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
                        .background(if (index <= step) Indigo else Stone, CircleShape)
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
    /* Both furniture columns go away once the reader has enlarged the type. A ListItem measures its
       leading and trailing content first and gives the headline what is left, so at the largest font
       scale a 40dp tile and a chevron between them took a third of a 393dp phone and "Payments" came
       out as "Paymen / ts" — a word broken in half to make room for a chevron that says nothing the
       row does not already say. 1.5 is where they stop fitting. */
    val roomy = LocalDensity.current.fontScale < 1.5f
    ListItem(
        headlineContent = { Text(title, style = MaterialTheme.typography.titleSmall, color = if (danger) Danger else Charcoal) },
        supportingContent = if (subtitle.isEmpty()) null else ({
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = LocalSecondaryText.current)
        }),
        /* Cloud and charcoal, not indigo on an indigo wash. Every row in the app carried the same
           tinted tile, which is a colour spent on the fact that a row exists rather than on anything
           about it; the accent is left for the rows that mean one — a refusal is still danger. */
        leadingContent = if (!roomy) null else ({
            TileIcon(icon, if (danger) Danger else Charcoal, if (danger) DangerSoft else Cloud, 40.dp)
        }),
        trailingContent = if (danger || !roomy) null else ({
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

/* A person, with a face. The generic silhouette MenuRow draws is right for "Add a family member"
   and wrong for a named human being: the illustrations are rendered into this bundle for all three
   apps and Android was drawing none of them, which is how one of them came to be sitting in the
   resources unused. */
@Composable fun PersonRow(name: String, detail: String, portrait: Painter, click: () -> Unit) {
    ListItem(
        headlineContent = { Text(name, style = MaterialTheme.typography.titleSmall, color = Charcoal) },
        supportingContent = if (detail.isEmpty()) null else ({
            Text(detail, style = MaterialTheme.typography.bodySmall, color = BodyText)
        }),
        leadingContent = {
            Image(
                portrait, null,
                Modifier.size(40.dp).clip(CircleShape).background(IndigoSoft, CircleShape),
                contentScale = ContentScale.Crop
            )
        },
        trailingContent = { Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null, tint = Faint) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier
            .clip(RoundedCornerShape(ThusoRadius.control))
            .clickable(onClick = click)
            .heightIn(min = TouchTarget)
            .semantics(mergeDescendants = true) {}
    )
}

/* A row of text you can open — and the app's most repeated shape, so it is the one that carries the
   language. It is the reference's navigation pill: a cloud fill, a fully round corner and a small
   circular arrow at the trailing edge, rather than a flat line of text with a chevron after it.
   The pill grows with the type; nothing about it is a fixed height. */
@Composable fun PlainRow(title: String, subtitle: String = "", click: () -> Unit) {
    val shape = RoundedCornerShape(ThusoRadius.pill)
    Row(
        Modifier.fillMaxWidth().heightIn(min = TouchTarget).clip(shape).background(Cloud, shape)
            .clickable(onClick = click)
            .padding(start = ThusoSpacing.space16, end = ThusoSpacing.space4, top = ThusoSpacing.space8, bottom = ThusoSpacing.space8)
            .semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
            Text(title, style = MaterialTheme.typography.titleSmall, color = Charcoal)
            if (subtitle.isNotEmpty()) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = Faint)
        }
        Box(Modifier.size(36.dp), Alignment.Center) {
            Icon(Icons.AutoMirrored.Outlined.ArrowForward, null, tint = Faint, modifier = Modifier.size(17.dp))
        }
    }
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
                        .border(if (active || invalid) 2.dp else 1.dp, if (invalid) Danger else if (active) Indigo else Stone, RoundedCornerShape(ThusoRadius.control))
                        .padding(vertical = ThusoSpacing.space16),
                    Alignment.Center
                ) {
                    Text(
                        code.getOrNull(index)?.toString() ?: " ",
                        style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = Charcoal
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
