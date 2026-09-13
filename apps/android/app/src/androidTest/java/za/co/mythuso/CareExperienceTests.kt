package za.co.mythuso

import androidx.compose.runtime.*
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import za.co.mythuso.model.*
import za.co.mythuso.ui.*

@RunWith(AndroidJUnit4::class)
class CareExperienceTests {
    @get:Rule val rule = createComposeRule()

    @Test fun serviceSearchCombinesCategoryAndDescriptionAndCanReset() {
        allowForASlowEmulator()
        val store = PreviewStore().apply { careCategory = "Recovery"; careQuery = "prescription" }
        rule.setContent { ThusoTheme { ServicesScreen(store) } }
        rule.onNodeWithText("No matching services").assertExists()
        rule.onNodeWithText("Show all services").performScrollTo().performClick()
        rule.runOnIdle {
            assertEquals("", store.careQuery)
            assertEquals("All care", store.careCategory)
            assertEquals(listOf("injection"), discoverCare("prescription", "Tests & treatments").map { it.id })
            assertTrue(discoverCare("wound", "Family care").isEmpty())
        }
    }

    @Test fun closingBookingKeepsTheLocationDraftWithoutBooking() {
        allowForASlowEmulator()
        val store = PreviewStore()
        val initialVisits = store.visits.size
        var shown by mutableStateOf(true)
        rule.setContent { ThusoTheme {
            if (shown) BookingDialog(services.first(), store) { shown = false }
            else Button(onClick = { shown = true }) { Text("Resume booking") }
        } }
        rule.onNodeWithText("Continue").performClick()
        rule.onNodeWithText("Visit location").performTextReplacement("24 Garden Road, Randburg")
        rule.onNodeWithText("Back").performClick()
        rule.onNodeWithText("Save & close").performClick()
        rule.onNodeWithText("Resume booking").performClick()
        rule.onNodeWithText("Continue").performClick()
        rule.onNodeWithText("24 Garden Road, Randburg").assertExists()
        rule.runOnIdle { assertEquals(initialVisits, store.visits.size) }
    }

    @Test fun profileUsesTheCurrentVettingRecordAndNeverClaimsLiveVerification() {
        allowForASlowEmulator()
        val store = PreviewStore()
        val subject = store.vetting.byName("Sister Naledi Mokoena")!!
        rule.setContent { ThusoTheme { ClinicianProfileScreen(store, subject.id) } }
        rule.onAllNodesWithText(subject.reference).onFirst().assertExists()
        rule.onNodeWithText(summarise(subject).status.label).assertExists()
        rule.onNodeWithText("Languages, years of experience and a profile photograph have not been supplied for this clinician. No live verification has taken place.").performScrollTo().assertIsDisplayed()
    }

    @Test fun passportDocumentFilterKeepsItsActualRouteAndReviewState() {
        allowForASlowEmulator()
        var route = ""
        rule.setContent { ThusoTheme { ScreenColumn { PassportTimeline { route = it } } } }
        rule.onNodeWithText("Documents").performClick()
        rule.onNodeWithText("Home visit readings").assertDoesNotExist()
        rule.onAllNodesWithText("Doctor reviewed").assertCountEquals(PassportData.documents.count { it.reviewed })
        rule.onNodeWithText("Laboratory results").performScrollTo().performClick()
        rule.runOnIdle { assertEquals("Laboratory order LAB-0023", route) }
    }
}
