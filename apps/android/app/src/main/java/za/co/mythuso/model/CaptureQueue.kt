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
    /**
     * Null when the bytes are on the disk, and the reason they are not when they are not.
     *
     * It used to return nothing and swallow the failure. A phone that is out of space — a mid-range
     * handset with a camera roll on it, which is the likeliest way this app ever loses an assessment
     * — refused the write, the reading stayed in memory looking filed, and the screen went on saying
     * the work was held on this phone. It was not: the next launch read the last file that landed.
     * `queuedIsNotLost` cannot be kept by a write nobody checked, so the outcome is a return value
     * and every caller has to do something with it.
     */
    fun write(text: String): String?
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
    /** Memory does not run out the way a disk does, so this is the one book that cannot refuse. */
    override fun write(text: String): String? { held = text; return null }
    override fun quarantine(reason: String) { held = null }
    private val store = storeSaying("android-in-memory")
    override val where = store.heldIn
    override val survives = store.saysSurvives.joinToString(" ")
    override val doesNotSurvive = store.saysLostTo.joinToString(" ")
}

/* What each book says about itself, read from packages/catalog/capture.json through the generated
   CaptureData rather than typed here (1 October 2026). These sentences were written in this file and
   in the contract both, and scripts/check-boundaries.mjs held the copies identical by quarantine; one
   author is the arrangement the quarantine was waiting for. A missing store is a build that has lost
   its contract, and failing loudly here is better than a book that quietly says nothing. */
private fun storeSaying(id: String): QueueStore =
    checkNotNull(CaptureData.store(id)) { "packages/catalog/capture.json has lost the store \"$id\"" }
private fun failureSaying(id: String): String =
    checkNotNull(CaptureData.writeFailure(id)) { "packages/catalog/capture.json has lost the write failure \"$id\"" }.says

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
    override fun write(text: String): String? = runCatching {
        directory.mkdirs()
        pending.writeText(text)
        /* Rename, not overwrite. The old file is whole until the instant the new one is — and a
           write that threw above never reaches this line, so a disk that filled halfway through
           leaves the previous ledger in place rather than half of two. */
        if (!pending.renameTo(file)) { file.writeText(text); pending.delete() }
        null
    }.getOrElse { failure -> refusalFor(failure) }
    /* Two sentences rather than one, because they ask for different things from the person holding
       the phone. Out of space is hers to fix and worth telling her how; anything else is not, and
       saying "free some space" to a nurse whose phone has plenty would send her looking for a
       problem she does not have. Neither pretends the work is safe. */
    private fun refusalFor(failure: Throwable): String {
        val outOfSpace = generateSequence(failure) { it.cause }
            .any { it.message?.contains("No space left on device", ignoreCase = true) == true || it is java.io.IOException && it.message?.contains("ENOSPC") == true }
        return failureSaying(if (outOfSpace) "disk-full" else "write-refused")
    }
    override var setAside: String? = null
        private set
    override fun quarantine(reason: String) {
        val aside = File(directory, "$stem.unreadable-${System.currentTimeMillis()}.json")
        runCatching { file.renameTo(aside) }.onSuccess { setAside = aside.name }
    }
    private val store = storeSaying("android-private-file")
    override val where = store.heldIn
    override val survives = store.saysSurvives.joinToString(" ")
    override val doesNotSurvive = store.saysLostTo.joinToString(" ")
}

/* ---- Getting it onto the disk without stopping the screen ---------------------------------------
 * Both ledgers used to serialise themselves and write the whole file synchronously, on the main
 * thread, from a Compose onClick. That was measured on a Pixel 3a emulator before it was changed,
 * because a refactor justified by a guess is worse than the thing it replaces:
 *
 *   VisitQueueStore.hold(identity), a shift's ledger (35 parts, 38 KB): p50 5.31 ms, p95 34.28 ms
 *   CaptureStore.record(), a shift's ledger (118 readings, 46 KB):      p50 3.44 ms, p95 45.98 ms
 *   Of which FileBook.write() itself is p50 0.25 ms. The cost is org.json building the string.
 *
 * Single taps, then, are a dropped frame rather than a freeze — and the emulator's CPU is the host's,
 * so a mid-range handset is several times worse. What was a freeze is further down: CaptureStore ran
 * every state change through replace(), and replace() ended in save(), so one tap on "seal
 * everything" wrote the whole ledger once per reading — 445 ms for 57 readings, and 316 ms to begin
 * sending 59. That is fixed by writing once per tap rather than once per row, which is worth more
 * than any amount of threading; a redundant write moved to a background thread is still redundant.
 *
 * What is left after that is worth moving anyway, and this is what moves it. The rules it is built
 * under, in the order they matter:
 *
 * A WRITE THAT IS QUEUED AND LOST IS WORSE THAN A WRITE THAT BLOCKS. So the screen never describes
 * work as held while it is still on its way. `state` is what the disk has actually taken, the strip
 * above the assessment reads it, and it says "being written" for the milliseconds it is true rather
 * than saying "held on this phone" and hoping. That is the whole reason this is safe to do at all:
 * the window a force-quit could land in is a window in which nothing claimed the work was safe.
 *
 * ONE THREAD, SO WRITES CANNOT OVERTAKE EACH OTHER. Two threads writing a whole ledger through one
 * temp name and one rename is a ledger that ends up at whichever finished last, which is not
 * necessarily the newest.
 *
 * A NEWER PAYLOAD REPLACES AN OLDER ONE RATHER THAN QUEUEING BEHIND IT. Every payload is the entire
 * ledger, so an older one holds nothing the newer one lacks. A nurse tapping through five stages
 * faster than the disk writes gets one write of the final state, not five of the intermediate ones.
 *
 * IT IS FLUSHED WHEN THE APP STOPS. Backgrounding is the moment before a process is most likely to
 * be killed, so MainActivity blocks there until the writer is idle. Blocking is right in exactly that
 * one place: the alternative is losing the write, and nobody is looking at the screen.
 */
sealed interface LedgerWrite {
    /** Everything in memory is on the disk. The only state in which work may be called held. */
    data object Settled : LedgerWrite
    /** On its way. True for milliseconds, and said out loud rather than assumed away. */
    data object Writing : LedgerWrite
    /** The disk would not take it, in the book's own words. Never a silent failure. */
    data class Refused(val reason: String) : LedgerWrite
}

class LedgerWriter(private val book: CaptureBook, name: String) {
    var state by mutableStateOf<LedgerWrite>(LedgerWrite.Settled)
        private set
    /** When the disk last actually took a write — not when one was last asked for. */
    var settledMillis by mutableLongStateOf(System.currentTimeMillis())
        private set

    /**
     * What the disk said to the last payload that reached it, readable without waiting.
     *
     * `state` is what a screen reads and is posted to the main thread. Code that has just called
     * [flush] from the main thread cannot read it — its own post is queued behind that code — and
     * the one caller that must know synchronously is the visit ledger's migration, which will not
     * rewrite a file in a shape that cannot hold readings until it knows the readings landed.
     */
    @Volatile private var lastRefusal: String? = null

    private val issued = java.util.concurrent.atomic.AtomicLong(0)
    private val pending = java.util.concurrent.atomic.AtomicReference<Pair<Long, () -> String>?>(null)
    private val main = android.os.Handler(android.os.Looper.getMainLooper())
    /*
     * One thread at most, and none at all when there is nothing to write.
     *
     * Below the UI thread's priority, because this must never win a scheduling contest against
     * drawing. A daemon, because a ledger writer is not a reason to keep a process alive. And
     * allowCoreThreadTimeOut, because a store is built per activity and the font-scale suite
     * relaunches the activity sixteen times: a pool that holds its core thread for ever would leave
     * thirty-two threads and thirty-two dead stores behind it on a single-core handset. Core and
     * maximum are both one, so writes still run in the order they were submitted.
     */
    private val thread = java.util.concurrent.ThreadPoolExecutor(
        1, 1, 30L, java.util.concurrent.TimeUnit.SECONDS, java.util.concurrent.LinkedBlockingQueue()
    ) { runnable ->
        Thread(runnable, "mythuso-ledger-$name").apply { isDaemon = true; priority = Thread.NORM_PRIORITY - 1 }
    }.apply { allowCoreThreadTimeOut(true) }

    /**
     * Hand over a payload to be built and written off this thread.
     *
     * The builder runs on the writer, not here, because building the string is where the time goes.
     * It must therefore close over an immutable snapshot rather than over the live state list — a
     * caller that hands this a reference to a list the UI is still editing has moved a race onto a
     * background thread rather than moved work onto one.
     */
    fun submit(build: () -> String) {
        val ticket = issued.incrementAndGet()
        pending.set(ticket to build)
        state = LedgerWrite.Writing
        thread.execute {
            /* Null when a newer submit has already claimed this payload's turn. */
            val (mine, payload) = pending.getAndSet(null) ?: return@execute
            val refusal = book.write(payload())
            lastRefusal = refusal
            main.post {
                when {
                    refusal != null -> state = LedgerWrite.Refused(refusal)
                    /* Only the newest write settles the ledger. An older one landing while a newer
                       one is still in flight has not made the screen's account of the disk true. */
                    mine == issued.get() -> { state = LedgerWrite.Settled; settledMillis = System.currentTimeMillis() }
                }
            }
        }
    }

    /** Block until what has been submitted is on the disk, and say what the disk said. Called where
     *  blocking is the safe choice; the return value is null when it took the write. */
    fun flush(): String? {
        runCatching { thread.submit { }.get(2, java.util.concurrent.TimeUnit.SECONDS) }
        return lastRefusal
    }
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
    private val writer = LedgerWriter(book, "capture")

    val where: String get() = book.where
    val survives: String get() = book.survives
    val doesNotSurvive: String get() = book.doesNotSurvive
    /** What the reading ledger that would not parse is now called, once one has been set aside. */
    val setAside: String? get() = book.setAside
    /** What the disk has actually taken. Read by any screen that calls this work held. */
    val writeState: LedgerWrite get() = writer.state
    /** Block until what has been recorded is on the disk. Called when the app is going away. */
    fun flushToDisk() = writer.flush()

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

    /* One tap, one write.
       Every state change here goes through replace(), and replace() ends in save(). That is right
       for a single reading and wrong for a loop: sealAllCaptured, beginSending and settle each walk
       the queue calling it, so one tap serialised and wrote the whole ledger once per row — 445 ms
       to seal 57 readings on a Pixel 3a emulator, and 316 ms to begin sending 59. Nothing about the
       result differed from writing once at the end, because each payload is the entire ledger.
       LedgerWriter drops a payload a newer one supersedes, so it would absorb most of that on its
       own. This is still worth doing above it, for two reasons: it saves N snapshot copies of the
       whole list on the main thread rather than one, and it says in the code that these loops are a
       single decision — which is the thing a reader needs to know before adding another one. */
    private var deferred = 0
    private var deferredDirty = false
    private fun <T> asOneWrite(work: () -> T): T {
        deferred += 1
        return try { work() } finally {
            deferred -= 1
            /* finally, so a throw halfway through a loop still writes what did happen. Losing the
               rows that succeeded because a later one failed is the shape of loss this file exists
               to prevent. */
            if (deferred == 0 && deferredDirty) { deferredDirty = false; save() }
        }
    }

    private fun save() {
        if (deferred > 0) { deferredDirty = true; return }
        /* Snapshots, because the payload is built on the writer's thread and these lists belong to
           the UI. The rows themselves are immutable, so this is a pointer copy rather than a cost. */
        val rows = readings.toList()
        val kit = paired.toList()
        val at = sequence
        writer.submit {
            JSONObject().apply {
                put("version", 1)
                put("writtenMillis", System.currentTimeMillis())
                put("sequence", at)
                put("readings", JSONArray().also { array -> rows.forEach { array.put(readingToJson(it)) } })
                put("paired", JSONArray().also { array -> kit.forEach { array.put(pairedToJson(it)) } })
            }.toString()
        }
    }
    /** Reload from disk. Used to prove the queue survived, and to show its age honestly.
     *  It waits for anything in flight first: reading the file while a write is on its way would
     *  read the version before it and then present that as what the phone is holding. */
    fun reload() { writer.flush(); load() }
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
    fun sealAllCaptured() = asOneWrite {
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
    fun beginSending(): Int = asOneWrite {
        val waiting = readings.filter { it.state == CaptureState.QUEUED }
        waiting.forEach { entry -> replace(entry.id) { it.copy(state = CaptureState.SENDING) } }
        lastAttempt = if (pretendConnected)
            "Sending ${waiting.size} entr${if (waiting.size == 1) "y" else "ies"} against the design-review connection. Nothing left this phone."
        else "No connection. ${waiting.size} entr${if (waiting.size == 1) "y" else "ies"} stayed on this phone; nothing was dropped to make the attempt succeed."
        waiting.size
    }
    /**
     * What the server would have said. A party whose clearance has lapsed since the capture is the
     * conflict that matters — the reading is not discarded, because it was taken while she was
     * cleared, and it is not filed either, because it cannot be filed on her authority alone.
     */
    fun settle(vetting: VettingStore, signedVisits: Set<String>) = asOneWrite {
        val inFlight = readings.filter { it.state == CaptureState.SENDING }
        if (!pretendConnected) {
            inFlight.forEach { entry -> replace(entry.id) { it.copy(state = CaptureState.QUEUED) } }
            return@asOneWrite
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
    fun chooseBetween(standsId: String, supersededId: String, by: VettingSubject, note: String) = asOneWrite {
        /* Both halves of one decision, so both reach the disk together or the ledger holds a reading
           that was superseded by one that does not know it superseded anything. */
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
       that was superseded is still visible and a reading nobody may see is not quietly included.

       This is now the *whole* answer to “what was measured at this visit”, which it was not before.
       A reading a nurse typed used to be embedded in an observations VisitPart and never reach this
       list, so forVisit() returned the instrument's readings and nothing else, and only a screen
       that remembered to union the two got the truth. The consultation record did not remember.
       A reading lives here whatever produced it; a visit part names ids. */
    fun forVisit(visit: String): List<CapturedReading> = readings.filter { it.visit == visit }
    fun standingFor(visit: String, observationId: String): CapturedReading? =
        readings.firstOrNull { it.visit == visit && it.observationId == observationId && !it.superseded && it.state != CaptureState.REFUSED }
    /**
     * The standing reading of an observation that is *not* the one named, which is the question the
     * assessment actually asks: it holds a reading of its own for most observations now, so “is
     * there a reading for this” would otherwise be answered by the screen's own typed number and the
     * kit's reading would disappear behind it.
     */
    fun standingBesides(visit: String, observationId: String, exceptId: String): CapturedReading? =
        readings.firstOrNull {
            it.visit == visit && it.observationId == observationId && it.id != exceptId &&
                !it.superseded && it.state != CaptureState.REFUSED
        }
    fun reading(id: String): CapturedReading? = readings.firstOrNull { it.id == id }
    /** The readings a part names, in the order it named them. */
    fun readingsNamed(ids: List<String>): List<CapturedReading> = ids.mapNotNull { id -> reading(id) }
    /** And the ids it names that are not here. A dangling reference is said out loud on the screen
     *  rather than shown as a shorter list — a part that quietly names six readings and renders five
     *  is the same silence the embedded copies were. */
    fun missingNamed(ids: List<String>): List<String> = ids.filter { reading(it) == null }

    /* ---- Filing what a nurse typed at a visit ----------------------------------------------------
       The assessment screen's readings arrive here rather than being embedded in the part that names
       them. Their ids are derived from the visit and the observation, so a nurse who steps back and
       corrects a number has corrected the reading rather than taken a second one — the same rule the
       visit ledger applies to a held part, applied to the row underneath it.

       What is *not* overwritten is anything past CAPTURED. Once she has sealed it, it is no longer
       hers to change quietly, and a second value against a sealed one is the duplicate conflict —
       arrived at rather than invented. */
    fun fileTyped(readings: List<CapturedReading>): List<String> = asOneWrite {
        readings.map { row ->
            val index = this.readings.indexOfFirst { it.id == row.id }
            when {
                index < 0 -> { this.readings.add(0, row); save() }
                this.readings[index].state == CaptureState.CAPTURED ->
                    /* Keep the moment it was first taken. A correction at 11:04 to a reading taken at
                       10:58 happened at 10:58; only the write is new. */
                    replace(row.id) { row.copy(deviceMillis = it.deviceMillis, writtenMillis = System.currentTimeMillis()) }
                else -> Unit
            }
            row.id
        }
    }
    /** Sealing a visit seals the readings its parts name. They are the same work and a nurse who has
     *  signed is finished with both; a ledger that still called them hers to correct would be the
     *  split this change removed, moved from where a reading lives into what state it is in. */
    fun sealNamed(ids: Collection<String>) = asOneWrite {
        ids.forEach { id -> if (reading(id)?.state == CaptureState.CAPTURED) seal(id) }
    }
    /**
     * Take in readings that were found embedded in an older visit ledger, and say how many were new.
     *
     * Idempotent by id, so a launch that migrates and is killed before the visit ledger is rewritten
     * migrates the same rows again to no effect. Appended rather than prepended: they are older work
     * than anything this session produced, and `readings` is newest-first.
     */
    fun adopt(rows: List<CapturedReading>): Int = asOneWrite {
        val fresh = rows.filter { row -> readings.none { it.id == row.id } }
        if (fresh.isNotEmpty()) { readings.addAll(fresh); save() }
        fresh.size
    }
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
