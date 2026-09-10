package za.co.mythuso

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import za.co.mythuso.model.*
import java.io.File

/*
 * What the two ledgers do when the disk will not take the write.
 *
 * A nurse's phone runs out of space. It is not an exotic failure — it is a mid-range handset with a
 * camera roll on it, and it is the likeliest way this app ever loses somebody's assessment. The
 * contract's rule is queuedIsNotLost, and a rule about not losing work has to have an answer for the
 * case where the work cannot be written down.
 *
 * It did not have one. FileBook.write wrapped everything in runCatching and discarded the result, so
 * a refused write was indistinguishable from a successful one: the reading stayed in memory looking
 * filed, the strip above the assessment went on saying the work was held on this phone and kept
 * there if it closes, and the next launch read the last file that actually landed. Nothing anywhere
 * said a word. These tests are what stops that coming back.
 *
 * They do not simulate ENOSPC, which cannot be arranged on a device from a test. They arrange the
 * same shape of failure — the path FileBook writes through is made unopenable, so writeText throws
 * an IOException exactly as a full disk would — and the app cannot tell the two apart.
 */
@RunWith(AndroidJUnit4::class)
class LedgerStorageFailureTests {

    private val nurse = VettingSubject("N-205", "Sister Naledi Mokoena", "nurse", "SANC 20016688")
    private val instrumentation = InstrumentationRegistry.getInstrumentation()

    private fun scratch(name: String): File =
        File(instrumentation.targetContext.filesDir, "fail-$name-${System.nanoTime()}").apply { mkdirs() }

    /** Blocks the write the way a full disk does: the temp path FileBook writes cannot be opened. */
    private fun blockWrites(directory: File, name: String) {
        File(directory, "$name.writing").apply { delete(); mkdirs() }
    }

    /** The writer is a thread, so a refusal arrives a moment after the tap rather than during it. */
    private fun settle(state: () -> LedgerWrite): LedgerWrite {
        val deadline = System.nanoTime() + 5_000_000_000L
        while (state() is LedgerWrite.Writing && System.nanoTime() < deadline) Thread.sleep(2)
        return state()
    }

    @Test fun aVisitPartTheDiskRefusedIsNeverCalledHeld() {
        val directory = scratch("visit")
        val book = FileBook(directory, "visit-parts.json")
        lateinit var queue: VisitQueueStore
        instrumentation.runOnMainSync { queue = VisitQueueStore(book) }
        settle { queue.writeState }
        val landed = File(directory, "visit-parts.json").readText()

        blockWrites(directory, "visit-parts.json")
        instrumentation.runOnMainSync {
            queue.hold(
                VisitPartKind.IDENTITY, "TH-2999", "R. Sithole", "Visit code confirmed at the door, and identity seen",
                listOf(VisitPartFact("Visit code", "Six digits, matched")), emptyList(), nurse
            )
        }
        val outcome = settle { queue.writeState }

        /* The ledger on the disk is untouched — the previous one is whole, not half of two. */
        assertEquals("A refused write must leave the last good ledger exactly as it was",
            landed, File(directory, "visit-parts.json").readText())
        /* The work is still on the screen. Refusing to write it is not a reason to throw it away. */
        assertTrue("The part must stay in memory: the nurse did the work and it is still hers",
            queue.parts.any { it.visit == "TH-2999" })
        /* And the ledger says so, in a sentence, rather than looking like every other write. */
        assertTrue("A refused write must surface as Refused, not settle silently. Was: $outcome",
            outcome is LedgerWrite.Refused)
        assertTrue("The refusal must say the work is not on the disk yet",
            (outcome as LedgerWrite.Refused).reason.contains("not on the disk"))
        directory.deleteRecursively()
    }

    @Test fun aReadingTheDiskRefusedIsNeverCalledFiled() {
        val directory = scratch("capture")
        val book = FileBook(directory, "capture-queue.json")
        lateinit var store: CaptureStore
        instrumentation.runOnMainSync { store = CaptureStore(book) }
        settle { store.writeState }
        val landed = File(directory, "capture-queue.json").readText()

        blockWrites(directory, "capture-queue.json")
        instrumentation.runOnMainSync {
            store.captureByHand("pulse", "78", Provenance.MANUAL, "TH-2999", "R. Sithole", nurse, "R. Sithole")
        }
        val outcome = settle { store.writeState }

        assertEquals("A refused write must leave the last good ledger exactly as it was",
            landed, File(directory, "capture-queue.json").readText())
        assertTrue("The reading must stay in memory rather than be dropped to make a write succeed",
            store.readings.any { it.visit == "TH-2999" })
        assertTrue("A refused write must surface as Refused, not settle silently. Was: $outcome",
            outcome is LedgerWrite.Refused)
        directory.deleteRecursively()
    }

    /** A disk that comes back — space freed — is written to again, and the ledger says it is held. */
    @Test fun aDiskThatComesBackIsWrittenToAgain() {
        val directory = scratch("recover")
        val book = FileBook(directory, "visit-parts.json")
        lateinit var queue: VisitQueueStore
        instrumentation.runOnMainSync { queue = VisitQueueStore(book) }
        settle { queue.writeState }

        blockWrites(directory, "visit-parts.json")
        instrumentation.runOnMainSync {
            queue.hold(VisitPartKind.IDENTITY, "TH-2999", "R. Sithole", "Held while the disk was full",
                emptyList(), emptyList(), nurse)
        }
        assertTrue("Setting up: the write must have been refused", settle { queue.writeState } is LedgerWrite.Refused)

        File(directory, "visit-parts.json.writing").deleteRecursively()
        instrumentation.runOnMainSync {
            queue.hold(VisitPartKind.CONSENT, "TH-2999", "R. Sithole", "Held once there was room again",
                emptyList(), emptyList(), nurse)
        }
        assertEquals("Once the disk takes a write again the ledger is settled, not stuck on the refusal",
            LedgerWrite.Settled, settle { queue.writeState })
        /* And the whole ledger is written, not only what changed after the disk came back — which is
           the reason each payload is the entire thing rather than a delta. */
        val onDisk = File(directory, "visit-parts.json").readText()
        assertTrue("The part refused during the outage must be in the file that finally lands",
            onDisk.contains("Held while the disk was full"))
        directory.deleteRecursively()
    }
}
