package za.co.mythuso

import org.junit.Assert.assertEquals
import org.junit.Test
import za.co.mythuso.model.Gilbert
import za.co.mythuso.model.GilbertChannel
import za.co.mythuso.model.GilbertData

/* Gilbert's matcher on Android, held to the same fixtures the web runs in Playwright and iOS runs in its
 * debug self-test. The fixtures are in packages/catalog/assistant.json and generated into AssistantData.kt,
 * so a disagreement here is this platform's arithmetic, not a copy of the list that drifted.
 *
 * A JVM test, deliberately: the matcher is plain Kotlin, and whether it lowers an emergency should not
 * wait for an emulator. */
class GilbertFixturesTest {
    @Test fun stemsAgreeWithTheContract() {
        val disagreements = GilbertData.stemFixtures.filter { Gilbert.stems(it.says) != it.stems }
            .map { "\"${it.says}\" gave ${Gilbert.stems(it.says)}, the contract says ${it.stems}" }
        assertEquals(emptyList<String>(), disagreements)
    }

    @Test fun everyMessageGetsTheContractsOutcome() {
        val disagreements = GilbertData.messageFixtures.mapNotNull { fixture ->
            val turn = Gilbert.send(fixture.says, GilbertChannel.TYPED, Gilbert.opening(), null).last()
            val kind = Gilbert.outcome(turn)
            val question = if (kind.startsWith("answer")) turn.matched?.id else null
            val groups = turn.groups.map { it.id }
            if (kind == fixture.expect && question == fixture.question && groups == fixture.groups) null
            else "\"${fixture.says}\" gave $kind $question $groups"
        }
        assertEquals(emptyList<String>(), disagreements)
    }

    /* Reported, never a failure: ordinary sentences the emergency terms raise today, from falsePositives in
       packages/catalog/gilbert-emergency-terms.json. Tuning one out is a change to that file alone. */
    @Test fun falsePositivesAreReportedNotBlocking() {
        val raised = GilbertData.falsePositiveFixtures.filter { Gilbert.emergencyGroups(it).isNotEmpty() }
        println("Gilbert emergency terms v${GilbertData.emergencyTermsVersion} still raise ${raised.size} of ${GilbertData.falsePositiveFixtures.size} false-positive fixtures: $raised")
    }
}
