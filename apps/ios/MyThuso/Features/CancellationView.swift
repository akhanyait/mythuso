import SwiftUI

/* Cancelling a visit, and moving one.
 *
 * The booking confirmation has promised for months that a visit may be cancelled or moved up to
 * two hours before it, and until this screen existed there was no cancel control anywhere in the
 * app — every "Cancel" in the tree dismissed a dialog — while the Cancelled tab sat there showing
 * the outcome of an action nobody was offered. This is the missing half.
 *
 * Three decisions are worth reading before changing anything here.
 *
 * The move is offered first, and it is offered again if the reason given is that the day is wrong.
 * A person who wanted a different Tuesday and is shown nothing but a cancel button cancels, and the
 * visit is gone for a reason that was never about the visit.
 *
 * Nothing on either screen asks anybody to justify themselves. The four reasons are the contract's,
 * one of them is "I would rather not say", and that one is chosen before the screen is even read —
 * so the way past is already taken and the list is an offer rather than a toll gate. Whatever is
 * chosen is recorded as the answer it is.
 *
 * And nothing here says a word about money. What a late cancellation costs is an open commercial
 * and legal question — section 47 of the Consumer Protection Act, and the contract holds it as
 * `pendingDecision` — so the screen where somebody is deciding whether to cancel carries the
 * payments capability's notice and no sentence of its own. The moment a provider is connected that
 * notice disappears from every platform at once, which is the only way it stays true.
 */
struct CancelVisitView: View {
    let visit: BookedVisit
    @EnvironmentObject private var store: PreviewStore
    @Environment(\.dismiss) private var dismiss
    /// The moment being shown. It starts as the moment the visit is actually in.
    @State private var moment: String
    @State private var reason: String
    /// Nil until it has happened. Then the whole record, so the confirmation reads from it.
    @State private var recorded: CancelledVisit?

    init(visit: BookedVisit) {
        self.visit = visit
        _moment = State(initialValue: Cancellation.state(of: visit).id)
        /* Chosen before anybody has read anything: the reason that answers nothing is a real answer
           and it is already given, so no part of this screen has to be argued past. */
        _reason = State(initialValue: "unstated")
    }

    private var state: CancellationState { Cancellation.state(moment) }
    private var chosenReason: CancellationReason { Cancellation.reason(reason) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
                DemoBadge()
                if let recorded { confirmation(recorded) } else { chooser }
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle(recorded == nil ? "Cancel or move" : "Cancelled")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.visible, for: .navigationBar).toolbarBackground(ThusoTheme.glassFloor, for: .navigationBar)
    }

    // MARK: - Deciding

    @ViewBuilder private var chooser: some View {
        visitSummary
        momentPicker
        CareCard {
            Text(state.name).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                .fixedSize(horizontal: false, vertical: true)
            Text(state.detail).font(.footnote).foregroundStyle(ThusoTheme.charcoal)
                .fixedSize(horizontal: false, vertical: true)
        }
        if state.refusesCancellation { refusal } else { offerThenReasons }
        Text(Cancellation.windowSentence).font(.footnote).foregroundStyle(ThusoTheme.charcoal)
            .fixedSize(horizontal: false, vertical: true)
    }

    /* The one refusal in the feature, and it is not about the window. A booking screen cannot end
       an encounter that is happening in somebody's house: a visit that has begun and stopped is an
       outcome of the visit and belongs to the clinical record. So the reasons, the button and the
       move are all absent rather than disabled, and what is offered instead is the two people who
       can actually do something about it. */
    @ViewBuilder private var refusal: some View {
        CareCard(weight: .lead) {
            TileIcon(symbol: "hand.raised")
            Text(state.patientWords).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                .fixedSize(horizontal: false, vertical: true)
        }
        Button("Back to the visit") { dismiss() }.buttonStyle(CareButton())
    }

    @ViewBuilder private var offerThenReasons: some View {
        rescheduleOffer
        CareSectionHeader("Would you like to tell us why?")
        CareCard(padding: ThusoSpacing.space16, spacing: 0) {
            ForEach(Array(Cancellation.reasons.enumerated()), id: \.element) { index, option in
                Button { reason = option.id } label: { reasonRow(option) }.buttonStyle(.plain)
                    .accessibilityAddTraits(reason == option.id ? [.isSelected] : [])
                if index < Cancellation.reasons.count - 1 { Divider().overlay(ThusoTheme.stone) }
            }
        }
        /* From the contract, not typed. The sentence exists because a screen can behave permissively
           and still read as a demand — "I would rather not say" being pre-selected is the behaviour,
           and this is the product saying so out loud. */
        Text(Cancellation.refusal("no-reason-required"))
            .font(.footnote).foregroundStyle(ThusoTheme.charcoal).fixedSize(horizontal: false, vertical: true)
        /* Offered a second time, and only for the reason that is not really a cancellation. The
           first offer is at the top of a screen somebody has since scrolled past; this one is
           directly above the button that takes the visit away. */
        if chosenReason.offersRescheduleFirst { rescheduleOffer }
        /* Never disabled, at any moment inside the window. The contract's `always` gives the
           reason: a product that refuses a cancellation has not prevented it, it has only made
           somebody not answer the door — and the nurse still travels, and nobody knows why. The
           late cancellation is recorded as late; that is the whole of what being late does. */
        Button("Cancel this visit") { record() }.buttonStyle(QuietButton())
        if state.id == "inside-window" {
            Text(Cancellation.alwaysStatement).font(.footnote).foregroundStyle(ThusoTheme.charcoal)
                .fixedSize(horizontal: false, vertical: true)
        }
        CapabilityNotice(of: "payments")
    }

    private func reasonRow(_ option: CancellationReason) -> some View {
        HStack(alignment: .top, spacing: ThusoSpacing.space12) {
            Image(systemName: reason == option.id ? "largecircle.fill.circle" : "circle")
                .foregroundStyle(ThusoTheme.charcoal).accessibilityHidden(true)
            Text(option.text).font(.subheadline).foregroundStyle(ThusoTheme.charcoal)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.vertical, ThusoSpacing.space8).frame(minHeight: 44).contentShape(Rectangle())
    }

    private var rescheduleOffer: some View {
        CareCard(weight: .lead) {
            Text(Cancellation.Reschedule.sentence).font(.subheadline.weight(.semibold))
                .foregroundStyle(ThusoTheme.charcoal).fixedSize(horizontal: false, vertical: true)
            NavigationLink { RescheduleVisitView(visit: visit) } label: {
                Text("Move this visit instead").frame(maxWidth: .infinity)
            }.buttonStyle(CareButton())
        }
    }

    private var visitSummary: some View {
        CareCard {
            LabeledContent("Visit", value: visit.service.name)
            LabeledContent("When", value: visit.whenText)
            LabeledContent("Where", value: visit.address)
            LabeledContent("Patient", value: visit.patient)
        }
    }

    /* A design-review control, marked as one by the dashed border the preview states already use.
       It is here because the preview has no diary: every fictional visit in the store is days away,
       so two of the three moments this feature is built around — the late one, and the refusal —
       would be unreachable on a simulator and untestable in MyThusoUITests. Against a real
       schedule this picker goes and Cancellation.state(of:) answers on its own, which is what it
       already does to set the starting value. */
    private var momentPicker: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            Text("Preview moments").font(.caption.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            Text("This preview has no schedule behind it, so choose the moment to see what it says.")
                .font(.caption2).foregroundStyle(ThusoTheme.charcoal).fixedSize(horizontal: false, vertical: true)
            ForEach(Cancellation.states) { option in
                Button { moment = option.id } label: {
                    HStack(spacing: ThusoSpacing.space8) {
                        Image(systemName: moment == option.id ? "largecircle.fill.circle" : "circle")
                            .foregroundStyle(ThusoTheme.charcoal).accessibilityHidden(true)
                        Text(option.name).font(.footnote).foregroundStyle(ThusoTheme.charcoal)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                    }
                    .frame(minHeight: 44).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(moment == option.id ? [.isSelected] : [])
            }
        }
        .padding(ThusoSpacing.space12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ThusoTheme.cloud, in: RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous)
            .strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [4, 3])).foregroundStyle(ThusoTheme.controlEdge))
    }

    private func record() {
        let outcome = CancelledVisit(visit: visit, reason: chosenReason, state: state)
        store.cancel(visit, reason: outcome.reason, state: outcome.state)
        recorded = outcome
    }

    // MARK: - Afterwards

    /* The words are the contract's, chosen by the moment it happened in and rendered as they are
       written. The late one says it was late and says nothing else, because there is nothing else
       decided to say. */
    @ViewBuilder private func confirmation(_ record: CancelledVisit) -> some View {
        CareCard(weight: .lead) {
            Text(record.state.patientWords).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                .fixedSize(horizontal: false, vertical: true)
            Divider().overlay(ThusoTheme.stone)
            LabeledContent("Visit", value: record.visit.service.name)
            LabeledContent("It was booked for", value: record.visit.whenText)
            LabeledContent("Reason recorded", value: record.reason.text)
        }
        CapabilityNotice(of: "payments")
        CareSectionHeader("What cancelling does not do")
        CareCard(padding: ThusoSpacing.space16, spacing: ThusoSpacing.space12) {
            ForEach(Cancellation.doesNotUndo) { limit in
                VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
                    Text(limit.statement).font(.subheadline).foregroundStyle(ThusoTheme.charcoal)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(limit.why).font(.caption).foregroundStyle(ThusoTheme.charcoal)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .accessibilityElement(children: .combine)
            }
        }
        NavigationLink { VisitsView(showing: "Cancelled") } label: {
            Text("See your cancelled visits").frame(maxWidth: .infinity)
        }.buttonStyle(CareButton())
    }
}

/* Moving a visit rather than losing it.
 *
 * It is the same visit throughout — the same reference, the same person, the same address and the
 * same service, with only the day and the hour changing — which is what makes the interpreter held
 * for it, the consent given for it and the record of it still apply afterwards. That sentence is
 * the contract's and it is on the screen rather than only in this comment.
 *
 * The picker is the booking flow's own, not a second one built to look like it. Two pickers means
 * two sets of rules about which days are offered and which hours are on them, and the second set
 * is always the one nobody updates. */
struct RescheduleVisitView: View {
    let visit: BookedVisit
    @EnvironmentObject private var store: PreviewStore
    @State private var days: [OfferedDay]
    @State private var day: Int
    @State private var slot: String
    @State private var moved: BookedVisit?

    init(visit: BookedVisit) {
        self.visit = visit
        let offered = Scheduling.offeredDays()
        _days = State(initialValue: offered)
        /* Opens on the day and the hour the visit already has, where they are still on offer. A
           picker that opens on tomorrow asks somebody to find their own booking before they can
           move it. */
        let booked = visit.date.map(Scheduling.isoDay)
        _day = State(initialValue: offered.firstIndex { $0.id == booked } ?? 0)
        _slot = State(initialValue: visit.start ?? Scheduling.slots[0])
    }

    private var chosenDay: OfferedDay { days.indices.contains(day) ? days[day] : days[0] }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
                DemoBadge()
                if let moved { confirmation(moved) } else { picker }
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle(moved == nil ? "Move this visit" : "Moved")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.visible, for: .navigationBar).toolbarBackground(ThusoTheme.glassFloor, for: .navigationBar)
    }

    @ViewBuilder private var picker: some View {
        CareCard {
            LabeledContent("Visit", value: visit.service.name)
            LabeledContent("Booked for", value: visit.whenText)
            LabeledContent("Where", value: visit.address)
            LabeledContent("Patient", value: visit.patient)
        }
        Text(Cancellation.Reschedule.keepsTheSameVisit).font(.footnote).foregroundStyle(ThusoTheme.charcoal)
            .fixedSize(horizontal: false, vertical: true)
        VisitTimePicker(days: days, day: $day, slot: $slot, minutes: visit.service.duration)
        Button("Move this visit") { moved = store.reschedule(visit, to: chosenDay.date, start: slot) }
            .buttonStyle(CareButton())
        Text(Cancellation.windowSentence).font(.footnote).foregroundStyle(ThusoTheme.charcoal)
            .fixedSize(horizontal: false, vertical: true)
    }

    @ViewBuilder private func confirmation(_ visit: BookedVisit) -> some View {
        CareCard(weight: .lead) {
            Text("This visit has moved.").font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            Divider().overlay(ThusoTheme.stone)
            LabeledContent("Visit", value: visit.service.name)
            LabeledContent("Now", value: visit.whenText)
            LabeledContent("Where", value: visit.address)
            LabeledContent("Patient", value: visit.patient)
        }
        Text(Cancellation.Reschedule.keepsTheSameVisit).font(.footnote).foregroundStyle(ThusoTheme.charcoal)
            .fixedSize(horizontal: false, vertical: true)
        NavigationLink { VisitsView() } label: { Text("See your visits").frame(maxWidth: .infinity) }
            .buttonStyle(CareButton())
    }
}
