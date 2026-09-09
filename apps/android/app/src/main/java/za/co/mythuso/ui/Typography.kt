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
 * The numbers themselves are not here. scripts/emit-tokens.mjs writes the scale into Tokens.kt as
 * ThusoType, alongside colour, radius and spacing, and this file spends them. It used to type them
 * out, which is how both native apps came to reach past the top of the scale for a 22 that the
 * contract did not have — a step nobody can find is a step everybody invents. It has one now.
 *
 * Line heights are the scale's own, not multipliers: at the largest font scales a ratio computed
 * from a size the reader has already enlarged compounds, and rows built for it clip. Tracking is
 * negative on the two display sizes and zero everywhere else, which is what stops a large heading in
 * a sans-serif from reading as a poster.
 */
private fun style(size: Int, height: Int, weight: FontWeight, tracking: Double = 0.0) =
    TextStyle(fontSize = size.sp, lineHeight = height.sp, fontWeight = weight, letterSpacing = tracking.sp)

/* Material's own roles, given the scale's numbers, so a composable that asks for
   `MaterialTheme.typography.titleMedium` and one that asks for a size get the same answer.
 *
 * NOTHING IS BOLD. docs/DESIGN-LANGUAGE.md is explicit about it — headings are regular or medium
 * weight and emphasis comes from size and from space — and the reason it matters here is that this
 * app used to set every heading at 700 and every title at 600, so a screen with four headings on it
 * had four separate claims on the reader's attention and no hierarchy at all. A 28 at 500 beside a
 * 15 at 400 is a bigger difference than a 28 at 700 beside a 15 at 600, because the second pair are
 * both shouting. It is also what makes the light 300 numeral the metric is set in read as a
 * deliberate weight rather than as a rendering accident. */
val ThusoTypography = Typography(
    displayLarge = style(32, 38, FontWeight.Medium, -0.6),
    displayMedium = style(32, 38, FontWeight.Medium, -0.6),
    displaySmall = style(32, 38, FontWeight.Medium, -0.6),
    headlineLarge = style(28, 34, FontWeight.Medium, -0.4),
    headlineMedium = style(28, 34, FontWeight.Medium, -0.4),
    headlineSmall = style(28, 34, FontWeight.Medium, -0.4),
    titleLarge = style(18, 24, FontWeight.Medium, -0.1),
    titleMedium = style(16, 22, FontWeight.Medium),
    titleSmall = style(15, 21, FontWeight.Medium),
    bodyLarge = style(16, 24, FontWeight.Normal),
    bodyMedium = style(15, 22, FontWeight.Normal),
    bodySmall = style(13, 19, FontWeight.Normal),
    labelLarge = style(15, 20, FontWeight.SemiBold),
    labelMedium = style(13, 18, FontWeight.SemiBold),
    /* Bottom-bar labels, chart axes and unread counts land here, and they are the strings the token
       file's note is about: this is 13 rather than Material's 11 because it is the floor. */
    labelSmall = style(13, 16, FontWeight.SemiBold)
)
