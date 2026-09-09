package za.co.mythuso.model

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import org.json.JSONArray
import org.json.JSONObject

/*
 * The whole visit, held on the phone — not just the readings.
 *
 * CaptureQueue.kt already answers this question for one reading: six states, four conflicts, two
 * clocks, and a file on disk. What it does not cover is the rest of a visit. A nurse in a house in
 * Ivory Park with one bar checks a visit code at the door, reads consent aloud, types seven
 * observations, writes what she found and signs. Only the readings had anywhere to wait. Everything
 * else lived in `remember {}` on VisitAssessmentScreen, which is to say it lived nowhere: the
 * process being reclaimed in the background, a crash, or a phone handed to a toddler lost an
 * assessment that a nurse would then rewrite in the car from memory. A record written from memory an
 * hour later is a different record. That is a clinical safety problem before it is an inconvenience,
 * and it is what this module exists to stop. This is the platform it matters most on: the handset
 * this product is built around is a mid-range Android in a house with one bar.
 *
 * So this is not a second queue. It is the same queue one level up: a part is a piece of a visit
 * that has been finished, it carries the contract's own six states and four conflicts, and an
 * observations part carries real CapturedReadings.
 *
 * WHERE IT DIFFERS FROM THE WEB, AND WHY. apps/web/src/lib/visit-queue.ts is the same module and
 * holds its parts in a module-level array, because scripts/check-boundaries.mjs fails the build on
 * the browser's local storage, session storage and IndexedDB across the whole web app — a preview
 * must not leave patient readings on a borrowed machine. That store does not survive a reload and
 * its screen says so. Android is under no such constraint and does not copy the limitation. This
 * writes through the same CaptureBook the reading ledger uses, into its own file in the app's
 * private storage, and the screen states what it actually survives instead. A queue that forgets is
 * not a queue, it is a delay before losing something.
 *
 * ONE FILE PER THING. visit-parts.json sits beside capture-queue.json rather than inside it, so a
 * parse failure in one cannot take the other down with it — and a file that will not parse is
 * renamed rather than deleted, because “never dropped to make a sync succeed” has a sibling: never
 * dropped to make a parse succeed either.
 *
 * WHAT IT DOES NOT SURVIVE is said on the screen as plainly as what it does, and it is FileBook's
 * own sentence rather than a second wording: uninstalling the app, clearing its storage, a factory
 * reset. It is never copied off this phone — the manifest sets allowBackup to false.
 *
 * Nothing is transmitted. The app declares no permissions at all, internet included; “sending” is
 * decided here, by rules a reader can check, and every screen that shows the result says so. Every
 * part, patient and clinician below is fictional.
 */

/* ---- What a piece of a visit is ---------------------------------------------------------------
   Five parts, because those are the five things a nurse does in a house and each one is separately
   losable. They are not stages of a form — a form is a shape on a screen, and what is held here is
   work that has been done. The names are the assessment's own, so a nurse reading the queue reads
   the visit back rather than reading a data model. */
enum class VisitPartKind(val id: String, val partName: String, val whileHeld: String) {
    IDENTITY("identity", "Identity check",
        "The code was checked against the visit this phone already had. It is checked again by the server when it lands, and a code that fails then stops the visit being filed rather than stopping the visit that already happened."),
    CONSENT("consent", "Consent",
        "What she agreed to is recorded here. It is not in her consent record yet, so nothing downstream may rely on it."),
    OBSERVATIONS("observations", "Readings",
        "The numbers are here with where each one came from. No doctor can see them, and nothing has been compared against her history."),
    FINDINGS("findings", "What you found",
        "Written and kept. Nothing has been read by anybody else, and no referral has been raised."),
    SIGN_OFF("sign-off", "Your sign-off",
        "Signed on this phone, and not yet filed. A signature that has not reached the record cannot be relied on by anybody who was not in the room.")
}
fun visitPartKindById(id: String): VisitPartKind? = VisitPartKind.entries.firstOrNull { it.id == id }

/** One line of the detail behind a part. A list of pairs rather than a map, because the order a
 *  nurse did these things in is part of reading them back. */
data class VisitPartFact(val label: String, val value: String)

data class VisitPart(
    val id: String,
    val kind: VisitPartKind,
    /** Which visit this belongs to, so two visits queued on one phone never answer for each other. */
    val visit: String,
    val patient: String,
    /** One line, in the nurse's own terms, saying what this part holds. */
    val summary: String,
    val detail: List<VisitPartFact> = emptyList(),
    /** Observations only. Real readings, carrying their own provenance and instrument. */
    val readings: List<CapturedReading> = emptyList(),
    val byId: String,
    val byName: String,
    val byReference: String,
    /* Two clocks, kept apart for the same reason CapturedReading keeps them apart. The first is what
       this phone believed; the second is the only one that orders anything. */
    val deviceMillis: Long,
    val serverMillis: Long? = null,
    val writtenMillis: Long,
    val state: CaptureState,
    val conflictId: String? = null,
    val note: String? = null
) {
    /** Still only on this phone, and still hers to correct. */
    val isPending: Boolean get() = state == CaptureState.CAPTURED || state == CaptureState.QUEUED || state == CaptureState.SENDING
    /** Sealed and waiting on a connection: everything the nurse can do has been done. */
    val isSealed: Boolean get() = state == CaptureState.QUEUED || state == CaptureState.SENDING
}

/* ---- Serialising ------------------------------------------------------------------------------
   org.json, the same parser the reading ledger uses, so the build gains no dependency for it. The
   readings inside an observations part go through Capture's own reader and writer rather than a
   second pair here: two modules that disagree about what a reading is on disk is exactly the drift
   the contract files exist to prevent. */
private fun factToJson(fact: VisitPartFact) = JSONObject().apply { put("label", fact.label); put("value", fact.value) }

private fun partToJson(part: VisitPart): JSONObject = JSONObject().apply {
    put("id", part.id); put("kind", part.kind.id); put("visit", part.visit); put("patient", part.patient)
    put("summary", part.summary)
    put("detail", JSONArray().also { array -> part.detail.forEach { array.put(factToJson(it)) } })
    put("readings", JSONArray().also { array -> part.readings.forEach { array.put(readingToJson(it)) } })
    put("byId", part.byId); put("byName", part.byName); put("byReference", part.byReference)
    put("deviceMillis", part.deviceMillis); put("writtenMillis", part.writtenMillis)
    part.serverMillis?.let { put("serverMillis", it) }
    put("state", part.state.id)
    part.conflictId?.let { put("conflictId", it) }
    part.note?.let { put("note", it) }
}

private fun jsonToPart(json: JSONObject): VisitPart? {
    /* A part that comes back off the disk without a kind is a part nobody can say what it is. It is
       dropped from the queue rather than defaulted into one, on the same reasoning that drops a
       reading with no origin: a row nobody can name is not filed. */
    val kind = visitPartKindById(json.optString("kind")) ?: return null
    val details = json.optJSONArray("detail") ?: JSONArray()
    val rows = json.optJSONArray("readings") ?: JSONArray()
    return VisitPart(
        id = json.optString("id"), kind = kind, visit = json.optString("visit"),
        patient = json.optString("patient"), summary = json.optString("summary"),
        detail = (0 until details.length()).map { index ->
            val fact = details.optJSONObject(index) ?: JSONObject()
            VisitPartFact(fact.optString("label"), fact.optString("value"))
        },
        readings = (0 until rows.length()).mapNotNull { jsonToReading(rows.optJSONObject(it) ?: JSONObject()) },
        byId = json.optString("byId"), byName = json.optString("byName"), byReference = json.optString("byReference"),
        deviceMillis = json.optLong("deviceMillis"),
        serverMillis = if (json.has("serverMillis") && !json.isNull("serverMillis")) json.optLong("serverMillis") else null,
        writtenMillis = json.optLong("writtenMillis"),
        state = captureStateById(json.optString("state")),
        conflictId = json.optString("conflictId").ifEmpty { null },
        note = json.optString("note").ifEmpty { null }
    )
}

/* ---- The questions asked on arrival ------------------------------------------------------------
   The same questions CaptureStore.settle asks of a reading, in the same order and for the same
   reasons: whether the person who did the work may still file it, whether the record moved on
   underneath it, and — for readings only — whether the record already holds this observation for
   this visit. The clocks are last and are never a refusal.

   The duplicate question is not answered here. It is asked of CaptureStore, which is the module
   that holds what this phone believes is already in the record. A second module keeping its own
   idea of what a duplicate is would be a second gate, and two gates is where holes live. */
data class VisitArrival(
    val nowMillis: Long,
    val capturerAllowed: Boolean,
    val capturerReason: String? = null,
    /** A doctor signed, or the visit was cancelled, while the part was waiting. */
    val recordMovedOn: Boolean = false,
    val movedOnNote: String? = null,
    /** What the record already holds for a visit, asked of the capture ledger rather than kept here. */
    val alreadyStored: (String) -> Set<String> = { emptySet() }
)

fun receiveVisitPart(part: VisitPart, arrival: VisitArrival): VisitPart {
    val received = part.copy(serverMillis = arrival.nowMillis, writtenMillis = arrival.nowMillis)
    if (!arrival.capturerAllowed) return received.copy(
        state = CaptureState.CONFLICTED, conflictId = "vetting-lapsed",
        note = "${part.byName} was cleared when she did this and is not cleared now. ${arrival.capturerReason.orEmpty()} It is kept — it was validly done — and it is not filed on her authority alone.".replace("  ", " ").trim()
    )
    if (arrival.recordMovedOn) return received.copy(
        state = CaptureState.CONFLICTED, conflictId = "stale-write",
        note = arrival.movedOnNote
            ?: "The record changed while this was waiting to send. It is never applied silently after the fact."
    )
    if (part.readings.isNotEmpty()) {
        val stored = arrival.alreadyStored(part.visit)
        val clashing = part.readings.filter { it.observationId in stored }
        if (clashing.isNotEmpty()) return received.copy(
            state = CaptureState.CONFLICTED, conflictId = "duplicate-observation",
            note = "The record already holds ${clashing.joinToString(" and ") { it.label }} for ${part.visit}. Both are kept; a clinician says which stands."
        )
    }
    return received.copy(state = CaptureState.STORED, conflictId = null)
}

/* ---- One live store the visit screens share ---------------------------------------------------- */
class VisitQueueStore(private val book: CaptureBook) {
    val parts = mutableStateListOf<VisitPart>()
    /** When this app last read the ledger off the disk. Shown on screen, in words, never hidden. */
    var readAtMillis by mutableLongStateOf(System.currentTimeMillis())
        private set
    var writtenMillis by mutableLongStateOf(0L)
        private set
    var storeNote by mutableStateOf("")
        private set
    /* Two design-review controls, and neither pretends to be a product feature: there is no radio in
       this build and no doctor to sign anything, so the two things that make a queue interesting
       have to be askable for. Both are marked as such on screen. */
    var pretendConnected by mutableStateOf(false)
    var pretendDoctorSigned by mutableStateOf(false)
    /** The last attempt to reach a server, and what it said. Never a silent fall-back to the cache. */
    var lastAttempt by mutableStateOf<String?>(null)
        private set
    private var sequence = 0

    val where: String get() = book.where
    val survives: String get() = book.survives
    val doesNotSurvive: String get() = book.doesNotSurvive
    val setAside: String? get() = book.setAside

    init { load() }

    private fun load() {
        val raw = book.read()
        readAtMillis = System.currentTimeMillis()
        if (raw == null) { seed(); storeNote = "No visit ledger existed on this phone, so one was written with the parts a review needs to see on opening."; return }
        val parsed = runCatching { JSONObject(raw) }.getOrNull()
        if (parsed == null) {
            book.quarantine("unparseable")
            seed()
            storeNote = "The visit ledger on this phone could not be read. It has been kept under another name rather than overwritten, and a fresh one was started. Nothing was deleted."
            return
        }
        sequence = parsed.optInt("sequence", 0)
        writtenMillis = parsed.optLong("writtenMillis", 0L)
        val rows = parsed.optJSONArray("parts") ?: JSONArray()
        val restored = (0 until rows.length()).mapNotNull { jsonToPart(rows.optJSONObject(it) ?: JSONObject()) }
        val dropped = rows.length() - restored.size
        parts.clear(); parts.addAll(restored)
        storeNote = when {
            dropped > 0 -> "$dropped stored ${if (dropped == 1) "part" else "parts"} came back without a name for what ${if (dropped == 1) "it was" else "they were"} and ${if (dropped == 1) "was" else "were"} not restored. A row nobody can say what it is is not filed."
            else -> "Read from the visit ledger on this phone."
        }
        if (parts.isEmpty()) seed()
    }

    private fun save() {
        val now = System.currentTimeMillis()
        writtenMillis = now
        book.write(JSONObject().apply {
            put("version", 1)
            put("writtenMillis", now)
            put("sequence", sequence)
            put("parts", JSONArray().also { array -> parts.forEach { array.put(partToJson(it)) } })
        }.toString())
    }

    /** Reload from disk. A cold launch without the launch — used to prove the queue survived. */
    fun reload() { parts.clear(); load() }

    /** The only thing here that removes anything, and it is a person's deliberate act on fictional
     *  parts — never something a sync, a sign-out or a failure does. */
    fun forgetEverything() {
        parts.clear(); sequence = 0
        save()
        seed()
        storeNote = "The demonstration ledger was cleared by the design-review control below and written again from the fixtures. In the product there is no such button: a part is superseded or withdrawn with a reason, never erased."
    }

    val held: List<VisitPart> get() = parts.filter { it.state == CaptureState.CAPTURED }
    val sealed: List<VisitPart> get() = parts.filter { it.isSealed }
    val queued: List<VisitPart> get() = parts.filter { it.state == CaptureState.QUEUED }
    val conflicted: List<VisitPart> get() = parts.filter { it.state == CaptureState.CONFLICTED }
    val stored: List<VisitPart> get() = parts.filter { it.state == CaptureState.STORED }
    val pending: List<VisitPart> get() = parts.filter { it.isPending }

    fun heldFor(visit: String, kind: VisitPartKind): VisitPart? =
        parts.firstOrNull { it.visit == visit && it.kind == kind && it.state == CaptureState.CAPTURED }
    fun forVisit(visit: String): List<VisitPart> = parts.filter { it.visit == visit }

    /** The age of the oldest thing still on this phone. Nothing here is ever a bare timestamp. */
    fun oldestPendingMillis(): Long? = pending.minOfOrNull { it.deviceMillis }

    /* Hold a finished part on the device. Nothing is sent, and the state says exactly that.

       One part per kind per visit: a nurse who steps back to correct the readings and comes forward
       again has corrected them, not taken a second set, so a held part is replaced rather than
       stacked. Anything already sealed or stored is left alone — that is no longer hers to
       overwrite, and a second set against a stored one is the duplicate conflict, arrived at rather
       than invented. */
    fun hold(
        kind: VisitPartKind, visit: String, patient: String, summary: String,
        detail: List<VisitPartFact> = emptyList(), readings: List<CapturedReading> = emptyList(),
        by: VettingSubject
    ): VisitPart {
        sequence += 1
        val now = System.currentTimeMillis()
        val part = VisitPart(
            id = "VQ-%03d".format(sequence), kind = kind, visit = visit, patient = patient,
            summary = summary, detail = detail, readings = readings,
            byId = by.id, byName = by.name, byReference = by.reference,
            deviceMillis = now, writtenMillis = now, state = CaptureState.CAPTURED
        )
        val index = parts.indexOfFirst { it.visit == visit && it.kind == kind && it.state == CaptureState.CAPTURED }
        if (index >= 0) parts[index] = part.copy(id = parts[index].id) else parts.add(part)
        save()
        return part
    }

    /** Sealing is the nurse saying she is finished. The contract's own word for the state she leaves
     *  it in, and after it there is nothing left for her to do. */
    fun seal(visit: String): Int {
        val now = System.currentTimeMillis()
        var count = 0
        parts.indices.forEach { index ->
            val part = parts[index]
            if (part.visit == visit && part.state == CaptureState.CAPTURED) {
                parts[index] = part.copy(state = CaptureState.QUEUED, writtenMillis = now); count += 1
            }
        }
        if (count > 0) save()
        return count
    }

    /* ---- Sending -------------------------------------------------------------------------------
       Two steps with a pause between them, because “sending” is a state a nurse can watch fail and a
       queue whose in-flight state is invisible is a queue nobody believes. There is no server and no
       permission to reach one, so this is arithmetic rather than a request — written the way a real
       sync has to behave: work that does not land goes back to waiting rather than disappearing. */
    fun beginSending(): Int {
        val waiting = queued
        if (!pretendConnected) {
            lastAttempt = "Nothing was sent: this phone is being shown with no signal. ${waiting.size} ${if (waiting.size == 1) "piece" else "pieces"} of work stay sealed and waiting, which is what waiting is supposed to look like."
            return 0
        }
        waiting.forEach { entry ->
            val index = parts.indexOfFirst { it.id == entry.id }
            if (index >= 0) parts[index] = parts[index].copy(state = CaptureState.SENDING)
        }
        lastAttempt = "Sending ${waiting.size} ${if (waiting.size == 1) "piece" else "pieces"} against the design-review connection. Nothing left this phone."
        if (waiting.isNotEmpty()) save()
        return waiting.size
    }

    /** An interrupted send puts the work back in the queue, and nowhere else. */
    fun interruptSend() {
        var moved = false
        parts.indices.forEach { index ->
            if (parts[index].state == CaptureState.SENDING) {
                parts[index] = parts[index].copy(
                    state = CaptureState.QUEUED, writtenMillis = System.currentTimeMillis(),
                    note = "The send was interrupted. It went back to the queue rather than anywhere else."
                )
                moved = true
            }
        }
        if (moved) { lastAttempt = "The send was interrupted. Everything went back to the queue rather than anywhere else."; save() }
    }

    fun settle(vetting: VettingStore, capture: CaptureStore, signedVisits: Set<String>) {
        val inFlight = parts.filter { it.state == CaptureState.SENDING }
        if (inFlight.isEmpty()) return
        var filed = 0
        var conflicts = 0
        inFlight.forEach { entry ->
            val capturer = vetting.subject(entry.byId)
            val decision = capturer?.let { can(it, "write-clinical-note") }
            val arrival = VisitArrival(
                nowMillis = System.currentTimeMillis(),
                capturerAllowed = decision?.allowed ?: false,
                capturerReason = decision?.reason,
                recordMovedOn = pretendDoctorSigned || entry.visit in signedVisits,
                movedOnNote = "A doctor signed this visit while the work was waiting to send. It is never applied silently after the fact, and a signed record is not edited behind the signature.",
                alreadyStored = { visit ->
                    capture.forVisit(visit)
                        .filter { it.state == CaptureState.STORED && !it.superseded }
                        .map { it.observationId }.toSet()
                }
            )
            val index = parts.indexOfFirst { it.id == entry.id }
            if (index >= 0) {
                val answered = receiveVisitPart(entry, arrival)
                parts[index] = answered
                if (answered.state == CaptureState.STORED) filed += 1 else conflicts += 1
            }
        }
        val said = buildList {
            if (filed > 0) add("$filed filed")
            if (conflicts > 0) add("$conflicts waiting on a clinician")
        }
        lastAttempt = "Decided here, on this phone, by the rules in VisitQueue.kt — there is no server in this build: ${said.joinToString(", ")}."
        save()
    }

    /* ---- What is found at the start of a shift ---------------------------------------------------
       One part from the last house, sealed and never sent, and one that reached the record two days
       ago. Not staging: the first is what an offline queue actually looks like at the start of a
       shift, and the second is what gives the duplicate check something to answer against. Written
       only when the ledger is empty, so a queue that survived a restart is never overwritten. */
    private fun seed() {
        val naledi = Triple("N-205", "Sister Naledi Mokoena", "SANC 20016688")
        val now = System.currentTimeMillis()
        val hour = 3_600_000L
        fun reading(id: String, value: String) = CapturedReading(
            id = "VQ-$id", visit = seedVisit, patient = seedPatient, observationId = id,
            label = measureLabels[id] ?: id, unit = measureUnits[id] ?: "", value = value,
            provenance = Provenance.MANUAL,
            byId = naledi.first, byName = naledi.second, byReference = naledi.third,
            deviceMillis = now - 20 * hour, writtenMillis = now - 20 * hour, state = CaptureState.QUEUED
        )
        sequence = 2
        parts.clear()
        parts.addAll(listOf(
            VisitPart(
                id = "VQ-001", kind = VisitPartKind.OBSERVATIONS, visit = seedVisit, patient = seedPatient,
                summary = "Three readings from yesterday’s visit in Parktown",
                detail = listOf(
                    VisitPartFact("Blood pressure — systolic", "138 mmHg"),
                    VisitPartFact("Pulse", "78 bpm"),
                    VisitPartFact("Temperature", "36.9 °C")
                ),
                readings = listOf(reading("systolic", "138"), reading("pulse", "78"), reading("temperature", "36.9")),
                byId = naledi.first, byName = naledi.second, byReference = naledi.third,
                deviceMillis = now - 20 * hour, writtenMillis = now - 20 * hour, state = CaptureState.QUEUED
            ),
            VisitPart(
                id = "VQ-002", kind = VisitPartKind.IDENTITY, visit = seedVisit, patient = seedPatient,
                summary = "Visit code confirmed at the door, and identity seen",
                detail = listOf(
                    VisitPartFact("Visit code", "Six digits, matched"),
                    VisitPartFact("Identity", "Document seen by the nurse")
                ),
                byId = naledi.first, byName = naledi.second, byReference = naledi.third,
                deviceMillis = now - (20.2 * hour).toLong(),
                serverMillis = now - (19.9 * hour).toLong(),
                writtenMillis = now - (19.9 * hour).toLong(), state = CaptureState.STORED
            )
        ))
        save()
    }

    companion object {
        const val seedVisit = "TH-2041"
        const val seedPatient = "R. Sithole"
    }
}
