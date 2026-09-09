import SwiftUI

/* A visit that has already happened.
 *
 * The past visit sat in the list with the same shape as an upcoming one — a price, a time and a
 * nurse — and led nowhere at all. It is the screen a returning patient wants most, and what it owes
 * them is four answers in this order: what was measured, whether each of those readings sits inside
 * its reference range, what a doctor said about them, and one way to arrange the same visit again.
 *
 * The readings are the visit's own, looked up by the day the visit happened rather than printed
 * beside it, and every range is the assessment's — Observation.all — never typed here. A nurse
 * records and a doctor reviews: two acts with two names on them, and the attribution sits above all
 * three of the doctor's sentences rather than beside the first one, where it read as a caption on
 * that sentence alone.
 *
 * Ported from apps/web/src/features/VisitSummary.tsx. Where a sentence came from a contract it is
 * the same sentence; where it is the screen's own it is the same sentence too, because two
 * platforms wording the same refusal differently is how a refusal starts being softened on one of
 * them. */

struct PastVisitView: View {
    let service: CareService
    var reference = Passport.lastVisitReference
    var person = Passport.holder.name
    var address = "Home visit · Melville"
    /// Which day's readings belong to this visit. Nil where nothing was filed against it.
    var dayOffset: Int? = Passport.latestSet.dayOffset

    private var readingSet: ReadingSet? { dayOffset.flatMap(Passport.set(onDay:)) }
    private var measures: [Observation] { readingSet.map(Passport.measured(in:)) ?? [] }
    private var outside: [Observation] {
        measures.filter { !Passport.flag($0, readingSet!.values[$0.id]!).isNormal }
    }
    private var visitDate: Date? { readingSet?.date }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space20) {
                DemoBadge()
                CapabilityNotice(of: "clinical-records")
                head
                nurseRow
                if let readingSet { measuredPanel(readingSet); rangePanel(readingSet) } else { nothingFiled }
                doctorPanel
                actions
                Text("A completed visit is not edited from here. If something on it is wrong, ask for a correction under Privacy & settings and the change is recorded beside the original rather than instead of it.")
                    .font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(0.75))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle("What the nurse found").navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - What this visit was

    private var head: some View {
        SurfacePanel(spacing: ThusoSpacing.space16) {
            HStack(alignment: .top, spacing: ThusoSpacing.space12) {
                TileIcon(symbol: service.symbol, tint: ThusoTheme.charcoal, background: ThusoTheme.paleSage, size: 44)
                VStack(alignment: .leading, spacing: 2) {
                    Text(service.name).thusoFont(ThusoType.cardTitle, weight: .semibold)
                        .foregroundStyle(ThusoTheme.charcoal).fixedSize(horizontal: false, vertical: true)
                    Text("\(person) · \(address)").font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: ThusoSpacing.space8)
                MetricChip(text: "Completed")
            }
            .accessibilityElement(children: .combine)
            Hairline()
            FactRow(label: "Reference", value: reference)
            FactRow(label: "When", value: visitDate.map {
                "\(Scheduling.longDate($0)) · 10:00 – \(Scheduling.endTime(start: "10:00", minutes: service.duration))"
            } ?? "As soon as a nurse was free")
            FactRow(label: "Where", value: address)
            /* The price comes off the catalogue entry the visit was booked from. A figure typed onto
               this screen is a figure that can disagree with the one the person paid. */
            FactRow(label: "This visit", value: "R \(service.price)")
        }
    }

    private var nurseRow: some View {
        HStack(spacing: ThusoSpacing.space12) {
            Monogram(text: Arrival.nurse.initials)
            VStack(alignment: .leading, spacing: 2) {
                Text(Passport.nurse.name).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                    .fixedSize(horizontal: false, vertical: true)
                Text(Passport.nurse.role).font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
    }

    // MARK: - What was measured

    /* The subject of the screen, and the only thing on it set large. A status chip above a thin
       numeral with its name below — the shape a figure takes everywhere in this product, so a
       reading is read the same way as a balance or a count. */
    @ViewBuilder private func measuredPanel(_ readings: ReadingSet) -> some View {
        CareSectionHeader("What was measured")
        SurfacePanel(tone: .lead, spacing: ThusoSpacing.space16) {
            ThusoMetrics {
                ForEach(measures) { observation in
                    let value = readings.values[observation.id]!
                    let flag = Passport.flag(observation, value)
                    ThusoMetric(value: Passport.format(observation, value), unit: observation.unit,
                                label: observation.label, chip: flag.chip, flagged: !flag.isNormal)
                }
            }
            /* Colour is never the only difference between two states: every chip carries the word as
               well, and the range each judgement was made against is in the table underneath. */
            Text(outside.isEmpty
                 ? "Every reading taken at this visit sits inside its indicative reference range. The ranges are in the table below."
                 : "\(outside.map(\.label).joined(separator: " and ")) sat outside the indicative range at this visit. A reading outside a range is something to look at, not a diagnosis.")
                .font(.footnote).foregroundStyle(ThusoTheme.charcoal)
                .fixedSize(horizontal: false, vertical: true)
            if let note = readings.note {
                Hairline()
                FactRow(label: "Noted at the visit", value: note)
            }
        }
    }

    /* The same readings as a table, because a reading a person cannot read is not a reading — and a
       table is what somebody reads out to a doctor over the telephone. */
    @ViewBuilder private func rangePanel(_ readings: ReadingSet) -> some View {
        SurfacePanel {
            Text("Every reading taken on \(Scheduling.longDate(readings.date)), with the indicative range it is judged against.")
                .font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                .fixedSize(horizontal: false, vertical: true)
            RangeTable(rows: measures.map { observation in
                let value = readings.values[observation.id]!
                let flag = Passport.flag(observation, value)
                return RangeTable.Row(name: observation.label,
                                      value: "\(Passport.format(observation, value)) \(observation.unit)",
                                      range: Passport.rangeText(observation),
                                      note: flag.isNormal ? nil : flag.shortWord)
            })
        }
    }

    private var nothingFiled: some View {
        SurfacePanel {
            Text("No readings were filed for this visit")
                .thusoFont(ThusoType.cardTitle, weight: .semibold).foregroundStyle(ThusoTheme.charcoal)
                .fixedSize(horizontal: false, vertical: true)
            Text("Nothing was recorded against it, and the record does not fill that in afterwards. If you think something was measured, the nurse who came is the person to ask.")
                .font(.subheadline).foregroundStyle(ThusoTheme.charcoal.opacity(0.75))
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: - What the doctor said

    @ViewBuilder private var doctorPanel: some View {
        CareSectionHeader("What the doctor said")
        SurfacePanel(spacing: ThusoSpacing.space16) {
            FactRow(label: "Reviewed by", value: Passport.reviewer.attribution)
            FactRow(label: "On", value: Scheduling.longDate(Passport.lastReview.date))
            Hairline()
            StatedFact(term: "The assessment", statement: Passport.lastReview.assessment)
            StatedFact(term: "What to do until the next visit", statement: Passport.lastReview.plan)
            StatedFact(term: "What happens next", statement: Passport.lastReview.next)
        }
    }

    @ViewBuilder private var actions: some View {
        NavigationLink { ServicesView() } label: {
            Label("Book \(service.name) again", systemImage: "arrow.counterclockwise").frame(maxWidth: .infinity)
        }.buttonStyle(CareButton())
        NavigationLink { HealthTrendsView() } label: {
            Text("See how this has changed over time").frame(maxWidth: .infinity)
        }.buttonStyle(QuietButton())
    }
}

/* A reading, its value and the range it is judged against, in three real columns.
 *
 * Columns until the text has grown past the point where three of them share a phone's width, and
 * then one block per reading. A three-column grid at AccessibilityXXXL is three words a line and a
 * row eleven lines tall, which is not a table any more — it is a list pretending to be one. */
struct RangeTable: View {
    struct Row: Identifiable, Hashable {
        let name: String
        let value: String
        let range: String
        /// "above" or "below", where the value sits outside the range. Never colour alone.
        var note: String?
        var id: String { name }
    }
    let rows: [Row]
    /* The column headings, because three of the four tables built on this are not tables of
       readings: the kit's is instruments and calibration intervals, and the permission screen's is
       reading types and where each is recorded. A heading that says "Indicative range" over a
       column of calibration intervals is the table lying about its own contents, quietly, to
       somebody reading it to decide something. */
    var columns: (String, String, String) = ("Reading", "Value", "Indicative range")
    /// How the third column is read aloud, where the heading alone would not carry the sense.
    var thirdSpoken: String = "indicative range"
    @Environment(\.dynamicTypeSize) private var typeSize
    private func rangeText(_ row: Row) -> String { row.note.map { "\(row.range) · \($0)" } ?? row.range }

    var body: some View {
        if typeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
                ForEach(rows) { row in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(row.name).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(row.value).font(.subheadline).foregroundStyle(ThusoTheme.charcoal)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityLabel("\(columns.1): \(row.value)")
                        Text("\(columns.2) \(rangeText(row))").font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityElement(children: .combine)
                    if row.id != rows.last?.id { Hairline() }
                }
            }
        } else {
            Grid(alignment: .leading, horizontalSpacing: ThusoSpacing.space12, verticalSpacing: ThusoSpacing.space12) {
                GridRow {
                    Text(columns.0).gridColumnAlignment(.leading)
                    Text(columns.1)
                    Text(columns.2)
                }
                .font(.footnote.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                .accessibilityHidden(true)
                ForEach(rows) { row in
                    Divider().overlay(ThusoTheme.stone).gridCellColumns(3)
                    GridRow {
                        Text(row.name).font(.footnote.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(row.value).font(.footnote.monospacedDigit()).foregroundStyle(ThusoTheme.charcoal)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(rangeText(row)).font(.footnote.monospacedDigit()).foregroundStyle(ThusoTheme.charcoal)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("\(row.name), \(row.value), \(thirdSpoken) \(rangeText(row))")
                }
            }
        }
    }
}
