package za.co.mythuso.model

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.security.MessageDigest
import java.security.SecureRandom
import java.time.LocalDate

/* Thuso Money, as far as a phone with no provider can honestly go.

   The tables — the ways to pay, the payment states and their words, the cash code's length, the
   doctor's per-case fee and the three signed sample cases — are generated into MoneyData.kt from
   packages/catalog/money.json. What is here is the types and the two decisions a screen asks:

   Which ways to pay a visit are offered. A wallet is named and not offered, because a balance that
   nothing holds cannot pay for anything.

   What a doctor is owed. The fee is Money's setting, and this app has no admin surface, so it is the
   default as generated: a proposal inside the range the documents give, which nobody has confirmed. A
   proposal pays nobody, so while it is unconfirmed a doctor is owed nothing — not zero, which would be
   a figure, but null, which the fee screen renders beside the contract's own sentence. The range is
   shown beside the fee as a range, and it is the setting's bounds, generated rather than typed here.

   The engine in packages/engines/src/money refuses to schedule a doctor's payout at a fee nobody has
   confirmed. This file cannot schedule anything, so it only refuses to work out a figure. */

data class MoneyMethod(val id: String, val name: String, val detail: String, val forVisit: Boolean, val forPlan: Boolean, val offered: Boolean)

data class MoneyPaymentState(val id: String, val name: String, val words: String)

data class DoctorFee(
    val feeCode: String,
    val name: String,
    /** The fee in cents, as Money's setting gives it by default. */
    val amountCents: Int,
    /** Whether an admin has confirmed it. A proposal is shown and pays nobody. */
    val confirmed: Boolean,
    val rangeLowCents: Int,
    val rangeHighCents: Int,
    val source: String,
    val unconfirmedWords: String,
    val confirmedWords: String,
    val whoSets: String
) {
    val isPayable: Boolean
        get() = confirmed && amountCents in rangeLowCents..rangeHighCents
}

data class SignedCase(val reviewRef: String, val onDays: Int) {
    val date: LocalDate get() = LocalDate.now().plusDays(onDays.toLong())
}

object Money {
    val visitMethods: List<MoneyMethod> get() = MoneyData.methods.filter { it.offered && it.forVisit }
    fun method(named: String): MoneyMethod? = MoneyData.methods.firstOrNull { it.name == named }
    fun state(id: String): MoneyPaymentState = MoneyData.states.firstOrNull { it.id == id } ?: MoneyData.states.first()
    fun refusal(id: String): String = MoneyData.refusals[id].orEmpty()
    val reviewFee: DoctorFee get() = MoneyData.doctorFees.first()

    /** An amount in cents as rand, with the cents only when there are some. */
    fun randCents(cents: Int): String =
        if (cents % 100 == 0) "R ${cents / 100}" else "R ${cents / 100}.${(cents % 100).toString().padStart(2, '0')}"

    /** What a doctor is owed for these cases, in cents, or null while the fee is not confirmed. */
    fun owed(cases: List<SignedCase>, fee: DoctorFee = reviewFee): Int? =
        if (fee.isPayable) fee.amountCents * cases.size else null

    /** What the payment step says once a visit is booked on a phone with no provider. */
    fun afterBooking(methodName: String): String =
        if (method(methodName)?.id == "cash-otp") MoneyData.cashPendingWords else MoneyData.providerlessWords
}

/* The cash code at the door, for the one preview visit the nurse walks.

   A phone runs no ledger, so this holds what the ledger holds for a cash payment and nothing more: a random
   salt and the SHA-256 of salt and code, the count of wrong codes, and whether the payment is held for the
   operations desk. The code comes from SecureRandom, is shown on the patient's simulated screen once, and is
   dropped the moment the nurse enters anything. A wrong code counts; at MoneyData.cashAttemptLimit the payment
   is held and the right code is refused too, in the contract's words. The phone has no desk, so a held payment
   stays held here: the release is the operations desk's, on the web. */
class CashCodeDoor(serviceId: String = CareData.Preview.serviceId) {
    /** What the patient owes, from the preview visit's service in the catalogue. Null if the catalogue has lost it. */
    val amountCents: Int? = services.firstOrNull { it.id == serviceId }?.price?.let { it * 100 }

    var patientCode by mutableStateOf<String?>(null)
        private set
    var held by mutableStateOf(false)
        private set
    var recorded by mutableStateOf(false)
        private set
    var refusal by mutableStateOf<String?>(null)
        private set

    private val random = SecureRandom()
    private val salt: String = ByteArray(16).also { random.nextBytes(it) }.joinToString("") { "%02x".format(it) }
    private val digest: String
    private var wrongAttempts = 0

    init {
        val code = (1..MoneyData.cashCodeLength).joinToString("") { random.nextInt(10).toString() }
        digest = digestOf(code)
        patientCode = code
    }

    /** The nurse enters the code the patient gives her. The patient's screen forgets its code as she does. */
    fun enter(code: String) {
        patientCode = null
        if (recorded) return
        if (held) { refusal = Money.refusal("cash-code-held"); return }
        if (!same(digestOf(code), digest)) {
            wrongAttempts += 1
            held = wrongAttempts >= MoneyData.cashAttemptLimit
            refusal = Money.refusal(if (held) "cash-code-held" else "cash-without-otp")
            return
        }
        recorded = true
        refusal = null
    }

    private fun digestOf(code: String): String =
        MessageDigest.getInstance("SHA-256").digest("$salt:$code".toByteArray()).joinToString("") { "%02x".format(it) }

    /* Compared across the whole length whatever the first difference, as the ledger does. */
    private fun same(left: String, right: String): Boolean {
        if (left.length != right.length) return false
        var difference = 0
        for (index in left.indices) difference = difference or (left[index].code xor right[index].code)
        return difference == 0
    }
}
