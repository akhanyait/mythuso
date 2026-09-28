import SwiftUI

/* Employer and sponsor programme administration.

   Both parties are already on the vetting register with a hard refusal attached, and the refusals
   are the feature. An employer may pay for care and still never see who used it. A sponsorship is a
   payment, not a permission.

   The employer's report is the part worth reading. Every figure on it is a count of people, and a
   count of people is a disclosure about each of them, so the table is built by asking which counts
   may be published at all — a floor of twelve, a dominance rule for the group where thirteen of
   fourteen answered the same way, secondary suppression so nothing can be had by subtracting, and
   rounding so two reports laid side by side do not name whoever changed their mind. The groups
   shown deliberately do not add up to the total, and the screen says why rather than leaving a
   reader to think it is a defect.

   A suppressed row says why. A blank with no explanation reads as an error and invites somebody to
   go and ask for it; a blank that says "fewer than twelve people" is an answer.

   The sponsor's side is shorter and harder. They see that care happened, when, and what it cost.
   They do not see what it was for, and whether the service is even named is the recipient's switch
   rather than the sponsor's request.

   Nothing here reports anything. No employer is contacted, no payment is taken, and every company,
   cohort and person is fictional. */

private let programmeEmployers = ["E-011", "E-012"]
private let programmeSponsors = ["S-021", "S-022"]
private let programmeDay = Date.FormatStyle().day().month(.wide).year()

private func randAmount(_ amount: Int) -> String {
    let formatter = NumberFormatter()
    formatter.numberStyle = .decimal
    formatter.groupingSeparator = " "
    return "R \(formatter.string(from: NSNumber(value: amount)) ?? String(amount))"
}
private func percent(_ value: Double) -> String { "\(Int((value * 100).rounded()))%" }

struct ProgrammesView: View {
    @ObservedObject private var vetting = VettingStore.shared
    @State private var employerId = programmeEmployers[1]
    @State private var programmeId = Programmes.programmes[0].id
    @State private var sponsorId = programmeSponsors[1]
    /* The switch belongs to the recipient, in her own account. It is here so a reader can see what
       it does to the sponsor's statement — not because a sponsor could reach it. */
    @State private var serviceNamed = true

    private var employer: VettingSubject? { vetting.subject(employerId) }
    private var sponsor: VettingSubject? { vetting.subject(sponsorId) }
    private var mayRunProgramme: VettingDecision? { employer.map { can($0, "run-programme") } }
    private var maySponsor: VettingDecision? { sponsor.map { can($0, "sponsor-care") } }
    private var report: ProgrammeReport { Programmes.suppress(Programmes.programme(programmeId)) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
                DemoBadge()
                CareHeading(eyebrow: "Admin workspace", title: "Programme administration",
                            subtitle: "Fictional companies, fictional cohorts and nothing reported anywhere.")
                floorSection
                reportSection
                disclosureSection
                decliningSection
                joiningAndLeaving
                sponsorSection
                refusalsSection
            }
            .padding(ThusoSpacing.space16)
        }
        .thusoGround()
        .navigationTitle("Programme administration").navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - The floor

    private var floorSection: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            heading("The floor")
            CareCard {
                figure("\(Programmes.floor.minimumCohort)", "people, minimum", Programmes.floor.whyTwelve)
                figure(percent(Programmes.floor.dominanceCeiling), "dominance ceiling", Programmes.floor.whyDominance)
                figure("\(Programmes.floor.roundTo)", "rounded to the nearest", Programmes.floor.whyRounding)
                figure("\(Programmes.floor.minimumSuppressed)", "rows hidden, minimum", Programmes.floor.whySecondary)
                Text("This floor is a judgement, not a standard. Nothing in POPIA names a number, and no Information Officer has signed this one off. It is written down so that it can be argued with.")
                    .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
            }
        }
    }

    private func figure(_ value: String, _ label: String, _ why: String) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(value).font(.thuso(.largeTitle, weight: .bold)).foregroundStyle(ThusoRole.foreground)
            Text(label.uppercased()).font(.thuso(.caption2, weight: .bold)).foregroundStyle(ThusoRole.mutedForeground)
            Text(why).font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    // MARK: - The report

    private var reportSection: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            heading("What the employer is sent")
            Picker("Employer", selection: $employerId) {
                ForEach(programmeEmployers, id: \.self) { Text(vetting.subject($0)?.name ?? $0).tag($0) }
            }
            Picker("Programme", selection: $programmeId) {
                ForEach(Programmes.programmes) { Text($0.name).tag($0.id) }
            }
            if let decision = mayRunProgramme, !decision.allowed {
                alert(decision.reason ?? "")
            } else {
                let current = report
                CareCard {
                    Text(current.programme.name).font(.thuso(.body, weight: .bold)).foregroundStyle(ThusoRole.foreground)
                    Text("\(vetting.subject(employerId)?.name ?? "") · running since \(current.programme.started.formatted(programmeDay))")
                        .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                    StatusPill(text: "\(current.suppressed.count) of \(current.rows.count) groups not reported", tone: "amber")
                    ForEach(current.rows) { row in reportRow(row) }
                    Divider()
                    HStack {
                        Text("Everybody").font(.thuso(.footnote, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                        Spacer(minLength: 8)
                        Text("\(current.totalTookPart) of \(current.totalEligible) · \(percent(current.totalUptake))")
                            .font(.thuso(.footnote, weight: .semibold)).monospacedDigit().foregroundStyle(ThusoRole.foreground)
                    }
                    Text("The groups shown add up to \(current.publishedTookPart), and the total says \(current.totalTookPart). That is not an error. \(Programmes.rule("figures-do-not-reconcile").sentence)")
                        .font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
                    Text(current.programme.note).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                    Text(Programmes.rule("rounded-not-exact").sentence)
                        .font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
                }
            }
        }
    }

    @ViewBuilder private func reportRow(_ row: ReportedCohort) -> some View {
        if let reason = row.suppressedBy {
            VStack(alignment: .leading, spacing: 5) {
                Text(row.cohort.name).font(.thuso(.footnote, weight: .semibold)).foregroundStyle(ThusoRole.mutedForeground)
                Text("NOT REPORTED").font(.thuso(.caption2, weight: .bold)).foregroundStyle(ThusoRole.warningInk)
                Text(Programmes.suppressionReason(reason).sentence)
                    .font(.thuso(.caption)).foregroundStyle(ThusoRole.foreground)
            }
            .padding(ThusoSpacing.space12).frame(maxWidth: .infinity, alignment: .leading)
            .background(ThusoRole.warningTint, in: RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous))
            .accessibilityElement(children: .combine)
        } else {
            HStack(alignment: .top) {
                Text(row.cohort.name).font(.thuso(.footnote)).foregroundStyle(ThusoRole.foreground)
                Spacer(minLength: 8)
                Text("\(row.tookPart) of \(row.eligible) · \(percent(row.uptake)) · \(row.advisedToSeeADoctor) advised")
                    .font(.thuso(.caption)).monospacedDigit().foregroundStyle(ThusoRole.mutedForeground)
                    .multilineTextAlignment(.trailing)
            }
            .accessibilityElement(children: .combine)
        }
    }

    // MARK: - Sees and never sees

    private var disclosureSection: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            CareCard {
                Text("WHAT AN EMPLOYER SEES").font(.thuso(.caption2, weight: .bold)).foregroundStyle(ThusoRole.mutedForeground)
                ForEach(Programmes.employerSees) { item in bullet(item) }
            }
            CareCard {
                Text("WHAT AN EMPLOYER NEVER SEES").font(.thuso(.caption2, weight: .bold)).foregroundStyle(ThusoRole.dangerInk)
                ForEach(Programmes.employerNeverSees) { item in bullet(item) }
            }
            refusal(Programmes.refusal("named-result"))
        }
    }

    private var decliningSection: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            heading("Saying no")
            CareCard {
                Text(Programmes.declining.headline).font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                Text(Programmes.declining.note).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                Text(Programmes.declining.detail).font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
                Text(Programmes.rule("taking-part-is-the-employees").sentence)
                    .font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
                refusal(Programmes.refusal("learn-who-declined"))
                refusal(Programmes.refusal("condition-employment"))
            }
        }
    }

    private var joiningAndLeaving: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            heading("Joining, and leaving")
            CareCard {
                Text("HOW SOMEBODY JOINS").font(.thuso(.caption2, weight: .bold)).foregroundStyle(ThusoRole.mutedForeground)
                ForEach(Array(Programmes.enrolment.enumerated()), id: \.element.id) { index, step in
                    step0(index + 1, step)
                }
            }
            CareCard {
                Text("WHAT HAPPENS WHEN THEY LEAVE").font(.thuso(.caption2, weight: .bold)).foregroundStyle(ThusoRole.mutedForeground)
                ForEach(Programmes.leaving) { step in
                    VStack(alignment: .leading, spacing: 3) {
                        Text(step.label).font(.thuso(.footnote, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                        Text(step.detail).font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
            Text(Programmes.rule("leaving-does-not-unpublish").sentence)
                .font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
        }
    }

    private func step0(_ number: Int, _ step: ProgrammeStep) -> some View {
        HStack(alignment: .top, spacing: ThusoSpacing.space8) {
            Text("\(number)").font(.thuso(.caption2, weight: .bold)).foregroundStyle(ThusoRole.foreground)
                .frame(width: 20, height: 20).background(ThusoRole.highlight, in: Circle())
            VStack(alignment: .leading, spacing: 3) {
                Text(step.label).font(.thuso(.footnote, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                Text(step.detail).font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
            }
        }
        .accessibilityElement(children: .combine)
    }

    // MARK: - The sponsor

    private var sponsorSection: some View {
        let s = Programmes.statement
        return VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            heading("Somebody paying for somebody else")
            Picker("Sponsor", selection: $sponsorId) {
                ForEach(programmeSponsors, id: \.self) { Text(vetting.subject($0)?.name ?? $0).tag($0) }
            }
            if let decision = maySponsor, !decision.allowed { alert(decision.reason ?? "") }
            CareCard {
                Text("\(vetting.subject(s.sponsor)?.name ?? s.sponsor) is paying for \(s.recipient)")
                    .font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                Text("\(s.relationship) · \(randAmount(s.setAside)) set aside · \(randAmount(s.remaining)) left")
                    .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                Text(Programmes.sponsorConsent.headline).font(.thuso(.footnote, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                Text(Programmes.sponsorConsent.detail).font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
                Text(Programmes.sponsorConsent.withdrawal).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                Toggle(isOn: $serviceNamed) {
                    Text("\(s.recipient) lets this sponsor see which visit it was")
                        .font(.thuso(.caption)).foregroundStyle(ThusoRole.foreground)
                }
                Text(Programmes.lineDetailChoices.first { $0.id == (serviceNamed ? "service-named" : "amount-only") }?.detail ?? "")
                    .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                ForEach(s.lines) { line in
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(serviceNamed ? line.service : "Care was given")
                                .font(.thuso(.footnote)).foregroundStyle(ThusoRole.foreground)
                            Text(line.on.formatted(programmeDay)).font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
                        }
                        Spacer(minLength: 8)
                        Text(randAmount(line.amount)).font(.thuso(.footnote, weight: .semibold)).monospacedDigit()
                    }
                    .accessibilityElement(children: .combine)
                }
                Divider()
                HStack {
                    Text("Drawn from what was set aside").font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                    Spacer(minLength: 8)
                    Text(randAmount(s.spent)).font(.thuso(.subheadline, weight: .semibold)).monospacedDigit()
                }
                Text("WHAT A SPONSOR NEVER SEES").font(.thuso(.caption2, weight: .bold)).foregroundStyle(ThusoRole.dangerInk)
                ForEach(Programmes.sponsorNeverSees) { item in bullet(item) }
                Text(Programmes.rule("paying-is-not-permission").sentence)
                    .font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
                refusal(Programmes.refusal("require-the-detail"))
            }
        }
    }

    private var refusalsSection: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            heading("What this screen will not do")
            ForEach(Programmes.refusals) { item in CareCard { refusal(item) } }
            Text("No report is produced, no invitation is sent and no payment is taken. Every count above is fictional, the suppression is arithmetic on it, and the floor itself still needs an Information Officer to agree with it.")
                .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
        }
    }

    // MARK: - Small parts

    private func heading(_ text: String) -> some View {
        Text(text).font(.thuso(.body, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
    }

    private func bullet(_ item: Disclosure) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(item.what).font(.thuso(.footnote, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
            Text(item.why).font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private func alert(_ text: String) -> some View {
        HStack(alignment: .top, spacing: ThusoSpacing.space12) {
            Image(systemName: "shield.slash").font(.thuso(.callout)).foregroundStyle(ThusoRole.warningInk)
            Text(text).font(.thuso(.caption)).foregroundStyle(ThusoRole.foreground)
        }
        .padding(ThusoSpacing.space16).frame(maxWidth: .infinity, alignment: .leading)
        .background(ThusoRole.warningTint, in: RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous))
    }

    private func refusal(_ item: ProgrammeRefusal) -> some View {
        HStack(alignment: .top, spacing: ThusoSpacing.space12) {
            Image(systemName: "nosign").font(.thuso(.callout)).foregroundStyle(ThusoRole.dangerInk)
            Text(item.sentence).font(.thuso(.caption)).foregroundStyle(ThusoRole.foreground)
        }
    }
}
