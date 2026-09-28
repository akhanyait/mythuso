import SwiftUI

/* LIVE WELL — the one screen in this product that talks to somebody about their own body with no
 * clinician in the room.
 *
 * WHAT IS NOT DRAWN HERE IS THE DESIGN. There is no chart, no ring, no bar, no figure set large, no
 * chip saying how a week went and no colour that means good. Every one of those is an ordinary,
 * well-meant thing to put on a healthy-living screen and each of them would be this product forming
 * an opinion about somebody's health on a screen no clinician has seen. packages/catalog/
 * wellbeing.json names them and scripts/check-boundaries.mjs fails the build on the words.
 *
 * SO THE HIERARCHY HAD TO COME FROM SOMEWHERE ELSE, AND IT COMES FROM THE ORDER. The screen has two
 * subjects and they are the two halves of a diary: the prompt to write something, and what has been
 * written. Both are plain white cards on paper with a hairline, because the loud object on this
 * screen is the one lime button, and there is exactly one of it — the habit a person has opened.
 * Five lime "write it down" pills down one list would be five calls to action of equal weight, and
 * the tile-plate rule this design language already carries says the same thing about six lime
 * plates in a row.
 *
 * THE DARK CARD IS SPENT ON THE ONE THING THAT LEAVES THIS SCREEN. Every screen in this language
 * gets one near-black card and spends it on what is live. Nothing is live here — nothing is
 * measured, nothing arrives — so it goes to the only action with a consequence: taking what you
 * wrote to somebody who can read it. That is the whole feature, as the contract says: not an
 * integration, a prompt to bring it.
 *
 * THE REFUSALS ARE THE LAST PANEL AND THEY ARE ALL TEN. They are not a footnote and they are not
 * behind a disclosure triangle. They are rendered word for word from the contract, in the order it
 * holds them, and a reader who scrolls to the bottom of this screen has read what MyThuso will not
 * say about them. */
struct LiveWellView: View {
    @EnvironmentObject private var store: PreviewStore
    /// The habit whose note is open, if any. One at a time, which is what keeps a single accent
    /// object on the screen and a single field for a keyboard to be attached to.
    @State private var writing: String?
    @State private var draft = ""

    /* A mark per habit, and no fill behind any of them. A coloured plate on every row would be five
       decorations carrying no information — and on this screen in particular a green one would be
       the product saying something approving about a body. "How you are" takes a speech bubble
       rather than a face: a smiling or frowning mark is a mood scale drawn as an icon, which is the
       one thing the feeling habit is written to avoid. */
    private static let marks = ["moving": "figure.walk", "eating": "fork.knife", "sleeping": "moon",
                                "feeling": "text.bubble", "medicines": "pills"]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space24) {
                DemoBadge()
                if let framing = FramingData.framing(id: "live-well") {
                    VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
                        MoonArtwork().frame(width: 130, height: 130).frame(maxWidth: .infinity)
                        Text(framing.lead).thusoFont(ThusoType.caption, weight: .semibold).tracking(1.2)
                            .foregroundStyle(ThusoRole.mutedForeground)
                        Text(framing.accent).font(.thuso(.largeTitle, weight: .semibold)).tracking(-1)
                            .foregroundStyle(ThusoRole.foreground).fixedSize(horizontal: false, vertical: true)
                        Text(WellbeingData.statement).font(.thuso(.subheadline))
                            .foregroundStyle(ThusoRole.mutedForeground).fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(ThusoSpacing.space24)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(ThusoRole.surfaceRaised, in: RoundedRectangle(cornerRadius: 30))
                }
                /* The standing disclosure, and it is clinical-records rather than a capability of
                   this feature's own — there is no wellbeing supplier to be blocked on, and
                   inventing one would be inventing a gap. */
                CapabilityNotice(of: WellbeingData.capability)
                habits
                written
                bringIt
                refusals
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle("Live well").navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - The five things a person might write about

    private var habits: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            CareSectionHeader("Write something down")
            CareCard(padding: ThusoSpacing.space12, spacing: 0) {
                ForEach(Array(WellbeingData.habits.enumerated()), id: \.element.id) { index, habit in
                    habitRow(habit)
                    if writing == habit.id { note(habit) }
                    if index < WellbeingData.habits.count - 1 { Divider().overlay(ThusoRole.border) }
                }
            }
        }
    }

    /* The row is the disclosure. Tapping it opens the note under it and tapping it again closes it,
       so there is no second control to explain and nothing to cancel — a half-written line that is
       never written down was never a record of anything.

       The prompt is on the row rather than inside the field, because a placeholder disappears the
       moment somebody starts typing, which is exactly when a person looks back up to check they are
       answering the right question. */
    private func habitRow(_ habit: WellbeingData.Habit) -> some View {
        Button {
            if writing == habit.id { writing = nil } else { writing = habit.id; draft = "" }
        } label: {
            HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space12) {
                Image(systemName: Self.marks[habit.id] ?? "square.and.pencil")
                    .font(.thuso(.subheadline)).foregroundStyle(ThusoRole.mutedForeground)
                    .frame(width: 22, alignment: .leading).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(habit.name).font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                    /* The prompt is on the row while the row is shut and on the field while it is
                       open. It was on both, which printed the question twice, six points apart, and
                       the second copy was the one attached to the box somebody was answering it in.
                       A question belongs to the field that answers it. */
                    if writing != habit.id {
                        Text(habit.prompt).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer(minLength: ThusoSpacing.space8)
                Image(systemName: writing == habit.id ? "chevron.up" : "chevron.down")
                    .font(.thuso(.footnote, weight: .semibold)).foregroundStyle(ThusoRole.mutedForeground)
                    .accessibilityHidden(true)
            }
            .padding(.vertical, ThusoSpacing.space8)
            .frame(minHeight: 44).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityHint(writing == habit.id ? "Closes the note" : "Opens a note to write in")
    }

    /* Somebody's own words, and nothing else. No picker beside it, no quick answers to tap, no
       field that takes a figure — WriteNote is a plain editor with the default keyboard, and the
       build fails on a numeric one anywhere in this feature. The button is disabled until there is
       something to write down, because an empty entry is a day a person did not write on, and the
       contract is explicit that such a day is just a day. */
    private func note(_ habit: WellbeingData.Habit) -> some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            WriteNote(label: habit.prompt, text: $draft)
            Button("Write it down") {
                store.wellbeing = Wellbeing.ordered([Wellbeing.written(habit.id, draft)] + store.wellbeing)
                writing = nil
                draft = ""
            }
            .buttonStyle(CareButton())
            .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(.top, ThusoSpacing.space4).padding(.bottom, ThusoSpacing.space12)
    }

    // MARK: - What has been written

    /// Newest first, under the day it was written on. A day with nothing on it has no row: the
    /// timeline shows what is there and says nothing at all about what is not.
    private var days: [(offset: Int, entries: [WellbeingEntry])] {
        var order: [Int] = []
        var held: [Int: [WellbeingEntry]] = [:]
        for entry in store.wellbeing {
            if held[entry.dayOffset] == nil { order.append(entry.dayOffset) }
            held[entry.dayOffset, default: []].append(entry)
        }
        return order.map { ($0, held[$0] ?? []) }
    }

    private var written: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            CareSectionHeader("What you have written")
            Text(WellbeingData.timeline).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
            if store.wellbeing.isEmpty {
                /* The empty state is the contract's own sentence and it is the best one in the
                   file. An empty diary is the state a product is most tempted to nag in. */
                EmptyStateCard(title: "Nothing written yet",
                               message: WellbeingData.refusal("no-punished-gap")?.sentence ?? "",
                               symbol: "square.and.pencil")
            } else {
                VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
                    ForEach(days, id: \.offset) { day in
                        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
                            Text(Wellbeing.day(day.offset).uppercased())
                                .thusoFont(ThusoType.caption, weight: .semibold).tracking(1.1)
                                .foregroundStyle(ThusoRole.mutedForeground)
                                .accessibilityAddTraits(.isHeader)
                            CareCard(padding: ThusoSpacing.space12, spacing: 0) {
                                ForEach(Array(day.entries.enumerated()), id: \.element.id) { index, entry in
                                    entryRow(entry)
                                    if index < day.entries.count - 1 { Divider().overlay(ThusoRole.border) }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    /* The habit's name and then the person's words, and the words are the charcoal ones. It is the
       other way round from every clinical row in this app, where the label leads and the value is
       the measured thing — here the measured thing does not exist and what somebody said is the
       whole record. */
    private func entryRow(_ entry: WellbeingEntry) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(WellbeingData.habit(entry.habit)?.name ?? entry.habit)
                .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
            Text(entry.text).font(.thuso(.subheadline)).foregroundStyle(ThusoRole.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, ThusoSpacing.space8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    // MARK: - The one thing that leaves this screen

    private var bringIt: some View {
        StudioNightCard {
            Text(WellbeingData.bringIt).font(.thuso(.title3, weight: .semibold)).studioNightInk()
                .fixedSize(horizontal: false, vertical: true)
            Text(WellbeingData.bringItHowItWorks).font(.thuso(.subheadline)).studioNightInk(quiet: true)
                .fixedSize(horizontal: false, vertical: true)
            NavigationLink { VisitsView() } label: { Text("Open my visits") }
                .buttonStyle(CareButton())
        }
    }

    // MARK: - What this is not

    private var refusals: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            CareSectionHeader("What this is not")
            CareCard(padding: ThusoSpacing.space16, spacing: ThusoSpacing.space16) {
                /* The lead sentence is charcoal and the ten under it are the muted ink, which is the
                   only hierarchy this panel has and the only one it needs. Nothing is behind a
                   disclosure triangle: a refusal a reader has to open is a refusal somebody has
                   decided they would rather not have read. */
                Text(WellbeingData.isNot).font(.thuso(.subheadline)).foregroundStyle(ThusoRole.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                Hairline()
                ForEach(WellbeingData.refusals) { refusal in
                    Text(refusal.sentence).font(.thuso(.subheadline)).foregroundStyle(ThusoRole.mutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }
}
