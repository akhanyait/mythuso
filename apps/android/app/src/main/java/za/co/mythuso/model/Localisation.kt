package za.co.mythuso.model

/**
 * Localisation for the shell, navigation and primary calls to action.
 * Clinical wording stays in English until a South African clinical language review is complete —
 * a mistranslated instruction is a safety problem, not a polish problem.
 */
enum class ThusoLocale(val code: String, val native: String) {
    ENGLISH("en-ZA", "English"), ZULU("zu-ZA", "isiZulu"), SESOTHO("st-ZA", "Sesotho"), AFRIKAANS("af-ZA", "Afrikaans")
}
enum class Phrase { HOME, BOOK_CARE, VISITS, PASSPORT, MORE, GREETING, GREETING_SUB, TAGLINE, HERO_TITLE, HERO_BODY, HERO_TRUST, BOOK_NURSE, OPEN_PASSPORT, NEXT_VISIT, HELP_WITH, LANGUAGE, PREVIEW_BADGE }
private val english = mapOf(
    Phrase.HOME to "Home", Phrase.BOOK_CARE to "Book care", Phrase.VISITS to "Visits", Phrase.PASSPORT to "Passport", Phrase.MORE to "More",
    Phrase.GREETING to "Hello, Lerato", Phrase.GREETING_SUB to "Here for you. And the people you love.",
    Phrase.TAGLINE to "Help. Health. Home.", Phrase.HERO_TITLE to "Feel better.\nRight at home.",
    Phrase.HERO_BODY to "A caring nurse. A doctor’s expertise. All from the comfort of your home.",
    Phrase.HERO_TRUST to "Registered nurses · Visits from R249", Phrase.BOOK_NURSE to "Book a nurse",
    Phrase.OPEN_PASSPORT to "Open my passport", Phrase.NEXT_VISIT to "Your next visit", Phrase.HELP_WITH to "What can we help with?",
    Phrase.LANGUAGE to "Language", Phrase.PREVIEW_BADGE to "Design preview · Fictional data"
)
private val phrases: Map<ThusoLocale, Map<Phrase, String>> = mapOf(
    ThusoLocale.ENGLISH to english,
    ThusoLocale.ZULU to mapOf(
        Phrase.HOME to "Ikhaya", Phrase.BOOK_CARE to "Bhukha", Phrase.VISITS to "Ukuvakashelwa", Phrase.PASSPORT to "Iphasiphothi", Phrase.MORE to "Okuningi",
        Phrase.GREETING to "Sawubona, Lerato", Phrase.GREETING_SUB to "Silapha ngenxa yakho. Nangenxa yabantu obathandayo.",
        Phrase.TAGLINE to "Usizo. Impilo. Ikhaya.", Phrase.HERO_TITLE to "Zizwe ungcono.\nEkhaya.",
        Phrase.HERO_BODY to "Umhlengikazi onendaba. Ulwazi lukadokotela. Konke usekhaya.",
        Phrase.HERO_TRUST to "Abahlengikazi ababhalisiwe · Kusukela ku-R249", Phrase.BOOK_NURSE to "Bhukha umhlengikazi",
        Phrase.OPEN_PASSPORT to "Vula iphasiphothi yami", Phrase.NEXT_VISIT to "Ukuvakashelwa kwakho okulandelayo", Phrase.HELP_WITH to "Singakusiza ngani?",
        Phrase.LANGUAGE to "Ulimi", Phrase.PREVIEW_BADGE to "Isibonelo sedizayini · Idatha eqanjiwe"
    ),
    ThusoLocale.SESOTHO to mapOf(
        Phrase.HOME to "Lehae", Phrase.BOOK_CARE to "Behela", Phrase.VISITS to "Diketelo", Phrase.PASSPORT to "Phasepoto", Phrase.MORE to "Tse ding",
        Phrase.GREETING to "Dumela, Lerato", Phrase.GREETING_SUB to "Re teng bakeng sa hao. Le batho bao o ba ratang.",
        Phrase.TAGLINE to "Thuso. Bophelo. Lehae.", Phrase.HERO_TITLE to "Ikutlwe hantle.\nHae.",
        Phrase.HERO_BODY to "Mooki ya nang le kgathallo. Tsebo ya ngaka. Tsohle o le hae.",
        Phrase.HERO_TRUST to "Baoki ba ngodisitsweng · Ho tloha ho R249", Phrase.BOOK_NURSE to "Behela mooki",
        Phrase.OPEN_PASSPORT to "Bula phasepoto ya ka", Phrase.NEXT_VISIT to "Ketelo ya hao e latelang", Phrase.HELP_WITH to "Re ka o thusa ka eng?",
        Phrase.LANGUAGE to "Puo", Phrase.PREVIEW_BADGE to "Ponelopele ya moralo · Datha ya boiqapelo"
    ),
    ThusoLocale.AFRIKAANS to mapOf(
        Phrase.HOME to "Tuis", Phrase.BOOK_CARE to "Bespreek", Phrase.VISITS to "Besoeke", Phrase.PASSPORT to "Paspoort", Phrase.MORE to "Meer",
        Phrase.GREETING to "Hallo, Lerato", Phrase.GREETING_SUB to "Hier vir jou. En vir die mense vir wie jy lief is.",
        Phrase.TAGLINE to "Hulp. Gesondheid. Huis.", Phrase.HERO_TITLE to "Voel beter.\nTuis.",
        Phrase.HERO_BODY to "’n Sorgsame verpleegster. ’n Dokter se kundigheid. Alles van die gemak van jou huis af.",
        Phrase.HERO_TRUST to "Geregistreerde verpleegsters · Vanaf R249", Phrase.BOOK_NURSE to "Bespreek ’n verpleegster",
        Phrase.OPEN_PASSPORT to "Open my paspoort", Phrase.NEXT_VISIT to "Jou volgende besoek", Phrase.HELP_WITH to "Waarmee kan ons help?",
        Phrase.LANGUAGE to "Taal", Phrase.PREVIEW_BADGE to "Ontwerpvoorskou · Fiktiewe data"
    )
)
fun thuso(phrase: Phrase, locale: ThusoLocale): String = phrases[locale]?.get(phrase) ?: english[phrase] ?: phrase.name

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
 * Hero banner copy. Kept beside the rest of the localisation so a slide cannot be added in one
 * language and forgotten in the other three.
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
    val copy: List<List<Any>> = when (locale) {
        ThusoLocale.ZULU -> listOf(
            listOf("Ukunakekelwa\nokuza kuwe.", "Ukunakekelwa kwezempilo okwethembekile ekhaya, ngokuthinta nje.", "Thola usizo manje", listOf("Ekhaya", "Ukunakekelwa okwethembekile", "Kubantu obathandayo"), "Ukunakekelwa okufanayo. Eduze nekhaya."),
            listOf("Impilo yakho.\nIndawo eyodwa ephephile.", "Ukuvakashelwa, amarekhodi nokusekelwa — konke ku-MyThuso.", "Vula i-Thuso Pass", listOf("Ukunakekelwa okwethembekile", "Kuwe nabathandekayo bakho", "Ikusasa elinempilo"), "Ukunakekelwa kuyasihlanganisa."),
            listOf("Zizwe ungcono.\nEkhaya.", "Ukunakekelwa okuholwa umhlengikazi, kulethwa emnyango wakho.", "Bhukha umhlengikazi", listOf("Ochwepheshe abethembekile", "Ukunakekelwa okwakho", "Kuphephile futhi kulula"), "Ukunakekelwa okusezingeni, lapho ukhona.")
        )
        ThusoLocale.SESOTHO -> listOf(
            listOf("Tlhokomelo e tlang\nho wena.", "Tlhokomelo ya bophelo ya lehae e tshepahalang, ka ho tobetsa ha se kae.", "Fumana tlhokomelo hona joale", listOf("Lehae", "Tlhokomelo e tshepahalang", "Bakeng sa bao o ba ratang"), "Tlhokomelo e tshwanang. Haufi le lehae."),
            listOf("Bophelo ba hao.\nSebaka se le seng se sireletsehileng.", "Diketelo, direkoto le tshehetso — tsohle ho MyThuso.", "Bula Thuso Pass", listOf("Tlhokomelo e tshepahalang", "Bakeng sa hao le ba lelapa", "Bokamoso bo phetseng hantle"), "Tlhokomelo ea re kopanya."),
            listOf("Ikutlwe hantle.\nHae.", "Tlhokomelo e etelletsweng ke mooki, e tliswa monyako wa hao.", "Behela mooki", listOf("Ditsebi tse tshepahalang", "Tlhokomelo ya hao", "E bolokehile ebile e bonolo"), "Tlhokomelo e ntle, moo o leng teng.")
        )
        ThusoLocale.AFRIKAANS -> listOf(
            listOf("Sorg wat na\njou toe kom.", "Betroubare tuisgesondheidsorg met net ’n paar tikke.", "Kry sorg nou", listOf("By die huis", "Betroubare sorg", "Vir die mense vir wie jy lief is"), "Dieselfde sorg. Nader aan die huis."),
            listOf("Jou gesondheid.\nEen veilige plek.", "Besoeke, rekords en ondersteuning — alles in MyThuso.", "Open Thuso Pass", listOf("Betroubare sorg", "Vir jou en jou geliefdes", "Gesonder môres"), "Sorg verbind ons."),
            listOf("Voel beter.\nTuis.", "Verpleegster-gelei sorg, tot by jou deur.", "Bespreek ’n verpleegster", listOf("Betroubare professionele", "Persoonlike sorg", "Veilig en gerieflik"), "Kwaliteitsorg, waar jy ook al is.")
        )
        else -> listOf(
            listOf("Care that\ncomes to you.", "Trusted home healthcare in just a few taps.", "Get care now", listOf("At home", "Trusted care", "For the people you love"), "Same care. Closer to home."),
            listOf("Your health.\nOne safe place.", "Visits, records and support — all in MyThuso.", "Open Thuso Pass", listOf("Trusted care", "For you and your loved ones", "Healthier tomorrows"), "Care connects us."),
            listOf("Feel better.\nRight at home.", "Nurse-led care, delivered to your door.", "Book a nurse", listOf("Trusted professionals", "Personalised care", "Safe & convenient"), "Quality care, where you are.")
        )
    }
    @Suppress("UNCHECKED_CAST")
    return copy.mapIndexed { index, item ->
        HeroSlideCopy(art[index], item[0] as String, item[1] as String, item[2] as String, item[3] as List<String>, item[4] as String, art[index], banners[index], symbols[index])
    }
}
