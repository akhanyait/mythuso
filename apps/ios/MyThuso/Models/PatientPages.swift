import Foundation

/* THE PATIENT PAGES ON THE IPHONE — the reasoning. The words are PatientPagesData.swift's, generated
 * from packages/catalog/patient-pages.json by scripts/emit-patient-pages.mjs; this is the little the two
 * pages the phone draws have to work out, and it is three things, each the web's
 * apps/web/src/lib/patient-pages.ts in Swift.
 *
 * WHICH DOORS ARE DRAWN IS THE CONTRACT'S, NOT THIS FILE'S. drawnOn.ios in the contract names the doors
 * whose page the iPhone does not have, and the generator hands them over as `doorsLeftOut`. A door to a
 * screen that does not exist is left out rather than pointed at a web view or a stand-in, so the list
 * below is the contract's list minus the contract's exceptions — never a decision made here.
 *
 * THE ONE FIGURE ON EITHER PAGE IS A COUNT OF THE ROWS UNDER IT. Activity's third tile is the number of
 * Moving entries listed beneath it, which anybody can check by counting. Nothing else here counts,
 * averages or compares: steps and minutes are written states, because nothing that could measure them
 * is connected, and a figure nobody measured is a figure somebody would believe. */
enum PatientPages {
    /// The mental-health doors the iPhone draws: the contract's, less the ones it leaves out here.
    static var doors: [PatientPagesData.MentalHealth.Door] {
        PatientPagesData.MentalHealth.doors.filter { !PatientPagesData.MentalHealth.doorsLeftOut.contains($0.id) }
    }

    /// What was written under the activity page's habit, newest first, from the journal held in memory.
    static func movingEntries(_ entries: [WellbeingEntry]) -> [WellbeingEntry] {
        Wellbeing.ordered(entries.filter { $0.habit == PatientPagesData.Activity.habit })
    }

    /// A tile's value: its written state, or the entries listed under it, counted.
    static func value(of tile: PatientPagesData.Activity.Tile, counting entries: [WellbeingEntry]) -> String {
        tile.value == PatientPagesData.Activity.countValue ? String(entries.count) : tile.value
    }

    /// Whether a tile's value is the count — the one value that is a figure rather than words.
    static func isCount(_ tile: PatientPagesData.Activity.Tile) -> Bool {
        tile.value == PatientPagesData.Activity.countValue
    }

    /* The crisis lines are CrisisLinesData's (Gilbert.Crisis) — names and numbers held where the build
       holds them — each with the sentence about when to use it that the patient-pages generator carries
       beside it, joined by the line's name. A line with no such sentence is still shown: its number is
       the part that matters. */
    struct CrisisLine: Identifiable, Hashable {
        let line: GilbertLine
        let whenToUse: String?
        var id: String { line.number }
    }
    static var crisisLines: [CrisisLine] {
        Gilbert.Crisis.lines.map { CrisisLine(line: $0, whenToUse: PatientPagesData.MentalHealth.Crisis.whenToUse[$0.name]) }
    }
}
