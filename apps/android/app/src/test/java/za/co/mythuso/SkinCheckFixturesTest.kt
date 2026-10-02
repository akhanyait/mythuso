package za.co.mythuso

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import za.co.mythuso.model.Gilbert
import za.co.mythuso.model.SkinCheck
import za.co.mythuso.model.SkinCheckData
import za.co.mythuso.model.SkinOutcome

/* The skin check on Android, held to the fixtures in packages/catalog/skin-check.json — generated into
 * SkinCheckData.kt, so a disagreement here is this platform's arithmetic and not a copy that drifted.
 * The web runs the same list in packages/gilbertone, including, since 2 October 2026, the two the
 * escalation ruleset decides (model/Escalation.kt).
 *
 * A JVM test, deliberately: whether a ticked sign reaches the emergency answer should not wait for an
 * emulator. */
class SkinCheckFixturesTest {
    @Test fun everyFixtureReachesTheContractsOutcome() {
        val disagreements = SkinCheckData.fixtures.mapNotNull { fixture ->
            val outcome = SkinCheck.outcome(fixture.answers, fixture.typed)
            val rules = when (outcome) {
                is SkinOutcome.Emergency -> outcome.rules
                is SkinOutcome.SisterToday -> outcome.rules.map { it.id }
                else -> emptyList()
            }
            val conditions = (outcome as? SkinOutcome.Information)?.conditions?.map { it.id } ?: emptyList()
            when {
                outcome.kind != fixture.expect -> "${fixture.name}: ${outcome.kind}, expected ${fixture.expect}"
                fixture.rules != null && fixture.rules != rules -> "${fixture.name}: rules $rules"
                fixture.conditions != null && fixture.conditions != conditions -> "${fixture.name}: conditions $conditions"
                else -> null
            }
        }
        assertEquals(emptyList<String>(), disagreements)
    }

    /* An emergency rule hands the conversation words its own matcher raises, so the answer she reads is
       the conversation's emergency answer and never one the check composed. */
    @Test fun anEmergencyRuleHandsOverWordsTheEmergencyTermsRaise() {
        SkinCheckData.rules.filter { it.outcome == "emergency" }.forEach { rule ->
            val first = rule.`when`.first()
            val outcome = SkinCheck.outcome(mapOf(first.question to listOf(first.anyOf.first())))
            assertTrue(rule.id, outcome is SkinOutcome.Emergency)
            assertTrue(rule.id, Gilbert.emergencyGroups((outcome as SkinOutcome.Emergency).says).isNotEmpty())
        }
    }

    /* A clip at the cap is taken; a millisecond over is refused, never cut; a clip of no length the
       player can tell is refused, never guessed. The notes carry its line after the photo's. */
    @Test fun aClipIsHeldToTheContractsLength() {
        val cap = SkinCheckData.Clip.maxSeconds * 1000L
        assertEquals(null, SkinCheck.clipProblem(cap))
        assertEquals(SkinCheckData.Clip.tooLong, SkinCheck.clipProblem(cap + 1))
        assertEquals(SkinCheckData.Clip.lengthUnknown, SkinCheck.clipProblem(null))
        assertEquals(SkinCheckData.Clip.lengthUnknown, SkinCheck.clipProblem(0))
        assertEquals(listOf(SkinCheckData.Summary.photoLine, SkinCheckData.Summary.clipLine), SkinCheck.summary(emptyMap(), "", photoHeld = true, clipHeld = true))
    }
}
