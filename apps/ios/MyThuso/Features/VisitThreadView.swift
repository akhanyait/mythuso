import SwiftUI

/* The thread between a patient and the nurse on one visit.

   Four things are refused, and the screen is shaped by them rather than decorated around them.

   WORDS ONLY. There is no attachment control, no camera and no photo picker, and none is hidden behind
   a menu: a photo of a wound on a nurse’s phone is a clinical record on a personal device with no
   consent behind it. SHORT, counted live against booking.json’s limit, with the route’s own sentence
   once it is passed. CLOSED WITH THE VISIT: a finished or cancelled visit’s thread says why, keeps what
   was said, and draws no field at all rather than a disabled one. And NOBODY WATCHES IT, which is said
   above the field, with the emergency numbers, before anybody types — not after a silence.

   It is not a health record, and it says so. Messages live in PreviewStore’s memory and nowhere else:
   nothing is written to the disk and nothing is delivered, which the messaging capability’s notice and
   the contract’s kept sentence both say. */
struct VisitThreadView: View {
    /// The visit this thread belongs to. Nil for a sample row with no visit behind it.
    let threadKey: UUID?
    /// Why the thread is closed, or nil while it is open.
    let closed: BookingThreadClosed?
    /// The nurse the booking names, or nil while it is whoever is nearest.
    var nurseName: String? = nil
    /// When a completed visit’s thread closes, while it is still open for follow-up; nil otherwise.
    var closesAt: Date? = nil
    @EnvironmentObject private var store: PreviewStore
    @State private var draft = ""
    @State private var refused: BookingRefusal?
    @FocusState private var writing: Bool

    private var messages: [VisitThreadMessage] { threadKey.flatMap { store.threads[$0] } ?? [] }
    private var count: Int { Booking.length(draft) }
    private var over: Bool { count > BookingData.Thread.maxCharacters }
    private var blank: Bool { count == 0 }

    /* The composer is brought up when the field takes focus. Looked at in the simulator, the keyboard rose
       over the field and left a person typing into something they could not see, with the emergency
       sentence the only thing above the keyboard. No animation: it is a jump to where the typing is. */
    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
                    CareHeading(eyebrow: "", title: BookingData.Thread.title, subtitle: BookingData.Thread.lead)
                    CapabilityNotice(of: "messaging")
                    Text(BookingData.Thread.notARecord).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                    /* Words only, or — if the generated setting ever says photos are on — that photos are not in
                       this preview yet. A phone holds no clinical review state, so it never claims one. */
                    Text(BookingData.Thread.photos ? BookingData.Thread.photosNotInPreview : BookingData.Thread.wordsOnly)
                        .font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                    if closed == nil, let closesAt {
                        Label(Booking.fill(BookingData.Thread.openAfterVisit, ["closes": Scheduling.format(closesAt, "d MMM, HH:mm")]), systemImage: "clock")
                            .font(.thuso(.footnote)).foregroundStyle(ThusoRole.foreground)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    conversation
                    if let closed { closedNote(closed) } else { composer.id("thread-composer") }
                }
                .padding(.vertical, ThusoSpacing.space16)
            }
            .onChange(of: writing) { _, focused in
                guard focused else { return }
                DispatchQueue.main.async { proxy.scrollTo("thread-composer", anchor: .bottom) }
            }
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .scrollDismissesKeyboard(.interactively)
        .thusoGround()
        .navigationTitle(BookingData.Thread.openLabel).navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.visible, for: .navigationBar).toolbarBackground(ThusoRole.surface, for: .navigationBar)
    }

    @ViewBuilder private var conversation: some View {
        if messages.isEmpty {
            if closed == nil {
                Text(BookingData.Thread.empty).font(.thuso(.subheadline)).foregroundStyle(ThusoRole.mutedForeground)
                    .padding(ThusoSpacing.space16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(ThusoRole.muted, in: RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous))
                    .fixedSize(horizontal: false, vertical: true)
            }
        } else {
            VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
                ForEach(messages) { message in bubble(message) }
            }
            .accessibilityElement(children: .contain)
        }
    }

    /* Yours on the lilac tile and the nurse’s on white, each named in words above it — the fill is a
       second signal, never the only one. Both keep the same left edge rather than opposite sides: at the
       accessibility sizes a message pushed to one side is a message squeezed into a third of the screen. */
    private func bubble(_ message: VisitThreadMessage) -> some View {
        let mine = message.role == .patient
        let who = mine ? BookingData.Thread.you : (nurseName ?? BookingData.Review.nurseLabel)
        let shape = RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous)
        return VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
            HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space8) {
                Text(who).font(.thuso(.footnote, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                Spacer(minLength: ThusoSpacing.space8)
                Text(Scheduling.format(message.at, "HH:mm")).font(.thuso(.footnote).monospacedDigit()).foregroundStyle(ThusoRole.mutedForeground)
            }
            Text(message.words).font(.thuso(.body)).foregroundStyle(ThusoRole.foreground)
                .fixedSize(horizontal: false, vertical: true)
            if mine {
                Text(BookingData.Thread.kept).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(ThusoSpacing.space12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(mine ? ThusoRole.surfaceRaised : ThusoRole.surface, in: shape)
        .overlay(shape.stroke(mine ? Color.clear : ThusoRole.border, lineWidth: 1))
        .accessibilityElement(children: .combine)
    }

    private func closedNote(_ closed: BookingThreadClosed) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space8) {
            Image(systemName: "lock").font(.thuso(.subheadline)).foregroundStyle(ThusoRole.foreground).accessibilityHidden(true)
            Text(closed.sentence).font(.thuso(.subheadline)).foregroundStyle(ThusoRole.foreground)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(ThusoSpacing.space16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ThusoRole.muted, in: RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("thread-closed")
    }

    /* The emergency sentence first, then the field, then the count and Send on one line while they fit.
       Send does nothing with a blank message rather than refusing it, because nothing was attempted; past
       the limit it is held too, and the route’s own sentence says why beneath the count. The mango wash
       carries charcoal, never mango as the word. */
    private var composer: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space8) {
                Image(systemName: "phone").font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                    .accessibilityHidden(true)
                Text(BookingData.Thread.nobodyWatches).font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(ThusoSpacing.space12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(ThusoRole.warningTint, in: RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous).stroke(ThusoRole.warningInk.opacity(0.24), lineWidth: 1))
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("thread-nobody-watches")
            TextField(BookingData.Thread.inputLabel, text: $draft, axis: .vertical)
                .lineLimit(2...6)
                .focused($writing)
                .font(.thuso(.body)).foregroundStyle(ThusoRole.foreground)
                .padding(ThusoSpacing.space12)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .topLeading)
                .background(ThusoRole.surface, in: RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous)
                    .stroke(writing ? ThusoRole.foreground : ThusoRole.inputEdge, lineWidth: writing ? 1.5 : 1))
                .accessibilityLabel(BookingData.Thread.inputLabel)
                .accessibilityIdentifier("thread-input")
                .onChange(of: draft) { _, _ in refused = nil }
            ViewThatFits(in: .horizontal) {
                HStack(spacing: ThusoSpacing.space12) { counter; Spacer(minLength: ThusoSpacing.space8); send.fixedSize(horizontal: true, vertical: false) }
                VStack(alignment: .leading, spacing: ThusoSpacing.space8) { counter; send }
            }
            if let sentence = (over ? Booking.postRefusal(draft, closed: false) : refused)?.sentence {
                Label(sentence, systemImage: "exclamationmark.circle").font(.thuso(.footnote)).foregroundStyle(ThusoRole.dangerInk)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("thread-refusal")
            }
        }
    }

    private var counter: some View {
        Text("\(count) / \(BookingData.Thread.maxCharacters)")
            .font(.thuso(.footnote, weight: over ? .semibold : .regular).monospacedDigit())
            .foregroundStyle(over ? ThusoRole.dangerInk : ThusoRole.mutedForeground)
            .accessibilityLabel("\(count) of \(BookingData.Thread.maxCharacters)")
            .accessibilityIdentifier("thread-count")
    }

    private var send: some View {
        Button(action: post) {
            Label(BookingData.Thread.sendLabel, systemImage: "arrow.up").padding(.horizontal, ThusoSpacing.space8)
        }
        .buttonStyle(CareButton())
        .disabled(blank || over)
        .opacity(blank || over ? 0.45 : 1)
        .accessibilityIdentifier("thread-send")
    }

    private func post() {
        let words = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !words.isEmpty, let threadKey else { return }
        if let refusal = Booking.postRefusal(words, closed: closed != nil) { refused = refusal; return }
        store.threads[threadKey, default: []].append(VisitThreadMessage(id: UUID(), role: .patient, words: words, at: Date()))
        draft = ""
        refused = nil
    }
}
