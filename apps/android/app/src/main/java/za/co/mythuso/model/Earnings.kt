package za.co.mythuso.model

/* What a nurse is paid, and what nobody is allowed to do to it.

   The public page tells South Africa that a MyThuso nurse keeps three quarters of every visit and
   is paid weekly. Until this existed, that promise had nowhere in the product to be true.

   The table itself — the cycle, the five payout states, the four kinds of line, the six rules, the
   four refusals, the account and four weeks of fictional visits — is generated into EarningsData.kt
   from packages/catalog/earnings.json, so nothing below is transcribed by hand. What is here is the
   reasoning: dates resolved from day offsets so the preview never goes stale, and the four sums a
   payout screen is allowed to show.

   The one thing worth saying twice, because it is the difference between this and a spreadsheet:
   no visit amount exists in the source at all. A line names a service; the money is that service's
   nurse share in packages/catalog/services.json — the same row the patient is quoted from. A price
   change moves the quote, the payout and the public claim in one edit, or it fails the build.

   Nothing here is transferred. No bank is contacted, no payment provider exists, and every visit,
   patient and account number below is fictional. */

data class PayCycle(
    val weekEndsOn: String,
    val closesOn: String,
    val paysOn: String,
    val clearsFromDays: Int,
    val clearsToDays: Int,
    val note: String
)

/* `settled` is the only bit of state that matters to the arithmetic: it is what separates money a
   nurse has received from money she has been promised. Everything else here is presentation. */
data class PayoutState(val id: String, val name: String, val detail: String, val settled: Boolean)

/** `sign` is −1 for a reversal, held on the kind rather than at each site, so a week is the sum of
 *  its lines and nothing downstream has to remember which way round to subtract. */
data class PayLineKind(val id: String, val name: String, val detail: String, val sign: Int)

data class PayRule(val id: String, val title: String, val sentence: String)
data class PayRefusal(val id: String, val sentence: String)

/** The number is masked, always. A full account number on a screen is one in a screenshot. */
data class PayoutAccount(
    val holder: String,
    val bank: String,
    val maskedNumber: String,
    val coolingOffHours: Int,
    val reverify: List<String>,
    val note: String
)

data class TaxYear(val startsOn: String, val label: String, val note: String)

data class PayLine(
    val kind: String,
    val reference: String,
    val onDays: Int,
    val patient: String,
    val area: String?,
    val plan: String?,
    /** The service's name, or null for a reversal or a correction, which are not visits. */
    val service: String?,
    val reason: String?,
    /** Already signed by the generator. */
    val amount: Int
)

data class PayWeek(
    val id: String,
    val state: String,
    val endsInDays: Int,
    val paysInDays: Int,
    val paidOnDays: Int?,
    val failure: String?,
    val lines: List<PayLine>
) {
    val total: Int get() = lines.sumOf { it.amount }

    /** Visits, not lines: a reversal is not a visit, and counting it as one would overstate the week. */
    val visits: Int get() = lines.count { it.service != null }
    val hasDeduction: Boolean get() = lines.any { it.amount < 0 }
}

object Earnings {
    fun state(id: String) = payoutStates.firstOrNull { it.id == id } ?: payoutStates.first()
    fun lineKind(id: String) = payLineKinds.firstOrNull { it.id == id } ?: payLineKinds.first()
    fun rule(id: String) = payRules.firstOrNull { it.id == id } ?: payRules.first()
    fun refusal(id: String) = payRefusals.firstOrNull { it.id == id } ?: payRefusals.first()

    val currentWeek: PayWeek get() = payWeeks.firstOrNull { it.state == "accruing" } ?: payWeeks.first()

    /* Received, not earned. Money still on its way is not income a nurse has had, so the tax-year
       figure counts settled weeks only — the same distinction the note beside it makes. Getting it
       the other way round would put a number on a screen that a nurse might reasonably act on and
       that SARS would not recognise. */
    val paidThisTaxYear: Int get() = payWeeks.filter { state(it.state).settled }.sumOf { it.total }
    val owedNotYetPaid: Int
        get() = payWeeks.filter { !state(it.state).settled && it.state != "accruing" }.sumOf { it.total }

    /** The card fee from the proposal's worked example, held beside the split it belongs to. */
    const val paymentCost = 9

    /* One visit, taken apart. The payment cost is the platform's to carry: it comes off what
       MyThuso keeps, never off what the nurse is paid, which is the first of the six rules. */
    data class Split(val price: Int, val nurse: Int, val payment: Int, val platform: Int) {
        val nurseShareOfPrice: Double get() = nurse.toDouble() / price.toDouble()
    }

    /** A dictionary lookup into the generated table, not a percentage applied to a price. */
    fun nurseShare(service: CareService) = nurseShares[service.id] ?: 0
    fun split(service: CareService): Split {
        val nurse = nurseShare(service)
        return Split(service.price, nurse, paymentCost, service.price - nurse - paymentCost)
    }

    /** The services a nurse can be paid for at launch, which is what the split picker offers. */
    val pricedServices: List<CareService> get() = services.filter { nurseShares.containsKey(it.id) }
    val shareLow: Int get() = nurseShares.values.minOrNull() ?: 0
    val shareHigh: Int get() = nurseShares.values.maxOrNull() ?: 0
}
