import Foundation

/* Show GilbertOne a rash — the shapes and the arithmetic, without a screen.

   The questions, the rules, the sentences, the knowledge entries the outcomes show and the shared
   fixtures are SkinCheckData.swift, generated from packages/catalog/skin-check.json and the knowledge
   base. This file is the arithmetic beside them, the same arithmetic as packages/gilbertone/src/
   skin-check.ts and model/SkinCheck.kt: typed words to the emergency matcher first, the emergency
   rules next, then the questions every outcome needs, then the rules for a sign to be seen today, and
   general information last. A rule holds when each of its conditions does — the answer to that
   question includes one of the options it names — and general information lists the entries the
   chosen options name, most-named first, a tie going to the lower id, at most maxShown of them.

   What it does not do is as deliberate. It never sees the photo: the screen holds that, in memory,
   and lets it go when the check ends. It names no rash, sets no priority and composes no sentence.
   And its emergency matcher is the conversation's own term list — the escalation ruleset the web adds
   in front of it is not carried on this phone yet, so the contract's web-only fixtures are not
   generated here. */

struct SkinOption: Hashable {
    let id: String
    let label: String
    let oftenSeenIn: [String]
    let checkFirst: [String]
}

struct SkinQuestion: Identifiable, Hashable {
    let id: String
    let ask: String
    /// "chips" holds one answer, "multi" any number, "text" her own words.
    let kind: String
    /// The multi question's answer that clears the others ("None of these"), if it has one.
    let exclusive: String?
    let options: [SkinOption]
}

struct SkinCondition: Hashable {
    let question: String
    let anyOf: [String]
}

struct SkinRule: Identifiable, Hashable {
    let id: String
    /// "emergency" or "sister-today".
    let outcome: String
    let when: [SkinCondition]
    let says: String
    let drawsOn: [String]
    let keptBecause: String?
}

struct SkinConditionEntry: Identifiable, Hashable {
    let id: String
    let title: String
    let looks: [String]
    let when: String
    let source: String
    let reviewedBy: String?
}

struct SkinFirstAidEntry: Identifiable, Hashable {
    let id: String
    let title: String
    let steps: [String]
    let warnings: [String]
    let whenToCall: String
    let source: String
    let reviewedBy: String?
}

struct SkinFixture {
    let name: String
    let answers: [String: [String]]
    let typed: String
    let expect: String
    let rules: [String]?
    let conditions: [String]?
}

enum SkinCheck {
    typealias Answers = [String: [String]]

    struct Guidance: Identifiable, Hashable {
        let id: String
        let title: String
        let line: String
        let source: String
        let reviewedBy: String?
    }

    struct Raised: Identifiable, Hashable {
        let id: String
        let says: String
        let guidance: [Guidance]
    }

    enum Outcome: Equatable {
        /// The conversation answers it: `says` is handed over as the words that were asked.
        case emergency(says: String, rules: [String])
        case incomplete(missing: [String])
        case sisterToday([Raised])
        case information(conditions: [SkinConditionEntry], checkFirst: [SkinFirstAidEntry], selfCare: [SkinFirstAidEntry])

        var kind: String {
            switch self {
            case .emergency: return "emergency"
            case .incomplete: return "incomplete"
            case .sisterToday: return "sister-today"
            case .information: return "general-information"
            }
        }
    }

    static func fill(_ template: String, _ values: [String: String]) -> String {
        values.reduce(template) { text, pair in text.replacingOccurrences(of: "{\(pair.key)}", with: pair.value) }
    }

    static func question(_ id: String) -> SkinQuestion? { SkinCheckData.questions.first { $0.id == id } }

    static func label(_ questionId: String, _ optionId: String) -> String {
        question(questionId)?.options.first { $0.id == optionId }?.label ?? optionId
    }

    static func condition(_ id: String) -> SkinConditionEntry? { SkinCheckData.conditions.first { $0.id == id } }
    static func firstAid(_ id: String) -> SkinFirstAidEntry? { SkinCheckData.firstAid.first { $0.id == id } }

    /// Typed words are an emergency when the conversation's own emergency terms raise them.
    static func emergency(_ typed: String) -> Bool {
        let words = typed.trimmingCharacters(in: .whitespacesAndNewlines)
        return !words.isEmpty && !Gilbert.emergencyGroups(in: words).isEmpty
    }

    static func holds(_ rule: SkinRule, _ answers: Answers) -> Bool {
        rule.when.allSatisfy { condition in (answers[condition.question] ?? []).contains { condition.anyOf.contains($0) } }
    }

    private static func raised(_ rule: SkinRule) -> Raised {
        let guidance: [Guidance] = rule.drawsOn.compactMap { id in
            if let aid = firstAid(id) { return Guidance(id: id, title: aid.title, line: aid.whenToCall, source: aid.source, reviewedBy: aid.reviewedBy) }
            if let entry = condition(id) { return Guidance(id: id, title: entry.title, line: entry.when, source: entry.source, reviewedBy: entry.reviewedBy) }
            return nil
        }
        return Raised(id: rule.id, says: rule.says, guidance: guidance)
    }

    static func outcome(_ answers: Answers, typed: String = "") -> Outcome {
        if emergency(typed) { return .emergency(says: typed.trimmingCharacters(in: .whitespacesAndNewlines), rules: []) }
        for rule in SkinCheckData.rules where rule.outcome == "emergency" && holds(rule, answers) {
            /* The option's own label is handed over — the words the emergency terms raise. */
            guard let first = rule.when.first, let option = first.anyOf.first else { continue }
            return .emergency(says: label(first.question, option), rules: [rule.id])
        }
        let missing = SkinCheckData.required.filter { (answers[$0] ?? []).isEmpty }
        if !missing.isEmpty { return .incomplete(missing: missing) }
        let today = SkinCheckData.rules.filter { $0.outcome == "sister-today" && holds($0, answers) }
        if !today.isEmpty { return .sisterToday(today.map(raised)) }

        var score: [String: Int] = [:]
        var chosen: [SkinOption] = []
        for question in SkinCheckData.questions {
            for option in question.options where (answers[question.id] ?? []).contains(option.id) {
                chosen.append(option)
                for id in option.oftenSeenIn { score[id, default: 0] += 1 }
            }
        }
        let shown = score.sorted { $0.value != $1.value ? $0.value > $1.value : $0.key < $1.key }
            .prefix(SkinCheckData.Information.maxShown)
            .compactMap { condition($0.key) }
        var checkFirst: [String] = []
        for id in chosen.flatMap(\.checkFirst) where !checkFirst.contains(id) { checkFirst.append(id) }
        var care: [String] = []
        for id in shown.compactMap({ SkinCheckData.selfCareForCondition[$0.id] }) + SkinCheckData.selfCareAlways
        where !care.contains(id) && !checkFirst.contains(id) { care.append(id) }
        return .information(conditions: Array(shown), checkFirst: checkFirst.compactMap(firstAid), selfCare: care.compactMap(firstAid))
    }

    /// A chips question holds one answer and a second press clears it; a multi question toggles, and its
    /// exclusive option clears the others and is cleared by them.
    static func press(_ answers: Answers, question questionId: String, option optionId: String) -> Answers {
        guard let asked = question(questionId) else { return answers }
        let now = answers[questionId] ?? []
        var next: [String]
        if asked.kind == "chips" {
            next = now.contains(optionId) ? [] : [optionId]
        } else if now.contains(optionId) {
            next = now.filter { $0 != optionId }
        } else if optionId == asked.exclusive {
            next = [optionId]
        } else {
            next = now.filter { $0 != asked.exclusive } + [optionId]
        }
        var out = answers
        out[questionId] = next
        return out
    }

    /// The notes for the sister: one line per answered question, and the photo line — never the photo.
    static func summary(_ answers: Answers, typed: String, photoHeld: Bool) -> [String] {
        var lines: [String] = []
        for question in SkinCheckData.questions {
            let value = question.kind == "text"
                ? typed.trimmingCharacters(in: .whitespacesAndNewlines)
                : (answers[question.id] ?? []).map { label(question.id, $0) }.joined(separator: ", ")
            if !value.isEmpty { lines.append(fill(SkinCheckData.Summary.line, ["question": question.ask, "answer": value])) }
        }
        if photoHeld { lines.append(SkinCheckData.Summary.photoLine) }
        return lines
    }

    static var reviewSentence: String {
        guard let by = SkinCheckData.Review.reviewedBy else { return SkinCheckData.Review.unreviewed }
        return fill(SkinCheckData.Review.reviewed, ["reviewedBy": by])
    }

    static func entryNote(source: String, reviewedBy: String?) -> String {
        let review = reviewedBy.map { fill(SkinCheckData.Knowledge.reviewed, ["reviewedBy": $0]) } ?? SkinCheckData.Knowledge.unreviewed
        return "\(fill(SkinCheckData.Knowledge.label, ["authority": source])) \(review)"
    }

    #if DEBUG
    /// The contract's shared fixtures, run against this platform's arithmetic. An empty list is agreement.
    static func selfTest() -> [String] {
        SkinCheckData.fixtures.compactMap { fixture in
            let result = outcome(fixture.answers, typed: fixture.typed)
            var rules: [String] = []
            var conditions: [String] = []
            switch result {
            case .emergency(_, let ids): rules = ids
            case .sisterToday(let raised): rules = raised.map(\.id)
            case .information(let shown, _, _): conditions = shown.map(\.id)
            case .incomplete: break
            }
            if result.kind != fixture.expect { return "\(fixture.name): \(result.kind), expected \(fixture.expect)" }
            if let expected = fixture.rules, expected != rules { return "\(fixture.name): rules \(rules)" }
            if let expected = fixture.conditions, expected != conditions { return "\(fixture.name): conditions \(conditions)" }
            return nil
        }
    }
    #endif
}
