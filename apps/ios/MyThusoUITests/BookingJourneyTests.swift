import XCTest

/* Booking a visit, end to end, and then reading back what came out of it.
 *
 * This is the journey with real arithmetic behind it, and the arithmetic had a defect: a strip of
 * five hand-typed date chips beginning ("Fri", "12", "Sep") that had not matched the calendar since
 * the day somebody typed it, a confirmation that carried a time and dropped the day, and a visit
 * that ended a flat hour after it started whatever the service's own length was. It was fixed in
 * f0b34df, in TypeScript, Swift and Kotlin at once. The Playwright specs under tests stop it
 * coming back on the web. This stops it coming back on iOS.
 *
 * Nothing below is checked against a second copy of the app's own arithmetic. The test reads what
 * the screens say — a weekday, a date, a start, an end, a length in minutes — parses it with
 * Foundation, and asks the calendar whether it is true. A test that recomputed the answer the same
 * way the app does would agree with the app about a wrong answer.
 */
final class BookingJourneyTests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    private let zone = TimeZone(identifier: "Africa/Johannesburg")!

    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        calendar.locale = Locale(identifier: "en_ZA")
        return calendar
    }

    private func formatter(_ format: String) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_ZA")
        formatter.timeZone = zone
        formatter.dateFormat = format
        return formatter
    }

    /// "Wednesday, 10 September 2026" → the date it names, and the weekday word it claims.
    private func split(_ longDate: String) -> (weekday: String, date: Date)? {
        let pieces = longDate.split(separator: ",", maxSplits: 1).map { $0.trimmingCharacters(in: .whitespaces) }
        guard pieces.count == 2, let date = formatter("d MMMM yyyy").date(from: pieces[1]) else { return nil }
        return (pieces[0], date)
    }

    private func minutesBetween(_ start: String, _ end: String) -> Int? {
        func minutes(_ time: String) -> Int? {
            let parts = time.split(separator: ":").compactMap { Int($0) }
            return parts.count == 2 ? parts[0] * 60 + parts[1] : nil
        }
        guard let a = minutes(start), let b = minutes(end) else { return nil }
        return b - a
    }

    // MARK: - The journey

    func testABookedVisitCarriesItsOwnDateAndItsServicesOwnLength() {
        let app = launchApp()

        /* How long a blood test takes, taken from the screen that offers it rather than written
           down here. The home says it in the row it books from; everything after this has to
           agree with it, and a flat hour would disagree with it by thirty-five minutes. */
        let shortcut = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Blood tests'")).firstMatch
        XCTAssertTrue(shortcut.waitForExistence(timeout: 30), "the home does not offer Blood tests")
        guard let declaredMinutes = firstNumber(in: shortcut.label, before: "minutes") else {
            return XCTFail("the home's Blood tests row does not say how long the visit takes: “\(shortcut.label)”")
        }
        XCTAssertNotEqual(declaredMinutes, 60, "this test needs a service that is not an hour long, or it cannot tell the fix from the defect")

        // Book care → Blood tests
        app.tabBars.buttons.element(boundBy: 1).tap()
        let catalogueEntry = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Blood tests'")).firstMatch
        XCTAssertTrue(catalogueEntry.waitForExistence(timeout: 20), "the care catalogue does not list Blood tests")
        tapAfterScrolling(app, catalogueEntry)
        tapAfterScrolling(app, app.buttons["Continue"])          // who → where
        tapAfterScrolling(app, app.buttons["Continue"])          // where → nurse
        tapAfterScrolling(app, app.buttons["Continue"])          // nurse → when, asking for whoever is nearest

        // MARK: Every chip's weekday belongs to the date on it
        let chips = app.buttons.matching(NSPredicate(format: "label MATCHES %@", "^[A-Za-z]+, [0-9]{1,2} [A-Za-z]+ [0-9]{4}$"))
            .allElementsBoundByIndex.sorted { $0.frame.minX < $1.frame.minX }
        XCTAssertGreaterThanOrEqual(chips.count, 3, "the date strip offers fewer days than a strip is for")

        let today = calendar.startOfDay(for: Date())
        var offered: [Date] = []
        for chip in chips {
            guard let (weekday, date) = split(chip.label) else {
                return XCTFail("a date chip is labelled “\(chip.label)”, which is not a date")
            }
            /* The defect, asked directly. The weekday on the chip has to be the weekday its own
               date falls on, worked out here by the calendar rather than by the app. */
            XCTAssertEqual(weekday, formatter("EEEE").string(from: date),
                           "the chip labelled “\(chip.label)” names a weekday its date does not fall on")
            XCTAssertGreaterThan(date, today, "the strip offers “\(chip.label)”, which is not in the future")
            offered.append(date)
        }
        for (earlier, later) in zip(offered, offered.dropFirst()) {
            XCTAssertEqual(calendar.dateComponents([.day], from: earlier, to: later).day, 1,
                           "the strip skips from \(formatter("d MMMM").string(from: earlier)) to \(formatter("d MMMM").string(from: later))")
        }

        // MARK: Pick a date and a time
        let chosen = chips[2]
        guard let (_, chosenDate) = split(chosen.label) else { return XCTFail("the chosen chip is not a date") }
        let chosenLongDate = chosen.label
        chosen.tap()

        let start = "10:00"
        app.buttons[start].tap()

        /* What the screen promises before anything is confirmed: this date, this hour, and an end
           that is the service's own length after the start. */
        guard let footer = staticText(in: app, containing: chosenLongDate) else {
            return XCTFail("the When step does not print the date and time it is about to book")
        }
        XCTAssertTrue(footer.contains("(\(declaredMinutes) minutes)"),
                      "the When step says “\(footer)” rather than the \(declaredMinutes) minutes the catalogue gives a blood test")
        guard let end = firstTime(in: footer, after: start) else {
            return XCTFail("the When step does not say when the visit ends: “\(footer)”")
        }
        XCTAssertEqual(minutesBetween(start, end), declaredMinutes,
                       "the visit runs \(start)–\(end), which is not the \(declaredMinutes) minutes the service takes")
        XCTAssertNotEqual(minutesBetween(start, end), 60,
                          "the visit ends a flat hour after it starts, which is the defect f0b34df fixed")

        // MARK: The review says the same thing
        tapAfterScrolling(app, app.buttons["Continue"])          // when → payment
        tapAfterScrolling(app, app.buttons["Continue"])          // payment → review
        XCTAssertTrue(app.buttons["Confirm & book"].waitForExistence(timeout: 20), "the review step did not open")
        XCTAssertTrue(rowShows(app, field: "Date", value: chosenLongDate),
                      "the review's Date row does not read “\(chosenLongDate)”, which is what was chosen two steps ago")
        XCTAssertTrue(rowShows(app, field: "Time", value: "\(start) – \(end)"),
                      "the review's Time row does not read “\(start) – \(end)”, which is what the previous step promised")

        // MARK: Confirm
        /* Scrolled to, not just tapped. The review grew when the workspaces and the interpreter
           requirement landed, and a plain tap on an element below the fold hits nothing. */
        let consent = app.switches.firstMatch
        XCTAssertTrue(consent.exists, "the review has no preview-consent switch")
        XCTAssertTrue(tapAfterScrolling(app, consent), "the preview-consent switch could not be reached")
        XCTAssertTrue(tapAfterScrolling(app, app.buttons["Confirm & book"]), "Confirm & book could not be reached")
        XCTAssertTrue(app.staticTexts["Your demo visit is booked."].waitForExistence(timeout: 20), "the booking did not confirm")

        // MARK: What came out of it, on the visit list
        app.tabBars.buttons.element(boundBy: 2).tap()
        let listedTime = "\(start) – \(end)"
        XCTAssertTrue(app.staticTexts[listedTime].waitForExistence(timeout: 20),
                      "the visit list does not carry the hours the visit was booked for")
        /* The date block beside the row is the surface that used to be typed. It is bound to this
           row by position — the three labels left of this row's time — so a different row's block
           cannot answer for it. */
        let block = dateBlock(in: app, leftOf: listedTime)
        /* The three strings a person sees. The block is one accessibility element carrying the whole
           date now — it used to be four, the combined label and then its parts read again — but
           XCUITest enumerates the child texts either way, so this asserts what it can actually
           observe: the day on screen is the day that was booked. Whether VoiceOver reads it once or
           four times is in the notes the audit prints, and needs a person. */
        XCTAssertEqual(block, [formatter("EEE").string(from: chosenDate).uppercased(),
                               formatter("d").string(from: chosenDate),
                               formatter("MMM").string(from: chosenDate).uppercased()],
                       "the visit list's date block reads \(block), which is not the day this visit was booked for")

        // MARK: And on the visit itself
        app.tabBars.buttons.element(boundBy: 0).tap()
        let card = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Blood tests'")).firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 20), "the home does not show the visit that was just booked")
        card.tap()
        XCTAssertTrue(app.staticTexts["Visit details"].waitForExistence(timeout: 20), "the visit's own screen did not open")
        XCTAssertTrue(rowShows(app, field: "When", value: "\(chosenLongDate) · \(start)–\(end)"),
                      "the visit's own screen does not carry the whole choice — the date, the start and the end")
        XCTAssertTrue(rowShows(app, field: "How long", value: "\(declaredMinutes) minutes"),
                      "the visit's own screen does not say it takes \(declaredMinutes) minutes")
    }

    func testCategoryFiltersAndBookingSummaryKeepTheChosenCare() {
        let app = launchApp()
        app.tabBars.buttons.element(boundBy: 1).tap()
        let recovery = app.buttons["Recovery"]
        XCTAssertTrue(recovery.waitForExistence(timeout: 20))
        recovery.tap()
        let wound = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Wound care'")).firstMatch
        XCTAssertTrue(wound.exists)
        XCTAssertFalse(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Blood tests'")).firstMatch.exists)
        wound.tap()
        let summary = app.descendants(matching: .any)["bookingSummary"].firstMatch
        XCTAssertTrue(summary.waitForExistence(timeout: 10))
        XCTAssertTrue(summary.label.contains("299"))
        app.buttons["Continue"].tap()
        XCTAssertTrue(summary.label.contains("Wound care"))
        XCTAssertTrue(summary.label.contains("299"))
        app.buttons["Continue"].tap()
        app.buttons["Back"].tap()
        let location = app.textFields["Visit location"]
        XCTAssertTrue(location.exists)
        location.tap()
        location.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: (location.value as? String ?? "").count) + "Home visit · Rosebank")
        app.navigationBars.buttons.element(boundBy: 0).tap()
        wound.tap()
        XCTAssertTrue(location.waitForExistence(timeout: 10))
        XCTAssertEqual(location.value as? String, "Home visit · Rosebank")
    }

    func testClinicianProfileUsesRegisterAndCanBeDismissed() {
        let app = launchApp()
        let nurse = app.buttons["Meet your nurse"].firstMatch
        for _ in 0..<6 where !nurse.isHittable { app.swipeUp() }
        XCTAssertTrue(nurse.waitForExistence(timeout: 10))
        nurse.tap()
        XCTAssertTrue(app.staticTexts["Professional record"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'SANC 20016688'")).firstMatch.exists)
        XCTAssertFalse(app.buttons["Call"].exists)
        app.buttons["Done"].tap()
        XCTAssertTrue(nurse.waitForExistence(timeout: 10))
    }

    // MARK: - Reading numbers back off a screen

    private func firstNumber(in text: String, before word: String) -> Int? {
        guard let range = text.range(of: "[0-9]+ \(word)", options: .regularExpression) else { return nil }
        return Int(text[range].split(separator: " ")[0])
    }

    /// The first HH:MM in the text that is not the start time itself.
    private func firstTime(in text: String, after start: String) -> String? {
        let matches = text.ranges(of: "[0-9]{2}:[0-9]{2}").map { String(text[$0]) }
        return matches.first { $0 != start }
    }

    /* A LabeledContent arrives as one element carrying both halves — "Date, Thursday, 10 September
       2026" — rather than as two static texts, so a review row is asked for by its field name and
       its content together. That also stops the assertion passing on a date that happens to appear
       somewhere else on the screen. */
    private func rowShows(_ app: XCUIApplication, field: String, value: String) -> Bool {
        app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@ AND label CONTAINS %@", field, value))
            .firstMatch.exists
    }

    private func staticText(in app: XCUIApplication, containing needle: String) -> String? {
        app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", needle))
            .allElementsBoundByIndex.map(\.label).first { $0 != needle }
    }

    /// The weekday, day and month sitting to the left of a row, read in the order they are stacked.
    private func dateBlock(in app: XCUIApplication, leftOf time: String) -> [String] {
        let anchor = app.staticTexts[time].frame
        return app.staticTexts.allElementsBoundByIndex
            .filter { $0.frame.maxX <= anchor.minX && abs($0.frame.midY - anchor.midY) < 70 }
            .sorted { $0.frame.minY < $1.frame.minY }
            .map(\.label)
    }
}

private extension String {
    func ranges(of pattern: String) -> [Range<String.Index>] {
        var found: [Range<String.Index>] = []
        var start = startIndex
        while let range = self.range(of: pattern, options: .regularExpression, range: start..<endIndex) {
            found.append(range)
            start = range.upperBound
        }
        return found
    }
}
