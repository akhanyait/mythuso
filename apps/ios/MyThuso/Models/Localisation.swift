import Foundation

/// What is left of localisation once the table stopped being typed by hand.
///
/// ThusoLocale, ThusoString, the table itself and clinicalLocale() are generated into
/// LocalisationData.swift from packages/catalog/locales.json. Three things stayed here because they
/// are decisions rather than data: the identity check digit, the shape of a hero slide, and which
/// key each slide reads.

/// South African ID numbers carry a Luhn check digit, so the preview can show a real
/// "that doesn't look right" state without sending anything anywhere.
func validateSaId(_ value: String) -> (ok: Bool, message: String) {
    let digits = value.filter(\.isNumber)
    guard digits.count == 13 else { return (false, "A South African ID number has 13 digits.") }
    let numbers = digits.compactMap { Int(String($0)) }
    let month = numbers[2] * 10 + numbers[3], day = numbers[4] * 10 + numbers[5]
    guard (1...12).contains(month), (1...31).contains(day) else { return (false, "The date of birth in this number is not valid.") }
    var sum = 0
    for index in 0..<13 {
        var digit = numbers[12 - index]
        if index % 2 == 1 { digit *= 2; if digit > 9 { digit -= 9 } }
        sum += digit
    }
    guard sum % 10 == 0 else { return (false, "That number fails its check digit. Please re-enter it.") }
    let yy = numbers[0] * 10 + numbers[1]
    let year = yy > 25 ? 1900 + yy : 2000 + yy
    return (true, String(format: "Checks out. Date of birth %02d/%02d/%d.", day, month, year))
}

/// Hero banner copy. The words come out of the generated table like every other string, so a slide
/// cannot be added in one language and forgotten in the others — and a locale that does not carry
/// the hero set falls back to English one string at a time rather than by a switch nobody updated.
struct HeroSlideCopy: Identifiable {
    let id: String
    let title: String
    let body: String
    let cta: String
    let trust: [String]
    let caption: String
    let art: String
    let banner: String
    let symbols: [String]
}
func heroSlides(_ locale: ThusoLocale) -> [HeroSlideCopy] {
    let art = ["Family", "Elder", "Nurse"]
    let banners = ["BannerCareThatComesToYou", "BannerOneSafePlace", "BannerFeelBetter"]
    let symbols = [["house", "checkmark.shield", "person.2"], ["checkmark.shield", "person.2", "sparkles"], ["checkmark.shield", "heart", "stethoscope"]]
    let keys: [(ThusoString, ThusoString, ThusoString, [ThusoString], ThusoString)] = [
        (.slide1Title, .slide1Body, .slide1Cta, [.slide1Trust1, .slide1Trust2, .slide1Trust3], .slide1Caption),
        (.slide2Title, .slide2Body, .slide2Cta, [.slide2Trust1, .slide2Trust2, .slide2Trust3], .slide2Caption),
        (.slide3Title, .slide3Body, .slide3Cta, [.slide3Trust1, .slide3Trust2, .slide3Trust3], .slide3Caption)
    ]
    return keys.enumerated().map { index, slide in
        HeroSlideCopy(id: art[index],
                      title: thuso(slide.0, locale), body: thuso(slide.1, locale), cta: thuso(slide.2, locale),
                      trust: slide.3.map { thuso($0, locale) }, caption: thuso(slide.4, locale),
                      art: art[index], banner: banners[index], symbols: symbols[index])
    }
}
