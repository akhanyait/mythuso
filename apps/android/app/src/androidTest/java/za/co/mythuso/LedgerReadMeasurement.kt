package za.co.mythuso

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Test
import org.junit.runner.RunWith
import za.co.mythuso.model.*
import java.io.File

/*
 * How long it actually takes to read the two ledgers back, measured rather than argued about.
 *
 * Both stores read their file synchronously, on the main thread, in `init` — and again in reload().
 * The comment above rememberPreviewStore() defends it: “a queue loaded a frame later is a queue that
 * shows empty first, and an empty queue is the exact lie the rule about not losing a nurse's work
 * exists to prevent.” That is a real concern and the right one to hold. It is not, on its own, an
 * argument that the read is cheap. The write was measured before it was changed, and the measurement
 * found the disk was never the cost — org.json was — so the read was measured the same way before
 * anybody decided whether to move it.
 *
 * WHAT IT FOUND, and the numbers are in the report this landed with rather than repeated here,
 * because a figure typed into a comment is a figure that stops being true quietly. The shape of the
 * answer is what matters: a read is a parse, the same parse the write is, over the same bytes — so
 * it costs what building the payload costs, in the same order of magnitude, once per launch rather
 * than once per tap. A launch already parses the application, inflates a theme and lays out a
 * screen. One parse of a shift's ledger on the way in is not the thing to fix.
 *
 * So this is evidence, logged and not asserted, exactly as LedgerWriteMeasurement is and for the
 * same reason: a build that fails because a laptop was busy teaches nobody anything. What it lets
 * the next person do is disagree with a number instead of with an opinion.
 *
 * A SHIFT is eight visits: five parts and seven readings each, which is what a nurse in Ivory Park
 * with no signal all morning is holding by lunchtime. It is the largest the ledger gets and the only
 * size at which a read could plausibly be worth moving.
 */
@RunWith(AndroidJUnit4::class)
class LedgerReadMeasurement {

    private val nurse = VettingSubject("N-205", "Sister Naledi Mokoena", "nurse", "SANC 20016688")
    private val instrumentation = InstrumentationRegistry.getInstrumentation()

    private fun scratch(name: String): File =
        File(instrumentation.targetContext.filesDir, "read-$name-${System.nanoTime()}").apply { mkdirs() }

    private val sevenMeasures = listOf(
        "systolic" to "138", "diastolic" to "86", "pulse" to "78", "respiratory" to "16",
        "temperature" to "36.9", "oxygen" to "97", "glucose" to "5.4"
    )

    private fun readingsFor(visit: String) = sevenMeasures.map { (id, value) ->
        CapturedReading(
            id = "VQ-$visit-$id", visit = visit, patient = "R. Sithole", observationId = id,
            label = measureLabels[id] ?: id, unit = measureUnits[id].orEmpty(), value = value,
            provenance = Provenance.MANUAL,
            byId = nurse.id, byName = nurse.name, byReference = nurse.reference,
            deviceMillis = System.currentTimeMillis(), writtenMillis = System.currentTimeMillis()
        )
    }

    private fun fillVisit(queue: VisitQueueStore, visit: String) {
        queue.hold(VisitPartKind.IDENTITY, visit, "R. Sithole", "Visit code confirmed at the door, and identity seen",
            listOf(VisitPartFact("Visit code", "Six digits, matched")), emptyList(), nurse)
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

    private fun report(what: String, bytes: Long, samples: List<Long>) {
        val sorted = samples.sorted()
        val ms = { nanos: Long -> "%.2f ms".format(nanos / 1_000_000.0) }
        val line = "LEDGER-READ | $what | file $bytes bytes | n=${samples.size} " +
            "| p50 ${ms(percentile(sorted, 0.5))} | p95 ${ms(percentile(sorted, 0.95))} " +
            "| max ${ms(sorted.last())} | mean ${ms(samples.sum() / samples.size)}"
        println(line); android.util.Log.i("LedgerMeasure", line)
    }

    /** Every timed call runs where the real one runs: the main thread, in the app's own process. */
    private fun timeOnMain(repeats: Int, work: () -> Unit): List<Long> {
        val samples = ArrayList<Long>(repeats)
        repeat(repeats) {
            instrumentation.runOnMainSync {
                val started = System.nanoTime()
                work()
                samples.add(System.nanoTime() - started)
            }
        }
        return samples
    }

    /*
     * Three things are timed and they are three different questions.
     *
     *   FileBook.read() alone — the disk, which the write measurement already found was never the
     *   cost. It is here so the next reader does not have to take that on trust for the read.
     *   The whole construction — what a launch actually pays, parse included.
     *   reload() — the design-review button that drops memory and reads the file again.
     */
    @Test fun bothLedgersAtOneVisitAndAtAShift() {
        for (visits in listOf(1, 8)) {
            val directory = scratch("shift-$visits")
            val visitBook = FileBook(directory, "visit-parts.json")
            val captureBook = FileBook(directory, "capture-queue.json")
            lateinit var capture: CaptureStore
            lateinit var queue: VisitQueueStore
            instrumentation.runOnMainSync {
                capture = CaptureStore(captureBook)
                queue = VisitQueueStore(visitBook, capture)
            }
            instrumentation.runOnMainSync { queue.forgetEverything() }
            repeat(visits) { fillVisit(queue, "TH-33%02d".format(it)) }
            instrumentation.runOnMainSync { queue.flushToDisk(); capture.flushToDisk() }

            val visitFile = File(directory, "visit-parts.json")
            val captureFile = File(directory, "capture-queue.json")

            report("FileBook.read() only · visit ledger · $visits visit(s) · ${queue.parts.size} parts",
                visitFile.length(), timeOnMain(50) { visitBook.read() })
            report("FileBook.read() only · reading ledger · $visits visit(s) · ${capture.readings.size} readings",
                captureFile.length(), timeOnMain(50) { captureBook.read() })

            /* What a cold launch pays: read, parse and restore, both ledgers, in the order the
               application builds them — the reading ledger first, because a visit part names rows
               in it. Constructed fresh each time so no measurement reuses a warmed-up store. */
            report("Both stores constructed, as a launch does · $visits visit(s)",
                visitFile.length() + captureFile.length(),
                timeOnMain(30) {
                    val c = CaptureStore(FileBook(directory, "capture-queue.json"))
                    VisitQueueStore(FileBook(directory, "visit-parts.json"), c)
                })

            report("VisitQueueStore.reload() · $visits visit(s) · ${queue.parts.size} parts",
                visitFile.length(), timeOnMain(30) { queue.reload() })
            report("CaptureStore.reload() · $visits visit(s) · ${capture.readings.size} readings",
                captureFile.length(), timeOnMain(30) { capture.reload() })
            directory.deleteRecursively()
        }
    }
}
