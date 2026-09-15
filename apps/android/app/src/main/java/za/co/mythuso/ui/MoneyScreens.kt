package za.co.mythuso.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import java.time.format.DateTimeFormatter
import java.util.Locale
import za.co.mythuso.model.Money
import za.co.mythuso.model.MoneyData

/*
 * What a doctor is paid for reviewing a case, which is: not decided.
 *
 * The documents give a range for a doctor's per-case review and no price. A screen like this is where a
 * made-up number would be most tempting and do the most harm — a figure a doctor reads as her rate,
 * which nobody agreed to. So the fee is the contract's null, rendered as the contract's sentence; the
 * range is shown as a range and labelled as one, read from the funding proposal's model when MoneyData
 * was generated; and the one button asks to schedule the payout and shows the refusal, word for word,
 * rather than being disabled with no reason given.
 *
 * The cases carry a reference and a date and nothing else. Money hears review.billable, which names the
 * review, the doctor and a fee code, and never the patient or why the review was needed — so this screen
 * has nobody to name, which is the design rather than a gap in it.
 */
private val signedOn = DateTimeFormatter.ofPattern("EEE d MMMM", Locale.forLanguageTag("en-ZA"))
private fun feeRand(amount: Int) = "R $amount"

@Composable fun DoctorFeesScreen() {
    val fee = Money.reviewFee
    val cases = MoneyData.sampleCases
    val feeText = fee.amount?.let(::feeRand) ?: "Not decided"
    var answer by rememberSaveable { mutableStateOf<String?>(null) }
    ScreenColumn {
        Heading("Doctor", "Per-case fees", fee.name)
        NotConnected("payouts")
        CareCard {
            ReviewLine(fee.name, feeText)
            ReviewLine("The range the documents give", "${feeRand(fee.rangeLow)} to ${feeRand(fee.rangeHigh)}")
            Note(fee.undecided)
            Note("${fee.source} Who decides it: ${fee.whoDecides}")
        }
        CareCard {
            Text("Cases recorded", style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
            cases.forEach { signed -> ReviewLine(signed.reviewRef, "${signed.date.format(signedOn)} · $feeText") }
            Note(MoneyData.casesWords)
        }
        CareCard {
            ReviewLine("Owed for ${cases.size} cases", Money.owed(cases, fee)?.let(::feeRand) ?: "Not worked out")
            val shown = answer
            if (shown != null) {
                Text(shown, style = MaterialTheme.typography.bodyMedium, color = Charcoal)
            } else {
                /* The phone cannot schedule anything; the engine refuses while the fee is null, and this
                   shows that refusal in its words rather than a figure. */
                OutlinedButton(onClick = { answer = if (fee.isDecided) null else Money.refusal("doctor-fee-undecided") }, shape = ThusoButtonShape) {
                    Text("Schedule this week’s payout")
                }
            }
        }
    }
}
