package za.co.mythuso.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import za.co.mythuso.ui.components.ThusoButton
import za.co.mythuso.ui.components.ThusoButtonSize

/* The palette is generated into Tokens.kt from packages/design-tokens/tokens.json, so a colour is
   converted from hex once, by a machine, rather than three times by hand. Generation four — the
   Lovable handoff of 28 September 2026 — arrives there as ThusoSemantic.Light and .Dark: nineteen
   roles, each in two values. This file is where a screen reads them from, and it reads them through
   one object so that light and dark are a matter of which object is provided, never of a screen
   asking which mode it is in. */

/* One tap target, one number. WCAG 2.2 puts the AAA figure at 44x44 and the token file holds this
   design to it, because it is a health app operated one-handed on a doorstep. Android's own floor
   is 48, so that is the figure every control here is held to. */
val TouchTarget = 48.dp

/* Material's button is a pill and this design system's is an 8dp rectangle — the handoff's --r-md,
   and three platforms drawing the same button three shapes is the kind of drift the token file
   exists to stop. Buttons cannot take their shape from the theme in material3 1.3, so every button
   is passed this. */
val ThusoButtonShape = RoundedCornerShape(ThusoRadius.control)

/* THE ROLES A SCREEN READS, AND THE FOUR INKS ui.css ADDS TO THEM.
 *
 * The nineteen are the handoff's. The four inks are the web's departures, made here for the same
 * measured reasons (apps/web/src/ui/ui.css, "Inks that change with the ground"): on a light ground
 * the handoff's orange (danger, coral), lime (warning, highlight) and green (success, info, accent)
 * are fills and marks and cannot carry words — tokens.json#contrast.knownFailures parks the orange at
 * 2.99:1 and the lime at 1.21:1 on white, and the green clears only the 3:1 non-text floor. So a
 * component that needs one of them as words spends the ink the knownFailures row names: the build's
 * refusal red (danger), the warning brown (mangoInk) and the teal ink measured as "a value in range".
 * On a dark ground every one of them reads, so the ink is the handoff's own colour. The same for
 * primary as words, whose dark value measures 3.87:1 on a muted panel; its row names the dark accent.
 *
 * `pressMix` is the one difference between how a filled button darkens on a press: on light the fill
 * is mixed towards transparent, which lightens it; on dark towards the foreground, which lightens it
 * too and keeps the words above 4.5:1 — the dark primary at 90% under its dark words measured 4.46. */
@Immutable
data class ThusoPalette(
    val dark: Boolean,
    val background: Color,
    val foreground: Color,
    val surface: Color,
    val surfaceRaised: Color,
    val primary: Color,
    val primaryForeground: Color,
    val accent: Color,
    val accentForeground: Color,
    val muted: Color,
    val mutedForeground: Color,
    val success: Color,
    val warning: Color,
    val danger: Color,
    val info: Color,
    val highlight: Color,
    val coral: Color,
    val border: Color,
    val input: Color,
    val ring: Color,
    val dangerInk: Color,
    val warningInk: Color,
    val successInk: Color,
    val primaryInk: Color,
    val pressMix: Color
)

val LightPalette = ThusoPalette(
    dark = false,
    background = ThusoSemantic.Light.background, foreground = ThusoSemantic.Light.foreground,
    surface = ThusoSemantic.Light.surface, surfaceRaised = ThusoSemantic.Light.surfaceRaised,
    primary = ThusoSemantic.Light.primary, primaryForeground = ThusoSemantic.Light.primaryForeground,
    accent = ThusoSemantic.Light.accent, accentForeground = ThusoSemantic.Light.accentForeground,
    muted = ThusoSemantic.Light.muted, mutedForeground = ThusoSemantic.Light.mutedForeground,
    success = ThusoSemantic.Light.success, warning = ThusoSemantic.Light.warning, danger = ThusoSemantic.Light.danger,
    info = ThusoSemantic.Light.info, highlight = ThusoSemantic.Light.highlight, coral = ThusoSemantic.Light.coral,
    border = ThusoSemantic.Light.border, input = ThusoSemantic.Light.input, ring = ThusoSemantic.Light.ring,
    dangerInk = Danger, warningInk = MangoInk, successInk = TealInk, primaryInk = ThusoSemantic.Light.primary,
    pressMix = Color.Transparent
)

val DarkPalette = ThusoPalette(
    dark = true,
    background = ThusoSemantic.Dark.background, foreground = ThusoSemantic.Dark.foreground,
    surface = ThusoSemantic.Dark.surface, surfaceRaised = ThusoSemantic.Dark.surfaceRaised,
    primary = ThusoSemantic.Dark.primary, primaryForeground = ThusoSemantic.Dark.primaryForeground,
    accent = ThusoSemantic.Dark.accent, accentForeground = ThusoSemantic.Dark.accentForeground,
    muted = ThusoSemantic.Dark.muted, mutedForeground = ThusoSemantic.Dark.mutedForeground,
    success = ThusoSemantic.Dark.success, warning = ThusoSemantic.Dark.warning, danger = ThusoSemantic.Dark.danger,
    info = ThusoSemantic.Dark.info, highlight = ThusoSemantic.Dark.highlight, coral = ThusoSemantic.Dark.coral,
    border = ThusoSemantic.Dark.border, input = ThusoSemantic.Dark.input, ring = ThusoSemantic.Dark.ring,
    dangerInk = ThusoSemantic.Dark.danger, warningInk = ThusoSemantic.Dark.warning, successInk = ThusoSemantic.Dark.success,
    primaryInk = ThusoSemantic.Dark.accent,
    pressMix = ThusoSemantic.Dark.foreground
)

val LocalThusoPalette = staticCompositionLocalOf { LightPalette }

/** The palette in force: `theme.primary`, `theme.border`. Light or dark is decided once, in ThusoTheme. */
val theme: ThusoPalette
    @Composable @ReadOnlyComposable get() = LocalThusoPalette.current

/* The web mixes a fill with transparent or the foreground at a percentage (color-mix in oklab); the
   nearest thing Compose has that needs no library is an alpha over the ground, which is what a tint
   of the accent at 15% on a card is. `tint` is that: the colour at the fraction, over whatever it sits
   on. For a press the web mixes the fill at 90% with the press mix; here the fill is composited over
   the mix's own alpha, which reads the same on both grounds. */
fun Color.tint(fraction: Float): Color = copy(alpha = fraction)
fun ThusoPalette.pressed(fill: Color, keep: Float): Color =
    if (pressMix == Color.Transparent) fill.copy(alpha = keep) else pressMix.copy(alpha = 1f - keep).compositeOver(fill)

/* The scheme, mapped from the handoff's roles so Material's own controls — a switch, a checkbox, a
 * radio, a text field's cursor, a filter chip — take the identity without each being told.
 *
 * PRIMARY IS THE HANDOFF'S PRIMARY: the deep ink on light and the green on dark, as theme.css has
 * them. Material reads `primary` for a text field's cursor and focused border, a switch's track, a
 * checkbox's box and a progress indicator, and the ink clears every one of those on the light ground
 * — which is why the accent is not the primary here either: the green measures 3.64:1 on white, a
 * mark but not a word. Every pair below is one tokens.json#contrast lists or parks with a measured
 * replacement; nothing here is a ratio anybody guessed.
 *
 * The one decision light and dark share is `isSystemInDarkTheme()`: the phone's setting, read once
 * at the root. No screen asks it again. */
@Composable fun ThusoTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    val palette = if (dark) DarkPalette else LightPalette
    val scheme = if (dark) darkColorScheme(
        primary = palette.primary, onPrimary = palette.primaryForeground,
        primaryContainer = palette.muted, onPrimaryContainer = palette.foreground,
        secondary = palette.accent, onSecondary = palette.accentForeground,
        secondaryContainer = palette.muted, onSecondaryContainer = palette.foreground,
        tertiary = palette.accent, onTertiary = palette.accentForeground,
        tertiaryContainer = palette.muted, onTertiaryContainer = palette.foreground,
        background = palette.background, onBackground = palette.foreground,
        surface = palette.surface, onSurface = palette.foreground,
        surfaceVariant = palette.surfaceRaised, onSurfaceVariant = palette.mutedForeground,
        surfaceContainer = palette.surfaceRaised, surfaceContainerHigh = palette.surfaceRaised, surfaceContainerHighest = palette.muted,
        surfaceContainerLow = palette.surface, surfaceContainerLowest = palette.background,
        outline = palette.mutedForeground, outlineVariant = palette.border,
        error = palette.dangerInk, onError = palette.background, errorContainer = palette.muted, onErrorContainer = palette.dangerInk
    ) else lightColorScheme(
        primary = palette.primary, onPrimary = palette.primaryForeground,
        primaryContainer = palette.muted, onPrimaryContainer = palette.foreground,
        secondary = palette.accent, onSecondary = palette.accentForeground,
        secondaryContainer = palette.muted, onSecondaryContainer = palette.foreground,
        tertiary = palette.accent, tertiaryContainer = palette.muted, onTertiaryContainer = palette.foreground,
        background = palette.background, onBackground = palette.foreground,
        surface = palette.surface, onSurface = palette.foreground,
        surfaceVariant = palette.surfaceRaised, onSurfaceVariant = palette.mutedForeground,
        surfaceContainer = palette.surfaceRaised, surfaceContainerHigh = palette.surfaceRaised, surfaceContainerHighest = palette.muted,
        surfaceContainerLow = palette.surface, surfaceContainerLowest = palette.surface,
        outline = palette.mutedForeground, outlineVariant = palette.border,
        error = palette.dangerInk, onError = palette.surface, errorContainer = palette.muted, onErrorContainer = palette.dangerInk
    )
    CompositionLocalProvider(
        LocalThusoPalette provides palette,
        LocalSecondaryText provides palette.mutedForeground
    ) {
        MaterialTheme(
            colorScheme = scheme,
            typography = ThusoTypography,
            /* Compact corners, the handoff's three: a card is lg, a control md, a chip sm. */
            shapes = Shapes(
                extraSmall = RoundedCornerShape(ThusoRadius.sm),
                small = RoundedCornerShape(ThusoRadius.control),
                medium = RoundedCornerShape(ThusoRadius.card),
                large = RoundedCornerShape(ThusoRadius.card),
                extraLarge = RoundedCornerShape(ThusoRadius.card)
            ),
            content = content
        )
    }
}

/* The two shadows tokens.json#elevation declares — the handoff's sm and md — as Compose elevations
   coloured with the foreground, which is what "0 1px 2px rgba(2,34,53,.06)" is: the ink, faint. */
@Composable fun Modifier.cardShadow(shape: androidx.compose.ui.graphics.Shape): Modifier =
    shadow(1.dp, shape, ambientColor = theme.foreground.tint(0.06f), spotColor = theme.foreground.tint(0.06f))
@Composable fun Modifier.raisedShadow(shape: androidx.compose.ui.graphics.Shape): Modifier =
    shadow(8.dp, shape, ambientColor = theme.foreground.tint(0.10f), spotColor = theme.foreground.tint(0.10f))

/* Three card weights, and the reason there are three.
 *
 * Every card on every screen used to be the same object: white, an 18dp radius, a hairline border
 * and a one-point shadow. A screen of eleven of those has no hierarchy at all — a person opening it
 * has to read all eleven to find out which one they came for. So:
 *
 *   CareCard   — the default, and the quiet one: the handoff's Card. A border, the card shadow.
 *   LeadCard   — one per screen at most: the thing the screen is for. The handoff's elevated card,
 *                lifted by the raised shadow rather than by a colour, so lifting it spends no accent.
 *   TonedCard  — the muted panel, no border, for material that has to be present and must not
 *                compete: a note, a disclosure, a refusal.
 *
 * Radius comes from the token file rather than the 18dp that was typed at each site — 12 is what
 * `radius.card` says, and the difference between the two is most of what "rounded" looked like. */
@Composable fun CareCard(modifier: Modifier = Modifier, padding: Dp = ThusoSpacing.space16, content: @Composable ColumnScope.() -> Unit) {
    val shape = RoundedCornerShape(ThusoRadius.card)
    Card(
        modifier.fillMaxWidth().cardShadow(shape), shape = shape,
        colors = CardDefaults.cardColors(containerColor = theme.surface, contentColor = theme.foreground),
        border = BorderStroke(1.dp, theme.border),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) { Column(Modifier.padding(padding), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12), content = content) }
}

/* The lead card is the handoff's elevated card: white like every other card, raised by the second of
   the two shadows the tokens declare and by nothing else. It was a tinted panel, and before that a
   shadowed one; the identity spends colour on action, selection and progress and not on the fact
   that one card matters more, which is what a shadow says quietly. */
@Composable fun LeadCard(modifier: Modifier = Modifier, padding: Dp = ThusoSpacing.space20, content: @Composable ColumnScope.() -> Unit) {
    val shape = RoundedCornerShape(ThusoRadius.card)
    Card(
        modifier.fillMaxWidth().raisedShadow(shape), shape = shape,
        colors = CardDefaults.cardColors(containerColor = theme.surface, contentColor = theme.foreground),
        border = BorderStroke(1.dp, theme.border),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) {
        Column(Modifier.padding(padding), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12), content = content)
    }
}

/* A recessed panel rather than a tinted one: the handoff's muted, which carries the foreground and
   the muted foreground on both grounds. A caller that means a warning or a refusal passes a tint of
   that colour; the words on it stay the foreground. */
@Composable fun TonedCard(
    modifier: Modifier = Modifier,
    background: Color = theme.muted,
    padding: Dp = ThusoSpacing.space16,
    content: @Composable ColumnScope.() -> Unit
) {
    Column(
        modifier.fillMaxWidth().background(background, RoundedCornerShape(ThusoRadius.card)).padding(padding),
        verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space8), content = content
    )
}

/* The screen's own title, announced as a heading so TalkBack's heading navigation has somewhere to
   land. The eyebrow is the caption size in the muted ink: it names a category, it is not an action. */
@Composable fun Heading(eyebrow: String, title: String, subtitle: String) {
    Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
        if (eyebrow.isNotEmpty()) Text(
            eyebrow.uppercase(), style = MaterialTheme.typography.labelSmall,
            letterSpacing = 0.8.sp, color = theme.mutedForeground
        )
        Text(
            title, style = MaterialTheme.typography.headlineSmall, color = theme.foreground,
            modifier = Modifier.semantics { heading() }
        )
        if (subtitle.isNotEmpty()) Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = theme.mutedForeground)
    }
}

/* A section title and, optionally, the one action that belongs to it. Related things close: the
   header sits 12dp above its own content and 24dp below whatever came before, which is the whole of
   what makes a long screen readable. The action is the handoff's ghost button, small. */
@Composable fun SectionHeader(title: String, action: String? = null, onAction: (() -> Unit)? = null) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(
            title, style = MaterialTheme.typography.titleLarge, color = theme.foreground,
            modifier = Modifier.weight(1f).semantics { heading() }
        )
        if (action != null && onAction != null) ThusoButton(
            action, onClick = onAction, variant = za.co.mythuso.ui.components.ThusoButtonVariant.Ghost, size = ThusoButtonSize.Sm,
            trailingIcon = Icons.AutoMirrored.Outlined.ArrowForward, modifier = Modifier.widthIn(max = 200.dp)
        )
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
        Box(Modifier.size(6.dp).background(theme.primary, CircleShape))
        Text("Design preview · Fictional data", style = MaterialTheme.typography.labelMedium, color = theme.mutedForeground)
    }
}

/* A soft tinted square holding a symbol: the handoff's tile — the accent at 15% under the foreground,
   which is the pd-tile the web's home draws. An accent is passed by name only where a tile genuinely
   leads something; the default is what every row gets, so the default is quiet. */
@Composable fun TileIcon(icon: ImageVector, tint: Color = theme.foreground, background: Color = theme.accent.tint(0.15f), size: Dp = 40.dp) {
    Box(Modifier.size(size).background(background, RoundedCornerShape(ThusoRadius.tile)), Alignment.Center) {
        Icon(icon, null, tint = tint, modifier = Modifier.size(size * 0.5f))
    }
}

/* The tone is what the pill means, and each pair is the handoff's Badge (ui.css, "Badge") on the
   inks measured for it: teal is the success badge, amber the warning badge, sky the primary badge,
   danger the danger badge, quiet the neutral one. Every badge says its word; the colour is never the
   only difference. "light" is the one that sits on a filled primary — a badge on the primary's own
   foreground at a fifth. */
@Composable fun StatusPill(text: String, tone: String = "teal") {
    val (bg, fg) = when (tone) {
        "teal" -> theme.success.tint(0.15f) to theme.foreground
        "amber" -> theme.warning.tint(0.20f) to theme.foreground
        "sky" -> theme.primary.tint(0.10f) to theme.primaryInk
        /* A refusal is not a warning. Vetting needs a pill that says so without shouting. */
        "danger" -> theme.danger.tint(0.12f) to theme.dangerInk
        "quiet" -> theme.muted to theme.mutedForeground
        "light" -> theme.primaryForeground.tint(0.20f) to theme.primaryForeground
        else -> theme.surface to theme.foreground
    }
    /* Wraps rather than clips: at twice the type beside a 40% rail, "Confirmed" cut at the card's edge
       was worse than a pill two lines tall. */
    Text(
        text, style = MaterialTheme.typography.labelSmall, color = fg,
        modifier = Modifier
            .background(bg, RoundedCornerShape(ThusoRadius.pill))
            .then(if (tone == "teal" || tone == "amber" || tone == "sky" || tone == "danger" || tone == "light" || tone == "quiet") Modifier else Modifier.border(1.dp, theme.border, RoundedCornerShape(ThusoRadius.pill)))
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
        Text("Step $step of $total", style = MaterialTheme.typography.labelMedium, color = theme.primaryInk)
        Text(label, style = MaterialTheme.typography.bodySmall, color = theme.mutedForeground, modifier = Modifier.weight(1f))
        Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space4), verticalAlignment = Alignment.CenterVertically) {
            (1..total).forEach { index ->
                Box(
                    Modifier.width(if (index == step) 20.dp else 8.dp).height(8.dp)
                        .background(if (index <= step) theme.primary else theme.border, CircleShape)
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
        headlineContent = { Text(title, style = MaterialTheme.typography.titleSmall, color = if (danger) theme.dangerInk else theme.foreground) },
        supportingContent = if (subtitle.isEmpty()) null else ({
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = LocalSecondaryText.current)
        }),
        leadingContent = if (!roomy) null else ({
            TileIcon(icon, if (danger) theme.dangerInk else theme.foreground, if (danger) theme.danger.tint(0.12f) else theme.muted, 40.dp)
        }),
        trailingContent = if (danger || !roomy) null else ({
            Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null, tint = theme.mutedForeground)
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
        headlineContent = { Text(name, style = MaterialTheme.typography.titleSmall, color = theme.foreground) },
        supportingContent = if (detail.isEmpty()) null else ({
            Text(detail, style = MaterialTheme.typography.bodySmall, color = theme.mutedForeground)
        }),
        leadingContent = {
            Image(
                portrait, null,
                Modifier.size(40.dp).clip(CircleShape).background(theme.muted, CircleShape),
                contentScale = ContentScale.Crop
            )
        },
        trailingContent = { Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null, tint = theme.mutedForeground) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier
            .clip(RoundedCornerShape(ThusoRadius.control))
            .clickable(onClick = click)
            .heightIn(min = TouchTarget)
            .semantics(mergeDescendants = true) {}
    )
}

/* A row of text you can open — and the app's most repeated shape, so it is the one that carries the
   language. It is the handoff's NavigationItem: compact md corners, the muted fill, the foreground for
   the words and a chevron at the trailing edge. It was a fully round pill with a circular arrow, and
   the handoff's guidelines keep pills for badges, statuses and compact controls. The row grows with
   the type; nothing about it is a fixed height. */
@Composable fun PlainRow(title: String, subtitle: String = "", click: () -> Unit) {
    val shape = RoundedCornerShape(ThusoRadius.control)
    Row(
        Modifier.fillMaxWidth().heightIn(min = TouchTarget).clip(shape).background(theme.muted, shape)
            .clickable(onClick = click)
            .padding(start = ThusoSpacing.space12, end = ThusoSpacing.space8, top = ThusoSpacing.space8, bottom = ThusoSpacing.space8)
            .semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
            Text(title, style = MaterialTheme.typography.titleSmall, color = theme.foreground)
            if (subtitle.isNotEmpty()) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = theme.mutedForeground)
        }
        Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null, tint = theme.mutedForeground, modifier = Modifier.size(20.dp))
    }
}

/** The full-width primary action: the handoff's primary button at its large size, with the arrow
    that says it goes somewhere. One per screen, and it is the thing the screen is for. */
@Composable fun PrimaryAction(label: String, modifier: Modifier = Modifier, icon: ImageVector? = null, click: () -> Unit) {
    ThusoButton(
        label, onClick = click, modifier = modifier.fillMaxWidth(), size = ThusoButtonSize.Lg,
        leadingIcon = icon, trailingIcon = Icons.AutoMirrored.Outlined.ArrowForward
    )
}

/**
 * One box per digit, as the design asks. A single hidden field owns the text so autofill, paste and
 * TalkBack all still work; the boxes are a picture of what it holds. The boxes have a minimum height
 * rather than a fixed one, so a reader at the largest font scale gets a taller box instead of a
 * clipped digit. The resting edge is the muted ink and the active one the ring, as every field on
 * the identity is (ui.css, "Fields"); invalid is the danger ink, which a boundary can be seen in.
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
                        .background(theme.surface, RoundedCornerShape(ThusoRadius.control))
                        .border(if (active || invalid) 2.dp else 1.dp, if (invalid) theme.dangerInk else if (active) theme.ring else theme.mutedForeground, RoundedCornerShape(ThusoRadius.control))
                        .padding(vertical = ThusoSpacing.space16),
                    Alignment.Center
                ) {
                    Text(
                        code.getOrNull(index)?.toString() ?: " ",
                        style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = theme.foreground
                    )
                }
            }
            if (code.length == length && !invalid) {
                Box(Modifier.size(32.dp).background(theme.primary, CircleShape), Alignment.Center) {
                    Icon(Icons.Outlined.Check, null, tint = theme.primaryForeground, modifier = Modifier.size(18.dp))
                }
            }
        }
    }
}
