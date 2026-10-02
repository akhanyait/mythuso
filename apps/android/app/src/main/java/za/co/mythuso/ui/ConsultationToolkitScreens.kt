package za.co.mythuso.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.MenuBook
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material.icons.outlined.Block
import androidx.compose.material.icons.outlined.ContentPaste
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.FolderShared
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.MedicalServices
import androidx.compose.material.icons.outlined.Medication
import androidx.compose.material.icons.outlined.MonitorHeart
import androidx.compose.material.icons.outlined.Route
import androidx.compose.material.icons.outlined.Science
import androidx.compose.material.icons.outlined.Videocam
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import za.co.mythuso.model.*
import za.co.mythuso.ui.components.*

/*
 * The consultation toolkit on Android — the founder's ask of 2 October 2026: the live devices in front of the
 * nurse and the doctor while they consult, and every tool they need linked on the consultation screen itself.
 *
 * WHAT IT IS. One card on the call, the record and the visit, listing the tools a clinician reaches in that
 * consultation in the contract's order for the role. The tools, their names and every sentence are
 * ConsultationToolkitData.kt's, generated from packages/catalog/consultation-toolkit.json; what each tool says
 * to this clinician right now is ConsultationToolkit.stateOf — the vetting register, the room and the line,
 * joined exactly as apps/web/src/lib/consultation-toolkit.ts joins them.
 *
 * WHY IN PLACE, AND NOT A ROUTE. A tool opens under the list, on the same screen, with the way back at the top
 * of it. A route would leave the call — and the call's state, its countdown and its roster live in the screen
 * that hosts this card, so leaving it would end the very thing the tool was opened beside. One tool is open at
 * a time: a phone has no room for two, and the one in front is the one being read.
 *
 * WHY A WINDOW FOR A WHOLE SCREEN. The record, the file and the assessment are screens of their own, each a
 * scrolling column. Inside the host's scrolling column a second unbounded scroll cannot be measured, so each
 * is given a window the height of most of the phone, bled to the screen's edges so its own gutter is the only
 * one, and scrolls inside it; the host scrolls on when the window reaches its end.
 *
 * WHAT IS REFUSED, AND WHERE. A tool the register does not let this clinician use is listed, with a lock and
 * its state in a word — never colour alone — and opens to the refusal sentence and nothing else; a control that
 * vanished would teach nobody why. A nurse's card lists no prescription and no sick note: the contract says,
 * where the doctor's tools would be, that they are a doctor's on MyThuso. A tool this phone has no screen for
 * says what it is, who may use it and that it opens nothing here. Nothing in this file sends, books,
 * prescribes or certifies.
 */

private val toolIcons: Map<String, ImageVector> = mapOf(
    "devices" to Icons.Outlined.MonitorHeart, "notes" to Icons.Outlined.EditNote, "nurse-notes" to Icons.Outlined.EditNote,
    "prescribe" to Icons.Outlined.Medication, "tests" to Icons.Outlined.Science, "refer" to Icons.Outlined.Route,
    "sick-note" to Icons.Outlined.Description, "context" to Icons.Outlined.FolderShared, "protocols" to Icons.AutoMirrored.Outlined.MenuBook,
    "assessment" to Icons.Outlined.ContentPaste, "case" to Icons.Outlined.MedicalServices, "call-doctor" to Icons.Outlined.Videocam,
    "refer-to-doctor" to Icons.AutoMirrored.Outlined.Send
)
private fun iconOf(id: String) = toolIcons[id] ?: Icons.Outlined.Description

/* A shut tool's alert says how shut it is: a tool still being built is information, a refusal is a refusal,
   and a line that may come back is a warning. The words differ as well as the colour. */
private fun alertFor(state: ToolkitToolState) = when (state) {
    is ToolkitToolState.Pending -> ThusoAlertVariant.Info
    is ToolkitToolState.Waiting -> ThusoAlertVariant.Warning
    else -> ThusoAlertVariant.Danger
}

/**
 * The toolkit for [surfaceId], for the clinician [subjectId] on the screen. [open] reaches the host's own
 * routes for the few links a tool's screen carries that this card has no tool for; [onToolChange] tells the
 * host which tool is open, so a host already drawing the patient's devices can step its panel aside while the
 * devices are the open tool — two clocks counting one patient's readings differently on one screen is a
 * contradiction, not a convenience.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable fun ConsultationToolkitPanel(
    store: PreviewStore, surfaceId: String, subjectId: String, reference: String, patient: String, call: ToolkitCall?,
    open: (String) -> Unit = {}, onToolChange: (String?) -> Unit = {}
) {
    val surface = remember(surfaceId) { ConsultationToolkit.surface(surfaceId) }
    val subject = store.vetting.subject(subjectId) ?: return
    val tools = remember(surface) { ConsultationToolkit.toolsOf(surface) }
    var expanded by remember(surfaceId) { mutableStateOf<String?>(null) }
    LaunchedEffect(expanded) { onToolChange(expanded) }
    val states = tools.associate { it.id to ConsultationToolkit.stateOf(it, subject, call) }
    val panelTop = remember { BringIntoViewRequester() }
    /* Arriving at a tool brings its head into view: the list is above it, and on a phone a tool that opened
       below the fold looks like a tap that did nothing. */
    LaunchedEffect(expanded) { if (expanded != null) panelTop.bringIntoView() }

    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space16)) {
        CareCard {
            Text(surface.heading, style = MaterialTheme.typography.titleMedium, color = theme.foreground,
                 modifier = Modifier.semantics { heading() })
            Column(Modifier.fillMaxWidth()) {
                tools.forEachIndexed { index, tool ->
                    if (index > 0) HorizontalDivider(color = theme.border)
                    ToolRow(tool, states.getValue(tool.id), expanded == tool.id) {
                        expanded = if (expanded == tool.id) null else tool.id
                    }
                }
            }
        }

        expanded?.let { id ->
            val tool = ConsultationToolkit.tool(id)
            val state = states.getValue(id)
            val back = { expanded = null }
            key(id) {
                Column(Modifier.fillMaxWidth().bringIntoViewRequester(panelTop), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space12)) {
                    ThusoButton(
                        ConsultationToolkit.fill(ConsultationToolkitData.Words.backTo, mapOf("home" to surface.homeName.replaceFirstChar { it.lowercase() })),
                        onClick = back, variant = ThusoButtonVariant.Secondary, leadingIcon = Icons.AutoMirrored.Outlined.ArrowBack,
                        modifier = Modifier.heightIn(min = TouchTarget)
                    )
                    ToolHead(tool, state, subject, reference, patient)
                    /* A refused tool draws none of its screen. A tool waiting for the line still says what it is,
                       because what is written in it is kept for when the line comes back. */
                    if (state is ToolkitToolState.Open || state is ToolkitToolState.Waiting) {
                        ToolBody(store, surface, tool, subject, reference, patient, call, back, open) { expanded = it }
                    }
                }
            }
        }

        if (surface.refused.isNotEmpty()) TonedCard {
            Text(ConsultationToolkitData.Words.refusedHeading, style = MaterialTheme.typography.titleSmall, color = theme.foreground,
                 modifier = Modifier.semantics { heading() })
            surface.refused.forEach { refused ->
                ToolkitLine(Icons.Outlined.Lock, "${ConsultationToolkit.tool(refused.tool).name}.", refused.sentence)
            }
        }
        TonedCard {
            Text(ConsultationToolkitData.Words.rulesHeading, style = MaterialTheme.typography.titleSmall, color = theme.foreground,
                 modifier = Modifier.semantics { heading() })
            ConsultationToolkit.refusalsOn(surface).forEach { ToolkitLine(Icons.Outlined.Block, null, it.sentence) }
        }
    }
}

/* One tool in the list. The row is the control and reads as one: its name and, when shut, its state in a word,
   with a button role and whether it is open below. The lock and the word carry the state; the tint of the icon
   only agrees with them. */
@Composable private fun ToolRow(tool: ToolkitToolSpec, state: ToolkitToolState, open: Boolean, toggle: () -> Unit) {
    val word = state.word
    val shape = RoundedCornerShape(ThusoRadius.control)
    Row(
        Modifier.fillMaxWidth().heightIn(min = TouchTarget).clip(shape)
            .background(if (open) theme.accent.tint(0.15f) else theme.surface, shape)
            .clickable(role = Role.Button, onClick = toggle)
            .clearAndSetSemantics {
                contentDescription = if (word != null) "${tool.name}, $word" else tool.name
                stateDescription = if (open) "Expanded" else "Collapsed"
                role = Role.Button
                onClick { toggle(); true }
            }
            .padding(horizontal = ThusoSpacing.space8, vertical = ThusoSpacing.space8),
        horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12), verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(iconOf(tool.id), null, tint = if (word == null) theme.primaryInk else theme.mutedForeground, modifier = Modifier.size(22.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
            Text(tool.name, style = MaterialTheme.typography.bodyMedium,
                 fontWeight = if (open) FontWeight.SemiBold else FontWeight.Medium, color = theme.foreground)
            if (word != null) Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space4), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.Lock, null, tint = theme.mutedForeground, modifier = Modifier.size(14.dp))
                Text(word, style = MaterialTheme.typography.bodySmall, color = theme.mutedForeground)
            }
        }
        Icon(if (open) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore, null, tint = theme.mutedForeground)
    }
}

/* What the tool is, for whom, and who it was asked of — then, if it is shut, the sentence it is shut with. */
@Composable private fun ToolHead(tool: ToolkitToolSpec, state: ToolkitToolState, subject: VettingSubject, reference: String, patient: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space12), verticalAlignment = Alignment.Top) {
        TileIcon(iconOf(tool.id), theme.primaryInk, theme.primary.tint(0.10f), 40.dp)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
            Text(tool.name, style = MaterialTheme.typography.titleLarge, color = theme.foreground, modifier = Modifier.semantics { heading() })
            Note(ConsultationToolkit.fill(ConsultationToolkitData.Words.forPatient, mapOf("patient" to patient, "reference" to reference)))
        }
    }
    Text(tool.summary, style = MaterialTheme.typography.bodyMedium, color = theme.foreground)
    if (tool.capability != null) {
        Note(ConsultationToolkit.fill(ConsultationToolkitData.Words.askedOf, mapOf("name" to subject.name, "reference" to subject.reference)))
    }
    state.sentence?.let { ThusoAlert(it, variant = alertFor(state)) }
}

/* The screen each tool already was, or, where this phone has none, what the tool is and that it opens nothing
   here. [choose] lets a file's own links open this card's tools rather than leave the consultation. */
@Composable private fun ToolBody(
    store: PreviewStore, surface: ToolkitSurfaceSpec, tool: ToolkitToolSpec, subject: VettingSubject, reference: String, patient: String,
    call: ToolkitCall?, back: () -> Unit, open: (String) -> Unit, choose: (String?) -> Unit
) {
    when (tool.id) {
        "devices" -> LiveVitalsPanel(subject = patient)
        "notes", "nurse-notes" -> {
            /* Written during the call, signed only once it has ended as a consultation: an interrupted encounter
               has no assessment, no plan and no signature, so the record offers none while the line is open. */
            val lineOpen = call != null && !call.ended
            if (lineOpen) ThusoAlert(ConsultationToolkitData.Gates.notesDuringCall, variant = ThusoAlertVariant.Info)
            ScreenWindow { ConsultationRecordScreen(store, reference, patient, writerId = subject.id, signable = !lineOpen, devices = false) }
        }
        "context" -> {
            /* The file by the name on the consultation, opened on that patient by the id the fixtures hold for her,
               or nothing, said as nothing. It is never opened on whoever the fixtures list first: that would be
               another patient's file in this one's place. */
            val file = filePatients.firstOrNull { it.name == patient }
            if (file == null) {
                NotConnected("clinical-records")
                Note(ConsultationToolkit.fill(ConsultationToolkitData.Gates.notOnFile, mapOf("patient" to patient)))
            } else ScreenWindow {
                PatientFileScreen(store, patientId = file.id) { link ->
                    val to = when {
                        link.startsWith("Consultation record") -> "notes"
                        link.startsWith("Prescri") -> "prescribe"
                        link.startsWith("Laboratory") -> "tests"
                        link.startsWith("Referral") -> "refer"
                        else -> null
                    }
                    if (to != null && to in surface.tools) choose(to) else open(link)
                }
            }
        }
        "assessment" -> ScreenWindow {
            VisitAssessmentScreen(store, reference = reference, patient = patient, close = back, open = open)
        }
        /* sick-note.json's own composer and refusals; its notice is drawn here, because the composer draws none. */
        "sick-note" -> {
            NotConnected(tool.honesty)
            SickNoteComposer(store, reference, patient, writer = subject.id)
        }
        "call-doctor" -> CallADoctorIn()
        "refer-to-doctor" -> HandToADoctor(store)
        else -> {
            NotConnected(tool.honesty)
            Note(ConsultationToolkit.fill(ConsultationToolkitData.Gates.notOnThisPhone, mapOf("tool" to tool.name)))
        }
    }
}

/* Calling a doctor into the room, from the nurse's side: where she stands, what she sees and hears, and what a
   doctor may do with her there — the teleconsultation's own words. Nothing here calls anybody, and the
   capability notice says so. */
@Composable private fun CallADoctorIn() {
    val nurse = Teleconsult.participant("nurse")
    val w = ConsultationToolkitData.Words
    NotConnected("teleconsultation")
    CareCard {
        Fact(w.callDoctorWhere, nurse.place)
        Fact(w.callDoctorSees, nurse.sees)
        Fact(w.callDoctorHears, nurse.hears)
    }
    Text(w.callDoctorLimits, style = MaterialTheme.typography.titleSmall, color = theme.foreground, modifier = Modifier.semantics { heading() })
    callClinicalLimits.forEach { limit -> ToolkitLine(null, limit.name, limit.detail) }
    Text(Teleconsult.rule("the-nurse-is-the-examination").sentence, style = MaterialTheme.typography.bodyMedium, color = theme.foreground)
}

/* The visit, handed to the doctors' review queue — the Care engine's own act and refusal, the same one the
   visit's handover stage presses. Pressed earlier it would skip the readings the handover is made against, so
   before that stage it says where the visit is. */
@Composable private fun HandToADoctor(store: PreviewStore) {
    val care = store.careVisit
    NotConnected("doctor-review")
    when {
        care.handedOver -> Row(
            Modifier.semantics(mergeDescendants = true) {},
            horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8), verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.AutoMirrored.Outlined.Send, null, tint = theme.foreground, modifier = Modifier.size(18.dp))
            Text(CareData.handoverQueued, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = theme.foreground)
        }
        care.stage != CareStage.HANDOVER ->
            Note(ConsultationToolkit.fill(ConsultationToolkitData.Gates.notYetAtHandover, mapOf("stage" to care.stage.stageName)))
        else -> {
            care.refusal?.takeIf { it.stage == CareStage.HANDOVER }?.let { ThusoAlert(it.statement, variant = ThusoAlertVariant.Danger) }
            ThusoButton(CareStage.HANDOVER.stageName, onClick = { care.handOver() }, modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget))
        }
    }
}

/* A label over its value, read as one. */
@Composable private fun Fact(label: String, value: String) {
    Column(Modifier.fillMaxWidth().semantics(mergeDescendants = true) {}, verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = theme.mutedForeground)
        Text(value, style = MaterialTheme.typography.bodyMedium, color = theme.foreground)
    }
}

/* One line of a list of refusals or limits: a mark, an optional name in the heavier weight, and the sentence. */
@Composable private fun ToolkitLine(icon: ImageVector?, name: String?, sentence: String) {
    Row(
        Modifier.fillMaxWidth().semantics(mergeDescendants = true) {},
        horizontalArrangement = Arrangement.spacedBy(ThusoSpacing.space8), verticalAlignment = Alignment.Top
    ) {
        if (icon != null) Icon(icon, null, tint = theme.mutedForeground, modifier = Modifier.padding(top = 2.dp).size(16.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
            if (name != null) Text(name, style = MaterialTheme.typography.labelLarge, color = theme.foreground)
            Text(sentence, style = MaterialTheme.typography.bodySmall, color = theme.mutedForeground)
        }
    }
}

/* A whole screen, inside the host's column: a window most of the phone's height, bled to the screen's edges so
   the embedded screen's own gutter is the only one, between two rules so the eye sees where it starts and ends. */
@Composable private fun ScreenWindow(content: @Composable () -> Unit) {
    val height = (LocalConfiguration.current.screenHeightDp * 0.8f).dp
    Column(Modifier.fillMaxWidth().bleed(ThusoSpacing.space16)) {
        HorizontalDivider(color = theme.border)
        Box(Modifier.fillMaxWidth().height(height).background(theme.background)) { content() }
        HorizontalDivider(color = theme.border)
    }
}

private fun Modifier.bleed(by: Dp): Modifier = layout { measurable, constraints ->
    val extra = (by * 2).roundToPx()
    val width = constraints.maxWidth + extra
    val placeable = measurable.measure(constraints.copy(minWidth = width, maxWidth = width))
    layout(constraints.maxWidth, placeable.height) { placeable.place(-by.roundToPx(), 0) }
}
