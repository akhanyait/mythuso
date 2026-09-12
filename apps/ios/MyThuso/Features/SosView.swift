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
                    Text(Sos.emergency.whyFirst).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                }
                Group {
                    Text("If it is not that, three questions").font(.body.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                    Text(Sos.routing.noAlgorithm).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
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
                Image(systemName: "cross.case.fill").font(.title2).foregroundStyle(ThusoTheme.danger)
                VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
                    Text(Sos.emergency.headline).font(.title3.weight(.bold)).foregroundStyle(ThusoTheme.danger)
                    Text(Sos.emergency.lead).font(.footnote).foregroundStyle(ThusoTheme.charcoal)
                }
            }
            ForEach(Sos.emergency.numbers) { number in
                HStack(alignment: .top, spacing: ThusoSpacing.space12) {
                    Text(number.number).font(.title3.weight(.bold)).monospacedDigit()
                        .foregroundStyle(ThusoTheme.danger)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(number.name).font(.footnote.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                        Text(number.detail).font(.caption).foregroundStyle(ThusoTheme.studioInkMuted)
                        Text(number.whenToUse).font(.caption).foregroundStyle(ThusoTheme.studioInkMuted)
                    }
                }
                .padding(ThusoSpacing.space12).frame(maxWidth: .infinity, alignment: .leading)
                .background(.white, in: RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous))
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(number.name). \(number.number). \(number.whenToUse)")
            }
            Text(Sos.emergency.notAnAmbulance).font(.caption).foregroundStyle(ThusoTheme.charcoal)
            Text(Sos.emergency.previewNote).font(.caption).foregroundStyle(ThusoTheme.studioInkMuted)
        }
        .padding(ThusoSpacing.space16).frame(maxWidth: .infinity, alignment: .leading)
        .background(ThusoTheme.dangerSoft, in: RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous).stroke(ThusoTheme.danger, lineWidth: 2))
    }

    // MARK: - The three questions

    private var redFlagQuestion: some View {
        CareCard {
            Text(Sos.redFlags.prompt).font(.callout.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            Text(Sos.redFlags.help).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
            ForEach(Sos.redFlags.conditions) { condition in
                Button {
                    none = false; requested = false; stoodDown = nil; unanswered = false
                    if answers.flagged.contains(condition.id) { answers.flagged.remove(condition.id) }
                    else { answers.flagged.insert(condition.id) }
                } label: {
                    HStack(alignment: .top, spacing: ThusoSpacing.space12) {
                        Image(systemName: answers.flagged.contains(condition.id) ? "checkmark.square.fill" : "square")
                            .font(.body).foregroundStyle(answers.flagged.contains(condition.id) ? ThusoTheme.danger : ThusoTheme.controlEdge)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(condition.name).font(.footnote.weight(.medium)).foregroundStyle(ThusoTheme.charcoal)
                            Text(condition.detail).font(.caption).foregroundStyle(ThusoTheme.studioInkMuted)
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
                        .font(.body).foregroundStyle(none ? ThusoTheme.charcoal : ThusoTheme.controlEdge)
                    Text(Sos.redFlags.noneLabel).font(.footnote.weight(.medium)).foregroundStyle(ThusoTheme.charcoal)
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Text(Sos.routing.isNotTriage).font(.caption).foregroundStyle(ThusoTheme.charcoal)
        }
    }

    private var emergencyOutcome: some View {
        let outcome = Sos.outcome("emergency-services")
        return VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            Text(outcome.headline).font(.body.weight(.bold)).foregroundStyle(ThusoTheme.danger)
            Text(outcome.detail).font(.footnote).foregroundStyle(ThusoTheme.charcoal)
            ForEach(Array(answers.flagged).sorted(), id: \.self) { id in
                if let condition = Sos.condition(id) {
                    Text("• \(condition.name)").font(.caption.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                }
            }
            Text(Sos.redFlags.endsTheQuestions).font(.caption).foregroundStyle(ThusoTheme.studioInkMuted)
            HStack(spacing: ThusoSpacing.space12) {
                Text(Sos.emergency.numbers[0].number).font(.title2.weight(.bold)).monospacedDigit()
                    .foregroundStyle(ThusoTheme.danger)
                Text("Ambulance · or \(Sos.emergency.numbers[1].number) from a mobile")
                    .font(.caption).foregroundStyle(ThusoTheme.studioInkMuted)
            }
            .padding(ThusoSpacing.space16).frame(maxWidth: .infinity, alignment: .leading)
            .background(.white, in: RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous))
            Text(Sos.emergency.previewNote).font(.caption).foregroundStyle(ThusoTheme.studioInkMuted)
        }
        .padding(ThusoSpacing.space16).frame(maxWidth: .infinity, alignment: .leading)
        .background(ThusoTheme.dangerSoft, in: RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous))
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
            Text(Sos.routing.questions[1].help).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
            Picker(Sos.routing.questions[2].prompt, selection: Binding(
                get: { answers.canAnswerAPhone ?? true },
                set: { answers.canAnswerAPhone = $0; requested = false })) {
                Text("Yes").tag(true)
                Text("No").tag(false)
            }
            .pickerStyle(.segmented)
            Text(Sos.routing.questions[2].help).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
        }
    }

    private var rotaPicker: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            Picker("Preview the rota", selection: $rotaId) {
                ForEach(SosPreview.rotas) { Text($0.label).tag($0.id) }
            }
            Text(rota.note).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
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
                .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
        }
    }

    // MARK: - The doors

    private func refusedOutcome(_ failureId: String) -> some View {
        let outcome = Sos.outcome("cannot-help")
        let failure = Sos.failure(failureId)
        return VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            Text(outcome.headline).font(.callout.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            Text(outcome.detail).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
            Text(failure.name).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            Text(failure.what).font(.caption).foregroundStyle(ThusoTheme.studioInkMuted)
            Text(failure.instead).font(.caption).foregroundStyle(ThusoTheme.charcoal)
            if failureId == "vetting" {
                ForEach(candidates.filter { !$0.decision.allowed }) { candidate in
                    Text("\(candidate.subject.name): \(candidate.decision.reason ?? "")")
                        .font(.caption).foregroundStyle(ThusoTheme.danger)
                }
            }
            HStack(spacing: ThusoSpacing.space12) {
                Text(Sos.emergency.numbers[0].number).font(.title3.weight(.bold)).monospacedDigit()
                    .foregroundStyle(ThusoTheme.danger)
                Text("Ambulance · or \(Sos.emergency.numbers[1].number) from a mobile")
                    .font(.caption).foregroundStyle(ThusoTheme.studioInkMuted)
            }
        }
        .padding(ThusoSpacing.space16).frame(maxWidth: .infinity, alignment: .leading)
        .background(ThusoTheme.mangoSoft, in: RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous))
    }

    private var offer: some View {
        let outcome = Sos.outcome("urgent-visit")
        return CareCard {
            Text(outcome.headline).font(.callout.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            Text(outcome.detail).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
            row("Thuso SOS urgent visit", "R \(Sos.visitPrice)")
            row("Of that, to the nurse", "R \(Sos.visitNurseShare)")
            row("Where", answers.area ?? "—")
        }
    }

    private var targetCard: some View {
        CareCard {
            HStack {
                Text(Sos.target.title).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                Spacer(minLength: 8)
                StatusPill(text: Sos.targetLabel, tone: "amber")
            }
            Text(Sos.target.statement).font(.caption).foregroundStyle(ThusoTheme.studioInkMuted)
            Text(Sos.target.whenItCannotBeMet).font(.caption).foregroundStyle(ThusoTheme.charcoal)
            Text(Sos.target.estimateIsNotTheTarget).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
        }
    }

    private var whoCouldCome: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            Text("Who could come").font(.body.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            CareCard {
                ForEach(candidates) { candidate in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(candidate.subject.name).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                            Spacer(minLength: 8)
                            StatusPill(text: candidate.decision.allowed ? "Cleared" : "Refused",
                                       tone: candidate.decision.allowed ? "teal" : "danger")
                        }
                        Text("\(candidate.subject.zone ?? "—") · \(candidate.subject.reference) · \(candidate.estimate.label)")
                            .font(.caption).foregroundStyle(ThusoTheme.studioInkMuted)
                        Text(candidate.estimate.spoken).font(.caption).foregroundStyle(ThusoTheme.studioInkMuted)
                        if !candidate.decision.allowed {
                            Text(candidate.decision.reason ?? "").font(.caption).foregroundStyle(ThusoTheme.danger)
                        } else {
                            Button(requested ? "Asked" : "Ask her to come") { requested = true }
                                .buttonStyle(QuietButton()).disabled(requested)
                        }
                    }
                    .padding(.vertical, 5)
                }
                Text(Sos.target.arrivalUnknown).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                Text(Sos.rule("urgency-does-not-relax-vetting").sentence)
                    .font(.caption).foregroundStyle(ThusoTheme.charcoal)
            }
        }
    }

    // MARK: - Standing down

    private var standDownCard: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            Text(Sos.standDown.title).font(.body.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            CareCard {
                Text(Sos.standDown.statement).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                Text(Sos.standDown.chargeRule).font(.footnote).foregroundStyle(ThusoTheme.charcoal)
                if let stoodDown, let reason = Sos.standDown.reasons.first(where: { $0.id == stoodDown }) {
                    Text("Stood down · \(reason.label)").font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                    Text(Sos.standDown.nurseNote).font(.caption).foregroundStyle(ThusoTheme.studioInkMuted)
                    row("What the nurse is told", reason.nurseIsTold)
                    row("What is recorded", reason.recorded)
                    Button("Back") { self.stoodDown = nil }.buttonStyle(QuietButton())
                } else {
                    ForEach(Sos.standDown.reasons) { reason in
                        Button(reason.label) { stoodDown = reason.id }.buttonStyle(QuietButton())
                    }
                    Toggle("Preview: nobody answers the callback", isOn: $unanswered)
                        .font(.caption).tint(ThusoTheme.charcoal)
                    if unanswered {
                        Text(Sos.standDown.noAnswerRule).font(.caption).foregroundStyle(ThusoTheme.charcoal)
                            .padding(ThusoSpacing.space12).frame(maxWidth: .infinity, alignment: .leading)
                            .background(ThusoTheme.mangoSoft, in: RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous))
                    }
                }
            }
        }
    }

    // MARK: - Failures, coverage, Alert, the record and the promises

    private var failuresSection: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            Text("When this does not work").font(.body.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            Text("Four ways a button like this fails and one way vetting stops it. Each says what to do instead, because a failure screen without one is a dead end wearing an apology.")
                .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
            ForEach(Sos.failures) { failure in
                CareCard {
                    Text(failure.name).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                    Text(failure.what).font(.caption).foregroundStyle(ThusoTheme.studioInkMuted)
                    Text(failure.instead).font(.caption).foregroundStyle(ThusoTheme.charcoal)
                }
            }
        }
    }

    private var coverageSection: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            Text("Where and when").font(.body.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            CareCard {
                Text(Sos.coverage.statement).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                Text(Sos.coverage.areas.joined(separator: " · ")).font(.footnote.weight(.medium)).foregroundStyle(ThusoTheme.charcoal)
                row("Hours", "\(Sos.coverage.hours.days), \(Sos.coverage.hours.opensAt)–\(Sos.coverage.hours.closesAt)")
                Text(Sos.coverage.hours.note).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                Text(Sos.coverage.honestNote).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
            }
        }
    }

    private var alertSection: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            Text("\(Sos.alert.name) · the panic button").font(.body.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            CareCard {
                Text("\(Sos.alert.name) · R \(Sos.alertMonthly) a month")
                    .font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                Text(Sos.alert.what).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                Text(Sos.alert.phaseNote).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                ForEach(Sos.alert.honesty) { note in
                    Text(note.sentence).font(.caption).foregroundStyle(ThusoTheme.studioInkMuted)
                }
                Text(Sos.alert.notCover).font(.caption).foregroundStyle(ThusoTheme.charcoal)
            }
        }
    }

    private var recordSection: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            Text(Sos.record.title).font(.body.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            CareCard {
                Text(Sos.record.statement).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                ForEach(Sos.record.kept, id: \.self) { item in
                    Label(item, systemImage: "checkmark.seal").font(.caption).foregroundStyle(ThusoTheme.charcoal)
                }
                ForEach(Sos.record.notKept, id: \.self) { item in
                    Label(item, systemImage: "nosign").font(.caption).foregroundStyle(ThusoTheme.studioInkMuted)
                }
            }
        }
    }

    private var rulesSection: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            Text("The promises this screen makes").font(.body.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            ForEach(Sos.rules) { rule in
                CareCard {
                    Text(rule.title).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                    Text(rule.sentence).font(.caption).foregroundStyle(ThusoTheme.studioInkMuted)
                }
            }
        }
    }

    private var refusalsSection: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            Text("What this screen will not do").font(.body.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            ForEach(Sos.refusals) { refusal in
                CareCard {
                    HStack(alignment: .top, spacing: ThusoSpacing.space12) {
                        Image(systemName: "nosign").font(.callout).foregroundStyle(ThusoTheme.danger)
                        Text(refusal.sentence).font(.caption).foregroundStyle(ThusoTheme.charcoal)
                    }
                }
            }
            Text("Nothing here is transmitted, dispatched or dialled. No ambulance partner is contracted, no nurse is paged, no location is read from this device and Thuso Alert does not exist.")
                .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
        }
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack(alignment: .top) {
            Text(label).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
            Spacer(minLength: 10)
            Text(value).font(.footnote.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                .multilineTextAlignment(.trailing)
        }
    }
}
