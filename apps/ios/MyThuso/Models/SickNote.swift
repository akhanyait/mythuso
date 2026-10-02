import Foundation

/* The doctor's medical certificate (2 October 2026): the types and the arithmetic, by hand, beside the
 * generated SickNoteData.swift that holds every sentence, limit and consultation from
 * packages/catalog/sick-note.json.
 *
 * The rules are the web's lib/sick-note.ts, in the same order and with the same sentences, because a
 * certificate is a legal document and a phone that backdated further than the web would be a phone
 * nobody decided should. No limit is typed here: how far back and how long are SickNoteData.Period's.
 * Who may sign is the vetting register's `can`, asked for the contract's capability, so a nurse is
 * refused with the sentence she already reads on her assessment and a doctor whose registration lapsed
 * with the register's own refusal.
 *
 * Days are offsets from today, never dates, so the preview's consultations never go stale. Nothing here
 * issues anything: the certificate this builds is what the patient would read, and the screen marks it
 * not issued in the contract's words.
 */

struct SickNoteFitness: Identifiable, Hashable {
    let id: String
    let label: String
    let statement: String
}

struct SickNoteConsultation: Identifiable, Hashable {
    let reference: String
    let patient: String
    let kind: String
    let nurse: String?
    let dayOffset: Int
    let time: String
    var id: String { reference }
}

struct SickNoteDraft: Equatable {
    var reference: String
    var patient: String
    var fromOffset: Int
    var toOffset: Int
    var fitness: String
    var consent: Bool
    var description: String

    var daysCovered: Int { toOffset - fromOffset + 1 }
}

struct SickNoteIssuer {
    let granted: Bool
    let allowed: Bool
    let reason: String
    let name: String
    let registration: String
}

struct SickNoteRefusal: Identifiable, Hashable {
    let id: String
    let sentence: String
}

struct SickNoteLine: Identifiable, Hashable {
    let id: String
    let label: String
    let value: String
}

enum SickNote {
    static func consultation(_ reference: String) -> SickNoteConsultation? {
        SickNoteData.consultations.first { $0.reference == reference.trimmingCharacters(in: .whitespaces) }
    }

    /* The rule 16(1)(f) proviso is where a draft starts: unfit for duty, and nothing described. */
    static func draft(for reference: String, patient: String) -> SickNoteDraft {
        let from = min(consultation(reference)?.dayOffset ?? 0, 0)
        return SickNoteDraft(reference: reference, patient: patient, fromOffset: from,
                             toOffset: from + SickNoteData.Period.defaultDays - 1, fitness: "unfit", consent: false, description: "")
    }

    /* The register decides, through the same `can` every other screen asks. Granted and allowed are kept
       apart because they are two refusals: a nurse is never granted it; a lapsed doctor holds it. */
    @MainActor static func issuer(_ subjectId: String) -> SickNoteIssuer {
        guard let subject = VettingStore.shared.subject(subjectId) else {
            return SickNoteIssuer(granted: false, allowed: false, reason: SickNoteData.notADoctor, name: subjectId, registration: "")
        }
        let granted = subject.role?.grants.contains { $0.capability == SickNoteData.capability } ?? false
        let decision = can(subject, SickNoteData.capability)
        return SickNoteIssuer(granted: granted, allowed: decision.allowed, reason: decision.reason ?? "", name: subject.name, registration: subject.reference)
    }

    private static func sentence(_ id: String, days: Int? = nil) -> String {
        let words = SickNoteData.refusals[id] ?? ""
        return days.map { words.replacingOccurrences(of: "{days}", with: String($0)) } ?? words
    }

    /* Every rule, in the web's order, all at once rather than the first: a doctor told one reason at a
       time fixes the form three times. */
    static func refusals(_ draft: SickNoteDraft, issuer: SickNoteIssuer) -> [SickNoteRefusal] {
        var out: [SickNoteRefusal] = []
        func refuse(_ id: String, _ words: String? = nil) { out.append(SickNoteRefusal(id: id, sentence: words ?? sentence(id))) }
        let seen = consultation(draft.reference)
        if let seen {
            if seen.kind != "home-visit" { refuse("from-a-call") }
            if seen.dayOffset > 0 { refuse("not-yet-seen") }
            if seen.patient != draft.patient.trimmingCharacters(in: .whitespaces) { refuse("not-this-patient") }
        } else {
            refuse("no-consultation")
        }
        if !issuer.granted { refuse("not-a-doctor") }
        else if !issuer.allowed { refuse("registration", issuer.reason) }
        if draft.toOffset < draft.fromOffset { refuse("period-backwards") }
        if draft.fromOffset > 0 { refuse("starts-after-issue") }
        if let seen, seen.dayOffset - draft.fromOffset > SickNoteData.Period.backdateDays {
            refuse("backdated-too-far", sentence("backdated-too-far", days: SickNoteData.Period.backdateDays))
        }
        if draft.daysCovered > SickNoteData.Period.maxDays {
            refuse("period-too-long", sentence("period-too-long", days: SickNoteData.Period.maxDays))
        }
        let described = !draft.description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        if described && !draft.consent { refuse("diagnosis-without-consent") }
        if draft.consent && !described { refuse("consent-without-description") }
        return out
    }

    /* Rule 16(1)(j): initials and surname in block letters. "Dr Ayanda Dlamini" is "A. DLAMINI". */
    static func blockLetters(_ name: String) -> String {
        var words = name.split(separator: " ").map(String.init)
        if let first = words.first, ["dr", "dr.", "sister", "sr", "prof"].contains(first.lowercased()) { words.removeFirst() }
        let surname = words.popLast() ?? ""
        return (words.map { "\($0.prefix(1).uppercased())." } + [surname.uppercased()]).joined(separator: " ")
    }

    static func day(_ offset: Int) -> String {
        let date = Calendar.current.date(byAdding: .day, value: offset, to: Calendar.current.startOfDay(for: Date())) ?? Date()
        return date.formatted(.dateTime.day().month(.wide).year())
    }

    private static func label(_ id: String) -> String { SickNoteData.labels[id] ?? id }

    /* Rule 16's items in rule 16's order, as the patient would read them. What the register does not hold
       is printed as not held; the identity and employment numbers are never carried at all. */
    static func certificate(_ draft: SickNoteDraft, issuer: SickNoteIssuer) -> [SickNoteLine] {
        let seen = consultation(draft.reference)
        let fitness = SickNoteData.fitness.first { $0.id == draft.fitness } ?? SickNoteData.fitness[0]
        let backdated = seen.map { draft.fromOffset < $0.dayOffset } ?? false
        let basis = ([SickNoteData.Basis.homeVisit] + (backdated ? [SickNoteData.Basis.backdated] : [])).joined(separator: " ")
        let description = draft.consent && !draft.description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? draft.description.trimmingCharacters(in: .whitespacesAndNewlines) : SickNoteData.Diagnosis.withheld
        return [
            .init(id: "practitioner", label: label("practitioner"), value: issuer.name),
            .init(id: "registration", label: label("registration"), value: issuer.registration),
            .init(id: "qualification", label: label("qualification"), value: SickNoteData.notHeld),
            .init(id: "practiceNumber", label: label("practiceNumber"), value: SickNoteData.notHeld),
            .init(id: "practiceAddress", label: label("practiceAddress"), value: SickNoteData.notHeld),
            .init(id: "patient", label: label("patient"), value: draft.patient),
            .init(id: "consultation", label: label("consultation"), value: seen.map { "\($0.reference) · \(day($0.dayOffset)) at \($0.time)" } ?? draft.reference),
            .init(id: "basis", label: label("basis"), value: basis),
            .init(id: "statement", label: label("statement"), value: fitness.statement),
            .init(id: "description", label: SickNoteData.Diagnosis.descriptionLabel, value: description),
            .init(id: "period", label: label("period"), value: "\(day(draft.fromOffset)) to \(day(draft.toOffset)) · \(draft.daysCovered) \(SickNoteData.Screen.daysLabel)"),
            .init(id: "issued", label: label("issued"), value: day(0)),
            .init(id: "signature", label: label("signature"), value: "\(blockLetters(issuer.name)) · \(SickNoteData.Screen.unsigned)")
        ]
    }
}
