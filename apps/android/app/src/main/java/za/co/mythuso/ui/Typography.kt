@file:OptIn(androidx.compose.ui.text.ExperimentalTextApi::class)

package za.co.mythuso.ui

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import za.co.mythuso.R

/* The type scale, and — since 28 September 2026 — the two faces it is set in.
 *
 * Six sizes, and nothing between them. Before this file the app had twenty-one — 9, 9.5, 10, 10.5,
 * 11, 11.5, 12, 12.5, 13, 13.5, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24, 26 — typed at each call
 * site. Twenty-one sizes is not a hierarchy; it is an absence of one, because when the difference
 * between a heading and the caption under it is a point and a half the reader cannot tell which is
 * which and simply reads everything. The scale below is the one in packages/design-tokens/tokens.json
 * under `typography.scale`, and the sizes are load-bearing: `caption` is also the floor, because that
 * file sets `minimumRendered` to the caption size deliberately so that the two cannot disagree.
 *
 * The numbers themselves are not here. scripts/emit-tokens.mjs writes the scale into Tokens.kt as
 * ThusoType, alongside colour, radius and spacing, and this file spends them.
 *
 * TWO FACES, FROM THE HANDOFF. tokens.json#typography.families names Outfit for page titles and
 * compact feature headings and Figtree for everything a person has to read carefully, and the
 * Founder decided on 28 September that the handoff's look wins. The two files under res/font are the
 * variable masters from the OFL sources (github.com/google/fonts, ofl/outfit and ofl/figtree), byte
 * for byte, with the SIL Open Font License beside them under assets/fonts — a face ships with its
 * licence or it does not ship. They are variable rather than five static cuts because a variable file
 * is one file to hold to a hash, and the weight axis is asked for by name below at exactly the weights
 * the web self-hosts: Outfit 500–700, Figtree 400–800. Nothing else in the app names a font file.
 *
 * WEIGHT, SINCE THE HANDOFF. The note that used to sit here said nothing was bold, and it was right
 * about Roboto: a 28 at 700 beside a 15 at 600 is two things shouting. Outfit at 600 is what the
 * handoff sets its titles in (ui.css: card title 600, metric 600), and a display face carries that
 * weight without shouting, so the display roles take it; body stays regular and a label is 600, as
 * every button, tab, badge and field label on the web is.
 *
 * Line heights are the scale's own, not multipliers: at the largest font scales a ratio computed
 * from a size the reader has already enlarged compounds, and rows built for it clip. Tracking is
 * negative on the two display sizes and zero everywhere else, which is what stops a large heading in
 * a sans-serif from reading as a poster. */

/* Outfit, the display face: the three weights the web declares (500 700), each a named instance of
   the variable file's weight axis. */
val OutfitFamily = FontFamily(
    Font(R.font.outfit_variable, FontWeight.Medium, variationSettings = FontVariation.Settings(FontVariation.weight(500))),
    Font(R.font.outfit_variable, FontWeight.SemiBold, variationSettings = FontVariation.Settings(FontVariation.weight(600))),
    Font(R.font.outfit_variable, FontWeight.Bold, variationSettings = FontVariation.Settings(FontVariation.weight(700)))
)

/* Figtree, the text face: the five weights the web declares (400 800). */
val FigtreeFamily = FontFamily(
    Font(R.font.figtree_variable, FontWeight.Normal, variationSettings = FontVariation.Settings(FontVariation.weight(400))),
    Font(R.font.figtree_variable, FontWeight.Medium, variationSettings = FontVariation.Settings(FontVariation.weight(500))),
    Font(R.font.figtree_variable, FontWeight.SemiBold, variationSettings = FontVariation.Settings(FontVariation.weight(600))),
    Font(R.font.figtree_variable, FontWeight.Bold, variationSettings = FontVariation.Settings(FontVariation.weight(700))),
    Font(R.font.figtree_variable, FontWeight.ExtraBold, variationSettings = FontVariation.Settings(FontVariation.weight(800)))
)

private fun display(size: Int, height: Int, weight: FontWeight = FontWeight.SemiBold, tracking: Double = 0.0) =
    TextStyle(fontFamily = OutfitFamily, fontSize = size.sp, lineHeight = height.sp, fontWeight = weight, letterSpacing = tracking.sp)

private fun text(size: Int, height: Int, weight: FontWeight = FontWeight.Normal, tracking: Double = 0.0) =
    TextStyle(fontFamily = FigtreeFamily, fontSize = size.sp, lineHeight = height.sp, fontWeight = weight, letterSpacing = tracking.sp)

/* Material's own roles, given the scale's numbers and the two faces, so a composable that asks for
   `MaterialTheme.typography.titleMedium` and one that asks for a size get the same answer. The
   display and headline roles and the card title (titleLarge, 18 — ui.css's .ui-card__title) are
   Outfit; every title a person reads inside a card, every body and every label is Figtree. */
val ThusoTypography = Typography(
    displayLarge = display(32, 38, tracking = -0.6),
    displayMedium = display(32, 38, tracking = -0.6),
    displaySmall = display(32, 38, tracking = -0.6),
    headlineLarge = display(28, 34, tracking = -0.4),
    headlineMedium = display(28, 34, tracking = -0.4),
    headlineSmall = display(28, 34, tracking = -0.4),
    titleLarge = display(18, 24, tracking = -0.1),
    titleMedium = text(16, 22, FontWeight.SemiBold),
    titleSmall = text(15, 21, FontWeight.SemiBold),
    bodyLarge = text(16, 24),
    bodyMedium = text(15, 22),
    bodySmall = text(13, 19),
    labelLarge = text(15, 20, FontWeight.SemiBold),
    labelMedium = text(13, 18, FontWeight.SemiBold),
    /* Bottom-bar labels, chart axes and unread counts land here, and they are the strings the token
       file's note is about: this is 13 rather than Material's 11 because it is the floor. */
    labelSmall = text(13, 16, FontWeight.SemiBold)
)

/* The metric figure, as ui.css draws it: the display face at the scale's `metric` step, 600, on
   tabular figures so a column of readings lines up on the decimal. Named once here so a metric card,
   a figure on a panel and a chart's latest reading are the same object at three sites. */
val ThusoMetricStyle = TextStyle(
    fontFamily = OutfitFamily, fontSize = ThusoType.metric, lineHeight = ThusoType.metric * 1.15f,
    fontWeight = FontWeight.SemiBold, fontFeatureSettings = "tnum"
)
