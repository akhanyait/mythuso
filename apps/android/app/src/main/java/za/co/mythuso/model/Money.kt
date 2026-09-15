package za.co.mythuso.model

import java.time.LocalDate

/* Thuso Money, as far as a phone with no provider can honestly go.

   The tables — the ways to pay, the payment states and their words, the cash code's length, the
   doctor's per-case fee and the three signed sample cases — are generated into MoneyData.kt from
   packages/catalog/money.json. What is here is the types and the two decisions a screen asks:

   Which ways to pay a visit are offered. A wallet is named and not offered, because a balance that
   nothing holds cannot pay for anything.

   What a doctor is owed. Nothing, while the fee is undecided — not zero, which would be a figure,
   but null, which the fee screen renders as the contract's own sentence. The range the documents give
   is shown beside it as a range, never as the price, and it was read from the funding proposal's
   model when this was generated rather than typed here.

   The engine in packages/engines/src/money refuses to schedule a doctor's payout while the fee is
   null. This file cannot schedule anything, so it only refuses to show a figure. */

data class MoneyMethod(val id: String, val name: String, val detail: String, val forVisit: Boolean, val forPlan: Boolean, val offered: Boolean)

data class MoneyPaymentState(val id: String, val name: String, val words: String)

data class DoctorFee(
    val feeCode: String,
    val name: String,
    /** Null until somebody named decides it. There is no default. */
    val amount: Int?,
    val decidedBy: String?,
    val decidedOn: String?,
    val rangeLow: Int,
    val rangeHigh: Int,
    val source: String,
    val undecided: String,
    val whoDecides: String
) {
    val isDecided: Boolean
        get() = amount != null && decidedBy != null && decidedOn != null && amount in rangeLow..rangeHigh
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

    /** What a doctor is owed for these cases, or null while the fee is undecided. */
    fun owed(cases: List<SignedCase>, fee: DoctorFee = reviewFee): Int? =
        if (fee.isDecided) fee.amount!! * cases.size else null

    /** What the payment step says once a visit is booked on a phone with no provider. */
    fun afterBooking(methodName: String): String =
        if (method(methodName)?.id == "cash-otp") MoneyData.cashPendingWords else MoneyData.providerlessWords
}
