import SwiftUI

/* A prescription and a laboratory order, and the chain of custody each one carries.
 *
 * The laboratory order types no result. It drew four values, each with a unit, a reference range and
 * on two of them a typed "High", under a count of the ones outside their range — but no contract holds
 * a laboratory reference range (records.json's are the readings a nurse takes at the door), and the
 * synthetic laboratory answers with a reference and never a value (medicines.json#labs). The web
 * stopped on 30 September 2026; the phones did on 2 October. So the order names the tests it asked for
 * off the laboratory's own menu in the vetting register, says in the contract's words what comes back,
 * under the laboratory's own notice, and the values are read in the Health Passport under the patient's
 * grant. scripts/check-boundaries.mjs fails the build if a value, a unit, a range or a flag comes back.
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

/* WHO IS READING. The prescription and the laboratory order open for the patient (the Passport), the
   clinician (the patient file) and the partner who fills them (the partner's orders and results), and
   until 2 October 2026 they drew the patient's name and birth date, the prescriber's name and HPCSA
   number and the nurse who drew the sample whoever opened them — a day after the web stopped.
   packages/catalog/medicines.json#partnerQueue.neverCarries lists the patient, a name, the prescriber
   and the collector, so both screens take `partner`, with no default so that no door can forget to
   say, and a partner is drawn what partnerQueue carries: the order by its reference, what to fill, how
   far along it is, and the prescriber as the vetting register's answer — with their name and
   registration in front of it while the system admin's setting says so (2 October 2026). The
   people are drawn by `whoFor` and nowhere else, so the one function a partner never reaches is the
   one place a person could come back through (scripts/check-boundaries.mjs holds it there).

   WHICH ORDER. Each order is its own fixture, found by its reference. Both screens drew one order
   whatever reference opened them, so LAB-0019, a sample still with the courier, opened LAB-0023's
   returned result and a release button, and RX-0079's one item opened RX-0081's two. A reference with
   no fixture is refused in words rather than shown somebody else's order. */
private let orderPrescriber = "D-401"
/* The people behind an order, for a reader who may know them. The first line returns before any
   person is read, which is the whole of what partnerQueue asks. */
@MainActor private func whoFor(_ partner: Bool, patient: String? = nil, prescriberAs: String, collectedBy: String? = nil) -> [(String, String)] {
    guard !partner else { return [] }
    return (patient.map { [("Patient", $0)] } ?? [])
        + [(prescriberAs, attributedTo(orderPrescriber))]
        + (collectedBy.map { [("Collected by", $0)] } ?? [])
}
/* What a partner is drawn for the prescriber: whether the vetting register lets them stand behind the
   order, in dispensing.json#partner's words, and their name and registration in front of it only while
   the system admin's setting says so — the founder decided on 2 October 2026 that it does by default,
   and this phone draws that default (Dispensing.prescriberAsPartnerSees). */
@MainActor private func standingFor(_ label: String) -> (String, String) {
    let subject = VettingStore.shared.subject(orderPrescriber)
    let decision = subject.map { can($0, "prescribe") } ?? .init(allowed: false, reason: nil, blockedBy: [])
    return (label, Dispensing.prescriberAsPartnerSees(subject, decision))
}
/* A reference nothing here holds is said in words. Drawing another order under its heading was how
   one order's timeline came to stand for every order on the board. */
private struct NoSuchOrder: View {
    let kind: String
    let reference: String
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
                DemoBadge()
                Text("There is no \(kind) \(reference) in this preview, so nothing is drawn for it — not another order under its reference.")
                    .font(.thuso(.subheadline)).foregroundStyle(ThusoRole.foreground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
    }
}
/* The people behind an order, as a partner sees them (nobody, and the register's answer) or as anybody
   else does. One view for both screens, so the branch is written once. */
private struct OrderPeople: View {
    let partner: Bool
    let facts: [(String, String)]
    var body: some View {
        ForEach(facts, id: \.0) { fact in FactRow(label: fact.0, value: fact.1) }
        if partner {
            Text("\(Dispensing.Partner.told) \(Dispensing.Partner.settingPhone)")
                .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
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
private let amlodipine = ("Amlodipine 5 mg", "Tablet · One tablet each morning", "30 tablets · 5 repeats", "Take with or without food. Report ankle swelling.")
private let hydrochlorothiazide = ("Hydrochlorothiazide 12.5 mg", "Tablet · One tablet each morning", "30 tablets · 5 repeats", "Take early in the day.")
private struct ScriptFixture {
    let medicines: [(String, String, String, String)]
    let issued: String
    let patient: String
    let dispensed: Bool
}
/* The two scripts the partner's orders list, each as far along as its row says: RX-0081 is waiting for
   the pharmacist, RX-0079 is dispensed, sealed and waiting for its courier. */
private let scripts: [String: ScriptFixture] = [
    "RX-0081": .init(medicines: [amlodipine, hydrochlorothiazide], issued: "Issued 4 September · Valid for 6 months",
                     patient: "Lerato Molefe · 01/01/1980", dispensed: false),
    "RX-0079": .init(medicines: [amlodipine], issued: "Issued 2 September · Valid for 6 months",
                     patient: "Lerato Molefe · 01/01/1980", dispensed: true)
]
struct PrescriptionView: View {
    var reference = "RX-0081"
    /// Whether a partner is reading. No default, so every door says.
    let partner: Bool
    @State private var state: LoadState = .ready
    @State private var checked: Set<String> = []
    var body: some View {
        if let script = scripts[reference] {
            screen(script)
        } else {
            NoSuchOrder(kind: "prescription", reference: reference)
        }
    }

    private func screen(_ script: ScriptFixture) -> some View {
        let medicines = script.medicines
        let done = script.dispensed ? medicines.count : checked.count
        return ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space24) {
                DemoBadge()
                SurfaceHeading(eyebrow: "Prescription", title: reference,
                               subtitle: "\(script.issued) · \(script.dispensed ? "Dispensed, awaiting courier" : "Awaiting pharmacist")")
                CapabilityNotice(of: "dispensing")
                /* The lead panel is the pharmacist's own count, and it is the array underneath it
                   rather than a fixture: a preview that said "2 checked" over an unchecked list
                   would be teaching a pharmacist that the tally is decoration. */
                SurfacePanel(tone: .lead, spacing: ThusoSpacing.space16) {
                    ThusoMetrics {
                        ThusoMetric(value: "\(done)", unit: "of \(medicines.count)", label: "Items checked in this preview",
                                    chip: done == medicines.count ? "All checked" : "Awaiting pharmacist",
                                    flagged: done < medicines.count)
                    }
                    /* A partner is told whether the prescriber may stand behind the script and not who
                       they are; everybody else reads the people too. */
                    OrderPeople(partner: partner, facts: partner ? [standingFor("Prescriber")]
                                : whoFor(partner, patient: script.patient, prescriberAs: "Prescriber"))
                    FactRow(label: "Pharmacy", value: "Rosebank community pharmacy")
                }
                SurfacePanel(tone: .quiet, padding: ThusoSpacing.space16) {
                    StatePicker(title: "Preview the pharmacy connection state", state: $state)
                }
                if state == .ready {
                    SurfacePanel {
                        PanelHead("Items")
                        ForEach(medicines, id: \.0) { medicine in
                            item(medicine, done: script.dispensed)
                            if medicine.0 != medicines.last?.0 { Hairline() }
                        }
                    }
                    SurfacePanel {
                        PanelHead("Chain of custody")
                        TimelineList(steps: [
                            .init(label: "Prescribed", detail: "Signed by the reviewing doctor", at: "4 September, 11:41", state: "done"),
                            .init(label: "Sent to pharmacy", detail: "Encrypted transfer to the dispensing partner", at: "4 September, 11:42", state: "done"),
                            .init(label: "Pharmacist check", detail: "\(done) of \(medicines.count) items checked in this preview", at: "", state: script.dispensed ? "done" : "active"),
                            .init(label: "Dispensed and sealed", detail: "Tamper-evident seal number recorded", at: "", state: script.dispensed ? "done" : "waiting"),
                            .init(label: "Delivered to the patient", detail: "Signature or visit-code handover", at: "", state: script.dispensed ? "active" : "waiting")
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

    /// A dispensed script's items were checked before it was sealed, so they are drawn checked and fixed.
    @ViewBuilder private func item(_ medicine: (String, String, String, String), done: Bool) -> some View {
        let on = done || checked.contains(medicine.0)
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
        .disabled(done)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
    }
}

private struct LabFixture {
    let what: String
    /// The tests it asked for, each one off the laboratory's menu.
    let asked: [String]
    /// How many steps of the chain of custody are behind it; all five means a result came back.
    let reached: Int
    let collectedBy: String
    let seal: String
    var returned: Bool { reached >= 5 }
}
/* The two orders the partner's results list, each as far along as its row says: LAB-0023 came back and
   waits for its doctor, LAB-0019's sample is with the courier. The tests are the web's four, by name,
   and LAB-0019 asked for the first. */
private let requested = ["Full blood count", "Fasting glucose", "Urea and electrolytes", "Lipogram"]
private let labOrders: [String: LabFixture] = [
    "LAB-0023": .init(what: "Requested 4 September · Fasting panel", asked: requested, reached: 5,
                      collectedBy: "Sister Naledi Mokoena · At home, Rosebank", seal: "SEAL-77341 · Intact on receipt"),
    "LAB-0019": .init(what: "Requested 4 September · Sample in transit", asked: Array(requested.prefix(1)), reached: 2,
                      collectedBy: "Sister Naledi Mokoena · At home, Soweto", seal: "SEAL-77352 · Intact at the courier’s handover")
]
struct LabOrderView: View {
    var reference = "LAB-0023"
    /// Whether a partner is reading. No default, so every door says.
    let partner: Bool
    @State private var released = false
    var body: some View {
        if let order = labOrders[reference] {
            screen(order)
        } else {
            NoSuchOrder(kind: "laboratory order", reference: reference)
        }
    }

    /* The steps as far as this order has got: the ones behind it done, the one in hand active, the rest
       waiting with no time against them. The release step keeps its own state once a result is back. */
    private func progressed(_ steps: [TimelineStep], to order: LabFixture) -> [TimelineStep] {
        steps.enumerated().map { pair -> TimelineStep in
            let (n, step) = pair
            if n == steps.count - 1, order.returned { return step }
            let state = n < order.reached ? "done" : n == order.reached ? "active" : "waiting"
            return .init(label: step.label, detail: step.detail, at: n < order.reached ? step.at : "", state: state)
        }
    }

    private func screen(_ order: LabFixture) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space24) {
                DemoBadge()
                SurfaceHeading(eyebrow: "Laboratory order", title: reference, subtitle: order.what)
                CapabilityNotice(of: "laboratory-results")
                SurfacePanel(tone: .lead, spacing: ThusoSpacing.space16) {
                    FactRow(label: "Standing", value: released ? "Released to patient" : order.returned ? "Awaiting release" : Medicines.ResultsText.notReturned)
                    /* A partner reads the register's answer where the doctor was, and nobody where the
                       nurse who drew the sample was. */
                    OrderPeople(partner: partner, facts: partner ? [standingFor("Requested by")]
                                : whoFor(partner, prescriberAs: "Requested by", collectedBy: order.collectedBy))
                    FactRow(label: "Sample seal", value: order.seal)
                }
                SurfacePanel {
                    PanelHead("Chain of custody")
                    TimelineList(steps: progressed([
                        .init(label: "Ordered", detail: "Doctor requested a fasting panel", at: "4 September, 08:10", state: "done"),
                        .init(label: "Collected at home", detail: "Two tubes drawn, sealed and labelled at the bedside", at: "4 September, 09:05", state: "done"),
                        .init(label: "Courier handover", detail: "Seal scanned by courier · Temperature logged", at: "4 September, 09:40", state: "done"),
                        .init(label: "Received by the laboratory", detail: "Seal verified intact · Accessioned", at: "4 September, 12:15", state: "done"),
                        /* A reference returned, not a result verified: no test is run, so the contract's words. */
                        .init(label: Medicines.ResultsText.returned, detail: Medicines.ResultsText.returnedDetail, at: "5 September, 07:30", state: "done"),
                        .init(label: "Released to the patient", detail: released ? "Visible in the Health Passport with an explanation" : "Held until the requesting doctor releases them", at: "", state: released ? "done" : "active")
                    ], to: order))
                }
                if !order.returned {
                    Text("This sample is still on its way to the laboratory, so nothing has come back for it.")
                        .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                }
                /* The tests it asked for, off the laboratory's menu, and what comes back for them: a
                   reference, never a value. */
                SurfacePanel {
                    PanelHead("Tests ordered", note: Medicines.ResultsText.ordered)
                    let tests = Vetting.scopeOptions(for: "laboratory").filter { order.asked.contains($0) }
                    ForEach(tests, id: \.self) { test in
                        Text(test).font(.thuso(.subheadline)).foregroundStyle(ThusoRole.foreground)
                            .padding(.vertical, 3)
                        if test != tests.last { Hairline() }
                    }
                }
                VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
                    Text("Abnormal results are never pushed to a patient without a clinician’s explanation. Release is a deliberate clinical act, not an automatic notification.")
                        .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                    /* Release is withheld from the partner. vetting.json grants a laboratory
                       release-lab-result, and the partner's own Results board says a clinician releases
                       a result; of the two, the clinician's rule is the one a patient is protected by,
                       so a partner reads the sentence and is drawn no control. */
                    if partner {
                        Label(Dispensing.Partner.releaseWithheld, systemImage: "nosign")
                            .font(.thuso(.footnote)).foregroundStyle(ThusoRole.foreground)
                            .fixedSize(horizontal: false, vertical: true)
                    } else if order.returned {
                        Button(released ? "Withdraw demo release" : "Release with an explanation") { released.toggle() }
                            .buttonStyle(released ? AnyButtonStyleBox(QuietButton()) : AnyButtonStyleBox(CareButton()))
                    }
                }
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle("Laboratory order").navigationBarTitleDisplayMode(.inline)
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
