package za.co.mythuso.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import za.co.mythuso.R
import za.co.mythuso.model.*

/** Identity is read from vetting records. Editorial photography never impersonates a clinician. */
@Composable fun CareTeamScreen(store: PreviewStore, open: (String) -> Unit) {
    var role by rememberSaveable { mutableStateOf("All clinicians") }
    ScreenColumn {
        Heading("Your care team", "People behind your care", "Explore the sample clinician records and their professional scope.")
        DemoBadge()
        Image(painterResource(R.drawable.care_team_editorial), null, Modifier.fillMaxWidth().aspectRatio(1.8f).clip(RoundedCornerShape(24.dp)), contentScale = ContentScale.Crop)
        Text("Illustrative photography · Not a clinician profile photo", style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
        FlowRowChips(listOf("All clinicians", "Nurses", "Doctors"), setOf(role)) { role = it }
        store.vetting.subjects.filter { it.roleId in listOf("nurse", "doctor") && (role == "All clinicians" || it.roleId == if (role == "Nurses") "nurse" else "doctor") }.forEach { subject ->
            CareCard(Modifier.clickable { open("Clinician: ${subject.id}") }) {
                ClinicianIdentity(subject)
                Text(subject.scope.joinToString(" · "), style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted)
                val summary = summarise(subject)
                StatusPill("Sample record · ${summary.status.label}", if (summary.cleared) "teal" else "amber")
                Text("View professional details", style = MaterialTheme.typography.labelMedium, color = Charcoal)
            }
        }
        Note("A doctor may decide a home visit is needed after reviewing your care. This directory does not arrange or dispatch a visit.")
    }
}

@Composable private fun ClinicianIdentity(subject: VettingSubject) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.size(52.dp).background(StudioLilac, CircleShape), contentAlignment = Alignment.Center) {
            Text(subject.name.split(" ").takeLast(2).mapNotNull { it.firstOrNull() }.joinToString(""), style = MaterialTheme.typography.titleMedium, color = Charcoal)
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(subject.name, style = MaterialTheme.typography.titleMedium, color = Charcoal)
            Text(vettingRoleById(subject.roleId)?.name ?: subject.roleId, style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
            Text(subject.reference, style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
        }
    }
}

@Composable fun ClinicianProfileScreen(store: PreviewStore, id: String) {
    val subject = store.vetting.subject(id)
    ScreenColumn {
        DemoBadge()
        if (subject == null) EmptyStateCard("Profile unavailable", "Return to your care team and choose another clinician.")
        else {
            Heading("Professional profile", subject.name, "Fictional clinician · Sample verification record")
            CareCard {
                ClinicianIdentity(subject)
                subject.zone?.let { ReviewLine("Area", it) }
                if (subject.scope.isNotEmpty()) ReviewLine("Professional scope", subject.scope.joinToString(" · "))
            }
            val summary = summarise(subject)
            Section("Professional checks") {
                CareCard {
                    StatusPill(summary.status.label, if (summary.cleared) "teal" else "amber")
                    Text("${summary.passed} of ${summary.total} checks passed in the sample record", style = MaterialTheme.typography.bodyMedium)
                    summary.states.forEach { (check, state) ->
                        HorizontalDivider(color = StudioLine)
                        ReviewLine(check.name, state.label)
                        recordFor(subject, check.id).expiresOn?.let { Text("Review due ${formatVettingDate(it)}", style = MaterialTheme.typography.bodySmall, color = StudioInkMuted) }
                    }
                }
            }
            Note("Languages, years of experience and a profile photograph have not been supplied for this clinician. No live verification has taken place.")
        }
    }
}

@Composable fun UpcomingVisitScreen(store: PreviewStore, reference: String, open: (String) -> Unit) {
    val visit = store.visits.firstOrNull { it.reference == reference }
    ScreenColumn {
        DemoBadge()
        if (visit == null) {
            EmptyStateCard("This visit is no longer upcoming", "It may have been cancelled. Your visit history keeps the cancellation details.")
            OutlinedButton(onClick = { open("Visits") }, shape = ThusoButtonShape) { Text("View all visits") }
        } else {
            Heading("Your next visit", visit.service.name, visit.shortWhenText)
            StudioNightCard {
                StudioNightChip(visit.status)
                Text(visit.person, style = MaterialTheme.typography.titleLarge, color = StudioNightInk)
                IconLine(Icons.Outlined.LocationOn, visit.address)
                IconLine(Icons.Outlined.Schedule, if (visit.isScheduled) "${visit.start} – ${visit.ends} · ${visit.service.duration} minutes" else "Timing to be confirmed")
                Text("R${visit.service.price} · ${visit.payment}", style = MaterialTheme.typography.titleMedium, color = StudioNightInk)
            }
            Section("Before your visit") {
                CareCard {
                    IconLine(Icons.Outlined.Checklist, "Have your medication list ready.")
                    Text("Check the location and keep any instructions from your care team nearby.", style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted)
                    Text("Your care team will confirm any preparation specific to your service.", style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
                }
            }
            Section("Who is coming") {
                CareCard {
                    Text("Clinician assignment is demonstrated with sample records. No nurse has been dispatched.", style = MaterialTheme.typography.bodyMedium)
                    store.vetting.byName("Sister Naledi Mokoena")?.let { nurse ->
                        ClinicianIdentity(nurse)
                        OutlinedButton(onClick = { open("Clinician: ${nurse.id}") }, shape = ThusoButtonShape) { Text("View sample nurse profile") }
                    }
                }
            }
            Section("Manage your visit") {
                PlainRow("Change or cancel", "Review the available options for this visit") { open("Visits") }
                PlainRow("Arrival information", "Availability and privacy explained") { open("Where is your nurse · ${visit.reference}") }
                Text("Clinician calls and messages are not connected in this preview.", style = MaterialTheme.typography.bodySmall, color = StudioInkMuted)
            }
            Note("A doctor may decide a home visit is appropriate after reviewing your care. This booking does not automatically include a doctor visit.")
        }
    }
}

private data class PassportTimelineItem(val title: String, val detail: String, val day: Long, val category: String, val status: String, val route: String)

/** Dates, review states and reading counts come from the Passport contract, newest first. */
@Composable fun PassportTimeline(open: (String) -> Unit) {
    var category by rememberSaveable { mutableStateOf("All records") }
    val haptic = LocalHapticFeedback.current
    val items = readingSets.map { reading ->
        PassportTimelineItem("Home visit readings", "${reading.values.size} measurements recorded", reading.dayOffset, "Visits", "Recorded", "Past visit: ${reading.dayOffset}")
    } + PassportData.documents.map { document ->
        PassportTimelineItem(document.name, document.kind, document.dayOffset, "Documents", if (document.reviewed) "Doctor reviewed" else "Awaiting review", document.opens ?: document.name)
    } + PassportTimelineItem("Doctor review", passportReviewer.name, lastReview.reviewedDayOffset, "Reviews", "Review completed", "Visit summary")
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("Your care timeline", style = MaterialTheme.typography.titleLarge, color = Charcoal)
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("All records", "Visits", "Documents", "Reviews").forEach { name ->
                FilterChip(selected = name == category, onClick = { haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove); category = name }, label = { Text(name) })
            }
        }
        val visible = items.filter { category == "All records" || it.category == category }.sortedByDescending { it.day }
        visible.forEach { item ->
            CareCard(Modifier.clickable { open(item.route) }) {
                Text(Scheduling.longDate(Passport.dateOf(item.day)), style = MaterialTheme.typography.labelMedium, color = StudioInkMuted)
                Text(item.title, style = MaterialTheme.typography.titleMedium, color = Charcoal)
                Text(item.detail, style = MaterialTheme.typography.bodyMedium, color = StudioInkMuted)
                StatusPill(item.status, if (item.status == "Awaiting review") "amber" else "neutral")
            }
        }
        if (visible.isEmpty()) EmptyStateCard("No records in this category", "Choose All records to see the rest of your timeline.")
    }
}
