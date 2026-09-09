import SwiftUI

/* What a nurse has done that has not left her phone — the whole visit, not only the readings.
 *
 * The readings had a queue and a screen. The rest of the visit — the code checked at the door, the
 * consent read aloud, what she found, her signature — lived in the assessment form's own state,
 * which meant the last thing that happens in a house was the least protected thing in the product.
 *
 * Three things this has to say, and they are the three a queue usually gets wrong:
 *
 *   WHAT IS HELD, in her words rather than in states. "Consent" and "What you found", not four rows
 *   of an enum. The contract's six states are underneath and are shown; they are not the headline.
 *
 *   WHAT SHE CAN STILL DO. A screen that only says "no signal" has told a nurse standing in a
 *   kitchen that she is stuck, which is untrue and is the reason people start writing on paper. She
 *   can finish, sign, and start the next visit. What she cannot do is rely on anybody else having
 *   seen it, and that is said in the same breath rather than left to be assumed.
 *
 *   WHAT IT SURVIVES, itemised, and what it does not. apps/web/src/features/VisitQueue.tsx has to
 *   admit that its queue is held in memory and is lost by a reload, because the web app is forbidden
 *   browser storage. iOS is not, and this one writes to a file — so the honest sentence here is a
 *   different sentence, and it is below rather than copied from a platform whose limitation this is
 *   not. */

struct VisitQueueView: View {
    @ObservedObject private var queue = VisitQueueStore.shared
    @ObservedObject private var vetting = VettingStore.shared
    @State private var sending = false
    @State private var result = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space20) {
                DemoBadge()
                SurfaceHeading(eyebrow: "Offline capture", title: "Your work is on this phone.",
                               subtitle: "Every piece of a visit waits here, not just the readings. Nothing that has been captured is dropped to make a send succeed.")
                standing
                counts
                if !queue.held.isEmpty {
                    CareSectionHeader("Held on this phone")
                    Text("Not sealed yet, because the visit is not finished. Signing the assessment seals everything it holds at once.")
                        .font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(0.72))
                        .fixedSize(horizontal: false, vertical: true)
                    ForEach(queue.held) { PartCard(part: $0) }
                }
                sealedSection
                if !queue.conflicted.isEmpty { conflictedSection }
                if queue.pretendNoSignal { meanwhile }
                if !queue.stored.isEmpty {
                    CareSectionHeader("This phone’s copy of the record")
                    ForEach(queue.stored) { PartCard(part: $0) }
                }
                whatItSurvives
                storeStatus
                controls
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle("The visit, waiting").navigationBarTitleDisplayMode(.inline)
    }

    // MARK: The one line she is looking for

    private var standing: some View {
        SurfacePanel(tone: .lead) {
            HStack(spacing: ThusoSpacing.space12) {
                Image(systemName: queue.pretendNoSignal ? "icloud.slash" : "icloud")
                    .font(.title3).foregroundStyle(ThusoTheme.charcoal).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 3) {
                    Text(queue.pretendNoSignal ? "No signal" : "Connected")
                        .thusoFont(ThusoType.cardTitle, weight: .semibold).foregroundStyle(ThusoTheme.charcoal)
                    Text(queue.pending.isEmpty
                         ? "Nothing is waiting. Everything you have done has reached the record."
                         : "\(queue.pending.count) piece\(queue.pending.count == 1 ? "" : "s") of work held on this phone")
                        .font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(0.8))
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            .accessibilityElement(children: .combine)
            if let oldest = queue.oldestPending {
                Text("The oldest of them was \(writtenInWords(oldest)).")
                    .font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(0.8))
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text(CaptureRules.queuedIsNotLost).font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(0.8))
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    /* The whole count rather than this screen's share of it: the readings the Thuso Kit surface
       holds are the same nurse's work, so "what is waiting" is one number wherever she reads it. */
    private var counts: some View {
        SurfacePanel {
            ThusoMetrics {
                ThusoMetric(value: "\(queue.held.count)", label: "Held, not sealed")
                ThusoMetric(value: "\(queue.sealed.count)", label: "Waiting to send")
                ThusoMetric(value: "\(queue.conflicted.count)", label: "Needs a decision",
                            flagged: !queue.conflicted.isEmpty)
                ThusoMetric(value: "\(CaptureStore.shared.onlyHereCount)", label: "Readings on this phone")
            }
        }
    }

    @ViewBuilder private var sealedSection: some View {
        if queue.sealed.isEmpty {
            if queue.held.isEmpty {
                Text("Nothing is sealed. An empty queue means every piece of this visit has been answered for.")
                    .font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(0.72))
                    .fixedSize(horizontal: false, vertical: true)
            }
        } else {
            CareSectionHeader("Sealed, waiting for a connection")
            ForEach(queue.sealed) { PartCard(part: $0) }
            if queue.pretendNoSignal {
                Text("Sending needs a connection. Nothing is dropped to make a send succeed and nothing is retried behind your back.")
                    .font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(0.72))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    @ViewBuilder private var conflictedSection: some View {
        CareSectionHeader("Needs a decision")
        SurfacePanel(tone: .quiet) {
            Label {
                Text(CaptureRules.conflictsAreNotMerged).font(.footnote).foregroundStyle(ThusoTheme.charcoal)
                    .fixedSize(horizontal: false, vertical: true)
            } icon: { Image(systemName: "arrow.triangle.merge").foregroundStyle(ThusoTheme.charcoal) }
            .accessibilityElement(children: .combine)
        }
        ForEach(queue.conflicted) { PartCard(part: $0) }
        Text("Nothing here is filed and nothing is thrown away. A reading two clinicians disagree about is settled on the Thuso Kit surface, where both versions can be put side by side; a whole assessment that arrives against a signed record goes to the Control Tower.")
            .font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(0.72))
            .fixedSize(horizontal: false, vertical: true)
    }

    /* What she can still do, said beside what she cannot. */
    private var meanwhile: some View {
        SurfacePanel {
            PanelHead("You can still")
            ForEach(["Finish this visit and sign it off. The signature is real work and it is kept.",
                     "Take readings from a paired instrument, which queue the same way.",
                     "Start the next visit on your list. Two visits queue separately and never answer for each other.",
                     "Open the consultation record this visit produced and write it up."], id: \.self) { line in
                Label(line, systemImage: "checkmark").font(.footnote).foregroundStyle(ThusoTheme.charcoal)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Hairline()
            PanelHead("Until it sends, nobody else has it")
            ForEach(["None of it is in the patient’s Health Passport.",
                     "No doctor can read it, so no prescription, sick note or referral can follow from it.",
                     "The Control Tower does not know this visit is done."], id: \.self) { line in
                Label(line, systemImage: "xmark").font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(0.8))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    /* Accurate, itemised, and it names what it does not do. A promise a screen cannot keep is worse
       than no promise, and "your data is safe" is the emptiest sentence in software. This is the
       paragraph the web cannot write, and it is written from what the file actually does. */
    private var whatItSurvives: some View {
        SurfacePanel {
            PanelHead("What this store survives",
                      note: "The whole visit, in a file on this phone — not only the readings.")
            ForEach(["A crash or a force-quit. Each piece is written the moment it is finished, not when the app closes.",
                     "A restart of the phone.",
                     "A sign-out. This preview’s sign-out returns to the first-run flow and never touches the file — the work belongs to the visit, not to the session."], id: \.self) { line in
                Label(line, systemImage: "checkmark").font(.footnote).foregroundStyle(ThusoTheme.charcoal)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Hairline()
            ForEach(["Deleting the app. iOS removes the file with it, and nothing here can prevent that.",
                     "Losing the phone. The file is deliberately kept out of device backups: a consent, seven readings and a signature are special personal information, and syncing them into somebody’s laptop backup is a disclosure nobody consented to. The answer to a lost phone is to send, not to back up.",
                     "A second device. Nothing is shared between phones; there is no server in this build to share it through."], id: \.self) { line in
                Label(line, systemImage: "xmark").font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(0.8))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    /* offlineNeverServesStaleSilently. Everything on this screen came out of a file, so the screen
       says when that file was written before it says anything else about what is in it. */
    private var storeStatus: some View {
        SurfacePanel(tone: .quiet) {
            PanelHead("Read from this phone’s own store")
            Text(queue.ledgerWrittenAt.map { "Everything above was \(writtenInWords($0)). It is what this phone holds, not an answer from a server — there is no server in this build, and a local copy offered as though it were a fresh answer is the failure this line exists to prevent." }
                 ?? "Nothing has been written to this phone’s store yet.")
                .font(.footnote).foregroundStyle(ThusoTheme.charcoal)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.updatesFrequently)
            if !queue.storeNote.isEmpty {
                Text(queue.storeNote).font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(0.8))
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let setAside = queue.setAside {
                Label("A ledger that would not parse was kept as \(setAside) rather than deleted.", systemImage: "archivebox")
                    .font(.footnote).foregroundStyle(ThusoTheme.charcoal)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text(queue.ledgerPath).font(.system(.footnote, design: .monospaced))
                .foregroundStyle(ThusoTheme.charcoal.opacity(0.72)).textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var controls: some View {
        SurfacePanel {
            PanelHead("Design-review controls",
                      note: "There is no radio in this build and no doctor to sign anything, so the two things that make a queue worth designing have to be askable for.")
            /* .frame(minHeight:) on each, because a Toggle in a stack is as tall as its own row
               and its row is twenty-eight points. The two entries in Audit.knownUndersized are
               about a Toggle inside a List, where the height is UIKit's and nothing SwiftUI does
               reaches it; this is not that case, so it is fixed rather than exempted. */
            Toggle("Show this phone with no signal", isOn: $queue.pretendNoSignal)
                .font(.subheadline).tint(ThusoTheme.charcoal)
                .frame(minHeight: 44).contentShape(Rectangle())
            Toggle("A doctor has signed this visit", isOn: $queue.pretendDoctorSigned)
                .font(.subheadline).tint(ThusoTheme.charcoal)
                .frame(minHeight: 44).contentShape(Rectangle())
            Button(sending ? "Sending…" : "Attempt to send", action: send)
                .buttonStyle(CareButton()).disabled(sending)
            if sending {
                Button("Interrupt the send") { queue.interruptSend(); sending = false
                    result = "The send was interrupted. Everything went back to the queue rather than anywhere else." }
                    .buttonStyle(QuietButton())
            }
            if !result.isEmpty {
                Text(result).font(.footnote).foregroundStyle(ThusoTheme.charcoal)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.updatesFrequently)
            }
            Hairline()
            Text("Signing out of this preview goes nowhere near the file. This drops everything held in memory and reads it again from nothing, which is what a cold launch does — the count above should not move.")
                .font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(0.8))
                .fixedSize(horizontal: false, vertical: true)
            Button("Sign out and read the file again") { queue.reloadFromDisk() }.buttonStyle(QuietButton())
            Button("Clear this phone’s store and start again") { queue.resetToFixtures() }
                .font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.danger)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
        }
    }

    private func send() {
        sending = true
        Task {
            /* The queue does not keep its own idea of who is cleared. It asks the same vetting
               record dispatch and the capture ledger ask, so a nurse declined in the console a
               moment ago is a nurse this send stops on. */
            let said = await queue.attemptSend { subjectId in
                guard let subject = vetting.subject(subjectId) else {
                    return (false, "There is no vetting record for this person, so nothing can be filed on their authority.")
                }
                let decision = can(subject, "write-clinical-note")
                return (decision.allowed, decision.reason)
            }
            result = said
            sending = false
        }
    }
}

// MARK: - The strip over the assessment

/* One line, above the work, on every stage of the assessment. It is the answer to "has any of this
   left the phone" — a question a nurse asks by glancing rather than by opening something.
 *
 * This is the one thing on the nurse's side of the app that genuinely floats over content, so it is
 * the one thing that is glass. `.ultraThinMaterial` is the platform's own frosted surface and costs
 * a fraction of the web's backdrop-filter; with Reduce Transparency on it resolves to `glassFloor`,
 * which is the colour every contrast figure in tokens.json was computed against rather than a
 * lesser version of it. It carries text, so it is never over text: it is inset above the form
 * rather than laid across it. */
struct CaptureStandingStrip: View {
    @ObservedObject private var queue = VisitQueueStore.shared
    @ObservedObject private var kit = CaptureStore.shared
    /// One nurse, one queue, however many files it is kept in.
    private var waiting: Int { queue.pending.count + kit.onlyHereCount }
    var body: some View {
        NavigationLink { VisitQueueView() } label: {
            HStack(spacing: ThusoSpacing.space12) {
                Image(systemName: queue.pretendNoSignal ? "icloud.slash" : "icloud")
                    .foregroundStyle(ThusoTheme.charcoal).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 1) {
                    Text(queue.pretendNoSignal ? "No signal" : "Connected")
                        .font(.footnote.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                    Text(waiting == 0
                         ? "Nothing is waiting. Everything you have done has reached the record."
                         : "\(waiting) piece\(waiting == 1 ? "" : "s") of work held on this phone")
                        .font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(0.8))
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold))
                    .foregroundStyle(ThusoTheme.charcoal.opacity(0.72)).accessibilityHidden(true)
            }
            .padding(.horizontal, ThusoSpacing.space16).padding(.vertical, ThusoSpacing.space8)
            .frame(maxWidth: .infinity, minHeight: 48)
            .frosted(radius: ThusoRadius.control)
            .padding(.horizontal, ThusoSpacing.space16).padding(.bottom, ThusoSpacing.space8)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }
}

// MARK: - One piece of a visit

/* Two clocks, always both. The phone's is labelled as what the phone believed; the receipt is what
   everything is ordered by, and where there is none the row says nothing has ordered it yet rather
   than showing the first time as though it were the second. */
struct PartCard: View {
    let part: VisitPart
    var body: some View {
        SurfacePanel {
            HStack(alignment: .top, spacing: ThusoSpacing.space12) {
                Image(systemName: part.kind.symbol).font(.subheadline)
                    .foregroundStyle(ThusoTheme.charcoal).frame(width: 24).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(part.kind.name).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(part.summary).font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(0.72))
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: ThusoSpacing.space8)
                MetricChip(text: part.state.name, flagged: part.state == .conflicted)
            }
            .accessibilityElement(children: .combine)
            Text("\(part.visitReference) · \(part.patient)").font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(0.72))
            Hairline()
            ForEach(part.detail) { fact in FactRow(label: fact.label, value: fact.value) }
            FactRow(label: "On this phone since", value: writtenInWords(part.deviceCapturedAt))
            if let received = part.serverReceivedAt {
                FactRow(label: "Server receipt · what this is ordered by", value: writtenInWords(received))
            } else {
                Text("Not received yet, so this has no time it happened — only a time this phone believed.")
                    .font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(0.72))
                    .fixedSize(horizontal: false, vertical: true)
            }
            if part.isPending {
                Text(part.kind.whileHeld).font(.footnote).foregroundStyle(ThusoTheme.charcoal)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let conflict = part.conflict {
                StatedFact(term: conflict.name, statement: conflict.detail, footnote: part.note)
            } else if let note = part.note {
                Text(note).font(.footnote).foregroundStyle(ThusoTheme.charcoal)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}
