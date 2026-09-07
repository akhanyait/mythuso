import XCTest

/* What the web already measures, measured on iOS.
 *
 * tests/accessibility.spec.ts asserts four things about a rendered web screen — nothing runs off
 * the side, no control is under 44x44, no text drops below the smallest size the type scale
 * declares, and it does all of it at a width and a zoom that stand in for a person who has turned
 * their text up. This file is the iOS half of that, and it is deliberately the same questions
 * rather than a different standard, because "tested on iOS" meaning something softer than "tested
 * on the web" is how a platform ends up with an accessibility section written in the past tense.
 *
 * Two of them cross over exactly. A control's frame is in points and 44 is Apple's own floor, which
 * is the same number packages/design-tokens/tokens.json holds for the web; that is not a copy of
 * the token, it is the platform's own figure and the two happen to agree. Reachability crosses over
 * better than it does on the web, because XCUITest can say whether a control can actually be
 * tapped rather than only where it was laid out.
 *
 * One does not cross over, and saying so is part of the point of this file. A SwiftUI Text that has
 * been truncated on screen still hands its whole string to the accessibility tree, so no test can
 * see the ellipsis. What a test can see is a label pushed past the edge of the window, which is
 * what a fixed-width row does to text at the largest content sizes, so that is what is asserted
 * here. Text that is visually clipped while its accessibility label stays whole is not measured by
 * anything in this directory, and docs/ACCESSIBILITY.md names it as the gap it is.
 *
 * One caveat that matters for reading a failure. XCUITest's tree is not VoiceOver's tree: it shows
 * elements a screen reader would never reach, including UIKit's own overlays and the symbols inside
 * a view that has combined its children. So the image checks below ask two narrow questions that do
 * not depend on that difference — whether a decorative asset reached the tree under its own file
 * name, and whether a symbol is sitting outside every control as an element of its own. Both are
 * things VoiceOver would read out loud, and neither can be produced by XCUITest's extra sight.
 */

enum Audit {
    /// Apple's floor for a control, in points — Human Interface Guidelines, "Controls".
    static let minimumTarget: CGFloat = 44

    /// What WCAG 2.2 SC 2.5.8 requires at AA, and the line under which an exemption stops being an
    /// exemption and becomes a defect with paperwork. The same two numbers hold the web side, in
    /// targets.minimum and targets.absoluteMinimum in packages/design-tokens/tokens.json.
    static let absoluteMinimumTarget: CGFloat = 24

    /* The two controls in this app that UIKit will not let SwiftUI make 44 points tall, each with
       what it actually measures and why it cannot be changed. The shape is deliberately the web's:
       tokens.json carries targets.knownUndersized for exactly this, with a note per row and the
       same rule that an exemption is never permission to go under the AA floor.

       They are declared here rather than in that contract because this change set does not reach
       packages/, and because both are facts about UIKit rather than about the design — a web
       selector and a SwiftUI control label do not belong in one list without a `platform` field to
       tell them apart. Moving them there, with that field, is written down in
       docs/ACCESSIBILITY.md as the thing to do next rather than claimed as done. */
    static let knownUndersized: [(control: String, measured: CGFloat, note: String)] = [
        ("button “Notifications”", 36,
         """
         A navigation-bar item is the height of the bar's content, not the height its view asks for: \
         .frame(height: 44) on the bell comes back 36. The horizontal padding takes the width as far \
         as it goes, UIKit widens the touch region past the drawn bounds, and the same notifications \
         are reachable at full size from More. What cannot be done from SwiftUI is make the bar taller.
         """),
        ("switch “I understand this is a UI preview using fictional information.”", 34,
         """
         A SwiftUI Toggle publishes the switch's own row height as its accessibility frame, and \
         nothing in the label reaches it: a frame on the label, padding on the label and padding \
         around the control were all tried and all three came back at the same thirty-four. The row \
         is 354 points wide and tapping the sentence toggles it, so what is short is one dimension \
         of a target that is otherwise the width of the screen. Replacing the control with one that \
         measures 44 would be a design change on all three platforms rather than an iOS fix.
         """),
        ("button “Overview”", 32, Audit.segmentedNote),
        ("button “Records”", 32, Audit.segmentedNote),
        ("button “Medications”", 32, Audit.segmentedNote),
        ("button “More”", 32, Audit.segmentedNote)
    ]

    static let segmentedNote = """
    A segmented control is 32 points tall at every content size, its height is intrinsic to \
    UISegmentedControl, and .frame(height: 44) pads the SwiftUI view around it without stretching \
    the segments. Unlike the bell there is no second route to these four sections, which is a reason \
    to replace the control rather than to keep exempting it; that is the next thing on this screen \
    and it is not done.
    """

    /// The largest content size iOS offers, set on launch rather than through Settings so a run is
    /// repeatable and leaves nothing behind on the simulator for the next one to inherit.
    static let largestAccessibilitySize = ["-UIPreferredContentSizeCategoryName",
                                           "UICTContentSizeCategoryAccessibilityXXXL"]

    /// Everything in Assets.xcassets that is a photograph or a mark rather than information. If one
    /// of these reaches the accessibility tree under its own asset name then nobody labelled it and
    /// nobody hid it, and VoiceOver reads a file name to somebody who cannot see the picture.
    static let decorativeAssets: Set<String> = ["Brand", "Elder", "Family", "Nurse", "Patient",
                                                "BannerCareThatComesToYou", "BannerFeelBetter",
                                                "BannerOneSafePlace"]

    static let controlTypes: Set<XCUIElement.ElementType> = [
        .button, .link, .switch, .toggle, .textField, .searchField, .secureTextField,
        .slider, .stepper, .datePicker, .checkBox, .radioButton
    ]

    static func name(_ type: XCUIElement.ElementType) -> String {
        switch type {
        case .button: return "button"
        case .link: return "link"
        case .switch, .toggle: return "switch"
        case .textField: return "text field"
        case .searchField: return "search field"
        case .secureTextField: return "secure field"
        case .slider: return "slider"
        case .stepper: return "stepper"
        case .datePicker: return "date picker"
        case .checkBox: return "checkbox"
        case .radioButton: return "radio button"
        default: return "control"
        }
    }

    /// A label that names a symbol rather than an action — "chevron.right", "square.grid.2x2" — is
    /// the SF Symbol's own name arriving where somebody should have written a sentence.
    static func namesASymbol(_ text: String) -> Bool {
        guard !text.isEmpty, text.contains(".") else { return false }
        return text.range(of: "^[a-z0-9]+(\\.[a-z0-9]+)+$", options: .regularExpression) != nil
    }

    static func meaningless(_ label: String) -> Bool {
        let trimmed = label.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return true }
        if ["image", "button", "link", "icon"].contains(trimmed.lowercased()) { return true }
        return namesASymbol(trimmed)
    }
}

private struct ControlSighting {
    let label: String
    var size: CGSize
    /// Seen entirely on the screen at some scroll position, rather than only partly.
    var seenWhole = false
    /// Nil until the control was clear of the bars and could be asked.
    var hittable: Bool?
}

/* One screen, walked from wherever it is now to the bottom of its content, measured at every
   resting position on the way. Measuring once at the top would audit the first screenful of a
   screen that is nine screenfuls long at the largest content size, which is the size the audit
   exists for. */
final class ScreenAudit {
    let name: String
    private let app: XCUIApplication
    private var window = CGRect.zero
    private var content = CGRect.zero
    private var controls: [String: ControlSighting] = [:]
    private var decorationAnnounced: Set<String> = []
    private var looseSymbols: Set<String> = []
    private var clippedText: Set<String> = []
    private(set) var textHeights: [String: CGFloat] = [:]
    private(set) var restingPositions = 0

    init(_ app: XCUIApplication, screen name: String) {
        self.app = app
        self.name = name
    }

    @discardableResult
    func sweep(maxSteps: Int = 40) -> ScreenAudit {
        window = app.windows.firstMatch.frame
        var previous: Set<String> = []
        let scroller = scrollableContainer()
        for _ in 0..<maxSteps {
            let visible = measure()
            restingPositions += 1
            if visible == previous || visible.isEmpty { break }
            previous = visible
            scroller.swipeUp()
        }
        return self
    }

    private func scrollableContainer() -> XCUIElement {
        for candidate in [app.scrollViews.firstMatch, app.tables.firstMatch, app.collectionViews.firstMatch]
        where candidate.exists { return candidate }
        return app
    }

    /// Everything on screen at this position. Returns the visible labels, so the sweep can tell
    /// that a swipe moved nothing and stop rather than swiping thirty times at the bottom.
    private func measure() -> Set<String> {
        guard let root = try? app.snapshot() else { return [] }
        var nodes: [XCUIElementSnapshot] = []
        func walk(_ node: XCUIElementSnapshot) {
            nodes.append(node)
            for child in node.children { walk(child) }
        }
        walk(root)

        /* The bars overlay the content rather than sitting beside it, so a row can be laid out on
           the screen and still be untappable underneath one. That is a fact about the scroll
           position rather than a defect, so the area they cover is not counted as "on screen" and
           the row is measured at the position where it is clear of them. */
        var top = window.minY, bottom = window.maxY
        var bars: [CGRect] = []
        for node in nodes where node.elementType == .tabBar || node.elementType == .navigationBar {
            let bar = node.frame
            guard bar.width > window.width * 0.6, bar.height > 0 else { continue }
            bars.append(bar)
            if bar.midY < window.midY { top = max(top, bar.maxY) } else { bottom = min(bottom, bar.minY) }
        }
        content = CGRect(x: window.minX, y: top, width: window.width, height: max(0, bottom - top))

        let visible = nodes.filter { $0.frame.width > 0 && $0.frame.height > 0 && $0.frame.intersects(window) }
        let controlNodes = visible.filter { Audit.controlTypes.contains($0.elementType) }
        let controlFrames = controlNodes.map(\.frame)
        let controlBoxes = controlNodes.map { ($0.frame, $0.label) }
        /* A short scroll view spanning the width is a strip that is meant to run off the side — the
           date chips in the booking flow are one. Text inside it is scrolled to, not lost. */
        let strips = visible.filter { $0.elementType == .scrollView && $0.frame.height < window.height / 2 && $0.frame.width > window.width * 0.8 }.map(\.frame)

        var labels: Set<String> = []
        var seen: [String: Int] = [:]
        for node in visible where Audit.controlTypes.contains(node.elementType) {
            seen["\(node.elementType.rawValue)|\(node.label)", default: 0] += 1
        }

        for node in visible {
            let frame = node.frame
            if Audit.controlTypes.contains(node.elementType) {
                /* SwiftUI composes some controls out of others — a Toggle wraps a UISwitch, a Menu
                   wraps a button — and only the outer one is what a person operates or what
                   VoiceOver reads. Measuring the parts as well would report one control twice and
                   report its inner half as unlabelled, which that half is entitled to be. */
                let composed = controlBoxes.contains { other in
                    guard other.0.insetBy(dx: -4, dy: -4).contains(frame) else { return false }
                    if other.0 != frame { return true }
                    return node.label.isEmpty && !other.1.isEmpty
                }
                if composed { continue }
                let key = "\(Audit.name(node.elementType)) “\(node.label)”"
                labels.insert(key)
                var record = controls[key] ?? ControlSighting(label: node.label, size: frame.size)
                /* The smallest one wins. Two controls can carry the same words — a section header's
                   "Book a nurse" beside the full-width button underneath it — and taking the larger
                   of them would let the button vouch for the link, which is the one a thumb misses. */
                record.size = CGSize(width: min(record.size.width, frame.width), height: min(record.size.height, frame.height))
                if window.contains(frame) { record.seenWhole = true }
                /* Hittability is asked of the live element rather than of the snapshot, and only
                   where the control is clear of the bars — a row underneath the tab bar cannot be
                   tapped at this scroll position and can at the next one, which is a fact about
                   scrolling rather than a defect. And only where the label picks out one control,
                   because a query that resolved to the wrong twin would answer about the wrong
                   control. */
                if content.contains(frame), record.hittable != true,
                   seen["\(node.elementType.rawValue)|\(node.label)"] == 1, !node.label.isEmpty {
                    let element = app.descendants(matching: node.elementType)
                        .matching(NSPredicate(format: "label == %@", node.label)).firstMatch
                    if element.exists { record.hittable = element.isHittable }
                }
                controls[key] = record
            }

            /* Text inside a bar is UIKit's rather than this app's, and iOS caps how far it will let
               either bar grow: an inline navigation title goes from 20 points to 25 at the largest
               accessibility size and stops, and the tab bar drops its labels entirely and offers
               the Large Content Viewer on a long press instead. Neither is a decision anything in
               apps/ios made, and measuring them would be measuring UIKit. */
            if node.elementType == .staticText, !node.label.isEmpty,
               !bars.contains(where: { $0.insetBy(dx: -1, dy: -1).contains(frame) }) {
                labels.insert("text:\(node.label)")
                textHeights[node.label] = max(textHeights[node.label] ?? 0, frame.height)
                let insideAStrip = strips.contains { $0.minY - 2 <= frame.minY && frame.maxY <= $0.maxY + 2 }
                if !insideAStrip, frame.minX >= content.minX - 1, frame.maxX > content.maxX + 1 {
                    clippedText.insert(node.label)
                }
            }

            /* Two questions about a picture, both of which survive the difference between what
               XCUITest can see and what VoiceOver reads. Whether an asset arrived under its own
               file name, and whether a system symbol is sitting outside every control as an
               element of its own — SwiftUI puts the symbol's name in the identifier, so a loose
               image with one is an Image(systemName:) that nobody hid and nobody folded into the
               sentence beside it. Either way VoiceOver stops on it and says something useless.

               A picture wider than the screen on both sides is UIKit's own chrome — the tab bar's
               dimming overlay — rather than anything this app drew, so it is not asked about. */
            if node.elementType == .image, window.insetBy(dx: -1, dy: -1).contains(frame) {
                if Audit.decorativeAssets.contains(node.label) { decorationAnnounced.insert(node.label) }
                else if !node.identifier.isEmpty, !controlFrames.contains(where: { $0.contains(frame) }) {
                    looseSymbols.insert(node.identifier)
                }
            }
        }
        return labels
    }

    func sawHittable(_ label: String) -> Bool {
        controls.values.contains { $0.label == label && $0.hittable == true }
    }

    /// Text that came out shorter than a floor, for a sweep run at an accessibility content size.
    func textShorterThan(_ floor: CGFloat) -> [String] {
        textHeights.filter { $0.value < floor }.keys.sorted()
            .map { "“\($0.prefix(44))” renders \(Int(textHeights[$0]!)) points tall" }
    }

    /// Everything this screen got wrong, in sentences, so a failure says what to go and change.
    func failures() -> [String] {
        var found: [String] = []
        for key in controls.keys.sorted() {
            let control = controls[key]!
            guard control.seenWhole else { continue }
            let smallest = min(control.size.width, control.size.height)
            let size = "\(Int(control.size.width.rounded()))x\(Int(control.size.height.rounded()))"
            /* Half a point of slack, and only half. A control asked for 44 comes back 43.67 because
               a view scale rounds, and failing it over a third of a point is how a check becomes
               one people switch off rather than one they fix. It is the same half-pixel slack
               tests/accessibility.spec.ts gives a fractional layout width. */
            if smallest < Audit.minimumTarget - 0.5 {
                if let exemption = Audit.knownUndersized.first(where: { $0.control == key }) {
                    /* An exemption is permission to be under 44. It is never permission to be under
                       the floor WCAG 2.2 SC 2.5.8 sets at AA, and it is never permission to be
                       smaller than the exemption itself says the control is. */
                    if smallest < Audit.absoluteMinimumTarget {
                        found.append("\(key) is \(size), under the \(Int(Audit.absoluteMinimumTarget))x\(Int(Audit.absoluteMinimumTarget)) WCAG 2.2 SC 2.5.8 requires at AA. Its exemption says \(Int(exemption.measured)), so that is a defect with paperwork rather than an exemption")
                    } else if smallest < exemption.measured - 1 {
                        found.append("\(key) is \(size) and its exemption in MyThusoUITests says \(Int(exemption.measured)). It has got smaller since somebody wrote down why it could not be bigger")
                    }
                } else {
                    found.append("\(key) is \(size) points, under the \(Int(Audit.minimumTarget))x\(Int(Audit.minimumTarget)) Apple's own guidelines set for a control. Either make it \(Int(Audit.minimumTarget)) or write down in Audit.knownUndersized why it cannot be")
                }
            }
            if control.hittable == false {
                found.append("\(key) is laid out clear of the bars and still cannot be tapped")
            }
            if Audit.meaningless(control.label) {
                found.append("\(key) at \(size) carries nothing a person could act on — a control needs a label that says what it does")
            }
        }
        for asset in decorationAnnounced.sorted() {
            found.append("the image “\(asset)” reaches the accessibility tree under its own asset name — give it a label or hide it with .accessibilityHidden(true)")
        }
        for symbol in looseSymbols.sorted() {
            found.append("the symbol “\(symbol)” sits outside every control as an element of its own, so VoiceOver announces it — hide it or fold it into the label beside it")
        }
        for text in clippedText.sorted() {
            found.append("“\(text.prefix(48))” runs past the trailing edge of the screen")
        }
        return found
    }
}

extension XCTestCase {
    func assertUsable(_ audit: ScreenAudit, file: StaticString = #filePath, line: UInt = #line) {
        let failures = audit.failures()
        XCTAssertTrue(failures.isEmpty,
                      "\(audit.name) — \(failures.count) problem(s) over \(audit.restingPositions) scroll position(s):\n  · " +
                      failures.joined(separator: "\n  · "),
                      file: file, line: line)
    }

    func launchApp(contentSize: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = contentSize
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 60), "the app did not reach its tab bar")
        return app
    }

    /// Tap a control by label, scrolling the screen until it can actually be tapped. Everything on
    /// this app is below the fold at the largest content size, so "tap it" and "find it first" are
    /// the same operation there.
    @discardableResult
    func tapAfterScrolling(_ app: XCUIApplication, _ element: XCUIElement, steps: Int = 30,
                           file: StaticString = #filePath, line: UInt = #line) -> Bool {
        let scroller = app.scrollViews.firstMatch.exists ? app.scrollViews.firstMatch : app
        for _ in 0..<steps {
            if element.exists && element.isHittable { element.tap(); return true }
            scroller.swipeUp()
        }
        if element.exists && element.isHittable { element.tap(); return true }
        XCTFail("could not scroll to \(element) — the content below the fold is out of reach", file: file, line: line)
        return false
    }
}
