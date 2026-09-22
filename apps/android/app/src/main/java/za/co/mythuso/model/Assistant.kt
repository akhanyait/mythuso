package za.co.mythuso.model

import java.text.Normalizer

/* GilbertOne's reasoning, without a screen attached to it.
 *
 * The sentences, trigger phrases, emergency words, the matcher's data and the shared fixtures are
 * generated into AssistantData.kt from packages/catalog/assistant.json. This is the arithmetic beside
 * them, and it is the same arithmetic as apps/web/src/lib/assistant.ts and
 * apps/ios/MyThuso/Models/Assistant.swift: fold to plain letters, reduce to stems, look for an emergency
 * term with small gaps, then for the longest trigger, and say so when words are left unread. Since the
 * founder's audience decision of 19 September 2026 each question carries the audiences it is offered
 * to, and the matcher keeps to the audience it is handed — the emergency terms are matched before any
 * of that, so scoping a question out can never scope an emergency out.
 *
 * The order is the safety property. Emergency words are checked before any question, and a match ends
 * the matching. A question may answer on its own only if every word is its own trigger or filler: the
 * Wave 1 review showed that a missed word followed by a calm answer is the miss presented as
 * reassurance. app/src/test/.../GilbertFixturesTest.kt runs the contract's fixtures against this file.
 *
 * No network, no model, no timer, and nothing written to the disk. The only Thinking the screen may
 * show is the recogniser finishing a transcript, which lives in ui/GilbertVoice.kt; the matcher answers
 * in the same frame and never pretends to deliberate.
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
data class GilbertQuestion(val id: String, val asks: String, val group: String, val answer: String, val triggers: List<String>, val audiences: List<String>)
/** [condition] is the sos.json condition this group raises, or null; [name] is resolved at generation. */
data class GilbertEmergencyGroup(val id: String, val condition: String?, val name: String, val words: List<String>)
data class GilbertLine(val number: String, val name: String)
/** The unmatched answer, and the unread answer that follows a question with words left over. */
data class GilbertUnmatched(
    val state: String, val sentence: String, val detail: String, val ifUrgent: String,
    val lines: List<GilbertLine>, val sosLabel: String, val handoverLabel: String
)
data class GilbertEmergency(
    val state: String, val noticed: String, val headline: String, val lead: String,
    val lines: List<GilbertLine>, val notAnAmbulance: String, val sosLabel: String
)
/** The answer drawn around a sentence a language model wrote: the heading it is shown under, the
 *  disclosure it may never be shown without, and the emergency numbers beside it, so a screen cannot
 *  show the words without them. The words are the service's; these sentences are the contract's and
 *  never move. */
data class GilbertService(
    val state: String, val heading: String, val disclosure: String, val ifUrgent: String,
    val lines: List<GilbertLine>, val sosLabel: String, val handoverLabel: String
)
data class GilbertHandoverField(val id: String, val label: String)
/** An urgency code a handover carries, most urgent first in the contract's order. */
data class GilbertUrgency(val id: String, val name: String, val why: String)
/** Something a handover deliberately leaves behind, said to the person before they press send. */
data class GilbertNotCarried(val id: String, val sentence: String)
data class GilbertHandover(
    val state: String, val title: String, val lead: String, val notSent: String, val fields: List<GilbertHandoverField>,
    val channelTyped: String, val channelSpoken: String, val channelChosen: String,
    val nothingAsked: String, val nothingMatched: String, val matchedEmergency: String,
    val urgency: List<GilbertUrgency>, val neverLowered: String,
    val notCarriedHeading: String, val notCarried: List<GilbertNotCarried>,
    val sendLabel: String, val sentTitle: String, val sent: String, val sentReference: String,
    val alreadySent: String, val stillUrgent: String, val lines: List<GilbertLine>
)
data class GilbertConversation(
    val inputLabel: String, val inputHint: String, val sendLabel: String, val startAgainLabel: String,
    val youAsked: String, val youSaid: String, val logLabel: String, val refusalsHeading: String,
    val keyboardNote: String, val turnLimit: Int
)
data class GilbertVoicePolicy(
    val mode: String, val gesture: String, val maxListeningSeconds: Int, val recognitionLocales: List<String>,
    val recognition: String, val audioStored: Boolean, val transcriptLifetime: String,
    val correctionBeforeSend: Boolean, val wakeWord: Boolean,
    val howItWorks: String, val beforePermission: String, val askPermissionLabel: String, val notNowLabel: String,
    val unavailable: String, val refused: String, val failed: String, val interrupted: String,
    val talkLabel: String, val stopLabel: String, val captionsLabel: String, val correctLabel: String, val discardLabel: String,
    /** voice.nativeSpeech.enabled: read before GilbertSpeaker reaches for TextToSpeech at all. */
    val nativeSpeechEnabled: Boolean,
    /** voice.voicePreference.order, applied to whatever locales this phone's engine actually has, exactly as it is on the web. */
    val speechVoiceOrder: List<String>,
    val muteLabel: String, val unmuteLabel: String, val speechUnavailable: String
)
data class GilbertRefusal(val id: String, val statement: String, val why: String)
data class GilbertStemFixture(val says: String, val stems: List<String>)
data class GilbertMessageFixture(val says: String, val expect: String, val question: String?, val groups: List<String>, val audience: String?)

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
    /** A sentence the service wrote for a message GilbertOne could not place, drawn with GilbertData.service's
     *  heading, disclosure and numbers. It only ever replaces an unmatched answer, and only when the service
     *  named a model tier as its source. */
    data class Service(val text: String) : GilbertReply
    /** The structured summary and its urgency code. Never the person's words, never which emergency words. */
    data class Handover(val rows: List<SummaryRow>, val urgency: String) : GilbertReply
}

/** [unread] is true when the answer came with words GilbertOne could not read; the unread answer follows it. */
data class GilbertTurn(
    val id: Int, val asked: String?, val channel: GilbertChannel?, val reply: GilbertReply,
    val matched: GilbertQuestion?, val groups: List<GilbertEmergencyGroup>, val unread: Boolean = false
)

object Gilbert {
    /* The visit is the one the home card shows — the store's first upcoming visit, written by the same
       shortWhenText — so GilbertOne and the home cannot name two days for one visit. With nothing booked, or
       a nurse still being found, it says scheduling.json's own words for that. */
    fun situations(visit: BookedVisit? = null): List<GilbertSituation> {
        val values = mutableMapOf(
            "laboratory" to (recordTypeById("laboratory")?.name ?: GilbertData.fallbackLaboratory),
            "expiryWarningDays" to EXPIRY_WARNING_DAYS.toString()
        )
        return GilbertData.situationTemplates.map { t ->
            if (t.id == "visit" && (visit == null || !visit.isScheduled)) {
                val (name, sentence) = if (visit == null) GilbertData.visitNone else GilbertData.visitPending
                GilbertSituation(t.id, name, sentence, null, null, t.depth)
            } else {
                if (t.id == "visit" && visit != null) values["visitWhen"] = visit.shortWhenText
                GilbertSituation(t.id, t.name, fill(t.sentence, values), t.figure?.let { fill(it, values) }, t.figureLabel?.let { fill(it, values) }, t.depth)
            }
        }
    }

    fun fill(text: String, values: Map<String, String>): String =
        values.entries.fold(text) { result, (key, value) -> result.replace("{$key}", value) }

    // Words into stems. The same steps in the same order as the web's and iOS's.

    private val marks = Regex("\\p{M}+")
    private val outside = Regex("[^a-z0-9]+")

    fun tokens(text: String): List<String> {
        var folded = text.lowercase()
        for ((from, to) in GilbertData.foldings) folded = folded.replace(from, to)
        folded = marks.replace(Normalizer.normalize(folded, Normalizer.Form.NFD), "")
        for (mark in GilbertData.apostrophes) folded = folded.replace(mark, "")
        return outside.replace(folded, " ").trim().split(" ").filter { it.isNotEmpty() }
    }

    private fun undouble(word: String): String =
        if (word.length >= 3 && word[word.length - 1] == word[word.length - 2] && word.last() !in "aeiouslz") word.dropLast(1) else word

    fun stem(word: String): String {
        var t = GilbertData.irregular[word] ?: word
        if (t.length >= 5 && t.endsWith("ing")) t = undouble(t.dropLast(3))
        else if (t.length >= 4 && (t.endsWith("ied") || t.endsWith("ies"))) t = t.dropLast(3) + "y"
        else if (t.length >= 4 && t.endsWith("ed") && !t.endsWith("eed")) t = undouble(t.dropLast(2))
        else if (t.length >= 4 && listOf("ses", "xes", "zes", "ches", "shes").any { t.endsWith(it) }) t = t.dropLast(2)
        else if (t.length >= 4 && t.endsWith("s") && !t.endsWith("ss") && !t.endsWith("us") && !t.endsWith("is")) t = t.dropLast(1)
        if (t.length >= 4 && t.endsWith("e")) t = t.dropLast(1)
        return t
    }

    fun stems(text: String): List<String> = tokens(text).map(::stem)

    /** A term's words in order, each within [gap] words of the one before; greedy from each start. */
    private fun hasSequence(said: List<String>, term: List<String>, gap: Int): Boolean {
        if (term.isEmpty()) return false
        for (start in said.indices) {
            if (said[start] != term[0]) continue
            var at = start
            var whole = true
            for (k in 1 until term.size) {
                var found = -1
                var j = at + 1
                while (j < said.size && j <= at + 1 + gap) { if (said[j] == term[k]) { found = j; break }; j++ }
                if (found < 0) { whole = false; break }
                at = found
            }
            if (whole) return true
        }
        return false
    }

    fun emergencyGroups(text: String): List<GilbertEmergencyGroup> {
        val said = stems(text)
        return GilbertData.emergencyGroups.filter { group -> group.words.any { hasSequence(said, stems(it), GilbertData.maxGap) } }
    }

    /** The longest trigger (in words, adjacent) wins; a tie goes to the question listed first.
     *  Only the questions the audience is offered are in the running, and the emergency words are matched
     *  before any of this in send(), so scoping a question out can never scope an emergency out. */
    fun question(text: String, audience: String = "patient"): GilbertQuestion? {
        val said = stems(text)
        var best: GilbertQuestion? = null
        var length = 0
        for (question in GilbertData.questions) {
            if (question.audiences.none { it == audience }) continue
            for (trigger in question.triggers) {
                val term = stems(trigger)
                if (term.size > length && hasSequence(said, term, 0)) { best = question; length = term.size }
            }
        }
        return best
    }

    /** A word that is neither one of the question's own trigger words nor filler is a word GilbertOne did not read. */
    fun leavesUnread(text: String, question: GilbertQuestion): Boolean {
        val covered = GilbertData.filler.map(::stem).toSet() + question.triggers.flatMap(::stems)
        return stems(text).any { it !in covered }
    }

    fun reply(question: GilbertQuestion, turns: List<GilbertTurn>, visit: BookedVisit?): GilbertReply = when (question.answer) {
        "situation" -> situations(visit).firstOrNull { it.id == question.id }?.let { GilbertReply.Situation(it) } ?: GilbertReply.Unmatched
        "identity" -> GilbertReply.Identity
        "voice" -> GilbertReply.Voice
        "emergency" -> GilbertReply.Emergency(emptyList())
        "handover" -> GilbertReply.Handover(summary(turns), urgency(turns))
        else -> GilbertReply.Unmatched
    }

    fun pulse(reply: GilbertReply): Pulse = when (reply) {
        is GilbertReply.Situation -> Pulse.GUIDING
        GilbertReply.Identity -> Pulse.of(GilbertData.identityState, Pulse.GUIDING)
        GilbertReply.Voice -> Pulse.of(GilbertData.voiceState, Pulse.GUIDING)
        is GilbertReply.Emergency -> Pulse.of(GilbertData.emergency.state, Pulse.ESCALATE)
        GilbertReply.Unmatched -> Pulse.of(GilbertData.unmatched.state, Pulse.GUIDING)
        is GilbertReply.Service -> Pulse.of(GilbertData.service.state, Pulse.GUIDING)
        is GilbertReply.Handover -> Pulse.of(GilbertData.handover.state, Pulse.HANDOVER)
    }

    fun depth(reply: GilbertReply): Int = when (reply) {
        is GilbertReply.Situation -> reply.situation.depth
        is GilbertReply.Emergency -> 3
        is GilbertReply.Handover -> 1
        else -> 0
    }

    fun opening(): List<GilbertTurn> =
        listOf(GilbertTurn(0, null, null, GilbertReply.Situation(situations().first()), null, emptyList()))

    private fun append(turns: List<GilbertTurn>, make: (Int) -> GilbertTurn): List<GilbertTurn> =
        (turns + make((turns.lastOrNull()?.id ?: 0) + 1)).takeLast(GilbertData.conversation.turnLimit)

    /** A message in a person's own words, typed or spoken and checked, for the audience the conversation serves. */
    fun send(text: String, channel: GilbertChannel, turns: List<GilbertTurn>, visit: BookedVisit?, audience: String = "patient"): List<GilbertTurn> {
        val words = text.trim()
        if (words.isEmpty()) return turns
        val groups = emergencyGroups(words)
        /* The emergency words first, and a match ends it. */
        if (groups.isNotEmpty()) return append(turns) { GilbertTurn(it, words, channel, GilbertReply.Emergency(groups), null, groups) }
        val question = question(words, audience)
            ?: return append(turns) { GilbertTurn(it, words, channel, GilbertReply.Unmatched, null, emptyList()) }
        val unread = question.answer != "emergency" && leavesUnread(words, question)
        /* A claim about everything is not made to a message GilbertOne did not read all of. */
        if (unread && question.id in GilbertData.neverWithUnread) {
            return append(turns) { GilbertTurn(it, words, channel, GilbertReply.Unmatched, null, emptyList()) }
        }
        val answer = reply(question, turns, visit)
        return append(turns) { GilbertTurn(it, words, channel, answer, question, emptyList(), unread) }
    }

    /** One of the suggested questions, pressed. Its own words, so nothing is unread. */
    fun choose(question: GilbertQuestion, turns: List<GilbertTurn>, visit: BookedVisit?): List<GilbertTurn> {
        val answer = reply(question, turns, visit)
        return append(turns) { GilbertTurn(it, question.asks, GilbertChannel.CHOSEN, answer, question, emptyList()) }
    }

    /** "Talk to a nurse", pressed from the unmatched or unread answer: a summary of the last thing asked.
     *  [raised] is the screen's memory that an emergency was answered in a turn the turn limit has since
     *  dropped, so a long conversation cannot lower its own urgency by scrolling out of the window. */
    fun handOver(turns: List<GilbertTurn>, raised: Boolean = false): List<GilbertTurn> =
        append(turns) { GilbertTurn(it, null, null, GilbertReply.Handover(summary(turns, raised), urgency(turns, raised)), null, emptyList()) }

    /* Two codes and neither is calm. An emergency answer anywhere in the conversation is `emergency`;
       everything else is `not-assessed`, because no emergency word is not a finding that something is
       not urgent. A later handover may raise it and nothing GilbertOne says afterwards lowers it. */
    fun urgency(turns: List<GilbertTurn>, raised: Boolean = false): String {
        val codes = GilbertData.handover.urgency.map { it.id }
        val emergency = codes.firstOrNull { it == "emergency" } ?: codes.first()
        val notAssessed = codes.firstOrNull { it == "not-assessed" } ?: codes.last()
        return if (raised || turns.any { it.reply is GilbertReply.Emergency }) emergency else notAssessed
    }

    /* What a nurse queue would be handed: how the last thing was asked, which approved question it
       matched, and the urgency. Not the words: conversation.handover@1 refuses the transcript, and a
       nurse needs to know why she is calling rather than to read somebody's messages. Not which
       emergency words fired either: a group can be a crisis, and a crisis mention joined to a person is
       a record of it. A request for a nurse is not itself what a nurse needs, so it is skipped. */
    fun summary(turns: List<GilbertTurn>, raised: Boolean = false): List<SummaryRow> {
        val h = GilbertData.handover
        fun label(id: String) = h.fields.firstOrNull { it.id == id }?.label ?: id
        val code = urgency(turns, raised)
        val urgencyRow = SummaryRow(label("urgency"), h.urgency.firstOrNull { it.id == code }?.name ?: code)
        val last = turns.lastOrNull { it.asked != null && it.matched?.answer != "handover" }
            ?: return listOf(SummaryRow(label("channel"), h.nothingAsked), SummaryRow(label("matched"), h.nothingMatched), urgencyRow)
        val channel = when (last.channel) {
            GilbertChannel.SPOKEN -> h.channelSpoken
            GilbertChannel.CHOSEN -> h.channelChosen
            else -> h.channelTyped
        }
        val matched = last.matched?.asks ?: if (last.reply is GilbertReply.Emergency) h.matchedEmergency else h.nothingMatched
        return listOf(SummaryRow(label("channel"), channel), SummaryRow(label("matched"), matched), urgencyRow)
    }

    /** How a turn came out, in the words the shared fixtures use. */
    fun outcome(turn: GilbertTurn): String = when {
        turn.reply is GilbertReply.Emergency -> "emergency"
        turn.reply == GilbertReply.Unmatched && turn.matched == null -> "unmatched"
        turn.unread -> "answer-and-unread"
        else -> "answer"
    }
}
