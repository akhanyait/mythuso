import Foundation

/* GilbertOne's escalation ruleset on the phone — the arithmetic beside the generated EscalationData.swift.

   The rules are packages/gilbertone/src/escalation.ts, a locked Tier 1 artefact, written into
   EscalationData.swift by scripts/emit-escalation.mjs: the same rules in the same order, each pattern
   translated into the part of the regular-expression language ICU reads exactly as JavaScript does.
   This file is checkEscalation() and fold.ts's foldCharacters(), and nothing else: fold the message,
   try the rules in order, and the first pattern that matches decides. Model/Escalation.kt is the same
   on Android; Escalation.selfTest() holds both to fixtures.escalation in packages/catalog/assistant.json,
   the list the web replays in packages/gilbertone/src/escalation-fixtures.test.ts.

   Why the phone has it at all (2 October 2026): until then iOS asked only the emergency terms, so
   "I don’t want to live anymore", "my throat is swelling" and "sudden weakness on one side" — which no
   term names — raised the ambulance numbers on the web and nothing here. Gilbert.send() now asks this
   after the terms and before any question, the way the web's send() does.

   What it will not do. It names no condition and composes no sentence: a match is answered with the
   conversation's one emergency answer, as on the web. It never lowers anything — an urgent rule is not
   an emergency and is not answered as one, and no match is not a reassurance. It reads no network, no
   model and nothing stored, and keeps nothing it read.

   Two readings are JavaScript's on purpose. JavaScript counts an emoji as two characters and ICU as
   one, so each half of such a character is read as U+FFFD — a character no pattern names — and a
   `[^.]{0,24}` window holds exactly as much here as in a browser. And the patterns' case-insensitivity
   is ICU's, which can differ from JavaScript's only for characters the fold has already turned into
   others (the long s, the Kelvin sign); the matcher is only ever handed folded text. */

struct EscalationPattern {
    let source: String
    let ignoresCase: Bool
}

/// A rule without its approved sentence: a match is answered with the conversation's own emergency
/// answer, as the web's panel answers it, so the sentence is the service's alone.
struct EscalationRule {
    let id: String
    let severity: String
    let action: String
    let patterns: [EscalationPattern]
}

struct EscalationFixture {
    let says: String
    let rule: String?
}

enum Escalation {
    struct Match {
        let rule: EscalationRule
        /// The slice of the folded text that matched, as checkEscalation's matchedPattern.
        let matched: String
    }

    /* Compiled once. A pattern that does not compile is a build that must not ship: the self-test
       compiles every one, and a crash here is louder than a rule silently skipped. */
    private static let compiled: [(EscalationRule, [NSRegularExpression])] = EscalationData.rules.map { rule in
        (rule, rule.patterns.map { pattern in
            do {
                return try NSRegularExpression(pattern: pattern.source, options: pattern.ignoresCase ? [.caseInsensitive] : [])
            } catch {
                fatalError("The escalation rule \(rule.id) has a pattern ICU cannot read: \(pattern.source)")
            }
        })
    }

    private static let invisible = Set(EscalationData.invisible)
    private static let apostrophes = Set(EscalationData.apostrophes)
    private static let quotes = Set(EscalationData.quotes)
    /* JavaScript's \s, which fold.ts collapses: the ASCII spaces and controls, and the Unicode spaces. */
    private static func isSpace(_ scalar: Unicode.Scalar) -> Bool {
        switch scalar.value {
        case 0x09...0x0D, 0x20, 0xA0, 0x1680, 0x2000...0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF: return true
        default: return false
        }
    }

    /// fold.ts's foldCharacters: compatibility form, the invisible characters removed, every apostrophe
    /// straightened, every curly double quote straightened, lower case, whitespace collapsed and trimmed.
    /// The full stop, the slash and the decimal point stay, because the patterns read them.
    static func fold(_ text: String) -> String {
        let compatible = text.precomposedStringWithCompatibilityMapping
        var marked = String.UnicodeScalarView()
        for scalar in compatible.unicodeScalars where !invisible.contains(scalar) {
            if apostrophes.contains(scalar) { marked.append("'") }
            else if quotes.contains(scalar) { marked.append("\"") }
            else { marked.append(scalar) }
        }
        var folded = String.UnicodeScalarView()
        var pending = false
        for scalar in String(marked).lowercased().unicodeScalars {
            if isSpace(scalar) { pending = !folded.isEmpty; continue }
            if pending { folded.append(" "); pending = false }
            folded.append(scalar)
        }
        return String(folded)
    }

    /// checkEscalation(foldCharacters(transcript), history): the whole session, the transcript first,
    /// rules in order, first match wins. Nil when nothing matches — which decides nothing.
    static func check(_ transcript: String, history: [String] = []) -> Match? {
        let haystack = ([transcript] + history).map(fold).joined(separator: "\n")
        /* Each half of a character outside the Basic Multilingual Plane is read as U+FFFD, so a window
           counts characters the way JavaScript does. */
        let units = haystack.utf16.map { UTF16.isLeadSurrogate($0) || UTF16.isTrailSurrogate($0) ? 0xFFFD : $0 }
        let read = String(decoding: units, as: UTF16.self)
        let range = NSRange(location: 0, length: (read as NSString).length)
        for (rule, patterns) in compiled {
            for pattern in patterns {
                if let found = pattern.firstMatch(in: read, options: [], range: range) {
                    return Match(rule: rule, matched: (read as NSString).substring(with: found.range))
                }
            }
        }
        return nil
    }

    /// An emergency the ruleset found, or nil — an urgent rule is not one.
    static func emergency(in text: String) -> Match? {
        guard let match = check(text), match.rule.severity == "emergency" else { return nil }
        return match
    }

    #if DEBUG
    /* fixtures.escalation, run against this platform's engine. Gilbert.selfTest() adds what this
       returns, and AssistantTests reads it; an empty list is agreement. Compiled out of a release build. */
    static func selfTest() -> [String] {
        EscalationData.fixtures.compactMap { fixture in
            let found = check(fixture.says)?.rule.id
            return found == fixture.rule ? nil : "escalation of \"\(fixture.says)\" found \(found ?? "nothing"), the contract says \(fixture.rule ?? "nothing")"
        }
    }
    #endif
}
