import Foundation

/* GilbertOne's reasoning, without a screen attached to it.

   The sentences, trigger phrases, emergency words, the matcher's data and the shared fixtures are
   generated into AssistantData.swift from packages/catalog/assistant.json. This file is the arithmetic
   beside that data, and it is the same arithmetic as apps/web/src/lib/assistant.ts and
   model/Assistant.kt: fold a message to plain letters, reduce it to stems, look for an emergency term
   with small gaps, then for the longest trigger, and give every word GilbertOne did not read an honest
   sentence with the ambulance numbers beside it.

   The order is the safety property. Emergency words are checked before any question, and a match
   ends the matching: "when is my nurse coming, I have chest pains" is an emergency, not a visit date.
   And a question may answer on its own only if every word of the message is its own trigger or ordinary
   filler — the Wave 1 review showed that a missed word followed by a calm answer is the miss presented
   as reassurance. selfTest() runs all of it against the contract's fixtures in a debug build, and
   AssistantTests reads the result.

   What this file does not do is as deliberate. It has no network, no model and no timer. Nothing here
   waits before answering, because a pause added to look thoughtful is the Thinking state lying — the
   only Thinking the screen may show is the recogniser finishing, which lives in GilbertVoice.swift. And
   nothing here is written anywhere: a conversation is an array of turns held by the screen, capped, and
   gone when the screen is. */

struct GilbertState: Identifiable, Hashable {
    let id: String
    let name: String
    let visual: String
    let meaning: String
    let cue: String
    let announcement: String
    let shownWhen: String
    let platforms: [String]
}

struct GilbertSituationTemplate: Hashable {
    let id: String
    let name: String
    let sentence: String
    let figure: String?
    let figureLabel: String?
    let depth: Int
}

/// A situation with its dates filled in for today.
struct GilbertSituation: Identifiable, Hashable {
    let id: String
    let name: String
    let sentence: String
    let figure: String?
    let figureLabel: String?
    let depth: Int
}

struct GilbertQuestionGroup: Hashable {
    let id: String
    let heading: String
    let lead: String?
}

struct GilbertQuestion: Identifiable, Hashable {
    let id: String
    let asks: String
    let group: String
    let answer: String
    let triggers: [String]
}

struct GilbertEmergencyGroup: Identifiable, Hashable {
    let id: String
    /// The sos.json condition this group raises, or nil for words that raise without one.
    let condition: String?
    /// The condition's name in the SOS screen's own words, resolved when the data was generated.
    let name: String
    let words: [String]
}

struct GilbertLine: Hashable {
    let number: String
    let name: String
}

/// The unmatched answer, and the unread answer that follows a question with words left over.
struct GilbertUnmatched {
    let state: String
    let sentence: String
    let detail: String
    let ifUrgent: String
    let lines: [GilbertLine]
    let sosLabel: String
    let handoverLabel: String
}

struct GilbertEmergency {
    let state: String
    let noticed: String
    let headline: String
    let lead: String
    let lines: [GilbertLine]
    let notAnAmbulance: String
    let sosLabel: String
}

struct GilbertHandoverField: Hashable {
    let id: String
    let label: String
}

struct GilbertHandover {
    let state: String
    let title: String
    let lead: String
    let notSent: String
    let fields: [GilbertHandoverField]
    let channelTyped: String
    let channelSpoken: String
    let channelChosen: String
    let nothingAsked: String
    let nothingMatched: String
    let matchedEmergency: String
    let urgency: [GilbertUrgency]
    let neverLowered: String
    let notCarriedHeading: String
    let notCarried: [GilbertNotCarried]
    let sendLabel: String
    let sentTitle: String
    let sent: String
    let sentReference: String
    let alreadySent: String
    let stillUrgent: String
    let lines: [GilbertLine]
}

/// An urgency a handover can carry. There are two, and neither of them is calm.
struct GilbertUrgency: Identifiable, Hashable {
    let id: String
    let name: String
    let why: String
}

/// Something that does not go with a handover, said to the person before they send it.
struct GilbertNotCarried: Identifiable, Hashable {
    let id: String
    let sentence: String
}

struct GilbertConversation {
    let inputLabel: String
    let inputHint: String
    let sendLabel: String
    let startAgainLabel: String
    let youAsked: String
    let youSaid: String
    let logLabel: String
    let refusalsHeading: String
    let keyboardNote: String
    let turnLimit: Int
}

struct GilbertVoicePolicy {
    let mode: String
    let gesture: String
    let maxListeningSeconds: Int
    let recognitionLocales: [String]
    let recognition: String
    let audioStored: Bool
    let transcriptLifetime: String
    let correctionBeforeSend: Bool
    let wakeWord: Bool
    let howItWorks: String
    let beforePermission: String
    let askPermissionLabel: String
    let notNowLabel: String
    let unavailable: String
    let refused: String
    let failed: String
    let interrupted: String
    let talkLabel: String
    let stopLabel: String
    let captionsLabel: String
    let correctLabel: String
    let discardLabel: String
}

struct GilbertRefusal: Identifiable, Hashable {
    let id: String
    let statement: String
    let why: String
}

struct GilbertStemFixture {
    let says: String
    let stems: [String]
}

struct GilbertMessageFixture {
    let says: String
    let expect: String
    let question: String?
    let groups: [String]
}

enum Gilbert {
    /// The six Pulse states, by the contract's ids.
    enum Pulse: String { case idle, listening, thinking, guiding, escalate, handover }

    /// How a message arrived. Spoken always means the person saw the words and sent them.
    enum Channel: String { case typed, spoken, chosen }

    struct SummaryRow: Hashable {
        let label: String
        let value: String
    }

    enum Reply: Hashable {
        case situation(GilbertSituation)
        case identity
        case voice
        /// The emergency answer, with the groups that raised it — empty when the question was chosen.
        case emergency([GilbertEmergencyGroup])
        case unmatched
        case handover([SummaryRow])
    }

    struct Turn: Identifiable, Hashable {
        let id: Int
        let asked: String?
        let channel: Channel?
        let reply: Reply
        let matched: GilbertQuestion?
        let groups: [GilbertEmergencyGroup]
        /// True when the answer came with words GilbertOne could not read; the unread answer follows it.
        let unread: Bool
    }

    static func spec(_ pulse: Pulse) -> GilbertState {
        states.first { $0.id == pulse.rawValue } ?? states[0]
    }

    // MARK: - Situations, dated today

    /* The visit is the one the home card shows — the store's first upcoming visit, written by the same
       shortWhenText — so GilbertOne and the home cannot name two days for one visit. With nothing booked, or a
       nurse still being found, it says scheduling.json's own words for that. */
    static func situations(visit: BookedVisit? = nil) -> [GilbertSituation] {
        var values: [String: String] = [
            "laboratory": Records.type("laboratory")?.name ?? fallbackLaboratory,
            "expiryWarningDays": "\(VettingClock.expiryWarningDays)"
        ]
        return situationTemplates.map { template in
            if template.id == "visit" {
                guard let visit, visit.isScheduled else {
                    let state = visit == nil ? visitNone : visitPending
                    return GilbertSituation(id: template.id, name: state.name, sentence: state.sentence, figure: nil, figureLabel: nil, depth: template.depth)
                }
                values["visitWhen"] = visit.shortWhenText
            }
            return GilbertSituation(id: template.id, name: template.name,
                                    sentence: fill(template.sentence, values),
                                    figure: template.figure.map { fill($0, values) },
                                    figureLabel: template.figureLabel.map { fill($0, values) },
                                    depth: template.depth)
        }
    }

    static func fill(_ text: String, _ values: [String: String]) -> String {
        values.reduce(text) { result, pair in result.replacingOccurrences(of: "{\(pair.key)}", with: pair.value) }
    }

    // MARK: - Words into stems

    /* Lower case, the contract's foldings (æ is ae), combining marks removed (é is e), apostrophes
       removed, anything outside a–z and 0–9 a space. The same steps in the same order as the web's and
       Android's, and held to fixtures.stems by selfTest(). */
    static func tokens(_ text: String) -> [String] {
        var folded = text.lowercased()
        for (from, to) in foldings { folded = folded.replacingOccurrences(of: from, with: to) }
        folded = String(String.UnicodeScalarView(folded.decomposedStringWithCanonicalMapping.unicodeScalars.filter { scalar in
            switch scalar.properties.generalCategory {
            case .nonspacingMark, .spacingMark, .enclosingMark: return false
            default: return true
            }
        }))
        for mark in apostrophes { folded = folded.replacingOccurrences(of: mark, with: "") }
        var words: [String] = []
        var current = ""
        for scalar in folded.unicodeScalars {
            if ("a"..."z").contains(scalar) || ("0"..."9").contains(scalar) { current.unicodeScalars.append(scalar) }
            else if !current.isEmpty { words.append(current); current = "" }
        }
        if !current.isEmpty { words.append(current) }
        return words
    }

    private static func undouble(_ word: String) -> String {
        let letters = Array(word)
        guard letters.count >= 3, let last = letters.last, letters[letters.count - 2] == last, !"aeiouslz".contains(last) else { return word }
        return String(letters.dropLast())
    }

    static func stem(_ word: String) -> String {
        var t = irregular[word] ?? word
        if t.count >= 5 && t.hasSuffix("ing") { t = undouble(String(t.dropLast(3))) }
        else if t.count >= 4 && (t.hasSuffix("ied") || t.hasSuffix("ies")) { t = String(t.dropLast(3)) + "y" }
        else if t.count >= 4 && t.hasSuffix("ed") && !t.hasSuffix("eed") { t = undouble(String(t.dropLast(2))) }
        else if t.count >= 4 && ["ses", "xes", "zes", "ches", "shes"].contains(where: { t.hasSuffix($0) }) { t = String(t.dropLast(2)) }
        else if t.count >= 4 && t.hasSuffix("s") && !t.hasSuffix("ss") && !t.hasSuffix("us") && !t.hasSuffix("is") { t = String(t.dropLast()) }
        if t.count >= 4 && t.hasSuffix("e") { t = String(t.dropLast()) }
        return t
    }

    static func stems(_ text: String) -> [String] { tokens(text).map(stem) }

    /// A term's words in order, each within `gap` words of the one before; greedy from each start.
    private static func hasSequence(_ said: [String], _ term: [String], gap: Int) -> Bool {
        guard let head = term.first else { return false }
        for start in said.indices where said[start] == head {
            var at = start
            var whole = true
            for word in term.dropFirst() {
                var found: Int?
                var j = at + 1
                while j < said.count && j <= at + 1 + gap { if said[j] == word { found = j; break }; j += 1 }
                guard let next = found else { whole = false; break }
                at = next
            }
            if whole { return true }
        }
        return false
    }

    // MARK: - The matcher

    static func emergencyGroups(in text: String) -> [GilbertEmergencyGroup] {
        let said = stems(text)
        return emergencyGroups.filter { group in group.words.contains { hasSequence(said, stems($0), gap: maxGap) } }
    }

    /// The longest trigger (in words, adjacent) wins; a tie goes to the question listed first.
    static func question(for text: String) -> GilbertQuestion? {
        let said = stems(text)
        var best: GilbertQuestion?
        var length = 0
        for question in questions {
            for trigger in question.triggers {
                let term = stems(trigger)
                if term.count > length && hasSequence(said, term, gap: 0) { best = question; length = term.count }
            }
        }
        return best
    }

    /// A word that is neither one of the question's own trigger words nor filler is a word GilbertOne did not read.
    static func leavesUnread(_ text: String, _ question: GilbertQuestion) -> Bool {
        let covered = Set(filler.map(stem)).union(question.triggers.flatMap(stems))
        return stems(text).contains { !covered.contains($0) }
    }

    static func reply(to question: GilbertQuestion, turns: [Turn] = [], visit: BookedVisit?) -> Reply {
        switch question.answer {
        case "situation":
            if let situation = situations(visit: visit).first(where: { $0.id == question.id }) { return .situation(situation) }
            return .unmatched
        case "identity": return .identity
        case "voice": return .voice
        case "emergency": return .emergency([])
        case "handover": return .handover(summary(of: turns))
        default: return .unmatched
        }
    }

    static func pulse(of reply: Reply) -> Pulse {
        switch reply {
        case .situation: return .guiding
        case .identity: return Pulse(rawValue: identityState) ?? .guiding
        case .voice: return Pulse(rawValue: voiceState) ?? .guiding
        case .emergency: return Pulse(rawValue: emergency.state) ?? .escalate
        case .unmatched: return Pulse(rawValue: unmatched.state) ?? .guiding
        case .handover: return Pulse(rawValue: handover.state) ?? .handover
        }
    }

    static func depth(of reply: Reply) -> Int {
        switch reply {
        case .situation(let situation): return situation.depth
        case .emergency: return 3
        case .handover: return 1
        default: return 0
        }
    }

    // MARK: - The conversation

    static func opening() -> [Turn] {
        [Turn(id: 0, asked: nil, channel: nil, reply: .situation(situations()[0]), matched: nil, groups: [], unread: false)]
    }

    private static func appending(_ turn: (Int) -> Turn, to turns: [Turn]) -> [Turn] {
        let next = (turns.last?.id ?? 0) + 1
        return Array((turns + [turn(next)]).suffix(conversation.turnLimit))
    }

    /// A message in a person's own words, typed or spoken and checked.
    static func send(_ text: String, channel: Channel, to turns: [Turn], visit: BookedVisit?) -> [Turn] {
        let words = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !words.isEmpty else { return turns }
        let groups = emergencyGroups(in: words)
        /* The emergency words first, and a match ends it. */
        if !groups.isEmpty {
            return appending({ Turn(id: $0, asked: words, channel: channel, reply: .emergency(groups), matched: nil, groups: groups, unread: false) }, to: turns)
        }
        guard let question = question(for: words) else {
            return appending({ Turn(id: $0, asked: words, channel: channel, reply: .unmatched, matched: nil, groups: [], unread: false) }, to: turns)
        }
        let unread = question.answer != "emergency" && leavesUnread(words, question)
        /* A claim about everything is not made to a message GilbertOne did not read all of. */
        if unread && neverWithUnread.contains(question.id) {
            return appending({ Turn(id: $0, asked: words, channel: channel, reply: .unmatched, matched: nil, groups: [], unread: false) }, to: turns)
        }
        let answer = reply(to: question, turns: turns, visit: visit)
        return appending({ Turn(id: $0, asked: words, channel: channel, reply: answer, matched: question, groups: [], unread: unread) }, to: turns)
    }

    /// One of the suggested questions, pressed. Its own words, so nothing is unread.
    static func choose(_ question: GilbertQuestion, turns: [Turn], visit: BookedVisit?) -> [Turn] {
        let answer = reply(to: question, turns: turns, visit: visit)
        return appending({ Turn(id: $0, asked: question.asks, channel: .chosen, reply: answer, matched: question, groups: [], unread: false) }, to: turns)
    }

    /// "Talk to a nurse", pressed from the unmatched or unread answer: a summary of the last thing asked.
    static func handOver(turns: [Turn]) -> [Turn] {
        appending({ Turn(id: $0, asked: nil, channel: nil, reply: .handover(summary(of: turns)), matched: nil, groups: [], unread: false) }, to: turns)
    }

    /* What the nurse queue is handed: how the last thing was asked, what it matched, and whether an
       emergency was raised anywhere in the conversation. Never the person’s words, and never which
       emergency words fired — a group name can be a crisis, and a crisis mention joined to a person is a
       record of it, which is why conversation.handover@1 refuses both. A request for a nurse is not itself
       the thing a nurse needs to read, so it is skipped when looking back.

       emergencyEarlier is for turns the conversation cap has already dropped: an emergency at the first
       message and a calm question at the thirtieth is still an emergency, and the cap must not be what
       lowers it. */
    static func summary(of turns: [Turn], emergencyEarlier: Bool = false) -> [SummaryRow] {
        let label = { (id: String) in handover.fields.first { $0.id == id }?.label ?? id }
        let raised = emergencyEarlier || emergencyRaised(in: turns)
        let urgency = SummaryRow(label: label("urgency"), value: HandoverQueue.urgency(emergencyRaised: raised)?.name ?? "")
        guard let last = turns.last(where: { $0.asked != nil && $0.matched?.answer != "handover" }) else {
            return [SummaryRow(label: label("channel"), value: handover.nothingAsked), urgency]
        }
        let channel: String
        switch last.channel {
        case .spoken: channel = handover.channelSpoken
        case .chosen: channel = handover.channelChosen
        default: channel = handover.channelTyped
        }
        let matched = last.matched?.asks ?? (last.groups.isEmpty ? handover.nothingMatched : handover.matchedEmergency)
        return [SummaryRow(label: label("channel"), value: channel), SummaryRow(label: label("matched"), value: matched), urgency]
    }

    /// Whether any of these turns got the emergency answer. Whether, never which.
    static func emergencyRaised(in turns: [Turn]) -> Bool {
        turns.contains { turn in
            if case .emergency = turn.reply { return true }
            return false
        }
    }

    /// How a turn came out, in the words the shared fixtures use.
    static func outcome(of turn: Turn) -> String {
        switch turn.reply {
        case .emergency: return "emergency"
        case .unmatched where turn.matched == nil: return "unmatched"
        default: return turn.unread ? "answer-and-unread" : "answer"
        }
    }

    #if DEBUG
    /* The contract's shared fixtures, run against this platform's matcher. The web runs the same list in
       Playwright and Android in a JVM unit test; AssistantTests launches with -GilbertSelfTest and reads
       what this returns off the screen. An empty list is agreement. Compiled out of a release build. */
    static func selfTest() -> [String] {
        var disagreements: [String] = []
        for fixture in stemFixtures where stems(fixture.says) != fixture.stems {
            disagreements.append("stems of \"\(fixture.says)\" were \(stems(fixture.says))")
        }
        for fixture in messageFixtures {
            guard let turn = send(fixture.says, channel: .typed, to: opening(), visit: nil).last else { continue }
            let kind = outcome(of: turn)
            let question = kind.hasPrefix("answer") ? turn.matched?.id : nil
            let groups = turn.groups.map(\.id)
            if kind != fixture.expect || question != fixture.question || groups != fixture.groups {
                disagreements.append("\"\(fixture.says)\" gave \(kind) \(question ?? "-") \(groups)")
            }
        }
        return disagreements
    }

    /// Ordinary sentences the emergency terms raise today. Reported, never a failure: see falsePositives
    /// in packages/catalog/gilbert-emergency-terms.json.
    static func falsePositiveReport() -> [String] {
        falsePositiveFixtures.filter { !emergencyGroups(in: $0).isEmpty }
    }
    #endif
}
