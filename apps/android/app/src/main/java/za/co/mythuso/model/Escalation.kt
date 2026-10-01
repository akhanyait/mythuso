package za.co.mythuso.model

import java.text.Normalizer

/* GilbertOne's escalation ruleset on the phone — the arithmetic beside the generated EscalationData.kt.
 *
 * The rules are packages/gilbertone/src/escalation.ts, a locked Tier 1 artefact, written into
 * EscalationData.kt by scripts/emit-escalation.mjs: the same rules in the same order, each pattern
 * translated into the part of the regular-expression language Java reads exactly as JavaScript does.
 * This file is checkEscalation() and fold.ts's foldCharacters(), and nothing else: fold the message,
 * try the rules in order, and the first pattern that matches decides. Models/Escalation.swift is the
 * same on iOS; EscalationFixturesTest holds this to fixtures.escalation in
 * packages/catalog/assistant.json, the list the web replays in
 * packages/gilbertone/src/escalation-fixtures.test.ts.
 *
 * Why the phone has it at all (2 October 2026): until then Android asked only the emergency terms, so
 * "I don’t want to live anymore", "my throat is swelling" and "sudden weakness on one side" — which no
 * term names — raised the ambulance numbers on the web and nothing here. Gilbert.send() now asks this
 * after the terms and before any question, the way the web's send() does.
 *
 * What it will not do. It names no condition and composes no sentence: a match is answered with the
 * conversation's one emergency answer, as on the web. It never lowers anything — an urgent rule is not
 * an emergency and is not answered as one, and no match is not a reassurance. It reads no network, no
 * model and nothing stored, and keeps nothing it read.
 *
 * Two readings are JavaScript's on purpose. Java reads an emoji as one character and JavaScript as
 * two, so each half of such a character is read as U+FFFD — a character no pattern names — and a
 * `[^.]{0,24}` window holds exactly as much here as in a browser. And kotlin.text.Regex's
 * case-insensitivity is Unicode's, which can differ from JavaScript's only for characters the fold has
 * already turned into others (the long s, the Kelvin sign); the matcher is only ever handed folded text.
 */

data class EscalationPattern(val source: String, val ignoresCase: Boolean)

/** A rule without its approved sentence: a match is answered with the conversation's own emergency
 *  answer, as the web's panel answers it, so the sentence is the service's alone. */
data class EscalationRule(val id: String, val severity: String, val action: String, val patterns: List<EscalationPattern>)

data class EscalationFixture(val says: String, val rule: String?)

object Escalation {
    /** [matched] is the slice of the folded text that matched, as checkEscalation's matchedPattern. */
    data class Match(val rule: EscalationRule, val matched: String)

    /* Compiled once. A pattern that does not compile throws here, which is louder than a rule silently
       skipped; EscalationFixturesTest compiles every one before a build is handed to anybody. */
    private val compiled: List<Pair<EscalationRule, List<Regex>>> by lazy {
        EscalationData.rules.map { rule ->
            rule to rule.patterns.map { Regex(it.source, if (it.ignoresCase) setOf(RegexOption.IGNORE_CASE) else emptySet()) }
        }
    }

    private val invisible = EscalationData.invisible.toSet()
    private val apostrophes = EscalationData.apostrophes.toSet()
    private val quotes = EscalationData.quotes.toSet()

    /* JavaScript's \s, which fold.ts collapses: the ASCII spaces and controls, and the Unicode spaces. */
    private fun isSpace(c: Char): Boolean = c in '\u0009'..'\u000D' || c == ' ' || c == '\u00A0' || c == '\u1680' ||
        c in '\u2000'..'\u200A' || c == '\u2028' || c == '\u2029' || c == '\u202F' || c == '\u205F' || c == '\u3000' || c == '\uFEFF'

    /** fold.ts's foldCharacters: compatibility form, the invisible characters removed, every apostrophe
     *  straightened, every curly double quote straightened, lower case, whitespace collapsed and trimmed.
     *  The full stop, the slash and the decimal point stay, because the patterns read them. */
    fun fold(text: String): String {
        val compatible = Normalizer.normalize(text, Normalizer.Form.NFKC)
        val marked = buildString {
            for (c in compatible) {
                val mark = c.toString()
                when (mark) {
                    in invisible -> {}
                    in apostrophes -> append('\'')
                    in quotes -> append('"')
                    else -> append(c)
                }
            }
        }
        return buildString {
            var pending = false
            for (c in marked.lowercase()) {
                if (isSpace(c)) { pending = isNotEmpty(); continue }
                if (pending) { append(' '); pending = false }
                append(c)
            }
        }
    }

    /** checkEscalation(foldCharacters(transcript), history): the whole session, the transcript first,
     *  rules in order, first match wins. Null when nothing matches — which decides nothing. */
    fun check(transcript: String, history: List<String> = emptyList()): Match? {
        val haystack = (listOf(transcript) + history).joinToString("\n") { fold(it) }
        /* Each half of a character outside the Basic Multilingual Plane is read as U+FFFD, so a window
           counts characters the way JavaScript does. */
        val read = buildString { for (c in haystack) append(if (c.isSurrogate()) '\uFFFD' else c) }
        for ((rule, patterns) in compiled) {
            for (pattern in patterns) {
                pattern.find(read)?.let { return Match(rule, it.value) }
            }
        }
        return null
    }

    /** An emergency the ruleset found, or null — an urgent rule is not one. */
    fun emergency(text: String): Match? = check(text)?.takeIf { it.rule.severity == "emergency" }
}
