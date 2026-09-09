package za.co.mythuso.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Block
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.HourglassEmpty
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import za.co.mythuso.model.*

/* Interpreters.

   The guidance for this already existed and was rendered on all three platforms; what did not exist
   was any of it working. So the three parts of this screen are the three things that were missing,
   in the order somebody would meet them.

   The roster, and the arithmetic on it. Four fictional interpreters with real-shaped availability,
   and one control that asks the only question that matters: if I ask for this hour, what happens?
   The answer is one of three, and the third is the one worth building a screen for — nobody is free
   and nobody can say when one will be. That state prints the contract's sentence rather than a
   number, because there is no number, and printing the day that was asked for or a cheerful "soon"
   is how a person ends up taking a morning off work for a visit that was never going to happen.

   The hold. A visit that needs an interpreter and has not got one is not confirmed and is not
   dispatched — it waits, and it says on the face of it that it is waiting. The way out of the wait
   is free, at any point, with no notice period, and it is recorded against MyThuso rather than
   against the patient: a service that files its own failures under the patient's name will keep
   failing and will look, in its own figures, like a service nobody wanted.

   The refusals. A family member is never the interpreter and a child never is at all, and the screen
   says why rather than merely making the option absent — an absent option teaches nobody, and the
   person who needs the reason is the relative standing in the room offering to help.

   Nothing here contacts an interpreter, holds a real visit or books anybody's time. Every person on
   the roster is fictional, and the accreditation route in the vetting table is drafted rather than
   confirmed with the body it names. */

@Composable private fun ChoiceRow(label: String, selected: Boolean, choose: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp)
            .selectable(selected = selected, role = Role.RadioButton, onClick = choose)
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        RadioButton(selected, null)
        Text(label, style = MaterialTheme.typography.bodyMedium, color = Charcoal)
    }
}

@Composable fun InterpretingScreen() {
    var required by remember { mutableStateOf(true) }
    var mode by remember { mutableStateOf(interpretingModes.first().id) }
    val days = Scheduling.offeredDays()
    var dayIndex by remember { mutableIntStateOf(0) }
    var slot by remember { mutableStateOf("09:00") }
    var cancelled by remember { mutableStateOf(false) }

    val askIso = days[dayIndex.coerceIn(0, days.lastIndex)].date.toString()
    val outcome = Interpreting.resolve(mode, askIso, slot)

    ScreenColumn {
        DemoBadge()
        Heading("Language and access", interpretingLabels.heading, Interpreting.rule("one-roster").sentence)

        CareCard {
            Setting(interpretingLabels.requirementOn, required) { required = it }
            Note(Interpreting.rule("requirement-travels").sentence)
            Note(interpreterCost.sentence)
        }

        Text(interpretingLabels.chooseMode, style = MaterialTheme.typography.titleMedium, color = Charcoal)
        CareCard {
            interpretingModes.forEach { option ->
                ChoiceRow(option.name, mode == option.id) { mode = option.id; cancelled = false }
            }
            Note(Interpreting.mode(mode).detail)
            Note(Interpreting.mode(mode).note)
        }

        Text(interpretingLabels.rosterHeading, style = MaterialTheme.typography.titleMedium, color = Charcoal)
        interpreterRoster.filter { it.mode == mode }.forEach { person ->
            val hours = Interpreting.availability(mode).filter { it.interpreter.id == person.id }
            CareCard {
                Text(person.name, style = MaterialTheme.typography.titleMedium, color = Charcoal)
                Note("${interpreterAccreditation.short} ${person.reference} · ${person.area}")
                Note(person.settings.joinToString(", "))
                Text(
                    if (hours.isEmpty()) interpretingLabels.modeUnavailable
                    else "Free " + hours.joinToString(" · ") { "${Scheduling.shortDate(it.date)} ${it.slot}" },
                    style = MaterialTheme.typography.bodyMedium, color = BodyText
                )
            }
        }
        Note(interpreterEstimate.horizonNote)

        Text("Ask for an hour", style = MaterialTheme.typography.titleMedium, color = Charcoal)
        CareCard {
            days.forEachIndexed { index, day ->
                ChoiceRow("${day.weekday} ${day.dayNumber} ${day.month}", dayIndex == index) { dayIndex = index; cancelled = false }
            }
        }
        CareCard {
            SchedulingData.slots.forEach { hour ->
                ChoiceRow(hour, slot == hour) { slot = hour; cancelled = false }
            }
        }

        /* Three states and only three. The third is not a quieter version of the other two — it
           carries the danger colour the refusals carry, because a person reading it is being told to
           make another plan, and "we do not know" set in grey under a number-shaped layout gets read
           as "soon". */
        CareCard {
            when (outcome) {
                is InterpreterOutcome.Matched -> {
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
                        Icon(Icons.Outlined.CheckCircle, null, tint = Charcoal)
                        Text(interpretingLabels.matched, style = MaterialTheme.typography.titleMedium, color = Charcoal)
                    }
                    Text(Interpreting.waitSentence(outcome), style = MaterialTheme.typography.bodyMedium, color = Charcoal)
                    Note("The visit is confirmed with ${outcome.slot.interpreter.name} named on it. Nothing is booked in this preview.")
                }
                is InterpreterOutcome.Held -> {
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
                        Icon(Icons.Outlined.HourglassEmpty, null, tint = MangoInk)
                        Text("${interpretingLabels.noneFree} — ${interpretingLabels.heldBadge}", style = MaterialTheme.typography.titleMedium, color = Charcoal)
                    }
                    Text(Interpreting.waitSentence(outcome), style = MaterialTheme.typography.bodyMedium, color = Charcoal)
                    Note(interpreterHold.sentence)
                    Note(interpreterHold.whatHappensNext)
                }
                InterpreterOutcome.HeldUnknown -> {
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
                        Icon(Icons.Outlined.WarningAmber, null, tint = Danger)
                        Text("${interpretingLabels.noneFree} — ${interpretingLabels.heldBadge}", style = MaterialTheme.typography.titleMedium, color = Charcoal)
                    }
                    Text(interpreterEstimate.unknown, style = MaterialTheme.typography.titleMedium, color = Danger)
                    Note(interpreterEstimate.unknownDetail)
                }
            }
            if (outcome.isHeld) {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
                    Icon(Icons.Outlined.Block, null, tint = Danger)
                    Text(interpreterHold.whyNotDispatched, style = MaterialTheme.typography.bodyMedium, color = BodyText)
                }
            }
        }

        if (outcome.isHeld) {
            CareCard {
                Text(interpreterHold.title, style = MaterialTheme.typography.titleMedium, color = Charcoal)
                ReviewLine("Cancelling costs", "R${interpreterCancellation.fee}.00")
                Note(interpreterCancellation.sentence)
                Note(interpreterCancellation.notThePatientsChoice)
                Note(interpreterCancellation.keepsTheRequirement)
                OutlinedButton(onClick = { cancelled = true }, enabled = !cancelled, modifier = Modifier.heightIn(min = 48.dp), shape = ThusoButtonShape) {
                    Text(interpreterCancellation.label)
                }
                if (cancelled) {
                    Note("Recorded against ${interpreterCancellation.attributedTo}, not against the patient. Nothing was cancelled — this is a preview.")
                }
            }
        }

        Text(interpretingLabels.vettingHeading, style = MaterialTheme.typography.titleMedium, color = Charcoal)
        Note(Interpreting.rule("vetted-like-anybody-else").sentence)
        CareCard {
            Interpreting.role()?.checks?.forEach { check ->
                Column(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(check.name, style = MaterialTheme.typography.titleMedium, color = Charcoal)
                    Note(check.detail)
                    Note(check.renewMonths?.let { "Renewed every $it months" } ?: "Once")
                }
            }
            Interpreting.role()?.grants?.firstOrNull()?.let { Note(it.refusal) }
        }
        /* Drafted, and said so on the screen rather than in a commit message. The same rule the
           locale table is held to: a claim that something was checked needs a name, an organisation
           and a day. */
        CareCard {
            Text(
                "${interpreterAccreditation.body} (${interpreterAccreditation.short}) — " +
                    if (interpreterAccreditation.isConfirmed) "confirmed" else "drafted, not confirmed",
                style = MaterialTheme.typography.titleMedium, color = Danger
            )
            Note(interpreterAccreditation.route)
            Note(interpreterAccreditation.uncertainty)
            Note(interpreterAccreditation.whatWouldMakeItTrue)
        }

        Text(interpretingLabels.refusalsHeading, style = MaterialTheme.typography.titleMedium, color = Charcoal)
        interpretingRefusals.forEach { refusal ->
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
                Icon(Icons.Outlined.Block, null, tint = Danger)
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(refusal.title, style = MaterialTheme.typography.titleMedium, color = Charcoal)
                    Text(refusal.sentence, style = MaterialTheme.typography.bodyMedium, color = BodyText)
                }
            }
        }

        Text("The rules this screen is built out of", style = MaterialTheme.typography.titleMedium, color = Charcoal)
        interpretingRules.forEach { rule ->
            CareCard {
                Text(rule.title, style = MaterialTheme.typography.titleMedium, color = Charcoal)
                Text(rule.sentence, style = MaterialTheme.typography.bodyMedium, color = BodyText)
            }
        }
        Note(interpretingNotYetBuilt)
    }
}
