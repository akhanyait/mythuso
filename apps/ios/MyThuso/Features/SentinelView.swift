import SwiftUI

/* Sentinel and safeguarding on iOS, where a nurse carries them: under her kit, the patient's baselines, why nothing is
 * evaluated, a tier raised by hand and the sentence tier four is refused in; and a safeguarding concern recorded by
 * choosing who it is about and the kind, with nothing typed. The Control Tower's safeguarding list is web-only, because
 * the desk works at a desk.
 *
 * Every sentence is SentinelData.swift's, generated from packages/catalog/sentinel.json and
 * packages/catalog/apis/safety.json, and every state is Sentinel.swift's arithmetic. No reading's value is on any of
 * these screens, and the kind of concern is never shown again after it is chosen. */

struct SentinelSection: View {
    let patient: String
    var now = Date()
    @ObservedObject private var store = SentinelStore.shared
    @State private var entryId: String?
    @State private var rung: Int?
    @State private var refused: SentinelRefusal?
    @State private var notice = ""

    var body: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            DeckSectionHead(title: Sentinel.SentinelText.heading, count: "\(store.baselines.count)", note: Sentinel.SentinelText.intro)
            CareCard {
                Text(Sentinel.fill(Sentinel.SentinelText.patient, ["patient": patient]))
                    .font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(DeckInk.sheetInk)
                StatusPill(text: Sentinel.SentinelText.evaluation, tone: "quiet")
                Text(Sentinel.RuleText.notEvaluated).font(.thuso(.footnote)).foregroundStyle(DeckInk.sheetInk)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .accessibilityIdentifier("sentinel-evaluation")
            ForEach(store.views(now: now)) { view in
                CareCard { baselineCard(view) }
                    .accessibilityIdentifier("sentinel-baseline-\(view.metric)")
            }
            note(Sentinel.RuleText.suspendedMeans, symbol: "pause.circle")
            note(Sentinel.RuleText.recalledMeans, symbol: "xmark.shield")
            note(Sentinel.fill(Sentinel.SentinelText.staleFrom, ["interval": Devices.intervalText(minutes: Devices.staleAfterMinutes)]), symbol: "clock")
            CareCard { raiseForm }
            CareCard { tierFour }
            raisedList
            NavigationLink { SafeguardingReportView(patient: patient) } label: {
                Label(Sentinel.ReportText.heading, systemImage: "hand.raised")
            }
            .buttonStyle(QuietButton())
            note(Sentinel.RuleText.preview, symbol: "antenna.radiowaves.left.and.right.slash")
        }
    }

    private func stateTone(_ id: String) -> String {
        switch id { case "suspended": return "amber"; case "formed": return "teal"; default: return "quiet" }
    }
    private func toldTone(_ code: String) -> String {
        switch code { case "core-loop": return "danger"; case "nurse-queue": return "amber"; default: return "quiet" }
    }
    private func note(_ text: String, symbol: String) -> some View {
        Label(text, systemImage: symbol).font(.thuso(.footnote)).foregroundStyle(DeckInk.sheetQuiet)
            .fixedSize(horizontal: false, vertical: true)
    }

    @ViewBuilder private func baselineCard(_ view: Sentinel.BaselineView) -> some View {
        HStack(spacing: ThusoSpacing.space8) {
            Text(Devices.measureLabel(view.metric)).font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(DeckInk.sheetInk)
            Spacer(minLength: 6)
            StatusPill(text: Sentinel.label(Sentinel.baselineStates, view.stateId), tone: stateTone(view.stateId))
        }
        .accessibilityElement(children: .combine)
        Text(Sentinel.fill(Sentinel.SentinelText.counted, ["counted": "\(view.counted)", "needed": "\(view.needed)", "days": "\(view.windowDays)"]))
            .font(.thuso(.footnote)).foregroundStyle(DeckInk.sheetInk)
            .fixedSize(horizontal: false, vertical: true)
        if let since = view.suspendedSince {
            Text(Sentinel.fill(Sentinel.SentinelText.suspendedSince, ["time": captureStamp(since)]))
                .font(.thuso(.footnote)).foregroundStyle(ThusoRole.warningInk)
        }
        if view.leftByRecall > 0 {
            Text(Sentinel.fill(Sentinel.SentinelText.leftByRecall, ["count": "\(view.leftByRecall)"]))
                .font(.thuso(.footnote)).foregroundStyle(ThusoRole.dangerInk)
        }
    }

    @ViewBuilder private var raiseForm: some View {
        Text(Sentinel.SentinelText.raiseHeading).font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(DeckInk.sheetInk)
        Text(Sentinel.SentinelText.raiseIntro).font(.thuso(.footnote)).foregroundStyle(DeckInk.sheetQuiet)
            .fixedSize(horizontal: false, vertical: true)
        SentinelChoice(title: Sentinel.SentinelText.entry, selection: $entryId,
                       options: store.entries.map { (id: $0.id, label: "\(Devices.measureLabel($0.metric)) · \(captureStamp($0.heardAt))") })
        ForEach(Sentinel.rungs) { option in
            Button {
                rung = option.rung
                refused = nil
            } label: {
                HStack(alignment: .top, spacing: ThusoSpacing.space8) {
                    Image(systemName: rung == option.rung ? "largecircle.fill.circle" : "circle").foregroundStyle(DeckInk.sheetInk)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(option.label).font(.thuso(.footnote, weight: .semibold)).foregroundStyle(DeckInk.sheetInk)
                        Text(option.whoIsTold).thusoFont(ThusoType.caption).foregroundStyle(DeckInk.sheetQuiet)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(rung == option.rung ? .isSelected : [])
        }
        Button(Sentinel.SentinelText.raise) {
            if let refusal = store.raise(entryId: entryId, rung: rung) { refused = refusal; return }
            refused = nil
            if let latest = store.raised.first {
                notice = "\(Sentinel.fill(Sentinel.SentinelText.raised, ["rung": "\(latest.rung.rung)", "time": captureStamp(latest.raisedAt)])) \(latest.rung.whoIsTold)"
            }
            entryId = nil
            rung = nil
        }
        .buttonStyle(CareButton())
        if let refused {
            Text(refused.statement).font(.thuso(.footnote, weight: .semibold)).foregroundStyle(ThusoRole.dangerInk)
                .fixedSize(horizontal: false, vertical: true)
        }
        if !notice.isEmpty {
            Text(notice).font(.thuso(.footnote)).foregroundStyle(DeckInk.sheetInk)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.updatesFrequently)
        }
    }

    @ViewBuilder private var tierFour: some View {
        Text(Sentinel.SentinelText.tierFourHeading).font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(DeckInk.sheetInk)
        Text(Sentinel.tierFourRefusal).font(.thuso(.footnote)).foregroundStyle(DeckInk.sheetInk)
            .fixedSize(horizontal: false, vertical: true)
        ForEach(Sentinel.tierFourNeeds, id: \.self) { need in
            Label(need, systemImage: "minus").font(.thuso(.footnote)).foregroundStyle(DeckInk.sheetQuiet)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder private var raisedList: some View {
        Text(Sentinel.SentinelText.raisedList).font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(DeckInk.sheetInk)
        if store.raised.isEmpty {
            Text(Sentinel.SentinelText.noneRaised).font(.thuso(.footnote)).foregroundStyle(DeckInk.sheetQuiet)
        }
        ForEach(store.raised) { item in
            HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space8) {
                StatusPill(text: item.rung.label, tone: toldTone(item.rung.toldCode))
                Text("\(Devices.measureLabel(item.metric)) · \(captureStamp(item.raisedAt))").font(.thuso(.footnote)).foregroundStyle(DeckInk.sheetQuiet)
            }
        }
    }
}

/* Recording a safeguarding concern. Nothing is typed: who it is about and the kind are chosen from the contract, and the
   button is never disabled, so a report without either is refused in the route's own sentence. Once recorded, the
   screen says it is open, held for an officer nobody holds yet and not sent, and never shows the kind again. */
struct SafeguardingReportView: View {
    let patient: String
    @ObservedObject private var store = SentinelStore.shared
    @State private var groupCode: String?
    @State private var categoryCode: String?
    @State private var recorded: Sentinel.Report?
    @State private var refused: SentinelRefusal?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
                CareCard {
                    Text(Sentinel.ReportText.intro).font(.thuso(.footnote)).foregroundStyle(DeckInk.sheetInk)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(Sentinel.fill(Sentinel.ReportText.patient, ["patient": patient]))
                        .font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(DeckInk.sheetInk)
                    SentinelChoice(title: Sentinel.ReportText.group, selection: $groupCode,
                                   options: Sentinel.groups.map { (id: $0.id, label: $0.label) })
                    SentinelChoice(title: Sentinel.ReportText.category, selection: $categoryCode,
                                   options: Sentinel.categories.map { (id: $0.id, label: $0.label) })
                    Text(Sentinel.RuleText.categoryIsProtected).font(.thuso(.footnote)).foregroundStyle(DeckInk.sheetQuiet)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(Sentinel.RuleText.noNarrative).font(.thuso(.footnote)).foregroundStyle(DeckInk.sheetQuiet)
                        .fixedSize(horizontal: false, vertical: true)
                    Button(Sentinel.ReportText.record) {
                        let result = store.record(groupCode: groupCode, categoryCode: categoryCode)
                        refused = result.refusal
                        if let report = result.report {
                            recorded = report
                            groupCode = nil
                            categoryCode = nil
                        }
                    }
                    .buttonStyle(CareButton())
                    if let refused {
                        Text(refused.statement).font(.thuso(.footnote, weight: .semibold)).foregroundStyle(ThusoRole.dangerInk)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                if let recorded {
                    CareCard {
                        Text(Sentinel.fill(Sentinel.ReportText.recorded, ["time": captureStamp(recorded.recordedAt)]))
                            .font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(DeckInk.sheetInk)
                        Label(Sentinel.RuleText.notSent, systemImage: "exclamationmark.shield")
                            .font(.thuso(.footnote, weight: .semibold)).foregroundStyle(ThusoRole.dangerInk)
                            .fixedSize(horizontal: false, vertical: true)
                        if let applies = Sentinel.statutoryMayApply.first(where: { $0.id == recorded.groupCode }) {
                            Text(applies.sentence).font(.thuso(.footnote)).foregroundStyle(DeckInk.sheetInk)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        ForEach([Sentinel.RuleText.heldFor, Sentinel.RuleText.neverAutoCloses, Sentinel.RuleText.reporterNeverShown], id: \.self) { sentence in
                            Text(sentence).font(.thuso(.footnote)).foregroundStyle(DeckInk.sheetQuiet)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .accessibilityElement(children: .combine)
                }
                Label(Sentinel.RuleText.preview, systemImage: "antenna.radiowaves.left.and.right.slash")
                    .font(.thuso(.footnote)).foregroundStyle(DeckInk.sheetQuiet)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(ThusoSpacing.space16)
        }
        .thusoGround()
        .navigationTitle(Sentinel.ReportText.heading).navigationBarTitleDisplayMode(.inline)
    }
}

/* A menu whose label is the target, rather than a menu-style Picker.
 *
 * MyThusoUITests measured the Picker at 112x34 on iOS 26 with .frame(minHeight: 44) on it: the frame
 * makes the row taller, but the button iOS draws inside it keeps its own height, and that button is
 * what a thumb lands on and what the accessibility tree reports. A Menu's label is a view this file
 * owns, so the 44 points go on the thing that is tapped — the same shape AssessmentView's origin menu
 * already uses. The Picker inside keeps the checkmark beside the current choice. */
private struct SentinelChoice: View {
    let title: String
    @Binding var selection: String?
    let options: [(id: String, label: String)]

    private var chosen: String { options.first { $0.id == selection }?.label ?? "Choose…" }

    var body: some View {
        Menu {
            Picker(title, selection: $selection) {
                Text("Choose…").tag(String?.none)
                ForEach(options, id: \.id) { option in Text(option.label).tag(String?.some(option.id)) }
            }
        } label: {
            HStack(spacing: ThusoSpacing.space8) {
                Text(title).font(.thuso(.footnote, weight: .semibold)).foregroundStyle(DeckInk.sheetInk)
                Spacer(minLength: 0)
                Text(chosen).font(.thuso(.footnote)).foregroundStyle(DeckInk.sheetQuiet)
                    .multilineTextAlignment(.trailing)
                    .fixedSize(horizontal: false, vertical: true)
                Image(systemName: "chevron.up.chevron.down").font(.thuso(.footnote))
                    .foregroundStyle(DeckInk.sheetQuiet).accessibilityHidden(true)
            }
            .frame(maxWidth: .infinity, minHeight: 44)
            .contentShape(Rectangle())
        }
        .accessibilityLabel(title)
        .accessibilityValue(chosen)
    }
}
