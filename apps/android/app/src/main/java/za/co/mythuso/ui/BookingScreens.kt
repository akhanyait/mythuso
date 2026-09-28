package za.co.mythuso.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Phone
import androidx.compose.material.icons.outlined.Verified
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import za.co.mythuso.model.*
import za.co.mythuso.ui.components.*
import java.time.Instant
import java.time.format.DateTimeFormatter

/* Choosing who comes, where a booking stands, and the thread between a patient and the nurse on one visit.
 *
 * Every sentence here is packages/catalog/booking.json's, through the generated BookingData, and every
 * decision is model/Booking.kt's — the same refusals, in the same order, as the web and the Access engine.
 * These composables draw what those two say and add nothing of their own:
 *
 *  - a nurse who is not offered is still shown, with the booking capability's sentence beside her name,
 *    because a list that silently drops the nurse somebody saw last time cannot tell them why;
 *  - the badge is said in words on every row, so its colour is never the only thing that says it;
 *  - a booking's state is a list of the contract's three states with a standing word beside each;
 *  - the thread says it is simulated, that it is not a record and that nobody watches it — the last of
 *    those above the field, before anything is typed — and there is no attachment control of any kind.
 *
 * Nothing here books, sends or dispatches anything, and each screen carries the capability's notice. */

@Composable fun NurseChoiceStep(options: PersonOptions, person: String, choice: String, nurseId: String?, onChoose: (String, String?) -> Unit) {
    val first = person.substringBefore(' ')
    val option = { id: String -> BookingData.Person.options.first { it.id == id } }
    Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
        Text(BookingData.Person.lead, style = MaterialTheme.typography.bodyMedium, color = theme.mutedForeground)
        option(Booking.NEAREST).let { ChoiceRow(it.name, it.detail, choice == Booking.NEAREST) { onChoose(Booking.NEAREST, null) } }
        val previous = options.previous
        val previousWords = option(Booking.PREVIOUS)
        if (previous != null && previous.offered) {
            ChoiceRow(previousWords.name, "${previous.subject.name} · ${BookingData.Person.badgeName}. ${previousWords.detail}", choice == Booking.PREVIOUS) {
                onChoose(Booking.PREVIOUS, previous.subject.id)
            }
        } else {
            TonedCard(Modifier.semantics(mergeDescendants = true) {}) {
                Text(previousWords.name, style = MaterialTheme.typography.titleSmall, color = theme.foreground)
                Text(
                    if (previous != null) Booking.fill(Booking.fill(BookingData.Person.previousNotOffered, "person", first), "reason", previous.notOfferedBecause ?: "")
                    else Booking.fill(BookingData.Person.noPrevious, "person", first),
                    style = MaterialTheme.typography.bodySmall, color = theme.foreground
                )
            }
        }
        option(Booking.NAMED).let { ChoiceRow(it.name, it.detail, choice == Booking.NAMED) { onChoose(Booking.NAMED, nurseId) } }
        if (choice == Booking.NAMED) {
            Text(BookingData.Person.namedHeading, style = MaterialTheme.typography.titleSmall, color = theme.foreground, modifier = Modifier.semantics { heading() })
            options.offered.forEach { candidate ->
                ChoiceRow(
                    candidate.subject.name,
                    "${Booking.fill(BookingData.Person.worksIn, "zone", candidate.subject.zone ?: "")} · ${BookingData.Person.badgeName}",
                    nurseId == candidate.subject.id,
                    description = BookingData.Person.badgeSentence
                ) { onChoose(Booking.NAMED, candidate.subject.id) }
            }
        }
        Text(BookingData.Person.continuity, style = MaterialTheme.typography.bodySmall, color = theme.mutedForeground)
        if (options.notOffered.isNotEmpty()) {
            Text(BookingData.Person.notOfferedHeading, style = MaterialTheme.typography.titleSmall, color = theme.foreground, modifier = Modifier.semantics { heading() })
            TonedCard {
                options.notOffered.forEachIndexed { index, candidate ->
                    if (index > 0) HorizontalDivider(color = theme.border)
                    Column(Modifier.fillMaxWidth().semantics(mergeDescendants = true) {}, verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
                        Text(candidate.subject.name, style = MaterialTheme.typography.titleSmall, color = theme.foreground)
                        Text(candidate.subject.zone ?: "", style = MaterialTheme.typography.bodySmall, color = theme.mutedForeground)
                        Text(candidate.notOfferedBecause ?: "", style = MaterialTheme.typography.bodySmall, color = theme.foreground)
                    }
                }
            }
        }
    }
}

/* A radio row with the design system's control radius. The selected row carries the radio mark as well as
   the fill, so the fill is never the only difference. */
@Composable private fun ChoiceRow(title: String, detail: String, chosen: Boolean, description: String? = null, choose: () -> Unit) {
    val shape = RoundedCornerShape(ThusoRadius.control)
    Row(
        Modifier.fillMaxWidth().heightIn(min = TouchTarget).clip(shape)
            .background(if (chosen) theme.accent.tint(0.15f) else theme.surface)
            .border(1.dp, if (chosen) theme.accent else theme.border, shape)
            .clickable(role = androidx.compose.ui.semantics.Role.RadioButton, onClick = choose)
            .semantics(mergeDescendants = true) { selected = chosen; description?.let { stateDescription = it } }
            .padding(ThusoSpacing.space8),
        verticalAlignment = Alignment.CenterVertically
    ) {
        RadioButton(chosen, null)
        Column(Modifier.weight(1f).padding(ThusoSpacing.space8), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
            Text(title, style = MaterialTheme.typography.titleSmall, color = theme.foreground)
            Text(detail, style = MaterialTheme.typography.bodySmall, color = theme.mutedForeground)
        }
    }
}

/* Where a booking stands: the contract's three states in order, each with its standing in words. Cancelled
   is drawn only when it happened. */
@Composable fun BookingStatus(history: List<String>, asap: Boolean) {
    val current = history.lastOrNull() ?: "requested"
    CareCard {
        Text(BookingData.statusHeading, style = MaterialTheme.typography.titleMedium, color = theme.foreground, modifier = Modifier.semantics { heading() })
        BookingData.states.filter { it.id != "cancelled" || current == "cancelled" }.forEach { state ->
            val reached = state.id in history
            val standing = when {
                state.id == current -> BookingData.StatusWords.current
                reached -> BookingData.StatusWords.reached
                else -> BookingData.StatusWords.waiting
            }
            Row(Modifier.fillMaxWidth().semantics(mergeDescendants = true) {}, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
                Box(
                    Modifier.padding(top = ThusoSpacing.space4).size(16.dp).clip(CircleShape)
                        .background(if (reached) theme.primary else theme.surface)
                        .border(2.dp, if (reached) theme.primary else theme.border, CircleShape)
                )
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8), verticalAlignment = Alignment.CenterVertically) {
                        Text(state.name, style = MaterialTheme.typography.titleSmall, color = theme.foreground)
                        Text(standing, style = MaterialTheme.typography.labelMedium, fontWeight = if (state.id == current) FontWeight.SemiBold else FontWeight.Normal, color = if (reached) theme.foreground else theme.mutedForeground)
                    }
                    Text(state.patientWords, style = MaterialTheme.typography.bodySmall, color = if (reached) theme.foreground else theme.mutedForeground)
                }
            }
        }
        if (current == "confirmed") Text(BookingData.acceptedBy, style = MaterialTheme.typography.bodySmall, color = theme.mutedForeground)
        if (current == "requested" && asap) Text(BookingData.asapStaysRequested, style = MaterialTheme.typography.bodySmall, color = theme.mutedForeground)
        NotConnected("booking")
    }
}

private val clock = DateTimeFormatter.ofPattern("HH:mm").withZone(Scheduling.zone)

/* The thread about one visit. Messages live in PreviewStore's memory only; a closed thread keeps what was
   said and draws no field at all rather than a disabled one. */
@Composable fun VisitThreadScreen(store: PreviewStore, reference: String) {
    val upcoming = store.visits.firstOrNull { it.reference == reference }
    val cancelledVisit = store.cancelled.firstOrNull { it.visit.reference == reference }?.visit
    val visit = upcoming ?: cancelledVisit
    ScreenColumn {
        Heading("", BookingData.Thread.title, BookingData.Thread.lead)
        NotConnected("messaging")
        Note(BookingData.Thread.notARecord)
        if (visit == null) {
            EmptyStateCard(BookingData.Thread.title, Booking.refusal("booking-not-found").sentence)
            return@ScreenColumn
        }
        val state = Booking.threadState(visit, cancelled = upcoming == null)
        /* Words only, or — if the generated setting ever says photos are on — that photos are not in this
           preview yet and the setting is not clinically reviewed. No attachment control either way. */
        Note(if (BookingData.Thread.photos) BookingData.Thread.photosNotInPreview else BookingData.Thread.wordsOnly)
        /* A completed visit's thread stays open for follow-up until the hours run out, and says until when. */
        if (state is ThreadState.Open && upcoming != null) Booking.threadClosesAt(visit)?.let { closes ->
            Note(Booking.fill(BookingData.Thread.openAfterVisit, "closes", closes.format(java.time.format.DateTimeFormatter.ofPattern("d MMM, HH:mm"))))
        }
        val messages = store.visitThreadMessages.filter { it.visitReference == reference }
        if (messages.isEmpty() && state is ThreadState.Open) TonedCard { Text(BookingData.Thread.empty, style = MaterialTheme.typography.bodyMedium, color = theme.foreground) }
        messages.forEach { message ->
            CareCard(Modifier.semantics(mergeDescendants = true) {}) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(if (message.fromRole == "nurse") visit.nurseName ?: BookingData.Review.nurseLabel else BookingData.Thread.you, style = MaterialTheme.typography.labelLarge, color = theme.foreground)
                    Text(clock.format(Instant.ofEpochMilli(message.atMillis)), style = MaterialTheme.typography.bodySmall, color = theme.mutedForeground)
                }
                Text(message.text, style = MaterialTheme.typography.bodyLarge, color = theme.foreground)
                Text(BookingData.Thread.kept, style = MaterialTheme.typography.bodySmall, color = theme.mutedForeground)
            }
        }
        when (state) {
            is ThreadState.Closed -> TonedCard(Modifier.semantics(mergeDescendants = true) {}) {
                Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.Lock, null, tint = theme.foreground)
                    Text(state.sentence, style = MaterialTheme.typography.bodyMedium, color = theme.foreground)
                }
            }
            ThreadState.Open -> ThreadComposer(store, reference, state)
        }
    }
}

@Composable private fun ThreadComposer(store: PreviewStore, reference: String, state: ThreadState) {
    var draft by remember(reference) { mutableStateOf("") }
    var refusal by remember(reference) { mutableStateOf<String?>(null) }
    val count = Booking.codePoints(draft)
    val over = count > BookingData.Thread.maxCharacters
    /* The app draws edge to edge, so the keyboard's height is not taken off the screen for it. On iOS the
       keyboard rose over this field and left a person typing into something they could not see; the
       padding gives the scrolling screen room to bring the field up above the keyboard. Not yet seen on
       an emulator. */
    Column(Modifier.imePadding(), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
        /* Above the field, before anything is typed, rather than after a silence. */
        TonedCard(Modifier.semantics(mergeDescendants = true) {}) {
            Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8)) {
                Icon(Icons.Outlined.Phone, null, tint = theme.foreground)
                Text(BookingData.Thread.nobodyWatches, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = theme.foreground)
            }
        }
        ThusoField(BookingData.Thread.inputLabel) {
            ThusoTextField(
                draft, { draft = it; refusal = null }, singleLine = false, minLines = 2, maxLines = 6,
                keyboardOptions = KeyboardOptions(autoCorrectEnabled = false, capitalization = KeyboardCapitalization.Sentences)
            )
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
            Text(
                "$count / ${BookingData.Thread.maxCharacters}", style = MaterialTheme.typography.bodySmall,
                color = if (over) theme.dangerInk else theme.mutedForeground, modifier = Modifier.weight(1f)
            )
            ThusoButton(BookingData.Thread.sendLabel, onClick = {
                when (val posted = Booking.post(state, reference, "patient", draft)) {
                    is Posted.Kept -> { store.visitThreadMessages.add(posted.message); draft = "" }
                    is Posted.Refused -> refusal = posted.refusal.sentence
                    Posted.Blank -> Unit
                }
            }, enabled = draft.isNotBlank())
        }
        refusal?.let {
            ThusoAlert(it, variant = ThusoAlertVariant.Danger)
        }
    }
}
