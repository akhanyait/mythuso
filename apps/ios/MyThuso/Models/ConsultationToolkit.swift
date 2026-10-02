import Foundation

/* The consultation toolkit's reasoning on iOS (2 October 2026): which tools a clinician reaches in a
   consultation, in what order, and what each one says to this clinician, in this consultation, right now.

   The tools, their order per role and every sentence are ConsultationToolkitData.swift's, generated from
   packages/catalog/consultation-toolkit.json. What is hand-written here is the join, and it is a port of
   apps/web/src/lib/consultation-toolkit.ts's stateOf, answer for answer: whether this party may use a tool
   is the vetting register's, asked live through can(); what the line allows a doctor to decide is the
   teleconsultation's clinical limits, through Teleconsult.permitted; the refusal a room without a nurse is
   given is teleconsult.json's own. Nothing here decides anything of its own — a tool's state is the first
   of those answers that says no.

   WHY THE ORDER OF THE ANSWERS. Being built comes first, because a tool with no screen has nothing to
   refuse. Then the register: a doctor whose registration lapsed is refused every decision whatever the line
   is doing. Then the encounter: a call that ended without counting as a consultation decides nothing,
   permanently. Then the room: a medicine is not started and a certificate is not written for a patient
   nobody in the room has examined. Only then the line, which is the one answer that changes back. */

enum ConsultationToolkit {
    static func tool(_ id: String) -> ToolkitToolSpec? { tools.first { $0.id == id } }
    static func surface(_ id: String) -> ToolkitSurfaceSpec? { surfaces.first { $0.id == id } }
    /// The tools a surface lists, in its order.
    static func tools(of surface: ToolkitSurfaceSpec) -> [ToolkitToolSpec] { surface.tools.compactMap(tool) }
    /// The toolkit's own refusals said on this surface: those that name no surface are said on every one.
    static func refusals(on surface: ToolkitSurfaceSpec) -> [ToolkitRefusalSpec] {
        refusals.filter { $0.surfaces.isEmpty || $0.surfaces.contains(surface.id) }
    }

    /// The contract's {placeholders}, filled. A key nobody supplied is left as it was, so a gap shows.
    static func fill(_ template: String, _ values: [String: String]) -> String {
        template.replacing(/\{(\w+)\}/) { match in values[String(match.output.1)] ?? String(match.output.0) }
    }

    /* The patient's file, by the name on the consultation — or nothing, said as nothing. Never another
       patient's: a name that matches no record is not rounded to the nearest one. */
    static func fileOf(_ patient: String) -> PatientRecord? { PatientFixtures.all.first { $0.name == patient } }

    static func state(of tool: ToolkitToolSpec, subject: VettingSubject, call: ToolkitCall?) -> ToolkitToolState {
        if tool.pending { return .pending(fill(Gates.beingBuilt, ["tool": tool.name])) }
        if let capability = tool.capability {
            let decision = can(subject, capability)
            if !decision.allowed { return .withheld(decision.reason ?? Words.withheld) }
        }
        guard let call else { return .open }
        guard tool.decision || tool.signsAfterCall else { return .open }
        if call.ended && !call.countsAsConsultation { return .closed(fill(Gates.notAConsultation, ["tool": tool.name])) }
        /* A limit that needs the nurse is the room's answer, said in the teleconsultation's own words. Asked
           of the room rather than of permitted(), because a dropped line withdraws the nurse's limit too — and
           a doctor told "nobody here has examined the patient" while the nurse stands beside the patient would
           be told something false. */
        for gate in tool.onCall where Teleconsult.clinicalLimits.first(where: { $0.id == gate.limit })?.needs == "nurse" && !call.nursePresent {
            return .room(Teleconsult.refusal(gate.refusal).sentence)
        }
        if !call.ended && !tool.decision { return .open }
        if !call.ended && !Teleconsult.permitted(connection: call.connectionId, nursePresent: call.nursePresent).contains(where: { $0.id == "conclude" }) {
            return .waiting(fill(Gates.lineDoesNotAllow, ["tool": tool.name]))
        }
        return .open
    }
}

/* The shapes ConsultationToolkitData.swift's .init(...) calls build. Stored properties only, in the
   generator's order, so the memberwise initialisers are the ones it writes against. */
struct ToolkitCallGate: Hashable {
    /// A clinical limit id in packages/catalog/teleconsult.json.
    let limit: String
    /// A teleconsult.json refusal id, said word for word when the room does not give the limit.
    let refusal: String
}

struct ToolkitToolSpec: Identifiable, Hashable {
    let id: String
    let name: String
    let short: String
    /// A vetting capability, or nil for a tool every clinician on the surface may open.
    let capability: String?
    let summary: String
    /// A capability id in packages/catalog/capabilities.json, whose notice the tool carries.
    let honesty: String
    /// True when the toolkit draws that notice; false when the tool's own screen does.
    let drawnByToolkit: Bool
    let decision: Bool
    let signsAfterCall: Bool
    let pending: Bool
    let onCall: [ToolkitCallGate]
    /// The iOS screen the tool opens, or nil when this phone says what the tool is and opens nothing.
    let iosScreen: String?
}

struct ToolkitRefusedSpec: Hashable {
    let tool: String
    let sentence: String
}

struct ToolkitSurfaceSpec: Identifiable, Hashable {
    let id: String
    let role: String
    let homeId: String
    let homeName: String
    let homeShort: String
    let heading: String
    /// The visit stage the toolkit first appears at, when it names one.
    let from: String?
    let tools: [String]
    /// What the surface's role is never granted, said where the doctor's tools would be.
    let refused: [ToolkitRefusedSpec]
}

struct ToolkitRefusalSpec: Identifiable, Hashable {
    let id: String
    let sentence: String
    /// Empty means every surface.
    let surfaces: [String]
}

/// The call, as far as a tool needs to know it. Nil on a surface that is not a call.
struct ToolkitCall: Hashable {
    let connectionId: String
    let nursePresent: Bool
    let ended: Bool
    let countsAsConsultation: Bool
}

enum ToolkitToolState: Hashable {
    case open
    case pending(String)
    case withheld(String)
    case closed(String)
    case room(String)
    case waiting(String)

    var isOpen: Bool { if case .open = self { return true } else { return false } }

    /// What a shut tool is called on its own row — the web's stateWord, word for word.
    var word: String? {
        switch self {
        case .open: return nil
        case .pending: return ConsultationToolkit.Words.statePending
        case .withheld: return ConsultationToolkit.Words.withheld
        case .closed: return ConsultationToolkit.Words.stateClosed
        case .room: return ConsultationToolkit.Words.stateRoom
        case .waiting: return ConsultationToolkit.Words.waiting
        }
    }

    /// The sentence a shut tool opens to, and nothing else.
    var sentence: String? {
        switch self {
        case .open: return nil
        case .pending(let reason), .withheld(let reason), .closed(let reason), .room(let reason), .waiting(let reason): return reason
        }
    }
}
