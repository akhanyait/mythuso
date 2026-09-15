import SwiftUI

/* The nurse safety suite on iOS: the strip on the visit a nurse is in, and the queue the Control Tower
 * works. Every word is FieldSafetyData.swift, generated from the contract; every rule is FieldSafety.swift.
 *
 * The strip is small and panic is not. The assessment is what she opened the screen for and it keeps the
 * page; the strip owes her one line of time, three plain controls, and a panic control that is findable
 * without looking: its own colour, its own word, full width, the same place on every stage. Panic asks
 * once, and the confirmation is the only place the window is stated before it starts, beside the sentence
 * that a person at the desk decides whether anybody is sent.
 *
 * The desk sees a nurse and a suburb, never the service or the person visited. A position is shown only
 * while its window is open, and a row whose window has closed says when it closed instead.
 */
struct FieldSafetyPanicStyle: ButtonStyle {
    var solid = false
    func makeBody(configuration: Configuration) -> some View {
        let shape = RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous)
        return configuration.label
            .thusoFont(ThusoType.body, weight: .semibold)
            .foregroundStyle(solid ? ThusoTheme.surface : ThusoTheme.danger)
            .frame(maxWidth: .infinity, minHeight: 48)
            .padding(.horizontal, ThusoSpacing.space16)
            .background(solid ? ThusoTheme.danger : (configuration.isPressed ? ThusoTheme.dangerSoft : ThusoTheme.surface), in: shape)
            .overlay(shape.stroke(ThusoTheme.danger, lineWidth: 2))
            .contentShape(shape)
    }
}

struct VisitSafetyPanel: View {
    let reference: String
    @ObservedObject private var store = FieldSafetyStore.shared
    @State private var extending = false
    @State private var reasonId: String?
    @State private var confirming = false
    @State private var refused: FieldSafetyRefusal?

    var body: some View {
        if let timer = store.timer(for: reference) {
            panel(timer)
                .onAppear { store.startClock() }
        }
    }

    @ViewBuilder private func panel(_ timer: FieldSafety.VisitTimer) -> some View {
        let standing = timer.standing(at: store.now)
        let panic = store.panic(for: reference)
        SurfacePanel(spacing: ThusoSpacing.space12) {
            HStack(alignment: .top, spacing: ThusoSpacing.space12) {
                RoundedRectangle(cornerRadius: 2, style: .continuous)
                    .fill(standing == .overdue ? ThusoTheme.danger : (standing == .closed ? ThusoTheme.line : ThusoTheme.stone))
                    .frame(width: 3)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
                    Text(FieldSafety.NurseText.heading + " · " + FieldSafety.label(FieldSafety.timerStates, standing.rawValue))
                        .thusoFont(ThusoType.caption, weight: .medium).foregroundStyle(ThusoTheme.faint)
                    Text(headline(timer, standing))
                        .thusoFont(ThusoType.sectionTitle, weight: .semibold).foregroundStyle(ThusoTheme.charcoal).monospacedDigit()
                    if standing != .closed {
                        Text(detail(timer, standing))
                            .thusoFont(ThusoType.caption, weight: standing == .overdue ? .medium : .regular)
                            .foregroundStyle(standing == .overdue ? ThusoTheme.danger : ThusoTheme.faint)
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .accessibilityElement(children: .combine)
            if standing != .closed {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: ThusoSpacing.space8) { nurseControls }
                    VStack(spacing: ThusoSpacing.space8) { nurseControls }
                }
            }
            Button { confirming = true; refused = nil } label: {
                Label(FieldSafety.PanicText.press, systemImage: "light.beacon.max")
            }
            .buttonStyle(FieldSafetyPanicStyle())
            .accessibilityIdentifier("field-safety-panic")
            if extending && standing != .closed { extendForm(timer) }
            if confirming { confirmation }
            if let panic, !confirming { pressed(panic) }
            if let refused {
                Text(refused.statement).thusoFont(ThusoType.caption, weight: .medium).foregroundStyle(ThusoTheme.danger)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    @ViewBuilder private var nurseControls: some View {
        Button(FieldSafety.NurseText.checkIn) { refused = store.checkIn(reference) }
            .buttonStyle(QuietButton())
        Button(FieldSafety.NurseText.extend) { extending.toggle(); refused = nil }
            .buttonStyle(QuietButton())
            .accessibilityAddTraits(extending ? .isSelected : [])
        Button(FieldSafety.NurseText.checkOut) { refused = store.checkOut(reference); extending = false }
            .buttonStyle(QuietButton())
    }

    @ViewBuilder private func extendForm(_ timer: FieldSafety.VisitTimer) -> some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            Text(FieldSafety.NurseText.extendQuestion)
                .thusoFont(ThusoType.cardTitle, weight: .medium).foregroundStyle(ThusoTheme.charcoal)
            ForEach(FieldSafety.extensionReasons) { reason in
                TickRow(title: reason.label, ticked: reasonId == reason.id) { reasonId = reason.id }
            }
            if timer.stepsOffered.isEmpty {
                /* The ceiling says so in the sentence on the route, rather than as buttons that do nothing. */
                Text(FieldSafety.refusal("extension-limit").statement)
                    .thusoFont(ThusoType.caption).foregroundStyle(ThusoTheme.faint)
            } else {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: ThusoSpacing.space8) { steps(timer) }
                    VStack(spacing: ThusoSpacing.space8) { steps(timer) }
                }
                Text(FieldSafety.fill(FieldSafety.NurseText.extendLeft, ["minutes": String(timer.extensionLeft)]))
                    .thusoFont(ThusoType.caption).foregroundStyle(ThusoTheme.faint)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    @ViewBuilder private func steps(_ timer: FieldSafety.VisitTimer) -> some View {
        ForEach(timer.stepsOffered, id: \.self) { step in
            Button(FieldSafety.fill(FieldSafety.NurseText.extendStep, ["minutes": String(step)])) {
                refused = store.extend(reference, minutes: step, reasonId: reasonId)
                if refused == nil { extending = false; reasonId = nil }
            }
            .buttonStyle(QuietButton())
        }
    }

    private var confirmation: some View {
        let shape = RoundedRectangle(cornerRadius: ThusoRadius.card, style: .continuous)
        let ends = FieldSafety.clock(store.now.addingTimeInterval(FieldSafety.minutes(FieldSafety.panicWindowMinutes)))
        return VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            Text(FieldSafety.PanicText.confirmQuestion).thusoFont(ThusoType.cardTitle, weight: .semibold)
            Text(FieldSafety.fill(FieldSafety.PanicText.whatHappens, ["ends": ends])).thusoFont(ThusoType.body)
            Text(FieldSafety.PanicText.whatDoesNotHappen).thusoFont(ThusoType.body)
            CapabilityNotice(of: "emergency")
            Button {
                refused = store.pressPanic(reference)
                if refused == nil { confirming = false }
            } label: {
                Label(FieldSafety.PanicText.confirm, systemImage: "light.beacon.max")
            }
            .buttonStyle(FieldSafetyPanicStyle(solid: true))
            .accessibilityIdentifier("field-safety-panic-confirm")
            Button(FieldSafety.PanicText.cancel) { confirming = false }
                .buttonStyle(QuietButton())
        }
        .foregroundStyle(ThusoTheme.charcoal)
        .fixedSize(horizontal: false, vertical: true)
        .padding(ThusoSpacing.space16)
        .background(ThusoTheme.dangerSoft, in: shape)
        .overlay(shape.stroke(ThusoTheme.danger, lineWidth: 2))
    }

    private func pressed(_ panic: FieldSafety.Panic) -> some View {
        let sharing = panic.isSharing(at: store.now)
        let ends = FieldSafety.clock(panic.sharingEndsAt)
        let title = FieldSafety.label(FieldSafety.panicStates, panic.standing) + " · "
            + FieldSafety.fill(FieldSafety.PanicText.pressedAt, ["at": FieldSafety.clock(panic.raisedAt)])
        return VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
            Text(title).thusoFont(ThusoType.body, weight: .semibold)
            Text(sharing ? FieldSafety.fill(FieldSafety.PanicText.sharingUntil, ["ends": ends])
                         : FieldSafety.fill(FieldSafety.PanicText.sharingStopped, ["ended": ends]))
                .thusoFont(ThusoType.body)
            if !sharing && panic.resolvedAt == nil {
                Text(FieldSafety.PanicText.pressAgain).thusoFont(ThusoType.body)
            }
        }
        .foregroundStyle(ThusoTheme.charcoal)
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(ThusoSpacing.space12)
        .background(ThusoTheme.dangerSoft, in: RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    private func headline(_ timer: FieldSafety.VisitTimer, _ standing: FieldSafety.Standing) -> String {
        if standing == .closed, let closed = timer.closedAt {
            return FieldSafety.fill(timer.closedBySigning ? FieldSafety.NurseText.closedBySigning : FieldSafety.NurseText.closedByNurse,
                                    ["at": FieldSafety.clock(closed)])
        }
        return FieldSafety.fill(FieldSafety.NurseText.due, ["due": FieldSafety.clock(timer.dueAt)])
    }

    private func detail(_ timer: FieldSafety.VisitTimer, _ standing: FieldSafety.Standing) -> String {
        let base = standing == .overdue
            ? FieldSafety.fill(FieldSafety.NurseText.overdue, ["since": FieldSafety.clock(timer.dueAt)])
            : FieldSafety.fill(FieldSafety.NurseText.left, ["minutes": String(timer.minutesLeft(at: store.now))])
        if let episode = timer.overdue, episode.silencedReasonId == nil, let answered = episode.answeredAt {
            return base + " " + FieldSafety.fill(FieldSafety.NurseText.answered, ["at": FieldSafety.clock(answered)])
        }
        /* Her word that she is safe is shown back with the sentence that it moved nothing, so a nurse never reads
           "I am safe" as more time. */
        guard let said = timer.checkIns.last else { return base }
        return base + " " + FieldSafety.fill(FieldSafety.NurseText.saidSafe, ["at": FieldSafety.clock(said)])
    }
}

struct SafetyDeskSection: View {
    @ObservedObject private var store = FieldSafetyStore.shared

    var body: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            DeckSectionHead(title: FieldSafety.DeskText.heading, count: String(store.openCount),
                            note: FieldSafety.fill(FieldSafety.DeskText.waiting, ["waiting": String(store.waitingCount), "open": String(store.openCount)]))
            CapabilityNotice(of: "emergency")
            CapabilityNotice(of: "dispatch")
            if store.openCount == 0 {
                Text(FieldSafety.DeskText.empty).thusoFont(ThusoType.body).foregroundStyle(ThusoTheme.faint)
                    .fixedSize(horizontal: false, vertical: true)
            }
            ForEach(store.desk) { row in SafetyDeskRowView(row: row) }
        }
        .onAppear { store.startClock() }
    }
}

struct SafetyDeskRowView: View {
    let row: FieldSafety.DeskRow
    @ObservedObject private var store = FieldSafetyStore.shared
    @State private var choice = ""
    @State private var refused: FieldSafetyRefusal?

    /* A rule and a word for the kind, never colour alone: danger for a panic nobody holds, mango ink for
       an overdue nobody holds, faint for what the desk already has, and nothing once it is closed. */
    private var rule: Color {
        !row.open ? .clear : (row.acknowledgedAt != nil ? ThusoTheme.faint : (row.isPanic ? ThusoTheme.danger : ThusoTheme.mangoInk))
    }
    private var standing: String {
        if !row.open { return FieldSafety.fill(FieldSafety.DeskText.closedLine, ["outcome": row.outcome ?? ""]) }
        if let picked = row.acknowledgedAt { return FieldSafety.fill(FieldSafety.DeskText.pickedUp, ["at": FieldSafety.clock(picked)]) }
        return FieldSafety.DeskText.notPickedUp
    }

    var body: some View {
        SurfacePanel(tone: row.open ? .plain : .quiet, padding: ThusoSpacing.space16, spacing: ThusoSpacing.space8) {
            HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space8) {
                RoundedRectangle(cornerRadius: 2, style: .continuous).fill(rule).frame(width: 3, height: 16).accessibilityHidden(true)
                Text(row.isPanic ? FieldSafety.DeskText.kindPanic : FieldSafety.DeskText.kindOverdue)
                    .thusoFont(ThusoType.caption, weight: .semibold).foregroundStyle(ThusoTheme.charcoal)
                Text(row.id).thusoFont(ThusoType.caption).monospacedDigit().foregroundStyle(ThusoTheme.faint)
                Spacer(minLength: ThusoSpacing.space8)
                Text(FieldSafety.fill(FieldSafety.DeskText.age, ["minutes": String(row.ageMinutes)]))
                    .thusoFont(ThusoType.caption).monospacedDigit().foregroundStyle(ThusoTheme.charcoal)
            }
            VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
                Text(row.nurse).thusoFont(ThusoType.cardTitle, weight: .semibold)
                    .foregroundStyle(row.open ? ThusoTheme.charcoal : ThusoTheme.faint)
                Text(row.suburb + " · " + FieldSafety.fill(FieldSafety.DeskText.raisedAt, ["at": FieldSafety.clock(row.raisedAt)]))
                    .thusoFont(ThusoType.caption).foregroundStyle(ThusoTheme.faint)
                Text(standing).thusoFont(ThusoType.caption).foregroundStyle(row.open ? ThusoTheme.charcoal : ThusoTheme.faint)
                if row.open, let answered = row.answeredAt {
                    Text(FieldSafety.fill(FieldSafety.DeskText.answered, ["at": FieldSafety.clock(answered)]))
                        .thusoFont(ThusoType.caption).foregroundStyle(ThusoTheme.charcoal)
                }
            }
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityElement(children: .combine)
            if row.isPanic { position }
            if row.open { actions }
            if let refused {
                Text(refused.statement).thusoFont(ThusoType.caption, weight: .medium).foregroundStyle(ThusoTheme.danger)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityIdentifier("field-safety-desk-" + row.id)
    }

    @ViewBuilder private var position: some View {
        switch store.position(of: row.id) {
        case .shared(let at):
            VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
                Text(FieldSafety.DeskText.position).thusoFont(ThusoType.caption, weight: .medium).foregroundStyle(ThusoTheme.faint)
                if let at {
                    let updated = FieldSafety.fill(FieldSafety.DeskText.positionUpdated, ["seconds": String(max(0, Int(store.now.timeIntervalSince(at.at))))])
                    let until = FieldSafety.fill(FieldSafety.DeskText.sharingUntil, ["ends": FieldSafety.clock(row.sharingEndsAt ?? store.now)])
                    Text(row.suburb + " · " + String(at.lat) + ", " + String(at.lng))
                        .thusoFont(ThusoType.body, weight: .medium).monospacedDigit().foregroundStyle(ThusoTheme.charcoal)
                    Text(updated + " · " + until).thusoFont(ThusoType.caption).foregroundStyle(ThusoTheme.faint)
                } else {
                    Text(FieldSafety.DeskText.positionNotYet).thusoFont(ThusoType.body).foregroundStyle(ThusoTheme.charcoal)
                }
            }
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(ThusoSpacing.space12)
            .background(ThusoTheme.surface, in: RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous).stroke(ThusoTheme.line))
        case .ended(let sentence):
            Text(sentence).thusoFont(ThusoType.caption).foregroundStyle(ThusoTheme.charcoal)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder private var actions: some View {
        if row.acknowledgedAt == nil {
            Button(FieldSafety.DeskText.pickUp) { refused = store.pickUp(row) }
                .buttonStyle(CareButton())
        } else {
            PickRow(label: row.isPanic ? FieldSafety.DeskText.outcomeQuestion : FieldSafety.DeskText.reasonQuestion,
                    selection: $choice,
                    options: [(value: "", title: FieldSafety.DeskText.choose)]
                        + (row.isPanic ? FieldSafety.outcomes : FieldSafety.silenceReasons).map { option in (value: option.id, title: option.label) })
            Button(row.isPanic ? FieldSafety.DeskText.resolve : FieldSafety.DeskText.close) {
                let picked: String? = choice.isEmpty ? nil : choice
                refused = row.isPanic ? store.resolve(row.id, outcomeId: picked) : store.closeOverdue(row.id, reasonId: picked)
            }
            .buttonStyle(CareButton())
        }
    }
}
