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
/**
 * Everything the preview holds. All of it is in memory and lost on restart, with one deliberate
 * exception: the capture queue, which is the nurse's own work and is written to this phone. The
 * reasoning for that one exception is in CaptureQueue.kt, and it is the contract's — an entry that
 * has been captured survives a crash, a restart and a sign-out.
 */
class PreviewStore(book: CaptureBook = MemoryBook()) {
    /* Seeded with a real date rather than the string "12 September · 09:00", which stopped being
       true the day after somebody typed it.
       The second one began ten minutes ago, computed from the clock for the same reason. It is here
       because the cancellation contract has three states and only two of them were ever reachable:
       every visit in this preview was days away, so `in-progress` — the one state that refuses a
       cancellation, because a booking screen cannot end an encounter happening in somebody's house —
       existed in the contract and on no screen. A refusal nobody can reach is a refusal nobody has
       tested. */
    val visits = mutableStateListOf(
        BookedVisit(services[0], "Lerato Molefe", "Home visit · Sandton",
            "scheduled", Scheduling.today().plusDays(5), "09:00", "Card"),
        underWayNow(services[7], "Nomsa Molefe", "Home visit · Rosebank")
    )
    /* Cancelled visits are kept rather than deleted, which is the cancellation contract's first
       limit: a visit that vanishes is one nobody can ask about afterwards — not the patient, not the
       nurse who was dispatched, and not whoever has to explain it. */
    val cancelled = mutableStateListOf<CancelledVisit>()
    /* What somebody typed on the home screen, so the catalogue it hands off to can apply it. */
    var careQuery by mutableStateOf("")
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
    /* Vetting is held here so a decision taken in the Control Tower is the same record the nurse
       workspace reads a screen later, rather than two lists that agree by luck. */
    val vetting = VettingStore()
    /* Capture is held here for the same reason vetting is: the readings the nurse takes on the kit
       screen are the readings the assessment fills in and the consultation record carries, rather
       than three lists that agree by luck. */
    val capture = CaptureStore(book)
    /* Which visits a clinician has already signed. It is the thing stale-write is a disagreement
       with, so the queue has to be able to ask something rather than assume. */
    val signedVisits = mutableStateListOf("TH-2045")
}
