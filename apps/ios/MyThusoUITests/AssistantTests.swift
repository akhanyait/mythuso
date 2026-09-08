import XCTest

/* The assistant screen, asked the two questions it exists to answer.
 *
 * It draws a soft luminous shape that changes with what the app knows, and that is the exact shape
 * of a claim this product cannot make: a blob beside a rounded rectangle reads as a voice assistant
 * to almost everybody. There is no speech model, no microphone permission on either platform, and
 * nothing designed yet for what happens to a recording of a person describing a symptom. So the
 * screen has to say so, and it has to offer nothing that looks like listening.
 *
 * The division of labour with scripts/check-boundaries.mjs is deliberate. That check reads the
 * source and proves the sentence on this screen is the contract's rather than one somebody typed,
 * that no iOS file names a microphone symbol or reaches for an audio API, and that no label offers
 * in words to listen. It cannot prove any of it reached a running screen. This file can: it opens
 * the app on a simulator and looks at what is actually rendered.
 *
 * Which is why the notice is asserted by its opening clause rather than word for word. A UI test
 * runs against a built app it cannot import, so restating the whole sentence here would be a second
 * copy of it — the thing the contract exists to prevent — and it would drift the first time a word
 * changed. The wording is the build's question. Whether a person opening this screen is told
 * anything at all is this one's.
 */
final class AssistantTests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    /// The clause a person would notice the absence of. The rest of the sentence is held word for
    /// word by scripts/check-boundaries.mjs, against packages/catalog/capabilities.json.
    private let noticeOpens = "MyThuso cannot listen to you"

    private func openAssistant(_ app: XCUIApplication) {
        app.tabBars.buttons.element(boundBy: 4).tap()
        XCTAssertTrue(app.navigationBars["More"].waitForExistence(timeout: 20), "the More tab did not open")
        tapAfterScrolling(app, app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Assistant'")).firstMatch)
        XCTAssertTrue(app.navigationBars["Assistant"].waitForExistence(timeout: 20), "the assistant screen did not open")
    }

    func testTheScreenSaysItCannotListen() {
        let app = launchApp()
        openAssistant(app)
        let notice = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", noticeOpens)).firstMatch
        XCTAssertTrue(notice.waitForExistence(timeout: 20),
                      "the assistant screen does not tell a person it cannot listen. The sentence is in packages/catalog/capabilities.json under the voice capability and is rendered by CapabilityNotice — if it has gone, either the capability was marked connected or the notice stopped being rendered.")
    }

    /* Nothing on the screen may offer to listen, and the offer can arrive three ways: as a symbol,
       as a word on a control, or as a control whose accessibility label mentions the microphone
       that is not there. All three are asked of the live tree rather than of the source, because
       what a person acts on is what was rendered. */
    func testNothingOnTheScreenOffersToListen() {
        let app = launchApp()
        openAssistant(app)

        guard let root = try? app.snapshot() else { return XCTFail("the screen produced no accessibility snapshot") }
        var nodes: [XCUIElementSnapshot] = []
        func walk(_ node: XCUIElementSnapshot) { nodes.append(node); node.children.forEach(walk) }
        walk(root)

        /* SwiftUI puts an SF Symbol's own name in the element's identifier, so a microphone or an
           audio meter anywhere in the drawing shows up here under the name it was drawn with.
           waveform.path.* is the ECG trace the Health Passport charts a heartbeat with, and it is
           not on this screen at all — it is allowed for the same reason the build allows it. */
        let listening = nodes.filter { node in
            let symbol = node.identifier
            guard symbol.hasPrefix("mic") || symbol.hasPrefix("waveform") else { return false }
            return !symbol.hasPrefix("waveform.path")
        }
        XCTAssertTrue(listening.isEmpty,
                      "the assistant screen draws \(listening.map(\.identifier).joined(separator: ", ")). No microphone affordance may be drawn — not an enabled one, not a disabled one, not a decorative one, because a control that looks like it is listening and is not is worse than no control.")

        /* A control is the only thing a person can act on, so it is a control's words that could
           make a promise. The notice and the three reasons underneath it are static text and say
           "microphone" on purpose — they are the sentence saying there is not one. */
        let offers = try! NSRegularExpression(pattern: "\\b(tap|hold|press|touch|swipe) to (speak|talk|record|dictate)\\b|\\bmicrophone\\b|\\b(start|stop) listening\\b|\\bspeak now\\b",
                                              options: .caseInsensitive)
        let controls = nodes.filter { Audit.controlTypes.contains($0.elementType) }
        let promising = controls.map(\.label).filter { label in
            offers.firstMatch(in: label, range: NSRange(label.startIndex..., in: label)) != nil
        }
        XCTAssertTrue(promising.isEmpty,
                      "a control on the assistant screen offers to listen: \(promising.joined(separator: ", ")). Nothing here has a microphone, and a control that says otherwise teaches a person to talk to an app that never heard them.")
    }

    /* The same audit the rest of the app is held to, at both ends of the text-size scale. The
       screen it is aimed at here is one that was drawn to look beautiful, which is exactly where a
       thirty-two-point control and a frozen point size get in — the two defects the Health
       Passport's segmented control was just replaced for. */
    func testTheScreenIsUsableAtBothTextSizes() {
        for (name, size) in [("the default content size", []), ("AccessibilityXXXL", Audit.largestAccessibilitySize)] {
            let app = launchApp(contentSize: size)
            openAssistant(app)
            let audit = ScreenAudit(app, screen: "The assistant at \(name)")
            audit.sweep()
            assertUsable(audit)
        }
    }
}
