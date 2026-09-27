package za.co.mythuso.model

import androidx.compose.ui.graphics.Color

/* A care tip, and the two sentences the screen fills in.
 *
 * The tips themselves are CareTipsData.kt, generated from packages/catalog/care-tips.json; this file
 * holds only their shape and the template filling, so nothing here can hold a word of advice. The
 * fill and the ink are the design tokens the contract names, resolved by the generator, so a card's
 * text is always on a pair tokens.json#contrast measures. */

data class CareTip(
    val id: String,
    val category: String,
    val tag: String,
    val title: String,
    val body: String,
    val fill: Color,
    val ink: Color,
    /** The one dark card — when to call — takes its chip and its drawing in lime rather than white. */
    val dark: Boolean
)

object CareTips {
    val all: List<CareTip> get() = CareTipsData.tips

    private fun fill(template: String, values: Map<String, String>) =
        values.entries.fold(template) { text, (key, value) -> text.replace("{$key}", value) }

    fun counter(index: Int) = fill(CareTipsData.Screen.counter, mapOf("n" to "${index + 1}", "total" to "${all.size}"))
    fun jumpLabel(index: Int) = fill(CareTipsData.Screen.jumpLabel, mapOf("n" to "${index + 1}", "title" to all[index].title))
    /** The next two, and only while there are two left: the stack thins as it is read. */
    fun behind(index: Int): List<CareTip> = all.drop(index + 1).take(2)
}
