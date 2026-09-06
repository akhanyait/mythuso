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
