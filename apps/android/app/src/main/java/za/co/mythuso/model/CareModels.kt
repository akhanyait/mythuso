package za.co.mythuso.model

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

data class CareService(val id: String, val name: String, val detail: String, val price: Int)
val services = listOf(
    CareService("vitals", "Vitals & chronic check", "A little check-in. A healthier you.", 249),
    CareService("wound", "Wound care", "Expert care for your recovery.", 299),
    CareService("mother", "Mother & baby", "A caring hand for your new chapter.", 349),
    CareService("blood", "Blood tests", "Sample collection at home.", 299),
    CareService("injection", "Injection & vaccination", "On a valid prescription.", 249),
    CareService("planning", "Family planning", "Discreet care on your schedule.", 249),
    CareService("postop", "Post-operative check", "Support after your procedure.", 349),
    CareService("senior", "Elderly care", "A thoughtful one-hour visit.", 399),
    CareService("certificate", "Sick-note visit", "Assessment with doctor review.", 249)
)
data class DemoVisit(val service: CareService, val person: String, val time: String)
data class GuardianInvitation(val id: String, val name: String, val relationship: String, val scope: String, val expires: String, val status: String)
class PreviewStore {
    val visits = mutableStateListOf(DemoVisit(services[0], "Lerato Molefe", "12 September · 09:00"))
    val family = mutableStateListOf("Nomsa Molefe", "Thabo Molefe")
    val invitations = mutableStateListOf(
        GuardianInvitation("INV-0031", "Nomsa Molefe", "Mother", "Visit summaries only", "Until I revoke it", "Active"),
        GuardianInvitation("INV-0034", "Kagiso Molefe", "Brother", "Bookings and payments only", "31 December 2026", "Awaiting acceptance")
    )
    var reminders by mutableStateOf(true)
    var wearableSharing by mutableStateOf(false)
    var marketing by mutableStateOf(false)
    var locale by mutableStateOf(ThusoLocale.ENGLISH)
}
