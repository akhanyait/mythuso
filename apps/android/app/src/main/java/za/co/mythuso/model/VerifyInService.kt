package za.co.mythuso.model

/* Verify in service on Android: a shift started with no face match, the code a nurse shows at a door, and the
 * patient's check of it. Every word is VerifyInServiceData.kt, generated from the contract; this file is the
 * arithmetic, and it is the same arithmetic packages/engines/src/trust/domain does on the engine runtime.
 *
 * NO MATCH, EVER, ON THIS PHONE. A shift start's outcome is the contract's not-integrated and nothing else, and
 * there is no branch for matched: no identity provider is contracted, and whether a face match is biometric
 * information is the Information Officer's undecided D-3. The manifest asks for no camera for it.
 *
 * THE DOOR CODE IS DIGITS. A QR code would need a scanning library the open-source register has not procured
 * (section 15D), and six digits can be read through a closed door. The tries belong to the visit, not the code;
 * an expired code is refused and is not a try; "not my nurse" is taken at any time and "she is my nurse" only after
 * a match. A match hands the patient a name and a tier name — never a number.
 *
 * The numbers are the contract's defaults, generated: an admin changes them on the web, and this app has no admin
 * surface. Nothing here is a real service: no desk is told and no incident is raised.
 */
data class VerifyInServiceChoice(val id: String, val label: String)
data class VerifyInServiceRefusal(val id: String, val status: Int, val statement: String)

object VerifyInService {
    fun refusal(id: String): VerifyInServiceRefusal = VerifyInServiceData.refusals.firstOrNull { it.id == id }
        ?: error("VerifyInServiceData has no refusal $id; regenerate it with npm run verify-in-service.")

    fun label(list: List<VerifyInServiceChoice>, id: String): String = list.firstOrNull { it.id == id }?.label ?: id

    fun fill(sentence: String, values: Map<String, String>): String =
        values.entries.fold(sentence) { text, (key, value) -> text.replace("{$key}", value) }

    /** The contract's not-integrated is the only outcome a shift start holds. */
    data class ShiftStart(val startedAtMillis: Long, val matchOutcome: String, val dispatchRule: String) {
        val online: Boolean get() = dispatchRule == "offer-with-desk-flag"
    }

    sealed interface Answer<out T> {
        data class Done<T>(val value: T) : Answer<T>
        data class Refused(val refusal: VerifyInServiceRefusal) : Answer<Nothing>
    }

    fun startShift(nowMillis: Long, badgeCurrent: Boolean): Answer<ShiftStart> =
        if (!badgeCurrent) Answer.Refused(refusal("no-current-verification-to-start"))
        else Answer.Done(ShiftStart(nowMillis, VerifyInServiceData.matchOutcome, VerifyInServiceData.unmatchedShiftStartDispatch))

    fun nurseLine(shift: ShiftStart): String = label(VerifyInServiceData.dispatchRules, shift.dispatchRule)

    data class DoorCode(val digits: String, val nurseName: String, val badgeTier: String?, val expiresAtMillis: Long, val attemptsAllowed: Int)

    sealed interface Tried {
        data class Matched(val nurseName: String, val tierName: String?) : Tried
        data class Wrong(val attemptsLeft: Int) : Tried
        data object Mismatch : Tried
    }

    /** One visit's door check. Immutable: every act answers with the next check. */
    data class DoorCheck(
        val code: DoorCode? = null,
        val attemptsUsed: Int = 0,
        val codeMatched: Boolean = false,
        val closedAs: String? = null
    ) {
        val attemptsLeft: Int get() = maxOf(0, (code?.attemptsAllowed ?: VerifyInServiceData.doorCodeAttempts) - attemptsUsed)

        fun show(nurseName: String, badgeTier: String?, nowMillis: Long): Answer<DoorCheck> {
            if (badgeTier == null) return Answer.Refused(refusal("no-badge-to-show-at-a-door"))
            val digits = (1..VerifyInServiceData.doorDigits).map { "0123456789".random() }.joinToString("")
            val shown = DoorCode(digits, nurseName, badgeTier, nowMillis + VerifyInServiceData.doorCodeMinutes * 60_000L, VerifyInServiceData.doorCodeAttempts)
            return Answer.Done(copy(code = shown, codeMatched = false))
        }

        fun attempt(typed: String, nowMillis: Long): Answer<Pair<DoorCheck, Tried>> {
            val held = code ?: return Answer.Refused(refusal("no-door-code-for-this-visit"))
            if (closedAs != null) return Answer.Refused(refusal("door-check-closed"))
            if (nowMillis >= held.expiresAtMillis) return Answer.Refused(refusal("door-code-expired"))
            if (typed.filter { it.isDigit() } == held.digits) {
                return Answer.Done(copy(codeMatched = true) to Tried.Matched(held.nurseName, held.badgeTier?.let { label(VerifyInServiceData.tiers, it) }))
            }
            val next = copy(attemptsUsed = attemptsUsed + 1)
            return if (next.attemptsLeft > 0) Answer.Done(next to Tried.Wrong(next.attemptsLeft))
            else Answer.Done(next.copy(closedAs = "attempts-used") to Tried.Mismatch)
        }

        /** The next check, and whether the desk would be told. */
        fun answer(id: String): Answer<Pair<DoorCheck, Boolean>> {
            if (id == "not-my-nurse") {
                return if (closedAs != null && closedAs != "verified") Answer.Done(this to true)
                else Answer.Done(copy(closedAs = "not-my-nurse") to true)
            }
            if (closedAs != null) return Answer.Refused(refusal("door-check-closed"))
            if (!codeMatched) return Answer.Refused(refusal("door-answer-before-code"))
            return Answer.Done(copy(closedAs = "verified") to false)
        }
    }
}
