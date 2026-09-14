package za.co.mythuso.model

import java.time.LocalDate

/* Gilbert's reasoning, without a screen attached to it.
 *
 * The sentences, trigger phrases, emergency words and voice policy are generated into
 * AssistantData.kt from packages/catalog/assistant.json. This is the arithmetic beside them, and it
 * is the same arithmetic as apps/web/src/lib/assistant.ts and apps/ios/MyThuso/Models/Assistant.swift:
 * normalise, look for an emergency word, then for the longest trigger phrase, and give every other
 * message the one honest answer. The same words get the same answer on all three platforms.
 *
 * The order is the safety property. Emergency words are checked before any question, and a match
 * ends the matching, so nothing found in the same message can lower it.
 *
 * No network, no model, no timer, and nothing written to the disk. The only Thinking the screen may
 * show is the recogniser finishing a transcript, which lives in ui/GilbertVoice.kt; the matcher
 * answers in the same frame and never pretends to deliberate.
 */

data class GilbertState(
    val id: String, val name: String, val visual: String, val meaning: String, val cue: String,
    val announcement: String, val shownWhen: String, val platforms: List<String>
)
data class GilbertSituationTemplate(
    val id: String, val name: String, val sentence: String, val figure: String?, val figureLabel: String?, val depth: Int
)
data class GilbertSituation(
    val id: String, val name: String, val sentence: String, val figure: String?, val figureLabel: String?, val depth: Int
)
data class GilbertQuestionGroup(val id: String, val heading: String, val lead: String?)
data class GilbertQuestion(val id: String, val asks: String, val group: String, val answer: String, val triggers: List<String>)
/** [condition] is the sos.json condition this group raises, or null; [name] is resolved at generation. */
data class GilbertEmergencyGroup(val id: String, val condition: String?, val name: String, val words: List<String>)
data class GilbertLine(val number: String, val name: String)
data class GilbertUnmatched(
    val state: String, val sentence: String, val detail: String, val ifUrgent: String,
    val lines: List<GilbertLine>, val sosLabel: String, val handoverLabel: String
)
data class GilbertEmergency(
    val state: String, val noticed: String, val headline: String, val lead: String,
    val lines: List<GilbertLine>, val notAnAmbulance: String, val sosLabel: String
)
data class GilbertHandoverField(val id: String, val label: String)
data class GilbertHandover(
    val state: String, val title: String, val lead: String, val notSent: String, val fields: List<GilbertHandoverField>,
    val channelTyped: String, val channelSpoken: String, val channelChosen: String,
    val nothingAsked: String, val nothingMatched: String, val matchedEmergency: String, val noFlags: String
)
data class GilbertConversation(
    val inputLabel: String, val inputHint: String, val sendLabel: String, val startAgainLabel: String,
    val youAsked: String, val youSaid: String, val logLabel: String, val refusalsHeading: String, val turnLimit: Int
)
data class GilbertVoicePolicy(
    val mode: String, val gesture: String, val maxListeningSeconds: Int, val recognitionLocales: List<String>,
    val recognition: String, val audioStored: Boolean, val transcriptLifetime: String,
    val correctionBeforeSend: Boolean, val wakeWord: Boolean,
    val howItWorks: String, val beforePermission: String, val askPermissionLabel: String, val notNowLabel: String,
    val unavailable: String, val refused: String, val failed: String, val talkLabel: String, val stopLabel: String,
    val captionsLabel: String, val correctLabel: String, val discardLabel: String
)
data class GilbertRefusal(val id: String, val statement: String, val why: String)

/** The six Pulse states, by the contract's ids. */
enum class Pulse(val id: String) {
    IDLE("idle"), LISTENING("listening"), THINKING("thinking"), GUIDING("guiding"), ESCALATE("escalate"), HANDOVER("handover");
    val spec: GilbertState get() = GilbertData.states.firstOrNull { it.id == id } ?: GilbertData.states.first()
    companion object { fun of(id: String, fallback: Pulse) = entries.firstOrNull { it.id == id } ?: fallback }
}

/** How a message arrived. Spoken always means the person saw the words and sent them. */
enum class GilbertChannel { TYPED, SPOKEN, CHOSEN }

data class SummaryRow(val label: String, val value: String)

sealed interface GilbertReply {
    data class Situation(val situation: GilbertSituation) : GilbertReply
    data object Identity : GilbertReply
    data object Voice : GilbertReply
    /** The emergency answer, with the groups that raised it — empty when the question was chosen. */
    data class Emergency(val groups: List<GilbertEmergencyGroup>) : GilbertReply
    data object Unmatched : GilbertReply
    data class Handover(val rows: List<SummaryRow>) : GilbertReply
}

data class GilbertTurn(
    val id: Int, val asked: String?, val channel: GilbertChannel?, val reply: GilbertReply,
    val matched: GilbertQuestion?, val groups: List<GilbertEmergencyGroup>
)

object Gilbert {
    fun situations(from: LocalDate = Scheduling.today()): List<GilbertSituation> {
        val first = Scheduling.offeredDays(from).firstOrNull()
        val values = mapOf(
            "firstDay" to (first?.let { Scheduling.longDate(it.date) } ?: GilbertData.fallbackFirstDay),
            "day" to (first?.dayNumber ?: ""),
            "month" to (first?.month ?: ""),
            "slot" to (SchedulingData.slots.firstOrNull() ?: ""),
            "laboratory" to (recordTypeById("laboratory")?.name ?: GilbertData.fallbackLaboratory),
            "expiryWarningDays" to EXPIRY_WARNING_DAYS.toString()
        )
        return GilbertData.situationTemplates.map { t ->
            GilbertSituation(t.id, t.name, fill(t.sentence, values), t.figure?.let { fill(it, values) }, t.figureLabel?.let { fill(it, values) }, t.depth)
        }
    }

    fun fill(text: String, values: Map<String, String>): String =
        values.entries.fold(text) { result, (key, value) -> result.replace("{$key}", value) }

    /* Lower case, apostrophes removed, everything outside a–z and 0–9 a space, padded so a phrase is
       matched as whole words. ASCII on purpose, as on the web and iOS: an accented letter becomes a
       space on all three platforms rather than a letter on two of them. */
    fun normalise(text: String): String {
        val out = StringBuilder()
        var lastWasSpace = true
        for (c in text.lowercase()) {
            if (c == '\'' || c == '’' || c == '‘' || c == '`') continue
            if (c in 'a'..'z' || c in '0'..'9') { out.append(c); lastWasSpace = false }
            else if (!lastWasSpace) { out.append(' '); lastWasSpace = true }
        }
        return " " + out.toString().trim() + " "
    }

    private fun contains(normalised: String, phrase: String) = normalised.contains(normalise(phrase))

    fun emergencyGroups(text: String): List<GilbertEmergencyGroup> {
        val said = normalise(text)
        return GilbertData.emergencyGroups.filter { group -> group.words.any { contains(said, it) } }
    }

    /** The longest trigger phrase wins; a tie goes to the question listed first. */
    fun question(text: String): GilbertQuestion? {
        val said = normalise(text)
        var best: GilbertQuestion? = null
        var length = -1
        for (question in GilbertData.questions) for (trigger in question.triggers) {
            if (!contains(said, trigger)) continue
            val size = normalise(trigger).length
            if (size > length) { best = question; length = size }
        }
        return best
    }

    fun reply(question: GilbertQuestion, from: LocalDate = Scheduling.today()): GilbertReply = when (question.answer) {
        "situation" -> situations(from).firstOrNull { it.id == question.id }?.let { GilbertReply.Situation(it) } ?: GilbertReply.Unmatched
        "identity" -> GilbertReply.Identity
        "voice" -> GilbertReply.Voice
        "emergency" -> GilbertReply.Emergency(emptyList())
        else -> GilbertReply.Unmatched
    }

    fun pulse(reply: GilbertReply): Pulse = when (reply) {
        is GilbertReply.Situation -> Pulse.GUIDING
        GilbertReply.Identity -> Pulse.of(GilbertData.identityState, Pulse.GUIDING)
        GilbertReply.Voice -> Pulse.of(GilbertData.voiceState, Pulse.GUIDING)
        is GilbertReply.Emergency -> Pulse.of(GilbertData.emergency.state, Pulse.ESCALATE)
        GilbertReply.Unmatched -> Pulse.of(GilbertData.unmatched.state, Pulse.GUIDING)
        is GilbertReply.Handover -> Pulse.of(GilbertData.handover.state, Pulse.HANDOVER)
    }

    fun depth(reply: GilbertReply): Int = when (reply) {
        is GilbertReply.Situation -> reply.situation.depth
        is GilbertReply.Emergency -> 3
        is GilbertReply.Handover -> 1
        else -> 0
    }

    fun opening(from: LocalDate = Scheduling.today()): List<GilbertTurn> =
        listOf(GilbertTurn(0, null, null, GilbertReply.Situation(situations(from).first()), null, emptyList()))

    private fun append(turns: List<GilbertTurn>, make: (Int) -> GilbertTurn): List<GilbertTurn> =
        (turns + make((turns.lastOrNull()?.id ?: 0) + 1)).takeLast(GilbertData.conversation.turnLimit)

    /** A message in a person's own words, typed or spoken and checked. */
    fun send(text: String, channel: GilbertChannel, turns: List<GilbertTurn>): List<GilbertTurn> {
        val words = text.trim()
        if (words.isEmpty()) return turns
        val groups = emergencyGroups(words)
        /* The emergency words first, and a match ends it. */
        if (groups.isNotEmpty()) return append(turns) { GilbertTurn(it, words, channel, GilbertReply.Emergency(groups), null, groups) }
        val question = question(words)
        if (question != null) {
            if (question.answer == "handover") return handingOver(words, channel, question, turns)
            return append(turns) { GilbertTurn(it, words, channel, reply(question), question, emptyList()) }
        }
        return append(turns) { GilbertTurn(it, words, channel, GilbertReply.Unmatched, null, emptyList()) }
    }

    /** One of the suggested questions, pressed. */
    fun choose(question: GilbertQuestion, turns: List<GilbertTurn>): List<GilbertTurn> {
        if (question.answer == "handover") return handingOver(question.asks, GilbertChannel.CHOSEN, question, turns)
        return append(turns) { GilbertTurn(it, question.asks, GilbertChannel.CHOSEN, reply(question), question, emptyList()) }
    }

    /** "Talk to a nurse", pressed from the unmatched answer: a summary of the last thing asked. */
    fun handOver(turns: List<GilbertTurn>): List<GilbertTurn> =
        append(turns) { GilbertTurn(it, null, null, GilbertReply.Handover(summary(turns)), null, emptyList()) }

    private fun handingOver(asked: String, channel: GilbertChannel, matched: GilbertQuestion, turns: List<GilbertTurn>): List<GilbertTurn> =
        append(turns) { GilbertTurn(it, asked, channel, GilbertReply.Handover(summary(turns)), matched, emptyList()) }

    /* What a nurse would be handed: the last thing asked before this, in the person's words, how it
       arrived, what it matched and which emergency words were in it. A request for a nurse is not
       itself what a nurse needs to read, so it is skipped when looking back. */
    fun summary(turns: List<GilbertTurn>): List<SummaryRow> {
        val h = GilbertData.handover
        fun label(id: String) = h.fields.firstOrNull { it.id == id }?.label ?: id
        val last = turns.lastOrNull { it.asked != null && it.matched?.answer != "handover" }
            ?: return listOf(SummaryRow(label("words"), h.nothingAsked))
        val channel = when (last.channel) {
            GilbertChannel.SPOKEN -> h.channelSpoken
            GilbertChannel.CHOSEN -> h.channelChosen
            else -> h.channelTyped
        }
        val matched = last.matched?.asks ?: if (last.groups.isEmpty()) h.nothingMatched else h.matchedEmergency
        val flags = if (last.groups.isEmpty()) h.noFlags else last.groups.joinToString("; ") { it.name }
        return listOf(
            SummaryRow(label("words"), last.asked!!),
            SummaryRow(label("channel"), channel),
            SummaryRow(label("matched"), matched),
            SummaryRow(label("flags"), flags)
        )
    }
}
