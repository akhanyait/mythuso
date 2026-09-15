import SwiftUI

/* A visit offered to a nurse, and the visit itself, on iOS.
 *
 * TWO PLACES, BECAUSE THEY ARE TWO DECISIONS. The offer sits on her schedule, because whether to take
 * another visit is a decision about the day and is read beside the visits already in it. The visit
 * opens as its own screen once she has taken it, because from the door onwards it is the only thing
 * she is doing.
 *
 * WHAT THE OFFER WITHHOLDS. The suburb. An offer goes to a nurse who may decline it, and
 * appointment.offered carries no patient location for exactly that reason; the card says how far, as
 * the straight line between suburb centres it is, and when, and the place arrives with acceptance.
 *
 * WHAT THE VISIT REFUSES, ON THE SCREEN. The code at both ends, a checklist under a draft protocol, a
 * handover before the encounter is signed, and the patient's view of where the nurse is once the visit
 * is done — each in the contract's own words, from CareData, beside the control that was refused.
 *
 * Nothing moves. The minutes left on an offer are re-read every fifteen seconds and simply redrawn. */

/// The offer, on the nurse's schedule. Off duty, no new offer is shown; a visit she has already taken still is.
struct CareOfferCard: View {
    let available: Bool
    @ObservedObject private var store = CareVisitStore.shared
    @ObservedObject private var queue = VisitQueueStore.shared
    private let ticker = Timer.publish(every: 15, on: .main, in: .common).autoconnect()

    private var serviceName: String { store.service?.name ?? "" }

    var body: some View {
        content.onReceive(ticker) { store.tick($0) }
    }

    @ViewBuilder private var content: some View {
        if store.completed {
            SurfacePanel(tone: .quiet) {
                careEyebrow("Visit \(CareData.Preview.appointmentRef) · complete")
                careTitle("\(serviceName), \(store.visitZone?.name ?? "")")
                careNote(CareData.billable)
            }
        } else if store.accepted {
            NavigationLink { CareVisitView() } label: {
                NavPillLabel(title: "Continue this visit",
                             subtitle: "\(serviceName), \(store.visitZone?.name ?? "") · today at \(CareVisitStore.clock(store.scheduledFor))",
                             symbol: "figure.walk")
            }
            .buttonStyle(.plain)
        } else if available, let offer = store.offer, offer.state == .open {
            offerPanel(offer)
        } else if let offer = store.offer, offer.state == .declined || offer.state == .lapsed {
            SurfacePanel(tone: .quiet) {
                careEyebrow(offer.state == .declined ? "You declined · \(serviceName)" : "Offer lapsed · \(serviceName)")
                careNote(offer.state == .declined ? CareData.declined : CareData.lapsed, strong: true)
            }
        } else if available, let withheld = store.withheld {
            SurfacePanel(tone: .quiet) {
                careEyebrow("No visit offered to you")
                careNote(withheld, strong: true)
                careNote(CareData.withheldIsNotLast)
            }
        }
    }

    private func offerPanel(_ offer: CareVisitStore.Offer) -> some View {
        SurfacePanel {
            careEyebrow("A visit offered to you")
            careTitle(serviceName)
            if let marker = offer.marker {
                Label(marker, systemImage: "checkmark.seal")
                    .font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                    .fixedSize(horizontal: false, vertical: true)
            }
            careFact("When", "Today, \(CareVisitStore.clock(store.scheduledFor))", "\(store.service?.duration ?? 0) min")
            careFact("How far", String(format: "%.1f km", offer.distanceKm), CareData.distanceBasis)
            careFact("Lapses", CareVisitStore.clock(offer.expiresAt), store.minutesLeft == 0 ? "Now" : "In \(store.minutesLeft) min")
            careNote("Where the patient lives is shown to the nurse who accepts, and to nobody else who was asked.")
            CapabilityNotice(of: "booking")
            if let refusal = store.refusal, refusal.stage == nil { careRefusal(refusal.statement) }
            ViewThatFits(in: .horizontal) {
                HStack(spacing: ThusoSpacing.space12) { declineButton; acceptButton }
                VStack(spacing: ThusoSpacing.space8) { acceptButton; declineButton }
            }
        }
    }

    private var acceptButton: some View { Button("Accept this visit") { store.accept() }.buttonStyle(CareButton()) }
    private var declineButton: some View { Button("Decline") { store.decline() }.buttonStyle(QuietButton()) }
}

/// The visit, from the road to the doctor's queue to its completion.
struct CareVisitView: View {
    @ObservedObject private var store = CareVisitStore.shared
    @ObservedObject private var queue = VisitQueueStore.shared
    @State private var code = ""
    private let ticker = Timer.publish(every: 15, on: .main, in: .common).autoconnect()

    private var zoneName: String { store.visitZone?.name ?? "" }
    private var serviceName: String { store.service?.name ?? "" }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
                VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
                    careEyebrow("Visit \(CareData.Preview.appointmentRef) · \(zoneName)")
                    Text("\(serviceName), today at \(CareVisitStore.clock(store.scheduledFor))")
                        .font(.title3.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                    CapabilityNotice(of: "booking")
                }
                if store.accepted {
                    rail
                    stageContent
                } else {
                    SurfacePanel {
                        careNote("There is no visit to continue. An offer is accepted from your schedule, and the visit opens here once you have.")
                    }
                }
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space16, for: .scrollContent)
        .thusoGround()
        .navigationTitle("Visit \(CareData.Preview.appointmentRef)")
        .navigationBarTitleDisplayMode(.inline)
        .onReceive(ticker) { store.tick($0) }
    }

    /* Six named steps as a column rather than a row of dots: what is behind her filled, where she is
       ringed, each read out as a step with its state, and nothing squeezed at the larger type sizes. */
    private var rail: some View {
        let stages = CareVisitStore.Stage.allCases
        let at = stages.firstIndex(of: store.stage) ?? 0
        return SurfacePanel(spacing: ThusoSpacing.space8) {
            ForEach(Array(stages.enumerated()), id: \.element) { index, stage in
                let done = store.completed || index < at
                let current = !store.completed && index == at
                HStack(spacing: ThusoSpacing.space12) {
                    ZStack {
                        Circle().fill(done ? ThusoTheme.brandInk : ThusoTheme.surface)
                        Circle().strokeBorder(done || current ? ThusoTheme.brandInk : ThusoTheme.controlEdge, lineWidth: current ? 2 : 1)
                        if done {
                            Image(systemName: "checkmark").font(.footnote.weight(.bold)).foregroundStyle(ThusoTheme.surface)
                        } else {
                            Text("\(index + 1)").font(.footnote.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                        }
                    }
                    .frame(width: 28, height: 28)
                    .accessibilityHidden(true)
                    Text(stage.name)
                        .font(current ? .subheadline.weight(.semibold) : .subheadline)
                        .foregroundStyle(ThusoTheme.charcoal)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Step \(index + 1) of \(stages.count), \(stage.name)\(done ? ", done" : current ? ", current" : "")")
            }
        }
    }

    @ViewBuilder private var stageContent: some View {
        if store.completed {
            SurfacePanel {
                careTitle("The visit is complete")
                careNote(CareData.billable, strong: true)
                if store.handedOver { careNote(CareData.handoverQueued) }
                careNote(store.locationSentence)
            }
        } else {
            switch store.stage {
            case .route: routeStage
            case .start: codeStage(.start, title: "Confirm you are at the right door", button: "Start the visit") { store.start(code: $0) }
            case .checklist: checklistStage
            case .record: recordStage
            case .handover: handoverStage
            case .complete: codeStage(.complete, title: "Complete with the code", button: "Complete the visit") { store.complete(code: $0) }
            }
        }
    }

    @ViewBuilder private var routeStage: some View {
        SurfacePanel {
            careTitle("On the way to \(zoneName)")
            CapabilityNotice(of: "dispatch")
            if let to = store.visitZone {
                ArrivalMap(from: store.nurseBase, to: to,
                           summary: store.nurseBase.map { "Schematic map. You are drawn at the centre of \($0.name) and this visit at the centre of \(to.name)." }
                            ?? "Schematic map. This visit is drawn at the centre of \(to.name).")
            }
            if let offer = store.offer {
                careNote(String(format: "%.1f km · ", offer.distanceKm) + CareData.distanceBasis, strong: true)
            }
            careNote(store.locationSentence)
        }
        Button("I am at the door") { store.go(to: .start) }.buttonStyle(CareButton())
    }

    @ViewBuilder private func codeStage(_ stage: CareVisitStore.Stage, title: String, button: String, run: @escaping (String) -> Void) -> some View {
        SurfacePanel {
            careTitle(title)
            if stage == .complete, store.handedOver {
                /* A queue is only honestly named beside the sentence that says nobody reads it yet. */
                careNote(CareData.handoverQueued, strong: true)
                CapabilityNotice(of: "doctor-review")
            }
            careNote("Ask the patient for the six-digit code in the MyThuso app. In this preview the code is \(CareData.Preview.visitCode).")
            CodeBoxes(code: $code, invalid: store.refusal?.stage == stage, label: "Visit code")
            if let refusal = store.refusal, refusal.stage == stage { careRefusal(refusal.statement) }
        }
        Button(button) { run(code); code = "" }
            .buttonStyle(CareButton())
            .disabled(code.count < 6)
    }

    @ViewBuilder private var checklistStage: some View {
        SurfacePanel {
            careTitle("Checklist")
            ForEach(store.protocols) { entry in
                HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(entry.name).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                            .fixedSize(horizontal: false, vertical: true)
                        Text("Version \(entry.version)").font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                    }
                    Spacer(minLength: ThusoSpacing.space8)
                    MetricChip(text: entry.status.capitalized)
                }
                .accessibilityElement(children: .combine)
            }
            if let refusal = store.checklistRefusal { careRefusal(refusal, why: store.checklistWhy) }
        }
        Button("Continue to readings and sign-off") { store.go(to: .record) }.buttonStyle(CareButton())
    }

    @ViewBuilder private var recordStage: some View {
        SurfacePanel {
            careTitle("Readings and sign-off")
            CapabilityNotice(of: "clinical-records")
            careNote(CareData.recordSentence)
            Label(store.signedOff ? "Signed off on this phone." : "Not signed off yet.",
                  systemImage: store.signedOff ? "checkmark.seal" : "clock")
                .font(.subheadline).foregroundStyle(ThusoTheme.charcoal)
        }
        if !store.signedOff { assessmentLink }
        Button("Continue to handover") { store.go(to: .handover) }.buttonStyle(CareButton())
    }

    @ViewBuilder private var handoverStage: some View {
        SurfacePanel {
            careTitle("Hand to a doctor")
            CapabilityNotice(of: "doctor-review")
            if let refusal = store.refusal, refusal.stage == .handover { careRefusal(refusal.statement) }
        }
        if store.refusal?.stage == .handover { assessmentLink }
        Button("Hand to a doctor") { store.handOver() }.buttonStyle(CareButton())
    }

    /* The assessment this visit is signed off in, opened under the visit's own reference, so the
       sign-off it seals is the one handover and completion ask for. */
    private var assessmentLink: some View {
        NavigationLink { VisitAssessmentView(reference: CareData.Preview.appointmentRef) } label: {
            NavPillLabel(title: "Open the visit assessment", subtitle: "Identity, consent, readings, findings, sign-off", symbol: "list.clipboard")
        }
        .buttonStyle(.plain)
    }
}

// MARK: - The parts both screens are made of

private func careEyebrow(_ text: String) -> some View {
    Text(text.uppercased())
        .font(.footnote.weight(.semibold)).tracking(0.4)
        .foregroundStyle(ThusoTheme.studioInkMuted)
        .fixedSize(horizontal: false, vertical: true)
}

private func careTitle(_ text: String) -> some View {
    Text(text)
        .thusoFont(ThusoType.cardTitle, weight: .semibold)
        .foregroundStyle(ThusoTheme.charcoal)
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityAddTraits(.isHeader)
}

private func careNote(_ text: String, strong: Bool = false) -> some View {
    Text(text)
        .font(strong ? .subheadline.weight(.semibold) : .subheadline)
        .foregroundStyle(strong ? ThusoTheme.charcoal : ThusoTheme.studioInkMuted)
        .fixedSize(horizontal: false, vertical: true)
}

/* A fact on the offer, as a label over a value over what the value is: the value is what a nurse
   compares, so it is the one set heavy, and the digits are monospaced so two offers line up. */
private func careFact(_ label: String, _ value: String, _ detail: String) -> some View {
    VStack(alignment: .leading, spacing: 2) {
        Text(label).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
        Text(value).font(.body.weight(.semibold)).monospacedDigit().foregroundStyle(ThusoTheme.charcoal)
            .fixedSize(horizontal: false, vertical: true)
        Text(detail).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
            .fixedSize(horizontal: false, vertical: true)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .combine)
}

/* A refusal, beside the control it refused: the sentence in the text ink, and the danger colour only on
   the mark in front of it, so the words are readable and the state is not carried by colour alone. */
private func careRefusal(_ text: String, why: String? = nil) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space8) {
        Image(systemName: "hand.raised").foregroundStyle(ThusoTheme.danger).accessibilityHidden(true)
        VStack(alignment: .leading, spacing: 4) {
            Text(text).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                .fixedSize(horizontal: false, vertical: true)
            if let why {
                Text(why).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
    .accessibilityElement(children: .combine)
}
