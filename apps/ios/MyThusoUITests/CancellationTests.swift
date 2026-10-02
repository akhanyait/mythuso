import XCTest

/* Cancelling a visit, and moving one, on a running app.
 *
 * The defect this closes is not a wrong number, it is an absence. Both native apps promised on the
 * booking confirmation that a visit could be cancelled or moved up to two hours before it; neither
 * offered a cancel control anywhere, and every "Cancel" in the iOS tree dismissed a dialog. The
 * Cancelled tab has been showing the outcome of an action nobody was offered. An absence is exactly
 * what scripts/check-boundaries.mjs cannot see — it reads what is written, and nothing was — so it
 * is asserted here instead, against what a person can actually reach and tap.
 *
 * Five questions, and the last two matter more than the first three.
 *
 * A cancelled visit lands under Cancelled with the reason it was given, because a visit that
 * vanishes is one nobody can ask about afterwards.
 *
 * A moved visit is the same visit at a different hour rather than a second one beside the first.
 *
 * A visit that has begun refuses, and says why. A booking screen cannot end an encounter happening
 * in somebody's house.
 *
 * A late one is never refused. The alternative to letting somebody cancel late is a nurse arriving
 * at a door nobody opens.
 *
 * And no screen in the flow states a charge or shows a figure of money. What a late cancellation
 * costs is an open commercial and legal question — section 47 of the Consumer Protection Act — held
 * in the contract as pendingDecision, and the one screen where an invented number would certainly
 * be read as a promise is the screen where somebody is deciding whether to cancel. That is asserted
 * in the late state as well as the early one, because the late state is where a fee would go.
 *
 * Sentences are asserted by their opening clause rather than word for word. A UI test runs against
 * a built app it cannot import, so restating a contract sentence in full here would be a second
 * copy of it — the thing packages/catalog/cancellation.json exists to prevent — and it would drift
 * the first time a word changed. The wording is the build's question; whether a person is told
 * anything at all is this file's.
 */
final class CancellationTests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    /// The opening clauses. Each is the part of a contract sentence a person would notice the
    /// absence of; the rest of each sentence is held by the build against the JSON.
    private let offersTheMove = "If the day is the problem"
    private let cancelledWords = "This visit is cancelled"
    private let refusalWords = "This visit has already started"

    /// The moments, as the contract names them. They are the labels of the preview control that
    /// stands in for a schedule this app does not have.
    private let late = "Less than 2 hours before"
    private let arrived = "The nurse has arrived"

    /* Stating a charge, in the shapes it would arrive in. Deliberately the same list
       scripts/check-boundaries.mjs holds the contract to, so the screen and the file are refused
       the same sentences. "no card is charged" — the payments capability's own notice — is not one
       of them, and must not be: that sentence is the absence of a charge, said out loud. */
    private let statesACharge = "(cancellation fee|late fee|forfeit|non-refundable|will be charged|charged R|charged [0-9]|% of)"
    /* Any amount at all. Nothing in this flow has a price on it, and nothing should. Matched with
       case, and only after a character that is not a letter: "September 2026" is a date on a visit
       and not a rand figure, and a check that cannot tell them apart is a check somebody deletes. */
    private let anAmount = "(^|[^A-Za-z])R ?[0-9]"

    // MARK: - Getting there

    private func openVisits(_ app: XCUIApplication) {
        app.tabBars.buttons.element(boundBy: 2).tap()
        XCTAssertTrue(app.navigationBars["Your visits"].waitForExistence(timeout: 30), "the visits tab did not open")
    }

    private func openCancelScreen(_ app: XCUIApplication) {
        openVisits(app)
        tapAfterScrolling(app, app.buttons["View details"].firstMatch)
        XCTAssertTrue(app.navigationBars["Visit details"].waitForExistence(timeout: 20), "the visit's own screen did not open")
        tapAfterScrolling(app, app.buttons["Cancel this visit"].firstMatch)
        XCTAssertTrue(app.navigationBars["Cancel or move"].waitForExistence(timeout: 20),
                      "there is no way from a visit to cancelling it. The booking confirmation promises there is.")
    }

    /* Back to the top first: the moments sit near the head of the screen, and tapAfterScrolling only
       ever swipes downwards through content. A sweep that has just read the foot of the screen
       leaves them above it. */
    private func tapMoment(_ app: XCUIApplication, _ name: String) {
        scrollToTop(app)
        tapAfterScrolling(app, app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", name)).firstMatch)
    }

    /// Everything readable on this screen, gathered while scrolling to the bottom of it.
    private func sweepText(_ app: XCUIApplication, steps: Int = 12) -> [String] {
        var found: Set<String> = []
        let scroller = app.scrollViews.firstMatch.exists ? app.scrollViews.firstMatch : app
        for _ in 0..<steps {
            let visible = staticLabels(app)
            let before = found.count
            found.formUnion(visible)
            if found.count == before && before > 0 { break }
            scroller.swipeUp()
        }
        return Array(found)
    }

    /* Read from one snapshot of the tree, the way AccessibilityAudit measures. allElementsBoundByIndex
       asks for each label by its position afterwards, and a list still settling after a swipe had
       fewer elements by then: "No matches found for Element at index 30" failed a different test of
       this file on each run while nothing the tests assert about had changed. */
    private func staticLabels(_ app: XCUIApplication) -> [String] {
        guard let root = try? app.snapshot() else { return [] }
        var labels: [String] = []
        func walk(_ node: XCUIElementSnapshot) {
            if node.elementType == .staticText { labels.append(node.label) }
            for child in node.children { walk(child) }
        }
        walk(root)
        return labels
    }

    /// Back to the top of a list a sweep has just scrolled to the bottom of.
    private func scrollToTop(_ app: XCUIApplication, steps: Int = 8) {
        let scroller = app.scrollViews.firstMatch.exists ? app.scrollViews.firstMatch : app
        for _ in 0..<steps { scroller.swipeDown() }
    }

    private func says(_ app: XCUIApplication, opening: String) -> Bool {
        app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", opening)).firstMatch.waitForExistence(timeout: 10)
    }

    private func matches(_ text: [String], _ pattern: String, ignoringCase: Bool = true) -> [String] {
        let options: String.CompareOptions = ignoringCase ? [.regularExpression, .caseInsensitive] : [.regularExpression]
        return text.filter { $0.range(of: pattern, options: options) != nil }
    }

    // MARK: - The journey

    func testCancellingAVisitLandsUnderCancelledWithTheReasonGiven() {
        let app = launchApp()
        openCancelScreen(app)

        /* The move is offered before the cancellation is. A person who wanted a different day and
           is shown nothing but a cancel button cancels, and the visit is gone for a reason that was
           never about the visit. */
        XCTAssertTrue(says(app, opening: offersTheMove),
                      "the cancel screen does not offer to move the visit first. packages/catalog/cancellation.json says reschedule.offeredBeforeCancelling.")
        XCTAssertTrue(app.buttons["Move this visit instead"].exists, "the move is described and not offered")

        let reason = "I no longer need this visit"
        tapAfterScrolling(app, app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", reason)).firstMatch)
        tapAfterScrolling(app, app.buttons["Cancel this visit"].firstMatch)

        XCTAssertTrue(says(app, opening: cancelledWords),
                      "the confirmation does not use the words the contract gives this moment")
        XCTAssertFalse(app.buttons["Cancel this visit"].exists, "the cancel button is still on the confirmation")

        tapAfterScrolling(app, app.buttons["See your cancelled visits"].firstMatch)
        XCTAssertTrue(app.navigationBars["Your visits"].waitForExistence(timeout: 20), "the visit list did not open")

        /* Not deleted. It is under Cancelled, it is the visit that was cancelled rather than the
           fictional one that was always there, and it carries the reason that was given. */
        let listed = sweepText(app)
        XCTAssertTrue(listed.contains { $0.contains("Vitals & chronic check") },
                      "the cancelled visit is not in the Cancelled list. A cancelled visit is not deleted — it stays with the reason given.")
        XCTAssertTrue(listed.contains { $0.contains(reason) },
                      "the Cancelled list does not carry the reason that was given: \(listed.sorted())")

        scrollToTop(app)
        app.buttons["Upcoming"].tap()
        XCTAssertFalse(sweepText(app).contains { $0.contains("Vitals & chronic check") },
                       "the cancelled visit is still listed as upcoming")
    }

    /* The one refusal, and the only one. A visit that has begun and stopped is an outcome of the
       visit; it belongs to the clinical record rather than to a booking screen. */
    func testAVisitThatHasBegunRefusesAndSaysSo() {
        let app = launchApp()
        openCancelScreen(app)
        tapMoment(app, arrived)

        XCTAssertTrue(says(app, opening: refusalWords),
                      "a visit that has already started does not say so — it just fails to offer anything")
        XCTAssertFalse(app.buttons["Cancel this visit"].exists,
                       "a visit that has already started still offers to cancel itself from the booking screen")
        XCTAssertFalse(app.buttons["Move this visit instead"].exists,
                       "a visit that has already started still offers to be moved")
    }

    /* Late is never refused, and this is the assertion that says so. The alternative to letting
       somebody cancel late is a nurse arriving at a door nobody opens. */
    func testCancellingLateIsAllowedAndIsRecordedAsLate() {
        let app = launchApp()
        openCancelScreen(app)
        tapMoment(app, late)

        XCTAssertTrue(app.buttons["Cancel this visit"].exists, "cancelling inside the window is refused. It must never be.")
        tapAfterScrolling(app, app.buttons["Cancel this visit"].firstMatch)
        XCTAssertTrue(says(app, opening: cancelledWords), "cancelling late did not cancel the visit")

        tapAfterScrolling(app, app.buttons["See your cancelled visits"].firstMatch)
        XCTAssertTrue(sweepText(app).contains { $0.contains(late) },
                      "a late cancellation is not recorded as late anywhere a person can see it")
    }

    // MARK: - Money, and the absence of it

    func testNoScreenInTheFlowStatesAChargeOrShowsAnAmount() {
        let app = launchApp()
        openCancelScreen(app)

        var seen = sweepText(app)
        /* The late state as well as the early one, because a fee, if anybody ever invented one,
           would be invented here. */
        tapMoment(app, late)
        seen += sweepText(app)
        scrollToTop(app)
        tapAfterScrolling(app, app.buttons["Cancel this visit"].firstMatch)
        XCTAssertTrue(says(app, opening: cancelledWords), "the late cancellation did not confirm")
        seen += sweepText(app)

        let charges = matches(seen, statesACharge)
        XCTAssertTrue(charges.isEmpty,
                      "a screen in the cancellation flow states a charge: \(charges). What a patient pays for cancelling late is an open commercial and legal question, recorded in the contract as pendingDecision precisely so that nobody writes it into a screen on a Tuesday.")
        let amounts = matches(seen, anAmount, ignoringCase: false)
        XCTAssertTrue(amounts.isEmpty,
                      "a screen in the cancellation flow shows an amount of money: \(amounts). Nothing in this flow has a price on it, and a figure on the screen where somebody decides whether to cancel is read as what it will cost them.")

        /* And the sentence that is allowed to be there, which is not this screen's own: it comes
           from the payments capability, so it disappears from every platform at once the day a
           provider is connected. */
        /* Asked by identifier, not by words. This asserted the literal "No payment is taken" and
           went red the day `payments` became a simulated capability and its notice changed — a test
           carrying its own copy of a contract sentence, which is precisely what CapabilityNotice
           exists to stop a *screen* doing. The question worth asking is unchanged: is the screen
           still speaking about payment, out of the contract rather than in its own words. */
        XCTAssertTrue(app.descendants(matching: .any)["capability-notice-payments"].firstMatch.exists,
                      "the cancellation flow shows no payments notice at all. What happens to money when a visit is cancelled is a fact about a provider that does not exist yet, and the screen must say so in the contract's words rather than its own.")
    }

    // MARK: - Moving a visit keeps the same visit

    func testMovingAVisitChangesTheHourAndNothingElse() {
        let app = launchApp()
        openVisits(app)
        tapAfterScrolling(app, app.buttons["Reschedule"].firstMatch)
        XCTAssertTrue(app.navigationBars["Move this visit"].waitForExistence(timeout: 20), "the reschedule screen did not open")

        let start = "15:00"
        tapAfterScrolling(app, app.buttons[start])
        /* The end is read off the picker rather than worked out here. A test that recomputed it the
           way the app does would agree with the app about a wrong answer. */
        let footer = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "\(start) – ")).firstMatch
        XCTAssertTrue(footer.waitForExistence(timeout: 10), "the picker does not say when a visit starting at \(start) would end")
        guard let hours = footer.label.range(of: "\(start) – [0-9]{2}:[0-9]{2}", options: .regularExpression) else {
            return XCTFail("the picker says “\(footer.label)”, which does not name an hour the visit runs between")
        }
        let end = String(footer.label[hours].suffix(5))

        tapAfterScrolling(app, app.buttons["Move this visit"].firstMatch)
        XCTAssertTrue(says(app, opening: "This visit has moved"), "moving the visit did not confirm")

        tapAfterScrolling(app, app.buttons["See your visits"].firstMatch)
        let listed = sweepText(app)
        XCTAssertTrue(listed.contains { $0.contains("\(start) – \(end)") },
                      "the visit list does not carry the hour the visit was moved to")
        /* The same visit, not a second one. A move that minted a new visit would be a cancellation
           and a rebooking wearing a kinder word. */
        XCTAssertEqual(listed.filter { $0 == "Vitals & chronic check" }.count, 1,
                       "moving the visit left two of it in the list")
    }

    // MARK: - Usable, at both ends of the text-size scale

    /* The same audit the rest of the app is held to. A screen built out of radio rows and full-width
       buttons is where a 34-point target and a frozen point size get in, and the founder replaced a
       segmented control tonight for exactly that. */
    func testTheCancelScreenIsUsableAtBothTextSizes() {
        for (name, size) in [("the default content size", []), ("AccessibilityXXXL", Audit.largestAccessibilitySize)] {
            let app = launchApp(contentSize: size)
            openCancelScreen(app)
            let audit = ScreenAudit(app, screen: "The cancel screen at \(name)")
            audit.sweep()
            assertUsable(audit)
        }
    }
}
