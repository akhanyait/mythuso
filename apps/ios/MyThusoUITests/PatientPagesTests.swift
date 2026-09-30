import XCTest

/* Mental health and Activity on the iPhone, walked from More, held to what the web's
 * tests/patient-export-screens.spec.ts holds the same two pages to, and to the questions every screen in
 * this app answers at both ends of the content-size scale.
 *
 * The sentences asserted are packages/catalog/patient-pages.json's and the contracts it derives from. A
 * UI test runs in its own process and cannot read the app's generated data, so they are typed here, as
 * the other journeys type theirs; a changed sentence fails here first, which is the point.
 *
 * WHAT THESE PAGES REFUSE is the larger half of what is asserted: no "Available now", no "Book a
 * session", no row of mood faces, no step or minute figure, and on the phone no door to a page the phone
 * does not have. The crisis card's emergency door comes before its crisis lines, always. */
final class PatientPagesTests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    private let legibleAtAccessibilitySizes: CGFloat = 20

    private func open(_ app: XCUIApplication, _ page: String) {
        app.tabBars.buttons.element(boundBy: 4).tap()
        XCTAssertTrue(app.navigationBars["More"].waitForExistence(timeout: 30), "More did not open")
        tapAfterScrolling(app, app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", page)).firstMatch)
        XCTAssertTrue(app.navigationBars[page].waitForExistence(timeout: 30), "\(page) did not open from More")
    }
    private func openMentalHealth(_ app: XCUIApplication) { open(app, "Mental health") }
    private func openActivity(_ app: XCUIApplication) { open(app, "Activity") }

    private func texts(_ app: XCUIApplication, matching format: String, _ argument: String) -> XCUIElementQuery {
        app.descendants(matching: .any).matching(NSPredicate(format: format, argument))
    }

    // MARK: - Mental health

    func testMentalHealthPutsTheEmergencyScreenBeforeTheCrisisLinesAndDrawsNoSessionOrMoodScale() {
        let app = launchApp()
        openMentalHealth(app)
        XCTAssertTrue(app.staticTexts["Support for how you are feeling."].exists)
        XCTAssertTrue(app.staticTexts["This page carries general health information that no registered clinician has signed yet. Your nurse's advice comes first."].exists
                      || texts(app, matching: "label CONTAINS %@", "no registered clinician has signed yet").firstMatch.exists,
                      "the review notice is not on the page")

        /* The two doors whose pages the phone has, and neither of the two whose pages it does not. */
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Write down how you are'")).firstMatch.exists)
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'If you are in crisis'")).firstMatch.exists)
        XCTAssertFalse(texts(app, matching: "label BEGINSWITH %@", "Read about mental health").firstMatch.exists,
                       "the library door is drawn, and the phone has no health library for it to open")
        XCTAssertFalse(texts(app, matching: "label BEGINSWITH %@", "Helplines and support groups").firstMatch.exists,
                       "the helplines door is drawn, and the phone has no community page for it to open")

        /* What the export drew and this page refuses. */
        for refused in ["Available now", "Book a session", "See it in the catalogue"] {
            XCTAssertFalse(texts(app, matching: "label CONTAINS[c] %@", refused).firstMatch.exists, "the page says \"\(refused)\"")
        }
        for face in ["Great", "Good", "Okay", "Low", "Struggling"] {
            XCTAssertFalse(app.buttons[face].exists, "the page draws a mood face, \"\(face)\"")
        }
        XCTAssertTrue(texts(app, matching: "label == %@", "There is no score, no grade and no weight goal in MyThuso.").firstMatch.exists)
        XCTAssertTrue(texts(app, matching: "label CONTAINS %@", "Mental-health check-in · Phase 3").firstMatch.exists,
                      "the counselling check-in's catalogue entry is not where the button would be")

        /* The crisis door brings the card into view; its emergency button is above its first line. */
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'If you are in crisis'")).firstMatch.tap()
        let emergency = app.buttons["Open Emergency & urgent care"]
        let line = app.descendants(matching: .any).matching(identifier: "pp-crisis-line").firstMatch
        XCTAssertTrue(emergency.waitForExistence(timeout: 10))
        XCTAssertTrue(emergency.isHittable, "the crisis door did not bring the crisis card into view")
        XCTAssertEqual(app.descendants(matching: .any).matching(identifier: "pp-crisis-line").count, 2)
        XCTAssertLessThan(emergency.frame.minY, line.frame.minY, "a crisis line is above the door to the emergency screen")
        XCTAssertTrue(texts(app, matching: "label == %@", "Nothing here dials a crisis line by itself. The numbers are shown so that you can call them from your own phone.").firstMatch.exists)
        XCTAssertFalse(app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'call'")).firstMatch.exists,
                       "a crisis line has a call action; nothing here dials")

        emergency.tap()
        XCTAssertTrue(app.navigationBars["Thuso SOS"].waitForExistence(timeout: 30), "the emergency screen did not open")
    }

    // MARK: - Activity

    func testActivityCountsOnlyTheEntriesListedAndMeasuresNothing() {
        let app = launchApp()
        openActivity(app)
        XCTAssertTrue(texts(app, matching: "label == %@", "Nothing here is measured. No watch, band or phone sensor is connected, and none is read.").firstMatch.exists)
        let entries = app.descendants(matching: .any).matching(identifier: "pp-moving-entry").count
        XCTAssertGreaterThan(entries, 0, "the sample journal has Moving entries and none are listed")
        let count = app.descendants(matching: .any)["pp-tile-entries"]
        XCTAssertTrue(count.label.hasPrefix("Your Moving entries: \(entries)."),
                      "the count tile says \"\(count.label)\" over \(entries) listed entries")
        for tile in ["pp-tile-steps", "pp-tile-minutes"] {
            XCTAssertTrue(app.descendants(matching: .any)[tile].label.contains(": Not measured."), "\(tile) carries a figure")
        }
        let figures = app.staticTexts.allElementsBoundByIndex.map(\.label).filter {
            $0.range(of: #"\d[\d ]* steps|\d+ min\b"#, options: [.regularExpression, .caseInsensitive]) != nil
        }
        XCTAssertTrue(figures.isEmpty, "the page shows a measured figure: \(figures)")

        tapAfterScrolling(app, app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'See connected devices'")).firstMatch)
        XCTAssertTrue(app.staticTexts["What would never be read"].waitForExistence(timeout: 30),
                      "the wearable door did not open the device permission screen")
    }

    // MARK: - Usable at both content sizes

    private func audit(_ name: String, contentSize: [String], journey: (XCUIApplication) -> Void) -> ScreenAudit {
        let app = launchApp(contentSize: contentSize)
        journey(app)
        capture(app, named: name)
        let audit = ScreenAudit(app, screen: name)
        audit.sweep()
        capture(app, named: "\(name) — bottom")
        return audit
    }

    private func bothSizes(_ name: String, journey: @escaping (XCUIApplication) -> Void) {
        assertUsable(audit("\(name) at the default content size", contentSize: [], journey: journey))
        let largest = audit("\(name) at AccessibilityXXXL", contentSize: Audit.largestAccessibilitySize, journey: journey)
        assertUsable(largest)
        let unreadable = largest.textShorterThan(legibleAtAccessibilitySizes)
        XCTAssertTrue(unreadable.isEmpty,
                      "\(largest.name): \(unreadable.count) string(s) came out under \(Int(legibleAtAccessibilitySizes)) points at the largest accessibility size.\n  · " +
                      unreadable.joined(separator: "\n  · "))
    }

    func testTheMentalHealthPageIsUsable() { bothSizes("Mental health", journey: openMentalHealth) }
    func testTheActivityPageIsUsable() { bothSizes("Activity", journey: openActivity) }

    /* Every resting position of a page, written beside the run when THUSO_SHOTS is set, so the whole of
       each page is looked at rather than its top and its footer. */
    func testCaptureEveryPositionOfBothPages() {
        for (name, journey) in [("Mental health", openMentalHealth), ("Activity", openActivity)] as [(String, (XCUIApplication) -> Void)] {
            let app = launchApp()
            journey(app)
            let scroller = app.scrollViews.firstMatch
            for position in 0..<8 {
                capture(app, named: "\(name) — position \(position)")
                scroller.swipeUp()
            }
        }
    }

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
