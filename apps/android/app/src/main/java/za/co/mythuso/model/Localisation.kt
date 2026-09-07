package za.co.mythuso.model

/**
 * What is left of localisation once the table stopped being typed by hand.
 *
 * ThusoLocale, Phrase, the table itself and clinicalLocale() are generated into LocalisationData.kt
 * from packages/catalog/locales.json. Three things stayed here because they are decisions rather
 * than data: the identity check digit, the shape of a hero slide, and which key each slide reads.
 */

/**
 * South African ID numbers carry a Luhn check digit, so the preview can show a real
 * "that doesn't look right" state without sending anything anywhere.
 */
fun validateSaId(value: String): Pair<Boolean, String> {
    val digits = value.filter { it.isDigit() }
    if (digits.length != 13) return false to "A South African ID number has 13 digits."
    val numbers = digits.map { it - '0' }
    val month = numbers[2] * 10 + numbers[3]
    val day = numbers[4] * 10 + numbers[5]
    if (month !in 1..12 || day !in 1..31) return false to "The date of birth in this number is not valid."
    var sum = 0
    for (index in 0 until 13) {
        var digit = numbers[12 - index]
        if (index % 2 == 1) { digit *= 2; if (digit > 9) digit -= 9 }
        sum += digit
    }
    if (sum % 10 != 0) return false to "That number fails its check digit. Please re-enter it."
    val yy = numbers[0] * 10 + numbers[1]
    val year = if (yy > 25) 1900 + yy else 2000 + yy
    return true to "Checks out. Date of birth %02d/%02d/%d.".format(day, month, year)
}

/**
 * Hero banner copy. The words come out of the generated table like every other string, so a slide
 * cannot be added in one language and forgotten in the others — and a locale that does not carry
 * the hero set falls back to English one string at a time rather than by a `when` nobody updated.
 */
data class HeroSlideCopy(
    val id: String, val title: String, val body: String, val cta: String,
    val trust: List<String>, val caption: String, val art: String, val banner: String, val symbols: List<String>
)
fun heroSlides(locale: ThusoLocale): List<HeroSlideCopy> {
    val art = listOf("Family", "Elder", "Nurse")
    val banners = listOf("care_that_comes_to_you", "one_safe_place", "feel_better")
    val symbols = listOf(
        listOf("house", "checkmark.shield", "person.2"),
        listOf("checkmark.shield", "person.2", "sparkles"),
        listOf("checkmark.shield", "heart", "stethoscope")
    )
    val keys = listOf(
        listOf(Phrase.SLIDE1_TITLE, Phrase.SLIDE1_BODY, Phrase.SLIDE1_CTA, Phrase.SLIDE1_TRUST1, Phrase.SLIDE1_TRUST2, Phrase.SLIDE1_TRUST3, Phrase.SLIDE1_CAPTION),
        listOf(Phrase.SLIDE2_TITLE, Phrase.SLIDE2_BODY, Phrase.SLIDE2_CTA, Phrase.SLIDE2_TRUST1, Phrase.SLIDE2_TRUST2, Phrase.SLIDE2_TRUST3, Phrase.SLIDE2_CAPTION),
        listOf(Phrase.SLIDE3_TITLE, Phrase.SLIDE3_BODY, Phrase.SLIDE3_CTA, Phrase.SLIDE3_TRUST1, Phrase.SLIDE3_TRUST2, Phrase.SLIDE3_TRUST3, Phrase.SLIDE3_CAPTION)
    )
    return keys.mapIndexed { index, slide ->
        HeroSlideCopy(
            art[index], thuso(slide[0], locale), thuso(slide[1], locale), thuso(slide[2], locale),
            listOf(thuso(slide[3], locale), thuso(slide[4], locale), thuso(slide[5], locale)),
            thuso(slide[6], locale), art[index], banners[index], symbols[index]
        )
    }
}
