import Foundation

/* The Health Passport's emergency card and access log on iOS: the arithmetic, hand-written, over the generated
 * PassportSharingData.
 *
 * A card is a share link restricted to the emergency summary. On the web and in the Passport P0 its terms are
 * worked out by packages/engines/src/record/domain/links.ts; this is the same rule for the one case a phone makes,
 * and nothing else: the card ends at the earliest of the Record setting's default lifetime, the end of the grant it
 * rides on and the founder's grant ceiling, and opens as many times as the setting's default says. Every number is
 * generated from packages/catalog — the phone has no admin surface, so it uses the defaults, and says so where it
 * shows them. No card made here is connected to anything: the code opens nothing, and the QR code reads as a
 * sentence saying so.
 */
struct EmergencyCardTerms: Equatable {
    let code: String
    let payload: String
    let endsOn: Date
    let usesAllowed: Int
    let recipient: String
    let grantEndsOn: Date
}

enum PassportSharing {
    /// The days a card made today lasts: the setting, the grant and the ceiling, whichever ends first.
    static var cardDays: Int {
        min(PassportSharingData.cardLifetimeDays, PassportSharingData.cardGrantEndsInDays, PassportSharingData.grantCeilingDays)
    }

    /* A code from an alphabet without the characters people misread for each other, drawn from the system's
       random source. It stands in for a secret and opens nothing, because nothing is behind it. */
    static func previewCode() -> String {
        var generator = SystemRandomNumberGenerator()
        let alphabet = Array(PassportSharingData.codeAlphabet)
        return (0..<PassportSharingData.codeGroups).map { _ in
            String((0..<PassportSharingData.codeGroupLength).map { _ in alphabet[Int.random(in: 0..<alphabet.count, using: &generator)] })
        }.joined(separator: "-")
    }

    static func day(_ offset: Int, from now: Date = Date()) -> Date {
        Calendar.current.date(byAdding: .day, value: offset, to: now) ?? now
    }

    static func makeCard(now: Date = Date()) -> EmergencyCardTerms {
        let code = previewCode()
        return EmergencyCardTerms(
            code: code,
            payload: PassportSharingData.qrPayload.replacingOccurrences(of: "{code}", with: code),
            endsOn: day(cardDays, from: now),
            usesAllowed: PassportSharingData.cardMaxUses,
            recipient: PassportSharingData.cardRecipient,
            grantEndsOn: day(PassportSharingData.cardGrantEndsInDays, from: now)
        )
    }

    /// A contract sentence with its {placeholders} filled.
    static func fill(_ template: String, _ values: [String: String]) -> String {
        values.reduce(template) { sentence, pair in sentence.replacingOccurrences(of: "{\(pair.key)}", with: pair.value) }
    }

    /// The synthetic log, newest first, as the patient reads it.
    static var log: [PassportSharingData.LogEntry] {
        PassportSharingData.accessLog.sorted { ($0.dayOffset, $0.time) > ($1.dayOffset, $1.time) }
    }
}
