package za.co.mythuso.model

import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale

/*
 * Where a reading came from, and what happens to it between a nurse's hand and the record.
 *
 * The contract is packages/catalog/capture.json and its opening sentence is the whole argument: a
 * record that cannot tell a measured value from a typed one from a reported one is a record that
 * will eventually be read wrongly by somebody in a hurry. So origin is not metadata here. It is a
 * required field on every reading, and the compiler is the thing that enforces it — see VitalSet in
 * Records.kt, where every observation names its origin by name and none of them has a default.
 *
 * The contract is written out as Kotlin rather than parsed at runtime, for the reason Vetting.kt
 * gives about the vetting table: an app that reads JSON to draw a list is a web app wearing a
 * Compose hat. Unlike the vetting table and the record contract there is no emitter for this one
 * yet, because scripts/ is shared ground and this app owns only apps/android. The four provenances,
 * the six instruments, the six states and the four conflicts below are the contract's, word for
 * word, and the day an emitter is written this file is what it should produce.
 *
 * Nothing connects. There is no Bluetooth call anywhere in this app, no instrument is discovered,
 * and the manifest declares no permission at all — not even internet — so nothing here could reach
 * a server if there were one. Every instrument, serial number, patient and nurse below is fictional.
 */

/* ---- The four origins --------------------------------------------------------------------------
   The trust sentences are quoted rather than paraphrased, because they are the part a screen has to
   get right. Note what the manual sentence actually says: a manual blood pressure is a clinical
   skill. It is a different fact from a device reading, not a weaker one, and any design that draws
   it as a downgrade has misread the contract. */
enum class Provenance(
    val id: String, val label: String, val fhir: String, val detail: String, val trust: String
) {
    DEVICE(
        "device", "Measured by a device", "Observation.device",
        "Read off a paired instrument and written straight into the record. The instrument, its serial and the date it was last calibrated travel with the reading.",
        "The strongest of the four, and only while the calibration is in date. An instrument out of calibration still produces a reading; what it stops producing is a reading anybody should act on without saying so."
    ),
    MANUAL(
        "manual", "Entered by a clinician", "Observation.performer",
        "Read off an instrument by a person and typed in, or taken by hand. Attributed to the registration of whoever typed it.",
        "As good as the person and the instrument they were holding. It is not weaker than a device reading — a manual blood pressure is a clinical skill — but it is a different fact and the record says which."
    ),
    PATIENT_REPORTED(
        "patient-reported", "Reported by the patient", "Observation.performer (Patient)",
        "What the person said, in the record as what they said rather than as a finding.",
        "Not a measurement. It is evidence about the person’s experience, which is often the more useful thing, and it must never be presented as though a clinician observed it."
    ),
    DERIVED(
        "derived", "Calculated", "Observation.derivedFrom",
        "Computed from other readings — BMI from height and weight, a mean arterial pressure from a blood pressure.",
        "Exactly as good as its inputs, and it names them. A derived value whose inputs are unknown is not a value."
    );
}
fun provenanceById(id: String): Provenance? = Provenance.entries.firstOrNull { it.id == id }
/* The short form a reading wears in a list, where there is room for two words and not for a
   paragraph. Kept beside the long form so the two cannot drift apart. */
val Provenance.shortLabel: String
    get() = when (this) {
        Provenance.DEVICE -> "Device"
        Provenance.MANUAL -> "Clinician"
        Provenance.PATIENT_REPORTED -> "Patient said"
        Provenance.DERIVED -> "Calculated"
    }

/* ---- The six instruments -----------------------------------------------------------------------
   Each carries a note naming a real clinical limitation, and each of those notes names something
   that has to be recorded with the reading: the cuff, the site, the strip lot, the position. A note
   that says "the cuff used is recorded with the reading" and a screen that then records no cuff is
   a note nobody kept, so the thing the note names is a field the nurse answers before the reading is
   filed. It is asked at the moment of the reading because the person who needs it is the one holding
   the instrument. */
data class RecordedWithReading(val label: String, val why: String, val options: List<String>)
data class KitInstrument(
    val id: String, val name: String, val measures: List<String>, val transport: String,
    val calibrateEveryMonths: Int, val note: String, val records: RecordedWithReading
)
val kitInstruments = listOf(
    KitInstrument(
        "bp-cuff", "Blood-pressure monitor", listOf("systolic", "diastolic", "pulse"), "Bluetooth Low Energy", 12,
        "Cuff size is a clinical decision the device cannot make. A reading taken on the wrong cuff is wrong in a direction nobody can correct for afterwards, so the cuff used is recorded with the reading.",
        RecordedWithReading(
            "Cuff used",
            "A cuff too small reads high and a cuff too large reads low, and neither error is recoverable from the number alone.",
            listOf("Small adult", "Standard adult", "Large adult", "Thigh")
        )
    ),
    KitInstrument(
        "pulse-oximeter", "Pulse oximeter", listOf("oxygen", "pulse"), "Bluetooth Low Energy", 24,
        "Reads high on dark skin under low perfusion. This is documented rather than corrected for, because the correction is not the platform’s to invent.",
        RecordedWithReading(
            "Perfusion at the probe",
            "The known error is largest where perfusion is poor, so the condition the reading was taken under is recorded and travels with it. Nothing is adjusted.",
            listOf("Warm, well perfused", "Cool hands", "Poor perfusion — cold or shut down")
        )
    ),
    KitInstrument(
        "thermometer", "Infrared thermometer", listOf("temperature"), "Bluetooth Low Energy", 12,
        "Site matters and is recorded: a forehead reading is not an oral one.",
        RecordedWithReading(
            "Site",
            "A forehead reading and an oral one are different measurements of different things, and comparing them across visits is how a fever gets missed.",
            listOf("Forehead", "Temporal artery", "Ear", "Oral", "Axillary")
        )
    ),
    KitInstrument(
        "glucometer", "Glucose meter", listOf("glucose"), "Bluetooth Low Energy", 6,
        "Strips expire separately from the meter, and an expired strip reads low. The strip lot travels with the reading.",
        RecordedWithReading(
            "Strip lot",
            "The meter can be in calibration and the strips out of date on the same morning. An expired strip reads low, which is the direction that gets a hypoglycaemia missed.",
            listOf("Lot 4471-A · in date", "Lot 3982-C · expired last month")
        )
    ),
    KitInstrument(
        "scale", "Weighing scale", listOf("weight"), "Bluetooth Low Energy", 12,
        "Recorded with whether the patient was weighed standing, seated or in bed, because the three are not comparable.",
        RecordedWithReading(
            "Position",
            "A weight is only meaningful against this person’s own previous weights, and a trend built from three positions is not a trend.",
            listOf("Standing", "Seated", "In bed")
        )
    ),
    KitInstrument(
        "ecg", "Single-lead ECG", listOf("ecg"), "Bluetooth Low Energy", 12,
        "A single-lead trace is a screening tool. It is never a diagnosis, and any interpretation is decision support that a doctor signs or does not.",
        RecordedWithReading(
            "Trace quality",
            "A noisy trace and a normal one look alike in a summary line. What the trace was like is recorded so a reader is not left to assume it was clean.",
            listOf("Clean", "Some movement artefact", "Noisy — repeat advised")
        )
    )
)
fun kitInstrumentById(id: String): KitInstrument? = kitInstruments.firstOrNull { it.id == id }
/* Two of the six measure something the assessment does not carry a reference range for, and the
   boundary check names them for the same reason: a weight means nothing except against this
   person’s own earlier weights, and a single-lead trace is not a number. They are captured, they are
   filed, and they are not flagged. */
val notRangeFlagged = listOf("ecg", "weight")
val measureUnits = mapOf(
    "systolic" to "mmHg", "diastolic" to "mmHg", "pulse" to "bpm", "respiratory" to "breaths/min",
    "temperature" to "°C", "oxygen" to "%", "glucose" to "mmol/L", "weight" to "kg", "ecg" to "trace"
)
val measureLabels = mapOf(
    "systolic" to "Blood pressure — systolic", "diastolic" to "Blood pressure — diastolic",
    "pulse" to "Pulse", "respiratory" to "Respiratory rate", "temperature" to "Temperature",
    "oxygen" to "Oxygen saturation", "glucose" to "Blood glucose", "weight" to "Weight",
    "ecg" to "Single-lead rhythm"
)

/* ---- Calibration -------------------------------------------------------------------------------
   The rule that matters most, and the one it is easiest to get wrong out of caution:

     “An out-of-date calibration marks a reading, it does not block it. A nurse in a home with one
      instrument still needs the number; what she must not have is the number without the caveat.”

   So there is no branch anywhere below that refuses a capture on calibration. There is only a
   caveat, and the caveat is attached to the reading rather than to the screen, so it survives into
   the queue, into the assessment and into the record.

   The warning window is vetting’s own 45 days rather than a second number: a nurse warned at 45
   days about her clearance and at thirty about her instrument is being warned in two languages. */
enum class CalibrationState(val id: String, val label: String) {
    IN_DATE("in-date", "Calibration in date"),
    DUE("due", "Calibration due"),
    OUT_OF_DATE("out-of-date", "Calibration out of date")
}
data class Calibration(val lastCalibrated: LocalDate, val everyMonths: Int) {
    val dueOn: LocalDate get() = lastCalibrated.plusMonths(everyMonths.toLong())
    val daysLeft: Long get() = ChronoUnit.DAYS.between(vettingToday(), dueOn)
}
fun calibrationState(calibration: Calibration): CalibrationState = when {
    calibration.daysLeft < 0 -> CalibrationState.OUT_OF_DATE
    calibration.daysLeft <= EXPIRY_WARNING_DAYS -> CalibrationState.DUE
    else -> CalibrationState.IN_DATE
}
/* Arithmetic rather than a label somebody typed, so a screen cannot say “in date” about a date that
   has already gone. */
fun calibrationWording(calibration: Calibration): String {
    val days = calibration.daysLeft
    val due = formatVettingDate(calibration.dueOn)
    val last = formatVettingDate(calibration.lastCalibrated)
    return when {
        days < 0 -> "Calibrated $last, every ${calibration.everyMonths} months. Out of date by ${-days} day${if (days == -1L) "" else "s"} · was due $due"
        days == 0L -> "Calibrated $last, every ${calibration.everyMonths} months. Due today · $due"
        else -> "Calibrated $last, every ${calibration.everyMonths} months. Due in $days day${if (days == 1L) "" else "s"} · $due"
    }
}
/** The sentence an out-of-date instrument writes onto every reading it produces, for good. */
fun calibrationCaveat(instrument: KitInstrument, calibration: Calibration): String? =
    if (calibrationState(calibration) != CalibrationState.OUT_OF_DATE) null
    else "Taken on a ${instrument.name.lowercase()} whose calibration lapsed ${-calibration.daysLeft} days before this reading. The number stands; it is not to be acted on without saying so."

data class PairedInstrument(
    val instrument: KitInstrument, val serial: String, val calibration: Calibration, val battery: Int
) {
    val state: CalibrationState get() = calibrationState(calibration)
}

/* ---- The six states a captured reading passes through ------------------------------------------ */
enum class CaptureState(val id: String, val label: String, val detail: String) {
    CAPTURED("captured", "Captured", "Taken, and held on the device it was taken on. It exists nowhere else yet."),
    QUEUED("queued", "Waiting to send", "Finished and sealed, waiting for a connection. The nurse has done everything they can do."),
    SENDING("sending", "Sending", "In flight. Interruptible without loss — an entry that does not land stays queued."),
    STORED("stored", "Stored", "Accepted by the server and in the record."),
    CONFLICTED("conflicted", "Needs a decision", "Landed against a record that already holds a reading for the same observation in the same visit. Nothing is merged and nothing is discarded."),
    REFUSED("refused", "Refused", "The server would not take it, and says why. It stays on the device until somebody decides what to do with it.")
}
fun captureStateById(id: String): CaptureState = CaptureState.entries.firstOrNull { it.id == id } ?: CaptureState.CAPTURED

/* ---- The four disagreements --------------------------------------------------------------------
   Three of the four are resolved by a clinician and one by the server, and the split is not
   arbitrary. Ordering is a fact about clocks, which a server can settle. Which of two readings
   stands is a clinical judgement, which it cannot. */
data class CaptureConflict(val id: String, val name: String, val resolution: String, val detail: String)
val captureConflicts = listOf(
    CaptureConflict("duplicate-observation", "Two readings, one observation", "clinician",
        "The same observation recorded twice in one visit — usually a retake after a doubtful first reading. Both are kept; a clinician says which stands, and the other stays visible as superseded rather than being deleted."),
    CaptureConflict("clock-skew", "The device clock disagrees", "server",
        "A device that has been offline may have drifted or been set by hand. The server’s receipt time is authoritative for ordering; the device’s time is kept beside it as what the device believed, never presented as the time it happened."),
    CaptureConflict("stale-write", "The record moved on", "clinician",
        "The record changed while the entry was queued — a doctor has already signed, or the visit was cancelled. It is never applied silently after the fact."),
    CaptureConflict("vetting-lapsed", "The capturer’s standing lapsed", "clinician",
        "A nurse whose clearance lapsed between capture and sync. The reading was taken while she was cleared, so it is not discarded — but it is not filed on her authority alone either.")
)
fun captureConflictById(id: String?): CaptureConflict? = captureConflicts.firstOrNull { it.id == id }

/* The rules, in the contract's own words, so a screen quotes them rather than summarising them into
   something slightly different. */
val captureWhy = "A reading is not just a number. Where it came from decides what may be done with it, and a record that cannot tell a measured value from a typed one from a reported one is a record that will eventually be read wrongly by somebody in a hurry."
val captureRules = listOf(
    "Every reading carries exactly one provenance. There is no default and no unknown: a value nobody can say the origin of is not filed." to "provenanceIsRequired",
    "An out-of-date calibration marks a reading, it does not block it. A nurse in a home with one instrument still needs the number; what she must not have is the number without the caveat." to "calibrationNeverRefuses",
    "The device’s own time is recorded as what the device believed. Ordering uses the server’s receipt time." to "deviceClockIsNotTruth",
    "Nothing is auto-merged and nothing is auto-discarded. A timestamp does not win a clinical disagreement; a clinician does." to "conflictsAreNotMerged",
    "An entry that has been captured is the nurse’s work. It survives a crash, a restart and a sign-out, and it is never dropped to make a sync succeed." to "queuedIsNotLost",
    "A value read from the device’s own store carries when it was written, on screen, in words." to "offlineNeverServesStaleSilently"
)

/* ---- One captured reading ----------------------------------------------------------------------
   Everything a reader would need to decide what may be done with the number, held on the reading
   rather than looked up beside it. A caveat that lives on a screen is lost the moment the reading is
   read anywhere else, which is every time after the first. */
data class CapturedReading(
    val id: String,
    val visit: String,
    val patient: String,
    val observationId: String,
    val label: String,
    val unit: String,
    val value: String,
    val provenance: Provenance,
    /* Only a device reading has these three, and it has all three or it is not a device reading. */
    val instrumentId: String? = null,
    val instrumentName: String? = null,
    val serial: String? = null,
    val calibrationLine: String? = null,
    val calibrationState: CalibrationState? = null,
    /* What the instrument's own note said had to be recorded, and what the nurse answered. */
    val detailLabel: String? = null,
    val detailValue: String? = null,
    /* Sentences that travel with the number wherever it is read. */
    val caveats: List<String> = emptyList(),
    /* A derived value names its inputs, or it is not a value. */
    val derivedFrom: List<String> = emptyList(),
    /* Attribution, from the vetting record rather than typed here. */
    val byId: String,
    val byName: String,
    val byReference: String,
    /* What this phone believed the time was, and what the server said when it took it. The second
       one is nullable on purpose: an entry that has not landed has no established time. */
    val deviceMillis: Long,
    val serverMillis: Long? = null,
    /* When this row was written into the phone's own store — the thing offlineNeverServesStaleSilently
       requires to be sayable in words on screen. */
    val writtenMillis: Long,
    val state: CaptureState = CaptureState.CAPTURED,
    val conflictId: String? = null,
    val refusal: String? = null,
    /* Superseding is a pointer, not a delete. Both rows stay. */
    val supersededById: String? = null,
    val supersedes: String? = null,
    /* The answer to vetting-lapsed: a second, currently-cleared name beside the capturer's, never
       instead of it. */
    val countersignedBy: String? = null,
    val countersignedReference: String? = null,
    val resolutionNote: String? = null
) {
    val superseded: Boolean get() = supersededById != null
    /* The device clock's disagreement with the server, where both are known. Ten minutes is the
       point at which two clocks are telling different stories rather than rounding differently. */
    val clockSkewMillis: Long? get() = serverMillis?.let { it - deviceMillis }
    val clockSkewed: Boolean get() = (clockSkewMillis?.let { Math.abs(it) } ?: 0L) > 10 * 60 * 1000L
}

/* ---- Derived values ----------------------------------------------------------------------------
   Mean arterial pressure, because it is the one thing derivable from what this app already collects
   and because it makes the fourth provenance real rather than a chip nobody ever sees. It names its
   two inputs, and it does not exist when either of them is missing — “a derived value whose inputs
   are unknown is not a value” is a return of null, not a dash on a screen. */
fun meanArterialPressure(systolic: Double?, diastolic: Double?): Double? {
    if (systolic == null || diastolic == null) return null
    return diastolic + (systolic - diastolic) / 3.0
}
fun mapDerivedFrom(systolic: Double, diastolic: Double): List<String> =
    listOf("Systolic ${"%.0f".format(systolic)} mmHg", "Diastolic ${"%.0f".format(diastolic)} mmHg")

/* ---- Saying when, in words ---------------------------------------------------------------------
   offlineNeverServesStaleSilently asks for words rather than a timestamp, and it is right to: “14:02”
   tells a nurse nothing about whether what she is reading is this morning's or last Tuesday's. The
   sibling project this doctrine comes from serves a cached bundle only after saying how old it is,
   and it never serves the cache *instead of* making the request — the failure is reported and the
   age of what is on screen is repeated. Both halves are kept here. */
fun ageText(millis: Long, now: Long = System.currentTimeMillis()): String {
    val seconds = (now - millis) / 1000
    return when {
        seconds < 0 -> "at a time this phone has not reached yet"
        seconds < 45 -> "just now"
        seconds < 90 -> "a minute ago"
        seconds < 3600 -> "${seconds / 60} minutes ago"
        seconds < 7200 -> "an hour ago"
        seconds < 86400 -> "${seconds / 3600} hours ago"
        seconds < 172800 -> "yesterday"
        seconds < 604800 -> "${seconds / 86400} days ago"
        else -> "on ${longDate(atMillis(millis).toLocalDate().toString())}"
    }
}
private val zone: ZoneId = ZoneId.systemDefault()
fun atMillis(millis: Long): LocalDateTime = Instant.ofEpochMilli(millis).atZone(zone).toLocalDateTime()
private val clockFormat = DateTimeFormatter.ofPattern("HH:mm", Locale("en", "ZA"))
private val stampFormat = DateTimeFormatter.ofPattern("d MMM yyyy · HH:mm", Locale("en", "ZA"))
fun clockText(millis: Long): String = atMillis(millis).format(clockFormat)
fun stampText(millis: Long): String = atMillis(millis).format(stampFormat)
/** How far apart two clocks are, said the way a person would say it. */
fun skewText(millis: Long): String {
    val minutes = Math.abs(millis) / 60000
    val direction = if (millis > 0) "behind" else "ahead of"
    return when {
        minutes < 60 -> "$minutes minutes $direction the server"
        minutes < 1440 -> "${minutes / 60} hours ${minutes % 60} minutes $direction the server"
        else -> "${minutes / 1440} days $direction the server"
    }
}
