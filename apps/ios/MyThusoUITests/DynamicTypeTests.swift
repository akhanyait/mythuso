import XCTest

/* The screens at the largest text a person can ask iOS for, and at the default.
 *
 * docs/ACCESSIBILITY.md used to say the iOS screens had been *read* for Dynamic Type hazards. This
 * file is what reading them was standing in for. It drives the app at
 * UICTContentSizeCategoryAccessibilityXXXL — the top of the scale, a little over three times the
 * default body size — and walks three screens to the bottom of their content, measuring at every
 * resting position on the way.
 *
 * Both sizes, and neither is optional. The largest size is where text runs off the side and where a
 * control ends up under a bar; the default size is where a control is smallest, and a suite that
 * only ran at the top of the scale would pass a fifteen-point tap target because at three times the
 * type it had grown into a legal one. It is the same reason tests/accessibility.spec.ts runs at 320
 * pixels and at the configured viewport rather than at whichever one fails first.
 *
 * Three screens rather than all of them, chosen for what each would cost a person to lose: the
 * home, which is where a returning patient decides anything; the booking flow, which is the one
 * with arithmetic behind it; and the Health Passport, which is where the readings and their
 * reference ranges are. Adding a screen here is four lines, and the next ones to add are the nurse
 * assessment and the vetting console.
 *
 * The last test is the one that found the most. A point size written as .font(.system(size: 15))
 * does not answer Dynamic Type at all — it is fifteen points at every content size, including the
 * one somebody turned all the way up because they cannot read fifteen points. Nothing about a
 * screenshot shows that: a screen where half the text tripled and half of it did not reads as a
 * layout decision. So the same screen is measured twice, and any string that came back the same
 * height ignored the setting.
 */
final class DynamicTypeTests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    /* The floor a rendered string has to clear at AccessibilityXXXL. The smallest size this design
       draws is nine points — the weekday over a date in the visit list — which lands near thirty at
       this content size, and the smallest semantic style lands higher again. Twenty is well under
       both and well over the eighteen points a frozen fifteen-point string comes out at, so it
       separates text that scaled from text that did not without being a second type scale.

       It is a floor rather than a comparison with the default-size run because a string that
       truncates at one size and not the other is a different string to the accessibility tree, and
       pairing by label would quietly skip exactly the case this is for. */
    private let legibleAtAccessibilitySizes: CGFloat = 20

    // MARK: - The journeys, so each can be walked at either content size

    private func openBookingReview(_ app: XCUIApplication) {
        app.tabBars.buttons.element(boundBy: 1).tap()
        XCTAssertTrue(app.navigationBars["Book care"].waitForExistence(timeout: 20), "the care catalogue did not open")
        /* Scrolled to rather than waited for: the catalogue is a LazyVGrid, and at the largest
           content size the fourth service is not in the view hierarchy at all until the grid has
           been scrolled far enough to build it. */
        tapAfterScrolling(app, app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Blood tests'")).firstMatch)
        tapAfterScrolling(app, app.buttons["Continue"])            // who & where → when
        tapAfterScrolling(app, app.buttons["Continue"])            // when → payment
        tapAfterScrolling(app, app.buttons["Continue"])            // payment → review
        XCTAssertTrue(app.buttons["Confirm & book"].waitForExistence(timeout: 20), "the review step did not open")
    }

    private func openPassport(_ app: XCUIApplication) {
        app.tabBars.buttons.element(boundBy: 3).tap()
        XCTAssertTrue(app.staticTexts["Health trends"].waitForExistence(timeout: 20), "the Health Passport did not open")
    }

    private func sweep(_ name: String, contentSize: [String], journey: (XCUIApplication) -> Void = { _ in }) -> ScreenAudit {
        let app = launchApp(contentSize: contentSize)
        journey(app)
        let audit = ScreenAudit(app, screen: name)
        audit.sweep()
        return audit
    }

    /// One screen at both ends of the scale, with the legibility floor applied at the top of it,
    /// where a string that did not scale is a string somebody cannot read.
    @discardableResult
    private func auditBothSizes(_ name: String, journey: (XCUIApplication) -> Void = { _ in }) -> ScreenAudit {
        assertUsable(sweep("\(name) at the default content size", contentSize: [], journey: journey))
        let largest = sweep("\(name) at AccessibilityXXXL", contentSize: Audit.largestAccessibilitySize, journey: journey)
        assertUsable(largest)
        let unreadable = largest.textShorterThan(legibleAtAccessibilitySizes)
        XCTAssertTrue(unreadable.isEmpty,
                      "\(largest.name): \(unreadable.count) string(s) came out under \(Int(legibleAtAccessibilitySizes)) points at the largest accessibility size, which is text that did not scale with the setting.\n  · " +
                      unreadable.joined(separator: "\n  · "))
        return largest
    }

    // MARK: - Usable at both content sizes

    func testTheHomeIsUsable() {
        let largest = auditBothSizes("The home")
        /* The bottom of the home is nine screenfuls down at the largest size. If the sweep never
           reached the last control on it, the content below the fold is not reachable by scrolling,
           which is a different and worse failure than anything measured above. */
        XCTAssertTrue(largest.sawHittable("See the first-run and recovery flow"),
                      "the foot of the home was never reachable by scrolling at the largest content size")
    }

    func testTheBookingFlowIsUsable() {
        let largest = auditBothSizes("The booking review", journey: openBookingReview)
        XCTAssertTrue(largest.sawHittable("Confirm & book"),
                      "the button that books the visit was never reachable at the largest content size")
    }

    func testTheHealthPassportIsUsable() {
        auditBothSizes("The Health Passport", journey: openPassport)
    }

    // MARK: - Text that answers the setting

    /* A string the same height at both ends of the scale did not scale. The factor between the
       default body size and AccessibilityXXXL is a little over three, so a floor of one and a half
       is generous: it passes anything that grew at all and fails only text pinned to a point size.

       Strings are paired on their opening characters rather than in full, because a string that
       truncates at one size is a different string in the accessibility tree and pairing on the
       whole of it would drop the comparison exactly where it is most wanted. Where two strings
       share an opening the tallest of each is compared, which can only make this more forgiving —
       and the floor in the tests above is what catches whatever forgiveness lets through. Strings
       that appear at one size and not the other are not compared, because there is nothing to
       compare them with. */
    func testEveryStringOnTheseScreensAnswersTheContentSize() {
        for (name, journey) in [("the home", { (_: XCUIApplication) in }),
                                ("the booking review", openBookingReview),
                                ("the Health Passport", openPassport)] {
            let standard = tallestByOpening(sweep(name, contentSize: [], journey: journey).textHeights)
            let largest = tallestByOpening(sweep(name, contentSize: Audit.largestAccessibilitySize, journey: journey).textHeights)
            var frozen: [String] = []
            for (opening, small) in standard.sorted(by: { $0.key < $1.key }) {
                guard small.height > 0, let big = largest[opening] else { continue }
                /* An avatar's initials are a picture of letters, not text anybody reads: they sit in
                   a fixed circle beside the person's full name and are hidden from assistive
                   technology, so they cannot grow and nothing is lost by their not growing. They
                   still turn up here because XCUITest's snapshot is not VoiceOver's tree. Excluded
                   by shape — three characters or fewer, all capitals — rather than by name, so this
                   stays a rule about monograms rather than a list of the ones we happened to find.
                   Nothing a reader has to read in this app is written that way. */
                if small.label.count <= 3, small.label.allSatisfy({ $0.isUppercase }) { continue }
                if big.height < small.height * 1.5 {
                    frozen.append("“\(small.label.prefix(44))” is \(Int(small.height))pt tall at the default size and \(Int(big.height))pt at AccessibilityXXXL")
                }
            }
            XCTAssertTrue(frozen.isEmpty,
                          "\(frozen.count) string(s) on \(name) ignore the content size. A font written as .system(size:) is that size at every setting; .thusoFont applies the scale to it.\n  · " +
                          frozen.joined(separator: "\n  · "))
        }
    }

    private func tallestByOpening(_ heights: [String: CGFloat]) -> [String: (label: String, height: CGFloat)] {
        var tallest: [String: (label: String, height: CGFloat)] = [:]
        for (label, height) in heights {
            let opening = String(label.prefix(8))
            if let existing = tallest[opening], existing.height >= height { continue }
            tallest[opening] = (label, height)
        }
        return tallest
    }
}
