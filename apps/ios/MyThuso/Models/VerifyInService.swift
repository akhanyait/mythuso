import Foundation

/* Verify in service on iOS: a shift started with no face match, the code a nurse shows at a door, and the
 * patient's check of it. Every word is VerifyInServiceData.swift, generated from the contract; this file is the
 * arithmetic, and it is the same arithmetic packages/engines/src/trust/domain does on the engine runtime.
 *
 * NO MATCH, EVER, ON THIS PHONE. A shift start's outcome is the contract's not-integrated and nothing else, and
 * there is no case for a match: no identity provider is contracted, and whether a face match is biometric
 * information is the Information Officer's undecided D-3. This target declares no camera use for it.
 *
 * THE DOOR CODE IS DIGITS. A QR code would need a scanner in every patient's app, and six digits can be read
 * through a closed door. The tries belong to the visit, not the code, so asking for a new code does not reset them;
 * an expired code is refused and is not a try; "not my nurse" is taken at any time and "she is my nurse" only
 * after a code matched. A match hands the patient a name and a tier name, never a number.
 *
 * The numbers are the contract's defaults, generated: an admin changes them on the web, and this app has no admin
 * surface. Nothing here is a real service: no desk is told and no incident is raised.
 */
struct VerifyInServiceChoice: Identifiable, Hashable {
    let id: String
    let label: String
}

struct VerifyInServiceRefusal: Hashable, Error {
    let id: String
    let status: Int
    let statement: String
}

enum VerifyInService {
    static func refusal(_ id: String) -> VerifyInServiceRefusal {
        guard let found = VerifyInService.refusals.first(where: { $0.id == id }) else {
            preconditionFailure("VerifyInServiceData has no refusal \(id); regenerate it with npm run verify-in-service.")
        }
        return found
    }

    static func label(_ list: [VerifyInServiceChoice], _ id: String) -> String {
        list.first(where: { $0.id == id })?.label ?? id
    }

    static func fill(_ sentence: String, _ values: [String: String]) -> String {
        values.reduce(sentence) { text, pair in text.replacingOccurrences(of: "{\(pair.key)}", with: pair.value) }
    }

    // MARK: - The shift

    struct ShiftStart: Equatable {
        let startedAt: Date
        /// The contract's not-integrated. There is no other value to hold.
        let outcome: String
        let dispatchRule: String
        var online: Bool { dispatchRule == "offer-with-desk-flag" }
    }

    static func startShift(at: Date, badgeCurrent: Bool) -> Result<ShiftStart, VerifyInServiceRefusal> {
        guard badgeCurrent else { return .failure(VerifyInService.refusal("no-current-verification-to-start")) }
        return .success(ShiftStart(startedAt: at, outcome: VerifyInService.matchOutcome, dispatchRule: VerifyInService.unmatchedShiftStartDispatch))
    }

    static func nurseLine(_ shift: ShiftStart) -> String { VerifyInService.label(VerifyInService.dispatchRules, shift.dispatchRule) }

    // MARK: - The door

    struct DoorCode: Equatable {
        let digits: String
        let nurseName: String
        let badgeTier: String?
        let expiresAt: Date
        let attemptsAllowed: Int
    }

    enum Tried: Equatable {
        case codeFits(nurseName: String, tierName: String?)
        case wrong(attemptsLeft: Int)
        case mismatch
    }

    struct DoorCheck: Equatable {
        var code: DoorCode? = nil
        var attemptsUsed = 0
        var codeFits = false
        var closedAs: String? = nil

        var attemptsLeft: Int { max(0, (code?.attemptsAllowed ?? VerifyInService.doorCodeAttempts) - attemptsUsed) }

        mutating func show(nurseName: String, badgeTier: String?, at now: Date) -> Result<DoorCode, VerifyInServiceRefusal> {
            guard badgeTier != nil else { return .failure(VerifyInService.refusal("no-badge-to-show-at-a-door")) }
            guard closedAs == nil else { return .failure(VerifyInService.refusal("door-check-closed")) }
            let digits = String((0..<VerifyInService.doorDigits).map { _ in "0123456789".randomElement()! })
            let shown = DoorCode(digits: digits, nurseName: nurseName, badgeTier: badgeTier,
                                 expiresAt: now.addingTimeInterval(TimeInterval(VerifyInService.doorCodeMinutes * 60)),
                                 attemptsAllowed: VerifyInService.doorCodeAttempts)
            code = shown
            codeFits = false
            return .success(shown)
        }

        mutating func attempt(_ typed: String, at now: Date) -> Result<Tried, VerifyInServiceRefusal> {
            guard let held = code else { return .failure(VerifyInService.refusal("no-door-code-for-this-visit")) }
            guard closedAs == nil else { return .failure(VerifyInService.refusal("door-check-closed")) }
            guard now < held.expiresAt else { return .failure(VerifyInService.refusal("door-code-expired")) }
            if typed.filter(\.isNumber) == held.digits {
                codeFits = true
                return .success(.codeFits(nurseName: held.nurseName, tierName: held.badgeTier.map { VerifyInService.label(VerifyInService.tiers, $0) }))
            }
            attemptsUsed += 1
            if attemptsLeft > 0 { return .success(.wrong(attemptsLeft: attemptsLeft)) }
            closedAs = "attempts-used"
            return .success(.mismatch)
        }

        /// True when the desk would be told.
        mutating func answer(_ id: String) -> Result<Bool, VerifyInServiceRefusal> {
            if id == "not-my-nurse" {
                if closedAs != nil && closedAs != "verified" { return .success(true) }
                closedAs = "not-my-nurse"
                return .success(true)
            }
            guard closedAs == nil else { return .failure(VerifyInService.refusal("door-check-closed")) }
            guard codeFits else { return .failure(VerifyInService.refusal("door-answer-before-code")) }
            closedAs = "verified"
            return .success(false)
        }
    }
}

/* The preview's one door check and one shift, in memory, shared by the nurse's workspace and the patient's
   screens on this phone. A relaunch forgets both, which is true of the preview and would be a defect in the product. */
@MainActor
final class VerifyInServiceStore: ObservableObject {
    static let shared = VerifyInServiceStore()
    @Published var check = VerifyInService.DoorCheck()
    @Published var shown: VerifyInService.DoorCode?
    @Published var shift: VerifyInService.ShiftStart?
}
