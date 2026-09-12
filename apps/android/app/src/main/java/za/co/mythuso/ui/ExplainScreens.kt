package za.co.mythuso.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import za.co.mythuso.model.*

/*
 * What your readings mean.
 *
 * The Health Passport has rendered seven reference ranges since it was written and has never said
 * what any of them measures. A number beside a range answers “is this inside the lines”, which is not
 * the question a person opened the screen with. Left unanswered, that question is asked of a search
 * engine, and a search engine will diagnose them.
 *
 * The composition puts the provenance where it can be acted on. The lead is a count and not a
 * verdict — “five of seven inside their range” is a fact about seven numbers on one day, and it is
 * not “you are well”; the sentence under it says who actually decides that, before any paragraph
 * below has had a chance to be mistaken for one.
 *
 * The rows carry no coloured tile. Seven identical sage squares — two of them for the two halves of
 * one blood-pressure reading — is a colour that has stopped carrying information, and the space it
 * would have taken is where the one thing on a row that does mean something now sits: where the last
 * reading fell against its own range, as a word.
 *
 * Every range and label is the assessment's own, so what a patient reads here and what a nurse is
 * held to at a visit cannot become two numbers. The urgent conditions are ids into the emergency
 * contract, so this screen can never invent a ninth or soften one of the eight — and it is the only
 * thing on the page with a door out of it, because a screen that explains blood pressure to somebody
 * having a stroke is a screen that has done harm.
 */

@Composable private fun StatedBlock(title: String, body: String) {
    Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
        Text(title, style = MaterialTheme.typography.titleSmall, color = Charcoal)
        Text(body, style = MaterialTheme.typography.bodyMedium, color = BodyText)
    }
}

@Composable fun ExplainReadingsScreen(open: (String) -> Unit) {
    /* One open at a time. Seven of these expanded is a wall of prose nobody reads, and a reader who
       has to scroll past six explanations to reach the seventh has been given a document rather than
       an answer. */
    var shown by rememberSaveable { mutableStateOf("") }
    val latest = Passport.latestSet
    val measured = Passport.measuredIn(latest)
    val inside = measured.count { Passport.flagOf(it, latest.values.getValue(it.id)) == "normal" }

    ScreenColumn {
        DemoBadge()
        Heading("Health Passport", "What your readings mean.",
            "What each measurement is, what a number outside its range may follow from, and who decides what any of it means for you.")
        NotConnected(of = "screening")

        /* One chip, not two. The panel used to carry “All inside range” in its header and “On the day
           they were taken” above the numeral, which is the same fact said twice at two sizes with
           “7 of 7” underneath saying it a third time. The status belongs on the metric — that is
           where this language puts a status — and the header keeps the visit and its date.
           The lead is a count and not a verdict: “7 of 7” is a fact about seven numbers on one day,
           it is not “you are well”, and the sentence under it says who decides that. */
        SPanel(tone = PanelTone.LEAD) {
            Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
                Text("Your last visit", style = MaterialTheme.typography.titleMedium, color = Charcoal)
                Note(Scheduling.longDate(Passport.dateOf(latest.dayOffset)))
            }
            Metric(
                value = inside.toString(), unit = "of ${measured.size}",
                label = "Readings inside their range",
                chip = if (inside == measured.size) "All inside range" else "${measured.size - inside} outside range",
                flagged = inside != measured.size
            )
            Note(ExplainProvenance.whoDecides)
        }

        Section("Choose a reading") {
            explanations.forEach { explanation ->
                val observation = Explain.measure(explanation.id) ?: return@forEach
                val value = latest.values[explanation.id]
                val flag = value?.let { Passport.flagOf(observation, it) }
                val isOpen = shown == explanation.id
                val range = Passport.rangeText(observation)
                val lastLine = value?.let { " · your last was ${Passport.format(observation, it)} ${observation.unit}" }.orEmpty()
                CareCard {
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = TouchTarget)
                            .clickable { shown = if (isOpen) "" else explanation.id }
                            .semantics(mergeDescendants = true) {
                                role = Role.Button
                                contentDescription = "${observation.label}. $range$lastLine." +
                                    (flag?.let { " ${Passport.chipFor(observation, value)}." } ?: "") +
                                    if (isOpen) " Open." else " Closed. Opens what this reading means."
                            },
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)
                    ) {
                        /* A chip only where a reading is outside its range. Seven rows each carrying
                           an identical “In range” is a badge that has stopped carrying information —
                           and the panel above has already said “All inside range” in words, so the
                           repetition bought nothing. What is left is a chip that means something
                           every time it appears.

                           StatusHeader rather than a pill dropped into this row: it already knows to
                           put the pill on its own line once the reader has enlarged the type, and
                           "Above range" set to one unbreakable line beside a two-line label is where
                           a card starts scrolling sideways. */
                        Box(Modifier.weight(1f)) {
                            if (flag != null && flag != "normal") StatusHeader(Passport.chipFor(observation, value), "amber") {
                                Text(observation.label, style = MaterialTheme.typography.titleSmall, color = Charcoal)
                                Note("$range$lastLine")
                            } else Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
                                Text(observation.label, style = MaterialTheme.typography.titleSmall, color = Charcoal)
                                Note("$range$lastLine")
                            }
                        }
                        Icon(
                            if (isOpen) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore,
                            null, tint = Charcoal, modifier = Modifier.size(20.dp)
                        )
                    }
                    if (isOpen) {
                        HorizontalDivider(color = StudioLine)
                        StatedBlock("What it measures", explanation.measures)
                        StatedBlock("A reading above the range", explanation.above)
                        StatedBlock("A reading below the range", explanation.below)
                        StatedBlock("What you can do", explanation.whatToDo)
                        /* The red flags, from the emergency contract by id. */
                        TonedCard(background = MangoSoft) {
                            Text(
                                "Not this screen: ${Explain.urgentConditions(explanation).joinToString(", ") { it.name.lowercase() }}. Any of those is an emergency and needs an ambulance rather than a reading.",
                                style = MaterialTheme.typography.bodyMedium, color = Charcoal
                            )
                            TextButton(
                                onClick = { open("Emergency & urgent care") },
                                Modifier.heightIn(min = TouchTarget), shape = ThusoButtonShape
                            ) { Text("Open Thuso SOS") }
                        }
                    }
                }
            }
        }

        /* Provenance, and it is on the screen rather than in a policy. A reader deciding how much
           weight to give four paragraphs about their own blood pressure is owed this. */
        Section("Where these words come from") {
            CareCard {
                StatedBlock("Written down, not generated", ExplainProvenance.written)
                HorizontalDivider(color = StudioLine)
                StatedBlock("No clinician has reviewed this wording", ExplainProvenance.unreviewed)
                HorizontalDivider(color = StudioLine)
                StatedBlock("The ranges are the nurse’s own", ExplainProvenance.ranges)
                HorizontalDivider(color = StudioLine)
                StatedBlock("Nothing here changes a medicine", ExplainProvenance.neverChange)
            }
            TonedCard { Text(Capabilities.blocking("screening").joinToString(" "), style = MaterialTheme.typography.bodyMedium, color = Charcoal) }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
            OutlinedButton(
                onClick = { open("Health trends") },
                Modifier.weight(1f).heightIn(min = TouchTarget), shape = ThusoButtonShape
            ) { Text("See how your readings have changed") }
        }
    }
}
