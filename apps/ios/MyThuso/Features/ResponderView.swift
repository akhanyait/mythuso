import SwiftUI

/* Thuso Ride's responder app on iOS: the trip offered to this responder, accept or decline, the emergency summary
 * while the trip is under way and never outside it, and the hand-over at the destination by role with the checklist.
 *
 * WHAT LEADS. A responder opens this to know where to go and whether they can go, so the offer and its two buttons
 * lead; the summary sits under it and says, in the contract's words, when it opens and when it closed; the hand-over
 * form appears only once there is a trip to hand over.
 *
 * WHAT IT NEVER SAYS. That Thuso Ride is an ambulance: the contract's sentence that it is not sits above the offer.
 * Every sentence is MovementData.swift's, every refusal the route's own, and the interval is the generated default. */

struct ResponderView: View {
    @State private var trip = Movement.previewTrip(now: Date())
    @State private var receivingRole: String?
    @State private var ticked: Set<String> = []
    @State private var refusal: String?
    @State private var status: String?

    private static let stamp: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_ZA")
        formatter.setLocalizedDateFormatFromTemplate("EEE d MMM HH:mm")
        return formatter
    }()
    private func when(_ date: Date) -> String { Self.stamp.string(from: date) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space20) {
                DemoBadge()
                CapabilityNotice(of: "dispatch")
                SurfaceHeading(eyebrow: "Thuso Ride", title: Movement.ResponderText.heading, subtitle: Movement.ResponderText.intro)
                Label(Movement.notAnAmbulance, systemImage: "info.circle")
                    .font(.subheadline).foregroundStyle(ThusoTheme.charcoal)
                    .fixedSize(horizontal: false, vertical: true)
                offer
                summary
                if trip.stateId == "accepted" { handover }
                if let refusal {
                    Label(refusal, systemImage: "hand.raised")
                        .font(.footnote.weight(.medium)).foregroundStyle(ThusoTheme.danger)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("responder-refusal")
                }
                if let status {
                    Text(status).font(.footnote).foregroundStyle(ThusoTheme.charcoal)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Text(Movement.fill(Movement.ResponderText.heartbeat, ["interval": Movement.intervalText()]))
                    .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                    .fixedSize(horizontal: false, vertical: true)
                Text(Movement.preview)
                    .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle(Movement.ResponderText.heading)
        .navigationBarTitleDisplayMode(.inline)
    }

    private func answer(_ result: Movement.Answer, said: String? = nil) {
        switch result {
        case .done(let next): trip = next; refusal = nil; status = said
        case .refused(let sentence): refusal = sentence; status = nil
        }
    }

    @ViewBuilder private var offer: some View {
        SurfacePanel(tone: .lead) {
            HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space8) {
                Text(trip.id).font(.subheadline.weight(.semibold).monospaced()).foregroundStyle(ThusoTheme.charcoal)
                Spacer(minLength: ThusoSpacing.space8)
                StatusPill(text: Movement.priority(trip.priorityClass)?.label ?? trip.priorityClass, tone: "quiet")
                StatusPill(text: Movement.label(Movement.tripStates, trip.stateId), tone: trip.stateId == "handed-over" ? "quiet" : trip.stateId == "accepted" ? "teal" : "amber")
            }
            Label(Movement.fill(Movement.ResponderText.pickup, ["zone": Movement.label(Movement.zones, trip.zoneId), "when": when(trip.pickupAt)]), systemImage: "mappin")
                .font(.subheadline).foregroundStyle(ThusoTheme.charcoal).fixedSize(horizontal: false, vertical: true)
            Label(Movement.fill(Movement.ResponderText.destination, ["facility": Movement.label(Movement.facilities, trip.facilityRef)]), systemImage: "building.2")
                .font(.subheadline).foregroundStyle(ThusoTheme.charcoal).fixedSize(horizontal: false, vertical: true)
            if trip.stateId == "requested" && !trip.declined {
                Text(Movement.ResponderText.offered).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: ThusoSpacing.space8) { acceptButton; declineButton }
                    VStack(spacing: ThusoSpacing.space8) { acceptButton; declineButton }
                }
            } else if trip.declined {
                Text(Movement.ResponderText.declined).font(.footnote).foregroundStyle(ThusoTheme.charcoal)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityIdentifier("responder-offer")
    }

    private var acceptButton: some View {
        Button(Movement.ResponderText.accept) { answer(Movement.accept(trip, now: Date())) }.buttonStyle(CareButton())
    }
    private var declineButton: some View {
        Button(Movement.ResponderText.decline) { answer(Movement.decline(trip), said: Movement.ResponderText.declined) }.buttonStyle(QuietButton())
    }

    private var summary: some View {
        SurfacePanel {
            PanelHead(Movement.ResponderText.summaryHeading)
            Text(Movement.summaryOpen(trip)
                 ? Movement.fill(Movement.ResponderText.summaryOpen, ["categories": PassportSharingData.emergencySummaryNames.joined(separator: ", ")])
                 : trip.stateId == "handed-over" ? Movement.ResponderText.summaryClosed : Movement.ResponderText.summaryNotYet)
                .font(.subheadline).foregroundStyle(ThusoTheme.charcoal)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("responder-summary")
    }

    private var handover: some View {
        SurfacePanel {
            PanelHead(Movement.ResponderText.handoverHeading)
            Picker(Movement.ResponderText.receivingRole, selection: $receivingRole) {
                Text("Choose…").tag(String?.none)
                ForEach(Movement.receivingRoles) { role in Text(role.label).tag(Optional(role.id)) }
            }
            .pickerStyle(.menu)
            .frame(minHeight: 44)
            Text(Movement.ResponderText.checklistHeading).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            ForEach(Movement.checklist, id: \.self) { line in
                Toggle(isOn: Binding(get: { ticked.contains(line) }, set: { if $0 { ticked.insert(line) } else { ticked.remove(line) } })) {
                    Text(line).font(.subheadline).foregroundStyle(ThusoTheme.charcoal).fixedSize(horizontal: false, vertical: true)
                }
                .frame(minHeight: 44)
            }
            Button(Movement.ResponderText.handover) {
                let result = Movement.handOver(trip, receivingRoleId: receivingRole, checklistComplete: ticked.count == Movement.checklist.count, now: Date())
                if case .done(let handed) = result, let at = handed.handedOverAt {
                    answer(result, said: Movement.fill(Movement.ResponderText.handedOver, ["when": when(at)]))
                } else {
                    answer(result)
                }
            }
            .buttonStyle(CareButton())
        }
        .accessibilityIdentifier("responder-handover")
    }
}
