import Foundation

/// Localisation for the shell, navigation and primary calls to action.
/// Clinical wording stays in English until a South African clinical language review is complete —
/// a mistranslated instruction is a safety problem, not a polish problem.
enum ThusoLocale: String, CaseIterable, Identifiable {
    case english = "en-ZA", zulu = "zu-ZA", sesotho = "st-ZA", afrikaans = "af-ZA"
    var id: String { rawValue }
    var native: String {
        switch self {
        case .english: return "English"
        case .zulu: return "isiZulu"
        case .sesotho: return "Sesotho"
        case .afrikaans: return "Afrikaans"
        }
    }
}
enum ThusoString: String {
    case home, bookCare, visits, passport, more
    case greeting, greetingSub, tagline, heroTitle, heroBody, heroTrust
    case bookNurse, openPassport, nextVisit, helpWith, language, previewBadge
}
private let table: [ThusoLocale: [ThusoString: String]] = [
    .english: [
        .home: "Home", .bookCare: "Book care", .visits: "Visits", .passport: "Passport", .more: "More",
        .greeting: "Hello, Lerato", .greetingSub: "Here for you. And the people you love.",
        .tagline: "Help. Health. Home.", .heroTitle: "Feel better.\nRight at home.",
        .heroBody: "A caring nurse. A doctor’s expertise. All from the comfort of your home.",
        .heroTrust: "Registered nurses · Visits from R249", .bookNurse: "Book a nurse",
        .openPassport: "Open my passport", .nextVisit: "Your next visit", .helpWith: "What can we help with?",
        .language: "Language", .previewBadge: "Design preview · Fictional data"
    ],
    .zulu: [
        .home: "Ikhaya", .bookCare: "Bhukha", .visits: "Ukuvakashelwa", .passport: "Iphasiphothi", .more: "Okuningi",
        .greeting: "Sawubona, Lerato", .greetingSub: "Silapha ngenxa yakho. Nangenxa yabantu obathandayo.",
        .tagline: "Usizo. Impilo. Ikhaya.", .heroTitle: "Zizwe ungcono.\nEkhaya.",
        .heroBody: "Umhlengikazi onendaba. Ulwazi lukadokotela. Konke usekhaya.",
        .heroTrust: "Abahlengikazi ababhalisiwe · Kusukela ku-R249", .bookNurse: "Bhukha umhlengikazi",
        .openPassport: "Vula iphasiphothi yami", .nextVisit: "Ukuvakashelwa kwakho okulandelayo", .helpWith: "Singakusiza ngani?",
        .language: "Ulimi", .previewBadge: "Isibonelo sedizayini · Idatha eqanjiwe"
    ],
    .sesotho: [
        .home: "Lehae", .bookCare: "Behela", .visits: "Diketelo", .passport: "Phasepoto", .more: "Tse ding",
        .greeting: "Dumela, Lerato", .greetingSub: "Re teng bakeng sa hao. Le batho bao o ba ratang.",
        .tagline: "Thuso. Bophelo. Lehae.", .heroTitle: "Ikutlwe hantle.\nHae.",
        .heroBody: "Mooki ya nang le kgathallo. Tsebo ya ngaka. Tsohle o le hae.",
        .heroTrust: "Baoki ba ngodisitsweng · Ho tloha ho R249", .bookNurse: "Behela mooki",
        .openPassport: "Bula phasepoto ya ka", .nextVisit: "Ketelo ya hao e latelang", .helpWith: "Re ka o thusa ka eng?",
        .language: "Puo", .previewBadge: "Ponelopele ya moralo · Datha ya boiqapelo"
    ],
    .afrikaans: [
        .home: "Tuis", .bookCare: "Bespreek", .visits: "Besoeke", .passport: "Paspoort", .more: "Meer",
        .greeting: "Hallo, Lerato", .greetingSub: "Hier vir jou. En vir die mense vir wie jy lief is.",
        .tagline: "Hulp. Gesondheid. Huis.", .heroTitle: "Voel beter.\nTuis.",
        .heroBody: "’n Sorgsame verpleegster. ’n Dokter se kundigheid. Alles van die gemak van jou huis af.",
        .heroTrust: "Geregistreerde verpleegsters · Vanaf R249", .bookNurse: "Bespreek ’n verpleegster",
        .openPassport: "Open my paspoort", .nextVisit: "Jou volgende besoek", .helpWith: "Waarmee kan ons help?",
        .language: "Taal", .previewBadge: "Ontwerpvoorskou · Fiktiewe data"
    ]
]
func thuso(_ key: ThusoString, _ locale: ThusoLocale) -> String {
    table[locale]?[key] ?? table[.english]?[key] ?? key.rawValue
}
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

/// Hero banner copy. Kept beside the rest of the localisation so a slide cannot be added in one
/// language and forgotten in the other three.
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
    let copy: [(String, String, String, [String], String)]
    switch locale {
    case .zulu:
        copy = [
            ("Ukunakekelwa\nokuza kuwe.", "Ukunakekelwa kwezempilo okwethembekile ekhaya, ngokuthinta nje.", "Thola usizo manje", ["Ekhaya", "Ukunakekelwa okwethembekile", "Kubantu obathandayo"], "Ukunakekelwa okufanayo. Eduze nekhaya."),
            ("Impilo yakho.\nIndawo eyodwa ephephile.", "Ukuvakashelwa, amarekhodi nokusekelwa — konke ku-MyThuso.", "Vula i-Thuso Pass", ["Ukunakekelwa okwethembekile", "Kuwe nabathandekayo bakho", "Ikusasa elinempilo"], "Ukunakekelwa kuyasihlanganisa."),
            ("Zizwe ungcono.\nEkhaya.", "Ukunakekelwa okuholwa umhlengikazi, kulethwa emnyango wakho.", "Bhukha umhlengikazi", ["Ochwepheshe abethembekile", "Ukunakekelwa okwakho", "Kuphephile futhi kulula"], "Ukunakekelwa okusezingeni, lapho ukhona.")
        ]
    case .sesotho:
        copy = [
            ("Tlhokomelo e tlang\nho wena.", "Tlhokomelo ya bophelo ya lehae e tshepahalang, ka ho tobetsa ha se kae.", "Fumana tlhokomelo hona joale", ["Lehae", "Tlhokomelo e tshepahalang", "Bakeng sa bao o ba ratang"], "Tlhokomelo e tshwanang. Haufi le lehae."),
            ("Bophelo ba hao.\nSebaka se le seng se sireletsehileng.", "Diketelo, direkoto le tshehetso — tsohle ho MyThuso.", "Bula Thuso Pass", ["Tlhokomelo e tshepahalang", "Bakeng sa hao le ba lelapa", "Bokamoso bo phetseng hantle"], "Tlhokomelo ea re kopanya."),
            ("Ikutlwe hantle.\nHae.", "Tlhokomelo e etelletsweng ke mooki, e tliswa monyako wa hao.", "Behela mooki", ["Ditsebi tse tshepahalang", "Tlhokomelo ya hao", "E bolokehile ebile e bonolo"], "Tlhokomelo e ntle, moo o leng teng.")
        ]
    case .afrikaans:
        copy = [
            ("Sorg wat na\njou toe kom.", "Betroubare tuisgesondheidsorg met net ’n paar tikke.", "Kry sorg nou", ["By die huis", "Betroubare sorg", "Vir die mense vir wie jy lief is"], "Dieselfde sorg. Nader aan die huis."),
            ("Jou gesondheid.\nEen veilige plek.", "Besoeke, rekords en ondersteuning — alles in MyThuso.", "Open Thuso Pass", ["Betroubare sorg", "Vir jou en jou geliefdes", "Gesonder môres"], "Sorg verbind ons."),
            ("Voel beter.\nTuis.", "Verpleegster-gelei sorg, tot by jou deur.", "Bespreek ’n verpleegster", ["Betroubare professionele", "Persoonlike sorg", "Veilig en gerieflik"], "Kwaliteitsorg, waar jy ook al is.")
        ]
    default:
        copy = [
            ("Care that\ncomes to you.", "Trusted home healthcare in just a few taps.", "Get care now", ["At home", "Trusted care", "For the people you love"], "Same care. Closer to home."),
            ("Your health.\nOne safe place.", "Visits, records and support — all in MyThuso.", "Open Thuso Pass", ["Trusted care", "For you and your loved ones", "Healthier tomorrows"], "Care connects us."),
            ("Feel better.\nRight at home.", "Nurse-led care, delivered to your door.", "Book a nurse", ["Trusted professionals", "Personalised care", "Safe & convenient"], "Quality care, where you are.")
        ]
    }
    return copy.enumerated().map { index, item in
        HeroSlideCopy(id: art[index], title: item.0, body: item.1, cta: item.2, trust: item.3, caption: item.4, art: art[index], banner: banners[index], symbols: symbols[index])
    }
}
