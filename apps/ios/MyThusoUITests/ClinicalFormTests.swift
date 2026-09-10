import XCTest

/* The six screens that were still system `Form`s and `List`s, walked at both ends of the scale.
 *
 * A `Form` hid a whole class of defect from this directory, and it is worth naming because it is
 * the reason these tests did not exist before. UIKit's grouped list is very good at its own layout:
 * it wraps a label rather than pushing it off the side, it gives every row at least a tappable
 * height, and it scrolls whatever it is given. So a screen built out of `Section` and
 * `LabeledContent` passes a reachability-and-target audit almost by construction, and the audit is
 * measuring UIKit rather than the design.
 *
 * The moment those six screens were composed by hand on `.thusoGround()`, all of that became this
 * codebase's problem: an HStack with a Spacer in it truncates instead of wrapping, a Menu label is
 * whatever height its text is, and a picture of a map inside a VStack is whatever the VStack allows
 * it to be. That is the trade the move makes — the design gets the hierarchy a Form will not give
 * it, and in exchange the design owns the layout at AccessibilityXXXL. These tests are the other
 * half of that trade.
 *
 * The same four questions as everywhere else in this directory: nothing runs off the side, nothing
 * a person must press is under 44 points, nothing comes back frozen at a size somebody has already
 * said they cannot read, and the thing the screen exists for is reachable by scrolling. Nothing
 * softer, because these are the screens a nurse works a visit in and a controller works a shift in.
 *
 * The screenshots are written beside the run rather than only attached, for the reason
 * PassportJourneyTests gives: a screen nobody looked at is a screen nobody verified. */
final class ClinicalFormTests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    /// The same floor DynamicTypeTests uses. A string under this at AccessibilityXXXL is a string
    /// that did not answer the setting.
    private let legibleAtAccessibilitySizes: CGFloat = 20

    // MARK: - Getting to each screen

    /* Tapped until it takes, rather than once. A tab bar exists in the tree before its buttons are
       hittable, so a tap synthesised in that window is delivered to nothing and the test reports
       that the tab did not open — which is a statement about the launch and not about the screen.
       On a loaded machine that gap is long enough to lose a tap perhaps one run in five. */
    private func openMore(_ app: XCUIApplication) {
        let more = app.tabBars.buttons.element(boundBy: 4)
        for _ in 0..<5 {
            if app.navigationBars["More"].exists { return }
            if more.waitForExistence(timeout: 10), more.isHittable { more.tap() }
            if app.navigationBars["More"].waitForExistence(timeout: 10) { return }
        }
        XCTFail("the More tab did not open after five attempts")
    }

    /* A workspace is entered rather than pushed: it covers the patient's tab bar with a tab bar of
       its own, so the section is chosen on that second bar and not on the first.

       The row that enters a workspace and the bar that says you are in one are two different
       strings — "Nurse workspace" on More, "Nurse" on the navigation bar, because the bar carries
       the workspace and the screen carries the section. Asserting the row's own label against the
       bar is what made the first run of this file report that the workspace had not opened when it
       had. */
    private func enterWorkspace(_ app: XCUIApplication, row: String, bar: String, section: Int) {
        openMore(app)
        tapAfterScrolling(app, app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", row)).firstMatch)
        XCTAssertTrue(app.navigationBars[bar].waitForExistence(timeout: 30), "the \(row) did not open")
        app.tabBars.buttons.element(boundBy: section).tap()
    }

    private func openAssessment(_ app: XCUIApplication) {
        enterWorkspace(app, row: "Nurse workspace", bar: "Nurse", section: 1)
        tapAfterScrolling(app, app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Visit assessment'")).firstMatch)
        XCTAssertTrue(app.navigationBars["Visit assessment"].waitForExistence(timeout: 30),
                      "the visit assessment did not open")
    }

    private func openDispatch(_ app: XCUIApplication) {
        enterWorkspace(app, row: "Control Tower", bar: "Control Tower", section: 0)
        tapAfterScrolling(app, app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Live dispatch board'")).firstMatch)
        XCTAssertTrue(app.navigationBars["Dispatch"].waitForExistence(timeout: 30),
                      "the dispatch board did not open")
    }

    private func openLabOrder(_ app: XCUIApplication) {
        enterWorkspace(app, row: "Partner workspace", bar: "Partner", section: 2)
        tapAfterScrolling(app, app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'LAB-'")).firstMatch)
        XCTAssertTrue(app.navigationBars["Laboratory order"].waitForExistence(timeout: 30),
                      "the laboratory order did not open")
    }

    private func openKit(_ app: XCUIApplication) {
        openMore(app)
        tapAfterScrolling(app, app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Thuso Kit'")).firstMatch)
        XCTAssertTrue(app.navigationBars["Thuso Kit"].waitForExistence(timeout: 30), "Thuso Kit did not open")
    }

    private func openLanguage(_ app: XCUIApplication) {
        openMore(app)
        tapAfterScrolling(app, app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Language'")).firstMatch)
        XCTAssertTrue(app.navigationBars["Language"].waitForExistence(timeout: 30), "the language screen did not open")
    }

    private func openFirstRun(_ app: XCUIApplication) {
        openMore(app)
        tapAfterScrolling(app, app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'First-run'")).firstMatch)
        XCTAssertTrue(app.navigationBars["Set up MyThuso"].waitForExistence(timeout: 30),
                      "the first-run flow did not open")
    }

    // MARK: - The audit

    private func audit(_ name: String, contentSize: [String], journey: (XCUIApplication) -> Void) -> ScreenAudit {
        let app = launchApp(contentSize: contentSize)
        journey(app)
        /* The top of the screen before the sweep and the bottom after it. A sweep leaves the view at
           its last resting position, so a single shot taken at the end is a picture of the footer —
           which is how a screen gets called verified without anybody having seen the part a person
           actually opens it for. */
        capture(app, named: name)
        let audit = ScreenAudit(app, screen: name)
        audit.sweep()
        capture(app, named: "\(name) foot")
        return audit
    }

    @discardableResult
    private func auditBothSizes(_ name: String, journey: (XCUIApplication) -> Void) -> ScreenAudit {
        assertUsable(audit("\(name) at the default content size", contentSize: [], journey: journey))
        let largest = audit("\(name) at AccessibilityXXXL", contentSize: Audit.largestAccessibilitySize, journey: journey)
        assertUsable(largest)
        let unreadable = largest.textShorterThan(legibleAtAccessibilitySizes)
        XCTAssertTrue(unreadable.isEmpty,
                      "\(largest.name): \(unreadable.count) string(s) came out under \(Int(legibleAtAccessibilitySizes)) points at the largest accessibility size, which is text that did not scale with the setting.\n  · " +
                      unreadable.joined(separator: "\n  · "))
        return largest
    }

    // MARK: - The screens

    /* The assessment is the one a nurse stands in somebody's kitchen holding, so the thing asserted
       past the audit is that she can still reach the button that moves the visit on. Seven readings
       and an instrument list at AccessibilityXXXL is a long way down. */
    func testTheVisitAssessmentIsUsable() {
        let largest = auditBothSizes("The visit assessment", journey: openAssessment)
        XCTAssertTrue(largest.sawHittable("Confirm identity"),
                      "the button that starts the visit was never reachable at the largest content size — \(largest.whyNotHittable("Confirm identity"))")
    }

    /* The board carries a map, a strip of figures, a choice of three visits and seven nurse rows.
       The visit selector is what this is really asking about: it was a segmented control, which at
       these sizes rendered three references as three ellipses.

       This one is load-sensitive and the message below says so. It failed once on a machine at load
       150 and passed on the same commit on a quiet one, because hittability is asked only where the
       control is clear of both bars at a *resting* position — and a machine that cannot settle a
       scroll between swipes never gives it one. A failure here is worth reading twice before it is
       believed, which is why whyNotHittable() exists: it separates "never in the tree" from "never
       clear of the bars", and only the first is a defect in the screen. */
    func testTheDispatchBoardIsUsable() {
        let largest = auditBothSizes("The dispatch board", journey: openDispatch)
        XCTAssertTrue(largest.sawHittable("TH-2052"),
                      "the third visit on the board was never reachable or readable at the largest content size — a controller choosing between jobs must be able to read which job. \(largest.whyNotHittable("TH-2052"))")
    }

    func testTheLaboratoryOrderIsUsable() {
        auditBothSizes("The laboratory order", journey: openLabOrder)
    }

    func testThusoKitIsUsable() {
        auditBothSizes("Thuso Kit", journey: openKit)
    }

    func testTheLanguageScreenIsUsable() {
        auditBothSizes("The language screen", journey: openLanguage)
    }

    func testTheFirstRunFlowIsUsable() {
        let largest = auditBothSizes("The first-run flow", journey: openFirstRun)
        XCTAssertTrue(largest.sawHittable("Create my account"),
                      "the button that starts sign-up was never reachable at the largest content size")
    }

    // MARK: - Screenshots

    private func capture(_ app: XCUIApplication, named: String) {
        let shot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: shot)
        attachment.name = named
        attachment.lifetime = .keepAlways
        add(attachment)
        guard let directory = ProcessInfo.processInfo.environment["THUSO_SHOTS"] else { return }
        let file = URL(fileURLWithPath: directory)
            .appendingPathComponent(named.replacingOccurrences(of: " ", with: "-") + ".png")
        try? FileManager.default.createDirectory(atPath: directory, withIntermediateDirectories: true)
        try? shot.pngRepresentation.write(to: file)
    }
}
