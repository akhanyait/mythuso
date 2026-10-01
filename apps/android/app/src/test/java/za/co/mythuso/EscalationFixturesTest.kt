package za.co.mythuso

import org.junit.Assert.assertEquals
import org.junit.Test
import za.co.mythuso.model.Escalation
import za.co.mythuso.model.EscalationData

/* The escalation ruleset on Android, held to fixtures.escalation in packages/catalog/assistant.json —
 * the list the web replays against escalation.ts itself (packages/gilbertone/src/escalation-fixtures.test.ts)
 * and iOS in its debug self-test. The rules are generated into EscalationData.kt from escalation.ts, so a
 * disagreement here is this platform's regular-expression engine or fold reading a pattern differently
 * from JavaScript's, never a copy of the rules that drifted.
 *
 * A JVM test, deliberately: whether "my throat is swelling" raises the ambulance numbers on this phone
 * should not wait for an emulator. */
class EscalationFixturesTest {
    @Test fun everyPatternCompilesInJava() {
        val unreadable = EscalationData.rules.flatMap { rule ->
            rule.patterns.mapNotNull { p -> runCatching { Regex(p.source) }.exceptionOrNull()?.let { "${rule.id}: ${p.source}: ${it.message}" } }
        }
        assertEquals(emptyList<String>(), unreadable)
    }

    @Test fun everyFixtureFindsTheContractsRule() {
        val disagreements = EscalationData.fixtures.mapNotNull { fixture ->
            val found = Escalation.check(fixture.says)?.rule?.id
            if (found == fixture.rule) null else "\"${fixture.says}\" found $found, the contract says ${fixture.rule}"
        }
        assertEquals(emptyList<String>(), disagreements)
    }

    /* An urgent rule is a rule, not an emergency: the conversation answers only the emergency severity. */
    @Test fun anUrgentRuleIsNotAnEmergency() {
        val urgent = EscalationData.fixtures.filter { f -> EscalationData.rules.any { it.id == f.rule && it.severity != "emergency" } }
        assertEquals(true, urgent.isNotEmpty())
        assertEquals(emptyList<String>(), urgent.filter { Escalation.emergency(it.says) != null }.map { it.says })
    }
}
