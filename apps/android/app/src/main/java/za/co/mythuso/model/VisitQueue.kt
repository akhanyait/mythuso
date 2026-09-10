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
 * observations part names real CapturedReadings by id.
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
 * TWO LEDGERS OR ONE, AND WHY IT IS TWO. This has been two modules since the visit queue was added
 * and nobody had written down why, which is how a thing stays two by accident. It should stay two:
 *
 *   1. Failure isolation is the whole argument, and it is a durability argument rather than a
 *      modelling one. A ledger that will not parse is quarantined whole. Sharing a file would mean
 *      one bad byte in a reading takes the identity check, the consent and the signature with it.
 *   2. They have different lifetimes. A CapturedReading is produced by an instrument or a keystroke
 *      and stands on its own — the kit screen files readings belonging to no assessment yet. A
 *      VisitPart is a piece of work a nurse finished and exists only inside a visit. One table
 *      holding both would carry a nullable field saying which of the two each row really is.
 *   3. It is the capture ledger that answers for a reading, wherever the reading came from, and this
 *      module holds ids into it. A second module with its own idea of what a reading is, or of what
 *      a duplicate is, would be a second gate, and two gates is where holes live.
 *
 * IDS, NOT COPIES — AND WHY THAT WAS THE BUG. A reading used to live in one of two places depending
 * on how it was produced: a typed one was embedded in an observations VisitPart and never reached
 * the capture ledger at all, while an instrument's sat in the ledger and was deliberately not copied
 * into the part. Nothing was duplicated, which is the failure that shape was designed against, but
 * the set was partitioned by provenance, which nobody chose. “What was measured at this visit” was
 * then a question no single object answered: VisitAssessmentScreen unioned its own typed readings
 * with store.capture.forVisit() and got it right, and ConsultationRecordScreen asked the ledger
 * alone and silently wrote a note that was missing every number the nurse had typed. That is a
 * clinical defect, not an untidiness.
 *
 * So a reading lives in the capture ledger, whatever produced it, and a part holds `readingIds`.
 * Provenance still says whether a person or an instrument produced it — that distinction is the
 * point of the capture contract and survives untouched. What is gone is the second axis nobody
 * chose, which was *where the row is kept*.
 *
 * AN OLDER FILE ON A PHONE. A visit-parts.json written in the embedded shape is read, not refused:
 * its readings are handed to the capture ledger, the parts come back naming them by id, and the
 * store says on screen how many moved and that nothing was dropped. It is only rewritten in the new
 * shape once the capture ledger has actually taken them — and if that ledger refuses the write, the
 * old file is set aside under another name rather than overwritten, which is what FileBook does with
 * a file it cannot parse and for the same reason.
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
    /** Observations only. Ids into the capture ledger, which is where a reading lives whatever
     *  produced it. Never the readings themselves: a copy here is a copy that can disagree with the
     *  row it was copied from, and a record of a visit that disagrees with the reading it names is
     *  worse than one that has to go and look. */
    val readingIds: List<String> = emptyList(),
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
   org.json, the same parser the reading ledger uses, so the build gains no dependency for it. A part
   writes down the ids of the readings it names and no reading of its own: capture-queue.json is
   where a reading is written, and one row written in two files is two rows that can disagree. */
private fun factToJson(fact: VisitPartFact) = JSONObject().apply { put("label", fact.label); put("value", fact.value) }

private fun partToJson(part: VisitPart): JSONObject = JSONObject().apply {
    put("id", part.id); put("kind", part.kind.id); put("visit", part.visit); put("patient", part.patient)
    put("summary", part.summary)
    put("detail", JSONArray().also { array -> part.detail.forEach { array.put(factToJson(it)) } })
    put("readingIds", JSONArray(part.readingIds))
    put("byId", part.byId); put("byName", part.byName); put("byReference", part.byReference)
    put("deviceMillis", part.deviceMillis); put("writtenMillis", part.writtenMillis)
    part.serverMillis?.let { put("serverMillis", it) }
    put("state", part.state.id)
    part.conflictId?.let { put("conflictId", it) }
    part.note?.let { put("note", it) }
}

/**
 * A part read back off the disk, and — where the file was written in the older shape — the readings
 * that were embedded in it and now have to be given a home in the capture ledger.
 *
 * The second half is empty for every file written since. It exists because a nurse's phone holds the
 * file it holds, and a shape change that reads the old one as nothing is a shape change that loses a
 * morning's work on the way in.
 */
private class RestoredPart(val part: VisitPart, val embedded: List<CapturedReading>)

private fun jsonToPart(json: JSONObject): RestoredPart? {
    /* A part that comes back off the disk without a kind is a part nobody can say what it is. It is
       dropped from the queue rather than defaulted into one, on the same reasoning that drops a
       reading with no origin: a row nobody can name is not filed. */
    val kind = visitPartKindById(json.optString("kind")) ?: return null
    val details = json.optJSONArray("detail") ?: JSONArray()
    /* Ids where the file has them, and whole readings where it is the older shape. Never both: a
       file that carried both would have to say which of the two disagreeing copies was the reading,
       and nothing would be able to. */
    val named = json.optJSONArray("readingIds")
    val embeddedRows = if (named == null) json.optJSONArray("readings") ?: JSONArray() else JSONArray()
    val embedded = (0 until embeddedRows.length()).mapNotNull { jsonToReading(embeddedRows.optJSONObject(it) ?: JSONObject()) }
    val part = VisitPart(
        id = json.optString("id"), kind = kind, visit = json.optString("visit"),
        patient = json.optString("patient"), summary = json.optString("summary"),
        detail = (0 until details.length()).map { index ->
            val fact = details.optJSONObject(index) ?: JSONObject()
            VisitPartFact(fact.optString("label"), fact.optString("value"))
        },
        readingIds = if (named != null) (0 until named.length()).map { named.optString(it) }.filter { it.isNotEmpty() }
        else embedded.map { it.id },
        byId = json.optString("byId"), byName = json.optString("byName"), byReference = json.optString("byReference"),
        deviceMillis = json.optLong("deviceMillis"),
        serverMillis = if (json.has("serverMillis") && !json.isNull("serverMillis")) json.optLong("serverMillis") else null,
        writtenMillis = json.optLong("writtenMillis"),
        state = captureStateById(json.optString("state")),
        conflictId = json.optString("conflictId").ifEmpty { null },
        note = json.optString("note").ifEmpty { null }
    )
    return RestoredPart(part, embedded)
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
    /** The readings a part names, resolved through the capture ledger — which is where a reading
     *  lives. A part carries ids, so this is the only way to ask what it holds. */
    val readingsOf: (VisitPart) -> List<CapturedReading> = { emptyList() },
    /**
     * What the record already holds for a visit *besides* the readings the arriving part names,
     * asked of the capture ledger rather than kept here.
     *
     * The exclusion is load-bearing now that a part names rows in that ledger rather than carrying
     * copies. Send the kit queue first and the nurse's own typed readings become stored; without it
     * the visit part would then arrive and find itself already in the record, and every observations
     * part would conflict with its own readings.
     */
    val alreadyStored: (String, Set<String>) -> Set<String> = { _, _ -> emptySet() }
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
    val mine = arrival.readingsOf(part)
    if (mine.isNotEmpty()) {
        val stored = arrival.alreadyStored(part.visit, mine.map { it.id }.toSet())
        val clashing = mine.filter { it.observationId in stored }
        if (clashing.isNotEmpty()) return received.copy(
            state = CaptureState.CONFLICTED, conflictId = "duplicate-observation",
            note = "The record already holds ${clashing.joinToString(" and ") { it.label }} for ${part.visit}. Both are kept; a clinician says which stands."
        )
    }
    return received.copy(state = CaptureState.STORED, conflictId = null)
}

/* ---- One live store the visit screens share ----------------------------------------------------
   It takes the reading ledger rather than being handed it a method at a time, because a part names
   rows in that ledger now: resolving what a part holds, sealing what it names and asking what the
   record already has are all the same one question, and a store that could be built without an
   answer to it would be a store whose parts sometimes name nothing. */
class VisitQueueStore(private val book: CaptureBook, private val capture: CaptureStore) {
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
    private val writer = LedgerWriter(book, "visit")

    val where: String get() = book.where
    val survives: String get() = book.survives
    val doesNotSurvive: String get() = book.doesNotSurvive
    val setAside: String? get() = book.setAside
    /** What the disk has actually taken. The strip above the assessment reads this rather than
     *  inferring from the fact that a tap happened that the work is on the phone. */
    val writeState: LedgerWrite get() = writer.state
    /** Block until what has been held is on the disk. Called when the app is going away. */
    fun flushToDisk() = writer.flush()

    /* ---- What a part holds --------------------------------------------------------------------
       Resolved rather than carried. Every screen that wants the numbers behind an observations part
       asks here, and there is one answer — which is the whole change: “what was measured at this
       visit” used to be answerable only by a screen that remembered to look in two places. */
    fun readingsOf(part: VisitPart): List<CapturedReading> = capture.readingsNamed(part.readingIds)
    /** Ids a part names that the ledger does not hold. Rendered, not swallowed: a part that names
     *  six readings and shows five has told a nurse a smaller truth without saying it was smaller. */
    fun missingFrom(part: VisitPart): List<String> = capture.missingNamed(part.readingIds)

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
        parts.clear(); parts.addAll(restored.map { it.part })
        /* An older file, holding whole readings inside its observations parts. They are moved into
           the reading ledger, which is where a reading lives, and the parts that came back are
           already naming them by id. Nothing is dropped and nothing is renumbered.

           Flushed rather than left to the writer's thread: the visit ledger is rewritten in the new
           shape below and the new shape has no room for a reading, so the two writes have an order
           and this is the one that has to land first. Blocking on the way in is the right choice in
           exactly this place, for the same reason it is right in onStop — the alternative is losing
           the readings, and this happens once in the life of a phone. */
        val embedded = restored.flatMap { it.embedded }
        val migrated = if (embedded.isEmpty()) 0 else capture.adopt(embedded)
        /* flushToDisk's own return value rather than capture.writeState: the state a screen reads is
           posted to the main thread, and this is running on it, so the post is queued behind us and
           would still say Writing. What the disk said is asked of the writer directly. */
        val refusedMigration = migrated > 0 && capture.flushToDisk() != null
        if (refusedMigration) {
            /* The readings could not be written to their new home, so the file that still holds them
               is kept under another name rather than overwritten by a shape that cannot carry them.
               FileBook's own answer to a file it cannot parse, for a file it can. */
            book.quarantine("readings-not-adopted")
        }
        storeNote = when {
            dropped > 0 -> "$dropped stored ${if (dropped == 1) "part" else "parts"} came back without a name for what ${if (dropped == 1) "it was" else "they were"} and ${if (dropped == 1) "was" else "were"} not restored. A row nobody can say what it is is not filed."
            refusedMigration -> "This phone held an older visit ledger with the readings written inside it. They could not be moved into the readings ledger — the disk refused the write — so that file has been kept under another name rather than overwritten. Nothing was deleted."
            migrated > 0 -> "This phone held an older visit ledger with the readings written inside it. $migrated ${if (migrated == 1) "reading" else "readings"} moved into the readings ledger, where a reading lives whatever took it, and the visit above names ${if (migrated == 1) "it" else "them"} rather than holding a second copy. Nothing was dropped."
            else -> "Read from the visit ledger on this phone."
        }
        if (parts.isEmpty()) seed()
        /* Rewritten in the new shape now the readings are safe, so the next launch has nothing left
           to migrate — and if it is killed before this lands, the migration is idempotent by id and
           simply happens again. */
        else if (migrated > 0 && !refusedMigration) save()
    }

    /* The payload is built on the writer's thread rather than this one, because building it is where
       the time goes — a shift's ledger is 38 KB and org.json spends p50 3.6 ms of a measured 5.3 ms
       turning it into a string. What is snapshotted here is a pointer copy of a list of immutable
       parts, so the writer can never see the list mid-edit. */
    private fun save() {
        val rows = parts.toList()
        val at = sequence
        val now = System.currentTimeMillis()
        writtenMillis = now
        writer.submit {
            JSONObject().apply {
                put("version", 1)
                put("writtenMillis", now)
                put("sequence", at)
                put("parts", JSONArray().also { array -> rows.forEach { array.put(partToJson(it)) } })
            }.toString()
        }
    }

    /** Reload from disk. A cold launch without the launch — used to prove the queue survived.
     *  It waits for anything in flight first, or it would read the version before the last write and
     *  present that as what survived, which is the opposite of what the button is for. */
    fun reload() { writer.flush(); parts.clear(); load() }

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
        /* The readings go to the ledger and the part keeps their ids. A caller hands whole readings
           because that is what it has just built out of what a nurse typed; what it must not do is
           keep them, and this is the one door through which they reach the disk. */
        val ids = if (readings.isEmpty()) emptyList() else capture.fileTyped(readings)
        val part = VisitPart(
            id = "VQ-%03d".format(sequence), kind = kind, visit = visit, patient = patient,
            summary = summary, detail = detail, readingIds = ids,
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
        val named = ArrayList<String>()
        parts.indices.forEach { index ->
            val part = parts[index]
            if (part.visit == visit && part.state == CaptureState.CAPTURED) {
                parts[index] = part.copy(state = CaptureState.QUEUED, writtenMillis = now); count += 1
                named.addAll(part.readingIds)
            }
        }
        /* And the readings those parts name, in one write of the reading ledger. They are the same
           work: a nurse who has signed is finished with the numbers as well as with the parts, and a
           ledger still calling them hers to correct would have moved the old split from where a
           reading is kept into what state it is in. */
        if (count > 0) { capture.sealNamed(named); save() }
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

    fun settle(vetting: VettingStore, signedVisits: Set<String>) {
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
                readingsOf = { capture.readingsNamed(it.readingIds) },
                alreadyStored = { visit, its ->
                    capture.forVisit(visit)
                        .filter { it.state == CaptureState.STORED && !it.superseded && it.id !in its }
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
                readingIds = capture.fileTyped(listOf(reading("systolic", "138"), reading("pulse", "78"), reading("temperature", "36.9"))),
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
