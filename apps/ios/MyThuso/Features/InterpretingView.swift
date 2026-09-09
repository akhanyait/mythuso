import SwiftUI

/* Interpreters.

   The guidance for this already existed and was rendered on all three platforms; what did not exist
   was any of it working. So the three parts of this screen are the three things that were missing,
   in the order somebody would meet them.

   The roster, and the arithmetic on it. Four fictional interpreters with real-shaped availability,
   and one control that asks the only question that matters: if I ask for this hour, what happens?
   The answer is one of three, and the third is the one worth building a screen for — nobody is free
   and nobody can say when one will be. That state prints the contract's sentence rather than a
   number, because there is no number, and printing the day that was asked for or a cheerful "soon"
   is how a person ends up taking a morning off work for a visit that was never going to happen.

   The hold. A visit that needs an interpreter and has not got one is not confirmed and is not
   dispatched — it waits, and it says on the face of it that it is waiting. The way out of the wait
   is free, at any point, with no notice period, and it is recorded against MyThuso rather than
   against the patient: a service that files its own failures under the patient's name will keep
   failing and will look, in its own figures, like a service nobody wanted.

   The refusals. A family member is never the interpreter and a child never is at all, and the screen
   says why rather than merely making the option absent — an absent option teaches nobody, and the
   person who needs the reason is the relative standing in the room offering to help.

   Nothing here contacts an interpreter, holds a real visit or books anybody's time. Every person on
   the roster is fictional, and the accreditation route in the vetting table is drafted rather than
   confirmed with the body it names. */

struct InterpretingView: View {
    @State private var required = true
    @State private var mode = Interpreting.modes[0].id
    @State private var dayIndex = 0
    @State private var slot = "09:00"
    @State private var cancelled = false

    private var days: [OfferedDay] { Scheduling.offeredDays() }
    private var askIso: String { days.indices.contains(dayIndex) ? days[dayIndex].id : Scheduling.isoDay(Date()) }
    private var outcome: InterpreterOutcome { Interpreting.resolve(mode: mode, iso: askIso, slot: slot) }
    private var interpreterRole: VettedRole? { Vetting.roles.first { $0.id == Interpreting.roleId } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
                DemoBadge()
                CareHeading(eyebrow: "Language and access", title: Interpreting.labels.heading,
                            subtitle: Interpreting.rule("one-roster").sentence)
                requirementCard
                modeCard
                rosterCard
                askCard
                outcomeCard
                if outcome.isHeld { cancellationCard }
                vettingCard
                refusalsCard
                rulesCard
                Text(Interpreting.notYetBuilt).font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
            }
            .padding(ThusoSpacing.space16)
        }
        .thusoGround()
        .navigationTitle(Interpreting.labels.heading).navigationBarTitleDisplayMode(.inline)
    }

    private var requirementCard: some View {
        CareCard {
            Toggle(Interpreting.labels.requirementOn, isOn: $required)
            Text(Interpreting.rule("requirement-travels").sentence).font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
            Label(Interpreting.cost.sentence, systemImage: "checkmark.seal").font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
        }
    }

    private var modeCard: some View {
        CareCard {
            Text(Interpreting.labels.chooseMode).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            Picker(Interpreting.labels.chooseMode, selection: $mode) {
                ForEach(Interpreting.modes) { Text($0.name).tag($0.id) }
            }.pickerStyle(.segmented)
            Text(Interpreting.mode(mode).detail).font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
            Text(Interpreting.mode(mode).note).font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
        }
    }

    private var rosterCard: some View {
        CareCard {
            Text(Interpreting.labels.rosterHeading).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            ForEach(Interpreting.roster.filter { $0.mode == mode }) { person in
                let hours = Interpreting.availability(mode: mode).filter { $0.interpreter.id == person.id }
                VStack(alignment: .leading, spacing: 3) {
                    Text(person.name).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                    Text("\(Interpreting.accreditation.short) \(person.reference) · \(person.area)")
                        .font(.caption2).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                    Text(person.settings.joined(separator: ", ")).font(.caption2).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                    Text(hours.isEmpty
                         ? Interpreting.labels.modeUnavailable
                         : "Free " + hours.map { "\(Scheduling.shortDate($0.date)) \($0.slot)" }.joined(separator: " · "))
                        .font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            Text(Interpreting.estimate.horizonNote).font(.caption2).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
        }
    }

    private var askCard: some View {
        CareCard {
            Text("Ask for an hour").font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            Picker("Day", selection: $dayIndex) {
                ForEach(Array(days.enumerated()), id: \.offset) { index, day in
                    Text("\(day.weekday) \(day.day)").tag(index)
                }
            }.pickerStyle(.segmented)
            Picker("Hour", selection: $slot) {
                ForEach(Scheduling.slots, id: \.self) { Text($0).tag($0) }
            }.pickerStyle(.menu)
        }
    }

    /* Three states and only three. The third is not a quieter version of the other two — it carries
       the danger tone the refusals carry, because a person reading it is being told to make another
       plan, and "we do not know" set in grey under a number-shaped layout gets read as "soon". */
    private var outcomeCard: some View {
        CareCard {
            switch outcome {
            case .matched(let free):
                Label(Interpreting.labels.matched, systemImage: "checkmark.circle")
                    .font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                Text(Interpreting.waitSentence(outcome)).font(.subheadline).foregroundStyle(ThusoTheme.charcoal)
                Text("The visit is confirmed with \(free.interpreter.name) named on it. Nothing is booked in this preview.")
                    .font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
            case .held:
                Label("\(Interpreting.labels.noneFree) — \(Interpreting.labels.heldBadge)", systemImage: "hourglass")
                    .font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.mangoInk)
                Text(Interpreting.waitSentence(outcome)).font(.subheadline).foregroundStyle(ThusoTheme.charcoal)
                Text(Interpreting.hold.sentence).font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                Text(Interpreting.hold.whatHappensNext).font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
            case .heldUnknown:
                Label("\(Interpreting.labels.noneFree) — \(Interpreting.labels.heldBadge)", systemImage: "exclamationmark.triangle")
                    .font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.danger)
                Text(Interpreting.estimate.unknown)
                    .font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.danger)
                Text(Interpreting.estimate.unknownDetail).font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
            }
            if outcome.isHeld {
                Label(Interpreting.hold.whyNotDispatched, systemImage: "xmark.octagon")
                    .font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
            }
        }
    }

    private var cancellationCard: some View {
        CareCard {
            Text(Interpreting.hold.title).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            HStack { Text("Cancelling costs"); Spacer(); Text("R\(Interpreting.cancellation.fee).00").fontWeight(.semibold) }
                .font(.subheadline).foregroundStyle(ThusoTheme.charcoal)
            Text(Interpreting.cancellation.sentence).font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
            Text(Interpreting.cancellation.notThePatientsChoice).font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
            Text(Interpreting.cancellation.keepsTheRequirement).font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
            Button(Interpreting.cancellation.label) { cancelled = true }
                .buttonStyle(QuietButton()).disabled(cancelled)
            if cancelled {
                Text("Recorded against \(Interpreting.cancellation.attributedTo), not against the patient. Nothing was cancelled — this is a preview.")
                    .font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
            }
        }
    }

    private var vettingCard: some View {
        CareCard {
            Text(Interpreting.labels.vettingHeading).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            Text(Interpreting.rule("vetted-like-anybody-else").sentence).font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
            ForEach(interpreterRole?.checks ?? []) { check in
                VStack(alignment: .leading, spacing: 3) {
                    Text(check.name).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                    Text(check.detail).font(.caption2).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                    Text(check.renewMonths.map { "Renewed every \($0) months" } ?? "Once")
                        .font(.caption2).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            if let refusal = interpreterRole?.grants.first?.refusal {
                Label(refusal, systemImage: "person.badge.shield.checkmark").font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
            }
            /* Drafted, and said so on the screen rather than in a commit message. The same rule the
               locale table is held to: a claim that something was checked needs a name, an
               organisation and a day. */
            VStack(alignment: .leading, spacing: 4) {
                Text("\(Interpreting.accreditation.body) (\(Interpreting.accreditation.short)) — \(Interpreting.accreditation.isConfirmed ? "confirmed" : "drafted, not confirmed")")
                    .font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.danger)
                Text(Interpreting.accreditation.route).font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                Text(Interpreting.accreditation.uncertainty).font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                Text(Interpreting.accreditation.whatWouldMakeItTrue).font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
            }
        }
    }

    private var refusalsCard: some View {
        CareCard {
            Text(Interpreting.labels.refusalsHeading).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            ForEach(Interpreting.refusals) { refusal in
                HStack(alignment: .top, spacing: ThusoSpacing.space12) {
                    Image(systemName: "xmark.octagon").foregroundStyle(ThusoTheme.danger)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(refusal.title).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                        Text(refusal.sentence).font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private var rulesCard: some View {
        CareCard {
            Text("The rules this screen is built out of").font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
            ForEach(Interpreting.rules) { rule in
                VStack(alignment: .leading, spacing: 3) {
                    Text(rule.title).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                    Text(rule.sentence).font(.caption).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
}
