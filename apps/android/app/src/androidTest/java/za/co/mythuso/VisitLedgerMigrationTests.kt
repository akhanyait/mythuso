package za.co.mythuso

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import za.co.mythuso.model.*
import java.io.File

/*
 * A visit-parts.json already on a phone, written before a reading had one home.
 *
 * A reading used to live in one of two places depending on how it was produced: an instrument's went
 * to the capture ledger, and one a nurse typed was written *inside* the observations VisitPart that
 * named it and never reached that ledger at all. A part carries ids now. The shape on the disk
 * changed, and a shape change is the point at which a queue whose whole promise is “a nurse does not
 * lose an assessment” usually loses one — silently, on the way in, to a parser that sees a field it
 * does not recognise and moves on.
 *
 * So the old file is read rather than refused: the readings inside it are moved into the ledger,
 * the parts come back naming them by id, and the store says on screen how many moved. What it must
 * never do is drop them, and what it must never do *quietly* is fail to move them — if the reading
 * ledger will not take the write, the old file is kept under another name rather than overwritten by
 * a shape with no room for what is in it. That is FileBook's answer to a file it cannot parse,
 * applied to a file it can.
 *
 * The JSON below is written by hand rather than by today's serialiser, because a serialiser that has
 * been changed cannot be the witness for what it used to produce.
 */
@RunWith(AndroidJUnit4::class)
class VisitLedgerMigrationTests {

    private val instrumentation = InstrumentationRegistry.getInstrumentation()

    private fun scratch(name: String): File =
        File(instrumentation.targetContext.filesDir, "migrate-$name-${System.nanoTime()}").apply { mkdirs() }

    /** Blocks the write the way a full disk does: the temp path FileBook writes cannot be opened. */
    private fun blockWrites(directory: File, name: String) {
        File(directory, "$name.writing").apply { delete(); mkdirs() }
    }

    private fun oldShapeReading(visit: String, observation: String, value: String): JSONObject =
        JSONObject().apply {
            put("id", "VQ-$visit-$observation"); put("visit", visit); put("patient", "R. Sithole")
            put("observationId", observation); put("label", measureLabels[observation] ?: observation)
            put("unit", measureUnits[observation].orEmpty()); put("value", value)
            put("provenance", "manual")
            put("caveats", JSONArray()); put("derivedFrom", JSONArray())
            put("byId", "N-205"); put("byName", "Sister Naledi Mokoena"); put("byReference", "SANC 20016688")
            put("deviceMillis", System.currentTimeMillis() - 3_600_000L)
            put("writtenMillis", System.currentTimeMillis() - 3_600_000L)
            put("state", "captured")
        }

    /** One visit, in the shape the file was written in before a part named its readings by id. */
    private fun writeOldLedger(directory: File, name: String = "visit-parts.json") {
        val readings = JSONArray().apply {
            put(oldShapeReading("TH-2911", "systolic", "142"))
            put(oldShapeReading("TH-2911", "pulse", "81"))
            put(oldShapeReading("TH-2911", "temperature", "37.2"))
        }
        val observations = JSONObject().apply {
            put("id", "VQ-071"); put("kind", "observations"); put("visit", "TH-2911"); put("patient", "R. Sithole")
            put("summary", "Three readings taken at the kitchen table")
            put("detail", JSONArray().apply {
                put(JSONObject().apply { put("label", "Blood pressure — systolic"); put("value", "142 mmHg") })
            })
            put("readings", readings)
            put("byId", "N-205"); put("byName", "Sister Naledi Mokoena"); put("byReference", "SANC 20016688")
            put("deviceMillis", System.currentTimeMillis() - 3_600_000L)
            put("writtenMillis", System.currentTimeMillis() - 3_600_000L)
            put("state", "captured")
        }
        val identity = JSONObject().apply {
            put("id", "VQ-070"); put("kind", "identity"); put("visit", "TH-2911"); put("patient", "R. Sithole")
            put("summary", "Visit code confirmed at the door, and identity seen")
            put("detail", JSONArray()); put("readings", JSONArray())
            put("byId", "N-205"); put("byName", "Sister Naledi Mokoena"); put("byReference", "SANC 20016688")
            put("deviceMillis", System.currentTimeMillis() - 3_700_000L)
            put("writtenMillis", System.currentTimeMillis() - 3_700_000L)
            put("state", "captured")
        }
        File(directory, name).writeText(
            JSONObject().apply {
                put("version", 1); put("writtenMillis", System.currentTimeMillis() - 3_600_000L); put("sequence", 71)
                put("parts", JSONArray().apply { put(observations); put(identity) })
            }.toString()
        )
    }

    @Test fun anOlderFileKeepsEveryReadingItHeld() {
        val directory = scratch("adopt")
        writeOldLedger(directory)
        lateinit var capture: CaptureStore
        lateinit var queue: VisitQueueStore
        instrumentation.runOnMainSync {
            capture = CaptureStore(FileBook(directory, "capture-queue.json"))
            queue = VisitQueueStore(FileBook(directory, "visit-parts.json"), capture)
        }

        /* Both parts came back, and neither was dropped for carrying a field the reader retired. */
        assertEquals("Both parts of the old ledger must be restored", 2, queue.parts.count { it.visit == "TH-2911" })
        val part = queue.parts.first { it.kind == VisitPartKind.OBSERVATIONS }
        assertEquals("The part must name the three readings it used to carry", 3, part.readingIds.size)

        /* And the readings are in the ledger a reading lives in, resolvable through the part. */
        val resolved = queue.readingsOf(part)
        assertEquals("Every named reading must be resolvable in the capture ledger", 3, resolved.size)
        assertEquals("No id a part names may be missing from the ledger", 0, queue.missingFrom(part).size)
        assertEquals("The values must survive the move unchanged",
            listOf("142", "81", "37.2").sorted(), resolved.map { it.value }.sorted())
        assertTrue("Provenance must survive the move — it is the distinction the split existed to keep",
            resolved.all { it.provenance == Provenance.MANUAL })

        /* The question the whole change was for: one object answers it. */
        assertEquals("forVisit() alone must now answer what was measured at this visit",
            3, capture.forVisit("TH-2911").size)
        assertTrue("The store must say the migration happened rather than doing it silently",
            queue.storeNote.contains("older visit ledger"))

        /* And the file it rewrites is the new shape, with no second copy of a reading in it. */
        instrumentation.runOnMainSync { queue.flushToDisk(); capture.flushToDisk() }
        val rewritten = JSONObject(File(directory, "visit-parts.json").readText())
        val rewrittenPart = rewritten.getJSONArray("parts").let { array ->
            (0 until array.length()).map { array.getJSONObject(it) }.first { it.getString("kind") == "observations" }
        }
        assertEquals("The rewritten part names its readings", 3, rewrittenPart.getJSONArray("readingIds").length())
        assertTrue("The rewritten part must not carry a second copy of any reading",
            !rewrittenPart.has("readings"))
        directory.deleteRecursively()
    }

    /** Reading the same file twice must not file the same reading twice. */
    @Test fun migratingTwiceFilesNothingTwice() {
        val directory = scratch("twice")
        writeOldLedger(directory)
        lateinit var capture: CaptureStore
        instrumentation.runOnMainSync {
            capture = CaptureStore(FileBook(directory, "capture-queue.json"))
            VisitQueueStore(FileBook(directory, "visit-parts.json"), capture)
        }
        instrumentation.runOnMainSync { capture.flushToDisk() }
        /* The visit ledger is rewritten in the new shape, so put the old one back: this is the phone
           that was killed after the readings landed and before the parts were rewritten. */
        writeOldLedger(directory)
        instrumentation.runOnMainSync { VisitQueueStore(FileBook(directory, "visit-parts.json"), capture) }
        assertEquals("A second migration of the same file must add nothing",
            3, capture.forVisit("TH-2911").size)
        directory.deleteRecursively()
    }

    /**
     * The disk refuses the readings their new home. The old file is kept, not overwritten by a shape
     * that cannot hold what is in it — the same answer FileBook gives a file it cannot parse.
     */
    @Test fun readingsThatCannotBeMovedLeaveTheOldFileWhereItIs() {
        val directory = scratch("refused")
        writeOldLedger(directory)
        lateinit var capture: CaptureStore
        lateinit var queue: VisitQueueStore
        instrumentation.runOnMainSync { capture = CaptureStore(FileBook(directory, "capture-queue.json")) }
        instrumentation.runOnMainSync { capture.flushToDisk() }
        blockWrites(directory, "capture-queue.json")
        instrumentation.runOnMainSync { queue = VisitQueueStore(FileBook(directory, "visit-parts.json"), capture) }

        assertNotNull("The ledger that could not be migrated must be kept under another name", queue.setAside)
        val aside = File(directory, queue.setAside!!)
        assertTrue("The set-aside file must actually be on the phone", aside.exists())
        assertTrue("It must still hold the readings that could not be moved", aside.readText().contains("\"142\""))
        assertTrue("The store must say what happened rather than looking like an ordinary read",
            queue.storeNote.contains("kept under another name"))
        /* The work is still on the screen either way: a refusal to write is never a reason to drop. */
        assertTrue("The parts must still be in memory", queue.parts.any { it.visit == "TH-2911" })
        directory.deleteRecursively()
    }

    /** A file written in the new shape is read back as itself, with nothing to migrate. */
    @Test fun aNewShapeFileIsReadBackUnchanged() {
        val directory = scratch("roundtrip")
        val nurse = VettingSubject("N-205", "Sister Naledi Mokoena", "nurse", "SANC 20016688")
        lateinit var capture: CaptureStore
        lateinit var queue: VisitQueueStore
        instrumentation.runOnMainSync {
            capture = CaptureStore(FileBook(directory, "capture-queue.json"))
            queue = VisitQueueStore(FileBook(directory, "visit-parts.json"), capture)
        }
        val reading = CapturedReading(
            id = "VQ-TH-2912-pulse", visit = "TH-2912", patient = "R. Sithole", observationId = "pulse",
            label = "Pulse", unit = "bpm", value = "77", provenance = Provenance.MANUAL,
            byId = nurse.id, byName = nurse.name, byReference = nurse.reference,
            deviceMillis = System.currentTimeMillis(), writtenMillis = System.currentTimeMillis()
        )
        instrumentation.runOnMainSync {
            queue.hold(VisitPartKind.OBSERVATIONS, "TH-2912", "R. Sithole", "One reading", emptyList(), listOf(reading), nurse)
            queue.flushToDisk(); capture.flushToDisk()
        }

        lateinit var again: VisitQueueStore
        lateinit var captureAgain: CaptureStore
        instrumentation.runOnMainSync {
            captureAgain = CaptureStore(FileBook(directory, "capture-queue.json"))
            again = VisitQueueStore(FileBook(directory, "visit-parts.json"), captureAgain)
        }
        val part = again.parts.first { it.visit == "TH-2912" }
        assertEquals("The part must come back naming its reading", listOf("VQ-TH-2912-pulse"), part.readingIds)
        assertEquals("And the reading must come back out of the ledger", "77", again.readingsOf(part).single().value)
        assertTrue("A new-shape file has nothing to migrate and must not say it migrated anything",
            !again.storeNote.contains("older visit ledger"))
        directory.deleteRecursively()
    }
}
