package za.co.mythuso.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import za.co.mythuso.model.Clinical
import za.co.mythuso.model.ClinicalData
import za.co.mythuso.model.ClinicalInbox
import za.co.mythuso.model.ClinicalReview
import za.co.mythuso.model.PreviewStore

/* The clinical inbox on a phone: the visits nurses handed over, each signed by the doctor's own press, and what she is
 * told when she starts triage or Home Guidance.
 *
 * Each review shows the protocol version its visit named and whether the register holds it as ratified, and whether
 * its record is complete. There is one button per way of signing rather than a control with one chosen already:
 * how a review is signed is the doctor's choice. A press that is refused shows the refusal word for word, in the
 * route's sentence, rather than a button greyed out with no reason.
 *
 * Triage and guidance are started from here too, because a doctor reviewing a visit is where one would begin. No
 * triage protocol is ratified and no script exists, so each is answered with its refusal, "not triaged" and who
 * decides instead, and nothing is guessed. Nothing on this screen reaches anybody. */
@Composable fun ClinicalInboxScreen(store: PreviewStore) {
    val answers = remember { mutableStateMapOf<String, String>() }
    val guidance = remember { mutableStateMapOf<String, String>() }
    val triage = remember { mutableStateMapOf<String, ClinicalData.Refusal>() }
    /* The doctor's workspace opens as this party, as the review queue beside it does. */
    val signer = store.vetting.subject("D-401")
    ScreenColumn {
        DemoBadge()
        Heading("Doctor", ClinicalData.InboxText.heading, ClinicalData.InboxText.intro)
        NotConnected("doctor-review")
        Note(ClinicalData.InboxText.preview)
        Note(ClinicalData.InboxText.confirmers.replace("{roles}", Clinical.roles(ClinicalData.confirmers)))
        ClinicalInbox.reviews.forEach { review -> ReviewCard(review, answers[review.appointmentRef]) { mode ->
            val refused = ClinicalInbox.sign(review.appointmentRef, mode, signer)
            if (refused != null) answers[review.appointmentRef] = refused.statement else answers.remove(review.appointmentRef)
        } }
        CareCard {
            Text(ClinicalData.TriageText.heading, style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
            Note(ClinicalData.TriageText.intro)
            val answer = triage["answer"]
            if (answer != null) {
                Text(ClinicalData.TriageText.notTriaged, style = MaterialTheme.typography.titleSmall)
                Text(answer.statement, style = MaterialTheme.typography.bodyMedium, color = Charcoal)
                Note(ClinicalData.TriageText.human)
                Note(ClinicalData.TriageText.emergencyFirst)
                Note(ClinicalData.TriageText.routedTo.replace("{roles}", Clinical.roles(ClinicalData.triageRoutesTo)))
            } else {
                OutlinedButton(onClick = { triage["answer"] = Clinical.startTriage() }, shape = ThusoButtonShape) { Text(ClinicalData.TriageText.start) }
            }
        }
        CareCard {
            Text(ClinicalData.GuidanceText.heading, style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
            Note(ClinicalData.GuidanceText.intro)
            ClinicalData.outcomes.forEach { outcome ->
                val said = guidance[outcome.id]
                if (said != null) {
                    Text("${outcome.label} · ${ClinicalData.GuidanceText.noScript}", style = MaterialTheme.typography.titleSmall)
                    Note(said)
                } else {
                    OutlinedButton(onClick = { guidance[outcome.id] = Clinical.giveGuidance(outcome.id).statement }, shape = ThusoButtonShape) {
                        Text(ClinicalData.GuidanceText.give.replace("{outcome}", outcome.label))
                    }
                }
            }
        }
    }
}

@Composable private fun ReviewCard(review: ClinicalReview, refused: String?, sign: (String) -> Unit) {
    CareCard {
        Text(review.appointmentRef, style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
        Note(ClinicalData.InboxText.patient.replace("{subject}", review.subjectRef))
        val named = review.protocolVersionId
        Note(if (named == null) ClinicalData.InboxText.namedNone
            else "${ClinicalData.InboxText.named.replace("{protocol}", "${Clinical.protocolName(named)} ($named)")} · ${if (Clinical.ratified(named)) ClinicalData.InboxText.ratified else ClinicalData.InboxText.draft}")
        Note(if (review.recordComplete) ClinicalData.InboxText.recordComplete else ClinicalData.InboxText.recordIncomplete)
        val mode = review.signingMode
        if (mode != null) {
            Text(Clinical.signedSentence(mode, review.protocolVersionId), style = MaterialTheme.typography.bodyMedium, color = Charcoal)
            Note(ClinicalData.PromText.schedule.replace("{days}", ClinicalData.promDays.joinToString(" and ")))
        } else {
            Text(ClinicalData.InboxText.mode, style = MaterialTheme.typography.titleSmall)
            ClinicalData.modes.forEach { choice ->
                OutlinedButton(onClick = { sign(choice.id) }, shape = ThusoButtonShape) { Text("${ClinicalData.InboxText.sign}: ${choice.label}") }
            }
            if (refused != null) Text(refused, style = MaterialTheme.typography.bodyMedium, color = Danger)
        }
    }
}
