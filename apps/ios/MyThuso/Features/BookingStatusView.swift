import SwiftUI

/* Where a booking stands, as a timeline of booking.json’s three states.

   Every state is drawn, in the contract’s order, so a person sees what comes next as well as where
   they are. Whether each has been reached is said in words beside its name — booking.json’s own
   status words, the same three the web prints — and the filled mark and the darker rule are a second
   signal, never the only one.

   Everything here is read from the contract: the heading, each state’s name and what it means for the
   patient, the standing words, who accepted it, and why an as-soon-as-possible visit stays asked for.
   The booking capability’s notice closes it, because a status is exactly the screen that could be
   mistaken for a nurse having agreed to come. */
struct BookingStatusView: View {
    let state: BookingState
    /// Asked for as soon as possible, so there is no hour for anybody to accept.
    let asap: Bool
    @ScaledMetric(relativeTo: .body) private var mark: CGFloat = 22

    private enum Standing { case done, now, notYet }
    private func standing(_ step: BookingState) -> Standing {
        if step == state { return .now }
        switch (step, state) {
        case (.requested, _): return .done
        case (.confirmed, .cancelled): return asap ? .notYet : .done
        default: return .notYet
        }
    }
    private func word(_ standing: Standing) -> String {
        switch standing {
        case .done: return BookingData.StatusWords.reached
        case .now: return BookingData.StatusWords.current
        case .notYet: return BookingData.StatusWords.waiting
        }
    }

    var body: some View {
        CareCard(spacing: ThusoSpacing.space12) {
            Text(BookingData.statusHeading).font(.thuso(.headline)).foregroundStyle(ThusoRole.foreground)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(BookingState.allCases.enumerated()), id: \.element) { index, step in
                    row(step, standing: standing(step), last: index == BookingState.allCases.count - 1)
                }
            }
            if state == .confirmed { note(BookingData.acceptedBy) }
            if asap && state == .requested { note(BookingData.asapStaysRequested) }
            CapabilityNotice(of: "booking")
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("booking-status")
    }

    private func row(_ step: BookingState, standing: Standing, last: Bool) -> some View {
        let words = step.words
        let reached = standing != .notYet
        return HStack(alignment: .top, spacing: ThusoSpacing.space12) {
            VStack(spacing: 0) {
                ZStack {
                    Circle().fill(reached ? ThusoRole.primary : ThusoRole.surface)
                    Circle().strokeBorder(reached ? ThusoRole.primary : ThusoRole.inputEdge, lineWidth: 1.5)
                    if reached {
                        Image(systemName: standing == .now ? "circle.fill" : "checkmark")
                            .font(.thuso(.caption2, weight: .bold)).imageScale(standing == .now ? .small : .medium)
                            .foregroundStyle(ThusoRole.primaryForeground)
                    }
                }
                .frame(width: mark, height: mark)
                if !last {
                    Rectangle().fill(standing == .done ? ThusoRole.night : ThusoRole.border)
                        .frame(width: 2).frame(maxHeight: .infinity)
                }
            }
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space8) { title(words); chip(standing); Spacer(minLength: 0) }
                    VStack(alignment: .leading, spacing: ThusoSpacing.space4) { title(words); chip(standing) }
                }
                Text(words.patientWords).font(.thuso(.footnote))
                    .foregroundStyle(reached ? ThusoRole.foreground : ThusoRole.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.bottom, last ? 0 : ThusoSpacing.space16)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityElement(children: .combine)
    }

    private func title(_ words: BookingStateWords) -> some View {
        Text(words.name).font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
    }

    private func chip(_ standing: Standing) -> some View {
        MetricChip(text: word(standing), tone: standing == .now ? .filled : (standing == .done ? .neutral : .quiet))
    }

    private func note(_ sentence: String) -> some View {
        Text(sentence).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
            .fixedSize(horizontal: false, vertical: true)
    }
}
