package za.co.mythuso.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import za.co.mythuso.model.*

/*
 * What a nurse has done that has not left this phone.
 *
 * The readings had a queue. The rest of the visit — the code checked at the door, the consent read
 * aloud, what she found, her signature — lived in `remember {}` on the assessment screen, which
 * meant the last thing that happens in a house was the least protected thing in the product. This
 * is the surface that shows it, and the store underneath it is VisitQueue.kt, which writes to the
 * phone rather than to memory.
 *
 * THREE THINGS IT HAS TO SAY, and they are the three a queue usually gets wrong.
 *
 *   WHAT IS HELD, in her words rather than in states. “Consent” and “What you found”, not four rows
 *   of an enum. The contract's six states are underneath and are shown; they are not the headline.
 *
 *   WHAT SHE CAN STILL DO. A screen that only says “no connection” has told a nurse standing in a
 *   kitchen that she is stuck, which is untrue and is the reason people start writing on paper. She
 *   can finish, sign, and start the next visit. What she cannot do is rely on anybody else having
 *   seen it, and that is said in the same breath rather than left to be assumed.
 *
 *   WHAT IT ACTUALLY SURVIVES. The web's version of this screen admits it is held in memory and
 *   lost on reload, because browser storage is refused across apps/web/src. Android has a file, so
 *   this screen does not copy an admission that is not its own: it names the four things the queue
 *   comes back from — closing the app, the process being killed, a crash, restarting the phone — and
 *   the three it does not, in FileBook's own words rather than in a second wording of them. There is
 *   a control below that proves the first list rather than asserting it.
 *
 * The composition is an argument. The one number a nurse opens this for is how much of her work is
 * still only here, so that is the lead and the only large figure on the screen. Everything under it
 * is the reason that number is allowed to be trusted.
 */

/* Charcoal on white with a stone hairline is this language's chip, and colour is never the only
   difference between two states — the chip says the word as well. Only the two that mean somebody
   has to do something take a tone. */
private fun toneOf(state: CaptureState): String = when (state) {
    CaptureState.CONFLICTED -> "amber"
    CaptureState.REFUSED -> "danger"
    else -> ""
}

@Composable fun VisitQueueScreen(store: PreviewStore, open: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    val queue = store.visitQueue
    val parts = queue.parts.toList()
    val held = parts.filter { it.state == CaptureState.CAPTURED }
    val sealed = parts.filter { it.isSealed }
    val conflicted = parts.filter { it.state == CaptureState.CONFLICTED }
    val stored = parts.filter { it.state == CaptureState.STORED }
    val pending = parts.filter { it.isPending }
    /* One number wherever she reads it. A nurse has not got two queues, so she must not be shown two
       counts: the readings still on the phone are counted here beside the parts. */
    val readingsWaiting = store.capture.readings.count {
        it.state == CaptureState.CAPTURED || it.state == CaptureState.QUEUED || it.state == CaptureState.SENDING
    }
    val waiting = pending.size + readingsWaiting
    val oldest = queue.oldestPendingMillis()

    ScreenColumn {
        DemoBadge()
        Heading("Nurse workspace", "What has not left this phone.",
            "Every piece of a visit you have finished, where it is, and what nobody else can do with it yet.")
        NotConnected(of = "clinical-records")
        /* The notice above says no real record exists behind this screen, and this screen is about
           work that is genuinely on the phone. Both are true, and a reader is owed the distinction
           rather than left to spot the contradiction: a record is the thing on the far side of a
           send, and there is nothing on the far side of a send yet. The notice is the contract's and
           is not softened; this sentence is the app's own and only says where the line is. */
        Note("Both are true at once. What is here is really here, written to a file and read back. A record is what would be on the other side of a send, and there is nothing there.")

        /* The lead: one figure, and the chip above it says what the phone's signal is before the
           reader reaches the number. */
        SPanel(tone = PanelTone.LEAD) {
            Metric(
                value = waiting.toString(),
                label = if (waiting == 1) "piece of work held on this phone" else "pieces of work held on this phone",
                chip = if (queue.pretendConnected) "Connected" else "No signal",
                flagged = false
            )
            /* One number wherever she reads it, and the readings are named in it rather than counted
               somewhere else — a nurse who is shown two counts will not believe either. */
            Note(
                when {
                    waiting == 0 -> "Nothing is waiting. Everything you have done has been answered for."
                    readingsWaiting == 0 -> "All of them are pieces of a visit. Nothing is waiting on the Thuso Kit." +
                        (oldest?.let { " The oldest was done ${ageText(it)}." } ?: "")
                    else -> "$readingsWaiting of them ${if (readingsWaiting == 1) "is a reading" else "are readings"} taken on the Thuso Kit, counted here so that “what is waiting” is one number wherever you read it." +
                        (oldest?.let { " The oldest was done ${ageText(it)}." } ?: "")
                }
            )
        }

        /* Directly under the number, because it is what the number is worth. */
        Section("What this phone keeps") {
            CareCard {
                QueueFact(Icons.Outlined.Save, "It comes back from", queue.survives)
                HorizontalDivider(color = Stone)
                QueueFact(Icons.Outlined.DeleteForever, "It does not come back from", queue.doesNotSurvive)
                HorizontalDivider(color = Stone)
                QueueFact(Icons.Outlined.Folder, "Where it is", queue.where)
                Note("It is not encrypted. This is a design preview holding fictional readings, and a file in the app’s own storage is private to the app and no more than that. Real readings need the controls in docs/PRIVACY-AND-SECURITY.md first.")
                /* In words rather than as a timestamp: “14:02” tells a nurse nothing about whether
                   what she is reading is this morning's or last Tuesday's. */
                Note("Read off the disk ${ageText(queue.readAtMillis)}" +
                    (if (queue.writtenMillis > 0) ", and last written ${ageText(queue.writtenMillis)}." else ", and not written since."))
                queue.storeNote.takeIf { it.isNotEmpty() }?.let { Note(it) }
                queue.setAside?.let { Note("The ledger that would not parse is still on this phone, under the name $it. Nothing was deleted.") }
                /* This is the screen a nurse opens to ask whether her work is safe, so a disk that
                   would not take it is said here in full and in the book's own words. Warm ink: it
                   is the one thing under this heading that is a problem rather than a limit. */
                (queue.writeState as? LedgerWrite.Refused)?.let {
                    Text(it.reason, style = MaterialTheme.typography.bodyMedium, color = MangoInk)
                }
                (store.capture.writeState as? LedgerWrite.Refused)?.let {
                    Text("The readings ledger as well. ${it.reason}", style = MaterialTheme.typography.bodyMedium, color = MangoInk)
                }
            }
        }

        if (held.isNotEmpty()) Section("Held on this phone") {
            Note("Not sealed yet, because the visit is not finished. Signing the assessment seals everything it holds at once.")
            held.forEach { VisitPartCard(it) }
        }

        Section("Sealed, waiting for a connection") {
            if (sealed.isEmpty()) EmptyStateCard(
                "Nothing is sealed",
                "An empty queue means every piece of every visit on this phone has been answered for."
            ) else {
                sealed.forEach { VisitPartCard(it) }
                val sending = parts.any { it.state == CaptureState.SENDING }
                Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
                    if (sending) OutlinedButton(
                        onClick = { queue.interruptSend() },
                        Modifier.weight(1f).heightIn(min = TouchTarget), shape = ThusoButtonShape
                    ) { Text("Interrupt the send") }
                    /* Two steps with a pause between them, because “sending” is a state a nurse can
                       watch fail, and a queue whose in-flight state is invisible is a queue nobody
                       believes. Interrupting inside the pause puts the work back in the queue and
                       the settle that follows finds nothing in flight and does nothing. */
                    else Button(
                        onClick = {
                            if (queue.beginSending() > 0) scope.launch {
                                delay(700)
                                queue.settle(store.vetting, store.capture, store.signedVisits.toSet())
                            }
                        },
                        Modifier.weight(1f).heightIn(min = TouchTarget),
                        enabled = queue.pretendConnected && queue.queued.isNotEmpty(),
                        shape = ThusoButtonShape
                    ) { Text("Send ${queue.queued.size} ${if (queue.queued.size == 1) "piece" else "pieces"}") }
                }
                if (!queue.pretendConnected) Note("Sending needs a connection. Nothing is dropped to make a send succeed and nothing is retried behind your back.")
                queue.lastAttempt?.let {
                    Text(it, style = MaterialTheme.typography.bodyMedium, color = Charcoal,
                        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
                }
            }
        }

        if (conflicted.isNotEmpty()) Section("Needs a decision") {
            TonedCard { Text(captureRules.first { it.second == "conflictsAreNotMerged" }.first,
                style = MaterialTheme.typography.bodyMedium, color = Charcoal) }
            conflicted.forEach { VisitPartCard(it) }
            Note("Nothing here is filed and nothing is thrown away. A reading that two clinicians disagree about is settled on the Thuso Kit surface, where both versions can be put side by side; a whole assessment that arrives against a signed record goes to the Control Tower.")
        }

        /* What she can still do, said beside what she cannot. Two lists of the same weight, because
           a screen that only carries the second one has told somebody in a kitchen she is stuck. */
        if (!queue.pretendConnected) Section("With no signal") {
            CareCard {
                Text("You can still", style = MaterialTheme.typography.titleMedium, color = Charcoal)
                listOf(
                    "Finish this visit and sign it off. The signature is real work and it is kept.",
                    "Take readings from a paired instrument, which queue the same way.",
                    "Start the next visit on your list. Two visits queue separately and never answer for each other.",
                    "Close the app, or let the phone restart. What is here is on the disk and is read back on the way in."
                ).forEach { QueueBullet(Icons.Outlined.Check, it) }
            }
            CareCard {
                Text("Until it sends, nobody else has it", style = MaterialTheme.typography.titleMedium, color = Charcoal)
                listOf(
                    "None of it is in the patient’s Health Passport.",
                    "No doctor can read it, so no prescription, sick note or referral can follow from it.",
                    "The Control Tower does not know this visit is done.",
                    "Uninstalling MyThuso, or clearing its storage, takes it with them. That is the one way to lose it."
                ).forEach { QueueBullet(Icons.Outlined.Block, it) }
            }
        }

        if (stored.isNotEmpty()) Section("This phone’s copy of the record") {
            stored.forEach { VisitPartCard(it) }
        }

        Section("Design-review controls") {
            CareCard {
                Note("None of these is a product feature. There is no radio in this build and no doctor to sign anything, so the two things that make a queue interesting have to be askable for.")
                Setting("Pretend this phone has a connection", queue.pretendConnected) { queue.pretendConnected = it }
                Setting("Pretend a doctor has signed this visit", queue.pretendDoctorSigned) { queue.pretendDoctorSigned = it }
                HorizontalDivider(color = Stone)
                /* The control that proves the sentence above rather than asserting it: everything in
                   memory is dropped and the file is read again. */
                OutlinedButton(
                    onClick = { queue.reload() },
                    Modifier.fillMaxWidth().heightIn(min = TouchTarget), shape = ThusoButtonShape
                ) { Text("Drop what is in memory and read the file again") }
                Note("A cold launch without the launch. What comes back is what a restart would give you.")
                TextButton(
                    onClick = { queue.forgetEverything() },
                    Modifier.fillMaxWidth().heightIn(min = TouchTarget), shape = ThusoButtonShape
                ) { Text("Clear the demonstration ledger") }
                Note("In the product there is no such button: a part is superseded or withdrawn with a reason, never erased.")
            }
        }

        Section("The readings queue") {
            PlainRow("Open the Thuso Kit queue", "$readingsWaiting still on this phone") { open("Capture queue") }
        }
    }
}

/** One row of the "what this phone keeps" card: a symbol, a name and the sentence behind it. */
@Composable private fun QueueFact(icon: ImageVector, label: String, sentence: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12), verticalAlignment = Alignment.Top) {
        TileIcon(icon, size = 36.dp)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
            Text(label, style = MaterialTheme.typography.titleSmall, color = Charcoal)
            Text(sentence, style = MaterialTheme.typography.bodyMedium, color = BodyText)
        }
    }
}

@Composable private fun QueueBullet(icon: ImageVector, text: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8), verticalAlignment = Alignment.Top) {
        Icon(icon, null, tint = Charcoal, modifier = Modifier.size(18.dp).padding(top = 2.dp))
        Text(text, style = MaterialTheme.typography.bodyMedium, color = BodyText, modifier = Modifier.weight(1f))
    }
}

/* One part.
 *
 * Two clocks, always both. The phone's is labelled as what the phone believed; the receipt is what
 * everything is ordered by, and where there is none the row says nothing has ordered it yet rather
 * than showing the first time as though it were the second. */
@Composable fun VisitPartCard(part: VisitPart, current: String? = null) {
    val conflict = captureConflictById(part.conflictId)
    CareCard {
        StatusHeader(part.state.label, toneOf(part.state)) {
            Text(part.kind.partName, style = MaterialTheme.typography.titleMedium, color = Charcoal)
            Note(part.summary)
        }
        /* Which visit this is, always — and “another visit” only where there is a visit for it to be
           other than. On the queue every card is somebody else's house, so calling each one “another
           visit” said nothing; on the assessment, where one visit is open, it is the whole point. */
        Note(
            when {
                current == null -> "${part.visit} · ${part.patient}"
                part.visit != current -> "From ${part.visit} · ${part.patient} — another visit, queued on its own."
                else -> "${part.visit} · ${part.patient} — this visit."
            }
        )
        part.detail.forEach { ReviewLine(it.label, it.value) }
        Note("On this phone, ${ageText(part.deviceMillis)}.")
        if (part.isPending) Text(
            part.kind.whileHeld, style = MaterialTheme.typography.bodyMedium, color = BodyText
        )
        conflict?.let {
            Text("${it.name}. ${it.detail}", style = MaterialTheme.typography.bodyMedium, color = MangoInk,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
        }
        part.note?.let { Note(it) }
        /* Two clocks, and the label says which this one is without taking three lines to do it: at
           393dp “Server receipt · what this is ordered by” left the timestamp beside it wrapping
           onto three. The qualification moves underneath, where it has the width. */
        part.serverMillis?.let {
            ReviewLine("Server receipt", stampText(it))
            Note("The server's own receipt time, and the only clock anything here is ordered by.")
        }
    }
}

/* ---- The strip -------------------------------------------------------------------------------
   One line, above the work, on every stage of the assessment. It is the answer to “has any of this
   left the phone”, which is a question a nurse asks by looking rather than by opening something. */
@Composable fun VisitQueueStanding(store: PreviewStore, open: (String) -> Unit) {
    val queue = store.visitQueue
    val waiting = queue.parts.count { it.isPending } + store.capture.readings.count {
        it.state == CaptureState.CAPTURED || it.state == CaptureState.QUEUED || it.state == CaptureState.SENDING
    }
    val connected = queue.pretendConnected
    /* "Held on this phone, and kept there if it closes" is a promise about the disk, so it is only
       said once the disk has taken it. Both ledgers write on a thread of their own, so for a few
       milliseconds after a tap the work is in memory and not yet written — and a strip that says
       "kept if it closes" during that window is saying the one thing that is not yet true. A refused
       write is not a quieter version of the same sentence either: it is the opposite, and it is the
       sentence a nurse most needs, so it replaces the line rather than sitting under it. */
    val writing = listOf(queue.writeState, store.capture.writeState)
    val refused = writing.filterIsInstance<LedgerWrite.Refused>().firstOrNull()
    val settling = writing.any { it is LedgerWrite.Writing }
    val detail = when {
        refused != null -> refused.reason
        waiting == 0 -> "Nothing is waiting. Everything you have done has reached the record."
        settling -> "$waiting ${if (waiting == 1) "piece" else "pieces"} of work, being written to this phone now."
        else -> "$waiting ${if (waiting == 1) "piece" else "pieces"} of work held on this phone, and kept there if it closes."
    }
    /* Cloud either way, and the difference between connected and not is the icon and the word. A
       warm tint for those two would say “no signal” is a problem, and the whole argument of this
       feature is that it is not one: the nurse is not stuck, her work is kept, and what she has lost
       is only other people's sight of it.
       A disk that would not take the write is the one state on this strip that *is* a problem — her
       work is not kept — so it is the one that takes the warm ink. It changes the icon and the words
       as well, because a person who cannot tell these two apart by colour has to be able to. */
    val heading = when {
        refused != null -> "Not written down"
        connected -> "Connected"
        else -> "No signal"
    }
    val mark = when {
        refused != null -> Icons.Outlined.WarningAmber
        connected -> Icons.Outlined.CloudDone
        else -> Icons.Outlined.CloudOff
    }
    val ink = if (refused != null) MangoInk else Charcoal
    TonedCard(background = Cloud) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = TouchTarget)
                .semantics(mergeDescendants = true) {
                    contentDescription = "$heading. $detail Opens the visit queue."
                },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)
        ) {
            Icon(mark, null, tint = ink, modifier = Modifier.size(20.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
                Text(heading, style = MaterialTheme.typography.titleSmall, color = ink)
                Text(detail, style = MaterialTheme.typography.bodySmall, color = if (refused != null) MangoInk else BodyText)
            }
            TextButton(onClick = { open("Visit queue") }, Modifier.heightIn(min = TouchTarget), shape = ThusoButtonShape) { Text("Open") }
        }
    }
}
