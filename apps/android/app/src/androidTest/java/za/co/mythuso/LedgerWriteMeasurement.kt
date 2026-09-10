package za.co.mythuso

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import za.co.mythuso.model.*
import java.io.File

/*
 * How long the two ledgers actually take to write, measured on the device rather than argued about —
 * and the one invariant those measurements bought, asserted so it cannot quietly come back.
 *
 * Both stores used to serialise the whole ledger and write the whole file synchronously on whatever
 * thread called them, which was always the main thread: every caller is a Compose onClick. The tap
 * that holds the identity part is a nurse saying the person in front of her is the person the visit
 * is for, and if that tap freezes the screen it freezes at the worst moment there is. But a refactor
 * justified by a guess is worse than the thing it replaces, so this was measured first.
 *
 * WHAT IT FOUND, on a Pixel 3a API 32 emulator, one core, before anything was changed:
 *
 *   VisitQueueStore.hold(identity), a shift (35 parts, 38 KB): p50 5.31 ms, p95 34.28 ms, max 64.55
 *   CaptureStore.record(), a shift (118 readings, 46 KB):      p50 3.44 ms, p95 45.98 ms, max 62.85
 *   Of which FileBook.write() itself is p50 0.25 ms — the cost is org.json building the string.
 *   sealAllCaptured() over 57 held readings, ONE TAP:          445.1 ms
 *   beginSending() over 59 queued readings, ONE TAP:           315.9 ms
 *
 * So single taps were a dropped frame, and the two loops were a freeze: CaptureStore ran every state
 * change through replace(), replace() ended in save(), and the loops called it once per row. Writing
 * once per tap was worth more than any amount of threading — a redundant write moved to a background
 * thread is still redundant — and the rest was moved off the main thread afterwards. Same hardware,
 * after: hold() p50 0.17 ms / p95 0.32 ms on the main thread and p50 7.57 ms until it is on the
 * disk; sealing 57 readings 8.9 ms; beginning to send 59, 9.7 ms.
 *
 * The number worth reading twice is not any of those, though. Run under load — the whole suite on
 * one core — building the same shift-sized payload went from p50 3.05 ms to p50 33.24 ms and p95
 * 70.69 ms, the same work an order of magnitude slower because something else wanted the CPU. The
 * main-thread figure barely moved: p50 0.25 ms, p95 0.98 ms. That is the point of the change. A
 * mid-range handset in somebody's house is the loaded case, always, and what was bought is a tap
 * whose cost no longer depends on what else the phone is doing.
 *
 * WHAT THE SIZES ARE. One visit is five parts and seven readings: what VisitAssessmentScreen builds
 * between a door and a signature. A shift is eight of those, because a queue is not emptied until
 * there is signal and a nurse in Ivory Park may not have any all morning — that is the state the
 * ledger is largest in and the state the freeze was reported in.
 *
 * WHAT THIS IS NOT. It runs on an emulator, whose CPU is the host's and whose disk is the host's SSD
 * behind a page cache. A mid-range handset is slower at both, so these are a floor rather than the
 * handset's own numbers, and anything quoting them should say so. The timings are logged rather than
 * asserted for the same reason — a build that fails because a laptop was busy teaches nobody
 * anything. What is asserted is the invariant the numbers argued for: one tap, one write.
 */
@RunWith(AndroidJUnit4::class)
class LedgerWriteMeasurement {

    private val nurse = VettingSubject("N-205", "Sister Naledi Mokoena", "nurse", "SANC 20016688")
    private val instrumentation = InstrumentationRegistry.getInstrumentation()

    private fun scratch(name: String): File =
        File(instrumentation.targetContext.filesDir, "measure-$name-${System.nanoTime()}").apply { mkdirs() }

    private fun reading(visit: String, id: String, value: String, state: CaptureState = CaptureState.CAPTURED) =
        CapturedReading(
            id = "$visit-$id", visit = visit, patient = "R. Sithole", observationId = id,
            label = measureLabels[id] ?: id, unit = measureUnits[id] ?: "", value = value,
            provenance = Provenance.MANUAL,
            byId = nurse.id, byName = nurse.name, byReference = nurse.reference,
            deviceMillis = System.currentTimeMillis(), writtenMillis = System.currentTimeMillis(), state = state
        )

    /** The seven a nurse types between a door and a signature — ClinicalScreens' own list. */
    private val sevenMeasures = listOf(
        "systolic" to "138", "diastolic" to "86", "pulse" to "78", "respiratory" to "16",
        "temperature" to "36.9", "oxygen" to "97", "glucose" to "5.4"
    )

    private fun readingsFor(visit: String) = sevenMeasures.map { reading(visit, it.first, it.second) }

    /** Everything but the identity part, so the timed call is the one a finger actually makes. */
    private fun fillVisit(queue: VisitQueueStore, visit: String) {
        queue.hold(VisitPartKind.CONSENT, visit, "R. Sithole", "Consent read aloud and given for both",
            listOf(VisitPartFact("Assessment", "Agreed"), VisitPartFact("Health Passport", "Agreed")), emptyList(), nurse)
        queue.hold(VisitPartKind.OBSERVATIONS, visit, "R. Sithole", "Seven readings taken at the kitchen table",
            sevenMeasures.map { VisitPartFact(measureLabels[it.first] ?: it.first, "${it.second} ${measureUnits[it.first].orEmpty()}") },
            readingsFor(visit), nurse)
        queue.hold(VisitPartKind.FINDINGS, visit, "R. Sithole", "Settled at home, no new complaint, wound clean and dry",
            listOf(VisitPartFact("What you found", "Settled at home, no new complaint. Dressing changed; the wound is clean and dry with no surrounding redness.")), emptyList(), nurse)
        queue.hold(VisitPartKind.SIGN_OFF, visit, "R. Sithole", "Signed on this phone at the end of the visit",
            listOf(VisitPartFact("Signed by", nurse.name), VisitPartFact("Registration", nurse.reference)), emptyList(), nurse)
    }

    private fun percentile(sorted: List<Long>, fraction: Double): Long =
        sorted[minOf(sorted.size - 1, Math.round(fraction * (sorted.size - 1)).toInt())]

    private fun report(what: String, bytes: Int, samples: List<Long>) {
        val sorted = samples.sorted()
        val micros = { nanos: Long -> "%.2f ms".format(nanos / 1_000_000.0) }
        val line =
            ("LEDGER-MEASURE | $what | file ${bytes} bytes | n=${samples.size} " +
                "| p50 ${micros(percentile(sorted, 0.5))} | p95 ${micros(percentile(sorted, 0.95))} " +
                "| max ${micros(sorted.last())} | mean ${micros(samples.sum() / samples.size)}")
        println(line); android.util.Log.i("LedgerMeasure", line)
    }

    /** Every timed call runs where the real one runs: the main thread, in the app's own process. */
    private fun timeOnMain(repeats: Int, work: (Int) -> Unit): List<Long> {
        val samples = ArrayList<Long>(repeats)
        repeat(repeats) { index ->
            instrumentation.runOnMainSync {
                val started = System.nanoTime()
                work(index)
                samples.add(System.nanoTime() - started)
            }
        }
        return samples
    }

    /* Two numbers now, and quoting only the first would be a lie by omission. The main thread is
       free the instant the payload is handed over, which is the whole point — but the work is not on
       the disk until the writer says so, and until then no screen may call it held. */
    private fun waitUntilSettled(state: () -> LedgerWrite, since: Long): Long {
        val deadline = System.nanoTime() + 5_000_000_000L
        while (state() !is LedgerWrite.Settled && System.nanoTime() < deadline) Thread.sleep(1)
        return System.nanoTime() - since
    }

    @Test fun visitLedgerHoldAtOneVisitAndAtAShift() {
        for (visits in listOf(1, 8)) {
            val directory = scratch("visit-$visits")
            val book = FileBook(directory, "visit-parts.json")
            lateinit var queue: VisitQueueStore
            instrumentation.runOnMainSync { queue = VisitQueueStore(book, CaptureStore(MemoryBook())) }
            instrumentation.runOnMainSync { queue.forgetEverything() }
            (1 until visits).forEach { fillVisit(queue, "TH-30%02d".format(it)) }
            fillVisit(queue, "TH-2999")

            /* hold() replaces a held part of the same kind rather than stacking, so repeating the
               identity tap keeps the ledger the size a real one is instead of growing it. */
            val samples = timeOnMain(50) {
                queue.hold(
                    VisitPartKind.IDENTITY, "TH-2999", "R. Sithole", "Visit code confirmed at the door, and identity seen",
                    listOf(VisitPartFact("Visit code", "Six digits, matched"), VisitPartFact("Identity", "Document seen by the nurse")),
                    emptyList(), nurse
                )
            }
            waitUntilSettled({ queue.writeState }, System.nanoTime())
            val file = File(directory, "visit-parts.json")
            report("VisitQueueStore.hold(identity) main thread · $visits visit(s) · ${queue.parts.size} parts", file.length().toInt(), samples)

            /* And the same tap end to end: handed over, built, written, and admitted to on screen. */
            val settle = (1..20).map {
                val started = System.nanoTime()
                instrumentation.runOnMainSync {
                    queue.hold(
                        VisitPartKind.IDENTITY, "TH-2999", "R. Sithole", "Visit code confirmed at the door, and identity seen",
                        listOf(VisitPartFact("Visit code", "Six digits, matched")), emptyList(), nurse
                    )
                }
                waitUntilSettled({ queue.writeState }, started)
            }
            report("VisitQueueStore.hold(identity) until on disk · $visits visit(s)", file.length().toInt(), settle)
            directory.deleteRecursively()
        }
    }

    @Test fun captureLedgerRecordAtOneVisitAndAtAShift() {
        for (visits in listOf(1, 8)) {
            val directory = scratch("capture-$visits")
            val book = FileBook(directory, "capture-queue.json")
            lateinit var store: CaptureStore
            instrumentation.runOnMainSync { store = CaptureStore(book) }
            repeat(visits) { visit ->
                readingsFor("TH-30%02d".format(visit)).forEach { row -> instrumentation.runOnMainSync { store.record(row) } }
            }
            /* Each timed record() adds a row, so the ledger grows under the measurement exactly the
               way it grows under a nurse. The p95 is therefore the later, larger writes. */
            val samples = timeOnMain(50) { index -> store.record(reading("TH-2999", "pulse-$index", "78")) }
            waitUntilSettled({ store.writeState }, System.nanoTime())
            val file = File(directory, "capture-queue.json")
            report("CaptureStore.record() · $visits visit(s) · ${store.readings.size} readings", file.length().toInt(), samples)
            directory.deleteRecursively()
        }
    }

    /** Where the time in a save() actually goes: building the JSON, or putting it on the disk. */
    @Test fun serialisingVersusWriting() {
        for (visits in listOf(1, 8)) {
            val directory = scratch("split-$visits")
            val book = FileBook(directory, "visit-parts.json")
            lateinit var queue: VisitQueueStore
            instrumentation.runOnMainSync { queue = VisitQueueStore(book, CaptureStore(MemoryBook())) }
            instrumentation.runOnMainSync { queue.forgetEverything() }
            repeat(visits) { fillVisit(queue, "TH-30%02d".format(it)) }
            waitUntilSettled({ queue.writeState }, System.nanoTime())
            val raw = File(directory, "visit-parts.json").readText()

            val building = timeOnMain(50) {
                JSONObject().apply {
                    put("version", 1); put("writtenMillis", System.currentTimeMillis()); put("sequence", 1)
                    put("parts", JSONArray(JSONObject(raw).optJSONArray("parts").toString()))
                }.toString()
            }
            val writing = timeOnMain(50) { book.write(raw) }
            report("JSON round-trip only · $visits visit(s)", raw.length, building)
            report("FileBook.write() only · $visits visit(s)", raw.length, writing)
            directory.deleteRecursively()
        }
    }

    /**
     * A book that counts, so the invariant below can be asserted rather than timed.
     *
     * The timings in this file are evidence and they drift with the machine. "One tap writes the
     * ledger once" does not drift: it is either true or the loop has grown a save() again.
     */
    private class CountingBook(private val inner: CaptureBook = MemoryBook()) : CaptureBook {
        val writes = java.util.concurrent.atomic.AtomicInteger(0)
        override fun read(): String? = inner.read()
        override fun write(text: String): String? { writes.incrementAndGet(); return inner.write(text) }
        override fun quarantine(reason: String) = inner.quarantine(reason)
        override val where get() = inner.where
        override val survives get() = inner.survives
        override val doesNotSurvive get() = inner.doesNotSurvive
    }

    /* The defect this file was written to find, held shut. Each of these is one tap on one screen,
       and each used to serialise and write the whole ledger once per row it touched. */
    @Test fun oneTapWritesTheLedgerOnce() {
        val book = CountingBook()
        lateinit var store: CaptureStore
        instrumentation.runOnMainSync { store = CaptureStore(book) }
        repeat(8) { visit ->
            readingsFor("TH-32%02d".format(visit)).forEach { row -> instrumentation.runOnMainSync { store.record(row) } }
        }
        val held = store.readings.count { it.state == CaptureState.CAPTURED }
        assertTrue("Setting up: there should be a shift's worth of held readings, not $held", held > 20)

        /* Drain first: a write submitted by the last record() and not yet on the disk would land
           during the tap below and be counted as part of it. */
        instrumentation.runOnMainSync { store.flushToDisk() }
        book.writes.set(0)
        instrumentation.runOnMainSync { store.sealAllCaptured() }
        instrumentation.runOnMainSync { store.flushToDisk() }
        assertEquals("Sealing $held readings is one tap and must be one write", 1, book.writes.get())

        val queued = store.readings.count { it.state == CaptureState.QUEUED }
        book.writes.set(0)
        instrumentation.runOnMainSync { store.pretendConnected = true; store.beginSending() }
        instrumentation.runOnMainSync { store.flushToDisk() }
        assertEquals("Beginning to send $queued readings is one tap and must be one write", 1, book.writes.get())

        book.writes.set(0)
        instrumentation.runOnMainSync { store.settle(VettingStore(), emptySet()) }
        instrumentation.runOnMainSync { store.flushToDisk() }
        assertEquals("Settling the queue is one answer and must be one write", 1, book.writes.get())
    }

    /*
     * The taps that write the whole file once per row rather than once.
     *
     * CaptureStore routes every state change through replace(), and replace() ends in save(). That is
     * right for one reading and wrong for a loop: sealAllCaptured(), beginSending() and settle() each
     * walk the queue calling it, so one tap on "seal everything" serialises and writes the entire
     * ledger as many times as there are readings in it. VisitQueueStore does not have this shape — it
     * mutates the list and saves once at the end — so this is the capture ledger's problem alone, and
     * it is a bigger one than the tap the ANR was reported against.
     */
    @Test fun theTapsThatSaveOncePerRow() {
        val directory = scratch("seal")
        val book = FileBook(directory, "capture-queue.json")
        lateinit var store: CaptureStore
        instrumentation.runOnMainSync { store = CaptureStore(book) }
        /* Eight visits' readings on top of the seeded queue: a morning with no signal. */
        repeat(8) { visit ->
            readingsFor("TH-31%02d".format(visit)).forEach { row -> instrumentation.runOnMainSync { store.record(row) } }
        }
        val held = store.readings.count { it.state == CaptureState.CAPTURED }
        val file = File(directory, "capture-queue.json")

        var sealNanos = 0L
        instrumentation.runOnMainSync {
            val started = System.nanoTime(); store.sealAllCaptured(); sealNanos = System.nanoTime() - started
        }
        val queued = store.readings.count { it.state == CaptureState.QUEUED }
        var sendNanos = 0L
        instrumentation.runOnMainSync {
            store.pretendConnected = true
            val started = System.nanoTime(); store.beginSending(); sendNanos = System.nanoTime() - started
        }
        instrumentation.runOnMainSync { }
        val settledNanos = waitUntilSettled({ store.writeState }, System.nanoTime() - sendNanos)
        val line = "LEDGER-MEASURE | one tap · ${store.readings.size} readings · file ${file.length()} bytes " +
            "| sealAllCaptured() over $held held: %.1f ms".format(sealNanos / 1_000_000.0) +
            " | beginSending() over $queued queued: %.1f ms".format(sendNanos / 1_000_000.0) +
            " | and on the disk %.1f ms after the tap".format(settledNanos / 1_000_000.0)
        println(line); android.util.Log.i("LedgerMeasure", line)
        directory.deleteRecursively()
    }
}
