import SwiftUI

/* Two screens the Health Passport offered and could not open.
 *
 * "Health trends" drew three charts out of literal arrays typed into the view, and the three device
 * rows under More each went to FeatureDetail — the card that says a workflow will be connected
 * later. Both are screens now, and neither can be mistaken for a working integration: the trends
 * screen renders the record contract's own notice and the device screen renders the device
 * contract's, above everything else, word for word from packages/catalog/capabilities.json.
 *
 * Ported from apps/web/src/features/Passport.tsx. */

// MARK: - Trends

struct HealthTrendsView: View {
    @State private var showAll = false
    private var shown: [Observation] { showAll ? Observation.all : Passport.headline }
    private var latest: ReadingSet { Passport.latestSet }
    private var measures: [Observation] { Passport.measured(in: latest) }
    private var outside: [Observation] {
        measures.filter { !Passport.flag($0, latest.values[$0.id]!).isNormal }
    }
    /// Three months, said as months rather than as a day count nobody can picture.
    private var months: Int { Int((Double(abs(Passport.readingSets[0].dayOffset)) / 30).rounded()) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space20) {
                DemoBadge()
                SurfaceHeading(eyebrow: "Health Passport", title: "How your readings have changed.",
                               subtitle: "\(Passport.readingSets.count) home visits over the last \(months) months. Every reading is judged against an indicative reference range, which is a guide and not a diagnosis.")
                CapabilityNotice(of: "clinical-records")

                /* The lead: where things stand today, before any curve. Somebody opening a trends
                   screen wants the current number first and the shape of it second — the reverse is
                   a chart they have to decode to answer "am I all right". */
                SurfacePanel(tone: .lead, spacing: ThusoSpacing.space16) {
                    PanelHead(title: "Your last visit", note: Scheduling.longDate(latest.date)) {
                        MetricChip(text: outside.isEmpty ? "All inside range" : "\(outside.count) outside range",
                                   flagged: !outside.isEmpty)
                    }
                    ThusoMetrics {
                        ForEach(measures.filter { Passport.headlineIds.contains($0.id) }) { observation in
                            let value = latest.values[observation.id]!
                            let flag = Passport.flag(observation, value)
                            ThusoMetric(value: Passport.format(observation, value), unit: observation.unit,
                                        label: observation.label, chip: flag.chip, flagged: !flag.isNormal)
                        }
                    }
                }

                CareSectionHeader("Over time")
                ForEach(shown) { observation in
                    ClinicalChart(title: observation.label, unit: observation.unit,
                                  readings: Passport.series(observation), normal: observation.range,
                                  decimals: Passport.decimals(observation), symbol: Passport.symbol(observation.id))
                }
                Button { showAll.toggle() } label: {
                    Text(showAll ? "Show the four I watch" : "Show the other \(Passport.others.count) readings")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(QuietButton())
                .accessibilityAddTraits(showAll ? [.isSelected] : [])

                /* Every range on this screen in one table, because somebody who wants to check one
                   number against one range should not have to open seven charts to find it. */
                CareSectionHeader("The ranges these are judged against")
                SurfacePanel {
                    Text("Indicative reference ranges. They are a guide for a healthy adult and are not a validated early-warning score; your own doctor may work to different numbers for you.")
                        .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                    RangeTable(rows: Observation.all.map { observation in
                        let value = latest.values[observation.id]
                        let flag = value.map { Passport.flag(observation, $0) }
                        return RangeTable.Row(
                            name: observation.label,
                            value: value.map { "\(Passport.format(observation, $0)) \(observation.unit)" } ?? "—",
                            range: Passport.rangeText(observation),
                            note: flag.flatMap { $0.isNormal ? nil : $0.shortWord })
                    }, columns: ("Reading", "Your last", "Indicative range"), thirdSpoken: "indicative range")
                }
                Text("Nothing on this screen interprets a reading for you. What a number means for a particular person is a clinical judgement, and MyThuso does not make one.")
                    .font(.thuso(.footnote)).foregroundStyle(ThusoRole.foreground.opacity(0.75))
                    .fixedSize(horizontal: false, vertical: true)
                NavigationLink { ServicesView() } label: {
                    Text("Book a visit to have these taken again").frame(maxWidth: .infinity)
                }.buttonStyle(CareButton())
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle("Health trends").navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - A device permission

/* What would be read, what would never be, how a device reading is filed, and how to turn it off.
 *
 * Every one of those is derived. The reading types are the assessment's own observations, because
 * MyThuso does not ask for a category it has nowhere to file. The refusal is the record contract's
 * protected categories, which are released by the person entry by entry and are not something an
 * operating system's permission sheet can hand over on their behalf. The provenance rule is the
 * capture contract's. And the notice is packages/catalog/capabilities.json's, rendered rather than
 * written.
 *
 * THERE IS NO CONNECT BUTTON, disabled or otherwise. A greyed-out primary would be the biggest
 * thing on a screen that has just finished explaining why it cannot do the one thing the button
 * offers. What is offered instead is the thing that does work: a nurse who brings the instruments
 * herself. */
struct DevicePermissionView: View {
    let integration: DeviceIntegration
    private var device: Provenance { .device }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space20) {
                DemoBadge()
                /* One notice, from the contract, above everything. It is the first thing on the
                   screen because the decision the screen is asking about has not got a subject. */
                CapabilityNotice(of: "devices")
                head
                readable
                neverRead
                filed
                if integration.id == "thuso-kit" { instruments }
                withdrawing
                blocked
                /* Not a connect button: a request that is recorded and reads nothing, on a screen that says so
                   before it offers anything. */
                if let platform = Devices.platform(integration.id) {
                    NavigationLink { WearableLinkRequestView(platformId: platform.id) } label: {
                        Text(Devices.fill(Devices.WearableText.heading, ["platform": platform.name])).frame(maxWidth: .infinity)
                    }.buttonStyle(QuietButton())
                }
                NavigationLink { ServicesView() } label: {
                    Text("Book a visit — the nurse brings the instruments").frame(maxWidth: .infinity)
                }.buttonStyle(CareButton())
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle(integration.name).navigationBarTitleDisplayMode(.inline)
    }

    private var head: some View {
        SurfacePanel {
            HStack(alignment: .top, spacing: ThusoSpacing.space12) {
                TileIcon(symbol: integration.symbol, tint: ThusoRole.foreground,
                         background: ThusoRole.highlight, size: 44)
                VStack(alignment: .leading, spacing: 2) {
                    Text(integration.name).thusoFont(ThusoType.cardTitle, weight: .semibold)
                        .foregroundStyle(ThusoRole.foreground).fixedSize(horizontal: false, vertical: true)
                    Text("Readings from \(integration.platform)").font(.thuso(.footnote))
                        .foregroundStyle(ThusoRole.mutedForeground).fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: ThusoSpacing.space8)
                MetricChip(text: "Not connected", flagged: true)
            }
            .accessibilityElement(children: .combine)
        }
    }

    /* A table rather than seven rows each carrying the same tick in the same sage tile. The units
       and the ranges line up in columns a reader can run an eye down, which is what somebody
       checking whether a permission covers the one reading they care about is actually doing. */
    @ViewBuilder private var readable: some View {
        CareSectionHeader("What would be read")
        SurfacePanel {
            Text("Every reading type MyThuso would ask \(integration.name) for, and nothing else. It asks for these because they are what a visit records; a category it has nowhere to file is a category it does not request.")
                .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
            RangeTable(rows: Passport.readable.map { observation in
                RangeTable.Row(name: observation.label, value: observation.unit,
                               range: Passport.rangeText(observation))
            }, columns: ("Reading", "Recorded in", "Judged against"), thirdSpoken: "judged against")
        }
        Text(integration.sheet).font(.thuso(.footnote)).foregroundStyle(ThusoRole.foreground.opacity(0.75))
            .fixedSize(horizontal: false, vertical: true)
    }

    /* The half of a permission screen that is usually missing. A list of what an app will read tells
       a person nothing without the list of what it will not, and the second list is the one that
       matters to somebody deciding whether to hand over a phone's health store. */
    @ViewBuilder private var neverRead: some View {
        CareSectionHeader("What would never be read")
        SurfacePanel(spacing: ThusoSpacing.space16) {
            StatedFact(term: "Anything in a protected category",
                       statement: "\(Passport.neverRead.joined(separator: ", ")).",
                       footnote: "These are released by you, entry by entry, and a permission sheet cannot hand one over on your behalf.")
            StatedFact(term: "Where you are, who you message, and what else is on the phone",
                       statement: "MyThuso asks for reading types and nothing else.",
                       footnote: "A permission it does not need is a permission it does not ask for.")
            StatedFact(term: "Anything going the other way",
                       statement: "Nothing on your MyThuso record is written back to \(integration.name).",
                       footnote: "Readings would come in. Your record would not go out to a store you did not choose to put it in.")
        }
    }

    @ViewBuilder private var filed: some View {
        CareSectionHeader("How a reading from a device is filed")
        SurfacePanel(spacing: ThusoSpacing.space16) {
            StatedFact(term: device.name, statement: device.detail)
            StatedFact(term: "Its trust, written down beside it", statement: device.trust)
        }
    }

    @ViewBuilder private var instruments: some View {
        CareSectionHeader("The instruments in the kit")
        SurfacePanel {
            Text("What a nurse carries, what each instrument measures, and how often it has to be calibrated. An instrument out of calibration still produces a reading; what it stops producing is one anybody should act on without saying so.")
                .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
            RangeTable(rows: Passport.kitInstruments.map { instrument in
                RangeTable.Row(name: instrument.name,
                               value: instrument.measures.map(Passport.measureName).joined(separator: ", "),
                               range: "Every \(instrument.calibrateEveryMonths) months")
            }, columns: ("Instrument", "Measures", "Calibrated"), thirdSpoken: "calibrated")
        }
    }

    @ViewBuilder private var withdrawing: some View {
        CareSectionHeader("Turning it off again")
        Text(integration.withdraw).font(.thuso(.subheadline)).foregroundStyle(ThusoRole.foreground)
            .fixedSize(horizontal: false, vertical: true)
    }

    /* Why it cannot be switched on today, in the contract's own words rather than in a paraphrase.
       The sentence after them is this screen's, and it is the one that explains the absence a
       reader would otherwise be looking for. */
    private var blocked: some View {
        SurfacePanel(tone: .quiet) {
            Label {
                Text("\(Capabilities.blocking("devices").joined(separator: " ")) Until that changes there is nothing to connect to, so there is no button here pretending otherwise.")
                    .font(.thuso(.footnote)).foregroundStyle(ThusoRole.foreground)
                    .fixedSize(horizontal: false, vertical: true)
            } icon: {
                Image(systemName: "lock.shield").foregroundStyle(ThusoRole.foreground)
            }
            .accessibilityElement(children: .combine)
        }
    }
}
