import Foundation

/* What MyThuso can actually do, and what it only draws.

   Every screen in this app used to carry its own hand-typed sentence about being a preview —
   "Design preview", "Demonstration record", "Fictional workspace" — sixty-odd of them across three
   platforms, none of them attached to anything that would know when it had stopped being true. They
   come from packages/catalog/capabilities.json now, generated into CapabilitiesData.swift beside
   this file. This is the reasoning; that is the data.

   A screen names the capability it depends on and renders the sentence it is given. It never writes
   its own. That is not tidiness: sixty hand-typed variations cannot be switched off together, and
   some of them will be wrong by the time anybody notices. One place knows, and when an integration
   lands one boolean changes and the notice disappears from every platform at once.

   The lookup below returns nil for an id nobody defined rather than trapping, and the loudness
   lives in the build instead: scripts/check-boundaries.mjs fails when an iOS source names a
   capability the contract does not carry. A missing banner must never be the reason a person's
   phone drops the app they opened to book a nurse — but a missing banner is also invisible, which
   is why it is caught before it ships rather than not at all. */

/// One thing MyThuso either does or only draws.
struct Capability: Identifiable, Hashable {
    let id: String
    let name: String
    /// True only when `evidence` names a file that exists and `blockedBy` is empty. The build
    /// refuses any other combination, because connected is a claim about the world.
    let connected: Bool
    /// A file somebody can open, or nil because there is nothing yet to point at.
    let evidence: String?
    let blockedBy: [String]
    /// What this capability says while nothing at all is behind it. A screen must not read this
    /// directly — see `noticeToShow`, which is what a simulated capability says instead.
    let notice: String
    /// "absent", "simulated" or "connected". The third state exists so the product can be walked end
    /// to end before a supplier is signed, without the second state's claim being made.
    let state: String
    /// Present exactly when `state` is "simulated", and the build refuses any other combination.
    let simulation: Simulation?
    let surfaces: [String]
    /// Carried by the two capabilities somebody would be tempted to soften — the voice, whose
    /// refusal is that no microphone affordance may be drawn at all, and the emergency pathway,
    /// whose ambulance number is shown connected or not. Nil on the other thirteen.
    let neverSoften: String?
    /// What the capability would need a device's permission for. Empty on every capability today,
    /// which is what lets both native apps ask a device for nothing at all: the build refuses any
    /// permission no capability has named here.
    let requiresPermissions: [String]
}

/// A named stand-in, running in this process, producing what a supplier would produce.
///
/// The half worth reading is `refuses`. A simulation that refuses nothing is a fixture with a label
/// on it, and the build fails on one that lists none.
struct Simulation: Hashable {
    let supplier: String
    /// Rendered wherever the absent notice would have been. A simulated capability is never quieter
    /// than an absent one: the failure guarded against is not a screen that lies, it is a screen
    /// that stops speaking because something answers now and nobody notices it is a fixture.
    let notice: String
    let refuses: [String]
}

/// One of the rules about how the notices are used, rendered rather than only obeyed.
struct CapabilityRule: Identifiable, Hashable {
    let id: String
    let statement: String
    let why: String
}

enum Capabilities {
    /// Nil for an id the contract does not carry. See the note at the top of this file for why that
    /// is not a trap.
    static func of(_ id: String) -> Capability? { all.first { $0.id == id } }

    /// The sentence to show, or nothing at all because the thing is real now.
    static func notice(for id: String) -> String? {
        guard let capability = of(id), !capability.connected else { return nil }
        return capability.simulation?.notice ?? capability.notice
    }

    static func isConnected(_ id: String) -> Bool { of(id)?.connected ?? false }
    static func isSimulated(_ id: String) -> Bool { of(id)?.state == "simulated" }

    /// What a simulator stands in for, and what it will not do. Rendered on the readiness screens.
    static func simulation(_ id: String) -> Simulation? { of(id)?.simulation }

    /// What stands between a capability and being real, in the contract's own words.
    static func blocking(_ id: String) -> [String] { of(id)?.blockedBy ?? [] }

    /// The sentence that says what may never be drawn for this capability, where it has one. It is
    /// not shown to a patient — it is a note to whoever changes the screen next.
    static func neverSoften(_ id: String) -> String? { of(id)?.neverSoften }

    static var connectedCount: Int { all.filter(\.connected).count }
    static var simulatedCount: Int { all.filter { $0.state == "simulated" }.count }
}
