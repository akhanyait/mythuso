package za.co.mythuso.ui

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/* The type scale.
 *
 * Six sizes, and nothing between them. Before this file the app had twenty-one — 9, 9.5, 10, 10.5,
 * 11, 11.5, 12, 12.5, 13, 13.5, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24, 26 — typed at each call
 * site. Twenty-one sizes is not a hierarchy; it is an absence of one, because when the difference
 * between a heading and the caption under it is a point and a half the reader cannot tell which is
 * which and simply reads everything. The scale below is the one in packages/design-tokens/tokens.json
 * under `typography.scale`, and the sizes are load-bearing: `caption` is also the floor, because that
 * file sets `minimumRendered` to the caption size deliberately so that the two cannot disagree.
 * Eighty-one strings on these screens used to sit below it.
 *
 * These numbers are typed here rather than generated because scripts/emit-tokens.mjs writes colour,
 * radius and spacing into Tokens.kt and stops there — the type scale reaches CSS and no further. The
 * generator should own them, and until it does this file is the one place on Android that says them.
 *
 * Line heights are the scale's own, not multipliers: at the largest font scales a ratio computed
 * from a size the reader has already enlarged compounds, and rows built for it clip. Tracking is
 * negative on the two display sizes and zero everywhere else, which is what stops a large heading in
 * a sans-serif from reading as a poster.
 */
object ThusoType {
    val metric = 32.sp
    val screenTitle = 28.sp
    val sectionTitle = 18.sp
    val cardTitle = 16.sp
    val body = 15.sp
    val caption = 13.sp
}

private fun style(size: Int, height: Int, weight: FontWeight, tracking: Double = 0.0) =
    TextStyle(fontSize = size.sp, lineHeight = height.sp, fontWeight = weight, letterSpacing = tracking.sp)

/* Material's own roles, given the scale's numbers, so a composable that asks for
   `MaterialTheme.typography.titleMedium` and one that asks for a size get the same answer. */
val ThusoTypography = Typography(
    displayLarge = style(32, 38, FontWeight.Bold, -0.6),
    displayMedium = style(32, 38, FontWeight.Bold, -0.6),
    displaySmall = style(32, 38, FontWeight.Bold, -0.6),
    headlineLarge = style(28, 34, FontWeight.Bold, -0.4),
    headlineMedium = style(28, 34, FontWeight.Bold, -0.4),
    headlineSmall = style(28, 34, FontWeight.Bold, -0.4),
    titleLarge = style(18, 24, FontWeight.SemiBold, -0.1),
    titleMedium = style(16, 22, FontWeight.SemiBold),
    titleSmall = style(15, 21, FontWeight.SemiBold),
    bodyLarge = style(16, 24, FontWeight.Normal),
    bodyMedium = style(15, 22, FontWeight.Normal),
    bodySmall = style(13, 19, FontWeight.Normal),
    labelLarge = style(15, 20, FontWeight.SemiBold),
    labelMedium = style(13, 18, FontWeight.SemiBold),
    /* Bottom-bar labels, chart axes and unread counts land here, and they are the strings the token
       file's note is about: this is 13 rather than Material's 11 because it is the floor. */
    labelSmall = style(13, 16, FontWeight.SemiBold)
)
