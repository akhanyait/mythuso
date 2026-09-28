import SwiftUI

/* Thuso SOS — the emergency pathway.

   Every other screen in this app is wrong in ways that cost somebody time or money. This one is
   wrong in ways that cost somebody their life, so the ordering of the page is the first refusal
   and everything else follows it:

     MyThuso is not an ambulance service. `emergencyFirst` is the first thing in `body`, above
     anything MyThuso sells, and no answer to any question moves it. A screen that offered its own
     service first and the ambulance underneath would be asking a frightened person to compare the
     two, and some of them would choose wrong.

     Software does not triage. Three questions, and one tick on the first ends them — no follow-up,
     no severity, no score. Sos.route in Models/Sos.swift does the routing and has no arithmetic in
     it at all.

     A target is not a promise. Sos.targetMinutes is the duration of the `sos` row in the service
     catalogue, generated rather than typed, and it is never rendered as an arrival estimate.
     Arrival estimates come from Geo.swift, which returns `.unavailable` with a reason rather than
     a plausible number.

     Urgency does not relax vetting. Every nurse offered here goes through can(subject,
     "take-visit") — the same call the dispatch board makes — and the rota picker puts a nurse whose
     clearance lapsed on the only shift, so the refusal is visible rather than described.

   Nothing dials. There is no telephony in this file, no location permission is requested, nothing
   is dispatched, and no ambulance partner exists. The numbers are printed so a person can dial them
   from their own phone. */

/// A nurse on the SOS rota. The position is normalised where the fixture is written, so the raw
/// pair is unreachable from here on — the same rule the dispatch board follows.
struct SosOnCall: Identifiable, Hashable {
    let id: String
    let position: NormalisedCoordinate
    init(_ id: String, lat: Double? = nil, lng: Double? = nil) {
        self.id = id
        position = normaliseSouthAfricaLngLat(lat: lat, lng: lng, source: "\(id)’s last reported position")
    }
}

struct SosRota: Identifiable, Hashable {
    let id: String
    let label: String
    let note: String
    let nurses: [SosOnCall]
}

enum SosPreview {
    /* Fictional, and deliberately blunt — three decimal places, about a hundred metres. The suburbs
       are real; nobody lives at these points, and a preview has no business being precise about
       where a frightened person is standing. */
    static let areas: [String: NormalisedCoordinate] = [
        "Randburg": normaliseSouthAfricaLngLat(lat: -26.099, lng: 28.004, source: "The Randburg demo address"),
        "Rosebank": normaliseSouthAfricaLngLat(lat: -26.146, lng: 28.042, source: "The Rosebank demo address"),
        "Parktown": normaliseSouthAfricaLngLat(lat: -26.184, lng: 28.040, source: "The Parktown demo address"),
        "Melville": normaliseSouthAfricaLngLat(lat: -26.175, lng: 27.999, source: "The Melville demo address"),
        "Soweto": normaliseSouthAfricaLngLat(lat: -26.249, lng: 27.908, source: "The Soweto demo address")
    ]
    /* Two rotas, so the vetting refusal is a thing you can see rather than a paragraph. On the usual
       rota one phone is not sharing a position, which is what a phone in a bag looks like. */
    static let rotas: [SosRota] = [
        SosRota(id: "usual", label: "The usual rota",
                note: "Two nurses on call. One phone is not sharing a position, which is what a phone in a bag looks like.",
                nurses: [SosOnCall("N-205", lat: -26.150, lng: 28.046), SosOnCall("N-207")]),
        SosRota(id: "lapsed", label: "Only Sister Ayanda Dube is on tonight",
                note: "Her police clearance lapsed nine days ago. This is the rota that tests whether urgency is allowed to lift a check.",
                nurses: [SosOnCall("N-204", lat: -26.240, lng: 27.916)])
    ]
}

struct SosView: View {
    @ObservedObject private var vetting = VettingStore.shared
    @ObservedObject private var sosPress = SosPressPreview.shared
    @State private var answers = Sos.Answers()
    @State private var none = false
    @State private var rotaId = "usual"
    @State private var openNow = true
    @State private var requested = false
    @State private var stoodDown: String?
    @State private var unanswered = false

    private var rota: SosRota { SosPreview.rotas.first { $0.id == rotaId } ?? SosPreview.rotas[0] }
    private var destination: NormalisedCoordinate? { answers.area.flatMap { SosPreview.areas[$0] } }

    private struct Candidate: Identifiable {
        let subject: VettingSubject
        let decision: VettingDecision
        let estimate: ArrivalEstimate
        var id: String { subject.id }
    }
    /* Vetting is asked before a name is offered, not after. A nurse whose clearance lapsed still
       appears — hiding her would leave a reader wondering where she went — and cannot be sent. */
    private var candidates: [Candidate] {
        rota.nurses.compactMap { onCall in
            guard let subject = vetting.subject(onCall.id) else { return nil }
            return Candidate(subject: subject, decision: can(subject, "take-visit"),
                             estimate: estimate(for: onCall))
        }.sorted { left, right in
            if left.decision.allowed != right.decision.allowed { return left.decision.allowed }
            switch (left.estimate.minutes, right.estimate.minutes) {
            case let (first?, second?): return first < second
            case (_?, nil): return true
            default: return false
            }
        }
    }
    /* An arrival time this screen cannot work out says so. There is no branch here that reaches a
       number without a position at both ends, and the target is never used as a stand-in. */
    private func estimate(for nurse: SosOnCall) -> ArrivalEstimate {
        guard let destination, destination.valid else {
            return .noEstimate("No address has been chosen yet, so there is nothing to measure to.")
        }
        guard nurse.position.valid else {
            return .noEstimate("This nurse’s phone is not sharing a position, so there is nothing to measure from.")
        }
        return straightLineArrival(from: nurse.position, to: destination)
    }
    private var cleared: Bool { candidates.contains { $0.decision.allowed } }
    private var answered: Bool { none || !answers.flagged.isEmpty }
    private var door: Sos.Door? { answered ? Sos.route(answers, openNow: openNow, cleared: cleared) : nil }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
                /* The order below is the feature. Emergency services are first, unconditionally,
                   and everything MyThuso sells is underneath them. */
                Group {
                    DemoBadge()
                    CareHeading(eyebrow: "Thuso SOS", title: "Urgent care",
                                subtitle: "Nothing on this screen dials anybody.")
                    emergencyFirst
                    /* Under it and never over it. On this one pathway the ambulance number outranks
                       anything MyThuso has to say about itself — including the sentence saying the
                       acknowledgement behind this screen is simulated. The web has always rendered it
                       here; this app said nothing at all, which is the silence the contract's
                       `a-simulation-says-so` rule is written against. */
                    CapabilityNotice(of: "emergency")
                    Text(Sos.emergency.whyFirst).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                }
                Group {
                    Text("If it is not that, three questions").font(.thuso(.body, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                    Text(Sos.routing.noAlgorithm).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                    redFlagQuestion
                    if !answers.flagged.isEmpty { emergencyOutcome }
                    if none {
                        reachQuestions
                        rotaPicker
                        hoursPicker
                    }
                }
                Group {
                    if case let .refused(failureId)? = door { refusedOutcome(failureId) }
                    if door == .urgentVisit {
                        offer
                        targetCard
                        whoCouldCome
                    }
                    if requested { standDownCard }
                    /* Pressing SOS comes after the numbers and the door the answers pointed to, never before either. */
                    if let door { pressCard(door) }
                }
                Group {
                    failuresSection
                    coverageSection
                    alertSection
                }
                Group {
                    recordSection
                    rulesSection
                    refusalsSection
                }
            }
            .padding(ThusoSpacing.space16)
        }
        .thusoGround()
        .navigationTitle("Thuso SOS").navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Emergency services, first and unconditional

    private var emergencyFirst: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            HStack(alignment: .top, spacing: ThusoSpacing.space12) {
                Image(systemName: "cross.case.fill").font(.thuso(.title2)).foregroundStyle(ThusoRole.dangerInk)
                VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
                    Text(Sos.emergency.headline).font(.thuso(.title3, weight: .bold)).foregroundStyle(ThusoRole.dangerInk)
                    Text(Sos.emergency.lead).font(.thuso(.footnote)).foregroundStyle(ThusoRole.foreground)
                }
            }
            ForEach(Sos.emergency.numbers) { number in
                HStack(alignment: .top, spacing: ThusoSpacing.space12) {
                    Text(number.number).font(.thuso(.title3, weight: .bold)).monospacedDigit()
                        .foregroundStyle(ThusoRole.dangerInk)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(number.name).font(.thuso(.footnote, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                        Text(number.detail).font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
                        Text(number.whenToUse).font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
                    }
                }
                .padding(ThusoSpacing.space12).frame(maxWidth: .infinity, alignment: .leading)
                .background(.white, in: RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous))
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(number.name). \(number.number). \(number.whenToUse)")
            }
            Text(Sos.emergency.notAnAmbulance).font(.thuso(.caption)).foregroundStyle(ThusoRole.foreground)
            Text(Sos.emergency.previewNote).font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
        }
        .padding(ThusoSpacing.space16).frame(maxWidth: .infinity, alignment: .leading)
        .background(ThusoRole.dangerTint, in: RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous).stroke(ThusoRole.dangerInk, lineWidth: 2))
    }

    // MARK: - The three questions

    private var redFlagQuestion: some View {
        CareCard {
            Text(Sos.redFlags.prompt).font(.thuso(.callout, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
            Text(Sos.redFlags.help).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
            ForEach(Sos.redFlags.conditions) { condition in
                Button {
                    none = false; requested = false; stoodDown = nil; unanswered = false
                    if answers.flagged.contains(condition.id) { answers.flagged.remove(condition.id) }
                    else { answers.flagged.insert(condition.id) }
                } label: {
                    HStack(alignment: .top, spacing: ThusoSpacing.space12) {
                        Image(systemName: answers.flagged.contains(condition.id) ? "checkmark.square.fill" : "square")
                            .font(.thuso(.body)).foregroundStyle(answers.flagged.contains(condition.id) ? ThusoRole.dangerInk : ThusoRole.inputEdge)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(condition.name).font(.thuso(.footnote, weight: .medium)).foregroundStyle(ThusoRole.foreground)
                            Text(condition.detail).font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
                        }
                        Spacer(minLength: 0)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            Button {
                requested = false; stoodDown = nil; unanswered = false
                none.toggle(); answers.flagged = []
            } label: {
                HStack(spacing: ThusoSpacing.space12) {
                    Image(systemName: none ? "checkmark.square.fill" : "square")
                        .font(.thuso(.body)).foregroundStyle(none ? ThusoRole.foreground : ThusoRole.inputEdge)
                    Text(Sos.redFlags.noneLabel).font(.thuso(.footnote, weight: .medium)).foregroundStyle(ThusoRole.foreground)
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Text(Sos.routing.isNotTriage).font(.thuso(.caption)).foregroundStyle(ThusoRole.foreground)
        }
    }

    private var emergencyOutcome: some View {
        let outcome = Sos.outcome("emergency-services")
        return VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            Text(outcome.headline).font(.thuso(.body, weight: .bold)).foregroundStyle(ThusoRole.dangerInk)
            Text(outcome.detail).font(.thuso(.footnote)).foregroundStyle(ThusoRole.foreground)
            ForEach(Array(answers.flagged).sorted(), id: \.self) { id in
                if let condition = Sos.condition(id) {
                    Text("• \(condition.name)").font(.thuso(.caption, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                }
            }
            Text(Sos.redFlags.endsTheQuestions).font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
            HStack(spacing: ThusoSpacing.space12) {
                Text(Sos.emergency.numbers[0].number).font(.thuso(.title2, weight: .bold)).monospacedDigit()
                    .foregroundStyle(ThusoRole.dangerInk)
                Text("Ambulance · or \(Sos.emergency.numbers[1].number) from a mobile")
                    .font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
            }
            .padding(ThusoSpacing.space16).frame(maxWidth: .infinity, alignment: .leading)
            .background(.white, in: RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous))
            Text(Sos.emergency.previewNote).font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
        }
        .padding(ThusoSpacing.space16).frame(maxWidth: .infinity, alignment: .leading)
        .background(ThusoRole.dangerTint, in: RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous))
    }

    private var reachQuestions: some View {
        CareCard {
            Picker(Sos.routing.questions[1].prompt, selection: Binding(
                get: { answers.area ?? "" },
                set: { answers.area = $0.isEmpty ? nil : $0; requested = false })) {
                Text("Choose an area").tag("")
                ForEach(Sos.coverage.areas, id: \.self) { Text($0).tag($0) }
                Text("Somewhere else in South Africa").tag("Somewhere else in South Africa")
            }
            Text(Sos.routing.questions[1].help).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
            Picker(Sos.routing.questions[2].prompt, selection: Binding(
                get: { answers.canAnswerAPhone ?? true },
                set: { answers.canAnswerAPhone = $0; requested = false })) {
                Text("Yes").tag(true)
                Text("No").tag(false)
            }
            .pickerStyle(.segmented)
            Text(Sos.routing.questions[2].help).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
        }
    }

    private var rotaPicker: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            Picker("Preview the rota", selection: $rotaId) {
                ForEach(SosPreview.rotas) { Text($0.label).tag($0.id) }
            }
            Text(rota.note).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
        }
    }

    private var hoursPicker: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            Picker("Preview the time of day", selection: $openNow) {
                Text("Now · inside the hours").tag(true)
                Text("02:10 · outside the hours").tag(false)
            }
            .pickerStyle(.segmented)
            Text("Thuso SOS runs \(Sos.coverage.hours.days.lowercased()) from \(Sos.coverage.hours.opensAt) to \(Sos.coverage.hours.closesAt). \(Sos.coverage.hours.note)")
                .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
        }
    }

    // MARK: - The doors

    private func refusedOutcome(_ failureId: String) -> some View {
        let outcome = Sos.outcome("cannot-help")
        let failure = Sos.failure(failureId)
        return VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            Text(outcome.headline).font(.thuso(.callout, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
            Text(outcome.detail).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
            Text(failure.name).font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
            Text(failure.what).font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
            Text(failure.instead).font(.thuso(.caption)).foregroundStyle(ThusoRole.foreground)
            if failureId == "vetting" {
                ForEach(candidates.filter { !$0.decision.allowed }) { candidate in
                    Text("\(candidate.subject.name): \(candidate.decision.reason ?? "")")
                        .font(.thuso(.caption)).foregroundStyle(ThusoRole.dangerInk)
                }
            }
            HStack(spacing: ThusoSpacing.space12) {
                Text(Sos.emergency.numbers[0].number).font(.thuso(.title3, weight: .bold)).monospacedDigit()
                    .foregroundStyle(ThusoRole.dangerInk)
                Text("Ambulance · or \(Sos.emergency.numbers[1].number) from a mobile")
                    .font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
            }
        }
        .padding(ThusoSpacing.space16).frame(maxWidth: .infinity, alignment: .leading)
        .background(ThusoRole.warningTint, in: RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous))
    }

    private var offer: some View {
        let outcome = Sos.outcome("urgent-visit")
        return CareCard {
            Text(outcome.headline).font(.thuso(.callout, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
            Text(outcome.detail).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
            row("Thuso SOS urgent visit", "R \(Sos.visitPrice)")
            row("Of that, to the nurse", "R \(Sos.visitNurseShare)")
            row("Where", answers.area ?? "—")
        }
    }

    private var targetCard: some View {
        CareCard {
            HStack {
                Text(Sos.target.title).font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                Spacer(minLength: 8)
                StatusPill(text: Sos.targetLabel, tone: "amber")
            }
            Text(Sos.target.statement).font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
            Text(Sos.target.whenItCannotBeMet).font(.thuso(.caption)).foregroundStyle(ThusoRole.foreground)
            Text(Sos.target.estimateIsNotTheTarget).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
        }
    }

    private var whoCouldCome: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            Text("Who could come").font(.thuso(.body, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
            CareCard {
                ForEach(candidates) { candidate in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(candidate.subject.name).font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                            Spacer(minLength: 8)
                            StatusPill(text: candidate.decision.allowed ? "Cleared" : "Refused",
                                       tone: candidate.decision.allowed ? "teal" : "danger")
                        }
                        Text("\(candidate.subject.zone ?? "—") · \(candidate.subject.reference) · \(candidate.estimate.label)")
                            .font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
                        Text(candidate.estimate.spoken).font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
                        if !candidate.decision.allowed {
                            Text(candidate.decision.reason ?? "").font(.thuso(.caption)).foregroundStyle(ThusoRole.dangerInk)
                        } else {
                            Button(requested ? "Asked" : "Ask her to come") { requested = true }
                                .buttonStyle(QuietButton()).disabled(requested)
                        }
                    }
                    .padding(.vertical, 5)
                }
                Text(Sos.target.arrivalUnknown).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                Text(Sos.rule("urgency-does-not-relax-vetting").sentence)
                    .font(.thuso(.caption)).foregroundStyle(ThusoRole.foreground)
            }
        }
    }

    // MARK: - Standing down

    private var standDownCard: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            Text(Sos.standDown.title).font(.thuso(.body, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
            CareCard {
                Text(Sos.standDown.statement).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                Text(Sos.standDown.chargeRule).font(.thuso(.footnote)).foregroundStyle(ThusoRole.foreground)
                if let stoodDown, let reason = Sos.standDown.reasons.first(where: { $0.id == stoodDown }) {
                    Text("Stood down · \(reason.label)").font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                    Text(Sos.standDown.nurseNote).font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
                    row("What the nurse is told", reason.nurseIsTold)
                    row("What is recorded", reason.recorded)
                    Button("Back") { self.stoodDown = nil }.buttonStyle(QuietButton())
                } else {
                    ForEach(Sos.standDown.reasons) { reason in
                        Button(reason.label) { stoodDown = reason.id }.buttonStyle(QuietButton())
                    }
                    Toggle("Preview: nobody answers the callback", isOn: $unanswered)
                        .font(.thuso(.caption)).tint(ThusoRole.foreground)
                    if unanswered {
                        Text(Sos.standDown.noAnswerRule).font(.thuso(.caption)).foregroundStyle(ThusoRole.foreground)
                            .padding(ThusoSpacing.space12).frame(maxWidth: .infinity, alignment: .leading)
                            .background(ThusoRole.warningTint, in: RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous))
                    }
                }
            }
        }
    }

    // MARK: - Failures, coverage, Alert, the record and the promises

    private var failuresSection: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            Text("When this does not work").font(.thuso(.body, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
            Text("Four ways a button like this fails and one way vetting stops it. Each says what to do instead, because a failure screen without one is a dead end wearing an apology.")
                .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
            ForEach(Sos.failures) { failure in
                CareCard {
                    Text(failure.name).font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                    Text(failure.what).font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
                    Text(failure.instead).font(.thuso(.caption)).foregroundStyle(ThusoRole.foreground)
                }
            }
        }
    }

    private var coverageSection: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            Text("Where and when").font(.thuso(.body, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
            CareCard {
                Text(Sos.coverage.statement).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                Text(Sos.coverage.areas.joined(separator: " · ")).font(.thuso(.footnote, weight: .medium)).foregroundStyle(ThusoRole.foreground)
                row("Hours", "\(Sos.coverage.hours.days), \(Sos.coverage.hours.opensAt)–\(Sos.coverage.hours.closesAt)")
                Text(Sos.coverage.hours.note).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                Text(Sos.coverage.honestNote).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
            }
        }
    }

    private var alertSection: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            Text("\(Sos.alert.name) · the panic button").font(.thuso(.body, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
            CareCard {
                Text("\(Sos.alert.name) · R \(Sos.alertMonthly) a month")
                    .font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                Text(Sos.alert.what).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                Text(Sos.alert.phaseNote).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                ForEach(Sos.alert.honesty) { note in
                    Text(note.sentence).font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
                }
                Text(Sos.alert.notCover).font(.thuso(.caption)).foregroundStyle(ThusoRole.foreground)
            }
        }
    }

    private var recordSection: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            Text(Sos.record.title).font(.thuso(.body, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
            CareCard {
                Text(Sos.record.statement).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                ForEach(Sos.record.kept, id: \.self) { item in
                    Label(item, systemImage: "checkmark.seal").font(.thuso(.caption)).foregroundStyle(ThusoRole.foreground)
                }
                ForEach(Sos.record.notKept, id: \.self) { item in
                    Label(item, systemImage: "nosign").font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
                }
            }
        }
    }

    private var rulesSection: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            Text("The promises this screen makes").font(.thuso(.body, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
            ForEach(Sos.rules) { rule in
                CareCard {
                    Text(rule.title).font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                    Text(rule.sentence).font(.thuso(.caption)).foregroundStyle(ThusoRole.mutedForeground)
                }
            }
        }
    }

    private var refusalsSection: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            Text("What this screen will not do").font(.thuso(.body, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
            ForEach(Sos.refusals) { refusal in
                CareCard {
                    HStack(alignment: .top, spacing: ThusoSpacing.space12) {
                        Image(systemName: "nosign").font(.thuso(.callout)).foregroundStyle(ThusoRole.dangerInk)
                        Text(refusal.sentence).font(.thuso(.caption)).foregroundStyle(ThusoRole.foreground)
                    }
                }
            }
            Text("Nothing here is transmitted, dispatched or dialled. No ambulance partner is contracted, no nurse is paged, no location is read from this device and Thuso Alert does not exist.")
                .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
        }
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack(alignment: .top) {
            Text(label).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
            Spacer(minLength: 10)
            Text(value).font(.thuso(.footnote, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                .multilineTextAlignment(.trailing)
        }
    }
}

// MARK: - Pressing SOS, under the numbers and the door

extension SosView {
    /* What the press did and did not do, in the contract's words: no ambulance partner is connected and nobody is on
       the way because of it, a next of kin is never shown as told, and standing down takes one of the reasons. */
    func pressCard(_ door: Sos.Door) -> some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            if let press = sosPress.press {
                Text(Sos.PressText.heading).font(.thuso(.body, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                Text(FieldSafety.fill(Sos.PressText.recorded, ["at": press.raisedAt.formatted(date: .omitted, time: .shortened)]) + " " + routedSentence(press.routedTo))
                    .font(.thuso(.footnote)).foregroundStyle(ThusoRole.foreground)
                Label(Sos.PressText.partnerNotConnected, systemImage: "nosign")
                    .font(.thuso(.footnote, weight: .semibold)).foregroundStyle(ThusoRole.dangerInk)
                if press.stoodDownAt == nil {
                    Text(press.areaSharedUntil.map { FieldSafety.fill(Sos.PressText.areaShared, ["ends": $0.formatted(date: .omitted, time: .shortened)]) } ?? Sos.PressText.areaNotShared)
                        .thusoFont(ThusoType.caption).foregroundStyle(ThusoRole.mutedForeground)
                }
                Text(Sos.PressText.nextOfKinHeading).font(.thuso(.footnote, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                if press.attempts.isEmpty {
                    Text(Sos.PressText.noNextOfKin).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                }
                ForEach(press.attempts) { attempt in
                    Text("\(attempt.name) · \(sentence(Sos.nextOfKinStatuses, attempt.statusCode)). \(sentence(Sos.nextOfKinNotSent, attempt.reasonCode))")
                        .font(.thuso(.footnote)).foregroundStyle(ThusoRole.foreground)
                }
                if let at = press.stoodDownAt, let reason = Sos.standDown.reasons.first(where: { $0.id == press.stoodDownReason }) {
                    Text(FieldSafety.fill(Sos.PressText.stoodDown, ["at": at.formatted(date: .omitted, time: .shortened), "reason": reason.label]))
                        .font(.thuso(.footnote, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                } else {
                    Text(Sos.PressText.standDown).thusoFont(ThusoType.caption).foregroundStyle(ThusoRole.mutedForeground)
                    ForEach(Sos.standDown.reasons) { reason in
                        Button(reason.label) { sosPress.standDown(reason.id) }.buttonStyle(.bordered)
                    }
                }
                Text(Sos.PressText.priority).thusoFont(ThusoType.caption).foregroundStyle(ThusoRole.mutedForeground)
            } else {
                Button { sosPress.press(door, areaChosen: answers.area.map { Sos.coverage.areas.contains($0) } ?? false) } label: {
                    Label(Sos.PressText.press, systemImage: "light.beacon.max.fill").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent).tint(ThusoRole.dangerInk)
                Text(Sos.PressText.pressHelp).thusoFont(ThusoType.caption).foregroundStyle(ThusoRole.mutedForeground)
            }
        }
        .padding(ThusoSpacing.space16).frame(maxWidth: .infinity, alignment: .leading)
        .background(.white, in: RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous))
    }

    private func routedSentence(_ id: String) -> String {
        switch id {
        case "emergency-services": return Sos.PressText.routedEmergencyServices
        case "urgent-visit": return Sos.PressText.routedUrgentVisit
        default: return Sos.PressText.routedCannotHelp
        }
    }

    private func sentence(_ list: [SosRefusal], _ id: String) -> String { list.first { $0.id == id }?.sentence ?? id }
}

/* Next of kin, in the patient's privacy settings: nominated with consent to the wording shown, never by a guardian, and
   withdrawn in one action. Every sentence and refusal is SosData.swift's, and the tries and the window are the defaults
   FieldSafetyData.swift carries. Nothing is sent, and the name stays in this phone's memory. */
struct NextOfKinView: View {
    @ObservedObject private var sosPress = SosPressPreview.shared
    @State private var name = ""
    @State private var consented = false
    @State private var refused: String?

    private var named: Bool { !name.trimmingCharacters(in: .whitespaces).isEmpty }

    var body: some View {
        Form {
            Section {
                Text(Sos.NextOfKinText.intro).font(.thuso(.footnote))
                CapabilityNotice(of: "messaging")
            }
            Section {
                TextField(Sos.NextOfKinText.name, text: $name)
                Text(Sos.NextOfKinText.nameHelp).thusoFont(ThusoType.caption).foregroundStyle(.secondary)
                Text(Sos.NextOfKinText.consentWording).font(.thuso(.footnote))
                Toggle(Sos.NextOfKinText.consentTick, isOn: $consented)
                Text(FieldSafety.fill(Sos.NextOfKinText.tries, ["retries": String(FieldSafety.nextOfKinAlertRetries), "minutes": String(FieldSafety.nextOfKinAlertWindowMinutes)]))
                    .thusoFont(ThusoType.caption).foregroundStyle(.secondary)
                Button(Sos.NextOfKinText.nominate) { act(asGuardian: false) }.disabled(!named)
                Button(Sos.NextOfKinText.asGuardian) { act(asGuardian: true) }.disabled(!named)
                if let refused { Text(refused).font(.thuso(.footnote, weight: .semibold)).foregroundStyle(ThusoRole.dangerInk) }
            }
            if !sosPress.nominations.isEmpty {
                Section {
                    ForEach(sosPress.nominations) { nomination in
                        VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
                            Text(nomination.name).font(.thuso(.body, weight: .semibold))
                            if let withdrawn = nomination.withdrawnAt {
                                Text(FieldSafety.fill(Sos.NextOfKinText.withdrawn, ["at": withdrawn.formatted(date: .omitted, time: .shortened)])).thusoFont(ThusoType.caption)
                            } else {
                                Text(FieldSafety.fill(Sos.NextOfKinText.nominated, ["at": nomination.nominatedAt.formatted(date: .omitted, time: .shortened), "expires": nomination.expiresAt.formatted(date: .long, time: .omitted)])).thusoFont(ThusoType.caption)
                                Button(Sos.NextOfKinText.withdraw) { sosPress.withdraw(nomination.id) }.buttonStyle(.bordered)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle(Sos.NextOfKinText.heading)
    }

    private func act(asGuardian: Bool) {
        refused = sosPress.nominate(name: name.trimmingCharacters(in: .whitespaces), consentGiven: consented, asGuardian: asGuardian)
        if refused == nil { name = ""; consented = false }
    }
}
