import Foundation
import CryptoKit

/* The chain of custody on iOS: a nurse, a sample courier or a Thuso Ride responder at a patient's door with a
 * sealed medicine bag, and the only three things that let it change hands.
 *
 * MedicinesData.swift is written by scripts/emit-medicines.mjs from packages/catalog/medicines.json,
 * dispensing.json and apis/medicines.json: the PIN's length, lifetime and attempts, the window, which schedules a
 * driver may carry, every heading and every refusal sentence. This file is the arithmetic of
 * packages/engines/src/medicines/domain/collections.ts, hand-written because a phone cannot run the engine, and
 * it asks the engine's questions in the engine's order, so the sentence a collector reads here is the sentence
 * the route would answer with.
 *
 * WHAT A COLLECTION KEEPS. An authorisation reads the PIN lifetime, the window and the attempt limit once, when
 * the patient authorises, and keeps them. The generated constants are proposals an admin may change on the web;
 * a PIN already shown keeps the terms it was shown with either way.
 *
 * THE PIN IS NEVER KEPT. An authorisation holds a random salt and the SHA-256 of salt and PIN, as the engine
 * does, and a hand-over is told only whether the PIN matched. The comparison runs the whole length whatever the
 * first difference, so the time it takes says nothing about how close a guess was.
 *
 * A refusal is looked up by id and never typed. An id the contract does not declare stops the app in
 * development rather than drawing a blank where a refusal should be: a hand-over refused in silence is a
 * collector who tries again.
 */
struct MedicineSchedule: Identifiable, Hashable {
    let id: String
    let name: String
    let driverMayCarry: Bool
}

struct MedicinesChoice: Identifiable, Hashable {
    let id: String
    let label: String
}

struct MedicinesRefusal: Hashable {
    let id: String
    let status: Int
    let statement: String
}

enum Medicines {
    static func refusal(_ id: String) -> MedicinesRefusal {
        guard let found = refusals.first(where: { $0.id == id }) else {
            preconditionFailure("packages/catalog/apis/medicines.json declares no live refusal \"\(id)\", so there is no sentence to refuse with.")
        }
        return found
    }
    static func fill(_ sentence: String, _ values: [String: String]) -> String {
        values.reduce(sentence) { text, pair in text.replacingOccurrences(of: "{" + pair.key + "}", with: pair.value) }
    }
    static func label(_ list: [MedicinesChoice], _ id: String) -> String {
        list.first { $0.id == id }?.label ?? id
    }
    static func minutes(_ count: Int) -> TimeInterval { TimeInterval(count) * 60 }

    static func schedule(_ code: String) -> MedicineSchedule? { schedules.first { $0.id == code } }
    /// Whether somebody in this role may hold a bag of this schedule. A schedule the contract does not list is held by nobody.
    static func mayCarry(role: String, scheduleCode: String) -> Bool {
        guard let schedule = schedule(scheduleCode) else { return false }
        return schedule.driverMayCarry || !driverRoles.contains(role)
    }

    struct Terms {
        let pinLifetime: TimeInterval
        let window: TimeInterval
        let pinAttempts: Int
        static var defaults: Terms {
            Terms(pinLifetime: minutes(pinLifetimeMinutes), window: minutes(collectionWindowMinutes), pinAttempts: Medicines.pinAttempts)
        }
    }

    struct Prescription {
        let prescriptionRef: String
        let subjectRef: String
        let scheduleCode: String
        var dispensedAt: Date?
        var sealRef: String?
        var collectedAt: Date? = nil
        var deliveredAt: Date? = nil
    }

    struct Authorisation {
        let authorisationRef: String
        let prescriptionRef: String
        let collectorRef: String
        let collectorRole: String
        let pinSalt: String
        let pinDigest: String
        let authorisedAt: Date
        let pinExpiresAt: Date
        let windowEndsAt: Date
        let pinAttempts: Int
    }

    struct CollectionRecord {
        let collectionRef: String
        let authorisationRef: String
        let prescriptionRef: String
        let collectorRef: String
        let collectorRole: String
        let sealRef: String
        let collectedAt: Date
        var handedOverAt: Date?
    }

    struct Attempt {
        enum Kind: String { case wrongPin = "wrong-pin", brokenSeal = "broken-seal" }
        let kind: Kind
        let byRef: String
        let at: Date
    }

    struct Caller {
        let ref: String?
        let role: String
    }

    struct Custody {
        let collection: CollectionRecord
        let prescription: Prescription
    }

    enum Outcome<Value> {
        case done(Value)
        case refused(MedicinesRefusal)
    }

    /// What a hand-over answers, and the attempt the refusal keeps: a wrong PIN or a broken seal is counted even though the hand-over was refused.
    struct Handover {
        let result: Outcome<Custody>
        let keep: Attempt?
    }

    /// Why a collection has ended without a hand-over — a void reason's id — or nil while it may still be handed over.
    static func voidedBy(_ attempts: [Attempt], _ authorisation: Authorisation) -> String? {
        if attempts.contains(where: { $0.kind == .brokenSeal }) { return "broken-seal" }
        return attempts.filter { $0.kind == .wrongPin }.count >= authorisation.pinAttempts ? "pin-attempts-exhausted" : nil
    }

    /// How many wrong PINs a collector may still enter before the bag goes back.
    static func attemptsLeft(_ attempts: [Attempt], _ authorisation: Authorisation) -> Int {
        max(0, authorisation.pinAttempts - attempts.filter { $0.kind == .wrongPin }.count)
    }

    /* The patient's side of the chain. Its refusals (whose prescription it is, a collection already under way)
       are the patient's route's, which this phone does not call and carries no sentences for, so here it only
       keeps the terms and the digest. The PIN never outlives the window, whatever the two settings say. */
    static func authorise(_ p: Prescription, authorisationRef: String, collectorRef: String, collectorRole: String,
                          pin: String, terms: Terms, now: Date) -> Authorisation {
        let salt = newSalt()
        return Authorisation(authorisationRef: authorisationRef, prescriptionRef: p.prescriptionRef,
                             collectorRef: collectorRef, collectorRole: collectorRole,
                             pinSalt: salt, pinDigest: digest(salt: salt, pin: pin), authorisedAt: now,
                             pinExpiresAt: now.addingTimeInterval(min(terms.pinLifetime, terms.window)),
                             windowEndsAt: now.addingTimeInterval(terms.window), pinAttempts: terms.pinAttempts)
    }

    /* A driver is refused a Schedule 5 or 6 bag from the schedule the prescription carries, never one the carrier
       declares, and before anything about time or the seal: what they may hold does not depend on when they ask. */
    static func collect(_ p: Prescription, _ authorisation: Authorisation?, existing: CollectionRecord?,
                        collectionRef: String, sealRef: String, who: Caller, now: Date) -> Outcome<Custody> {
        guard let ref = who.ref else { return .refused(refusal("unnamed-caller")) }
        guard let authorisation, authorisation.prescriptionRef == p.prescriptionRef else { return .refused(refusal("no-authorisation")) }
        if ref != authorisation.collectorRef || who.role != authorisation.collectorRole { return .refused(refusal("not-the-authorised-collector")) }
        if !mayCarry(role: who.role, scheduleCode: p.scheduleCode) { return .refused(refusal("schedule-five-six-by-driver")) }
        if now >= authorisation.windowEndsAt { return .refused(refusal("authorisation-lapsed")) }
        if existing != nil { return .refused(refusal("already-collected")) }
        guard p.dispensedAt != nil, let sealed = p.sealRef else { return .refused(refusal("not-dispensed")) }
        if sealRef != sealed { return .refused(refusal("seal-does-not-match")) }
        var collected = p
        collected.collectedAt = now
        return .done(Custody(
            collection: CollectionRecord(collectionRef: collectionRef, authorisationRef: authorisation.authorisationRef,
                                         prescriptionRef: p.prescriptionRef, collectorRef: ref, collectorRole: who.role,
                                         sealRef: sealRef, collectedAt: now, handedOverAt: nil),
            prescription: collected))
    }

    /* At the door the order is the order of what is already true: a bag handed over or a collection voided says
       so first, then the person holding it must be the one the patient chose, then time (the window, then the
       PIN), then the seal — a broken seal voids the delivery whatever PIN is given — and only then the PIN. The
       PIN that uses the last attempt voids the collection in its own sentence rather than as one more wrong PIN. */
    static func handOver(_ c: CollectionRecord, _ p: Prescription, _ authorisation: Authorisation, attempts: [Attempt],
                         pinMatches: Bool, sealIntact: Bool, who: Caller, now: Date) -> Handover {
        func no(_ id: String, _ keep: Attempt? = nil) -> Handover { Handover(result: .refused(refusal(id)), keep: keep) }
        guard let ref = who.ref else { return no("unnamed-caller") }
        if c.handedOverAt != nil { return no("already-handed-over") }
        if voidedBy(attempts, authorisation) != nil { return no("collection-voided") }
        if ref != c.collectorRef { return no("not-the-authorised-collector") }
        if now >= authorisation.windowEndsAt { return no("authorisation-lapsed") }
        if now >= authorisation.pinExpiresAt { return no("pin-expired") }
        if !sealIntact { return no("broken-seal", Attempt(kind: .brokenSeal, byRef: ref, at: now)) }
        if !pinMatches {
            let wrong = attempts.filter { $0.kind == .wrongPin }.count + 1
            return no(wrong >= authorisation.pinAttempts ? "pin-attempts-exhausted" : "wrong-pin", Attempt(kind: .wrongPin, byRef: ref, at: now))
        }
        var handed = c
        handed.handedOverAt = now
        var delivered = p
        delivered.deliveredAt = now
        return Handover(result: .done(Custody(collection: handed, prescription: delivered)), keep: nil)
    }

    /// Where a collection stands, as one of the contract's custody states.
    static func custodyState(_ collection: CollectionRecord?, _ attempts: [Attempt], _ authorisation: Authorisation) -> String {
        if collection?.handedOverAt != nil { return "handed-over" }
        if voidedBy(attempts, authorisation) != nil { return "voided" }
        return collection == nil ? "authorised" : "collected"
    }

    // MARK: - The PIN, which only the patient is shown

    /* SystemRandomNumberGenerator is the platform's cryptographic source on every Apple OS, and Int.random(in:)
       draws each digit without modulo bias. A PIN made from a clock or a counter is a PIN somebody can work out. */
    static func newPin() -> String {
        var generator = SystemRandomNumberGenerator()
        return (0..<pinDigits).map { _ in String(Int.random(in: 0...9, using: &generator)) }.joined()
    }
    static func newSalt() -> String {
        var generator = SystemRandomNumberGenerator()
        return (0..<16).map { _ in String(format: "%02x", UInt8.random(in: 0...255, using: &generator)) }.joined()
    }
    static func digest(salt: String, pin: String) -> String {
        SHA256.hash(data: Data("\(salt):\(pin)".utf8)).map { String(format: "%02x", $0) }.joined()
    }
    static func pinMatches(_ pin: String, _ authorisation: Authorisation) -> Bool {
        let given = Array(digest(salt: authorisation.pinSalt, pin: pin).utf8)
        let kept = Array(authorisation.pinDigest.utf8)
        guard given.count == kept.count else { return false }
        return zip(given, kept).reduce(UInt8(0)) { $0 | ($1.0 ^ $1.1) } == 0
    }
}
