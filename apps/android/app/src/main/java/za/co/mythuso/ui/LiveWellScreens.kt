package za.co.mythuso.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.DirectionsWalk
import androidx.compose.material.icons.outlined.Bedtime
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.Medication
import androidx.compose.material.icons.outlined.RestaurantMenu
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import za.co.mythuso.model.FramingData
import za.co.mythuso.model.PreviewStore
import za.co.mythuso.model.Wellbeing
import za.co.mythuso.model.WellbeingData
import za.co.mythuso.model.WellbeingEntry
import za.co.mythuso.model.WellbeingHabit
import za.co.mythuso.model.wellbeingHabits
import za.co.mythuso.model.wellbeingRefusals

/* LIVE WELL — the one screen in this product that talks to somebody about their own body with no
   clinician in the room.

   WHAT IS NOT DRAWN HERE IS THE DESIGN. There is no chart, no ring, no bar, no figure set large, no
   chip saying how a week went and no colour that means good. Every one of those is an ordinary,
   well-meant thing to put on a healthy-living screen and each of them would be this product forming
   an opinion about somebody's health on a screen no clinician has seen. packages/catalog/
   wellbeing.json names them and scripts/check-boundaries.mjs fails the build on the words.

   SO THE HIERARCHY HAD TO COME FROM SOMEWHERE ELSE, AND IT COMES FROM THE ORDER. The screen has two
   subjects and they are the two halves of a diary: the prompt to write something, and what has been
   written. Both are plain white cards on paper with a hairline, because the loud object on this
   screen is the one lime button, and there is exactly one of it — the habit a person has opened.
   Five lime "write it down" pills down one list would be five calls to action of equal weight, and
   the tile-plate rule this file's neighbours already carry says the same thing about six lime plates
   in a row.

   THE DARK CARD IS SPENT ON THE ONE THING THAT LEAVES THIS SCREEN. Every screen in this language
   gets one near-black card and spends it on what is live. Nothing is live here — nothing is
   measured, nothing arrives — so it goes to the only action with a consequence: taking what you
   wrote to somebody who can read it. That is the whole feature, as the contract says: not an
   integration, a prompt to bring it.

   THE REFUSALS ARE THE LAST PANEL AND THEY ARE ALL TEN. They are not a footnote and they are not
   behind an expander. They are rendered word for word from the contract, in the order it holds
   them, and a reader who scrolls to the bottom of this screen has read what MyThuso will not say
   about them. */

/* A mark per habit, and no fill behind any of them. A coloured plate on every row would be five
   decorations carrying no information — and on this screen in particular a green one would be the
   product saying something approving about a body. "How you are" takes a speech bubble rather than
   a face: a smiling or frowning mark is a mood scale drawn as an icon, which is the one thing the
   feeling habit is written to avoid. */
private val habitMarks = mapOf(
    "moving" to Icons.AutoMirrored.Outlined.DirectionsWalk,
    "eating" to Icons.Outlined.RestaurantMenu,
    "sleeping" to Icons.Outlined.Bedtime,
    "feeling" to Icons.Outlined.ChatBubbleOutline,
    "medicines" to Icons.Outlined.Medication
)

@Composable fun LiveWellScreen(store: PreviewStore, open: (String) -> Unit) {
    /* The habit whose note is open, if any. One at a time, which is what keeps a single accent
       object on the screen and a single field for the keyboard to attach to. */
    var writing by remember { mutableStateOf<String?>(null) }
    var draft by remember { mutableStateOf("") }

    ScreenColumn {
        DemoBadge()
        FramingData.byId("live-well")?.let { StudioHeadline(it.lead, it.accent, WellbeingData.statement) }
        /* The standing disclosure, and it is clinical-records rather than a capability of this
           feature's own — there is no wellbeing supplier to be blocked on, and inventing one would
           be inventing a gap. */
        NotConnected(WellbeingData.capability)

        Section("Write something down") {
            CareCard(padding = ThusoSpacing.space12) {
                wellbeingHabits.forEachIndexed { index, habit ->
                    HabitRow(habit, writing == habit.id) {
                        if (writing == habit.id) writing = null else { writing = habit.id; draft = "" }
                    }
                    if (writing == habit.id) HabitNote(habit, draft, { draft = it }) {
                        store.wellbeing.add(0, Wellbeing.written(habit.id, draft))
                        writing = null
                        draft = ""
                    }
                    if (index < wellbeingHabits.size - 1) HorizontalDivider(color = StudioLine)
                }
            }
        }

        Section("What you have written") {
            Text(WellbeingData.timeline, style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
            if (store.wellbeing.isEmpty()) {
                /* The empty state is the contract's own sentence and it is the best one in the file.
                   An empty diary is the state a product is most tempted to nag in. */
                EmptyStateCard(
                    "Nothing written yet",
                    WellbeingData.refusal("no-punished-gap")?.sentence.orEmpty()
                )
            } else {
                /* Newest first, under the day it was written on. A day with nothing on it has no
                   row: the timeline draws what is there and says nothing about what is not. */
                Wellbeing.ordered(store.wellbeing).groupBy { it.dayOffset }.forEach { (offset, entries) ->
                    Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
                        Text(
                            Wellbeing.day(offset).uppercase(),
                            style = MaterialTheme.typography.labelSmall, letterSpacing = 0.8.sp,
                            color = StudioInkMuted, modifier = Modifier.semantics { heading() }
                        )
                        CareCard(padding = ThusoSpacing.space12) {
                            entries.forEachIndexed { index, entry ->
                                EntryRow(entry)
                                if (index < entries.size - 1) HorizontalDivider(color = StudioLine)
                            }
                        }
                    }
                }
            }
        }

        StudioNightCard {
            Text(
                WellbeingData.bringIt, style = MaterialTheme.typography.titleLarge,
                color = StudioNightInk, fontWeight = FontWeight.SemiBold
            )
            Text(WellbeingData.bringItHowItWorks, style = MaterialTheme.typography.bodyMedium, color = StudioNightInkQuiet)
            StudioButton({ open("Visits") }, Modifier.heightIn(min = TouchTarget)) { Text("Open my visits") }
        }

        Section("What this is not") {
            /* Sixteen rather than twelve between the sentences. At the card's default gap the ten
               refusals read as one grey block, and they are ten separate things MyThuso will not
               do. */
            CareCard {
                /* The lead sentence is charcoal and the ten under it are the muted ink, which is the
                   only hierarchy this panel has and the only one it needs. Nothing is behind an
                   expander: a refusal a reader has to open is a refusal somebody has decided they
                   would rather not have read. */
                Text(WellbeingData.isNot, style = MaterialTheme.typography.bodyMedium, color = Charcoal)
                HorizontalDivider(color = StudioLine)
                Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space16)) {
                    wellbeingRefusals.forEach { refusal ->
                        Text(refusal.sentence, style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted)
                    }
                }
            }
        }
    }
}

/* The row is the disclosure. Tapping it opens the note under it and tapping it again closes it, so
   there is no second control to explain and nothing to cancel — a half-written line that is never
   written down was never a record of anything.

   The prompt is on the row rather than inside the field, because a placeholder disappears the moment
   somebody starts typing, which is exactly when a person looks back up to check they are answering
   the right question. */
@Composable private fun HabitRow(habit: WellbeingHabit, open: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick)
            .heightIn(min = TouchTarget).padding(vertical = ThusoSpacing.space8)
            /* One node, announced as a button, and TalkBack is told which way it is: a chevron is a
               picture and the only thing carrying the open/shut state otherwise. */
            .semantics(mergeDescendants = true) {
                role = Role.Button
                stateDescription = if (open) "Open" else "Closed"
            },
        horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)
    ) {
        Icon(habitMarks[habit.id] ?: Icons.Outlined.EditNote, null, tint = StudioInkMuted, modifier = Modifier.size(22.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(habit.name, style = MaterialTheme.typography.titleSmall, color = Charcoal)
            /* The prompt is on the row while the row is shut and on the field while it is open. It
               was on both, which printed the question twice a few dp apart, and the second copy was
               the one attached to the box somebody was answering it in. A question belongs to the
               field that answers it. */
            if (!open) Text(habit.prompt, style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
        }
        Icon(
            if (open) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore, null,
            tint = StudioInkMuted, modifier = Modifier.size(20.dp)
        )
    }
}

/* Somebody's own words, and nothing else. No picker beside it, no quick answers to tap, no field
   that takes a figure — the keyboard is the default one, and the build fails on a numeric keyboard
   type anywhere in this feature. The button is disabled until there is something to write down,
   because an empty entry is a day a person did not write on, and the contract is explicit that such
   a day is just a day. */
@Composable private fun HabitNote(habit: WellbeingHabit, draft: String, onDraft: (String) -> Unit, onWrite: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().padding(bottom = ThusoSpacing.space12),
        verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)
    ) {
        OutlinedTextField(
            draft, { onDraft(it.take(600)) },
            label = { Text(habit.prompt) },
            textStyle = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.fillMaxWidth().heightIn(min = 110.dp),
            shape = RoundedCornerShape(ThusoRadius.control),
            colors = OutlinedTextFieldDefaults.colors(
                unfocusedContainerColor = Color.White, focusedContainerColor = Color.White,
                unfocusedBorderColor = StudioInkMuted, unfocusedLabelColor = StudioInkMuted
            )
        )
        StudioButton(onWrite, Modifier.heightIn(min = TouchTarget), enabled = draft.isNotBlank()) {
            Text("Write it down")
        }
    }
}

/* The habit's name and then the person's words, and the words are the charcoal ones. It is the other
   way round from every clinical row in this app, where the label leads and the value is the measured
   thing — here the measured thing does not exist and what somebody said is the whole record. */
@Composable private fun EntryRow(entry: WellbeingEntry) {
    Column(
        Modifier.fillMaxWidth().padding(vertical = ThusoSpacing.space8)
            .semantics(mergeDescendants = true) {},
        verticalArrangement = Arrangement.spacedBy(2.dp)
    ) {
        Text(WellbeingData.habit(entry.habit)?.name ?: entry.habit, style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
        Text(entry.text, style = MaterialTheme.typography.bodyMedium, color = Charcoal)
    }
}

/* The More index's way in. It lives here rather than in the index because the row and the screen it
   opens are one decision: whatever this row promises is what the next screen has to be. */
@Composable fun LiveWellRow(open: (String) -> Unit) {
    MenuRow("Live well", "What you did, in your own words", Icons.Outlined.EditNote) { open("Live well") }
}
