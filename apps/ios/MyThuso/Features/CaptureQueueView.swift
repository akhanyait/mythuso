import SwiftUI

/* What is on this phone, what has gone, and what somebody still has to decide about.

   A nurse in a home with no signal is the primary user of this screen and she is usually reading it
   in a doorway with her bag on her shoulder, so it answers her question first — is my work safe? —
   and only then explains itself.

   Three rules are load-bearing here and each has a shape on the screen rather than a paragraph
   about it. Nothing is auto-merged and nothing is auto-discarded, so every conflict opens a page
   where both readings are visible and a person chooses. The phone’s clock is never presented as
   the time something happened, so every row carries two times and says which one orders the
   record. And nothing read out of this phone’s store is served without its age, in words, because
   a stale value that looks fresh is worse than no value at all.

   Every entry, patient and clinician is fictional, and nothing is transmitted anywhere. */

/// Who can be asked to settle a conflict: a cleared doctor, a cleared nurse, and a doctor whose
/// registration lapsed four days ago — because the refusal is as much a part of this as the
/// resolution.
private let resolverIds = ["D-401", "N-205", "D-402"]

struct CaptureQueueView: View {
    @ObservedObject private var kit = CaptureStore.shared
    @ObservedObject private var vetting = VettingStore.shared
    @State private var sendResult = ""
    @State private var sending = false

    private var needingDecision: [CapturedEntry] { kit.entries.filter { $0.state == .conflicted } }
    private var onThisPhone: [CapturedEntry] {
        kit.entries.filter { [.captured, .queued, .sending, .refused].contains($0.state) }
            .sorted { $0.writtenToPhoneAt > $1.writtenToPhoneAt }
    }
    /* Ordered by the receipt time, which is the only clock that orders anything. Sorting these by
       what the phones believed is precisely the bug deviceClockIsNotTruth exists to prevent. */
    private var inTheRecord: [CapturedEntry] {
        kit.entries.filter { $0.state == .stored }
            .sorted { ($0.serverReceivedAt ?? .distantPast) > ($1.serverReceivedAt ?? .distantPast) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
                DemoBadge()
                CareHeading(eyebrow: "Offline capture", title: "Your work is on this phone.",
                            subtitle: "Nothing that has been captured is dropped to make a sync succeed.")
                headline
                whatItSurvives
                storeStatus
                controls
                if !needingDecision.isEmpty {
                    SectionHeading(title: "Needs a decision · \(needingDecision.count)")
                    Text(CaptureRules.conflictsAreNotMerged).font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                    ForEach(needingDecision) { entry in
                        NavigationLink { ConflictResolutionView(entryId: entry.id) } label: { EntryCard(entry: entry, chevron: true) }
                            .buttonStyle(.plain)
                    }
                }
                SectionHeading(title: "Only on this phone · \(onThisPhone.count)")
                if onThisPhone.isEmpty {
                    EmptyStateCard(title: "Nothing is waiting", message: "Everything captured on this phone has been accepted. That is the only state in which this screen has nothing to say.")
                } else {
                    ForEach(onThisPhone) { entry in
                        if entry.state == .refused {
                            NavigationLink { ConflictResolutionView(entryId: entry.id) } label: { EntryCard(entry: entry, chevron: true) }
                                .buttonStyle(.plain)
                        } else {
                            EntryCard(entry: entry)
                        }
                    }
                }
                SectionHeading(title: "In the record · \(inTheRecord.count)")
                Text("Ordered by when each was received, never by what a phone believed.")
                    .font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                ForEach(inTheRecord) { EntryCard(entry: $0) }
                statesKey
                housekeeping
            }
            .padding(ThusoSpacing.space16)
        }
        .thusoGround()
        .navigationTitle("Waiting to send").navigationBarTitleDisplayMode(.inline)
    }

    /* The one sentence she is actually looking for, before anything explains itself. */
    @ViewBuilder private var headline: some View {
        CareCard {
            HStack(spacing: ThusoSpacing.space12) {
                TileIcon(symbol: kit.onlyHereCount == 0 ? "checkmark.seal" : "iphone",
                         tint: kit.onlyHereCount == 0 ? ThusoTheme.charcoal : ThusoTheme.info,
                         background: kit.onlyHereCount == 0 ? ThusoTheme.paleSage : ThusoTheme.infoSoft)
                VStack(alignment: .leading, spacing: 3) {
                    Text(kit.onlyHereCount == 0 ? "Nothing is waiting" : "\(kit.onlyHereCount) reading\(kit.onlyHereCount == 1 ? "" : "s") on this phone")
                        .font(.body.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                    Text(kit.queuedCount > 0 ? "\(kit.queuedCount) sealed and waiting for a connection" : "Nothing is sealed and waiting")
                        .font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                }
                Spacer(minLength: 0)
            }
            .accessibilityElement(children: .combine)
            Text(CaptureRules.queuedIsNotLost).font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
        }
    }

    /* Accurate, itemised, and it names what it does not do. A promise a screen cannot keep is
       worse than no promise, and “your data is safe” is the emptiest sentence in software. */
    @ViewBuilder private var whatItSurvives: some View {
        CareCard {
            Label("What this store survives", systemImage: "externaldrive")
                .font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            ForEach(["A crash or a force-quit. Every entry is written at the moment it is taken, not when the app closes.",
                     "A restart of the phone.",
                     "A sign-out. This preview’s sign-out returns to the first-run flow and never touches the file — the entries belong to the work, not to the session."], id: \.self) { line in
                Label(line, systemImage: "checkmark").font(.caption).foregroundStyle(ThusoTheme.charcoal)
            }
            Divider().overlay(ThusoTheme.line)
            ForEach(["Deleting the app. iOS removes the file with it, and nothing here can prevent that.",
                     "Losing the phone. The file is deliberately kept out of device backups, because a queue of readings is special personal information and syncing it into somebody’s laptop backup is a disclosure nobody consented to. The answer to a lost phone is to send, not to back up.",
                     "A second device. Nothing is shared between phones; there is no server in this build to share it through."], id: \.self) { line in
                Label(line, systemImage: "xmark").font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
            }
        }
    }

    /* offlineNeverServesStaleSilently. Everything on this screen came out of a file, so the screen
       says when that file was written before it says anything else about what is in it. */
    @ViewBuilder private var storeStatus: some View {
        CareCard {
            Label("Read from this phone’s own store", systemImage: "doc.text.magnifyingglass")
                .font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            Text(kit.ledgerWrittenAt.map { "Everything below was \(writtenInWords($0)). It is what this phone holds, not an answer from a server — there is no server in this build, and a local copy offered as though it were a fresh answer is the failure this line exists to prevent." }
                 ?? "Nothing has been written to this phone’s store yet.")
                .font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                .accessibilityAddTraits(.updatesFrequently)
            if !kit.storeNote.isEmpty {
                Text(kit.storeNote).font(.caption2).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
            }
            if let setAside = kit.setAside {
                Label("A ledger that would not parse was kept as \(setAside) rather than deleted.", systemImage: "archivebox")
                    .font(.caption2).foregroundStyle(ThusoTheme.mangoInk)
            }
            Text(kit.ledgerPath).font(.system(.caption2, design: .monospaced)).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                .textSelection(.enabled)
        }
    }

    @ViewBuilder private var controls: some View {
        CareCard {
            Label("Design-review controls", systemImage: "slider.horizontal.3")
                .font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            Text("There is no radio in this build and no clock to be wrong, so the two things that make a queue worth designing have to be askable for.")
                .font(.caption2).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
            Toggle("Show this phone with no signal", isOn: $kit.pretendNoSignal)
                .frame(minHeight: 44).contentShape(Rectangle())
            Stepper("Pretend this phone’s clock is \(kit.pretendClockFastHours) hour\(kit.pretendClockFastHours == 1 ? "" : "s") fast",
                    value: $kit.pretendClockFastHours, in: 0...12)
                .font(.subheadline)
            Button(sending ? "Sending…" : "Attempt to send", action: send)
                .buttonStyle(CareButton())
                .disabled(sending)
            if !sendResult.isEmpty {
                Text(sendResult).font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                    .accessibilityAddTraits(.updatesFrequently)
            }
        }
    }

    private func send() {
        sending = true
        Task {
            /* The queue does not keep its own idea of who is cleared. It asks the same vetting
               record dispatch and the clinical queue ask, so a nurse declined in the console a
               moment ago is a nurse this send stops on. */
            let result = await kit.attemptSend { subjectId in
                guard let subject = vetting.subject(subjectId) else { return false }
                return can(subject, "write-clinical-note").allowed
            }
            sendResult = result
            sending = false
        }
    }

    @ViewBuilder private var statesKey: some View {
        CareCard {
            Label("The six states", systemImage: "list.bullet.rectangle")
                .font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            ForEach(CaptureState.allCases) { state in
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        CaptureStatePill(state: state)
                        Spacer(minLength: 6)
                        Text("\(kit.entries.filter { $0.state == state }.count)")
                            .font(.caption.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                    }
                    Text(state.detail).font(.caption2).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                }
                .padding(.vertical, 3)
                .accessibilityElement(children: .combine)
            }
        }
    }

    @ViewBuilder private var housekeeping: some View {
        CareCard {
            Label("Prove it rather than believe it", systemImage: "arrow.clockwise")
                .font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            Text("Signing out of this preview returns to the first-run flow and goes nowhere near the file. This drops everything held in memory and reads the file again from nothing, which is what a cold launch does — the count above should not move.")
                .font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
            Button("Sign out and read the file again") { kit.reloadFromDisk() }.buttonStyle(QuietButton())
            Divider().overlay(ThusoTheme.line)
            Text("The only thing in this app that removes an entry, and it is a person’s deliberate act on fictional data. No sync, no sign-out and no failure ever does it.")
                .font(.caption2).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
            Button("Clear this phone’s store and start again") { kit.resetToFixtures() }
                .font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.danger)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
        }
    }
}

// MARK: - One entry

struct EntryCard: View {
    let entry: CapturedEntry
    var chevron = false
    var body: some View {
        CareCard {
            HStack(spacing: ThusoSpacing.space8) {
                CaptureStatePill(state: entry.state)
                if let conflict = entry.conflict {
                    StatusPill(text: conflict.name, tone: conflict.asksAPerson ? "amber" : "quiet")
                }
                if entry.superseded { StatusPill(text: "Superseded", tone: "quiet") }
                Spacer(minLength: 0)
                if chevron { Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted)) }
            }
            Text("\(entry.id) · \(entry.visitReference) · \(entry.patient)")
                .font(.caption2).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
            ReadingRow(reading: entry.reading)
            FieldRow(label: "Captured by", value: "\(entry.capturedByName) · \(entry.capturedByReference)")
            if let countersigner = entry.countersignedBy, let reference = entry.countersignedByReference {
                FieldRow(label: "Filed on the authority of", value: "\(countersigner) · \(reference)")
            }
            TwoClocksRow(entry: entry)
            if let refusal = entry.refusal {
                Label(refusal, systemImage: "hand.raised").font(.caption).foregroundStyle(ThusoTheme.danger)
            }
            if let decision = entry.decision, let by = entry.decidedBy, let at = entry.decidedAt {
                Label("\(by), \(captureStamp(at)): \(decision)", systemImage: "person.crop.circle.badge.checkmark")
                    .font(.caption2).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
            }
            if let supersededBy = entry.supersededById {
                Label("Set aside in favour of \(supersededBy), and kept. A superseded reading is still a reading somebody took.",
                      systemImage: "arrow.uturn.down").font(.caption2).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
            }
            WrittenAgoNote(at: entry.writtenToPhoneAt)
        }
    }
}

// MARK: - Deciding

/* Both readings visible, one chosen, the other kept. Nothing on this page merges anything and
   nothing on it deletes anything — the two buttons that look like they might are “this one stands”
   and “hold it”, and both leave every reading in the file.

   Who is deciding is a choice, and it is gated, because “a clinician decides” is only true if the
   platform checks that the person deciding is one. */
struct ConflictResolutionView: View {
    let entryId: String
    @ObservedObject private var kit = CaptureStore.shared
    @ObservedObject private var vetting = VettingStore.shared
    @State private var decider = resolverIds[0]
    @State private var note = ""
    @Environment(\.dismiss) private var dismiss

    private var entry: CapturedEntry? { kit.entry(entryId) }
    private var against: CapturedEntry? { entry?.conflictWithId.flatMap { kit.entry($0) } }
    private var resolvers: [VettingSubject] { resolverIds.compactMap { vetting.subject($0) } }
    private var clinician: VettingSubject { resolvers.first { $0.id == decider } ?? resolvers[0] }
    private var mayDecide: VettingDecision { can(clinician, "write-clinical-note") }
    private var reasoned: Bool { note.trimmingCharacters(in: .whitespacesAndNewlines).count >= 10 }
    private var settled: Bool { (entry?.state ?? .conflicted) != .conflicted && (entry?.state ?? .refused) != .refused }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
                DemoBadge()
                if let entry {
                    header(entry)
                    EntryCard(entry: entry)
                    if let against {
                        SectionHeading(title: "Already in the record")
                        EntryCard(entry: against)
                    }
                    if settled {
                        CareCard {
                            Label("Decided", systemImage: "checkmark.seal.fill").font(.headline).foregroundStyle(ThusoTheme.charcoal)
                            Text("Nothing was merged and nothing was deleted. Both readings are still in the file above, and the record says who decided and why.")
                                .font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                            Button("Back to the queue") { dismiss() }.buttonStyle(QuietButton())
                        }
                    } else {
                        whoDecides
                        options(entry)
                    }
                } else {
                    EmptyStateCard(title: "That entry is not on this phone", message: "It may have been cleared by hand from the queue screen.")
                }
            }
            .padding(ThusoSpacing.space16)
        }
        .thusoGround()
        .navigationTitle("Needs a decision").navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder private func header(_ entry: CapturedEntry) -> some View {
        CareCard {
            if let conflict = entry.conflict {
                Text(conflict.name).font(.title3.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                Text(conflict.detail).font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                StatusPill(text: conflict.asksAPerson ? "A clinician decides" : "The server decided, and nobody was asked",
                           tone: conflict.asksAPerson ? "amber" : "quiet")
            } else {
                Text("Refused").font(.title3.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                Text(CaptureState.refused.detail).font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
            }
            Text(CaptureRules.conflictsAreNotMerged).font(.caption2).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
        }
    }

    @ViewBuilder private var whoDecides: some View {
        CareCard {
            Text("Deciding as").font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
            Picker("Deciding as", selection: $decider) {
                ForEach(resolvers) { Text("\($0.name) · \($0.reference)").tag($0.id) }
            }.labelsHidden()
            HStack(spacing: ThusoSpacing.space8) {
                SubjectStatusPill(status: summarise(clinician).status)
                Text(clinician.role?.name ?? clinician.roleId).font(.caption2).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                Spacer(minLength: 0)
            }
            if !mayDecide.allowed {
                RefusalCard(title: "This clinician cannot settle it", decision: mayDecide)
                Text("A conflict left undecided is a conflict. It is not resolved by the platform growing impatient, and it is certainly not resolved by somebody whose own standing has lapsed.")
                    .font(.caption2).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
            }
            TextEditor(text: $note).frame(minHeight: 76).scrollContentBackground(.hidden)
                .padding(ThusoSpacing.space8).background(ThusoTheme.canvas, in: RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous).stroke(ThusoTheme.line, lineWidth: 1))
                .accessibilityLabel("Why")
            Text("Why. The reason goes into the record beside the decision — the next clinician reads the reason, not the button that was pressed.")
                .font(.caption2).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
        }
    }

    @ViewBuilder private func options(_ entry: CapturedEntry) -> some View {
        CareCard {
            switch entry.conflict {
            case .duplicateObservation:
                Text("Two readings of \(entry.reading.label.lowercased()) in one visit. Both stay in the file. One stands in the record; the other is marked superseded and stays readable, because a nurse whose retake was set aside is entitled to see that it was, and by whom.")
                    .font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                Button("The newer reading stands · \(entry.reading.display)") {
                    if let against { kit.resolveDuplicate(keep: entry.id, supersede: against.id, by: clinician, note: note) }
                }
                .buttonStyle(CareButton()).disabled(!mayDecide.allowed || !reasoned || against == nil)
                Button("The reading already in the record stands · \(against?.reading.display ?? "")") {
                    if let against { kit.resolveDuplicate(keep: against.id, supersede: entry.id, by: clinician, note: note) }
                }
                .buttonStyle(QuietButton()).disabled(!mayDecide.allowed || !reasoned || against == nil)

            case .vettingLapsed:
                /* The interesting one. The reading was taken while she was cleared, so throwing it
                   away destroys work that was lawful when it was done; filing it on her authority
                   claims a standing that has since gone. Both are wrong, and the third answer is a
                   second name on the entry: hers as the person who took it, and a cleared
                   clinician’s as the person who stands behind its being in the file. */
                lapsedStanding(entry)
                Text("She was cleared when she took it and she is not now. The reading is not discarded — it was lawful work at the time — and it is not filed on her authority alone, because that authority no longer exists. A cleared clinician reads it and puts their own registration to it, and the record then carries both names.")
                    .font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                Button("Countersign and file it") { kit.countersign(entry.id, by: clinician, note: note) }
                    .buttonStyle(CareButton()).disabled(!mayDecide.allowed || !reasoned)
                Button("Hold it — I am not putting my registration to this") { kit.hold(entry.id, by: clinician, note: note) }
                    .buttonStyle(QuietButton()).disabled(!mayDecide.allowed || !reasoned)
                Text("Holding it leaves it exactly where it is. Nothing expires it, nothing tidies it away, and it is still here tomorrow for somebody who was actually in the room.")
                    .font(.caption2).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))

            case .staleWrite:
                Text("The record moved on while this sat in the queue. It is never applied silently behind a signature — it is added in the open, after it, with the reason and the date, or it is held for the clinician who signed.")
                    .font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                Button("File it as an addendum, after the signature") { kit.fileAsAddendum(entry.id, by: clinician, note: note) }
                    .buttonStyle(CareButton()).disabled(!mayDecide.allowed || !reasoned)
                Button("Hold it for the clinician who signed") { kit.hold(entry.id, by: clinician, note: note) }
                    .buttonStyle(QuietButton()).disabled(!mayDecide.allowed || !reasoned)

            case .clockSkew:
                Text("Nobody is asked about this one. The receipt time ordered the record the moment the entry landed, the phone’s time is kept beside it as what the phone believed, and there is no decision here to take.")
                    .font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))

            case .none:
                Text(entry.refusal ?? "The server would not take it.").font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                Button("Put it back in the queue and try again") { kit.requeue(entry.id) }
                    .buttonStyle(CareButton()).disabled(!mayDecide.allowed)
                Button("Hold it for the Control Tower") { kit.hold(entry.id, by: clinician, note: note) }
                    .buttonStyle(QuietButton()).disabled(!mayDecide.allowed || !reasoned)
                Text("There is no button on this screen that deletes it. A refused entry is still a reading somebody took, and what to do with it is a decision made by a person who knows what it was.")
                    .font(.caption2).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
            }
        }
    }

    /// Her standing then, and her standing now, side by side — the two facts the decision turns on.
    @ViewBuilder private func lapsedStanding(_ entry: CapturedEntry) -> some View {
        if let capturer = vetting.subject(entry.capturedBySubjectId) {
            let summary = summarise(capturer)
            FieldRow(label: "Captured by", value: "\(capturer.name) · \(capturer.reference)")
            FieldRow(label: "This phone believed it was taken", value: captureStamp(entry.deviceCapturedAt))
            HStack {
                Text("Standing now").font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                Spacer(minLength: 8)
                SubjectStatusPill(status: summary.status)
            }
            ForEach(summary.lapsed) { standing in
                Label("\(standing.check.name) · \(expiryPhrase(standing.record.expiresOn))", systemImage: "calendar.badge.exclamationmark")
                    .font(.caption2).foregroundStyle(ThusoTheme.danger)
            }
            VettingRefusalNote(decision: can(capturer, "write-clinical-note"))
            NavigationLink("Open her vetting") { VettingStatusView(subjectId: capturer.id) }
                .font(.caption.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
        }
    }
}
