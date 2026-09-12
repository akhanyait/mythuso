import SwiftUI

/* Three screens about what somebody else is allowed to see, and one about the states a screen has
 * to have. All four were system `Form`s and `List`s.
 *
 * The one that mattered most is the scope step. Three grants, narrowest first, were three grouped
 * rows with a small circle at the leading edge — so the difference between "they can pay for your
 * visits" and "they can read everything" was a twenty-point radio button. It is ChoiceCard now:
 * the whole card is the target, the chosen one takes the palest sage and a charcoal hairline as
 * well as the mark, and the sentence explaining each grant is the same size on all three so the
 * widest one does not read as the recommended one.
 *
 * Nothing about what is refused moved. The protected categories stay hidden under every scope, an
 * unverified invitation still grants nothing, and the sentence about a child under 18 being
 * guardianship rather than sharing is still on the step where the relationship is chosen. */

/* The three scopes somebody can be given, widest last.
 *
 * They were a private array of tuples inside the invitation flow, which was fine until a second
 * screen needed to name the narrowest of them: the sponsor's view has to be able to say "the least
 * anybody can be given is more than this", and it cannot say it by retyping the sentence. So the
 * list is a type, read by both, and the ordering is load-bearing — `least` is the first because the
 * list is written narrowest first, and a screen that reasons about the smallest grant must not be
 * able to pick it out by index. */
struct GuardianScope: Identifiable, Hashable {
    let title: String
    let body: String
    var id: String { title }
    static let all: [GuardianScope] = [
        .init(title: "Bookings and payments only", body: "They can arrange and pay for visits. They see no clinical information at all."),
        .init(title: "Visit summaries only", body: "They see what happened at a visit and what to do next. No history, results or medicines."),
        .init(title: "Full Health Passport", body: "Everything you can see. Appropriate for a guardian of a child, or where you have chosen to share fully.")
    ]
    /// The narrowest grant MyThuso offers — and still more than paying for somebody's care buys.
    static let least = all[0]
}

/// Paying for someone's care is not the same as being allowed to read their records.
/// Scope, duration and verification are three separate decisions, so they are three separate steps.
struct InviteGuardianView: View {
    @EnvironmentObject private var store: PreviewStore
    @Environment(\.dismiss) private var dismiss
    @State private var step = 0
    @State private var name = ""
    @State private var relationship = "Parent"
    @State private var scope = GuardianScope.least.title
    @State private var expires = "Until I revoke it"
    @State private var understood = false
    private var minor: Bool { relationship == "Child under 18" }
    private let scopes = GuardianScope.all
    private let steps = ["Who", "What they see", "For how long", "Review"]
    private let relationships = ["Parent", "Child under 18", "Adult child", "Partner", "Sibling", "Carer", "Other family member"]
    private let durations = ["Until I revoke it", "Until the end of this visit", "For 7 days", "For 30 days", "31 December 2026"]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space24) {
                SurfaceHeading(eyebrow: "Invite someone", title: steps[step])
                SurfacePanel(tone: .quiet, padding: ThusoSpacing.space16) {
                    StepDots(step: step + 1, total: steps.count, label: steps[step])
                }
                switch step {
                case 0: who
                case 1: whatTheySee
                case 2: forHowLong
                default: review
                }
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle("Invite someone").navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder private var who: some View {
        SurfacePanel(tone: .lead) {
            PanelHead("Who are you inviting?")
            WriteField(label: "Their name", text: $name, hint: "Their full name")
            PickRow(label: "Relationship", selection: $relationship, options: relationships.map { ($0, $0) })
            if minor {
                Text("For a child under 18 you are asking for guardianship, not sharing. Production requires proof of parental responsibility and a record of the child’s own views as they grow older.")
                    .font(.footnote).foregroundStyle(ThusoTheme.charcoal)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text("They receive an invitation on their own phone and choose whether to accept. You can withdraw it at any time.")
                .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
        Button("Continue") { step = 1 }.buttonStyle(CareButton())
            .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
    }

    @ViewBuilder private var whatTheySee: some View {
        Text("What should they be able to see?")
            .thusoFont(ThusoType.sectionTitle, weight: .medium).foregroundStyle(ThusoTheme.charcoal)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isHeader)
        /* Cards rather than rows, and the widest grant is last for the same reason the contract
           writes it last: a person scanning downwards meets the smallest thing they can give before
           the largest, rather than the other way round. */
        ForEach(scopes) { option in
            ChoiceCard(title: option.title, detail: option.body, chosen: scope == option.title) {
                scope = option.title
            }
        }
        Text("Sexual and reproductive health, mental health and HIV-related entries stay hidden under every scope unless you release them one by one.")
            .font(.footnote).foregroundStyle(ThusoTheme.charcoal)
            .fixedSize(horizontal: false, vertical: true)
        stepButtons(forward: "Continue", to: 2, back: 0)
    }

    @ViewBuilder private var forHowLong: some View {
        SurfacePanel(tone: .lead) {
            PanelHead("For how long?")
            PickRow(label: "Access expires", selection: $expires, options: durations.map { ($0, $0) })
            Text("Time-limited access is the safer default. An open-ended grant is reviewed with you every six months. They must verify their identity before the invitation becomes active — an unverified invitation grants nothing.")
                .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
        stepButtons(forward: "Review", to: 3, back: 1)
    }

    @ViewBuilder private var review: some View {
        SurfacePanel {
            PanelHead("Check this before you send it")
            FactRow(label: "Person", value: name)
            FactRow(label: "Relationship", value: relationship)
            FactRow(label: "They will see", value: scope)
            FactRow(label: "Access ends", value: expires)
            FactRow(label: "Before it starts", value: "Identity verification\(minor ? " and proof of guardianship" : "")")
            Hairline()
            AgreeRow(text: "I understand this is a design preview. No invitation is sent and no access is granted.", on: $understood)
        }
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            Button("Send demo invitation") {
                store.invitations.append(.init(id: "INV-00\(40 + Int.random(in: 0..<50))", name: name.trimmingCharacters(in: .whitespaces), relationship: relationship, scope: scope, expires: expires, status: "Verification pending"))
                dismiss()
            }
            .buttonStyle(CareButton()).disabled(!understood)
            Button("Back") { step = 2 }.buttonStyle(QuietButton())
        }
    }

    @ViewBuilder private func stepButtons(forward: String, to: Int, back: Int) -> some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            Button(forward) { step = to }.buttonStyle(CareButton())
            Button("Back") { step = back }.buttonStyle(QuietButton())
        }
    }
}

struct SystemStatesView: View {
    @State private var state: LoadState = .loading
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space24) {
                DemoBadge()
                SurfaceHeading(eyebrow: "Design", title: "System states",
                               subtitle: "Every screen that will talk to a clinical, payment, partner or device integration needs these designed up front.")
                SurfacePanel(tone: .quiet, padding: ThusoSpacing.space16) {
                    StatePicker(title: "Choose a state", state: $state)
                }
                SurfacePanel {
                    PanelHead("The chosen state")
                    if state == .ready {
                        Label("The real content, with nothing standing in for it.", systemImage: "checkmark.circle")
                            .font(.subheadline).foregroundStyle(ThusoTheme.charcoal)
                            .fixedSize(horizontal: false, vertical: true)
                    } else {
                        StateBlock(state: state, subject: "Your laboratory results",
                                   permission: "Apple Health access", retry: { state = .ready }) { EmptyView() }
                    }
                }
                SurfacePanel {
                    PanelHead("Skeleton while care information loads")
                    SkeletonRows()
                }
                EmptyStateCard(title: "No visits yet", message: "When you book your first visit it appears here, with the nurse’s name and what to have ready.")
                Text("An error state never blames the patient, never loses what they typed, and always says what happens next.")
                    .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle("System states").navigationBarTitleDisplayMode(.inline)
    }
}

struct LanguageView: View {
    @EnvironmentObject private var store: PreviewStore
    @State private var signs = false
    /* Counted rather than claimed, and it is the one figure on this screen that would be worth
       lying about: ten of the eleven written languages have been read by nobody who speaks them.
       It comes off the same list the picker below is built from. */
    private var unreviewed: Int { ThusoLocale.allCases.filter { $0.reviewNotice != nil }.count }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space24) {
                SurfaceHeading(eyebrow: "Language", title: "Choose your language")
                SurfacePanel(tone: .lead, spacing: ThusoSpacing.space16) {
                    ThusoMetrics {
                        ThusoMetric(value: "\(unreviewed)", unit: "of \(ThusoLocale.allCases.count)",
                                    label: "Written languages nobody who speaks them has read",
                                    chip: "Unreviewed", flagged: unreviewed > 0)
                    }
                }
                /* Every option says whether a person who speaks it has read it, on the row itself
                   rather than in a footnote. Ten of the eleven have not, and a draft that does not
                   announce itself is worse than no translation at all in a health app. The state
                   comes from packages/catalog/locales.json, so a language cannot be presented as
                   reviewed here while the contract says it is not. */
                SurfacePanel {
                    PanelHead("Choose your language")
                    ForEach(ThusoLocale.allCases) { option in
                        ChoiceCard(title: option.native, detail: option.reviewLabel,
                                   chosen: store.locale == option) { store.locale = option }
                    }
                }
                if let notice = store.locale.reviewNotice {
                    SurfacePanel(tone: .quiet) {
                        Label(notice, systemImage: "exclamationmark.triangle")
                            .font(.subheadline).foregroundStyle(ThusoTheme.charcoal)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
                    Text(ThusoLanguageNotes.clinicalRule).font(.footnote)
                        .foregroundStyle(ThusoTheme.studioInkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(ThusoLanguageNotes.fallback).font(.footnote)
                        .foregroundStyle(ThusoTheme.studioInkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                signLanguage
                /* The arrangements themselves, one screen along: the roster, the hold, the wait that
                   says when it does not know, and the refusals. They are not on this screen because
                   this screen is where a language is chosen, and an interpreter is not a language
                   setting — it is who else is in the room. */
                VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
                    NavigationLink { InterpretingView() } label: {
                        NavPillLabel(title: Interpreting.labels.heading, symbol: "person.2.wave.2")
                    }.buttonStyle(.plain)
                    Text(Interpreting.rule("one-roster").sentence).font(.footnote)
                        .foregroundStyle(ThusoTheme.studioInkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle("Language").navigationBarTitleDisplayMode(.inline)
    }

    /* South African Sign Language is an official language and is not in the picker above, because
       there is no written form for a picker to switch the interface into. It is a communication
       requirement on the account instead, and the written language stays a separate choice. */
    @ViewBuilder private var signLanguage: some View {
        SurfacePanel {
            PanelHead(ThusoLanguageNotes.signLanguageName)
            AgreeRow(text: ThusoLanguageNotes.signLanguageRequirement, on: $signs)
            ForEach([ThusoLanguageNotes.signLanguageRequirementDetail,
                     ThusoLanguageNotes.signLanguageStatus,
                     ThusoLanguageNotes.signLanguageWhyNotListed], id: \.self) { sentence in
                Text(sentence).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        SurfacePanel {
            PanelHead("What a visit and a call must do")
            ForEach(ThusoLanguageNotes.signLanguageMustHappen, id: \.0) { rule in
                StatedFact(term: rule.0, statement: rule.1)
                if rule.0 != ThusoLanguageNotes.signLanguageMustHappen.last?.0 { Hairline() }
            }
        }
        SurfacePanel {
            PanelHead("What must never happen")
            ForEach(ThusoLanguageNotes.signLanguageNeverHappens, id: \.self) { sentence in
                Label(sentence, systemImage: "xmark.circle")
                    .font(.subheadline).foregroundStyle(ThusoTheme.charcoal)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text(ThusoLanguageNotes.signLanguageNotBuilt).font(.footnote)
                .foregroundStyle(ThusoTheme.studioInkMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
