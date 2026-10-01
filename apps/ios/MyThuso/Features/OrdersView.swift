import SwiftUI

/* A prescription and a laboratory order, and the chain of custody each one carries.
 *
 * Both were system `Form`s. On the laboratory screen that had a cost beyond the styling: four
 * results, two of them out of range, were four grouped rows of equal weight with the word "High"
 * set in the smallest type on the screen at the end of the second line. What a doctor opens a
 * result for is which ones are outside their range, and that was the least prominent thing on it.
 * The panel now leads with a count of the ones outside their range, taken from the same array the
 * rows are drawn from, and each row carries the chip rather than a word in the corner.
 *
 * The chain of custody is the other half of both screens and it is what makes either believable —
 * so it stays exactly as many steps as it was, in the same words, on a hairline rather than in a
 * grouped row. */

/* An attribution line is where a reader is being shown what accountability looks like, so the
 * registration on it is read from the vetting record rather than typed as a row of zeros. A
 * preview is allowed one layer of fiction; a placeholder registration under a real doctor’s name
 * would be two, and the second one teaches a reader that the number is decoration. If the party is
 * not on the register the line says so, which is the honest answer and not a number. */
@MainActor func attributedTo(_ subjectId: String) -> String {
    guard let subject = VettingStore.shared.subject(subjectId) else { return "Not on the vetting register" }
    return "\(subject.name) · \(subject.reference)"
}
struct TimelineStep: Identifiable {
    let label: String, detail: String, at: String, state: String
    var id: String { label }
}
struct TimelineList: View {
    let steps: [TimelineStep]
    var body: some View {
        ForEach(steps) { step in
            HStack(alignment: .top, spacing: ThusoSpacing.space12) {
                Image(systemName: step.state == "done" ? "checkmark.circle.fill" : step.state == "active" ? "circle.dashed" : "circle")
                    .foregroundStyle(ThusoRole.foreground.opacity(step.state == "waiting" ? 0.3 : 1))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
                    /* A step nobody has reached is recessed rather than greyed with a colour of its
                       own: muted charcoal darkens with the ground it sits on, and the tick beside
                       it says the same thing a second way. */
                    Text(step.label).font(.thuso(.subheadline, weight: .semibold))
                        .foregroundStyle(ThusoRole.foreground.opacity(step.state == "waiting" ? ThusoOpacity.charcoalMuted : 1))
                        .fixedSize(horizontal: false, vertical: true)
                    Text(step.detail).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                    if !step.at.isEmpty {
                        Text(step.at).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(.vertical, 3)
            .accessibilityElement(children: .combine)
        }
    }
}
struct PrescriptionView: View {
    var reference = "RX-0081"
    @State private var state: LoadState = .ready
    @State private var checked: Set<String> = []
    private let medicines = [
        ("Amlodipine 5 mg", "Tablet · One tablet each morning", "30 tablets · 5 repeats", "Take with or without food. Report ankle swelling."),
        ("Hydrochlorothiazide 12.5 mg", "Tablet · One tablet each morning", "30 tablets · 5 repeats", "Take early in the day.")
    ]
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space24) {
                DemoBadge()
                SurfaceHeading(eyebrow: "Prescription", title: reference,
                               subtitle: "Issued 4 September · Valid for 6 months · Awaiting pharmacist")
                CapabilityNotice(of: "dispensing")
                /* The lead panel is the pharmacist's own count, and it is the array underneath it
                   rather than a fixture: a preview that said "2 checked" over an unchecked list
                   would be teaching a pharmacist that the tally is decoration. */
                SurfacePanel(tone: .lead, spacing: ThusoSpacing.space16) {
                    ThusoMetrics {
                        ThusoMetric(value: "\(checked.count)", unit: "of \(medicines.count)", label: "Items checked in this preview",
                                    chip: checked.count == medicines.count ? "All checked" : "Awaiting pharmacist",
                                    flagged: checked.count < medicines.count)
                    }
                    FactRow(label: "Patient", value: "Lerato Molefe · 01/01/1980")
                    FactRow(label: "Prescriber", value: attributedTo("D-401"))
                    FactRow(label: "Pharmacy", value: "Rosebank community pharmacy")
                }
                SurfacePanel(tone: .quiet, padding: ThusoSpacing.space16) {
                    StatePicker(title: "Preview the pharmacy connection state", state: $state)
                }
                if state == .ready {
                    SurfacePanel {
                        PanelHead("Items")
                        ForEach(medicines, id: \.0) { medicine in
                            item(medicine)
                            if medicine.0 != medicines.last?.0 { Hairline() }
                        }
                    }
                    SurfacePanel {
                        PanelHead("Chain of custody")
                        TimelineList(steps: [
                            .init(label: "Prescribed", detail: "Signed by the reviewing doctor", at: "4 September, 11:41", state: "done"),
                            .init(label: "Sent to pharmacy", detail: "Encrypted transfer to the dispensing partner", at: "4 September, 11:42", state: "done"),
                            .init(label: "Pharmacist check", detail: "\(checked.count) of \(medicines.count) items checked in this preview", at: "", state: "active"),
                            .init(label: "Dispensed and sealed", detail: "Tamper-evident seal number recorded", at: "", state: "waiting"),
                            .init(label: "Delivered to the patient", detail: "Signature or visit-code handover", at: "", state: "waiting")
                        ])
                    }
                } else {
                    StateBlock(state: state, subject: "The dispensing partner’s order feed",
                               permission: "partner data sharing", retry: { state = .ready }) { EmptyView() }
                }
                Text(Dispensing.crossReference)
                    .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle("Prescription").navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder private func item(_ medicine: (String, String, String, String)) -> some View {
        let on = checked.contains(medicine.0)
        Button {
            if on { checked.remove(medicine.0) } else { checked.insert(medicine.0) }
        } label: {
            HStack(alignment: .top, spacing: ThusoSpacing.space12) {
                Image(systemName: on ? "checkmark.square.fill" : "square")
                    .font(.thuso(.title3)).foregroundStyle(ThusoRole.foreground).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
                    Text(medicine.0).thusoFont(ThusoType.cardTitle, weight: .semibold).foregroundStyle(ThusoRole.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(medicine.1).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(medicine.2).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                    /* What the patient is told, and it is the one line on the card that is not
                       about logistics. Full charcoal, because it is the sentence a person acts on. */
                    Text(medicine.3).font(.thuso(.footnote)).foregroundStyle(ThusoRole.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
    }
}

struct LabOrderView: View {
    var reference = "LAB-0023"
    @State private var state: LoadState = .ready
    @State private var released = false
    private let panel = [("Haemoglobin", "13.9 g/dL", "12.0 – 15.5", ""), ("Fasting glucose", "6.4 mmol/L", "3.9 – 5.6", "High"),
                         ("Creatinine", "74 µmol/L", "49 – 90", ""), ("Total cholesterol", "5.8 mmol/L", "< 5.0", "High")]
    /// Counted from the panel below rather than written into a sentence above it.
    private var outside: Int { panel.filter { !$0.3.isEmpty }.count }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space24) {
                DemoBadge()
                SurfaceHeading(eyebrow: "Laboratory order", title: reference,
                               subtitle: "Requested 4 September · Fasting panel")
                SurfacePanel(tone: .lead, spacing: ThusoSpacing.space16) {
                    ThusoMetrics {
                        ThusoMetric(value: "\(outside)", unit: "of \(panel.count)", label: "Results outside their reference range",
                                    chip: outside == 0 ? "All within range" : "For a clinician to explain", flagged: outside > 0)
                    }
                    FactRow(label: "Standing", value: released ? "Released to patient" : "Awaiting release")
                    FactRow(label: "Requested by", value: attributedTo("D-401"))
                    FactRow(label: "Collected by", value: "Sister Naledi Mokoena")
                    FactRow(label: "Sample seal", value: "SEAL-77341 · Intact on receipt")
                }
                SurfacePanel {
                    PanelHead("Chain of custody")
                    TimelineList(steps: [
                        .init(label: "Ordered", detail: "Doctor requested a fasting panel", at: "4 September, 08:10", state: "done"),
                        .init(label: "Collected at home", detail: "Two tubes drawn, sealed and labelled at the bedside", at: "4 September, 09:05", state: "done"),
                        .init(label: "Courier handover", detail: "Seal scanned by courier · Temperature logged", at: "4 September, 09:40", state: "done"),
                        .init(label: "Received by the laboratory", detail: "Seal verified intact · Accessioned", at: "4 September, 12:15", state: "done"),
                        /* A reference returned, not a result verified: no test is run, so the contract's words. */
                        .init(label: Medicines.ResultsText.returned, detail: Medicines.ResultsText.returnedDetail, at: "5 September, 07:30", state: "done"),
                        .init(label: "Released to the patient", detail: released ? "Visible in the Health Passport with an explanation" : "Held until the requesting doctor releases them", at: "", state: released ? "done" : "active")
                    ])
                }
                SurfacePanel(tone: .quiet, padding: ThusoSpacing.space16) {
                    StatePicker(title: "Preview the laboratory connection state", state: $state)
                }
                if state == .ready {
                    SurfacePanel {
                        PanelHead("Results",
                                  note: "Fictional results. Reference ranges are illustrative and vary by laboratory, age and sex.")
                        ForEach(panel, id: \.0) { row in
                            result(row)
                            if row.0 != panel.last?.0 { Hairline() }
                        }
                    }
                } else {
                    StateBlock(state: state, subject: "The laboratory result feed",
                               permission: "partner data sharing", retry: { state = .ready }) { EmptyView() }
                }
                VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
                    Text("Abnormal results are never pushed to a patient without a clinician’s explanation. Release is a deliberate clinical act, not an automatic notification.")
                        .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                    Button(released ? "Withdraw demo release" : "Release with an explanation") { released.toggle() }
                        .buttonStyle(released ? AnyButtonStyleBox(QuietButton()) : AnyButtonStyleBox(CareButton()))
                }
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle("Laboratory order").navigationBarTitleDisplayMode(.inline)
    }

    /* A row rather than a grouped list row, and the standing is a chip rather than a word in the
       corner in the smallest type on the screen. What a reader opens a result for is which ones
       are outside their range; that was the least prominent thing on it. */
    @ViewBuilder private func result(_ row: (String, String, String, String)) -> some View {
        let flagged = !row.3.isEmpty
        VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space12) {
                    Text(row.0).font(.thuso(.subheadline)).foregroundStyle(ThusoRole.foreground)
                    Spacer(minLength: ThusoSpacing.space8)
                    Text(row.1).font(.thuso(.subheadline, weight: .semibold).monospacedDigit()).foregroundStyle(ThusoRole.foreground)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(row.0).font(.thuso(.subheadline)).foregroundStyle(ThusoRole.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(row.1).font(.thuso(.subheadline, weight: .semibold).monospacedDigit()).foregroundStyle(ThusoRole.foreground)
                }
            }
            HStack(spacing: ThusoSpacing.space8) {
                Text("Reference \(row.2)").font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: ThusoSpacing.space8)
                MetricChip(text: flagged ? row.3 : "Within range", tone: flagged ? .attention : .neutral)
            }
        }
        .padding(.vertical, 3)
        .accessibilityElement(children: .combine)
    }
}

/// Two button styles behind one type, so a button whose weight changes with its meaning does not
/// have to become two buttons in an if/else — which is what makes SwiftUI throw the view's identity
/// away and lose the focus on it.
struct AnyButtonStyleBox: ButtonStyle {
    private let make: (Configuration) -> AnyView
    init<S: ButtonStyle>(_ style: S) {
        make = { AnyView(style.makeBody(configuration: $0)) }
    }
    func makeBody(configuration: Configuration) -> some View { make(configuration) }
}
