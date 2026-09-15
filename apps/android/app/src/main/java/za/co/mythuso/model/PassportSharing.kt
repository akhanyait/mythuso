package za.co.mythuso.model

import java.security.SecureRandom
import java.time.LocalDate

/* The Health Passport's emergency card and access log on Android: the arithmetic, hand-written, over the generated
 * PassportSharingData.
 *
 * A card is a share link restricted to the emergency summary. On the web and in the Passport P0 its terms are
 * worked out by packages/engines/src/record/domain/links.ts; this is the same rule for the one case a phone makes,
 * and nothing else: the card ends at the earliest of the Record setting's default lifetime, the end of the grant it
 * rides on and the founder's grant ceiling, and opens as many times as the setting's default says. Every number is
 * generated from packages/catalog — the phone has no admin surface, so it uses the defaults and says so where it
 * shows them. No card made here is connected to anything: the code opens nothing, and the QR code reads as a
 * sentence saying so.
 */
data class EmergencyCardTerms(
    val code: String,
    val payload: String,
    val endsOn: LocalDate,
    val usesAllowed: Int,
    val recipient: String,
    val grantEndsOn: LocalDate
)

object PassportSharing {
    private val random = SecureRandom()

    /** The days a card made today lasts: the setting, the grant and the ceiling, whichever ends first. */
    val cardDays: Int
        get() = minOf(PassportSharingData.CARD_LIFETIME_DAYS, PassportSharingData.CARD_GRANT_ENDS_IN_DAYS, PassportSharingData.GRANT_CEILING_DAYS)

    /* A code from an alphabet without the characters people misread for each other, drawn from a secure random
       source. It stands in for a secret and opens nothing, because nothing is behind it. */
    fun previewCode(): String = (0 until PassportSharingData.CODE_GROUPS).joinToString("-") {
        (0 until PassportSharingData.CODE_GROUP_LENGTH).map {
            PassportSharingData.CODE_ALPHABET[random.nextInt(PassportSharingData.CODE_ALPHABET.length)]
        }.joinToString("")
    }

    fun makeCard(today: LocalDate = LocalDate.now()): EmergencyCardTerms {
        val code = previewCode()
        return EmergencyCardTerms(
            code = code,
            payload = PassportSharingData.QR_PAYLOAD.replace("{code}", code),
            endsOn = today.plusDays(cardDays.toLong()),
            usesAllowed = PassportSharingData.CARD_MAX_USES,
            recipient = PassportSharingData.CARD_RECIPIENT,
            grantEndsOn = today.plusDays(PassportSharingData.CARD_GRANT_ENDS_IN_DAYS.toLong())
        )
    }

    /** A contract sentence with its {placeholders} filled. */
    fun fill(template: String, values: Map<String, String>): String =
        values.entries.fold(template) { sentence, (key, value) -> sentence.replace("{$key}", value) }

    /** The synthetic log, newest first, as the patient reads it. */
    val log: List<PassportSharingData.LogEntry>
        get() = PassportSharingData.accessLog.sortedWith(compareByDescending<PassportSharingData.LogEntry> { it.dayOffset }.thenByDescending { it.time })
}
