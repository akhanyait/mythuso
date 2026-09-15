import SwiftUI

/* Verify in service on iOS: the nurse's shift start and the code she shows at a door, and the patient's check of
 * the person at hers. Every word is VerifyInServiceData.swift, generated from the contract; every rule is
 * VerifyInService.swift; every number is the contract's default, which an admin changes on the web.
 *
 * The shift start says plainly that no face match was performed and why, before anything else on the screen, and
 * nothing here opens a camera. The door check shows the nurse's initials where a photograph would be, her name and
 * her badge tier, and never a number. "This is not my nurse" is on the screen at every step.
 *
 * Nothing here is a real service: no desk is told, no incident is raised and no code reaches a door.
 */
private func clockTime(_ date: Date) -> String {
    let formatter = DateFormatter()
    formatter.dateFormat = "HH:mm"
    formatter.timeZone = TimeZone(identifier: "Africa/Johannesburg")
    return formatter.string(from: date)
}

@MainActor private func badgeCurrent(for name: String) -> Bool {
    VettingStore.shared.subject(named: name).map(summarise)?.cleared ?? false
}

struct ShiftStartView: View {
    @ObservedObject private var store = VerifyInServiceStore.shared
    @State private var refused: VerifyInServiceRefusal?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space20) {
                DemoBadge()
                SurfaceHeading(eyebrow: "Your shift", title: VerifyInService.ShiftText.heading, subtitle: VerifyInService.ShiftText.intro)
                CapabilityNotice(of: "credential-verification")
                SurfacePanel(tone: .lead) {
                    Label(VerifyInService.ShiftText.noMatch, systemImage: "person.crop.circle.badge.questionmark")
                        .font(.body.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(VerifyInService.ShiftText.whyNoMatch).font(.footnote)
                        .foregroundStyle(ThusoTheme.studioInkMuted).fixedSize(horizontal: false, vertical: true)
                    if let shift = store.shift {
                        Text(VerifyInService.fill(VerifyInService.ShiftText.started, ["at": clockTime(shift.startedAt)]))
                            .font(.footnote.weight(.medium)).foregroundStyle(ThusoTheme.charcoal)
                        Text(VerifyInService.nurseLine(shift)).font(.footnote)
                            .foregroundStyle(ThusoTheme.charcoal).fixedSize(horizontal: false, vertical: true)
                    } else {
                        Button(VerifyInService.ShiftText.button) { start() }
                            .buttonStyle(CareButton())
                            .accessibilityIdentifier("shift-start")
                    }
                    if let refused {
                        Text(refused.statement).font(.footnote).foregroundStyle(ThusoTheme.danger)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                NavigationLink { NurseDoorCodeView() } label: {
                    Text(VerifyInService.NurseDoorText.heading).frame(maxWidth: .infinity)
                }.buttonStyle(CareButton())
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle(VerifyInService.ShiftText.heading).navigationBarTitleDisplayMode(.inline)
    }

    private func start() {
        switch VerifyInService.startShift(at: Date(), badgeCurrent: badgeCurrent(for: Arrival.nurse.name)) {
        case .success(let shift): store.shift = shift; refused = nil
        case .failure(let refusal): refused = refusal
        }
    }
}
// MARK: - End of the shift start

struct NurseDoorCodeView: View {
    @ObservedObject private var store = VerifyInServiceStore.shared
    @State private var refused: VerifyInServiceRefusal?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space20) {
                DemoBadge()
                SurfaceHeading(eyebrow: "At the door", title: VerifyInService.NurseDoorText.heading, subtitle: VerifyInService.NurseDoorText.intro)
                SurfacePanel(tone: .lead) {
                    if let shown = store.shown {
                        Text(shown.digits).font(.system(size: 40, weight: .bold, design: .monospaced))
                            .foregroundStyle(ThusoTheme.charcoal).accessibilityLabel(VerifyInService.NurseDoorText.heading)
                        Text(VerifyInService.fill(VerifyInService.NurseDoorText.expires, ["at": clockTime(shown.expiresAt)])).font(.footnote)
                        Text(VerifyInService.fill(VerifyInService.NurseDoorText.tries, ["attempts": String(shown.attemptsAllowed)])).font(.footnote)
                    }
                    Text(VerifyInService.NurseDoorText.preview).font(.footnote)
                        .foregroundStyle(ThusoTheme.studioInkMuted).fixedSize(horizontal: false, vertical: true)
                    Button(store.shown == nil ? VerifyInService.NurseDoorText.button : VerifyInService.NurseDoorText.again) { show() }
                        .buttonStyle(CareButton())
                    if let refused {
                        Text(refused.statement).font(.footnote).foregroundStyle(ThusoTheme.danger)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle(VerifyInService.NurseDoorText.heading).navigationBarTitleDisplayMode(.inline)
    }

    private func show() {
        var check = store.check
        let tier: String? = badgeCurrent(for: Arrival.nurse.name) ? VerifyInService.tiers.first?.id : nil
        switch check.show(nurseName: Arrival.nurse.name, badgeTier: tier, at: Date()) {
        case .success(let shown): store.check = check; store.shown = shown; refused = nil
        case .failure(let refusal): refused = refusal
        }
    }
}

struct DoorCheckView: View {
    let visit: BookedVisit
    @ObservedObject private var store = VerifyInServiceStore.shared
    @State private var typed = ""
    @State private var tried: VerifyInService.Tried?
    @State private var refused: VerifyInServiceRefusal?
    @State private var deskTold = false
    @State private var confirmed = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space20) {
                DemoBadge()
                SurfaceHeading(eyebrow: "Your visit", title: VerifyInService.PatientDoorText.heading, subtitle: VerifyInService.PatientDoorText.intro)
                CapabilityNotice(of: "credential-verification")
                SurfacePanel(tone: .lead) {
                    HStack(spacing: ThusoSpacing.space12) {
                        Monogram(text: Arrival.nurse.initials, diameter: 44, background: ThusoTheme.surface)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(Arrival.nurse.name).font(.body.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                            Text("\(visit.service.name) for \(visit.patient)").font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                        }
                    }
                    Text(VerifyInService.PatientDoorText.photo).font(.footnote)
                        .foregroundStyle(ThusoTheme.studioInkMuted).fixedSize(horizontal: false, vertical: true)
                    if !deskTold && !confirmed {
                        CodeBoxes(code: $typed, length: VerifyInService.doorDigits, invalid: refused != nil, label: VerifyInService.PatientDoorText.codeLabel)
                        Button(VerifyInService.PatientDoorText.check) { check() }
                            .buttonStyle(CareButton()).disabled(typed.count != VerifyInService.doorDigits)
                    }
                    outcome
                }
                if !deskTold {
                    Text(VerifyInService.PatientDoorText.anyTime).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                    Button(role: .destructive) { answer("not-my-nurse") } label: {
                        Text(VerifyInService.label(VerifyInService.answers, "not-my-nurse")).frame(maxWidth: .infinity, minHeight: 48)
                    }.buttonStyle(.bordered).tint(ThusoTheme.danger)
                }
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle(VerifyInService.PatientDoorText.heading).navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder private var outcome: some View {
        if let refused {
            Text(refused.statement).font(.footnote).foregroundStyle(ThusoTheme.danger).fixedSize(horizontal: false, vertical: true)
        }
        if deskTold {
            VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
                Label(VerifyInService.PatientDoorText.mismatch, systemImage: "exclamationmark.shield").font(.body.weight(.semibold))
                Text(VerifyInService.PatientDoorText.danger).font(.footnote)
            }
            .foregroundStyle(ThusoTheme.danger).accessibilityElement(children: .combine)
        } else if confirmed {
            Label(VerifyInService.PatientDoorText.verified, systemImage: "checkmark.seal").font(.footnote).foregroundStyle(ThusoTheme.charcoal)
        } else if case let .wrong(left) = tried {
            Text(VerifyInService.fill(VerifyInService.PatientDoorText.wrong, ["attempts": String(left)])).font(.footnote).foregroundStyle(ThusoTheme.danger)
        } else if case let .codeFits(name, tierName) = tried {
            Label(VerifyInService.PatientDoorText.matched, systemImage: "checkmark.seal").font(.footnote.weight(.medium))
            LabeledContent(VerifyInService.PatientDoorText.name, value: name)
            LabeledContent(VerifyInService.PatientDoorText.badge, value: tierName ?? VerifyInService.PatientDoorText.noBadge)
            Text(VerifyInService.PatientDoorText.badgeSentence).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
            Text(VerifyInService.PatientDoorText.question).font(.body.weight(.semibold))
            if tierName != nil {
                Button(VerifyInService.label(VerifyInService.answers, "she-is-my-nurse")) { answer("she-is-my-nurse") }.buttonStyle(CareButton())
            }
        }
    }

    private func check() {
        var next = store.check
        switch next.attempt(typed, at: Date()) {
        case .success(let result):
            store.check = next
            tried = result
            refused = nil
            if result == .mismatch { deskTold = true }
        case .failure(let refusal): refused = refusal
        }
        typed = ""
    }

    private func answer(_ id: String) {
        var next = store.check
        switch next.answer(id) {
        case .success(let told): store.check = next; refused = nil; if told { deskTold = true } else { confirmed = true }
        case .failure(let refusal): refused = refusal
        }
    }
}
// MARK: - End of the door check
