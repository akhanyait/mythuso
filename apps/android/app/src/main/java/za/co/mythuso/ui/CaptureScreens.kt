package za.co.mythuso.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import za.co.mythuso.model.*
import androidx.compose.ui.semantics.Role

/*
 * Thuso Kit, and the queue underneath it.
 *
 * Two things are being designed here and they are the same thing seen from two ends. At one end a
 * nurse in a home holds an instrument and a phone; at the other a record has to be able to say, next
 * year, where a number came from and what was wrong with it at the time. The join between the two is
 * that every caveat is attached to the reading rather than drawn on the screen that produced it — a
 * warning that lives on a screen is gone the second time anybody reads the number, which is every
 * time that matters.
 *
 * Nothing connects. No Bluetooth adapter is opened, no scan is started, no instrument exists and no
 * permission is asked for — this app's manifest declares none at all, internet included. The screens
 * say so where a nurse would otherwise assume otherwise, which is the only honest way to demonstrate
 * a device integration before it is built.
 */

/* ---- The mark a reading wears ------------------------------------------------------------------
   The hard part of the whole feature, and it is a colour decision.

   Colour in this app already means something clinical: amber is “look at this”, the danger tone is a
   refusal, teal is ordinary. If provenance were drawn in those colours then a patient-reported
   glucose would render amber and read as an abnormal result, and a manual blood pressure would end
   up in whatever tone was left over — which is how a clinical skill quietly becomes a downgrade on a
   screen nobody meant to grade.

   So provenance takes shape and words and never intensity. All four marks are the same size, the
   same tint and the same weight; what differs is the symbol and the noun. What actually tells a
   device reading from a typed one at a glance is the pair of them plus the block underneath, and
   both blocks are substantial: a device names its instrument, its serial and its calibration date, a
   manual reading names the clinician and the council registration she is accountable under. Two
   different facts, each carrying its own credentials, neither drawn as the lesser. */
private fun provenanceIcon(provenance: Provenance): ImageVector = when (provenance) {
    Provenance.DEVICE -> Icons.Outlined.Sensors
    Provenance.MANUAL -> Icons.Outlined.EditNote
    Provenance.PATIENT_REPORTED -> Icons.Outlined.RecordVoiceOver
    Provenance.DERIVED -> Icons.Outlined.Calculate
}
@Composable fun ProvenanceMark(provenance: Provenance) {
    Row(
        Modifier.background(DeckInk.panel, CircleShape).padding(horizontal = 8.dp, vertical = 4.dp)
            .semantics(mergeDescendants = true) { contentDescription = provenance.label },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Icon(provenanceIcon(provenance), null, tint = DeckInk.sheetInk, modifier = Modifier.size(13.dp))
        Text(provenance.shortLabel, style = MaterialTheme.typography.labelMedium, color = DeckInk.sheetInk)
    }
}
@Composable private fun CalibrationPill(state: CalibrationState) {
    /* Here colour is doing its usual job, and it is about the instrument rather than the origin. An
       out-of-date instrument is a thing to look at; it is not a refusal, so it is never the danger
       tone. */
    StatusPill(state.label, when (state) {
        CalibrationState.IN_DATE -> "teal"
        CalibrationState.DUE -> "sky"
        CalibrationState.OUT_OF_DATE -> "amber"
    })
}
private fun stateTone(state: CaptureState) = when (state) {
    CaptureState.STORED -> "teal"
    CaptureState.CAPTURED, CaptureState.QUEUED, CaptureState.SENDING -> "sky"
    CaptureState.CONFLICTED -> "amber"
    CaptureState.REFUSED -> "danger"
}

/**
 * Everything that travels with a reading, under the reading. Device and clinician get blocks of the
 * same weight on purpose — see the note above the mark.
 */
@Composable fun ProvenanceBlock(reading: CapturedReading, patient: String = reading.patient) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        when (reading.provenance) {
            Provenance.DEVICE -> {
                ReviewLine("Instrument", "${reading.instrumentName ?: "—"} · ${reading.serial ?: "—"}")
                reading.detailLabel?.let { ReviewLine(it, reading.detailValue ?: "—") }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    reading.calibrationState?.let { CalibrationPill(it) }
                }
                reading.calibrationLine?.let { Note(it) }
            }
            Provenance.MANUAL -> {
                ReviewLine("Taken and typed by", reading.byName)
                ReviewLine("Accountable under", reading.byReference)
                Note(Provenance.MANUAL.trust)
            }
            Provenance.PATIENT_REPORTED -> {
                ReviewLine("Reported by", patient)
                ReviewLine("Written down by", "${reading.byName} · ${reading.byReference}")
                Note(Provenance.PATIENT_REPORTED.trust)
            }
            Provenance.DERIVED -> {
                ReviewLine("Calculated from", reading.derivedFrom.joinToString(" and ").ifEmpty { "—" })
                Note(Provenance.DERIVED.trust)
            }
        }
        reading.caveats.forEach { caveat ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Outlined.Info, null, tint = MangoInk, modifier = Modifier.size(15.dp))
                Text(caveat, style = MaterialTheme.typography.bodySmall, color = DeckInk.sheetQuiet)
            }
        }
    }
}

/**
 * Both times, always, and neither of them called the time it happened. The contract is explicit that
 * the device's clock is what the device believed and nothing more; an entry that has not landed
 * anywhere has no established time at all, and this says that rather than filling the gap with the
 * only number it has.
 */
@Composable fun TimesBlock(reading: CapturedReading) {
    ReviewLine("This phone believed", stampText(reading.deviceMillis))
    if (reading.serverMillis == null) {
        ReviewLine("Server received", "Not yet")
        Note("There is no established time for this reading. Ordering uses the server’s receipt time, and the server has not received it, so the only time here is what the phone believed — which is not the same thing as when it happened.")
    } else {
        ReviewLine("Server received", stampText(reading.serverMillis!!))
        Note("Ordered by the receipt time. The phone’s own clock is kept beside it as what the phone believed.")
        if (reading.clockSkewed) {
            val skew = reading.clockSkewMillis ?: 0L
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StatusPill("Clock disagreed", "sky")
                Text("This phone was ${skewText(skew)}. Settled by the server, because ordering is a fact about clocks — nothing clinical was decided.",
                    style = MaterialTheme.typography.bodySmall, color = DeckInk.sheetQuiet)
            }
        }
    }
}

/* ---- The kit ----------------------------------------------------------------------------------- */

@Composable fun ThusoKitScreen(store: PreviewStore, open: (String) -> Unit) {
    val capture = store.capture
    /* The same three nurses the rest of the clinical surfaces switch between: one cleared, one whose
       renewal is due and still dispatchable, and one whose SAPS clearance lapsed nine days ago by
       arithmetic rather than by anybody's decision. */
    val nurses = remember(store) { listOf("N-205", "N-201", "N-204").mapNotNull { store.vetting.subject(it) } }
    var nurseId by remember { mutableStateOf(nurses.first().id) }
    val nurse = nurses.firstOrNull { it.id == nurseId } ?: nurses.first()
    val mayCapture = can(nurse, "write-clinical-note")
    var scanning by remember { mutableStateOf(false) }
    var scanned by remember { mutableStateOf(false) }
    var openInstrument by remember { mutableStateOf<String?>(null) }
    val visit = "TH-2048"
    val patient = "Lerato Molefe"

    LaunchedEffect(scanning) {
        if (scanning) { delay(1600); scanning = false; scanned = true }
    }

    val held = capture.readings.filter { it.state != CaptureState.STORED }
    val needing = held.count { it.state == CaptureState.CONFLICTED }
    val outOfDate = capture.paired.count { it.state == CalibrationState.OUT_OF_DATE }
    val dueSoon = capture.paired.count { it.state == CalibrationState.DUE }

    ScreenColumn {
        /* THE KIT IS A DECK, AND THE SENTENCE ABOUT BLUETOOTH STANDS ON IT.
           The screen used to open on a notice, a heading and two white cards of equal weight, so the
           one fact a reviewer most needs — nothing here reaches an instrument — sat at the same height
           as the choice of nurse. The capability's own sentence is on the canvas now, at reading
           size; the choice of nurse is a pill cluster, because comparing the three is the whole
           demonstration; and "Nothing here connects" is the sheet standing on the canvas's edge, the
           first thing under the deck and the most raised thing on the screen.
           The two figures are counted off the two lists below them: the ring is the contract's six
           instruments with the paired ones lit, and the panel's ring is what is still on this phone,
           lit where a reading disagrees with another. */
        DeckHero(
            content = {
                DeckPreviewMark()
                DeckHeadline(
                    "Thuso Kit",
                    listOf(DeckWord.Words("Connected"), DeckWord.Glyph(Icons.Outlined.Sensors), DeckWord.Words("diagnostic capture.")),
                    tail = "$visit · $patient. Six instruments, each with what it measures, how it would connect and when it was last calibrated."
                )
                NotConnected("devices")
                DeckPills("Capturing as", nurse.id, nurses.map { it.id to it.name }) { nurseId = it }
                Text(
                    "Capturing a reading is writing into somebody’s record, so it asks the vetting module the same question a consultation does: may this party write a clinical note?",
                    style = MaterialTheme.typography.bodySmall, color = DeckInk.quiet
                )
                Text("${vettingRoleById(nurse.roleId)?.name} · ${nurse.reference} · ${summarise(nurse).status.label}",
                    style = MaterialTheme.typography.bodySmall, color = DeckInk.quiet)
                if (!mayCapture.allowed) Box(Modifier.semantics { liveRegion = LiveRegionMode.Polite }) {
                    DeckRefusal("${mayCapture.reason.orEmpty()} Pairing and calibration stay readable — knowing which instrument is out of date is not a clinical write — but no reading is taken under this registration.")
                }
                DeckGlassCard {
                    DeckFigure(
                        value = "${capture.paired.size}", label = "of ${kitInstruments.size} instruments paired to this phone",
                        chip = when {
                            capture.paired.isEmpty() -> "Nothing paired"
                            outOfDate > 0 -> "$outOfDate out of calibration"
                            dueSoon > 0 -> "$dueSoon due for calibration"
                            else -> "All in calibration"
                        },
                        flagged = outOfDate > 0,
                        shape = DeckShape.Ring(kitInstruments.map { instrument -> capture.paired.any { it.instrument.id == instrument.id } })
                    )
                }
                DeckPanel {
                    DeckFigure(
                        value = "${held.size}", label = "readings held on this phone, not yet sent",
                        chip = if (needing > 0) "$needing needing a decision" else "None needing a decision", flagged = needing > 0,
                        shape = DeckShape.Ring(held.map { it.state == CaptureState.CONFLICTED }), ground = DeckGround.PANEL
                    )
                }
            },
            sheet = {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Outlined.BluetoothDisabled, null, tint = DeckInk.sheetInk)
                    Text("Nothing here connects.", style = MaterialTheme.typography.titleMedium, color = DeckInk.sheetInk)
                }
                Text(
                    "No Bluetooth adapter is opened, no scan is started and no instrument is on the other end. This app asks for no permission at all — not location, not Bluetooth, not internet — and its manifest declares none, so nothing here could reach an instrument or a server even if one existed.",
                    style = MaterialTheme.typography.bodyMedium, color = DeckInk.sheetInk
                )
                Note("What is real is the shape: what each instrument measures, what has to be recorded alongside it, when it was last calibrated, and what happens to the reading afterwards. The numbers are generated on this phone and every screen that shows one says so.")
            }
        )

        /* The registry's view of the same six instruments: reporting, stale or recalled, and what each
           reading taken on one carries. It reads the serials and calibrations this phone already holds. */
        KitHealthSection(capture)

        DeckSectionHead("Paired instruments", count = "${capture.paired.size}")
        if (capture.paired.isEmpty()) EmptyStateCard("Nothing is paired", "Discover below. In this preview discovery is a timer and a list compiled into the app.")
        capture.paired.forEach { paired ->
            InstrumentCard(
                paired = paired,
                expanded = openInstrument == paired.instrument.id,
                mayCapture = mayCapture.allowed,
                refusal = mayCapture.reason,
                toggle = { openInstrument = if (openInstrument == paired.instrument.id) null else paired.instrument.id },
                unpair = { capture.unpair(paired.instrument.id); openInstrument = null },
                capture = { measure, detail -> capture.captureFromInstrument(paired, measure, visit, patient, nurse, detail) },
                seal = { id -> capture.seal(id) },
                latest = { id -> capture.readings.firstOrNull { it.id == id } }
            )
        }

        DeckSectionHead("Not paired", count = "${capture.unpaired().size}")
        CareCard {
            Text("Discover instruments", style = MaterialTheme.typography.titleMedium)
            Text(
                "In production this is a Bluetooth Low Energy scan, and it needs a permission this app does not have and has not asked for. Here it is a 1.6-second timer followed by a list that was compiled into the app.",
                style = MaterialTheme.typography.bodyMedium
            )
            DeckButton(onClick = { scanning = true }, enabled = !scanning, shape = ThusoButtonShape) {
                Text(if (scanning) "Pretending to look…" else "Pretend to discover")
            }
            if (scanning) SkeletonRows(2)
        }
        if (scanned) capture.unpaired().forEach { instrument ->
            CareCard {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    TileIcon(instrumentIcon(instrument.id), size = 38.dp)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(instrument.name, style = MaterialTheme.typography.titleSmall, color = DeckInk.sheetInk)
                        Note("${instrument.transport} · measures ${instrument.measures.joinToString(", ") { measureLabels[it] ?: it }}")
                    }
                }
                Note(instrument.note)
                OutlinedButton(onClick = { capture.pair(instrument) }, shape = ThusoButtonShape) { Text("Pair (nothing is contacted)") }
            }
        }
        if (scanned && capture.unpaired().isEmpty()) Note("All six instruments in the contract are paired. Pairing survives a restart: it is written to the same file the queue is.")

        DeckSectionHead(
            "Where these readings go",
            note = "A reading taken here is held on this phone first, then queued, then sent. Nothing is sent from this preview, so the queue is where the work sits and it is worth looking at."
        )
        DeckDestination("Capture queue", "", Icons.Outlined.Inventory2, raised = true) { open("Capture queue") }
        DeckDestination("Visit assessment", "", Icons.Outlined.ContentPaste) { open("Visit assessment") }
    }
}

private fun instrumentIcon(id: String): ImageVector = when (id) {
    "bp-cuff" -> Icons.Outlined.MonitorHeart
    "pulse-oximeter" -> Icons.Outlined.Air
    "thermometer" -> Icons.Outlined.Thermostat
    "glucometer" -> Icons.Outlined.Bloodtype
    "scale" -> Icons.Outlined.Scale
    else -> Icons.Outlined.Favorite
}

/**
 * One paired instrument, and the capture that comes off it. The instrument's own note is at the top
 * of the capture, not in a help page: the person who needs to know that a forehead reading is not an
 * oral one is the one holding the thermometer, at the moment she is holding it.
 */
@Composable private fun InstrumentCard(
    paired: PairedInstrument,
    expanded: Boolean,
    mayCapture: Boolean,
    refusal: String?,
    toggle: () -> Unit,
    unpair: () -> Unit,
    capture: (String, String) -> CapturedReading,
    seal: (String) -> Unit,
    latest: (String) -> CapturedReading?
) {
    var measure by remember(paired.instrument.id) { mutableStateOf(paired.instrument.measures.first()) }
    var detail by remember(paired.instrument.id) { mutableStateOf("") }
    var takenId by remember(paired.instrument.id) { mutableStateOf<String?>(null) }
    val taken = takenId?.let(latest)
    CareCard {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            TileIcon(instrumentIcon(paired.instrument.id), size = 40.dp)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(paired.instrument.name, style = MaterialTheme.typography.titleSmall, color = DeckInk.sheetInk)
                Note("${paired.serial} · ${paired.instrument.transport} · battery ${paired.battery}%")
            }
            CalibrationPill(paired.state)
        }
        Note(calibrationWording(paired.calibration))
        if (paired.state == CalibrationState.OUT_OF_DATE) Text(
            "This instrument is out of calibration and it still takes readings. A nurse in a home with one blood-pressure monitor needs the number; what she must not have is the number without the caveat, so the caveat is written onto every reading it produces and travels with them into the record.",
            style = MaterialTheme.typography.bodyMedium, color = MangoInk
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            DeckButton(onClick = toggle, shape = ThusoButtonShape) { Text(if (expanded) "Close" else "Take a reading") }
            TextButton(onClick = unpair, shape = ThusoButtonShape) { Text("Unpair") }
        }
        if (!expanded) return@CareCard

        HorizontalDivider(color = DeckInk.sheetLine)
        if (paired.instrument.measures.size > 1) {
            Text("What are you measuring?", style = MaterialTheme.typography.labelLarge, color = DeckInk.sheetInk)
            FlowRowChips(paired.instrument.measures.map { measureLabels[it] ?: it }, setOf(measureLabels[measure] ?: measure)) { chosen ->
                measure = paired.instrument.measures.first { (measureLabels[it] ?: it) == chosen }
            }
        }
        /* The limitation, at the moment of the reading. */
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Icons.Outlined.Info, null, tint = MangoInk, modifier = Modifier.size(17.dp))
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("What this instrument cannot decide for you", style = MaterialTheme.typography.labelLarge, color = DeckInk.sheetInk)
                Text(paired.instrument.note, style = MaterialTheme.typography.bodyMedium)
            }
        }
        Text(paired.instrument.records.label, style = MaterialTheme.typography.labelLarge, color = DeckInk.sheetInk)
        Note(paired.instrument.records.why)
        FlowRowChips(paired.instrument.records.options, setOfNotNull(detail.ifEmpty { null })) { option -> detail = option }
        if (detail.isEmpty()) Note("The reading is not taken until this is answered. It is recorded with the number, because it cannot be recovered from the number afterwards.")
        DeckButton(
            onClick = { takenId = capture(measure, detail).id },
            enabled = mayCapture && detail.isNotEmpty()
        , shape = ThusoButtonShape) { Text("Take the reading") }
        if (!mayCapture) Text(refusal.orEmpty(), style = MaterialTheme.typography.bodySmall, color = Danger)

        if (taken != null) {
            HorizontalDivider(color = DeckInk.sheetLine)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("${taken.value} ${taken.unit}", style = MaterialTheme.typography.titleLarge, color = DeckInk.sheetInk)
                ProvenanceMark(taken.provenance)
                StatusPill(taken.state.label, stateTone(taken.state))
            }
            Note("${taken.label} · generated on this phone, because there is no instrument on the other end.")
            ProvenanceBlock(taken)
            if (taken.state == CaptureState.CAPTURED) {
                Note(CaptureState.CAPTURED.detail)
                DeckButton(onClick = { seal(taken.id) }, shape = ThusoButtonShape) { Text("Seal it — waiting to send") }
            } else Note(taken.state.detail)
        }
    }
}

/* ---- The queue ---------------------------------------------------------------------------------- */

@Composable fun CaptureQueueScreen(store: PreviewStore, open: (String) -> Unit) {
    val capture = store.capture
    /* Who is answering the disagreements. Only parties who may write a clinical note today appear,
       because that is what resolving one of these is. */
    val resolvers = remember(store) {
        store.vetting.subjects.filter { can(it, "write-clinical-note").allowed }
    }
    var resolverId by remember { mutableStateOf(resolvers.firstOrNull()?.id.orEmpty()) }
    val resolver = resolvers.firstOrNull { it.id == resolverId } ?: resolvers.firstOrNull()
    var sending by remember { mutableStateOf(false) }
    var controls by remember { mutableStateOf(false) }
    val counts = capture.counts()
    val ordered = capture.ordered()
    val waiting = ordered.filter { it.serverMillis == null }
    val landed = ordered.filter { it.serverMillis != null }

    LaunchedEffect(sending) {
        if (sending) {
            delay(1100)
            capture.settle(store.vetting, store.signedVisits.toSet())
            sending = false
        }
    }

    ScreenColumn {
        DemoBadge()
        Heading("Offline capture", "The queue on this phone.", "Everything a nurse has taken and not yet handed over. Fictional readings; nothing is sent anywhere.")

        /* offlineNeverServesStaleSilently, first thing on the screen and in words. */
        CareCard {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Outlined.Storage, null, tint = DeckInk.sheetInk)
                Text("Read from this phone, ${ageText(capture.readAtMillis)}", style = MaterialTheme.typography.titleMedium)
            }
            Text(capture.where, style = MaterialTheme.typography.bodyMedium)
            ReviewLine("Survives", capture.survives)
            ReviewLine("Does not survive", capture.doesNotSurvive)
            Note("It is not encrypted. A file in this app’s private storage is private to this app and no more than that, which is enough for fictional readings and is not enough for real ones — the controls that would be needed first are in docs/PRIVACY-AND-SECURITY.md.")
            if (capture.storeNote.isNotEmpty()) Text(capture.storeNote, style = MaterialTheme.typography.bodyMedium, color = MangoInk)
            /* A disk that would not take the write is said on the screen that claims what this phone
               keeps, because the claim above is not true while it is refusing. */
            (capture.writeState as? LedgerWrite.Refused)?.let {
                Text(it.reason, style = MaterialTheme.typography.bodyMedium, color = MangoInk)
            }
            OutlinedButton(onClick = { capture.reload() }, shape = ThusoButtonShape) { Text("Re-read the store") }
            Note("Re-reading loads the file again and updates the line above. It is the same read the app does on the way in, which is how you can tell the queue is on the disk and not in memory: close the app entirely, open it again, and the entries are still here.")
        }

        CareCard {
            Text("Where the work is", style = MaterialTheme.typography.titleMedium)
            CaptureState.entries.forEach { state ->
                Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    StatusPill("${counts[state] ?: 0}", stateTone(state))
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(state.label, style = MaterialTheme.typography.bodyMedium, color = DeckInk.sheetInk)
                        Note(state.detail)
                    }
                }
            }
        }

        CareCard {
            Text("Resolving as", style = MaterialTheme.typography.titleMedium)
            Note("A timestamp does not win a clinical disagreement; a clinician does. Only parties whose clearance lets them write a clinical note today are offered here.")
            if (resolvers.isEmpty()) Note("Nobody in this preview may write a clinical note today, so nothing below can be resolved. That is the honest answer, not an empty list.")
            else {
                FlowRowChips(resolvers.take(6).map { "${it.name} · ${vettingRoleById(it.roleId)?.name}" }, setOfNotNull(resolver?.let { "${it.name} · ${vettingRoleById(it.roleId)?.name}" })) { label ->
                    resolverId = resolvers.first { "${it.name} · ${vettingRoleById(it.roleId)?.name}" == label }.id
                }
                resolver?.let { Note("${it.reference} · ${summarise(it).status.label}") }
            }
        }

        /* A design-review control, kept collapsed and labelled, because a phone with no internet
           permission cannot otherwise be shown sending anything. */
        Column(
            Modifier.fillMaxWidth().background(Color.White, RoundedCornerShape(ThusoRadius.control))
                .border(1.dp, DeckInk.sheetLine, RoundedCornerShape(ThusoRadius.control))
                /* Announced as a button that expands, rather than as an unnamed tap target. */
                .clickable(
                    onClickLabel = if (controls) "Hide the design-review controls" else "Show the design-review controls",
                    role = Role.Button
                ) { controls = !controls }.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(if (controls) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore, null, tint = DeckInk.sheetQuiet, modifier = Modifier.size(18.dp))
                Text("Design-review controls", style = MaterialTheme.typography.labelLarge, color = DeckInk.sheetQuiet, modifier = Modifier.weight(1f))
                if (capture.pretendConnected) StatusPill("Pretending online", "amber")
            }
            if (controls) {
                Note("None of this is in the product. It exists so a reviewer can see the states a phone with no internet permission can never reach on its own.")
                Setting("Pretend a connection is available", capture.pretendConnected) { capture.pretendConnected = it }
                Text("Set this phone’s clock wrong", style = MaterialTheme.typography.labelLarge, color = DeckInk.sheetInk)
                Note("A phone that has been offline for a week may have drifted, or been set by hand. Anything taken while it is wrong keeps the wrong time as what the phone believed, and the server’s receipt time is what orders it.")
                FlowRowChips(listOf("Correct", "3 hours slow", "40 minutes fast", "2 days slow"), setOf(when (capture.clockOffsetMinutes) {
                    -180L -> "3 hours slow"; 40L -> "40 minutes fast"; -2880L -> "2 days slow"; else -> "Correct"
                })) { choice ->
                    capture.clockOffsetMinutes = when (choice) {
                        "3 hours slow" -> -180L; "40 minutes fast" -> 40L; "2 days slow" -> -2880L; else -> 0L
                    }
                }
                Note("This phone currently believes it is ${stampText(capture.deviceNow())}.")
                OutlinedButton(onClick = { capture.forgetEverything() }, shape = ThusoButtonShape) { Text("Clear the demonstration queue") }
                Note("There is no such button in the product. An entry is superseded or withdrawn with a reason; it is never erased, and it is never dropped to make a sync succeed.")
            }
        }

        CareCard {
            Text("Send what is waiting", style = MaterialTheme.typography.titleMedium)
            DeckButton(onClick = { capture.beginSending(); sending = true }, enabled = !sending && counts[CaptureState.QUEUED]?.let { it > 0 } == true, shape = ThusoButtonShape) {
                Text(if (sending) "Sending…" else "Try to send")
            }
            capture.lastAttempt?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
            }
            Note("An attempt that fails says so. It never quietly leaves what is on this screen standing in for what the server holds, and an entry that does not land goes back to waiting rather than disappearing.")
        }

        if (waiting.isNotEmpty()) {
            Text("Not yet ordered", style = MaterialTheme.typography.titleMedium, color = DeckInk.sheetInk)
            Note("These have no established time. They are listed in the order this phone wrote them, which is the phone’s own sequence and not an authority about when anything happened.")
            waiting.forEach { reading -> QueueEntryCard(store, reading, resolver) }
        }
        if (landed.isNotEmpty()) {
            Text("Ordered by the server’s receipt time", style = MaterialTheme.typography.titleMedium, color = DeckInk.sheetInk)
            landed.forEach { reading -> QueueEntryCard(store, reading, resolver) }
        }
        if (ordered.isEmpty()) EmptyStateCard("The queue is empty", "Nothing has been captured on this phone. Take a reading on the Thuso Kit screen and it will appear here.")

        CareCard {
            Text("The rules this screen is written against", style = MaterialTheme.typography.titleMedium)
            Note(captureWhy)
            captureRules.forEach { (sentence, _) -> Text("· $sentence", style = MaterialTheme.typography.bodySmall, color = DeckInk.sheetQuiet) }
        }
        ToolRow("Thuso Kit") { open("Thuso Kit") }
    }
}

@Composable private fun QueueEntryCard(store: PreviewStore, reading: CapturedReading, resolver: VettingSubject?) {
    var open by remember(reading.id) { mutableStateOf(false) }
    CareCard {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(reading.label, style = MaterialTheme.typography.titleSmall, color = DeckInk.sheetInk)
                Note("${reading.visit} · ${reading.patient} · ${reading.id}")
            }
            Text("${reading.value} ${reading.unit}",
                 style = MaterialTheme.typography.titleLarge,
                color = if (reading.superseded) DeckInk.sheetQuiet else Ink)
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ProvenanceMark(reading.provenance)
            StatusPill(reading.state.label, stateTone(reading.state))
            if (reading.superseded) StatusPill("Superseded · kept", "quiet")
            if (reading.countersignedBy != null) StatusPill("Countersigned", "teal")
        }
        CaptureSourcePills(reading)
        Note("Written to this phone ${ageText(reading.writtenMillis)}.")
        TextButton(onClick = { open = !open }, shape = ThusoButtonShape) { Text(if (open) "Less" else "What travels with this reading") }
        if (open) {
            ProvenanceBlock(reading)
            HorizontalDivider(color = DeckInk.sheetLine)
            TimesBlock(reading)
        }
        reading.refusal?.let {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Outlined.Block, null, tint = Danger, modifier = Modifier.size(16.dp))
                Text(it, style = MaterialTheme.typography.bodyMedium, color = Danger)
            }
            Note("It stays on this phone. A refusal is not a delete, and nothing here removes it while somebody still has to decide what to do with it.")
        }
        reading.resolutionNote?.let { Note(it) }
        if (reading.state == CaptureState.CONFLICTED) ConflictBlock(store, reading, resolver)
    }
}

/* ---- Resolving a disagreement -------------------------------------------------------------------
   Nothing below merges and nothing deletes. Every path leaves both rows in the queue with their
   numbers, their origins and a sentence saying who decided and why. */
@Composable private fun ConflictBlock(store: PreviewStore, reading: CapturedReading, resolver: VettingSubject?) {
    val conflict = captureConflictById(reading.conflictId) ?: return
    val capture = store.capture
    HorizontalDivider(color = DeckInk.sheetLine)
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Icon(Icons.Outlined.Balance, null, tint = MangoInk)
        Text(conflict.name, style = MaterialTheme.typography.titleSmall, color = DeckInk.sheetInk)
    }
    Text(conflict.detail, style = MaterialTheme.typography.bodyMedium)
    Note("Resolved by: ${if (conflict.resolution == "clinician") "a clinician" else "the server"}.")
    if (resolver == null) {
        Note("Nobody here may write a clinical note today, so nobody here may resolve this. It waits.")
        return
    }
    when (conflict.id) {
        "duplicate-observation" -> {
            val other = capture.readings.firstOrNull {
                it.id != reading.id && it.visit == reading.visit && it.observationId == reading.observationId && !it.superseded
            }
            if (other == null) { Note("The other reading is no longer in this queue, so there is nothing to choose between."); return }
            Text("Both readings, side by side", style = MaterialTheme.typography.labelLarge, color = DeckInk.sheetInk)
            Note("Neither is presented as the better one and neither is a correction of the other. They are two things that happened, and a clinician says which stands.")
            listOf(other, reading).forEach { candidate ->
                Column(
                    Modifier.fillMaxWidth().background(Mist, RoundedCornerShape(ThusoRadius.control)).padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("${candidate.value} ${candidate.unit}", style = MaterialTheme.typography.titleLarge, color = DeckInk.sheetInk)
                        ProvenanceMark(candidate.provenance)
                    }
                    Note("${candidate.id} · this phone believed ${clockText(candidate.deviceMillis)}${candidate.serverMillis?.let { " · server received ${clockText(it)}" } ?: " · not yet received"}")
                    ProvenanceBlock(candidate)
                    DeckButton(onClick = {
                        val loser = if (candidate.id == reading.id) other.id else reading.id
                        capture.chooseBetween(candidate.id, loser, resolver,
                            "The other reading is kept in full and marked superseded, because a record that deletes the first reading cannot show why the second was taken.")
                    }, shape = ThusoButtonShape) { Text("This one stands") }
                }
            }
        }
        "vetting-lapsed" -> {
            val capturer = store.vetting.subject(reading.byId)
            val summary = capturer?.let { summarise(it) }
            val lapsed = summary?.lapsed.orEmpty()
            val lapsedOn = capturer?.records?.firstOrNull { record -> lapsed.any { it.id == record.checkId } }?.expiresOn
            Text("Taken while cleared, arriving after the clearance ran out", style = MaterialTheme.typography.labelLarge, color = DeckInk.sheetInk)
            ReviewLine("Captured by", "${reading.byName} · ${reading.byReference}")
            ReviewLine("Standing today", summary?.status?.label ?: "—")
            if (lapsed.isNotEmpty()) ReviewLine("What lapsed", lapsed.joinToString(" and ") { it.name })
            lapsedOn?.let { date ->
                val gap = java.time.temporal.ChronoUnit.DAYS.between(atMillis(reading.deviceMillis).toLocalDate(), date)
                ReviewLine("Lapsed", "${formatVettingDate(date)} — ${gap} day${if (gap == 1L) "" else "s"} after this reading was taken")
            }
            Text(
                "The reading is not discarded: it was taken by a cleared nurse, on a patient who was in front of her, and throwing it away would lose a fact about that patient to punish a lapsed certificate. It is also not filed on her authority alone, because that authority is no longer current. A clinician who is cleared today accepts it, and both names stand on the record afterwards — hers, because she is the one who was in the room, and theirs, because the filing is on their registration.",
                style = MaterialTheme.typography.bodyMedium
            )
            DeckButton(onClick = { capture.countersign(reading.id, resolver) }, shape = ThusoButtonShape) {
                Text("Countersign as ${resolver.name}")
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = {
                    capture.hold(reading.id, "Held by ${resolver.name} · ${resolver.reference}: not countersigned yet. It stays here, in full, until somebody is willing to put their registration against it.")
                }, shape = ThusoButtonShape) { Text("Hold it") }
                TextButton(onClick = {
                    capture.withdraw(reading.id, resolver, "Withdrawn after review: the reading could not be attributed to a current registration and no clinician was willing to countersign it.")
                }, shape = ThusoButtonShape) { Text("Withdraw with a reason") }
            }
            Note("Restoring the capturer’s own clearance resolves this too, and better: the reading then files on the registration it was taken under. That decision belongs in the Control Tower’s vetting pipeline, not here.")
        }
        "stale-write" -> {
            Text("The record moved on while this waited", style = MaterialTheme.typography.labelLarge, color = DeckInk.sheetInk)
            ReviewLine("Visit", reading.visit)
            ReviewLine("What changed", "A clinician signed the record for this visit while the entry was queued.")
            Text(
                "It is never applied silently after the fact. Either it goes in as an addendum, openly, with the clinician who signed told that something arrived after their signature — or it is held, or it is withdrawn with a reason. What it does not do is slide into a signed record and change what somebody has already put their name to.",
                style = MaterialTheme.typography.bodyMedium
            )
            DeckButton(onClick = { capture.fileAsAddendum(reading.id, resolver) }, shape = ThusoButtonShape) { Text("File as an addendum") }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = {
                    capture.hold(reading.id, "Held by ${resolver.name} · ${resolver.reference} pending a word with the clinician who signed the visit.")
                }, shape = ThusoButtonShape) { Text("Hold it") }
                TextButton(onClick = {
                    capture.withdraw(reading.id, resolver, "Withdrawn after review: the visit had been signed and the reading was not needed as an addendum. The row and this reason stay on the phone.")
                }, shape = ThusoButtonShape) { Text("Withdraw with a reason") }
            }
        }
        else -> Note("This one is settled by the server, because it is a fact about clocks rather than a clinical judgement. Both times stay on the reading.")
    }
}
