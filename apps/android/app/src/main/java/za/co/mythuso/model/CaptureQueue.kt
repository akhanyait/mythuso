package za.co.mythuso.model

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.LocalDate
import kotlin.random.Random

/*
 * The queue, and the one place this preview is allowed to keep something.
 *
 * The web build forbids localStorage outright — scripts/check-boundaries.mjs fails on the word —
 * because a browser tab is not a place to leave somebody's readings. Android is a different
 * argument. A nurse standing in a home in Ivory Park with no signal has nowhere else to put her
 * work, and the contract makes a promise about it:
 *
 *   “An entry that has been captured is the nurse's work. It survives a crash, a restart and a
 *    sign-out, and it is never dropped to make a sync succeed.”
 *
 * A promise like that is either kept on disk or it is not kept. So it is kept on disk, in the app's
 * own private files directory, using the platform's own JSON — no Room, no dependency, nothing that
 * would need a permission. What it survives and what it does not is written on the screen that shows
 * it, in words, because a nurse who believes the queue survives more than it does will one day lose
 * a morning's work to a fact nobody told her.
 *
 * What it survives: closing the app, the process being killed, a crash, a restart of the phone, and
 * signing out — the log-out route in this preview returns to first-run and the queue is still there
 * afterwards, which is the whole point of the word “sign-out” in the rule.
 * What it does not survive: uninstalling the app, clearing its storage from Android settings, or a
 * factory reset. It is never copied off this phone: the manifest sets android:allowBackup="false",
 * so Android's own backup never takes it.
 * What it is not: encrypted. This is a design preview holding fictional readings, and a file in
 * filesDir is private to the app and no more than that. Real readings would need the controls in
 * docs/PRIVACY-AND-SECURITY.md first, and the screen says so rather than implying otherwise.
 */

/** Where the queue actually lives. An interface so a preview can hold one in memory and say so. */
interface CaptureBook {
    fun read(): String?
    fun write(text: String)
    /** A file that will not parse is kept, not deleted. Losing work to a bad parse is still losing work. */
    fun quarantine(reason: String)
    /** What the kept-aside file is now called, once one exists. A screen that says work was kept
     *  and cannot say where it was kept has asked to be believed rather than checked. */
    val setAside: String? get() = null
    val where: String
    val survives: String
    val doesNotSurvive: String
}

/** Used by @Preview and by anything with no Context. It says out loud that it keeps nothing. */
class MemoryBook : CaptureBook {
    private var held: String? = null
    override fun read(): String? = held
    override fun write(text: String) { held = text }
    override fun quarantine(reason: String) { held = null }
    override val where = "Held in memory only, because this screen was opened without a file store."
    override val survives = "Nothing. Every entry here is lost when this screen closes."
    override val doesNotSurvive = "A crash, a restart, a sign-out, or leaving this screen."
}

/**
 * A single JSON file in the app's private storage, written whole and renamed into place, so a
 * process killed mid-write leaves the previous queue intact rather than half of two.
 *
 * The name is a parameter because there is more than one thing on this phone worth keeping and one
 * file per thing is the point: a parse failure in the readings must not take the rest of the visit
 * down with it, and the reverse. The machinery — the temp file, the rename, the quarantine — is the
 * same machinery, written once.
 */
class FileBook(private val directory: File, private val name: String = "capture-queue.json") : CaptureBook {
    private val file = File(directory, name)
    private val pending = File(directory, "$name.writing")
    private val stem = name.removeSuffix(".json")
    override fun read(): String? = if (file.exists()) runCatching { file.readText() }.getOrNull() else null
    override fun write(text: String) {
        runCatching {
            directory.mkdirs()
            pending.writeText(text)
            /* Rename, not overwrite. The old file is whole until the instant the new one is. */
            if (!pending.renameTo(file)) { file.writeText(text); pending.delete() }
        }
    }
    override var setAside: String? = null
        private set
    override fun quarantine(reason: String) {
        val aside = File(directory, "$stem.unreadable-${System.currentTimeMillis()}.json")
        runCatching { file.renameTo(aside) }.onSuccess { setAside = aside.name }
    }
    override val where = "A file in this app’s own private storage on this phone. Nothing is sent anywhere: the app declares no permissions at all, internet included."
    override val survives = "Closing the app, the process being killed, a crash, restarting the phone, and signing out."
    override val doesNotSurvive = "Uninstalling MyThuso, clearing the app’s storage in Android settings, or a factory reset. It is never backed up off this phone — the manifest sets allowBackup to false."
}

/* ---- Serialising ------------------------------------------------------------------------------
   org.json ships with Android, so the queue is written and read with the platform's own parser and
   the build gains no dependency for it. Nullable fields are written as absent rather than as the
   string "null", because a queue that reads back the word null as an instrument name is worse than
   one that will not read back at all. */
private fun JSONObject.putIf(key: String, value: String?) { if (value != null) put(key, value) }
private fun JSONObject.text(key: String): String? = if (isNull(key)) null else optString(key, "").ifEmpty { null }
private fun JSONObject.millis(key: String): Long? = if (isNull(key) || !has(key)) null else optLong(key)

internal fun readingToJson(reading: CapturedReading): JSONObject = JSONObject().apply {
    put("id", reading.id); put("visit", reading.visit); put("patient", reading.patient)
    put("observationId", reading.observationId); put("label", reading.label); put("unit", reading.unit)
    put("value", reading.value); put("provenance", reading.provenance.id)
    putIf("instrumentId", reading.instrumentId); putIf("instrumentName", reading.instrumentName)
    putIf("serial", reading.serial); putIf("calibrationLine", reading.calibrationLine)
    putIf("calibrationState", reading.calibrationState?.id)
    putIf("detailLabel", reading.detailLabel); putIf("detailValue", reading.detailValue)
    put("caveats", JSONArray(reading.caveats)); put("derivedFrom", JSONArray(reading.derivedFrom))
    put("byId", reading.byId); put("byName", reading.byName); put("byReference", reading.byReference)
    put("deviceMillis", reading.deviceMillis)
    reading.serverMillis?.let { put("serverMillis", it) }
    put("writtenMillis", reading.writtenMillis); put("state", reading.state.id)
    putIf("conflictId", reading.conflictId); putIf("refusal", reading.refusal)
    putIf("supersededById", reading.supersededById); putIf("supersedes", reading.supersedes)
    putIf("countersignedBy", reading.countersignedBy); putIf("countersignedReference", reading.countersignedReference)
    putIf("resolutionNote", reading.resolutionNote)
}
internal fun jsonToReading(json: JSONObject): CapturedReading? {
    /* provenanceIsRequired, enforced where it can actually be enforced: a row that comes back off
       the disk without an origin is dropped from the reading, not defaulted into one. It is the one
       case where losing a row is right — a value nobody can say the origin of is not filed. */
    val provenance = provenanceById(json.optString("provenance")) ?: return null
    fun strings(key: String): List<String> {
        val array = json.optJSONArray(key) ?: return emptyList()
        return (0 until array.length()).map { array.optString(it) }
    }
    return CapturedReading(
        id = json.optString("id"), visit = json.optString("visit"), patient = json.optString("patient"),
        observationId = json.optString("observationId"), label = json.optString("label"), unit = json.optString("unit"),
        value = json.optString("value"), provenance = provenance,
        instrumentId = json.text("instrumentId"), instrumentName = json.text("instrumentName"),
        serial = json.text("serial"), calibrationLine = json.text("calibrationLine"),
        calibrationState = CalibrationState.entries.firstOrNull { it.id == json.text("calibrationState") },
        detailLabel = json.text("detailLabel"), detailValue = json.text("detailValue"),
        caveats = strings("caveats"), derivedFrom = strings("derivedFrom"),
        byId = json.optString("byId"), byName = json.optString("byName"), byReference = json.optString("byReference"),
        deviceMillis = json.optLong("deviceMillis"), serverMillis = json.millis("serverMillis"),
        writtenMillis = json.optLong("writtenMillis"), state = captureStateById(json.optString("state")),
        conflictId = json.text("conflictId"), refusal = json.text("refusal"),
        supersededById = json.text("supersededById"), supersedes = json.text("supersedes"),
        countersignedBy = json.text("countersignedBy"), countersignedReference = json.text("countersignedReference"),
        resolutionNote = json.text("resolutionNote")
    )
}
private fun pairedToJson(paired: PairedInstrument): JSONObject = JSONObject().apply {
    put("instrumentId", paired.instrument.id); put("serial", paired.serial)
    put("lastCalibrated", paired.calibration.lastCalibrated.toString())
    put("everyMonths", paired.calibration.everyMonths); put("battery", paired.battery)
}
private fun jsonToPaired(json: JSONObject): PairedInstrument? {
    val instrument = kitInstrumentById(json.optString("instrumentId")) ?: return null
    val last = runCatching { LocalDate.parse(json.optString("lastCalibrated")) }.getOrNull() ?: return null
    return PairedInstrument(instrument, json.optString("serial"), Calibration(last, json.optInt("everyMonths", instrument.calibrateEveryMonths)), json.optInt("battery", 80))
}

/* ---- The store ---------------------------------------------------------------------------------
   Every change writes the whole file. The queue is a handful of readings from one morning's visits,
   so rewriting it is cheaper than reasoning about a partially applied edit, and a queue that can be
   left half-written is exactly the queue the rule is written against. */
class CaptureStore(private val book: CaptureBook) {
    val readings = mutableStateListOf<CapturedReading>()
    val paired = mutableStateListOf<PairedInstrument>()
    /** When this app last read the store off the disk. Shown on screen, in words, never hidden. */
    var readAtMillis by mutableLongStateOf(System.currentTimeMillis())
        private set
    var storeNote by mutableStateOf("")
        private set
    /* Two design-review controls, because the states they produce cannot otherwise be seen on a
       phone that is genuinely not connected to anything. Both are marked as such on screen. */
    var pretendConnected by mutableStateOf(false)
    var clockOffsetMinutes by mutableLongStateOf(0L)
    /** The last attempt to reach a server, and what it said. Never a silent fall-back to the cache. */
    var lastAttempt by mutableStateOf<String?>(null)
        private set
    private var sequence = 0
    private val dice = Random(4482)

    val where: String get() = book.where
    val survives: String get() = book.survives
    val doesNotSurvive: String get() = book.doesNotSurvive

    init { load() }

    private fun load() {
        val raw = book.read()
        readAtMillis = System.currentTimeMillis()
        if (raw == null) { seed(); return }
        val parsed = runCatching { JSONObject(raw) }.getOrNull()
        if (parsed == null) {
            /* The file is there and unreadable. It is kept under another name rather than
               overwritten, because “never dropped to make a sync succeed” has a sibling: never
               dropped to make a parse succeed either. */
            book.quarantine("unparseable")
            storeNote = "The queue file on this phone could not be read. It has been kept under another name rather than overwritten, and the demonstration queue below was written fresh."
            seed()
            return
        }
        sequence = parsed.optInt("sequence", 0)
        val rows = parsed.optJSONArray("readings") ?: JSONArray()
        val restored = (0 until rows.length()).mapNotNull { jsonToReading(rows.optJSONObject(it) ?: JSONObject()) }
        val dropped = rows.length() - restored.size
        val kit = parsed.optJSONArray("paired") ?: JSONArray()
        readings.clear(); readings.addAll(restored)
        paired.clear(); paired.addAll((0 until kit.length()).mapNotNull { jsonToPaired(kit.optJSONObject(it) ?: JSONObject()) })
        storeNote = when {
            dropped > 0 -> "$dropped stored row${if (dropped == 1) "" else "s"} came back without an origin and ${if (dropped == 1) "was" else "were"} not restored. A value nobody can say the origin of is not filed."
            else -> ""
        }
        if (readings.isEmpty() && paired.isEmpty()) seed()
    }

    private fun save() {
        val payload = JSONObject().apply {
            put("version", 1)
            put("writtenMillis", System.currentTimeMillis())
            put("sequence", sequence)
            put("readings", JSONArray().also { array -> readings.forEach { array.put(readingToJson(it)) } })
            put("paired", JSONArray().also { array -> paired.forEach { array.put(pairedToJson(it)) } })
        }
        book.write(payload.toString())
    }
    /** Reload from disk. Used to prove the queue survived, and to show its age honestly. */
    fun reload() { load() }
    fun forgetEverything() {
        readings.clear(); paired.clear(); sequence = 0
        storeNote = "The demonstration queue was cleared from this phone by the design-review control below. In the product there is no such button: an entry is superseded or withdrawn with a reason, never erased."
        save()
    }

    private fun nextId(): String { sequence += 1; return "CR-%05d".format(sequence) }
    /** What this phone believes the time is — which is not the same thing as what the time is. */
    fun deviceNow(): Long = System.currentTimeMillis() + clockOffsetMinutes * 60_000L

    /* ---- Pairing -------------------------------------------------------------------------------
       “Discover” is a two-second timer and a list compiled into the app. No Bluetooth adapter is
       touched, no scan is started and no permission is asked for, and the screen says exactly that
       rather than performing a search. */
    fun unpaired(): List<KitInstrument> = kitInstruments.filter { instrument -> paired.none { it.instrument.id == instrument.id } }
    fun pair(instrument: KitInstrument) {
        if (paired.any { it.instrument.id == instrument.id }) return
        paired.add(PairedInstrument(instrument, fictionalSerial(instrument), fictionalCalibration(instrument), 60 + dice.nextInt(38)))
        save()
    }
    fun unpair(instrumentId: String) {
        paired.removeAll { it.instrument.id == instrumentId }
        save()
    }
    fun pairedFor(measure: String): PairedInstrument? = paired.firstOrNull { measure in it.instrument.measures }

    /* ---- Taking a reading ---------------------------------------------------------------------- */
    fun record(reading: CapturedReading): CapturedReading {
        readings.add(0, reading)
        save()
        return reading
    }
    /**
     * A reading off an instrument. The number is generated on this phone and the screen says so; what
     * is not invented is anything travelling with it — the serial, the calibration line and the
     * caveat are the paired instrument's own.
     */
    fun captureFromInstrument(
        paired: PairedInstrument, measure: String, visit: String, patient: String,
        by: VettingSubject, detailValue: String
    ): CapturedReading {
        val expired = detailValue.contains("expired")
        val value = generatedValue(measure, low = expired)
        val caveats = buildList {
            calibrationCaveat(paired.instrument, paired.calibration)?.let { add(it) }
            add(paired.instrument.note)
            if (expired) add("Taken on a strip lot that expired last month. An expired strip reads low; this number is not to be read as a normal result without repeating it on an in-date lot.")
        }
        val now = System.currentTimeMillis()
        return record(
            CapturedReading(
                id = nextId(), visit = visit, patient = patient, observationId = measure,
                label = measureLabels[measure] ?: measure, unit = measureUnits[measure] ?: "",
                value = value, provenance = Provenance.DEVICE,
                instrumentId = paired.instrument.id, instrumentName = paired.instrument.name, serial = paired.serial,
                calibrationLine = calibrationWording(paired.calibration), calibrationState = paired.state,
                detailLabel = paired.instrument.records.label, detailValue = detailValue,
                caveats = caveats,
                byId = by.id, byName = by.name, byReference = by.reference,
                deviceMillis = deviceNow(), writtenMillis = now, state = CaptureState.CAPTURED
            )
        )
    }
    /** A reading a person took and typed, or a person reported. Same shape, different fact. */
    fun captureByHand(
        measure: String, value: String, provenance: Provenance, visit: String, patient: String,
        by: VettingSubject, patientName: String
    ): CapturedReading {
        val now = System.currentTimeMillis()
        return record(
            CapturedReading(
                id = nextId(), visit = visit, patient = patient, observationId = measure,
                label = measureLabels[measure] ?: measure, unit = measureUnits[measure] ?: "",
                value = value, provenance = provenance,
                caveats = if (provenance == Provenance.PATIENT_REPORTED)
                    listOf("What $patientName said, recorded as what they said. It is not a finding, and no clinician observed it.")
                else emptyList(),
                byId = by.id, byName = by.name, byReference = by.reference,
                deviceMillis = deviceNow(), writtenMillis = now, state = CaptureState.CAPTURED
            )
        )
    }
    /** Sealing is the nurse saying she is finished with it. After this the phone owes it a connection. */
    fun seal(id: String) {
        replace(id) { it.copy(state = CaptureState.QUEUED, writtenMillis = System.currentTimeMillis()) }
    }
    fun sealAllCaptured() {
        readings.filter { it.state == CaptureState.CAPTURED }.forEach { seal(it.id) }
    }

    private fun replace(id: String, change: (CapturedReading) -> CapturedReading) {
        val index = readings.indexOfFirst { it.id == id }
        if (index >= 0) readings[index] = change(readings[index])
        save()
    }

    /* ---- Sending -------------------------------------------------------------------------------
       There is no server and no permission to reach one, so this is arithmetic on the queue rather
       than a request. It is written the way a real sync has to behave: an entry that does not land
       goes back to waiting rather than disappearing, and nothing is decided about a conflict here —
       the queue only notices it. */
    fun beginSending(): Int {
        val waiting = readings.filter { it.state == CaptureState.QUEUED }
        waiting.forEach { entry -> replace(entry.id) { it.copy(state = CaptureState.SENDING) } }
        lastAttempt = if (pretendConnected)
            "Sending ${waiting.size} entr${if (waiting.size == 1) "y" else "ies"} against the design-review connection. Nothing left this phone."
        else "No connection. ${waiting.size} entr${if (waiting.size == 1) "y" else "ies"} stayed on this phone; nothing was dropped to make the attempt succeed."
        return waiting.size
    }
    /**
     * What the server would have said. A party whose clearance has lapsed since the capture is the
     * conflict that matters — the reading is not discarded, because it was taken while she was
     * cleared, and it is not filed either, because it cannot be filed on her authority alone.
     */
    fun settle(vetting: VettingStore, signedVisits: Set<String>) {
        val inFlight = readings.filter { it.state == CaptureState.SENDING }
        if (!pretendConnected) {
            inFlight.forEach { entry -> replace(entry.id) { it.copy(state = CaptureState.QUEUED) } }
            return
        }
        inFlight.forEach { entry ->
            val capturer = vetting.subject(entry.byId)
            val stillCleared = capturer?.let { can(it, "write-clinical-note").allowed } ?: false
            val landedAlready = readings.any {
                it.id != entry.id && it.visit == entry.visit && it.observationId == entry.observationId &&
                    it.state == CaptureState.STORED && !it.superseded
            }
            val received = System.currentTimeMillis()
            replace(entry.id) {
                when {
                    !stillCleared -> it.copy(state = CaptureState.CONFLICTED, conflictId = "vetting-lapsed", serverMillis = received)
                    entry.visit in signedVisits -> it.copy(state = CaptureState.CONFLICTED, conflictId = "stale-write", serverMillis = received)
                    landedAlready -> it.copy(state = CaptureState.CONFLICTED, conflictId = "duplicate-observation", serverMillis = received)
                    else -> it.copy(state = CaptureState.STORED, conflictId = null, serverMillis = received)
                }
            }
        }
    }

    /* ---- Resolving -----------------------------------------------------------------------------
       Nothing here merges two readings and nothing deletes one. The losing reading keeps its row,
       its number and its origin, and gains a pointer to the one that stands. */
    fun chooseBetween(standsId: String, supersededId: String, by: VettingSubject, note: String) {
        val received = System.currentTimeMillis()
        replace(standsId) {
            it.copy(state = CaptureState.STORED, conflictId = null, supersedes = supersededId,
                serverMillis = it.serverMillis ?: received,
                resolutionNote = "Chosen by ${by.name} · ${by.reference}. $note")
        }
        replace(supersededId) {
            it.copy(state = CaptureState.STORED, conflictId = null, supersededById = standsId,
                serverMillis = it.serverMillis ?: received,
                resolutionNote = "Superseded by $standsId, chosen by ${by.name} · ${by.reference}. Kept in full: the reading happened, and a record that deletes it cannot show why the retake was taken.")
        }
    }
    /**
     * The lapsed-capturer answer. Both names are on the record afterwards — the nurse who took it
     * and the currently-cleared clinician who accepted it — because re-attributing it to the
     * countersigner would erase the person who was actually in the room.
     */
    fun countersign(id: String, by: VettingSubject) {
        val entry = readings.firstOrNull { it.id == id } ?: return
        replace(id) {
            it.copy(
                state = CaptureState.STORED, conflictId = null,
                serverMillis = it.serverMillis ?: System.currentTimeMillis(),
                countersignedBy = by.name, countersignedReference = by.reference,
                resolutionNote = "Taken by ${entry.byName} · ${entry.byReference}, whose clearance lapsed after this reading was taken. Filed on the authority of ${by.name} · ${by.reference}, who accepted it. Both names stand on the record."
            )
        }
    }
    /** Held is a decision too, and it is the honest one when nobody is willing to countersign yet. */
    fun hold(id: String, note: String) {
        replace(id) { it.copy(state = CaptureState.CONFLICTED, resolutionNote = note) }
    }
    /** Withdrawing keeps the row and the reason. It is not a delete, and the screen does not call it one. */
    fun withdraw(id: String, by: VettingSubject, reason: String) {
        replace(id) {
            it.copy(state = CaptureState.REFUSED, refusal = reason,
                resolutionNote = "Withdrawn by ${by.name} · ${by.reference}. The reading stays on this phone with its reason attached; nothing was deleted.")
        }
    }
    /** A late addendum: applied to a signed record openly, with the clinician who signed told. */
    fun fileAsAddendum(id: String, by: VettingSubject) {
        replace(id) {
            it.copy(state = CaptureState.STORED, conflictId = null,
                serverMillis = it.serverMillis ?: System.currentTimeMillis(),
                countersignedBy = by.name, countersignedReference = by.reference,
                resolutionNote = "Filed as an addendum after the record was signed, accepted by ${by.name} · ${by.reference}. The signature it arrived after is not altered, and the clinician who gave it is notified.")
        }
    }

    /* ---- Readings for a visit -------------------------------------------------------------------
       Everything the assessment and the consultation record read comes through here, so a reading
       that was superseded is still visible and a reading nobody may see is not quietly included. */
    fun forVisit(visit: String): List<CapturedReading> = readings.filter { it.visit == visit }
    fun standingFor(visit: String, observationId: String): CapturedReading? =
        readings.firstOrNull { it.visit == visit && it.observationId == observationId && !it.superseded && it.state != CaptureState.REFUSED }
    /** Ordering: the server's receipt time where there is one, the phone's own write order where there is not. */
    fun ordered(): List<CapturedReading> {
        val landed = readings.filter { it.serverMillis != null }.sortedByDescending { it.serverMillis }
        val notYet = readings.filter { it.serverMillis == null }.sortedByDescending { it.writtenMillis }
        return notYet + landed
    }
    fun counts(): Map<CaptureState, Int> = CaptureState.entries.associateWith { state -> readings.count { it.state == state } }

    /* ---- Generated numbers -----------------------------------------------------------------------
       Plausible fictional values, produced on this phone so the capture flow has something to file.
       Every screen that shows one says where it came from. */
    private fun generatedValue(measure: String, low: Boolean): String = when (measure) {
        "systolic" -> "${118 + dice.nextInt(30)}"
        "diastolic" -> "${72 + dice.nextInt(20)}"
        "pulse" -> "${62 + dice.nextInt(28)}"
        "respiratory" -> "${13 + dice.nextInt(7)}"
        "temperature" -> "%.1f".format(36.2 + dice.nextInt(16) / 10.0)
        "oxygen" -> "${94 + dice.nextInt(6)}"
        "glucose" -> "%.1f".format(if (low) 2.9 + dice.nextInt(9) / 10.0 else 4.4 + dice.nextInt(30) / 10.0)
        "weight" -> "%.1f".format(58.0 + dice.nextInt(350) / 10.0)
        "ecg" -> "Sinus rhythm, 30-second trace"
        else -> "—"
    }
    private fun fictionalSerial(instrument: KitInstrument): String {
        val prefix = instrument.id.take(2).uppercase()
        return "TH-$prefix-${4000 + dice.nextInt(5000)}"
    }
    /* One instrument out of calibration, one due inside the warning window and the rest in date, so
       every calibration state is reachable without anybody editing a date. */
    private fun fictionalCalibration(instrument: KitInstrument): Calibration = when (instrument.id) {
        "glucometer" -> Calibration(inMonths(-8), instrument.calibrateEveryMonths)      // out of date by about two months
        "scale" -> Calibration(inDays(-330), instrument.calibrateEveryMonths)           // due inside the 45-day window
        "pulse-oximeter" -> Calibration(inDays(-710), instrument.calibrateEveryMonths)  // due inside the window
        else -> Calibration(inMonths(-3), instrument.calibrateEveryMonths)
    }

    /* ---- The demonstration queue -----------------------------------------------------------------
       Written only when the store is empty, so a queue that survived a restart is never overwritten
       by a seed. Every state and every conflict is represented, because a design review cannot review
       a state it has to be told about. The dates are relative, so the lapsed nurse's reading is
       always “taken three days before her clearance ran out” rather than a date that goes stale. */
    private fun seed() {
        val now = System.currentTimeMillis()
        val minute = 60_000L
        paired.clear()
        listOf("bp-cuff", "thermometer", "glucometer").mapNotNull(::kitInstrumentById).forEach { instrument ->
            paired.add(PairedInstrument(instrument, fictionalSerial(instrument), fictionalCalibration(instrument), 60 + dice.nextInt(38)))
        }
        val cuff = paired.first { it.instrument.id == "bp-cuff" }
        val thermometer = paired.first { it.instrument.id == "thermometer" }
        val meter = paired.first { it.instrument.id == "glucometer" }
        fun id() = nextId()
        val naledi = Triple("N-205", "Sister Naledi Mokoena", "SANC 20016688")
        val ayanda = Triple("N-204", "Sister Ayanda Dube", "SANC 20022145")
        val rows = listOf(
            CapturedReading(
                id(), "TH-2048", "Lerato Molefe", "systolic", measureLabels["systolic"]!!, "mmHg", "146",
                Provenance.DEVICE, cuff.instrument.id, cuff.instrument.name, cuff.serial,
                calibrationWording(cuff.calibration), cuff.state,
                cuff.instrument.records.label, "Standard adult", listOf(cuff.instrument.note),
                byId = naledi.first, byName = naledi.second, byReference = naledi.third,
                deviceMillis = now - 41 * minute, serverMillis = now - 38 * minute, writtenMillis = now - 41 * minute,
                state = CaptureState.STORED
            ),
            CapturedReading(
                id(), "TH-2048", "Lerato Molefe", "diastolic", measureLabels["diastolic"]!!, "mmHg", "94",
                Provenance.DEVICE, cuff.instrument.id, cuff.instrument.name, cuff.serial,
                calibrationWording(cuff.calibration), cuff.state,
                cuff.instrument.records.label, "Standard adult", listOf(cuff.instrument.note),
                byId = naledi.first, byName = naledi.second, byReference = naledi.third,
                deviceMillis = now - 41 * minute, serverMillis = now - 38 * minute, writtenMillis = now - 41 * minute,
                state = CaptureState.STORED
            ),
            /* The device clock was three hours and seven minutes slow when this was taken. Both times
               are kept; only the server's orders anything. */
            CapturedReading(
                id(), "TH-2048", "Lerato Molefe", "temperature", measureLabels["temperature"]!!, "°C", "37.1",
                Provenance.DEVICE, thermometer.instrument.id, thermometer.instrument.name, thermometer.serial,
                calibrationWording(thermometer.calibration), thermometer.state,
                thermometer.instrument.records.label, "Forehead", listOf(thermometer.instrument.note),
                byId = naledi.first, byName = naledi.second, byReference = naledi.third,
                deviceMillis = now - 187 * minute, serverMillis = now - 33 * minute, writtenMillis = now - 187 * minute,
                state = CaptureState.STORED
            ),
            /* A manual reading beside the device ones: the same visit, a different fact, neither the
               lesser of the other. */
            CapturedReading(
                id(), "TH-2048", "Lerato Molefe", "respiratory", measureLabels["respiratory"]!!, "breaths/min", "18",
                Provenance.MANUAL,
                byId = naledi.first, byName = naledi.second, byReference = naledi.third,
                deviceMillis = now - 36 * minute, serverMillis = now - 34 * minute, writtenMillis = now - 36 * minute,
                state = CaptureState.STORED
            ),
            /* Out of calibration, and filed. The rule is that the caveat travels, not that the number
               is refused. */
            CapturedReading(
                id(), "TH-2048", "Lerato Molefe", "glucose", measureLabels["glucose"]!!, "mmol/L", "5.6",
                Provenance.DEVICE, meter.instrument.id, meter.instrument.name, meter.serial,
                calibrationWording(meter.calibration), meter.state,
                meter.instrument.records.label, "Lot 4471-A · in date",
                listOfNotNull(calibrationCaveat(meter.instrument, meter.calibration), meter.instrument.note),
                byId = naledi.first, byName = naledi.second, byReference = naledi.third,
                deviceMillis = now - 22 * minute, writtenMillis = now - 22 * minute, state = CaptureState.QUEUED
            ),
            /* Two readings, one observation: a retake after a doubtful first. Both are kept. */
            CapturedReading(
                id(), "TH-2048", "Lerato Molefe", "pulse", measureLabels["pulse"]!!, "bpm", "88",
                Provenance.DEVICE, cuff.instrument.id, cuff.instrument.name, cuff.serial,
                calibrationWording(cuff.calibration), cuff.state,
                cuff.instrument.records.label, "Standard adult", listOf(cuff.instrument.note),
                byId = naledi.first, byName = naledi.second, byReference = naledi.third,
                deviceMillis = now - 40 * minute, serverMillis = now - 37 * minute, writtenMillis = now - 40 * minute,
                state = CaptureState.STORED
            ),
            CapturedReading(
                id(), "TH-2048", "Lerato Molefe", "pulse", measureLabels["pulse"]!!, "bpm", "104",
                Provenance.MANUAL,
                caveats = listOf("Counted by hand over a full minute after the cuff reading looked settled. Taken because the patient reported palpitations between the two."),
                byId = naledi.first, byName = naledi.second, byReference = naledi.third,
                deviceMillis = now - 19 * minute, serverMillis = now - 18 * minute, writtenMillis = now - 19 * minute,
                state = CaptureState.CONFLICTED, conflictId = "duplicate-observation"
            ),
            /* The capturer's clearance lapsed nine days ago; this was taken twelve days ago. The
               arithmetic, not a label, is what makes it true whenever this is opened. */
            CapturedReading(
                id(), "TH-2041", "Sipho Radebe", "oxygen", measureLabels["oxygen"]!!, "%", "96",
                Provenance.DEVICE, "pulse-oximeter", "Pulse oximeter", "TH-PU-6218",
                "Calibrated ${formatVettingDate(inMonths(-23))}, every 24 months.", CalibrationState.DUE,
                "Perfusion at the probe", "Cool hands",
                listOf(kitInstrumentById("pulse-oximeter")!!.note),
                byId = ayanda.first, byName = ayanda.second, byReference = ayanda.third,
                deviceMillis = now - 12 * 24 * 60 * minute, writtenMillis = now - 12 * 24 * 60 * minute,
                state = CaptureState.CONFLICTED, conflictId = "vetting-lapsed"
            ),
            /* The record moved on while this waited: the doctor signed TH-2045 yesterday. */
            CapturedReading(
                id(), "TH-2045", "Thando Mokoena", "systolic", measureLabels["systolic"]!!, "mmHg", "132",
                Provenance.MANUAL,
                byId = naledi.first, byName = naledi.second, byReference = naledi.third,
                deviceMillis = now - 30 * 60 * minute, serverMillis = now - 90 * minute, writtenMillis = now - 30 * 60 * minute,
                state = CaptureState.CONFLICTED, conflictId = "stale-write"
            ),
            /* Refused, and the server says why. It stays here until somebody decides. */
            CapturedReading(
                id(), "TH-2039", "Lindiwe Nkosi", "ecg", measureLabels["ecg"]!!, "trace", "Sinus rhythm, 30-second trace",
                Provenance.DEVICE, "ecg", "Single-lead ECG", "TH-EC-3305",
                "Calibrated ${formatVettingDate(inMonths(-2))}, every 12 months.", CalibrationState.IN_DATE,
                "Trace quality", "Some movement artefact",
                listOf(kitInstrumentById("ecg")!!.note),
                byId = naledi.first, byName = naledi.second, byReference = naledi.third,
                deviceMillis = now - 4 * 60 * minute, serverMillis = now - 3 * 60 * minute, writtenMillis = now - 4 * 60 * minute,
                state = CaptureState.REFUSED,
                refusal = "The patient withdrew consent to record-keeping after this trace was taken. The server will not write it, and says so rather than dropping it quietly."
            ),
            /* Not a measurement: what the patient said she measured at home. */
            CapturedReading(
                id(), "TH-2048", "Lerato Molefe", "glucose", measureLabels["glucose"]!!, "mmol/L", "5.2",
                Provenance.PATIENT_REPORTED,
                caveats = listOf("What Lerato said, recorded as what she said. She measured it at home this morning on her own meter, which is not paired and not calibrated by anybody here."),
                byId = naledi.first, byName = naledi.second, byReference = naledi.third,
                deviceMillis = now - 44 * minute, writtenMillis = now - 44 * minute, state = CaptureState.CAPTURED
            ),
            /* Calculated, and it names its inputs — the two stored readings at the top of this list. */
            CapturedReading(
                id(), "TH-2048", "Lerato Molefe", "map", "Mean arterial pressure", "mmHg",
                "%.0f".format(meanArterialPressure(146.0, 94.0)!!),
                Provenance.DERIVED,
                derivedFrom = mapDerivedFrom(146.0, 94.0),
                byId = naledi.first, byName = naledi.second, byReference = naledi.third,
                deviceMillis = now - 37 * minute, writtenMillis = now - 37 * minute, state = CaptureState.QUEUED
            )
        )
        readings.clear(); readings.addAll(rows.reversed())
        save()
    }
}
