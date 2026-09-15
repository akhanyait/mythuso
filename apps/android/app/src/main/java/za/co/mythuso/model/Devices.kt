package za.co.mythuso.model

import androidx.compose.runtime.mutableStateListOf
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit

/*
 * Thuso Kit's registry on Android: a device, its health, its recall, what Devices knows about a
 * reading, and a wearable link request that connects nothing.
 *
 * The words and the kinds are DevicesData.kt, generated from packages/catalog/devices.json and
 * packages/catalog/apis/devices.json. The arithmetic below is packages/engines/src/devices/domain
 * (registry.ts, readings.ts and links.ts), line for line where a line decides anything, because a
 * nurse reading "stale" on this phone and "reporting" on the web about the same instrument is two
 * apps disagreeing about a fact.
 *
 * NO VALUE IS HELD. A DeviceReading has no field a number could be put in. Devices keeps where a
 * reading came from, the sample, whether it may carry clinical weight and its marks; the value is the
 * Health Passport's, and the numbers on the capture queue are that screen's invented readings.
 *
 * Nothing here contacts an instrument, a phone's health store or a watch. The registry is fictional
 * and held in this process's memory; the wearable link holder is Compose state and nothing more.
 */

data class DevicesChoice(val id: String, val label: String)
data class DeviceClassSpec(val id: String, val label: String, val carriesClinicalWeight: Boolean)
data class DeviceSourceSpec(val id: String, val label: String, val simulated: Boolean, val classes: List<String>)
data class DeviceQualitySpec(val id: String, val label: String, val carriesClinicalWeight: Boolean)
data class DeviceMarkSpec(val id: String, val label: String, val sentence: String)
data class WearablePlatformSpec(val id: String, val name: String, val phone: String)
data class DevicesRefusal(val id: String, val status: Int, val statement: String)

/** A recall names the moment it is effective from, which may be before the moment it was recorded. */
data class DeviceRecall(val reasonId: String, val effectiveFrom: Long, val recordedAt: Long)

data class RegisteredDevice(
    val deviceRef: String,
    val serial: String,
    val model: String,
    val firmware: String,
    val deviceClass: String,
    /* Null for a device MyThuso did not issue: the engine's register() never keeps a kind for one,
       which is why "no kind" is enough to say its calibration is not ours to track. */
    val instrumentKind: String?,
    val calibratedOn: LocalDate?,
    val batteryPercent: Int?,
    val lastSyncAt: Long?,
    val registeredAt: Long,
    val recall: DeviceRecall?
)

data class DeviceCalibration(val stateId: String, val dueOn: LocalDate?)
data class DeviceHealth(
    val stateId: String, val lastSyncAt: Long?, val stale: Boolean, val recalled: Boolean,
    val calibration: DeviceCalibration, val batteryPercent: Int?, val firmware: String
)

/** Everything Devices knows about a reading, which is everything but the number. */
data class DeviceReading(
    val readingRef: String,
    val deviceRef: String,
    val deviceClass: String,
    val metric: String,
    val unit: String,
    val takenAt: Long,
    val source: String,
    val quality: String,
    val intendedUse: String,
    val marks: List<String>
)

data class WearableLink(
    val linkRef: String, val platform: String, val consentVersion: Int, val metrics: List<String>,
    val requestedAt: Long, val withdrawnAt: Long?
)

object Devices {
    const val MINUTE = 60_000L
    const val HOUR = 60 * MINUTE
    const val DAY = 24 * HOUR

    fun label(choices: List<DevicesChoice>, id: String): String = choices.firstOrNull { it.id == id }?.label ?: id
    fun classOf(id: String): DeviceClassSpec? = DevicesData.deviceClasses.firstOrNull { it.id == id }
    fun sourceOf(id: String): DeviceSourceSpec? = DevicesData.sources.firstOrNull { it.id == id }
    fun qualityOf(id: String): DeviceQualitySpec? = DevicesData.qualities.firstOrNull { it.id == id }
    fun markOf(id: String): DeviceMarkSpec? = DevicesData.marks.firstOrNull { it.id == id }
    fun platformOf(id: String): WearablePlatformSpec? = DevicesData.platforms.firstOrNull { it.id == id }
    /** A measure's name, from the record contract's observations, so a label is never typed twice. */
    fun metricLabel(id: String): String = observationRanges.firstOrNull { it.id == id }?.label ?: id

    fun refusal(id: String): DevicesRefusal = DevicesData.refusals.first { it.id == id }

    fun fill(sentence: String, values: Map<String, String>): String =
        Regex("\\{(\\w+)\\}").replace(sentence) { match -> values[match.groupValues[1]] ?: match.value }

    /** The route a wearable link request opens under, from the contract's heading rather than typed at each door. */
    fun wearableLinkTitle(platformId: String): String =
        fill(DevicesData.WearableText.heading, mapOf("platform" to (platformOf(platformId)?.name ?: platformId)))

    /* THE ONE ANSWER TO WHETHER A READING MAY CARRY CLINICAL WEIGHT, and the most important refusal of
       the wave: a consumer device never does. Five questions, every one read from the generated flags
       rather than from a class id, so no combination of source, sample and intent can promote a watch
       to an instrument — the consumer class is declared without weight, and the first line says no. */
    fun carriesWeight(deviceClass: String, source: String, quality: String, intendedUse: String, marks: List<String>): Boolean =
        classOf(deviceClass)?.carriesClinicalWeight == true &&
            sourceOf(source)?.simulated == false &&
            qualityOf(quality)?.carriesClinicalWeight == true &&
            "recalled" !in marks &&
            intendedUse == "clinical"

    fun carriesWeight(reading: DeviceReading): Boolean =
        carriesWeight(reading.deviceClass, reading.source, reading.quality, reading.intendedUse, reading.marks)

    /* The stale interval in the words a nurse reads: whole days, whole hours, or minutes. Read from the
       setting, so the sentence and the arithmetic cannot disagree. */
    fun intervalText(minutes: Int): String = when {
        minutes % (24 * 60) == 0 -> (minutes / (24 * 60)).let { "$it ${if (it == 1) "day" else "days"}" }
        minutes % 60 == 0 -> (minutes / 60).let { "$it ${if (it == 1) "hour" else "hours"}" }
        else -> "$minutes minutes"
    }

    private val zone: ZoneId = ZoneId.systemDefault()
    private fun dayOf(at: Long): LocalDate = Instant.ofEpochMilli(at).atZone(zone).toLocalDate()

    fun isStale(device: RegisteredDevice, now: Long, staleAfterMinutes: Int = DevicesData.staleAfterMinutes): Boolean =
        device.lastSyncAt != null && now - device.lastSyncAt > staleAfterMinutes * MINUTE

    fun recalledAt(device: RegisteredDevice, at: Long): Boolean = device.recall != null && at >= device.recall.effectiveFrom

    /* When a calibration runs out: the day it was calibrated plus its kind's cadence, which is the capture
       contract's calibrateEveryMonths through the existing Calibration model and never a number typed here.
       Worked out on whole days, so the state a nurse reads in the morning is the one she reads at night. */
    fun calibrationOf(device: RegisteredDevice, at: Long, dueDays: Int = DevicesData.calibrationDueDays): DeviceCalibration {
        val kind = device.instrumentKind?.let(::kitInstrumentById)
        val calibratedOn = device.calibratedOn
        if (kind == null || calibratedOn == null) return DeviceCalibration("not-tracked", null)
        val dueOn = Calibration(calibratedOn, kind.calibrateEveryMonths).dueOn
        val daysLeft = ChronoUnit.DAYS.between(dayOf(at), dueOn)
        return DeviceCalibration(if (daysLeft < 0) "overdue" else if (daysLeft <= dueDays) "due" else "in-date", dueOn)
    }

    /* Recalled before anything else, because a recalled device is not in use and its silence is expected;
       then never synced, then stale against the interval in force. Worked out when it is read, never stored. */
    fun healthOf(device: RegisteredDevice, now: Long): DeviceHealth {
        val stale = isStale(device, now)
        val recalled = device.recall != null
        val state = when {
            recalled -> "recalled"
            device.lastSyncAt == null -> "never-synced"
            stale -> "stale"
            else -> "reporting"
        }
        return DeviceHealth(state, device.lastSyncAt, stale, recalled, calibrationOf(device, now), device.batteryPercent, device.firmware)
    }

    /* The marks a reading is asked with, in the engine's order, decided from the device and the moment the
       reading was taken and never from a setting: the overdue test uses a due window of nought, so a change
       to calibration-due-days cannot mark or unmark anything. A device's class is "own device" when it
       carries no weight and the source that reads it is not simulated. */
    fun marksWhenAsked(device: RegisteredDevice, source: String, quality: String, intendedUse: String, takenAt: Long): List<String> {
        val simulated = sourceOf(source)?.simulated == true
        val ownDevice = classOf(device.deviceClass)?.carriesClinicalWeight == false &&
            DevicesData.sources.any { device.deviceClass in it.classes && !it.simulated }
        return buildList {
            if (simulated) add("simulated")
            if (ownDevice) add("consumer-device")
            if (qualityOf(quality)?.carriesClinicalWeight == false) add("poor-sample")
            if (recalledAt(device, takenAt)) add("recalled")
            if (calibrationOf(device, takenAt, 0).stateId == "overdue") add("calibration-overdue")
            if (intendedUse != "clinical") add("guidance-only")
        }
    }

    /* A recall marks the readings from the device taken at or after the moment it took effect, and adds the
       mark beside what is there. Nothing is removed and nothing else about the reading changes. */
    fun markedForRecall(readings: List<DeviceReading>, device: RegisteredDevice): List<DeviceReading> {
        val recall = device.recall ?: return readings
        return readings.map { r ->
            if (r.deviceRef == device.deviceRef && r.takenAt >= recall.effectiveFrom && "recalled" !in r.marks) r.copy(marks = r.marks + "recalled") else r
        }
    }

    /* The sample beside a reading on the capture queue. The queue records a strip lot rather than a sample
       quality, so the one thing it can say is the thing the glucometer's own note names: an expired strip
       reads low, and a reading on one is acceptable rather than good. */
    fun captureQualityOf(reading: CapturedReading): String =
        if (reading.detailValue?.contains("expired", ignoreCase = true) == true) "acceptable" else "good"
}

/* ---- The nurse's kit, as the registry has it --------------------------------------------------------
   Fictional, and seeded by running the rules at earlier moments rather than by typing states onto rows:
   the stale glucometer, the recalled oximeter and the marked pulse reading are what the arithmetic
   answers for a device synced or recalled at that time. Mirrors apps/web/src/lib/devices.ts. */
object DevicesRegistry {
    const val kitHolder = "N-205"
    var devices: List<RegisteredDevice> = emptyList()
        private set
    var readings: List<DeviceReading> = emptyList()
        private set
    private var seeded = false

    /* When each instrument last synced, and the battery it reported. The glucometer has sent nothing for a
       day and a half, which is stale under the proposed default. */
    private val syncs = mapOf(
        "bp-cuff" to (0.8 to 82), "pulse-oximeter" to (2.0 to 70), "thermometer" to (3.0 to 64),
        "glucometer" to (36.0 to 18), "scale" to (5.0 to 91), "ecg" to (20.0 to 47)
    )

    /* The calibration the capture store gives an instrument when it pairs one (CaptureStore's
       fictionalCalibration), for the instruments not paired on this phone. Offsets from today, so the
       preview never goes stale; the cadence they run out on is still the instrument's own. */
    private fun pairingCalibration(id: String): LocalDate = when (id) {
        "glucometer" -> inMonths(-8)
        "scale" -> inDays(-330)
        "pulse-oximeter" -> inDays(-710)
        else -> inMonths(-3)
    }

    /* The serial an instrument already carries on this phone: its pairing, else a reading on the queue taken
       on one, else the kit's own number in the capture store's TH-XX shape. */
    private fun serialFor(capture: CaptureStore?, instrument: KitInstrument): String =
        capture?.paired?.firstOrNull { it.instrument.id == instrument.id }?.serial
            ?: capture?.readings?.firstOrNull { it.instrumentId == instrument.id }?.serial
            ?: "TH-${instrument.id.take(2).uppercase()}-6602"

    fun ensureSeeded(capture: CaptureStore?, now: Long = System.currentTimeMillis()) {
        if (seeded) return
        seeded = true
        val registeredAt = now - 30 * Devices.DAY
        var registered = kitInstruments.map { instrument ->
            val paired = capture?.paired?.firstOrNull { it.instrument.id == instrument.id }
            RegisteredDevice(
                deviceRef = "DEV-${serialFor(capture, instrument)}", serial = serialFor(capture, instrument),
                model = instrument.name, firmware = "2.4.1", deviceClass = "certified", instrumentKind = instrument.id,
                calibratedOn = paired?.calibration?.lastCalibrated ?: pairingCalibration(instrument.id),
                batteryPercent = null, lastSyncAt = null, registeredAt = registeredAt, recall = null
            )
        }
        fun byKind(kind: String) = registered.first { it.instrumentKind == kind }

        /* Each reading asked about at the moment it was taken, before any recall was recorded. */
        val asked = mutableListOf<DeviceReading>()
        fun taken(kind: String, ref: String, metric: String, hoursAgo: Double, quality: String) {
            val at = now - (hoursAgo * Devices.HOUR).toLong()
            val device = byKind(kind)
            val unit = DevicesData.measureUnits.first { it.first == metric }.second
            asked += DeviceReading(ref, device.deviceRef, device.deviceClass, metric, unit, at, "kit-instrument", quality, "clinical",
                Devices.marksWhenAsked(device, "kit-instrument", quality, "clinical", at))
        }
        taken("pulse-oximeter", "RD-0101", "oxygen", 72.0, "good")
        taken("pulse-oximeter", "RD-0102", "pulse", 26.0, "acceptable")
        taken("glucometer", "RD-0103", "glucose", 36.0, "acceptable")
        taken("bp-cuff", "RD-0104", "systolic", 0.8, "good")
        taken("thermometer", "RD-0105", "temperature", 3.0, "poor")

        registered = registered.map { d ->
            val (hoursAgo, battery) = syncs.getValue(d.instrumentKind!!)
            d.copy(lastSyncAt = now - (hoursAgo * Devices.HOUR).toLong(), batteryPercent = battery)
        }
        /* The oximeter's maker issued a notice an hour ago about a fault that began two days ago. Yesterday's
           pulse reading is marked; the oxygen reading from three days ago is not. */
        val oximeter = byKind("pulse-oximeter").copy(recall = DeviceRecall("manufacturer-notice", now - 2 * Devices.DAY, now - Devices.HOUR))
        registered = registered.map { if (it.deviceRef == oximeter.deviceRef) oximeter else it }
        devices = registered
        readings = Devices.markedForRecall(asked, oximeter)
    }

    fun readingsOf(deviceRef: String): List<DeviceReading> = readings.filter { it.deviceRef == deviceRef }.sortedByDescending { it.takenAt }
}

/* ---- The patient's wearable link request ------------------------------------------------------------
   Recorded and never connected. There is no library, entitlement or permission for either platform in
   this app, and nothing here adds a way to one: a request is the platform, the consent version in force
   and the reading types agreed to, and it stays requested-not-connected for as long as this build exists.
   Held in Compose state for the life of the process and written nowhere. */
object WearableLinks {
    val links = mutableStateListOf<WearableLink>()

    fun open(platform: String): WearableLink? = links.lastOrNull { it.platform == platform && it.withdrawnAt == null }
    fun last(platform: String): WearableLink? = links.lastOrNull { it.platform == platform }

    /* In the engine's order: consent first, because a request without it is nobody's to record; then the
       platform, the scope, and a request already open, which asking again does not connect. */
    fun request(platform: String, metrics: List<String>, agreed: Boolean): DevicesRefusal? {
        if (!agreed) return Devices.refusal("consent-missing")
        if (Devices.platformOf(platform) == null) return Devices.refusal("platform-not-declared")
        if (metrics.isEmpty() || metrics.any { m -> DevicesData.measureUnits.none { it.first == m } }) return Devices.refusal("metric-not-in-the-scope")
        if (open(platform) != null) return Devices.refusal("link-already-requested")
        links += WearableLink("LNK-${links.size + 1}", platform, DevicesData.wearableConsentVersion, metrics.distinct(), System.currentTimeMillis(), null)
        return null
    }

    /* A withdrawal is a consent decision and it is made once. */
    fun withdraw(platform: String): DevicesRefusal? {
        val last = last(platform) ?: return Devices.refusal("link-not-found")
        if (last.withdrawnAt != null) return Devices.refusal("link-already-withdrawn")
        val index = links.indexOf(last)
        links[index] = last.copy(withdrawnAt = System.currentTimeMillis())
        return null
    }
}
