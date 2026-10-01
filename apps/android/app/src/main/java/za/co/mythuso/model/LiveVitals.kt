package za.co.mythuso.model

import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToLong

/* The live vitals board's arithmetic on Android — the same pure function packages/engines/src/devices/live-vitals.ts
   is on the web, over the baselines and constants LiveVitalsData.kt carries from the contract.

   A reading is worked out from the scenario, the patient, the stream and the reading's number: the preset's
   baseline at that step plus a jitter from Park and Miller's generator, on the record's step. No clock, no
   random source and nothing stored, so a doctor reading a patient's devices on a phone sees the numbers the
   web shows for the same patient on the same scenario at the same reading. Every product is a Long below
   2^53, which is what lets Kotlin and a JavaScript number agree.

   WHAT IT REFUSES TO KNOW. Whether a reading is concerning. It says whether a value is inside, below or above
   the record's indicative range and nothing else: no score, no priority and no severity, because no triage
   protocol is ratified. Every reading here is simulated and carries no clinical weight. */

/* A stream names its measure and nothing more about it: the label, unit, range and step are read from
   observationRanges, the one place on Android a reference range is written. */
data class LiveStreamSpec(
    val id: String, val measure: String, val instrument: String, val presetType: String, val jitter: Double, val ceiling: Double?
) {
    private val range: ObservationRange get() = observationRanges.first { it.id == measure }
    val label: String get() = range.label
    val unit: String get() = range.unit
    val low: Double get() = range.low
    val high: Double get() = range.high
    val step: Double get() = range.step
}
data class LivePresetReading(val type: String, val value: Double, val offsetMs: Long)
data class LivePresetSpec(val id: String, val name: String, val readings: List<LivePresetReading>)
data class LiveRefusalSpec(val id: String, val heading: String, val sentence: String)
/** `atOffsetMs` is milliseconds after the scenario started; negative for a reading the preset placed in the past. */
data class LiveReading(val value: Double, val tick: Int, val atOffsetMs: Long)

enum class LiveRangePlace { Inside, Below, Above }

object LiveVitals {
    private val d = LiveVitalsData

    fun preset(id: String): LivePresetSpec? = d.presets.firstOrNull { it.id == id }

    /** A patient's seed: their reference folded over UTF-16 code units, never nought. */
    fun seedOf(subject: String): Long {
        var h = 0L
        for (c in subject) h = (h * 31 + c.code) % d.modulus
        return if (h == 0L) 1L else h
    }

    /** A number in [0, 1) for this patient, reading and stream; the same as the web's. */
    fun unitAt(seed: Long, tick: Int, stream: Int): Double {
        var x = (seed + tick * d.tickStride + stream * d.streamStride) % d.modulus
        if (x == 0L) x = 1L
        x = (x * d.multiplier) % d.modulus
        x = (x * d.multiplier) % d.modulus
        return x.toDouble() / d.modulus.toDouble()
    }

    fun decimals(step: Double): Int {
        var places = 0
        var scaled = step
        while (floor(scaled) != scaled && places < 6) { scaled *= 10; places++ }
        return places
    }

    /* Half away from zero, as JavaScript's Math.round is for the positive values a reading has. */
    private fun round(v: Double): Double = floor(v + 0.5)

    /** A value on the measure's own step, to as many places as the step has. */
    fun onStep(value: Double, step: Double): Double {
        val snapped = round(value / step) * step
        val scale = 10.0.pow(decimals(step))
        return (snapped * scale).roundToLong() / scale
    }

    private fun liveOffsets(presetId: String): List<Long> =
        preset(presetId)?.readings?.map { it.offsetMs }?.filter { it >= 0 }?.distinct()?.sorted() ?: emptyList()

    fun streamsLive(presetId: String) = liveOffsets(presetId).isNotEmpty()

    private fun baseline(presetId: String, type: String, tick: Int): Double? {
        val offsets = liveOffsets(presetId)
        val p = preset(presetId) ?: return null
        if (offsets.isEmpty()) return null
        val at = offsets[min(tick / d.ticksPerStep, offsets.size - 1)]
        return p.readings.filter { it.type == type && it.offsetMs in 0..at }.maxByOrNull { it.offsetMs }?.value
    }

    /** Reading number `tick` of one stream, or null when the scenario sends nothing from its instrument. */
    fun reading(presetId: String, seed: Long, index: Int, tick: Int): LiveReading? {
        val s = d.streams[index]
        val base = baseline(presetId, s.presetType, tick) ?: return null
        var value = onStep(base + (unitAt(seed, tick, index) * 2 - 1) * s.jitter, s.step)
        s.ceiling?.let { value = min(value, it) }
        return LiveReading(value, tick, tick * d.tickMs)
    }

    /** The last `history` readings up to `tick`, oldest first. The stale preset sends nothing live: its own
        readings come back as they are, at their own offsets. */
    fun history(presetId: String, seed: Long, index: Int, tick: Int): List<LiveReading> {
        val s = d.streams[index]
        if (!streamsLive(presetId)) {
            return (preset(presetId)?.readings ?: emptyList()).filter { it.type == s.presetType }.sortedBy { it.offsetMs }
                .mapIndexed { i, r -> LiveReading(onStep(r.value, s.step), i, r.offsetMs) }.takeLast(d.history)
        }
        return (max(0, tick - d.history + 1)..tick).mapNotNull { reading(presetId, seed, index, it) }
    }

    fun place(stream: LiveStreamSpec, value: Double) =
        if (value < stream.low) LiveRangePlace.Below else if (value > stream.high) LiveRangePlace.Above else LiveRangePlace.Inside

    /** A reading, to as many places as its step has: 37.0 °C, never 37. */
    fun format(value: Double, step: Double): String = "%.${decimals(step)}f".format(java.util.Locale.ROOT, value)
    /** A range's bound as the record writes it: 90, 36.1. */
    fun plain(value: Double): String = if (value == floor(value)) value.toLong().toString() else value.toString()

    fun fill(template: String, values: Map<String, String>): String =
        values.entries.fold(template) { acc, (k, v) -> acc.replace("{$k}", v) }

    /** The range in the record's numbers, said as a place and never a severity. */
    fun rangeWords(stream: LiveStreamSpec, value: Double): String {
        val template = when (place(stream, value)) {
            LiveRangePlace.Inside -> LiveVitalsData.Words.inside
            LiveRangePlace.Below -> LiveVitalsData.Words.below
            LiveRangePlace.Above -> LiveVitalsData.Words.above
        }
        return fill(template, mapOf("low" to plain(stream.low), "high" to plain(stream.high), "unit" to stream.unit))
    }

    fun ago(ms: Long): String {
        val s = max(0L, ms / 1000)
        return when {
            s < 2 -> LiveVitalsData.Words.justNow
            s < 60 -> fill(LiveVitalsData.Words.secondsAgo, mapOf("n" to "$s"))
            s < 3600 -> fill(LiveVitalsData.Words.minutesAgo, mapOf("n" to "${s / 60}"))
            else -> fill(LiveVitalsData.Words.hoursAgo, mapOf("n" to "${s / 3600}"))
        }
    }
}
