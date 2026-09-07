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
        .background(ThusoTheme.canvas)
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
                    .font(.footnote).foregroundStyle(ThusoTheme.faint)
            }
        }
    }

    private func figure(_ value: String, _ label: String, _ why: String) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(value).font(.largeTitle.weight(.bold)).foregroundStyle(ThusoTheme.slate)
            Text(label.uppercased()).font(.caption2.weight(.bold)).foregroundStyle(ThusoTheme.faint)
            Text(why).font(.caption).foregroundStyle(ThusoTheme.body)
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
                    Text(current.programme.name).font(.body.weight(.bold)).foregroundStyle(ThusoTheme.ink)
                    Text("\(vetting.subject(employerId)?.name ?? "") · running since \(current.programme.started.formatted(programmeDay))")
                        .font(.footnote).foregroundStyle(ThusoTheme.body)
                    StatusPill(text: "\(current.suppressed.count) of \(current.rows.count) groups not reported", tone: "amber")
                    ForEach(current.rows) { row in reportRow(row) }
                    Divider()
                    HStack {
                        Text("Everybody").font(.footnote.weight(.semibold)).foregroundStyle(ThusoTheme.ink)
                        Spacer(minLength: 8)
                        Text("\(current.totalTookPart) of \(current.totalEligible) · \(percent(current.totalUptake))")
                            .font(.footnote.weight(.semibold)).monospacedDigit().foregroundStyle(ThusoTheme.ink)
                    }
                    Text("The groups shown add up to \(current.publishedTookPart), and the total says \(current.totalTookPart). That is not an error. \(Programmes.rule("figures-do-not-reconcile").sentence)")
                        .font(.caption).foregroundStyle(ThusoTheme.body)
                    Text(current.programme.note).font(.footnote).foregroundStyle(ThusoTheme.faint)
                    Text(Programmes.rule("rounded-not-exact").sentence)
                        .font(.caption).foregroundStyle(ThusoTheme.body)
                }
            }
        }
    }

    @ViewBuilder private func reportRow(_ row: ReportedCohort) -> some View {
        if let reason = row.suppressedBy {
            VStack(alignment: .leading, spacing: 5) {
                Text(row.cohort.name).font(.footnote.weight(.semibold)).foregroundStyle(ThusoTheme.faint)
                Text("NOT REPORTED").font(.caption2.weight(.bold)).foregroundStyle(ThusoTheme.mangoInk)
                Text(Programmes.suppressionReason(reason).sentence)
                    .font(.caption).foregroundStyle(ThusoTheme.slate)
            }
            .padding(ThusoSpacing.space12).frame(maxWidth: .infinity, alignment: .leading)
            .background(ThusoTheme.mangoSoft, in: RoundedRectangle(cornerRadius: ThusoRadius.card, style: .continuous))
            .accessibilityElement(children: .combine)
        } else {
            HStack(alignment: .top) {
                Text(row.cohort.name).font(.footnote).foregroundStyle(ThusoTheme.ink)
                Spacer(minLength: 8)
                Text("\(row.tookPart) of \(row.eligible) · \(percent(row.uptake)) · \(row.advisedToSeeADoctor) advised")
                    .font(.caption).monospacedDigit().foregroundStyle(ThusoTheme.body)
                    .multilineTextAlignment(.trailing)
            }
            .accessibilityElement(children: .combine)
        }
    }

    // MARK: - Sees and never sees

    private var disclosureSection: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            CareCard {
                Text("WHAT AN EMPLOYER SEES").font(.caption2.weight(.bold)).foregroundStyle(ThusoTheme.faint)
                ForEach(Programmes.employerSees) { item in bullet(item) }
            }
            CareCard {
                Text("WHAT AN EMPLOYER NEVER SEES").font(.caption2.weight(.bold)).foregroundStyle(ThusoTheme.danger)
                ForEach(Programmes.employerNeverSees) { item in bullet(item) }
            }
            refusal(Programmes.refusal("named-result"))
        }
    }

    private var decliningSection: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            heading("Saying no")
            CareCard {
                Text(Programmes.declining.headline).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.ink)
                Text(Programmes.declining.note).font(.footnote).foregroundStyle(ThusoTheme.faint)
                Text(Programmes.declining.detail).font(.caption).foregroundStyle(ThusoTheme.body)
                Text(Programmes.rule("taking-part-is-the-employees").sentence)
                    .font(.caption).foregroundStyle(ThusoTheme.body)
                refusal(Programmes.refusal("learn-who-declined"))
                refusal(Programmes.refusal("condition-employment"))
            }
        }
    }

    private var joiningAndLeaving: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            heading("Joining, and leaving")
            CareCard {
                Text("HOW SOMEBODY JOINS").font(.caption2.weight(.bold)).foregroundStyle(ThusoTheme.faint)
                ForEach(Array(Programmes.enrolment.enumerated()), id: \.element.id) { index, step in
                    step0(index + 1, step)
                }
            }
            CareCard {
                Text("WHAT HAPPENS WHEN THEY LEAVE").font(.caption2.weight(.bold)).foregroundStyle(ThusoTheme.faint)
                ForEach(Programmes.leaving) { step in
                    VStack(alignment: .leading, spacing: 3) {
                        Text(step.label).font(.footnote.weight(.semibold)).foregroundStyle(ThusoTheme.ink)
                        Text(step.detail).font(.caption).foregroundStyle(ThusoTheme.body)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
            Text(Programmes.rule("leaving-does-not-unpublish").sentence)
                .font(.caption).foregroundStyle(ThusoTheme.body)
        }
    }

    private func step0(_ number: Int, _ step: ProgrammeStep) -> some View {
        HStack(alignment: .top, spacing: ThusoSpacing.space8) {
            Text("\(number)").font(.caption2.weight(.bold)).foregroundStyle(ThusoTheme.indigoDeep)
                .frame(width: 20, height: 20).background(ThusoTheme.indigoSoft, in: Circle())
            VStack(alignment: .leading, spacing: 3) {
                Text(step.label).font(.footnote.weight(.semibold)).foregroundStyle(ThusoTheme.ink)
                Text(step.detail).font(.caption).foregroundStyle(ThusoTheme.body)
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
                    .font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.ink)
                Text("\(s.relationship) · \(randAmount(s.setAside)) set aside · \(randAmount(s.remaining)) left")
                    .font(.footnote).foregroundStyle(ThusoTheme.body)
                Text(Programmes.sponsorConsent.headline).font(.footnote.weight(.semibold)).foregroundStyle(ThusoTheme.ink)
                Text(Programmes.sponsorConsent.detail).font(.caption).foregroundStyle(ThusoTheme.body)
                Text(Programmes.sponsorConsent.withdrawal).font(.footnote).foregroundStyle(ThusoTheme.faint)
                Toggle(isOn: $serviceNamed) {
                    Text("\(s.recipient) lets this sponsor see which visit it was")
                        .font(.caption).foregroundStyle(ThusoTheme.ink)
                }
                Text(Programmes.lineDetailChoices.first { $0.id == (serviceNamed ? "service-named" : "amount-only") }?.detail ?? "")
                    .font(.footnote).foregroundStyle(ThusoTheme.faint)
                ForEach(s.lines) { line in
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(serviceNamed ? line.service : "Care was given")
                                .font(.footnote).foregroundStyle(ThusoTheme.ink)
                            Text(line.on.formatted(programmeDay)).font(.caption).foregroundStyle(ThusoTheme.faint)
                        }
                        Spacer(minLength: 8)
                        Text(randAmount(line.amount)).font(.footnote.weight(.semibold)).monospacedDigit()
                    }
                    .accessibilityElement(children: .combine)
                }
                Divider()
                HStack {
                    Text("Drawn from what was set aside").font(.footnote).foregroundStyle(ThusoTheme.body)
                    Spacer(minLength: 8)
                    Text(randAmount(s.spent)).font(.subheadline.weight(.semibold)).monospacedDigit()
                }
                Text("WHAT A SPONSOR NEVER SEES").font(.caption2.weight(.bold)).foregroundStyle(ThusoTheme.danger)
                ForEach(Programmes.sponsorNeverSees) { item in bullet(item) }
                Text(Programmes.rule("paying-is-not-permission").sentence)
                    .font(.caption).foregroundStyle(ThusoTheme.body)
                refusal(Programmes.refusal("require-the-detail"))
            }
        }
    }

    private var refusalsSection: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            heading("What this screen will not do")
            ForEach(Programmes.refusals) { item in CareCard { refusal(item) } }
            Text("No report is produced, no invitation is sent and no payment is taken. Every count above is fictional, the suppression is arithmetic on it, and the floor itself still needs an Information Officer to agree with it.")
                .font(.footnote).foregroundStyle(ThusoTheme.faint)
        }
    }

    // MARK: - Small parts

    private func heading(_ text: String) -> some View {
        Text(text).font(.body.weight(.semibold)).foregroundStyle(ThusoTheme.ink)
    }

    private func bullet(_ item: Disclosure) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(item.what).font(.footnote.weight(.semibold)).foregroundStyle(ThusoTheme.ink)
            Text(item.why).font(.caption).foregroundStyle(ThusoTheme.body)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private func alert(_ text: String) -> some View {
        HStack(alignment: .top, spacing: ThusoSpacing.space12) {
            Image(systemName: "shield.slash").font(.callout).foregroundStyle(ThusoTheme.mangoInk)
            Text(text).font(.caption).foregroundStyle(ThusoTheme.slate)
        }
        .padding(ThusoSpacing.space16).frame(maxWidth: .infinity, alignment: .leading)
        .background(ThusoTheme.mangoSoft, in: RoundedRectangle(cornerRadius: ThusoRadius.card, style: .continuous))
    }

    private func refusal(_ item: ProgrammeRefusal) -> some View {
        HStack(alignment: .top, spacing: ThusoSpacing.space12) {
            Image(systemName: "nosign").font(.callout).foregroundStyle(ThusoTheme.danger)
            Text(item.sentence).font(.caption).foregroundStyle(ThusoTheme.slate)
        }
    }
}
