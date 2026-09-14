import XCTest

/* The three screens the Health Passport offered and could not open, walked at both ends of the
 * content-size scale.
 *
 * Each of them is a screen a person makes a decision on — what a nurse found, how a reading has
 * moved, whether to hand an app the health store on their phone — so each is held to the same
 * questions DynamicTypeTests holds the home and the booking flow to: nothing runs off the side, no
 * control is under 44 points, and no string comes back frozen at a size somebody has already said
 * they cannot read.
 *
 * The last test is the one that could not be written before the screens existed: the device screen
 * must not grow a Connect button. A greyed-out primary would be the biggest thing on a screen that
 * has just finished explaining why it cannot do the one thing the button offers, and "disabled" is
 * exactly the state somebody enables in a hurry to make a demo look finished.
 *
 * The screenshots are written beside the run rather than only attached, because a screen nobody
 * looked at is a screen nobody verified — every serious defect found in this app was found by
 * looking at it, and an attachment inside an xcresult is not looking. */
final class PassportJourneyTests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    /// The same floor DynamicTypeTests uses: text that came back under this at the largest
    /// accessibility size is text that did not scale with the setting.
    private let legibleAtAccessibilitySizes: CGFloat = 20

    // MARK: - Getting to each screen

    private func openPassport(_ app: XCUIApplication) {
        app.tabBars.buttons.element(boundBy: 3).tap()
        XCTAssertTrue(app.staticTexts["Health trends"].waitForExistence(timeout: 30),
                      "the Health Passport did not open")
    }
    private func openTrends(_ app: XCUIApplication) {
        openPassport(app)
        tapAfterScrolling(app, app.buttons["See all"])
        XCTAssertTrue(app.staticTexts["Over time"].waitForExistence(timeout: 30),
                      "the trends screen did not open")
    }
    /* Scoped to the passport's own pill strip. `app.buttons["More"]` is ambiguous — the tab bar has
       a More of its own — and .firstMatch quietly took it, which navigated away from the screen the
       test was about and then reported that the screen had not opened. */
    private func section(_ app: XCUIApplication, _ name: String) -> XCUIElement {
        app.otherElements["Passport sections"].buttons[name]
    }
    private func openSummary(_ app: XCUIApplication) {
        openPassport(app)
        tapAfterScrolling(app, section(app, "Records"))
        tapAfterScrolling(app, app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Visit summary'")).firstMatch)
        XCTAssertTrue(app.staticTexts["What was measured"].waitForExistence(timeout: 30),
                      "the completed visit did not open")
    }
    private func openDevicePermission(_ app: XCUIApplication) {
        openPassport(app)
        tapAfterScrolling(app, section(app, "More"))
        tapAfterScrolling(app, app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Thuso Kit'")).firstMatch)
        XCTAssertTrue(app.staticTexts["What would never be read"].waitForExistence(timeout: 30),
                      "the device permission screen did not open")
    }

    func testRecordFiltersSeparateReviewsFromRecordedReadings() {
        let app = launchApp()
        openPassport(app)
        tapAfterScrolling(app, section(app, "Records"))
        let filters = app.otherElements["Record filters"]
        tapAfterScrolling(app, filters.buttons["Reviews"])
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label CONTAINS 'Doctor review completed'")).firstMatch.exists)
        XCTAssertFalse(app.buttons.matching(NSPredicate(format: "label CONTAINS 'Home visit readings'")).firstMatch.exists)
        filters.buttons["Readings"].tap()
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label CONTAINS 'Home visit readings'")).firstMatch.exists)
        XCTAssertFalse(app.buttons.matching(NSPredicate(format: "label CONTAINS 'Doctor review completed'")).firstMatch.exists)
        filters.buttons["All records"].tap()
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label CONTAINS 'Doctor review completed'")).firstMatch.exists)
    }

    // MARK: - Usable at both content sizes

    private func audit(_ name: String, contentSize: [String], journey: (XCUIApplication) -> Void) -> ScreenAudit {
        let app = launchApp(contentSize: contentSize)
        journey(app)
        /* The top of the screen before the sweep and the bottom after it. A sweep leaves the view
           at its last resting position, so a single shot taken at the end is a picture of the
           footer — which is how a screen gets called verified without anybody having seen the part
           a person actually opens it for. */
        capture(app, named: name)
        let audit = ScreenAudit(app, screen: name)
        audit.sweep()
        capture(app, named: "\(name) — bottom")
        return audit
    }

    private func bothSizes(_ name: String, journey: @escaping (XCUIApplication) -> Void) {
        assertUsable(audit("\(name) at the default content size", contentSize: [], journey: journey))
        let largest = audit("\(name) at AccessibilityXXXL",
                            contentSize: Audit.largestAccessibilitySize, journey: journey)
        assertUsable(largest)
        let unreadable = largest.textShorterThan(legibleAtAccessibilitySizes)
        XCTAssertTrue(unreadable.isEmpty,
                      "\(largest.name): \(unreadable.count) string(s) came out under \(Int(legibleAtAccessibilitySizes)) points at the largest accessibility size.\n  · " +
                      unreadable.joined(separator: "\n  · "))
    }

    func testTheCompletedVisitIsUsable() { bothSizes("A completed visit", journey: openSummary) }
    func testTheTrendsScreenIsUsable() { bothSizes("Health trends", journey: openTrends) }
    func testTheDevicePermissionScreenIsUsable() { bothSizes("A device permission", journey: openDevicePermission) }
    func testTheVisitQueueIsUsable() {
        bothSizes("The visit, waiting") { app in
            app.tabBars.buttons.element(boundBy: 4).tap()
            self.tapAfterScrolling(app, app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'The visit, waiting'")).firstMatch)
            XCTAssertTrue(app.staticTexts["Your work is on this phone."].waitForExistence(timeout: 30),
                          "the visit queue did not open")
        }
    }

    /* The two screens the design language changed most: the passport overview, where the readings
       became metrics, and More, where the destinations became pills. Neither is new, and both are
       swept here because a shared component changed under every screen in the app and the ones
       nobody looks at are the ones that break. */
    func testThePassportOverviewIsUsable() { bothSizes("The passport overview", journey: openPassport) }
    func testTheMoreScreenIsUsable() {
        bothSizes("More") { app in
            app.tabBars.buttons.element(boundBy: 4).tap()
            XCTAssertTrue(app.navigationBars["More"].waitForExistence(timeout: 30), "More did not open")
        }
    }

    /* The two workspaces a clinician actually lives in.
     *
     * They were the last system `Form`s in the app — grouped rows, system chevrons and a metric
     * drawn upside down — for a fortnight after every other screen had moved to the dashboard
     * language, because nothing walked them and so nobody looked at them. That is the whole reason
     * they are here: they carry a strip of large light numerals, a queue of three-column rows and a
     * timetable whose times are a column of their own, and each of those is a shape that fails
     * differently at three times the type than it does at one. */
    /* The bar is the workspace and the heading is the section, which is the breadcrumb the web
       shell draws as `Control Tower / Dispatch`. Both are asserted, because a workspace that opens
       on the wrong section is a workspace that opened. */
    private func openWorkspace(_ app: XCUIApplication, _ name: String, bar: String, landing: String) {
        app.tabBars.buttons.element(boundBy: 4).tap()
        /* Twice the usual scroll budget. The workspaces are the second-to-last group on a More
           screen that lists better than thirty destinations, and at AccessibilityXXXL every one of
           them is three lines tall — thirty swipes reaches the Nurse row and runs out somewhere
           above the Control Tower, which reads in a log as the screen not existing. */
        tapAfterScrolling(app, app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", name)).firstMatch, steps: 60)
        XCTAssertTrue(app.navigationBars[bar].waitForExistence(timeout: 30), "the \(name) did not open")
        /* Asked by identifier, not by heading text. This looked for a static text beginning with
           the section's name, which held while a landing section was titled and stopped holding the
           day it was framed with the role's two-tone headline instead — the workspace was opening on
           exactly the right section and the assertion could no longer see it. The question is
           unchanged: a workspace that opens on the wrong section is a workspace that opened. */
        XCTAssertTrue(app.descendants(matching: .any)["workspace-section-\(landing)"].firstMatch.waitForExistence(timeout: 30),
                      "the \(name) did not land on \(landing)")
    }
    func testTheNurseWorkspaceIsUsable() {
        bothSizes("The nurse workspace") { app in
            self.openWorkspace(app, "Nurse workspace", bar: "Nurse", landing: "Schedule")
        }
    }
    /* The doctor's queue, which had no journey at all until the deck landed on it — and it is the
       screen the deck changes most: a ring of one arc per case, a dial of what is pressing and one
       bar per row are three drawings that fail differently at three times the type than they do at
       one, and the two figures this screen used to carry were the two that were invented. */
    func testTheDoctorWorkspaceIsUsable() {
        bothSizes("The doctor workspace") { app in
            self.openWorkspace(app, "Doctor workspace", bar: "Doctor", landing: "Review queue")
        }
    }
    func testTheControlTowerIsUsable() {
        bothSizes("The Control Tower") { app in
            self.openWorkspace(app, "Control Tower", bar: "Control Tower", landing: "Dispatch")
        }
    }

    // MARK: - The refusals these screens exist to make

    /* No Connect button, enabled or disabled. The screen says the kit is not connected and why; a
       primary offering to connect it — even greyed out — is the loudest thing on the screen
       contradicting the sentence above it. */
    func testTheDeviceScreenOffersNoConnectButton() {
        let app = launchApp()
        openDevicePermission(app)
        var seen: [String] = []
        let scroller = app.scrollViews.firstMatch
        for _ in 0..<25 {
            seen += app.buttons.allElementsBoundByIndex.map(\.label)
            scroller.swipeUp()
        }
        let offering = seen.filter { $0.range(of: "connect", options: .caseInsensitive) != nil
            && $0.range(of: "not connected", options: .caseInsensitive) == nil }
        XCTAssertTrue(offering.isEmpty,
                      "the device permission screen offers to connect something: \(offering.joined(separator: ", ")). "
                      + "There is nothing to connect to, and a control saying otherwise is the screen contradicting its own notice.")
    }

    /* Every reading on the completed visit is judged against a range, and the range is on the
       screen. A value with no range beside it is a number a person is invited to interpret. */
    func testEveryReadingOnACompletedVisitCarriesItsRange() {
        let app = launchApp()
        openSummary(app)
        var text: [String] = []
        let scroller = app.scrollViews.firstMatch
        for _ in 0..<25 {
            text += app.staticTexts.allElementsBoundByIndex.map(\.label)
            scroller.swipeUp()
        }
        let joined = text.joined(separator: " | ")
        for reading in ["Blood pressure — systolic", "Pulse", "Blood glucose"] {
            XCTAssertTrue(joined.contains(reading), "\(reading) is not on the completed visit")
        }
        XCTAssertTrue(joined.contains("indicative range") || joined.contains("Indicative range"),
                      "no reading on the completed visit says what range it was judged against")
    }

    // MARK: - Looking at it

    /* Written to a directory the run is told about, so somebody can open the file rather than take
       a passing test's word for what the screen looks like. */
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
