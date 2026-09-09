package za.co.mythuso.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Block
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import za.co.mythuso.model.*
import kotlin.math.roundToInt

/* Employer and sponsor programme administration.

   Both parties are already on the vetting register with a hard refusal attached, and the refusals
   are the feature. An employer may pay for care and still never see who used it. A sponsorship is a
   payment, not a permission.

   The employer's report is the part worth reading. Every figure on it is a count of people, and a
   count of people is a disclosure about each of them, so the table is built by asking which counts
   may be published at all — a floor of twelve, a dominance rule for the group where thirteen of
   fourteen answered the same way, secondary suppression so nothing can be had by subtracting, and
   rounding so two reports laid side by side do not name whoever changed their mind. The groups shown
   deliberately do not add up to the total, and the screen says why rather than leaving a reader to
   think it is a defect.

   A suppressed row says why. A blank with no explanation reads as an error and invites somebody to
   go and ask for it; a blank that says "fewer than twelve people" is an answer.

   The sponsor's side is shorter and harder. They see that care happened, when, and what it cost.
   They do not see what it was for, and whether the service is even named is the recipient's switch
   rather than the sponsor's request.

   Nothing here reports anything. No employer is contacted, no payment is taken, and every company,
   cohort and person is fictional. */

private val programmeEmployers = listOf("E-011", "E-012")
private val programmeSponsors = listOf("S-021", "S-022")

private fun randAmount(amount: Int): String {
    val digits = amount.toString().reversed().chunked(3).joinToString(" ").reversed()
    return "R $digits"
}
private fun percent(value: Double) = "${(value * 100).roundToInt()}%"

@Composable fun ProgrammesScreen(store: PreviewStore) {
    val employers = remember(store) { programmeEmployers.mapNotNull { store.vetting.subject(it) } }
    val sponsors = remember(store) { programmeSponsors.mapNotNull { store.vetting.subject(it) } }
    var employerId by remember { mutableStateOf(employers.last().id) }
    var programmeId by remember { mutableStateOf(programmes.first().id) }
    var sponsorId by remember { mutableStateOf(sponsors.last().id) }
    /* The switch belongs to the recipient, in her own account. It is here so a reader can see what
       it does to the sponsor's statement — not because a sponsor could reach it. */
    var serviceNamed by remember { mutableStateOf(true) }

    val employer = employers.firstOrNull { it.id == employerId } ?: employers.last()
    val sponsor = sponsors.firstOrNull { it.id == sponsorId } ?: sponsors.last()
    val mayRunProgramme = can(employer, "run-programme")
    val maySponsor = can(sponsor, "sponsor-care")
    val report = Programmes.suppress(Programmes.programme(programmeId))
    val statement = sponsorStatement

    ScreenColumn {
        DemoBadge()
        Heading("Admin workspace", "Programme administration",
            "Fictional companies, fictional cohorts and nothing reported anywhere.")

        Text("The floor", style = MaterialTheme.typography.titleLarge, color = Charcoal)
        CareCard {
            Figure("${suppressionFloor.minimumCohort}", "people, minimum", suppressionFloor.whyTwelve)
            Figure(percent(suppressionFloor.dominanceCeiling), "dominance ceiling", suppressionFloor.whyDominance)
            Figure("${suppressionFloor.roundTo}", "rounded to the nearest", suppressionFloor.whyRounding)
            Figure("${suppressionFloor.minimumSuppressed}", "rows hidden, minimum", suppressionFloor.whySecondary)
            Note("This floor is a judgement, not a standard. Nothing in POPIA names a number, and no Information Officer has signed this one off. It is written down so that it can be argued with.")
        }

        Text("What the employer is sent", style = MaterialTheme.typography.titleLarge, color = Charcoal)
        FlowRowChips(employers.map { it.name }, setOf(employer.name)) { name ->
            employerId = employers.first { it.name == name }.id
        }
        FlowRowChips(programmes.map { it.name }, setOf(Programmes.programme(programmeId).name)) { name ->
            programmeId = programmes.first { it.name == name }.id
        }
        if (!mayRunProgramme.allowed) {
            ProgrammeAlert(mayRunProgramme.reason.orEmpty())
        } else {
            CareCard {
                Text(report.programme.name, style = MaterialTheme.typography.titleLarge, color = Charcoal)
                Note("${employer.name} · running since ${-report.programme.startedInDays} days ago")
                StatusPill("${report.suppressed.size} of ${report.rows.size} groups not reported", "amber")
                report.rows.forEach { row -> ReportRow(row) }
                HorizontalDivider()
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Everybody", style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, color = Charcoal)
                    Text("${report.totalTookPart} of ${report.totalEligible} · ${percent(report.totalUptake)}",
                        style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, color = Charcoal)
                }
                Text(
                    "The groups shown add up to ${report.publishedTookPart}, and the total says ${report.totalTookPart}. " +
                        "That is not an error. " + Programmes.rule("figures-do-not-reconcile").sentence,
                    style = MaterialTheme.typography.bodyMedium, color = BodyText
                )
                Note(report.programme.note)
                Text(Programmes.rule("rounded-not-exact").sentence,
                    style = MaterialTheme.typography.bodyMedium, color = BodyText)
            }
        }

        CareCard {
            Text("WHAT AN EMPLOYER SEES", style = MaterialTheme.typography.labelSmall, color = Faint)
            employerSees.forEach { DisclosureRow(it) }
        }
        CareCard {
            Text("WHAT AN EMPLOYER NEVER SEES", style = MaterialTheme.typography.labelSmall, color = Danger)
            employerNeverSees.forEach { DisclosureRow(it) }
        }
        ProgrammeRefusalRow(Programmes.refusal("named-result"))

        Text("Saying no", style = MaterialTheme.typography.titleLarge, color = Charcoal)
        CareCard {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
                Icon(Icons.Outlined.VisibilityOff, null, tint = Charcoal)
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(programmeDeclining.headline, style = MaterialTheme.typography.titleMedium, color = Charcoal)
                    Note(programmeDeclining.note)
                }
            }
            Text(programmeDeclining.detail, style = MaterialTheme.typography.bodyMedium, color = BodyText)
            Text(Programmes.rule("taking-part-is-the-employees").sentence,
                style = MaterialTheme.typography.bodyMedium, color = BodyText)
            ProgrammeRefusalRow(Programmes.refusal("learn-who-declined"))
            ProgrammeRefusalRow(Programmes.refusal("condition-employment"))
        }

        Text("Joining, and leaving", style = MaterialTheme.typography.titleLarge, color = Charcoal)
        CareCard {
            Text("HOW SOMEBODY JOINS", style = MaterialTheme.typography.labelSmall, color = Faint)
            programmeEnrolment.forEachIndexed { index, step -> StepRow(index + 1, step) }
        }
        CareCard {
            Text("WHAT HAPPENS WHEN THEY LEAVE", style = MaterialTheme.typography.labelSmall, color = Faint)
            programmeLeaving.forEach { step ->
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(step.label, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, color = Charcoal)
                    Text(step.detail, style = MaterialTheme.typography.bodyMedium, color = BodyText)
                }
            }
        }
        Text(Programmes.rule("leaving-does-not-unpublish").sentence,
            style = MaterialTheme.typography.bodyMedium, color = BodyText)

        Text("Somebody paying for somebody else", style = MaterialTheme.typography.titleLarge, color = Charcoal)
        FlowRowChips(sponsors.map { it.name }, setOf(sponsor.name)) { name ->
            sponsorId = sponsors.first { it.name == name }.id
        }
        if (!maySponsor.allowed) ProgrammeAlert(maySponsor.reason.orEmpty())
        CareCard {
            Text("${store.vetting.subject(statement.sponsor)?.name ?: statement.sponsor} is paying for ${statement.recipient}",
                style = MaterialTheme.typography.titleMedium, color = Charcoal)
            Note("${statement.relationship} · ${randAmount(statement.setAside)} set aside · ${randAmount(statement.remaining)} left")
            Text(sponsorConsent.headline, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, color = Charcoal)
            Text(sponsorConsent.detail, style = MaterialTheme.typography.bodyMedium, color = BodyText)
            Note(sponsorConsent.withdrawal)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(serviceNamed, { serviceNamed = it },
                    modifier = Modifier.clearAndSetSemantics {
                        contentDescription = "Name the service on this sponsor's statement"
                    })
                Text("${statement.recipient} lets this sponsor see which visit it was",
                    style = MaterialTheme.typography.bodyMedium, color = Charcoal)
            }
            Note(lineDetailChoices.first { it.id == (if (serviceNamed) "service-named" else "amount-only") }.detail)
            statement.lines.forEach { line ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
                    Column(Modifier.weight(1f)) {
                        Text(if (serviceNamed) line.service else "Care was given",
                            style = MaterialTheme.typography.bodyLarge, color = Charcoal)
                        Note("${-line.onDays} days ago")
                    }
                    Text(randAmount(line.amount), style = MaterialTheme.typography.titleMedium, color = Charcoal)
                }
            }
            HorizontalDivider()
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Drawn from what was set aside", style = MaterialTheme.typography.bodyMedium, color = BodyText)
                Text(randAmount(statement.spent), style = MaterialTheme.typography.titleMedium, color = Charcoal)
            }
            Text("WHAT A SPONSOR NEVER SEES", style = MaterialTheme.typography.labelSmall, color = Danger)
            sponsorNeverSees.forEach { DisclosureRow(it) }
            Text(Programmes.rule("paying-is-not-permission").sentence,
                style = MaterialTheme.typography.bodyMedium, color = BodyText)
            ProgrammeRefusalRow(Programmes.refusal("require-the-detail"))
        }

        Text("What this screen will not do", style = MaterialTheme.typography.titleLarge, color = Charcoal)
        programmeRefusals.forEach { CareCard { ProgrammeRefusalRow(it) } }
        Note("No report is produced, no invitation is sent and no payment is taken. Every count above is fictional, the suppression is arithmetic on it, and the floor itself still needs an Information Officer to agree with it.")
    }
}

@Composable private fun ReportRow(row: ReportedCohort) {
    if (row.suppressedBy != null) {
        Column(
            Modifier.fillMaxWidth().background(MangoSoft, RoundedCornerShape(ThusoRadius.card)).padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Text(row.cohort.name, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, color = Faint)
            Text("NOT REPORTED", style = MaterialTheme.typography.labelSmall, color = MangoInk)
            Text(Programmes.suppressionReason(row.suppressedBy).sentence,
                style = MaterialTheme.typography.bodyMedium, color = Charcoal)
        }
    } else {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
            Text(row.cohort.name, style = MaterialTheme.typography.bodyLarge, color = Charcoal, modifier = Modifier.weight(1f))
            Text("${row.tookPart} of ${row.eligible} · ${percent(row.uptake)} · ${row.advisedToSeeADoctor} advised",
                style = MaterialTheme.typography.bodySmall, color = BodyText)
        }
    }
}

@Composable private fun Figure(value: String, label: String, why: String) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(value, style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.Bold, color = Charcoal)
        Text(label.uppercase(), style = MaterialTheme.typography.labelSmall, color = Faint)
        Text(why, style = MaterialTheme.typography.bodyMedium, color = BodyText)
    }
}

@Composable private fun DisclosureRow(item: Disclosure) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(item.what, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, color = Charcoal)
        Text(item.why, style = MaterialTheme.typography.bodyMedium, color = BodyText)
    }
}

@Composable private fun StepRow(number: Int, step: ProgrammeStep) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Top) {
        Text("$number", style = MaterialTheme.typography.labelSmall, color = IndigoDeep,
            modifier = Modifier.background(IndigoSoft, RoundedCornerShape(ThusoRadius.control)).padding(horizontal = 8.dp, vertical = 4.dp))
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(step.label, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, color = Charcoal)
            Text(step.detail, style = MaterialTheme.typography.bodyMedium, color = BodyText)
        }
    }
}

@Composable private fun ProgrammeAlert(text: String) {
    Row(
        Modifier.fillMaxWidth().background(MangoSoft, RoundedCornerShape(ThusoRadius.card)).padding(12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top
    ) {
        Icon(Icons.Outlined.Info, null, tint = MangoInk)
        Text(text, style = MaterialTheme.typography.bodyMedium, color = Charcoal)
    }
}

@Composable private fun ProgrammeRefusalRow(item: ProgrammeRefusal) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
        Icon(Icons.Outlined.Block, null, tint = Danger)
        Text(item.sentence, style = MaterialTheme.typography.bodyMedium, color = Charcoal)
    }
}
