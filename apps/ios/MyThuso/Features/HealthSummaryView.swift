import SwiftUI

/* The shareable health summary: the nine fields records.json defines, bound to a purpose and to a
   period rather than issued as a permanently valid document.

   The three things this screen is careful about are all the same thing. A summary with every field
   in it and no end date is the artefact that gets forwarded; a reference that is a patient number
   is a key somebody can count up to; and an export that leaves with a protected category in it
   cannot be called back. So the purpose chooses the fields and the hours, the reference is 100
   random bits, and the artefact is searched for protected content before it is offered — against
   its own bytes, not against the intentions of the code that wrote them.

   Nothing is sent, no link resolves and the data is fictional. */

struct HealthSummaryView: View {
    var memberId = "thando"
    @EnvironmentObject private var store: PreviewStore
    @State private var purposeId = sharePurposes[0].id
    @State private var recipient = ""
    @State private var understood = false
    @State private var shares: [SummaryShare] = []
    @State private var status = ""

    private var member: HouseholdMember { HouseholdFixtures.mokoena.member(memberId) ?? HouseholdFixtures.mokoena.members[0] }
    private var purpose: SharePurpose { sharePurposes.first { $0.id == purposeId } ?? sharePurposes[0] }
    private var omitted: [String] { Records.summaryCard.fields.filter { !purpose.fields.contains($0) } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
                DemoBadge()
                CareHeading(eyebrow: "Patients · design preview", title: thuso(.healthSummary, store.locale),
                            subtitle: "The page a stranger reads when there is no time to read the file — shared for one purpose, for one period.")
                summaryCard
                shareForm
                if shares.isEmpty {
                    EmptyStateCard(title: "Nothing has been shared yet",
                                   message: "A share made here lives in memory for as long as the app is open. There is no server, no link and no record of it anywhere else.")
                } else {
                    SectionHeading(title: "What you have shared")
                    ForEach(shares) { shareCard($0) }
                }
            }
            .padding(ThusoSpacing.space16)
        }
        .thusoGround()
        .navigationTitle(thuso(.healthSummary, store.locale)).navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder private var summaryCard: some View {
        CareCard {
            Text("Health summary · \(member.name)").font(.headline).foregroundStyle(ThusoTheme.charcoal)
            Text(Records.summaryCard.why).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
            SummaryCardView(member: member, fields: Records.summaryCard.fields)
            if !member.restricted.isEmpty {
                /* Only ever shown to the person themselves, in their own view of their own record.
                   It is a count of their own entries, told to the only person it is not a
                   disclosure to. */
                Label("You have \(member.restricted.count) \(member.restricted.count == 1 ? "entry" : "entries") in protected categories. They are yours, they appear in no summary you share, and you release them one at a time, to one person, for one purpose.",
                      systemImage: "lock")
                    .font(.caption2).foregroundStyle(ThusoTheme.studioInkMuted)
                    .accessibilityElement(children: .combine)
            }
        }
    }

    @ViewBuilder private var shareForm: some View {
        CareCard {
            Text("Share this summary").font(.headline).foregroundStyle(ThusoTheme.charcoal)
            Text("A summary that is valid forever is a summary you have lost. Choose what it is for; the purpose chooses the fields and the hours.")
                .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
            Text("What is this summary for?").font(.caption).foregroundStyle(ThusoTheme.studioInkMuted)
            ForEach(sharePurposes) { option in
                Button {
                    purposeId = option.id
                    status = "\(option.name) — \(option.fields.count) fields, valid \(option.hours) hours."
                } label: {
                    HStack(alignment: .top, spacing: ThusoSpacing.space12) {
                        Image(systemName: option.id == purposeId ? "largecircle.fill.circle" : "circle")
                            .foregroundStyle(ThusoTheme.charcoal)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(option.name).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                            Text("\(option.fields.count) of \(Records.summaryCard.fields.count) fields · valid \(option.hours) hours · \(option.recipient)")
                                .font(.caption).foregroundStyle(ThusoTheme.studioInkMuted)
                        }
                        Spacer(minLength: 0)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(option.id == purposeId ? [.isSelected] : [])
            }
            Text("Who receives it").font(.caption).foregroundStyle(ThusoTheme.studioInkMuted)
            TextField(purpose.recipient, text: $recipient)
                .textFieldStyle(.roundedBorder)
                .onChange(of: recipient) { _, value in recipient = String(value.prefix(80)) }
                .accessibilityLabel("Who receives this summary")
            FieldRow(label: "They will see", value: summaryValues(member, fields: purpose.fields).map(\.label).joined(separator: ", "))
            FieldRow(label: "They will not see", value: omitted.isEmpty
                     ? "Nothing further — this purpose carries the whole card"
                     : omitted.map { summaryLabel($0, member) }.joined(separator: ", "))
            FieldRow(label: "Valid for", value: "\(purpose.hours) hours")
            Toggle("I understand this is a design preview. Nothing is sent, no link works, and the data is fictional.", isOn: $understood)
                .font(.footnote)
            Button("Create the share", action: create).buttonStyle(CareButton()).disabled(!understood)
            Text(status.isEmpty ? "Nothing has been shared yet." : status)
                .font(.caption).foregroundStyle(ThusoTheme.studioInkMuted)
                .accessibilityAddTraits(.updatesFrequently)
        }
    }

    private func create() {
        let now = Date()
        let chosen = purpose
        let share = SummaryShare(id: "SHR-\(shares.count + 1)", token: shareToken(), purpose: chosen,
                                 recipient: recipient.trimmingCharacters(in: .whitespaces).isEmpty ? chosen.recipient : recipient.trimmingCharacters(in: .whitespaces),
                                 createdAt: now, validUntil: now.addingTimeInterval(Double(chosen.hours) * 3600))
        shares.insert(share, at: 0)
        understood = false
        status = "Summary shared for \(chosen.name.lowercased()), with \(share.recipient). It stops being valid at \(formatEventTime(share.validUntil)) — \(chosen.fields.count) of \(Records.summaryCard.fields.count) fields, and no protected category."
    }

    @ViewBuilder private func shareCard(_ share: SummaryShare) -> some View {
        CareCard {
            FieldRow(label: "Purpose", value: share.purpose.name)
            FieldRow(label: "Shared with", value: share.recipient)
            FieldRow(label: "Produced", value: "\(formatEventTime(share.createdAt)) by \(member.name)")
            FieldRow(label: "Stops being valid", value: share.revoked ? "Revoked" : formatEventTime(share.validUntil))
            FieldRow(label: "Reference", value: share.token)
            scannerNote(share)
            exportRow(share)
            Button(share.revoked ? "Revoked" : "Revoke") {
                guard let index = shares.firstIndex(where: { $0.id == share.id }) else { return }
                shares[index].revoked = true
                status = "Revoked. The verification link now answers “revoked”. Anything already read cannot be unread, which is why the purpose and the hours matter more than the revocation does."
            }
            .buttonStyle(QuietButton())
            .disabled(share.revoked)
        }
    }

    /* What a scanner would read, said in the interface rather than left to be assumed. No code is
       drawn here: an encoder is a dependency this preview has no budget for, and the picture would
       only be a way to lose the reference — the reference is the part that matters. */
    @ViewBuilder private func scannerNote(_ share: SummaryShare) -> some View {
        let initials = member.name.split(separator: " ").compactMap(\.first).map(String.init).joined(separator: ".")
        HStack(alignment: .top, spacing: ThusoSpacing.space12) {
            Image(systemName: "checkmark.shield").font(.body).foregroundStyle(ThusoTheme.charcoal)
            VStack(alignment: .leading, spacing: 5) {
                Text("What a scanner would read.").font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                Text("The reference above, and nothing else — it is 100 random bits from the system’s cryptographic generator, not your patient number and not a number anyone can count up to. Someone holding it is answered with your initials (\(initials).), whether the summary is valid, expired or revoked, what it was made for, and when it stops. Not your name, not your date of birth, not one clinical word.")
                    .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                Text("No code is drawn here: the picture would only be a way to lose the reference. I, L, O and U are left out of the alphabet so that reading it over a counter cannot turn it into a different valid-looking one.")
                    .font(.caption2).foregroundStyle(ThusoTheme.studioInkMuted)
            }
        }
        .padding(ThusoSpacing.space16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ThusoTheme.paleSage, in: RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    /* The artefact is built and searched before the share sheet is offered at all, rather than
       checked on the way out of a button somebody could add a second copy of. A refused export has
       no share sheet to press. */
    @ViewBuilder private func exportRow(_ share: SummaryShare) -> some View {
        switch exportSummary(member, share) {
        case .ready(let body):
            if share.revoked {
                Text("Revoked, so there is nothing to export. A revoked summary is not a summary with a warning on it.")
                    .font(.caption2).foregroundStyle(ThusoTheme.studioInkMuted)
            } else {
                ShareLink(item: body) {
                    Label("Export this summary", systemImage: "square.and.arrow.up")
                        .font(.subheadline.weight(.semibold))
                        .padding(ThusoSpacing.space16).frame(maxWidth: .infinity, minHeight: 50)
                        .background(.white, in: RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous).stroke(ThusoTheme.controlEdge, lineWidth: 1))
                        .foregroundStyle(ThusoTheme.charcoal)
                }
                .accessibilityLabel("Export this summary through the share sheet")
                Text("It goes to the system share sheet and nowhere else — no file is written, and \(share.purpose.fields.count) of \(Records.summaryCard.fields.count) fields travel with it. The artefact says who made it, for whom, for what, and when it stops being valid.")
                    .font(.caption2).foregroundStyle(ThusoTheme.studioInkMuted)
            }
        case .refused(let reason):
            RefusalCard(title: "This summary was not offered for export",
                        decision: VettingDecision(allowed: false, reason: reason, blockedBy: []))
            Text("The check is on the bytes that would have left, not on what the code writing them intended. It does not say what it found: naming the category would be the disclosure the check exists to prevent.")
                .font(.caption2).foregroundStyle(ThusoTheme.studioInkMuted)
        }
    }
}
