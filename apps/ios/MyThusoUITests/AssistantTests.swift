import XCTest

/* Gilbert on iOS, asked the questions it exists to answer, on a running simulator.
 *
 * scripts/check-boundaries.mjs reads the source: that the microphone lives in one file and asks for
 * on-device recognition, that nothing records, that the usage descriptions are the contract's words.
 * It cannot prove any of that reached a running screen. This file opens the app and looks.
 *
 * Four things.
 *
 * The screen says what it is. The voice notice is on it — asked by the identifier CapabilityNotice
 * gives it from the capability's id, because a UI test cannot import the contract and a copy of the
 * sentence here would be a second copy of it. The sentence itself is held word for word by the build. The contract's
 * silenceIsNotSafety sentence is asked for by its opening words for the same reason.
 *
 * Typing works, and gets the contract's answers. A question in a person's own words gets the visit
 * answer; something Gilbert cannot match gets the honest answer with the ambulance number and a way
 * to a nurse; an emergency word in an ordinary sentence gets the ambulance.
 *
 * Nothing is asked at launch. Opening the app, and opening Gilbert, raises no system permission
 * prompt: the microphone is asked for after the contract's explanation, on the first tap to talk.
 * SpringBoard is where that prompt would appear, so it is asked directly.
 *
 * The matcher agrees with the contract. The app is launched with -GilbertSelfTest, which makes a debug
 * build run the shared fixtures in packages/catalog/assistant.json against Models/Assistant.swift and
 * put the result on the screen; the web runs the same list in Playwright and Android in a JVM test. And
 * the review's own sentence — an ordinary question with words Gilbert cannot read — is typed, and must
 * be followed by the unread answer.
 *
 * The keyboard's microphone is said to be the keyboard's, beside the field.
 *
 * And the screen is usable at both ends of the text-size scale. Whether the simulator can recognise
 * English on the device is its own business; this file does not tap to talk, because a test that
 * depends on a simulator's speech assets would be a test of the simulator.
 */
final class AssistantTests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    private func openGilbert(_ app: XCUIApplication) {
        app.tabBars.buttons.element(boundBy: 4).tap()
        XCTAssertTrue(app.navigationBars["More"].waitForExistence(timeout: 20), "the More tab did not open")
        tapAfterScrolling(app, app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Gilbert'")).firstMatch)
        XCTAssertTrue(app.navigationBars["Gilbert"].waitForExistence(timeout: 20), "Gilbert's screen did not open")
    }

    /* Kept with the result bundle, so the screens this file asserted on can be looked at afterwards
       rather than described. Nothing is written by the app; this is the test runner's own capture. */
    private func keep(_ app: XCUIApplication, _ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }

    private func systemPrompt() -> XCUIElement {
        XCUIApplication(bundleIdentifier: "com.apple.springboard").alerts.firstMatch
    }

    func testTheScreenSaysWhatItIs() {
        let app = launchApp()
        openGilbert(app)
        XCTAssertTrue(app.descendants(matching: .any)["capability-notice-voice"].firstMatch.waitForExistence(timeout: 20),
                      "Gilbert's screen does not render the voice capability's notice. It is rendered by CapabilityNotice from packages/catalog/capabilities.json; if it has gone, the capability was marked connected or the notice stopped being rendered.")
        let silence = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Gilbert not recognising an emergency")).firstMatch
        XCTAssertTrue(silence.waitForExistence(timeout: 10), "the sentence that silence is not safety is not beside the conversation")
        keep(app, "gilbert-open")
    }

    func testNothingIsAskedAtLaunchOrOnOpeningGilbert() {
        let app = launchApp()
        XCTAssertFalse(systemPrompt().waitForExistence(timeout: 3), "a system permission prompt appeared at launch")
        openGilbert(app)
        XCTAssertFalse(systemPrompt().waitForExistence(timeout: 3), "a system permission prompt appeared when Gilbert opened, before anybody tapped to talk")
    }

    func testTypingGetsTheContractsAnswers() {
        let app = launchApp()
        openGilbert(app)
        let field = app.textFields["gilbert-input"]
        XCTAssertTrue(field.waitForExistence(timeout: 20), "Gilbert has no text field")
        let send = app.buttons["gilbert-send"]

        field.tap()
        field.typeText("when is my nurse coming")
        send.tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "A nurse is expected on")).firstMatch.waitForExistence(timeout: 10),
                      "a typed question did not get the visit answer")

        field.tap()
        field.typeText("my knee has been sore since tuesday")
        send.tap()
        XCTAssertTrue(app.staticTexts["I can't assess that."].waitForExistence(timeout: 10), "an unmatched message did not get the honest answer")
        XCTAssertTrue(app.staticTexts["10177"].exists, "the unmatched answer does not show the ambulance number")
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Talk to a nurse")).firstMatch.exists, "the unmatched answer offers no way to a nurse")
        keep(app, "gilbert-unmatched")

        field.tap()
        field.typeText("when is my nurse coming, my chest hurts")
        send.tap()
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Open Thuso SOS")).firstMatch.waitForExistence(timeout: 10),
                      "an emergency word in an ordinary question did not raise the emergency answer")
        keep(app, "gilbert-escalate")
    }

    func testTheMatcherAgreesWithTheContractsFixtures() {
        let app = XCUIApplication()
        app.launchArguments = ["-GilbertSelfTest"]
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 60), "the app did not reach its tab bar")
        openGilbert(app)
        let result = app.staticTexts["gilbert-self-test"]
        XCTAssertTrue(result.waitForExistence(timeout: 20), "the debug self-test did not render")
        XCTAssertEqual(result.label, "agrees", "iOS Gilbert disagrees with packages/catalog/assistant.json's fixtures: \(result.label)")
        /* The false positives are reported and never fail: tuning one out is a change to the terms file. */
        let raised = app.staticTexts["gilbert-false-positives"]
        let report = XCTAttachment(string: raised.exists ? raised.label : "")
        report.name = "gilbert-false-positives-still-raised"
        report.lifetime = .keepAlways
        add(report)
    }

    func testWordsGilbertCannotReadAreSaidToBeUnread() {
        let app = launchApp()
        openGilbert(app)
        let field = app.textFields["gilbert-input"]
        XCTAssertTrue(field.waitForExistence(timeout: 20), "Gilbert has no text field")
        field.tap()
        XCTAssertTrue(app.descendants(matching: .any)["gilbert-keyboard-note"].waitForExistence(timeout: 5), "the keyboard note is not beside the field while the keyboard is up")
        field.typeText("when is my nurse coming, my knee is sore")
        app.buttons["gilbert-send"].tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "A nurse is expected on")).firstMatch.waitForExistence(timeout: 10),
                      "the recognised question was not answered")
        XCTAssertTrue(app.descendants(matching: .any)["gilbert-unread"].waitForExistence(timeout: 10),
                      "an answer with words Gilbert could not read was not followed by the unread answer")
        keep(app, "gilbert-unread")
    }

    func testTheScreenIsUsableAtBothTextSizes() {
        for (name, size) in [("the default content size", []), ("AccessibilityXXXL", Audit.largestAccessibilitySize)] {
            let app = launchApp(contentSize: size)
            openGilbert(app)
            let audit = ScreenAudit(app, screen: "Gilbert at \(name)")
            audit.sweep()
            keep(app, "gilbert-\(name)")
            assertUsable(audit)
        }
    }
}
