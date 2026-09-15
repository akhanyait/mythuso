import SwiftUI

/* The step where a patient chooses who comes.

   WHAT A PERSON OPENED IT FOR is the choice, so the three ways of choosing lead the step at full
   weight and everything else is quieter than them. The named list appears only once somebody asks to
   name a nurse, and the nurses who are not offered sit at the foot on the recessed fill, because they
   are an explanation rather than an option.

   A NURSE WHO IS NOT OFFERED IS STILL SHOWN, with the reason beside her. A silent filter cannot tell a
   patient why the nurse she saw last time is missing, and the reason is the booking capability’s own
   sentence, looked up in Models/Booking.swift, never written here. Nothing on this step is told apart
   by colour alone: an option you can take has a radio mark and is a button; one you cannot has no
   mark, is not a button, and carries its sentence.

   The continuity note sits under the choices rather than at the foot of the step, because it is about
   the choice — related things close, unrelated far.

   Every word is packages/catalog/booking.json’s, through the generated BookingData. */
struct NurseChoiceView: View {
    let options: PersonOptions
    /// Who the visit is for, so the previous-nurse sentences can name them.
    let patient: String
    /// nearest, previous or named: the option, before a nurse is attached to it.
    @Binding var kind: String
    /// The nurse picked from the named list, if one has been.
    @Binding var named: String?

    private func option(_ id: String) -> BookingPersonOption? { BookingData.Person.options.first { $0.id == id } }

    var body: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
            VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
                Text(BookingData.Person.heading).font(.title2.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                Text(BookingData.Person.lead).font(.subheadline).foregroundStyle(ThusoTheme.studioInkMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            VStack(spacing: ThusoSpacing.space8) {
                if let nearest = option("nearest") {
                    ChoiceCard(title: nearest.name, detail: nearest.detail, chosen: kind == "nearest") { kind = "nearest" }
                }
                if let previous = option("previous") { previousCard(previous) }
                if let byName = option("named") {
                    ChoiceCard(title: byName.name, detail: byName.detail, chosen: kind == "named") { kind = "named" }
                }
            }
            if kind == "named" { namedList }
            Text(BookingData.Person.continuity).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                .fixedSize(horizontal: false, vertical: true)
            if !options.notOffered.isEmpty { notOffered.padding(.top, ThusoSpacing.space8) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .sensoryFeedback(.selection, trigger: kind)
        .sensoryFeedback(.selection, trigger: named)
    }

    /* The nurse seen last time, offered while her badge is current. When there was nobody, or she is not
       offered today, the option is drawn without a radio mark and with the reason in its place — the
       shape says it cannot be chosen before the words do. */
    @ViewBuilder private func previousCard(_ previous: BookingPersonOption) -> some View {
        if let seen = options.previous, seen.offered {
            ChoiceCard(title: previous.name, detail: previous.detail,
                       footnote: "\(seen.candidate.name) · \(BookingData.Person.badgeName)",
                       chosen: kind == "previous") { kind = "previous" }
                .accessibilityHint(BookingData.Person.badgeSentence)
        } else {
            let reason = options.previous.map { seen in
                Booking.fill(BookingData.Person.previousNotOffered,
                             ["person": patient, "reason": seen.candidate.notOfferedBecause ?? Booking.refusal("nurse-badge-not-current")?.sentence ?? ""])
            } ?? Booking.fill(BookingData.Person.noPrevious, ["person": patient])
            HStack(alignment: .top, spacing: ThusoSpacing.space12) {
                Image(systemName: "minus.circle").font(.title3).foregroundStyle(ThusoTheme.charcoalMutedOnCloud)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
                    Text(previous.name).thusoFont(ThusoType.cardTitle, weight: .semibold).foregroundStyle(ThusoTheme.charcoal)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(reason).font(.footnote).foregroundStyle(ThusoTheme.charcoal)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            .padding(ThusoSpacing.space16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(ThusoTheme.cloud, in: RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous))
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("person-previous-unavailable")
        }
    }

    /* Nearest first, from the suburb the visit is in. The badge is a mark and a word, and what it means is
       the hint VoiceOver reads after it — the verified tier’s own sentence from trust.json. */
    private var namedList: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            CareSectionHeader(BookingData.Person.namedHeading)
            ForEach(options.offered) { nurse in
                let on = named == nurse.id
                let shape = RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous)
                Button { named = nurse.id } label: {
                    HStack(alignment: .top, spacing: ThusoSpacing.space12) {
                        Image(systemName: on ? "largecircle.fill.circle" : "circle")
                            .font(.title3).foregroundStyle(ThusoTheme.charcoal).accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
                            Text(nurse.name).font(.body.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                                .fixedSize(horizontal: false, vertical: true)
                            Text(nurse.worksIn).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                                .fixedSize(horizontal: false, vertical: true)
                            Label(BookingData.Person.badgeName, systemImage: "checkmark.seal.fill")
                                .font(.footnote.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(ThusoSpacing.space12)
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .background(on ? ThusoTheme.studioLilac : ThusoTheme.surface, in: shape)
                    .overlay(shape.stroke(on ? ThusoTheme.charcoal : ThusoTheme.studioLine, lineWidth: 1))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(nurse.name). \(nurse.worksIn). \(BookingData.Person.badgeName)")
                .accessibilityHint(BookingData.Person.badgeSentence)
                .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
            }
        }
    }

    /* On the recessed fill and at the foot of the step: an explanation, not an option. No radio mark, no
       button, and the booking capability’s sentence beside each name. */
    private var notOffered: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            CareSectionHeader(BookingData.Person.notOfferedHeading)
            CareCard(weight: .quiet) {
                ForEach(Array(options.notOffered.enumerated()), id: \.element.id) { index, nurse in
                    if index > 0 { Hairline() }
                    VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
                        Text(nurse.name).font(.subheadline.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(nurse.worksIn).font(.footnote).foregroundStyle(ThusoTheme.charcoalMutedOnCloud)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(nurse.notOfferedBecause ?? "").font(.footnote).foregroundStyle(ThusoTheme.charcoal)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityElement(children: .combine)
                }
            }
        }
        .accessibilityIdentifier("person-not-offered")
    }
}
