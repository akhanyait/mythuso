package za.co.mythuso.model

/* Show GilbertOne a rash — the shapes and the arithmetic, without a screen.
 *
 * The questions, the rules, the sentences, the knowledge entries the outcomes show and the shared
 * fixtures are SkinCheckData.kt, generated from packages/catalog/skin-check.json and the knowledge base.
 * This file is the arithmetic beside them, the same as packages/gilbertone/src/skin-check.ts and
 * Models/SkinCheck.swift: typed words to the emergency matcher first, the emergency rules next, then
 * the questions every outcome needs, then the rules for a sign to be seen today, and general information
 * last. A rule holds when each of its conditions does — the answer to that question includes one of the
 * options it names — and general information lists the entries the chosen options name, most-named
 * first, a tie going to the lower id, at most maxShown of them.
 *
 * It never sees the photo, names no rash, sets no priority and composes no sentence. Its emergency
 * matcher is the conversation's own term list; the escalation ruleset the web adds in front of it is
 * not carried on this phone yet, so the contract's web-only fixtures are not generated here. A JVM test
 * (SkinCheckFixturesTest) runs the rest. */

data class SkinOption(val id: String, val label: String, val oftenSeenIn: List<String>, val checkFirst: List<String>)

/** kind is "chips" (one answer), "multi" (any number) or "text"; exclusive clears the others when pressed. */
data class SkinQuestion(val id: String, val ask: String, val kind: String, val exclusive: String?, val options: List<SkinOption>)

data class SkinCondition(val question: String, val anyOf: List<String>)

/** outcome is "emergency" or "sister-today". */
data class SkinRule(val id: String, val outcome: String, val `when`: List<SkinCondition>, val says: String, val drawsOn: List<String>, val keptBecause: String?)

data class SkinConditionEntry(val id: String, val title: String, val looks: List<String>, val `when`: String, val source: String, val reviewedBy: String?)

data class SkinFirstAidEntry(val id: String, val title: String, val steps: List<String>, val warnings: List<String>, val whenToCall: String, val source: String, val reviewedBy: String?)

data class SkinFixture(val name: String, val answers: Map<String, List<String>>, val typed: String, val expect: String, val rules: List<String>?, val conditions: List<String>?)

sealed interface SkinOutcome {
    val kind: String

    /** The conversation answers it: [says] is handed over as the words that were asked. */
    data class Emergency(val says: String, val rules: List<String>) : SkinOutcome { override val kind = "emergency" }
    data class Incomplete(val missing: List<String>) : SkinOutcome { override val kind = "incomplete" }
    data class SisterToday(val rules: List<SkinCheck.Raised>) : SkinOutcome { override val kind = "sister-today" }
    data class Information(val conditions: List<SkinConditionEntry>, val checkFirst: List<SkinFirstAidEntry>, val selfCare: List<SkinFirstAidEntry>) : SkinOutcome {
        override val kind = "general-information"
    }
}

object SkinCheck {
    data class Guidance(val id: String, val title: String, val line: String, val source: String, val reviewedBy: String?)
    data class Raised(val id: String, val says: String, val guidance: List<Guidance>)

    fun fill(template: String, values: Map<String, String>): String =
        values.entries.fold(template) { text, (key, value) -> text.replace("{$key}", value) }

    fun question(id: String): SkinQuestion? = SkinCheckData.questions.firstOrNull { it.id == id }
    fun label(questionId: String, optionId: String): String =
        question(questionId)?.options?.firstOrNull { it.id == optionId }?.label ?: optionId
    private fun condition(id: String) = SkinCheckData.conditions.firstOrNull { it.id == id }
    private fun firstAid(id: String) = SkinCheckData.firstAid.firstOrNull { it.id == id }

    /** Typed words are an emergency when the conversation's own emergency terms raise them. */
    fun emergency(typed: String): Boolean = typed.isNotBlank() && Gilbert.emergencyGroups(typed.trim()).isNotEmpty()

    private fun holds(rule: SkinRule, answers: Map<String, List<String>>) =
        rule.`when`.all { c -> (answers[c.question] ?: emptyList()).any { it in c.anyOf } }

    private fun raised(rule: SkinRule) = Raised(rule.id, rule.says, rule.drawsOn.mapNotNull { id ->
        firstAid(id)?.let { Guidance(id, it.title, it.whenToCall, it.source, it.reviewedBy) }
            ?: condition(id)?.let { Guidance(id, it.title, it.`when`, it.source, it.reviewedBy) }
    })

    fun outcome(answers: Map<String, List<String>>, typed: String = ""): SkinOutcome {
        if (emergency(typed)) return SkinOutcome.Emergency(typed.trim(), emptyList())
        SkinCheckData.rules.firstOrNull { it.outcome == "emergency" && holds(it, answers) }?.let { rule ->
            /* The option's own label is handed over — the words the emergency terms raise. */
            val first = rule.`when`.first()
            return SkinOutcome.Emergency(label(first.question, first.anyOf.first()), listOf(rule.id))
        }
        val missing = SkinCheckData.required.filter { (answers[it] ?: emptyList()).isEmpty() }
        if (missing.isNotEmpty()) return SkinOutcome.Incomplete(missing)
        val today = SkinCheckData.rules.filter { it.outcome == "sister-today" && holds(it, answers) }
        if (today.isNotEmpty()) return SkinOutcome.SisterToday(today.map(::raised))

        val score = linkedMapOf<String, Int>()
        val chosen = SkinCheckData.questions.flatMap { q -> q.options.filter { it.id in (answers[q.id] ?: emptyList()) } }
        chosen.forEach { option -> option.oftenSeenIn.forEach { score[it] = (score[it] ?: 0) + 1 } }
        val shown = score.entries.sortedWith(compareByDescending<Map.Entry<String, Int>> { it.value }.thenBy { it.key })
            .take(SkinCheckData.Information.maxShown)
            .mapNotNull { condition(it.key) }
        val checkFirst = chosen.flatMap { it.checkFirst }.distinct()
        val care = (shown.mapNotNull { SkinCheckData.selfCareForCondition[it.id] } + SkinCheckData.selfCareAlways)
            .distinct().filter { it !in checkFirst }
        return SkinOutcome.Information(shown, checkFirst.mapNotNull(::firstAid), care.mapNotNull(::firstAid))
    }

    /** A chips question holds one answer and a second press clears it; a multi question toggles, and its
     *  exclusive option clears the others and is cleared by them. */
    fun press(answers: Map<String, List<String>>, questionId: String, optionId: String): Map<String, List<String>> {
        val question = question(questionId) ?: return answers
        val now = answers[questionId] ?: emptyList()
        val next = when {
            question.kind == "chips" -> if (optionId in now) emptyList() else listOf(optionId)
            optionId in now -> now - optionId
            optionId == question.exclusive -> listOf(optionId)
            else -> now.filter { it != question.exclusive } + optionId
        }
        return answers + (questionId to next)
    }

    /** The notes for the sister: one line per answered question, and the photo line — never the photo. */
    fun summary(answers: Map<String, List<String>>, typed: String, photoHeld: Boolean): List<String> {
        val lines = SkinCheckData.questions.mapNotNull { q ->
            val value = if (q.kind == "text") typed.trim() else (answers[q.id] ?: emptyList()).joinToString(", ") { label(q.id, it) }
            if (value.isEmpty()) null else fill(SkinCheckData.Summary.line, mapOf("question" to q.ask, "answer" to value))
        }
        return if (photoHeld) lines + SkinCheckData.Summary.photoLine else lines
    }

    val reviewSentence: String
        get() = SkinCheckData.Review.reviewedBy?.let { fill(SkinCheckData.Review.reviewed, mapOf("reviewedBy" to it)) }
            ?: SkinCheckData.Review.unreviewed

    fun entryNote(source: String, reviewedBy: String?): String {
        val review = reviewedBy?.let { fill(SkinCheckData.Knowledge.reviewed, mapOf("reviewedBy" to it)) } ?: SkinCheckData.Knowledge.unreviewed
        return "${fill(SkinCheckData.Knowledge.label, mapOf("authority" to source))} $review"
    }
}
