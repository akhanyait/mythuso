import Foundation

/* Gilbert's reasoning, without a screen attached to it.

   The sentences, the trigger phrases, the emergency words and the voice policy are generated into
   AssistantData.swift from packages/catalog/assistant.json. This file is the arithmetic beside that
   data, and it is the same arithmetic as apps/web/src/lib/assistant.ts and model/Assistant.kt:
   normalise a message, look for an emergency word, then for the longest trigger phrase, and give
   every other message the one honest answer. The same words get the same answer on all three.

   The order is the safety property. Emergency words are checked before any question, and a match
   ends the matching: "when is my nurse coming, my chest hurts" is an emergency, not a visit date.
   Nothing found in the same message can lower it, and nothing about a later message reaches back
   and changes an answer already given.

   What this file does not do is as deliberate. It has no network, no model and no timer. Nothing
   here waits before answering, because a pause added to look thoughtful is the Thinking state lying
   — the only Thinking the screen may show is the recogniser finishing, which lives in
   GilbertVoice.swift. And nothing here is written anywhere: a conversation is an array of turns held
   by the screen, capped, and gone when the screen is. */

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
    let noFlags: String
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
    }

    static func spec(_ pulse: Pulse) -> GilbertState {
        states.first { $0.id == pulse.rawValue } ?? states[0]
    }

    // MARK: - Situations, dated today

    static func situations(from now: Date = Date()) -> [GilbertSituation] {
        let first = Scheduling.offeredDays(from: now).first
        let values: [String: String] = [
            "firstDay": first.map { Scheduling.longDate($0.date) } ?? fallbackFirstDay,
            "day": first?.day ?? "",
            "month": first?.month ?? "",
            "slot": Scheduling.slots.first ?? "",
            "laboratory": Records.type("laboratory")?.name ?? fallbackLaboratory,
            "expiryWarningDays": "\(VettingClock.expiryWarningDays)"
        ]
        return situationTemplates.map { template in
            GilbertSituation(id: template.id, name: template.name,
                             sentence: fill(template.sentence, values),
                             figure: template.figure.map { fill($0, values) },
                             figureLabel: template.figureLabel.map { fill($0, values) },
                             depth: template.depth)
        }
    }

    static func fill(_ text: String, _ values: [String: String]) -> String {
        values.reduce(text) { result, pair in result.replacingOccurrences(of: "{\(pair.key)}", with: pair.value) }
    }

    // MARK: - The matcher

    /* Lower case, apostrophes removed, everything outside a–z and 0–9 a space, padded so a phrase can
       be matched as whole words. Deliberately ASCII, as the web's regular expression is: an accented
       letter becomes a space on all three platforms rather than a letter on two of them. */
    static func normalise(_ text: String) -> String {
        var out = ""
        var lastWasSpace = true
        for scalar in text.lowercased().unicodeScalars {
            if scalar == "'" || scalar == "\u{2019}" || scalar == "\u{2018}" || scalar == "`" { continue }
            let keep = ("a"..."z").contains(scalar) || ("0"..."9").contains(scalar)
            if keep { out.unicodeScalars.append(scalar); lastWasSpace = false }
            else if !lastWasSpace { out.append(" "); lastWasSpace = true }
        }
        return " " + out.trimmingCharacters(in: .whitespaces) + " "
    }

    private static func contains(_ normalised: String, _ phrase: String) -> Bool {
        normalised.contains(normalise(phrase))
    }

    static func emergencyGroups(in text: String) -> [GilbertEmergencyGroup] {
        let said = normalise(text)
        return emergencyGroups.filter { group in group.words.contains { contains(said, $0) } }
    }

    /// The longest trigger phrase wins; a tie goes to the question listed first.
    static func question(for text: String) -> GilbertQuestion? {
        let said = normalise(text)
        var best: (question: GilbertQuestion, length: Int)?
        for question in questions {
            for trigger in question.triggers where contains(said, trigger) {
                let length = normalise(trigger).count
                if best == nil || length > best!.length { best = (question, length) }
            }
        }
        return best?.question
    }

    static func reply(to question: GilbertQuestion, from now: Date = Date()) -> Reply {
        switch question.answer {
        case "situation":
            if let situation = situations(from: now).first(where: { $0.id == question.id }) { return .situation(situation) }
            return .unmatched
        case "identity": return .identity
        case "voice": return .voice
        case "emergency": return .emergency([])
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

    static func opening(from now: Date = Date()) -> [Turn] {
        [Turn(id: 0, asked: nil, channel: nil, reply: .situation(situations(from: now)[0]), matched: nil, groups: [])]
    }

    private static func appending(_ turn: (Int) -> Turn, to turns: [Turn]) -> [Turn] {
        let next = (turns.last?.id ?? 0) + 1
        return Array((turns + [turn(next)]).suffix(conversation.turnLimit))
    }

    /// A message in a person's own words, typed or spoken and checked.
    static func send(_ text: String, channel: Channel, to turns: [Turn], from now: Date = Date()) -> [Turn] {
        let words = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !words.isEmpty else { return turns }
        let groups = emergencyGroups(in: words)
        /* The emergency words first, and a match ends it. */
        if !groups.isEmpty {
            return appending({ Turn(id: $0, asked: words, channel: channel, reply: .emergency(groups), matched: nil, groups: groups) }, to: turns)
        }
        if let question = question(for: words) {
            if question.answer == "handover" { return handingOver(asked: words, channel: channel, matched: question, turns: turns) }
            return appending({ Turn(id: $0, asked: words, channel: channel, reply: reply(to: question, from: now), matched: question, groups: []) }, to: turns)
        }
        return appending({ Turn(id: $0, asked: words, channel: channel, reply: .unmatched, matched: nil, groups: []) }, to: turns)
    }

    /// One of the suggested questions, pressed.
    static func choose(_ question: GilbertQuestion, turns: [Turn], from now: Date = Date()) -> [Turn] {
        if question.answer == "handover" { return handingOver(asked: question.asks, channel: .chosen, matched: question, turns: turns) }
        return appending({ Turn(id: $0, asked: question.asks, channel: .chosen, reply: reply(to: question, from: now), matched: question, groups: []) }, to: turns)
    }

    /// "Talk to a nurse", pressed from the unmatched answer: a summary of the last thing asked.
    static func handOver(turns: [Turn]) -> [Turn] {
        appending({ Turn(id: $0, asked: nil, channel: nil, reply: .handover(summary(of: turns)), matched: nil, groups: []) }, to: turns)
    }

    private static func handingOver(asked: String, channel: Channel, matched: GilbertQuestion, turns: [Turn]) -> [Turn] {
        let rows = summary(of: turns)
        return appending({ Turn(id: $0, asked: asked, channel: channel, reply: .handover(rows), matched: matched, groups: []) }, to: turns)
    }

    /* What a nurse would be handed. The last thing the person asked before this, in their words, how
       it arrived, what it matched and which emergency words were in it. A request for a nurse is not
       itself the thing a nurse needs to read, so it is skipped when looking back. */
    static func summary(of turns: [Turn]) -> [SummaryRow] {
        let label = { (id: String) in handover.fields.first { $0.id == id }?.label ?? id }
        guard let last = turns.last(where: { $0.asked != nil && $0.matched?.answer != "handover" }), let asked = last.asked else {
            return [SummaryRow(label: label("words"), value: handover.nothingAsked)]
        }
        let channel: String
        switch last.channel {
        case .spoken: channel = handover.channelSpoken
        case .chosen: channel = handover.channelChosen
        default: channel = handover.channelTyped
        }
        let matched = last.matched?.asks ?? (last.groups.isEmpty ? handover.nothingMatched : handover.matchedEmergency)
        let flags = last.groups.isEmpty ? handover.noFlags : last.groups.map(\.name).joined(separator: "; ")
        return [
            SummaryRow(label: label("words"), value: asked),
            SummaryRow(label: label("channel"), value: channel),
            SummaryRow(label: label("matched"), value: matched),
            SummaryRow(label: label("flags"), value: flags)
        ]
    }
}
