package za.co.mythuso.model

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/* `duration` is minutes. The visit's own length decides when it ends; an hour is not the
   answer for every service, and pretending otherwise misstates how long somebody has to be home. */
data class CareService(val id: String, val name: String, val detail: String, val price: Int, val duration: Int)
val services = listOf(
    CareService("vitals", "Vitals & chronic check", "A little check-in. A healthier you.", 249, 30),
    CareService("wound", "Wound care", "Expert care for your recovery.", 299, 40),
    CareService("mother", "Mother & baby", "A caring hand for your new chapter.", 349, 45),
    CareService("blood", "Blood tests", "Sample collection at home.", 299, 25),
    CareService("injection", "Injection & vaccination", "On a valid prescription.", 249, 20),
    CareService("planning", "Family planning", "Discreet care on your schedule.", 249, 25),
    CareService("postop", "Post-operative check", "Support after your procedure.", 349, 45),
    CareService("senior", "Elderly care", "A thoughtful one-hour visit.", 399, 60),
    CareService("certificate", "Sick-note visit", "Assessment with doctor review.", 249, 30)
)
/** Demo care areas. Choosing one asks the device for nothing; there is no location permission. */
val careAreas = listOf("Rosebank, Johannesburg", "Soweto, Johannesburg", "Randburg, Johannesburg")
data class GuardianInvitation(val id: String, val name: String, val relationship: String, val scope: String, val expires: String, val status: String)

/* A visit whose hour has already arrived, worked out from the device clock across midnight rather
   than by subtracting minutes from a time of day — at ten past midnight the second of those gives
   a visit twenty-three hours in the future and calls it under way. */
private fun underWayNow(service: CareService, person: String, address: String): BookedVisit {
    val began = java.time.LocalDateTime.now(Scheduling.zone).minusMinutes(10)
    return BookedVisit(service, person, address, "scheduled", began.toLocalDate(),
        began.format(java.time.format.DateTimeFormatter.ofPattern("HH:mm")), "Card")
}
/* The nurse the arrival screen already says this account's visits are assigned to, found in the vetting
   register by that one name rather than typed a second time. The seeded visits carry her, so a thread and
   a booking status have somebody to name. */
private val seededNurseId: String? get() = seededSubjects.firstOrNull { it.name == AssignedNurse.name }?.id
private fun withAssignedNurse(visit: BookedVisit): BookedVisit =
    visit.copy(nurseId = seededNurseId, nurseName = seededNurseId?.let { AssignedNurse.name })
/**
 * Everything the preview holds. All of it is in memory and lost on restart, with two deliberate
 * exceptions: the capture queue and the visit queue, which are the nurse's own work and are written
 * to this phone. The reasoning is in CaptureQueue.kt and VisitQueue.kt, and it is the contract's —
 * an entry that has been captured survives a crash, a restart and a sign-out.
 *
 * Two books rather than one, because they are two files: a ledger that will not parse must not take
 * the other one down with it.
 */
class PreviewStore(book: CaptureBook = MemoryBook(), visitBook: CaptureBook = MemoryBook()) {
    /* Seeded with a real date rather than the string "12 September · 09:00", which stopped being
       true the day after somebody typed it.
       The second one began ten minutes ago, computed from the clock for the same reason. It is here
       because the cancellation contract has three states and only two of them were ever reachable:
       every visit in this preview was days away, so `in-progress` — the one state that refuses a
       cancellation, because a booking screen cannot end an encounter happening in somebody's house —
       existed in the contract and on no screen. A refusal nobody can reach is a refusal nobody has
       tested. */
    val visits = mutableStateListOf(
        /* Randburg rather than Sandton. Sandton is not one of the three areas the booking screen
           offers and not one of the five suburbs geography.json says MyThuso works in, so a visit
           booked there was a visit the app's own coverage refuses — and the arrival screen is where
           that finally became visible. */
        withAssignedNurse(BookedVisit(services[0], "Lerato Molefe", "Home visit · Randburg",
            "scheduled", Scheduling.today().plusDays(5), "09:00", "Card")),
        /* Soweto rather than Rosebank, which is the suburb the assigned nurse works out of. A visit
           in the nurse's own suburb is a real state and the arrival screen has a sentence for it —
           there is no distance between one zone centre and itself — but it was the only state the
           preview could reach, so the straight line the whole screen is an argument about was never
           drawn. Soweto is a covered area and one of the three the booking screen offers. */
        underWayNow(services[7], "Nomsa Molefe", "Home visit · Soweto")
    )
    /* Cancelled visits are kept rather than deleted, which is the cancellation contract's first
       limit: a visit that vanishes is one nobody can ask about afterwards — not the patient, not the
       nurse who was dispatched, and not whoever has to explain it. */
    val cancelled = mutableStateListOf<CancelledVisit>()
    /* What a patient wrote in a visit thread, keyed by the visit's reference. In memory only: these are
       words about getting to a door, not part of anybody's record, and booking.json says nothing in a
       thread travels anywhere. */
    val visitThreadMessages = mutableStateListOf<VisitThreadMessage>()
    /* The simulated nurse queue Gilbert hands a summary to: one entry per conversation, holding the
       highest urgency it was handed with. It reaches no nurse. */
    val handovers = mutableStateListOf<HandoverSent>()
    /* What somebody typed on the home screen, so the catalogue it hands off to can apply it. */
    var careQuery by mutableStateOf("")
    var careCategory by mutableStateOf("All care")
    // Session-only drafts survive closing a sheet; they are never written to a clinical record.
    val bookingDrafts = mutableMapOf<String, BookingDraft>()
    /* Where the visit would happen. It sits beside the person a visit is for because those are the
       two things that change what everything on the home screen means, and a home that opens with a
       promotion instead of them makes a patient guess at both. No location permission is asked for. */
    var careArea by mutableStateOf(careAreas[0])
    val family = mutableStateListOf("Nomsa Molefe", "Thabo Molefe")
    val invitations = mutableStateListOf(
        GuardianInvitation("INV-0031", "Nomsa Molefe", "Mother", "Visit summaries only", "Until I revoke it", "Active"),
        GuardianInvitation("INV-0034", "Kagiso Molefe", "Brother", "Bookings and payments only", "31 December 2026", "Awaiting acceptance")
    )
    var reminders by mutableStateOf(true)
    var wearableSharing by mutableStateOf(false)
    var marketing by mutableStateOf(false)
    var locale by mutableStateOf(ThusoLocale.ENGLISH)
    /* What somebody wrote in Live well. In memory and nowhere else — deliberately not in either of
       the two ledgers this app keeps on the phone, because wellbeing.json's no-sharing-by-default
       refusal says what a person writes there is not added to their record and is not sent to
       anybody, and a diary quietly persisted beside a nurse's captured work is the first half of
       sending it. */
    val wellbeing = mutableStateListOf<WellbeingEntry>().apply { addAll(Wellbeing.seed()) }
    /* Vetting is held here so a decision taken in the Control Tower is the same record the nurse
       workspace reads a screen later, rather than two lists that agree by luck. */
    val vetting = VettingStore()
    /* Capture is held here for the same reason vetting is: the readings the nurse takes on the kit
       screen are the readings the assessment fills in and the consultation record carries, rather
       than three lists that agree by luck. */
    val capture = CaptureStore(book)
    /* And the rest of the visit, one level up: the identity check, the consent, the findings and the
       signature. They lived in a screen's `remember {}` until now, which is to say they lived
       nowhere — see VisitQueue.kt. Held here rather than in the assessment so that walking away from
       the screen, or the process being reclaimed behind it, is not the same thing as losing an
       assessment.
       It is built after `capture` and holds it, because a visit part names readings in that ledger
       rather than carrying copies of them, and because a visit ledger written in the older shape has
       readings inside it that have to be moved there on the way in. */
    val visitQueue = VisitQueueStore(visitBook, capture)
    /* The visit offered to this nurse, walked from her schedule. After vetting and the visit queue,
       because it asks the first whether she may be offered it and the second whether it is signed. */
    val careVisit = CareVisitState(vetting, visitQueue)
    /* The preview visit's cash code, held for as long as the preview store: a code re-issued on every screen would be shown more than once. */
    val cashDoor = CashCodeDoor()
    /* Which visits a clinician has already signed. It is the thing stale-write is a disagreement
       with, so the queue has to be able to ask something rather than assume. */
    val signedVisits = mutableStateListOf("TH-2045")

    /* Both ledgers write on a thread of their own, so there is a window of a few milliseconds in
       which the newest change is in memory and not yet on the disk. Backgrounding is the moment
       before a process is most likely to be killed, so the window is closed there rather than left
       open: MainActivity calls this from onStop and it blocks until both writers are idle. Blocking
       is the right choice in exactly this one place — the alternative is losing the write, and by
       then nobody is looking at the screen for it to stutter. */
    fun flushLedgersToDisk() { capture.flushToDisk(); visitQueue.flushToDisk() }
}


class BookingDraft {
    var step by mutableStateOf(0)
    var person by mutableStateOf("Lerato Molefe")
    var address by mutableStateOf("Home visit · Randburg")
    var day by mutableStateOf(0)
    var slot by mutableStateOf("09:00")
    var payment by mutableStateOf("Card")
    var kind by mutableStateOf("scheduled")
    /* Who is asked for: nearest, previous or named, with the nurse's register id for the last two. */
    var choice by mutableStateOf(Booking.NEAREST)
    var nurseId by mutableStateOf<String?>(null)
}

val careCategories = listOf("All care", "Everyday health", "Recovery", "Family care", "Tests & treatments")
fun careCategory(service: CareService): String = when (service.id) {
    "wound", "postop" -> "Recovery"
    "mother", "planning", "senior" -> "Family care"
    "blood", "injection" -> "Tests & treatments"
    else -> "Everyday health"
}
fun discoverCare(query: String, category: String): List<CareService> = services.filter {
    (category == "All care" || careCategory(it) == category) &&
        (it.name + " " + it.detail).contains(query.trim(), ignoreCase = true)
}
