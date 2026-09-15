package za.co.mythuso.model

import androidx.compose.runtime.mutableStateListOf

/*
 * Sentinel tiers one to three, and safeguarding reports, on Android: the types SentinelData.kt is
 * written into, and the arithmetic packages/engines/src/safety/domain/sentinel.ts does, mirrored
 * rather than paraphrased.
 *
 * A CONSUMER READING NEVER FORMS A BASELINE. Sentinel hears a reading only when Devices publishes it,
 * and Devices publishes only what carriesWeight() accepts. So the readings below are the kit
 * registry's readings that Devices.carriesWeight() accepted as they stood when they were linked, and
 * nothing else: the thermometer's poor sample is on the kit screen and in no baseline.
 *
 * NOTHING IS EVALUATED. This phone shows the contract's sentence and never works a deviation out. A
 * tier is raised by the nurse, one to three, and tier four is not offered. The window and minimum a
 * baseline keeps are the generated defaults and the stale interval is DevicesData's, so no number
 * that decides anything is typed here.
 *
 * A SAFEGUARDING REPORT IS OPEN AND NOT SENT. It keeps who it is about and the kind, never shows the
 * kind again, and nothing here closes one or sends one. Held in memory; nothing is persisted.
 */

data class SentinelRung(val rung: Int, val id: String, val label: String, val means: String, val toldCode: String, val whoIsTold: String)
data class SentinelChoice(val id: String, val label: String, val sentence: String)
data class SentinelRefusal(val id: String, val status: Int, val statement: String)

/** A reading Sentinel heard: where it came from and what it measured, and never its value. */
data class SentinelHeard(val readingRef: String, val deviceRef: String, val metric: String, val heardAt: Long, val leftByRecallAt: Long?)
/** A baseline keeps the window and minimum it was opened under. */
data class SentinelBaseline(val metric: String, val openedAt: Long, val windowDays: Int, val minimumReadings: Int, val suspendedSince: Long?)
data class SentinelBaselineView(val metric: String, val stateId: String, val counted: Int, val needed: Int, val windowDays: Int, val suspendedSince: Long?, val leftByRecall: Int)
data class SentinelRaised(val deviationRef: String, val rung: SentinelRung, val metric: String, val raisedAt: Long)
data class SentinelReport(val reportRef: String, val groupCode: String, val categoryCode: String, val recordedAt: Long)

object Sentinel {
    /** A refusal in the route's own words. An id the contract does not carry answers with the id. */
    fun refusal(id: String): SentinelRefusal = SentinelData.refusals.firstOrNull { it.id == id } ?: SentinelRefusal(id, 500, id)
    fun fill(sentence: String, values: Map<String, String>): String =
        Regex("\\{(\\w+)\\}").replace(sentence) { match -> values[match.groupValues[1]] ?: match.value }
    fun label(choices: List<SentinelChoice>, id: String): String = choices.firstOrNull { it.id == id }?.label ?: id
    fun rungOf(number: Int): SentinelRung? = SentinelData.rungs.firstOrNull { it.rung == number }

    /* baselineOf(), mirrored: suspended is asked first, because a suspended baseline counts towards
       nothing whatever it holds; then formed at the minimum it kept, counting only what it heard inside
       the window it kept. */
    fun viewOf(baseline: SentinelBaseline, readings: List<SentinelHeard>, now: Long): SentinelBaselineView {
        val mine = readings.filter { it.metric == baseline.metric }
        val window = baseline.windowDays * Devices.DAY
        val counted = mine.count { it.leftByRecallAt == null && now - it.heardAt <= window }
        val state = when {
            baseline.suspendedSince != null -> "suspended"
            counted >= baseline.minimumReadings -> "formed"
            else -> "forming"
        }
        return SentinelBaselineView(baseline.metric, state, counted, baseline.minimumReadings, baseline.windowDays, baseline.suspendedSince, mine.count { it.leftByRecallAt != null })
    }
}

/* ---- The preview's Sentinel ---------------------------------------------------------------------------
   Seeded from the kit registry the way the web seeds it from Devices': a reading heard when it was
   linked and carried weight then, a baseline opened by the first of each measure, a stale instrument
   suspending its baselines from the moment its interval passed, and a recalled instrument's readings
   taken out when the recall was recorded. Mirrors apps/web/src/lib/sentinel.ts. */
object SentinelStore {
    var readings: List<SentinelHeard> = emptyList()
        private set
    var baselines: List<SentinelBaseline> = emptyList()
        private set
    val raised = mutableStateListOf<SentinelRaised>()
    val reports = mutableStateListOf<SentinelReport>()
    private var seeded = false
    private var serial = 0

    fun ensureSeeded(capture: CaptureStore?, now: Long = System.currentTimeMillis()) {
        if (seeded) return
        DevicesRegistry.ensureSeeded(capture, now)
        seeded = true
        val devices = DevicesRegistry.devices
        val heard = mutableListOf<SentinelHeard>()
        val opened = mutableListOf<SentinelBaseline>()
        for (reading in DevicesRegistry.readings.sortedBy { it.takenAt }) {
            /* As it stood when it was linked: a recall recorded afterwards took its weight away later, and
               the recall below is what answers for that. */
            val recordedAfter = devices.firstOrNull { it.deviceRef == reading.deviceRef }?.recall?.let { it.recordedAt > reading.takenAt } ?: false
            val marksWhenLinked = if (recordedAfter) reading.marks - "recalled" else reading.marks
            if (!Devices.carriesWeight(reading.deviceClass, reading.source, reading.quality, reading.intendedUse, marksWhenLinked)) continue
            heard += SentinelHeard(reading.readingRef, reading.deviceRef, reading.metric, reading.takenAt, null)
            if (opened.none { it.metric == reading.metric }) {
                opened += SentinelBaseline(reading.metric, reading.takenAt, SentinelData.baselineWindowDays, SentinelData.baselineMinimumReadings, null)
            }
        }
        val staleAfter = DevicesData.staleAfterMinutes * Devices.MINUTE
        var kept = opened.toList()
        devices.filter { it.recall == null && Devices.isStale(it, now) }.forEach { device ->
            val lastSync = device.lastSyncAt ?: return@forEach
            val metrics = heard.filter { it.deviceRef == device.deviceRef }.map { it.metric }.toSet()
            kept = kept.map { b -> if (b.metric in metrics && b.suspendedSince == null) b.copy(suspendedSince = lastSync + staleAfter) else b }
        }
        var left = heard.toList()
        devices.forEach { device ->
            val recall = device.recall ?: return@forEach
            left = left.map { h -> if (h.deviceRef == device.deviceRef && h.leftByRecallAt == null) h.copy(leftByRecallAt = recall.recordedAt) else h }
        }
        readings = left
        baselines = kept
    }

    fun views(now: Long = System.currentTimeMillis()): List<SentinelBaselineView> = baselines.map { Sentinel.viewOf(it, readings, now) }
    /** The readings a tier may be raised on: heard, and not taken out by a recall. */
    fun entries(): List<SentinelHeard> = readings.filter { it.leftByRecallAt == null }

    private fun next(prefix: String): String {
        serial += 1
        return prefix + "-" + serial.toString().padStart(4, '0')
    }

    /* raiseByHand(), in the engine's order for what this phone can send: a tier, tier four refused in
       its own words, a tier off the ladder, then a reading Sentinel heard and still counts. */
    fun raise(readingRef: String?, rung: Int?): SentinelRefusal? {
        val highest = SentinelData.rungs.maxOf { it.rung }
        if (rung == null) return Sentinel.refusal("rung-not-on-the-sentinel-ladder")
        if (rung > highest) return Sentinel.refusal("tier-four-not-in-this-build")
        val chosen = Sentinel.rungOf(rung) ?: return Sentinel.refusal("rung-not-on-the-sentinel-ladder")
        val reading = readings.firstOrNull { it.readingRef == readingRef } ?: return Sentinel.refusal("no-clinical-weight-behind-it")
        if (reading.leftByRecallAt != null) return Sentinel.refusal("reading-left-by-recall")
        raised.add(0, SentinelRaised(next("DEV"), chosen, reading.metric, System.currentTimeMillis()))
        return null
    }

    /** recordReport(), in its order for what this phone can send. A report is recorded open and not sent, and nothing here changes either. */
    fun record(groupCode: String?, categoryCode: String?): Pair<SentinelReport?, SentinelRefusal?> {
        val group = SentinelData.groups.firstOrNull { it.id == groupCode } ?: return null to Sentinel.refusal("safeguarding-group-not-declared")
        val category = SentinelData.categories.firstOrNull { it.id == categoryCode } ?: return null to Sentinel.refusal("safeguarding-category-not-declared")
        val report = SentinelReport(next("SG"), group.id, category.id, System.currentTimeMillis())
        reports += report
        return report to null
    }
}
