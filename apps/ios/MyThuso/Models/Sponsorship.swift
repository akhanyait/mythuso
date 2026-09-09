import Foundation

/* Somebody paying for somebody else's care, from the payer's side.
 *
 * The back office has had this for as long as the programmes contract has existed — a statement, a
 * consent, and the two lists that decide what a sponsor may know; ProgrammesView renders all of it
 * for a reviewer. The person actually paying had no screen at all: "Sponsored care" was a word
 * under a family member's name and there was nowhere to press it. This is the patient
 * application's reading of the same contract, and it is apps/web/src/lib/sponsorship.ts's
 * reasoning rather than a second one.
 *
 * THE INTERESTING HALF IS THE REFUSAL, AND IT IS NOT A NEW ONE. A sponsor sees that care happened,
 * when, and what it cost. They do not see why the visit happened, what was found, or whether
 * anything needs following up — "a second visit is needed" is a finding wearing a diary entry's
 * clothes. Whether the service is even named is the recipient's switch, per sponsor, because a line
 * reading "sexual health screening" discloses more than most diagnoses do. All of that is
 * packages/catalog/programmes.json's, word for word, generated into ProgrammesData.swift, and none
 * of it is written here.
 *
 * The one thing this file adds to the contract is the join to the guardian scope model: record
 * access is a separate decision, made by the recipient, in her own account, and the least scope
 * MyThuso offers — bookings and payments only — is still more than paying for care grants. A
 * sponsorship grants nothing at all. That is the sentence a sponsor is owed before they pay rather
 * than after.
 *
 * WHAT BELONGS IN A CONTRACT AND IS NOT THERE. programmes.json's statement names its recipient
 * ("Grace Mokoena") and this app's household names hers, and the two are different people. The
 * screen shows the account holder's own family member, because a person opening "care you pay for"
 * in their own app is looking at their own mother — and every figure on it, what was set aside and
 * each line's service, date and amount, is still the contract's. The right fix is a reference in
 * the contract to the household rather than a second name in it; that is reported rather than
 * patched around, and there is nowhere here to type an amount.
 *
 * No payment is taken, no statement is issued and no sponsorship exists. */

enum Sponsorship {
    static var statement: SponsorStatement { Programmes.statement }
    static var lines: [StatementLine] { statement.lines }
    static var setAside: Int { statement.setAside }
    static var used: Int { statement.spent }
    static var left: Int { statement.remaining }
    static var namingNote: String { statement.note }
    static var sees: [Disclosure] { Programmes.sponsorSees }
    static var neverSees: [Disclosure] { Programmes.sponsorNeverSees }
    static var consent: SponsorConsent { Programmes.sponsorConsent }

    /// The rule a sponsor is owed before they pay rather than after. The guardian scope model is
    /// joined to it on the screen, where the component that draws a scope already lives.
    static var payingIsNotPermission: ProgrammeRule { Programmes.rule("paying-is-not-permission") }
    static var cannotRequireDetail: ProgrammeRefusal { Programmes.refusal("require-the-detail") }

    /* Whether this recipient has let this sponsor see which visit each line was. The statement's
       own note says she has — "which visit it was appears only because the recipient has switched
       that on for this sponsor, and she can switch it off again without saying why" — so it is her
       fact, read from the contract rather than defaulted to the friendlier answer. A stored
       property so the other branch stays live code: the day the contract carries the switch itself,
       this reads it. */
    static let serviceIsNamed = true

    /// Which of the two line-detail settings the recipient has switched on. It is read here and is
    /// never a control on the screen: a sponsor is not the person whose switch it is, so offering
    /// them one — even a disabled one — would be offering them the thing the contract refuses.
    static func lineDetail(_ id: String) -> LineDetailChoice {
        Programmes.lineDetailChoices.first { $0.id == id } ?? Programmes.lineDetailChoices[0]
    }
    static var namedDetail: LineDetailChoice { lineDetail("service-named") }
    static var amountOnlyDetail: LineDetailChoice { lineDetail("amount-only") }
    static var currentDetail: LineDetailChoice { serviceIsNamed ? namedDetail : amountOnlyDetail }

    /// What each line says it was. When the recipient has not switched naming on, the line says
    /// that care was given and nothing more — the amount and the date are the whole of a payer's
    /// business.
    static func lineName(_ line: StatementLine) -> String {
        serviceIsNamed ? line.service : "Care was given"
    }

    /// How much of what was set aside has been drawn, as a count of visits rather than a
    /// percentage: a sponsorship is a number of visits paid for, which is what somebody is actually
    /// keeping track of, not a proportion of a budget.
    static var visitsPaidFor: Int { lines.count }
}
