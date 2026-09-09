import SwiftUI

/* What your readings mean.
 *
 * The passport has drawn seven reference ranges since it was written and has never said what one of
 * them measures. "136 mmHg, 90–140" answers whether a number is inside the lines. It does not
 * answer the question the person actually opened the screen with, and the question they actually
 * opened the screen with gets asked of a search engine instead — which will diagnose them,
 * confidently, in about four seconds.
 *
 * So it is answered here, in writing, by a person, with the provenance of the writing on the screen
 * rather than in a policy. This is where `screening` will eventually live. The written version is
 * not a placeholder for the model: it is the thing the model will have to be better than, and
 * unlike the model it can be read in full by a clinician before it ships.
 *
 * Three things hold the line. Each entry says what a reading outside the range *may* follow from,
 * beginning with the ordinary reasons, because the ordinary reasons are usually the right ones.
 * "What you can do" is never a change to a medicine. And every entry carries the red flags from
 * packages/catalog/sos.json by id, with the door to the emergency pathway on it — a screen that
 * explains blood pressure to somebody having a stroke is a screen that has done harm.
 *
 * The rows are collapsed by default and only one is open at a time. Seven of these expanded is two
 * thousand words, and a person came here about one reading. */

struct ReadingsExplainedView: View {
    @State private var shown: String?

    private var latest: ReadingSet { Passport.latestSet }
    private var measures: [Observation] { Passport.measured(in: latest) }
    private var inside: Int {
        measures.filter { Passport.flag($0, latest.values[$0.id]!).isNormal }.count
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space20) {
                DemoBadge()
                SurfaceHeading(eyebrow: "Health Passport", title: "What your readings mean.",
                               subtitle: "What each measurement is, what a number outside its range may follow from, and who decides what any of it means for you.")
                CapabilityNotice(of: "screening")
                lead
                readings
                whereTheWordsComeFrom
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle("What readings mean").navigationBarTitleDisplayMode(.inline)
    }

    /* The lead is a count and not a verdict. "All inside range" is a fact about seven numbers on one
       day; it is not "you are well", and the sentence under it says so before anything else does. */
    private var lead: some View {
        SurfacePanel(tone: .lead, spacing: ThusoSpacing.space16) {
            PanelHead("Your last visit", note: Scheduling.longDate(latest.date))
            ThusoMetrics {
                ThusoMetric(value: String(inside), unit: "of \(measures.count)",
                            label: "Readings inside their range", chip: "On the day they were taken",
                            flagged: inside < measures.count)
            }
            Text(Explain.Provenance.whoDecides).font(.footnote)
                .foregroundStyle(ThusoTheme.charcoal).fixedSize(horizontal: false, vertical: true)
        }
    }

    private var readings: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            CareSectionHeader("Choose a reading")
            SurfacePanel(padding: ThusoSpacing.space16, spacing: ThusoSpacing.space12) {
                ForEach(Array(Explain.all.enumerated()), id: \.element.id) { index, explanation in
                    if let observation = Explain.observation(explanation) {
                        row(explanation, observation)
                        if index != Explain.all.count - 1 { Hairline() }
                    }
                }
            }
        }
    }

    /* No tile on these rows. Seven identical sage squares — two of them the same heart, for the two
       halves of one blood-pressure reading — is a colour that has stopped carrying information, and
       the space it took is where the one thing on the row that does mean something now sits: where
       the last reading fell against its own range, as a word rather than as a tint. */
    @ViewBuilder private func row(_ explanation: Explanation, _ observation: Observation) -> some View {
        let value = latest.values[observation.id]
        let flag = value.map { Passport.flag(observation, $0) }
        let open = shown == explanation.id
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            Button {
                shown = open ? nil : explanation.id
            } label: {
                HStack(alignment: .top, spacing: ThusoSpacing.space12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(observation.label).font(.subheadline.weight(.semibold))
                            .foregroundStyle(ThusoTheme.charcoal).fixedSize(horizontal: false, vertical: true)
                        Text(value.map { "\(Passport.rangeText(observation)) · your last was \(Passport.format(observation, $0)) \(observation.unit)" }
                             ?? Passport.rangeText(observation))
                            .font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(0.72))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: ThusoSpacing.space8)
                    if let flag {
                        /* The passport's own words for where a reading fell, so the same reading
                           is not "above range" on one screen and "above the range" on the next. */
                        MetricChip(text: flag.chip, tone: flag.isNormal ? .neutral : .attention)
                    }
                    Image(systemName: open ? "chevron.up" : "chevron.down")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(ThusoTheme.charcoal.opacity(0.72))
                        .frame(width: 24, height: 44).accessibilityHidden(true)
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isButton)
            .accessibilityHint(open ? "Collapses this explanation" : "Opens what this reading measures")
            if open {
                StatedFact(term: "What it measures", statement: explanation.measures)
                StatedFact(term: "A reading above the range", statement: explanation.above)
                StatedFact(term: "A reading below the range", statement: explanation.below)
                StatedFact(term: "What you can do", statement: explanation.whatToDo)
                urgentNote(explanation)
            }
        }
    }

    /* The red flags, from the emergency contract by id. This screen can never invent a ninth or
       soften one of the eight, and it is the only thing on the page with a door out of it. */
    private func urgentNote(_ explanation: Explanation) -> some View {
        let names = Explain.urgent(explanation).map { $0.name.lowercased() }.joined(separator: ", ")
        return VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            Label("Not this screen: \(names). Any of those is an emergency and needs an ambulance rather than a reading.",
                  systemImage: "exclamationmark.triangle")
                .font(.footnote).foregroundStyle(ThusoTheme.mangoInk)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityElement(children: .combine)
            NavigationLink { SosView() } label: {
                Label("Open Thuso SOS", systemImage: "cross.case.circle").frame(maxWidth: .infinity)
            }.buttonStyle(QuietButton())
        }
        .padding(ThusoSpacing.space12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ThusoTheme.mangoSoft, in: RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous))
    }

    /* Provenance, and it is on the screen rather than in a policy. A reader deciding how much weight
       to give four paragraphs about their own blood pressure is owed this before the paragraphs. */
    private var whereTheWordsComeFrom: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            CareSectionHeader("Where these words come from")
            SurfacePanel(spacing: ThusoSpacing.space16) {
                StatedFact(term: "Written down, not generated", statement: Explain.Provenance.written)
                Hairline()
                StatedFact(term: "No clinician has reviewed this wording", statement: Explain.Provenance.unreviewed)
                Hairline()
                StatedFact(term: "The ranges are the nurse’s own", statement: Explain.Provenance.ranges)
                Hairline()
                StatedFact(term: "Nothing here changes a medicine", statement: Explain.Provenance.neverChange)
            }
            NavigationLink { HealthTrendsView() } label: {
                Text("See how your readings have changed").frame(maxWidth: .infinity)
            }.buttonStyle(CareButton())
        }
    }
}
