package za.co.mythuso.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import za.co.mythuso.model.BoxPoint
import za.co.mythuso.model.Eta
import za.co.mythuso.model.EtaBasis
import za.co.mythuso.model.LatLng
import za.co.mythuso.model.MapWindow
import za.co.mythuso.model.PreviewStore
import za.co.mythuso.model.RouteResult
import za.co.mythuso.model.URBAN_SPEED_KMH
import za.co.mythuso.model.VettingDecision
import za.co.mythuso.model.VettingStore
import za.co.mythuso.model.asLatLng
import za.co.mythuso.model.can
import za.co.mythuso.model.etaFromRoute
import za.co.mythuso.model.kmToBoxUnits
import za.co.mythuso.model.noEta
import za.co.mythuso.model.noRoutingProvider
import za.co.mythuso.model.normalizeSouthAfricaLngLat
import za.co.mythuso.model.projectToSquare
import za.co.mythuso.model.provinceFor
import za.co.mythuso.model.straightLineEta
import za.co.mythuso.model.summarise
import java.util.Locale
import kotlin.math.roundToInt

/*
 * The map and the list are drawn from one set of coordinates. Positions used to be typed in as
 * canvas fractions beside each row, which meant the picture and the arrival times came from two
 * different sets of numbers and could stop agreeing without anybody having anything to notice it
 * against. A projection cannot drift, because there is only one set of numbers to be wrong about.
 * model/Geo.kt does the arithmetic, and the same file refuses a coordinate that is not in South
 * Africa before it reaches either the map or an estimate.
 *
 * The positions are fictional and deliberately blunt — three decimal places, about a hundred
 * metres. The suburbs are real places; nobody lives at these points, and a preview has no business
 * being precise about where a person is standing.
 */
private val mapWindow = MapWindow(LatLng(-26.172, 27.992), 28.0)
private fun plot(point: LatLng) = projectToSquare(point, mapWindow)

data class DispatchJob(val id: String, val service: String, val area: String, val window: String, val priority: String, val at: LatLng)
/* A nurse who is not sharing a position has none. That is a real state — a phone in a bag, location
   turned off between visits, and a preview that asks for no location permission at all — and the
   board has to be able to say so rather than hold a number that came from nowhere. */
data class DispatchNurse(val id: String, val name: String, val area: String, val status: String, val skills: String, val at: LatLng?)
private data class DispatchZone(val name: String, val at: LatLng, val radiusKm: Double)

private val zones = listOf(
    DispatchZone("Randburg", LatLng(-26.094, 27.999), 3.0), DispatchZone("Rosebank", LatLng(-26.146, 28.042), 2.4),
    DispatchZone("Parktown", LatLng(-26.184, 28.040), 2.2), DispatchZone("Melville", LatLng(-26.175, 27.999), 2.2),
    DispatchZone("Soweto", LatLng(-26.249, 27.908), 4.0)
)
private val jobs = listOf(
    DispatchJob("TH-2049", "Wound care", "Soweto", "11:00 – 12:00", "Same day", LatLng(-26.247, 27.911)),
    DispatchJob("TH-2051", "Vitals & chronic check", "Randburg", "13:00 – 14:00", "Routine", LatLng(-26.099, 28.004)),
    DispatchJob("TH-2052", "Post-operative check", "Parktown", "As soon as possible", "Urgent", LatLng(-26.185, 28.036))
)
private val nurses = listOf(
    DispatchNurse("N-206", "Sister Palesa Khumalo", "Soweto", "Available", "Wound care · Maternal", LatLng(-26.253, 27.904)),
    DispatchNurse("N-205", "Sister Naledi Mokoena", "Rosebank", "Available", "Wound care · Chronic care", LatLng(-26.150, 28.046)),
    DispatchNurse("N-207", "Sister Refilwe Sithole", "Randburg", "Available", "Chronic care · Paediatric", null),
    DispatchNurse("N-208", "Brother Sipho Ndlovu", "Melville", "On a visit", "Post-operative · Chronic care", LatLng(-26.171, 27.995)),
    /* The nearest nurse to the Soweto visit, and the one the board must refuse: her SAPS clearance
       passed its renewal date nine days ago and nobody decided anything. */
    DispatchNurse("N-204", "Sister Ayanda Dube", "Soweto", "Available", "Elderly care", LatLng(-26.240, 27.916))
)

/*
 * What the board holds, for the strip that sits above it.
 *
 * The Control Tower's urgency strip carried four figures typed as literals — twenty-four active
 * visits over a board of three, eighteen available nurses over a roster of five, four off duty when
 * none is, and a worst incident of "high" when one of them is critical. A metric that disagrees with
 * the list underneath it is worse than no metric: an operator who notices once that the strip says
 * twenty-four over three rows has learnt not to believe the number, and the number they will not
 * believe next is the one that matters. On a dispatch board the strip is what you glance at when you
 * have no time to read the rows.
 *
 * So the strip counts these rather than restating them, and `available` asks the vetting register
 * the same question the board asks before it offers anybody a visit — a nurse the board will refuse
 * is not one an operator may be told is available.
 */
object DispatchBoard {
    val awaitingAssignment: List<DispatchJob> get() = jobs
    val roster: List<DispatchNurse> get() = nurses
    fun available(vetting: VettingStore): Int = nurses.count { nurse ->
        nurse.status == "Available" && (vetting.byName(nurse.name)?.let { can(it, "take-visit").allowed } ?: false)
    }
    fun refusedByVetting(vetting: VettingStore): Int = nurses.count { nurse ->
        !(vetting.byName(nurse.name)?.let { can(it, "take-visit").allowed } ?: false)
    }
    val onAVisit: Int get() = nurses.count { it.status != "Available" }
}

/* Plotted once rather than inside the draw pass, so the guard runs — and warns — when the board is
   built rather than on every frame. A position that fails it is not drawn at all: a dot an operator
   cannot trust is worse than no dot, because it looks exactly like the ones they can. */
private fun plotted(at: LatLng?, source: String): BoxPoint? =
    asLatLng(normalizeSouthAfricaLngLat(at, source))?.let { plot(it) }
private val locatedZones = zones.mapNotNull { zone -> plotted(zone.at, "zone:${zone.name}")?.let { zone to it } }
private val locatedNurses = nurses.mapNotNull { nurse -> plotted(nurse.at, "dispatch:${nurse.id}")?.let { nurse to it } }
private val locatedJobs = jobs.mapNotNull { job -> plotted(job.at, "dispatch:${job.id}")?.let { job to it } }
private val unlocated = nurses.count { it.at == null }
private val province = provinceFor(mapWindow.centre)?.name ?: "South Africa"

/* No routing provider is connected, and adding one is a decision about a vendor, a key and a
   dependency rather than a line of code. So every request for a road route comes back unavailable —
   which is also what a real provider returns when it is rate-limited, slow or down, so this is the
   path the board is written against from its first day rather than the one nobody tries.
   model/Geo.kt holds the rule: an unavailable route is said to be unavailable, never quietly
   redrawn as the straight line between the two points, because a line through the buildings looks
   exactly like a road. What the board does instead is ask a different question, by name, and print
   the answer with its basis attached: how far is that in a straight line, at a speed the code can
   point at. */
private fun routeFor(nurse: DispatchNurse, job: DispatchJob): RouteResult =
    noRoutingProvider("No routing provider is connected in this preview.")
private fun etaFor(nurse: DispatchNurse, job: DispatchJob): Eta {
    val measured = etaFromRoute(routeFor(nurse, job))
    if (measured.minutes != null) return measured
    /* A nurse mid-visit has a position, so a straight line would happily produce a number — and the
       number would be a lie, because when she can leave is what decides her arrival and nothing
       here knows that. An estimate with no basis is worth less than the word “estimating”. */
    if (nurse.status == "On a visit") return noEta("On a visit. Nothing here knows when that ends, so there is nothing to estimate from.")
    return straightLineEta(nurse.at, job.at, sourceLabel = "dispatch:${nurse.id}")
}
/* “Estimating” is a word rather than a dash, because an empty value reads as nothing at all to a
   screen reader and a dash reads as one. The basis follows on the next line in both cases, so a
   number never appears on this board without the thing it was derived from — and both lines are
   real text, so TalkBack reads them without anything having to be described to it separately. */
private fun arrivalLine(eta: Eta): String = if (eta.minutes == null) "Arrival estimating" else "About ${eta.minutes} min away"
private fun basisLine(eta: Eta): String = when (eta.basis) {
    EtaBasis.STRAIGHT_LINE -> "Straight line over %.1f km at %d km/h — not a road route."
        .format(Locale.UK, eta.distanceKm ?: 0.0, (eta.speedKmh ?: URBAN_SPEED_KMH).roundToInt())
    EtaBasis.LAST_KNOWN_ROUTE -> "Last measured road route, ${((eta.ageSeconds ?: 0.0) / 60).roundToInt()} min old."
    EtaBasis.ROUTE -> "Measured road route."
    EtaBasis.NONE -> eta.reason ?: "Nothing to estimate from."
}
private val Free = TealInk
private val Busy = Faint
private val Waiting = MangoInk

/**
 * The map is a picture of the same information in the list below it. Everything can be
 * dispatched from the list alone, so the map carries a spoken summary and nothing more.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable fun DispatchBoardScreen(store: PreviewStore, open: (String) -> Unit) {
    var state by remember { mutableStateOf(LoadState.READY) }
    var selected by remember { mutableStateOf(jobs[0].id) }
    val assigned = remember { mutableStateMapOf<String, String>() }
    val job = jobs.first { it.id == selected }
    val gate = { name: String ->
        store.vetting.byName(name)?.let { can(it, "take-visit") }
            ?: VettingDecision(false, "No vetting record. Nobody without one is offered a visit.", emptyList())
    }
    /* Nearest first, and a nurse with no estimate sorts last rather than as though she were nought
       minutes away. Refused nurses are not sorted to the bottom: the nearest nurse to the Soweto
       visit is the one whose clearance lapsed, and an operator who has to scroll to find that out
       has been told it too late. She stays where the distance puts her, unassignable, with the
       reason on the row. */
    val candidates = nurses.map { Triple(it, gate(it.name), etaFor(it, job)) }
        .sortedBy { (_, _, eta) -> eta.minutes ?: Int.MAX_VALUE }
    val dispatchable = candidates.count { (nurse, decision, _) -> decision.allowed && nurse.status == "Available" }
    val refusedCount = candidates.count { (_, decision, _) -> !decision.allowed }
    val estimating = candidates.count { (_, _, eta) -> eta.minutes == null }
    val refusedNames = candidates.filter { (_, decision, _) -> !decision.allowed }.map { it.first.name }.toSet()
    val summary = "Demonstration dispatch map of northern Johannesburg, $province. " +
        "${jobs.size} visits awaiting assignment across ${zones.joinToString(", ") { it.name }}. " +
        "$dispatchable nurses available and cleared by vetting, $refusedCount blocked by vetting" +
        (if (unlocated > 0) ", $unlocated not drawn because no position is being shared" else "") +
        ". All positions are fictional."
    ScreenColumn {
        DemoBadge()
        Heading("Control Tower", "A clear view of care.", "Fictional dispatch board. No live map, assignment or escalation is connected.")
        StatePicker("Preview the dispatch feed state", state) { state = it }
        StateBlock(state, "The live dispatch feed", "location sharing from nurse devices", { state = LoadState.READY }) {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                CareCard {
                    Text("Live dispatch · Demo", style = MaterialTheme.typography.titleMedium)
                    Canvas(Modifier.fillMaxWidth().aspectRatio(1f).semantics { contentDescription = summary; role = Role.Image }) {
                        val side = size.minDimension
                        fun at(point: BoxPoint) = Offset((point.x / 100.0).toFloat() * size.width, (point.y / 100.0).toFloat() * size.height)
                        drawRect(Mist, Offset.Zero, Size(size.width, size.height))
                        locatedZones.forEach { (zone, point) ->
                            drawCircle(IndigoSoft, (kmToBoxUnits(zone.radiusKm, mapWindow) / 100.0).toFloat() * side, at(point))
                        }
                        locatedNurses.forEach { (nurse, point) ->
                            drawCircle(if (nurse.name in refusedNames) Danger else if (nurse.status == "Available") Free else Busy, 9f, at(point))
                        }
                        locatedJobs.forEach { (pin, point) ->
                            val centre = at(point)
                            drawRect(if (assigned[pin.id] != null) Free else Waiting, Offset(centre.x - 9f, centre.y - 9f), Size(18f, 18f))
                        }
                    }
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("● Nurse available", style = MaterialTheme.typography.labelSmall, color = Free)
                        Text("● On a visit", style = MaterialTheme.typography.labelSmall, color = Busy)
                        Text("● Blocked by vetting", style = MaterialTheme.typography.labelSmall, color = Danger)
                        Text("■ Visit", style = MaterialTheme.typography.labelSmall, color = Waiting)
                    }
                    Note("The map is a picture of the same information in the list below it — every pin is projected from the coordinates the arrival estimates are measured from, so the two cannot drift apart. Everything can be dispatched from the list alone.")
                    if (unlocated > 0) Note(
                        if (unlocated == 1) "One nurse has no pin, because her device is not sharing a position. She is in the list with the reason given, and can still be assigned from it."
                        else "$unlocated nurses have no pin, because their devices are not sharing a position. They are in the list with the reason given, and can still be assigned from it."
                    )
                }
                CareCard {
                    Text("Awaiting assignment", style = MaterialTheme.typography.titleMedium)
                    FlowRowChips(jobs.map { it.id }, setOf(selected)) { selected = it }
                    ReviewLine("Service", job.service)
                    ReviewLine("Area", job.area)
                    ReviewLine("Window", job.window)
                    ReviewLine("Priority", job.priority)
                    ReviewLine("Status", assigned[job.id]?.let { "Assigned to $it" } ?: "Unassigned")
                }
                CareCard {
                    Text("Nearest available nurses", style = MaterialTheme.typography.titleMedium)
                    Note("$dispatchable cleared for dispatch" +
                        (if (refusedCount > 0) ", $refusedCount refused by vetting" else "") +
                        (if (estimating > 0) ", $estimating with no arrival estimate" else "") + ".")
                    candidates.forEach { (nurse, decision, eta) ->
                        /* Vetting is not advice to the operator. A nurse whose checks are not in date
                           is still shown — hiding her would hide the reason — but the board refuses
                           the assignment and says which check refused it. */
                        val subject = store.vetting.byName(nurse.name)
                        val vetting = subject?.let { summarise(it) }
                        Column(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Text(nurse.name, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
                                        vetting?.let { StatusPill(it.status.label, if (it.status.label == "Cleared") "teal" else if (it.status.label == "Renewal due") "amber" else "danger") }
                                    }
                                    Note("${nurse.area} · ${nurse.status} · ${arrivalLine(eta)}")
                                    Note(basisLine(eta))
                                    Note(nurse.skills)
                                }
                                /* The web board writes “Cannot be assigned” across this button. A phone
                                   has not got the width: it squeezed the vetting pill next to the name
                                   down to one letter per line, and burying the refusal is the one thing
                                   this screen must not do. The button keeps the short word and goes
                                   dead, the reason is spelt out underneath in full, and the same
                                   sentence web puts in its label is what a screen reader is given here. */
                                OutlinedButton(
                                    onClick = { if (assigned[job.id] == nurse.name) assigned.remove(job.id) else assigned[job.id] = nurse.name },
                                    enabled = decision.allowed && nurse.status == "Available",
                                    modifier = if (decision.allowed) Modifier else Modifier.semantics {
                                        contentDescription = "Cannot be assigned — ${nurse.name}. ${decision.reason.orEmpty()}"
                                    }
                                , shape = ThusoButtonShape) { Text(if (assigned[job.id] == nurse.name) "Assigned" else "Assign") }
                            }
                            if (!decision.allowed) {
                                Text(decision.reason ?: "", style = MaterialTheme.typography.bodySmall, color = Danger)
                                subject?.let { TextButton(onClick = { open("Vetting: ${it.id}") }, shape = ThusoButtonShape) { Text("Open the vetting record") } }
                            }
                        }
                        HorizontalDivider()
                    }
                    Note("Vetting is asked before a name is offered, not after. The Control Tower has no override for a lapsed clearance — there is no button here that would let one be granted.")
                    Note("Estimated arrival is a straight-line guess in this preview. Real dispatch weighs traffic, skills, vetting status, working hours and the patient’s own history with a nurse.")
                    Note("No routing provider is connected, so no road route is drawn and no arrival time is claimed from one. When one is added, a route it cannot give will be shown as unavailable rather than replaced by the straight line above.")
                }
            }
        }
    }
}
data class IncidentSummary(val id: String, val title: String, val severity: String, val area: String, val opened: String, val status: String)
val incidents = listOf(
    IncidentSummary("INC-014", "Nurse could not gain access at the address", "Medium", "Soweto", "09:52", "Triage"),
    IncidentSummary("INC-015", "Patient reported chest pain during a routine visit", "Critical", "Parktown", "10:31", "Escalated"),
    IncidentSummary("INC-016", "Sample seal found damaged on courier handover", "High", "Rosebank", "11:04", "Open")
)
@Composable fun IncidentDetailScreen(reference: String) {
    val incident = incidents.firstOrNull { it.id == reference } ?: incidents[1]
    var severity by remember { mutableStateOf(incident.severity) }
    var action by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    val log = remember { mutableStateListOf<String>() }
    ScreenColumn {
        DemoBadge()
        Heading("Incident management preview", "${incident.id} · ${incident.title}", "Opened ${incident.opened} · ${incident.area}")
        CareCard { ReviewLine("Reported by", "Sister Palesa Khumalo · N-206"); ReviewLine("Current status", incident.status) }
        CareCard {
            Text("Severity", style = MaterialTheme.typography.titleMedium)
            FlowRowChips(listOf("Low", "Medium", "High", "Critical"), setOf(severity)) { severity = it }
            if (severity == "Critical") Note("A critical incident pages the on-call clinical lead immediately. The form is never a prerequisite for calling emergency services.")
        }
        CareCard {
            Text("Immediate action", style = MaterialTheme.typography.titleMedium)
            listOf("Call the nurse now", "Advise nurse to call emergency services", "Escalate to the on-call clinical lead", "Notify the patient’s emergency contact", "Reassign the visit", "Stand down — no further action").forEach { option ->
                Row(
                    Modifier.fillMaxWidth().clickable { action = option }.semantics { selected = action == option },
                    verticalAlignment = Alignment.CenterVertically
                ) { RadioButton(action == option, { action = option }); Text(option, style = MaterialTheme.typography.bodyMedium) }
            }
        }
        OutlinedTextField(notes, { notes = it.take(600) }, label = { Text("Handover note") }, modifier = Modifier.fillMaxWidth().heightIn(min = 120.dp),
            supportingText = { Text("What happened, what you did, what the next shift must know.") })
        StudioButton(onClick = { log.add(action); action = "" }, enabled = action.isNotEmpty(), shape = ThusoButtonShape) { Text("Add demo action to the log") }
        if (log.isNotEmpty()) CareCard {
            Text("Demo incident log", style = MaterialTheme.typography.titleMedium)
            log.forEach { entry ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Outlined.CheckCircle, null, tint = Charcoal); Text(entry, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
        Note("Incident logs are append-only and reviewed weekly. Nothing here is recorded, paged or sent.")
    }
}
