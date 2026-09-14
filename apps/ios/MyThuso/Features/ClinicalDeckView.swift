import SwiftUI

/* The instrument deck a nurse and a doctor open a workspace on, as SwiftUI.
 *
 * WHAT IT REPLACES ON THIS PHONE. Three figures in a row on a near-black card, every one of them the
 * same size, the same weight and the same distance from the next — so the screen said "here are
 * three numbers" rather than "here is the shape of your day". Two of the doctor's three were also
 * invented: "18 reviewed today" over "Median 4 m 10 s", with nothing on the queue underneath to
 * count either from. Those two came off the web in the same pass and are gone from here as well; an
 * unverifiable productivity figure is the one number a clinical screen must not carry.
 *
 * THE ONE RULE THAT GOVERNS EVERY MARK BELOW. Nothing drawn here introduces a number. Each drawing
 * is built from the same arithmetic as the numeral beside it, off the same rows the section lists:
 * the doctor's ring has one arc per case on the queue below it and the bright arcs are the cases
 * carrying a badge, and the nurse's day is her three visits drawn to the length each service
 * actually takes, out of the catalogue the rows are priced and timed from. A reader who distrusts a
 * picture can count the list; a reader who distrusts a numeral can count the picture. The figures
 * are still decided in one place — WorkspaceDay.figures(_:) in WorkspaceView.swift, which is the
 * block scripts/check-boundaries.mjs reads for a typed digit.
 *
 * THE GROUND IS FLAT studioNight, AND DELIBERATELY NOT StudioNightCard's. That card carries a
 * radial highlight of white at ten per cent, which is right for a card holding a sentence and wrong
 * for one holding five drawings: every unlit mark on it would be measured against a ground that
 * changes across the card, and at the palest corner paper at forty per cent falls to 3.01 against
 * it — a mark that clears SC 1.4.11 in the middle of the panel and scrapes it at the edge. On a
 * flat ground every ratio the web computes in clinical-deck.css holds here exactly:
 *
 *   studioPaper on studioNight   13.59      studioLime on studioNight   12.03
 *   paper at 72% over night      7.73       — quiet text: the labels, the note, an unlit lit mark
 *   paper at 40% over night      3.42       — an unlit mark, clear of 3:1 against the ground
 *   paper at 24% over night      2.11       — the groove a ring runs in; it carries nothing
 *   paper at  6% over night                 — the lead's own panel: paper on it 11.47, lime 10.16
 *   paper at 44% over that panel 3.55       — the unlit mark ON the lighter ground. The 40% above
 *                                             measures 2.89 there, which is the kind of failure this
 *                                             project keeps finding: a colour that clears on the
 *                                             ground it was chosen against and not the one it lands
 *                                             on.
 *
 * AND COLOUR IS NEVER THE ONLY DIFFERENCE. A flagged arc is the brighter one AND the thicker one; a
 * signed visit is the filled block AND the paper-weight one. Lime is spent once per deck, on the
 * figure the screen was opened for — which is why the flagged chip is paper on night rather than
 * lime: a deck with two accents has none.
 *
 * MOTION. Every mark draws itself once on arrival, along its own path, and that is all. Reduce
 * Motion is not a shorter draw — `progress` is already 1 on the first painted frame, so stillness is
 * the finished picture rather than an empty ring. No clinical value is ever animated into place: an
 * arc is as long as the rows it counts before, during and after. The only thing that keeps moving is
 * the `now` hairline on the nurse's day, once a minute, and that is freshness rather than motion — a
 * clock that stops when a reader asks for less movement is a clock that lies to them instead. */

// MARK: - The drawing that belongs to one figure

/// One visit on the day, in minutes since midnight, and whether it has been signed off.
struct DeckVisit: Hashable {
    let from: Int
    let to: Int
    let signed: Bool
}

/// Every field is counted off the rows the figure beside it counts. Nothing here may carry a fact
/// of its own — see the rule at the top of this file.
enum DeckShape {
    /// One arc per row. `true` is the row carrying the badge the chip counts: flagged, or signed.
    case ring(_ segments: [Bool])
    /// A part of a whole, as a dial. Both numbers are the strip's own.
    case gauge(part: Int, whole: Int)
    /// One bar per row, as long as that row has waited. The longest is the row the figure names.
    case bars(_ values: [Int])
    /// The working day to scale, and where now sits in it.
    case day(visits: [DeckVisit], from: Int, to: Int)
    /// The weeks behind a headline figure. Never the week the figure itself states.
    case spark(weeks: [Int])
}

// MARK: - The ink on the deck's own ground

/* Alphas over studioPaper rather than flattened greys, for the reason ThusoOpacity's own comment
   gives: a flattened grey cannot follow the ground it sits on and an alpha has no choice but to.
   The ratios every one of these composites to are in the header above. */
enum DeckInk {
    static let ground = ThusoTheme.studioNight
    static let ink = ThusoTheme.studioPaper
    static let accent = ThusoTheme.studioLime
    /// The muted step is the token rather than a number retyped here: the same alpha every muted
    /// label on all three platforms is set at, and it darkens with whatever ground it lands on.
    static let quiet = ThusoTheme.studioPaper.opacity(ThusoOpacity.charcoalMuted)
    static let mark = ThusoTheme.studioPaper.opacity(0.40)
    /// The unlit mark on the lead's lighter panel. See the header: 40% does not clear 3:1 there.
    static let leadMark = ThusoTheme.studioPaper.opacity(0.44)
    static let track = ThusoTheme.studioPaper.opacity(0.24)
    static let edge = ThusoTheme.studioPaper.opacity(0.14)
    static let leadGround = ThusoTheme.studioPaper.opacity(0.06)
}

/// Minutes since midnight and back again, so a day can be drawn to scale rather than as three equal
/// blocks. `Scheduling.endTime` already works out when a visit ends; this is the other half of it.
enum DeckClock {
    static func minute(of text: String) -> Int {
        let pieces = text.split(separator: ":").compactMap { Int($0) }
        guard pieces.count == 2 else { return 0 }
        return pieces[0] * 60 + pieces[1]
    }
    static func text(_ minutes: Int) -> String {
        String(format: "%02d:%02d", (minutes / 60) % 24, minutes % 60)
    }
    /* The product's own zone rather than the device's. A nurse's day is in South African time
       whatever a reviewer has set their simulator to, and the schedule below the deck is already
       drawn from Scheduling.zone. */
    static func minuteNow(_ date: Date) -> Int {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = Scheduling.zone
        return calendar.component(.hour, from: date) * 60 + calendar.component(.minute, from: date)
    }
}

// MARK: - Geometry

/* Turns rather than degrees or radians, measured clockwise from twelve o'clock, because every arc
   here is "this many of that many" and a fraction of a circle is what that means. SwiftUI measures
   from three o'clock in a flipped coordinate space, which is the quarter turn subtracted below and
   the reason `clockwise: false` draws clockwise on the screen. */
private let turnsToRadians = Double.pi * 2

private struct ArcMark: Shape {
    let from: Double
    let to: Double
    /// As a fraction of the shorter side, so a dial that grows with the reader keeps its proportions.
    var radius: Double = 0.39
    func path(in rect: CGRect) -> Path {
        let side = min(rect.width, rect.height)
        var path = Path()
        path.addArc(center: CGPoint(x: rect.midX, y: rect.midY), radius: side * radius,
                    startAngle: .radians(from * turnsToRadians - .pi / 2),
                    endAngle: .radians(to * turnsToRadians - .pi / 2), clockwise: false)
        return path
    }
}

private struct RingTrack: Shape {
    var radius: Double = 0.39
    func path(in rect: CGRect) -> Path {
        let r = min(rect.width, rect.height) * radius
        return Path(ellipseIn: CGRect(x: rect.midX - r, y: rect.midY - r, width: r * 2, height: r * 2))
    }
}

/* A stagger that is a function of one progress rather than a second animation per mark. The later
   arcs start later and every one of them still finishes at the same moment, so there is one thing
   to settle when a reader asks for stillness and it is already settled. */
private func staggered(_ progress: CGFloat, index: Int, count: Int) -> CGFloat {
    guard count > 1 else { return progress }
    let spread = 0.3
    let start = spread * CGFloat(index) / CGFloat(count - 1)
    return min(1, max(0, (progress - start) / (1 - spread)))
}

// MARK: - The instruments

/// The queue, or the day, as arcs — one per row, the marked ones brighter and heavier. Colour is
/// never the only difference between the two states: a marked arc is also the thicker one.
private struct DeckRing: View {
    let segments: [Bool]
    let lit: Color
    let unlit: Color
    let progress: CGFloat
    var body: some View {
        GeometryReader { geo in
            let side = min(geo.size.width, geo.size.height)
            let count = max(segments.count, 1)
            let step = 1.0 / Double(count)
            /* A gap wide enough to count the arcs across, and never wider than a third of an arc — a
               ring of twelve cases must not dissolve into a dotted line. */
            let gap = min(0.028, step / 3)
            ZStack {
                RingTrack().stroke(DeckInk.track, lineWidth: side * 0.10)
                ForEach(Array(segments.enumerated()), id: \.offset) { index, on in
                    /* Butt caps, and this was a bug worth writing down. A round cap extends half the
                       stroke past each end of its arc, so at the lit width the two caps either side
                       of a gap grow further into it than the gap is wide — and a ring of three cases
                       is drawn as one unbroken circle. The segments are the count; a count you
                       cannot count is not one. */
                    ArcMark(from: Double(index) * step + gap / 2, to: Double(index + 1) * step - gap / 2)
                        .trim(from: 0, to: staggered(progress, index: index, count: count))
                        .stroke(on ? lit : unlit,
                                style: StrokeStyle(lineWidth: side * (on ? 0.16 : 0.10), lineCap: .butt))
                }
            }
        }
    }
}

/// A part of a whole as a dial: how much of the queue is pressing rather than merely waiting.
private struct DeckGauge: View {
    let part: Int
    let whole: Int
    let lit: Color
    let progress: CGFloat
    var body: some View {
        GeometryReader { geo in
            let side = min(geo.size.width, geo.size.height)
            let from = 0.625, sweep = 0.75
            let filled = whole > 0 ? min(1, max(0, Double(part) / Double(whole))) : 0
            ZStack {
                ArcMark(from: from, to: from + sweep)
                    .stroke(DeckInk.track, style: StrokeStyle(lineWidth: side * 0.10, lineCap: .round))
                if filled > 0 {
                    ArcMark(from: from, to: from + sweep * filled)
                        .trim(from: 0, to: progress)
                        .stroke(lit, style: StrokeStyle(lineWidth: side * 0.16, lineCap: .round))
                }
            }
        }
    }
}

/// One bar per row, as long as that row has waited. The longest is the row the figure names.
private struct DeckBars: View {
    let values: [Int]
    let lit: Color
    let unlit: Color
    let progress: CGFloat
    var body: some View {
        let longest = max(values.max() ?? 1, 1)
        GeometryReader { geo in
            VStack(alignment: .leading, spacing: 7) {
                ForEach(Array(values.enumerated()), id: \.offset) { index, value in
                    let isLongest = value == longest
                    Capsule()
                        .fill(isLongest ? lit : unlit)
                        /* A floor of four per cent so a case that has only just arrived is still a
                           bar rather than nothing at all — a queue with an invisible row in it reads
                           as a shorter queue. */
                        .frame(width: geo.size.width * min(1, max(0.04, CGFloat(value) / CGFloat(longest))),
                               height: isLongest ? 11 : 9)
                        .scaleEffect(x: staggered(progress, index: index, count: values.count), anchor: .leading)
                }
            }
        }
        .frame(height: CGFloat(values.count) * 9 + CGFloat(max(values.count - 1, 0)) * 7 + 2)
    }
}

/* The working day to scale, each visit as long as its service actually takes, and a mark for now.

   The mark is drawn only while now is inside the day. A needle parked at one end of the track at
   seven in the evening would say the last visit is about to start, which is the kind of figure a
   reader can disprove by looking out of the window. */
private struct DeckDay: View {
    let visits: [DeckVisit]
    let from: Int
    let to: Int
    let lit: Color
    let unlit: Color
    let progress: CGFloat
    var body: some View {
        // Once a minute, and it keeps ticking under Reduce Motion: see the note at the top of the file.
        TimelineView(.everyMinute) { context in
            let span = max(to - from, 1)
            let minuteNow = DeckClock.minuteNow(context.date)
            let inside = minuteNow >= from && minuteNow <= to
            VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
                GeometryReader { geo in
                    let place = { (minute: Int) in geo.size.width * CGFloat(minute - from) / CGFloat(span) }
                    ZStack(alignment: .topLeading) {
                        Capsule().fill(DeckInk.track)
                        ForEach(Array(visits.enumerated()), id: \.offset) { index, visit in
                            Capsule()
                                .fill(index == 0 ? lit : visit.signed ? DeckInk.ink : unlit)
                                .frame(width: max(place(visit.to) - place(visit.from), 6), height: 22)
                                .scaleEffect(x: staggered(progress, index: index, count: visits.count), anchor: .leading)
                                .offset(x: place(visit.from), y: 6)
                        }
                        /* A hairline rather than a filled needle, and it never draws itself in: a
                           mark that slid into place would be a clock being drawn rather than read. */
                        if inside {
                            Capsule().fill(DeckInk.ink)
                                .frame(width: 2, height: 34)
                                .offset(x: min(max(place(minuteNow), 0), geo.size.width - 2))
                        }
                    }
                }
                .frame(height: 34)
                /* The two ends of the track, so the blocks on it are a day rather than three shapes.
                   The middle says where now is only while now is in the day: "before the first
                   visit" is what an empty middle already says, and a third state written out in
                   words would be saying it twice. */
                HStack(spacing: ThusoSpacing.space8) {
                    Text(DeckClock.text(from)).thusoFont(ThusoType.caption).foregroundStyle(DeckInk.quiet)
                    Spacer(minLength: 0)
                    if inside {
                        Text("now \(DeckClock.text(minuteNow))").thusoFont(ThusoType.caption).foregroundStyle(DeckInk.ink)
                        Spacer(minLength: 0)
                    }
                    Text(DeckClock.text(to)).thusoFont(ThusoType.caption).foregroundStyle(DeckInk.quiet)
                }
                .monospacedDigit()
            }
        }
    }
}

/// The weeks behind the headline figure. Flat where a week was flat; it invents no trend, and the
/// week the figure itself states is not on it — a week still being added to, drawn as the end of a
/// series, reads as a fall rather than as a week that has not finished.
private struct DeckSpark: View {
    let weeks: [Int]
    let lit: Color
    let progress: CGFloat
    var body: some View {
        let high = weeks.max() ?? 1, low = weeks.min() ?? 0
        let spread = max(high - low, 1)
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            GeometryReader { geo in
                let x = { (index: Int) in
                    weeks.count > 1 ? geo.size.width * CGFloat(index) / CGFloat(weeks.count - 1) : geo.size.width / 2
                }
                let y = { (value: Int) in
                    geo.size.height * (0.9 - 0.7 * CGFloat(value - low) / CGFloat(spread))
                }
                let line = Path { path in
                    for (index, week) in weeks.enumerated() {
                        let next = CGPoint(x: x(index), y: y(week))
                        index == 0 ? path.move(to: next) : path.addLine(to: next)
                    }
                }
                ZStack {
                    Path { path in
                        path.addPath(line)
                        path.addLine(to: CGPoint(x: geo.size.width, y: geo.size.height))
                        path.addLine(to: CGPoint(x: 0, y: geo.size.height))
                        path.closeSubpath()
                    }
                    .fill(lit.opacity(0.3))
                    .mask(LinearGradient(colors: [.black, .clear], startPoint: .top, endPoint: .bottom))
                    .opacity(Double(progress))
                    line.trim(from: 0, to: progress)
                        .stroke(lit, style: StrokeStyle(lineWidth: 2, lineJoin: .round))
                }
            }
            .frame(height: 52)
            // What the line is, so nobody reads it as this week's own shape.
            Text("\(weeks.count) weeks before this one")
                .thusoFont(ThusoType.caption).foregroundStyle(DeckInk.quiet)
        }
    }
}

// MARK: - A chip on the deck

/* The deck's own chip, and it is not the night card's. StudioNightChip fills the flagged one lime,
   which is right on a card whose only accent it is and wrong here: the lead instrument already
   spends lime on its marks, and a second lime object would leave the deck with two accents and
   therefore with none. So the flagged chip is the deck's ink filled — studioNight on studioPaper,
   13.59:1, the same pair the other way round — and everything else is outlined quiet. */
private struct DeckChip: View {
    let text: String
    let flagged: Bool
    @Environment(\.dynamicTypeSize) private var typeSize
    private var shape: AnyShape {
        typeSize.isAccessibilitySize
            ? AnyShape(RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous))
            : AnyShape(Capsule())
    }
    var body: some View {
        Text(text)
            .thusoFont(ThusoType.caption, weight: .medium)
            .foregroundStyle(flagged ? DeckInk.ground : DeckInk.quiet)
            .padding(.horizontal, ThusoSpacing.space12).padding(.vertical, 3)
            .fixedSize(horizontal: false, vertical: true)
            .background(flagged ? DeckInk.ink : .clear, in: shape)
            .overlay(shape.stroke(flagged ? DeckInk.ink : DeckInk.mark, lineWidth: 1))
    }
}

// MARK: - One instrument

private struct DeckInstrument: View {
    let figure: WorkspaceFigure
    let isLead: Bool
    let progress: CGFloat
    @Environment(\.dynamicTypeSize) private var typeSize
    /* The two dial sizes the web settles on below its 900px breakpoint, which is every phone:
       124 for the lead and 116 for the pair beside it. The pair stay smaller than the lead whatever
       the screen does — a dial the same size as the lead's is a second lead, and a deck with two
       leads has none. They grow with the reader rather than stepping at a size class, so a 600-point
       tablet column is not simply a wide phone with a small ring on it. */
    @ScaledMetric(relativeTo: .largeTitle) private var leadDial: CGFloat = 124
    @ScaledMetric(relativeTo: .largeTitle) private var restDial: CGFloat = 116
    @ScaledMetric(relativeTo: .largeTitle) private var leadFigure: CGFloat = ThusoType.metricLarge
    @ScaledMetric(relativeTo: .largeTitle) private var restFigure: CGFloat = ThusoType.metric
    @ScaledMetric(relativeTo: .footnote) private var affix: CGFloat = ThusoType.cardTitle

    /// The lead is the only instrument that spends the accent. On the other two a lit mark is the
    /// quiet tone — still the brightest thing in its own drawing, still two channels apart from an
    /// unlit one, and not a second thing on the deck claiming to be the most important.
    private var lit: Color { isLead ? DeckInk.accent : DeckInk.quiet }
    private var unlit: Color { isLead ? DeckInk.leadMark : DeckInk.mark }
    private var dial: CGFloat { isLead ? leadDial : restDial }

    var body: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            DeckChip(text: figure.chip, flagged: figure.flagged)
            switch figure.shape {
            case .ring(let segments):
                dialBox { DeckRing(segments: segments, lit: lit, unlit: unlit, progress: progress) }
            case .gauge(let part, let whole):
                dialBox { DeckGauge(part: part, whole: whole, lit: lit, progress: progress) }
            case .bars(let values):
                stacked { DeckBars(values: values, lit: lit, unlit: unlit, progress: progress) }
            case .day(let visits, let from, let to):
                stacked { DeckDay(visits: visits, from: from, to: to, lit: lit, unlit: unlit, progress: progress) }
            case .spark(let weeks):
                stacked { DeckSpark(weeks: weeks, lit: lit, progress: progress) }
            case .none:
                numeral
            }
            // The labels sit at the foot of their column whatever height the drawing above them took.
            Spacer(minLength: 0)
            Text(figure.label).thusoFont(ThusoType.caption).foregroundStyle(DeckInk.quiet)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spoken)
    }

    /// A dial puts the numeral in the middle of itself, which is the whole reason to draw a ring
    /// rather than a bar. It shrinks to the column it was given rather than pushing it wider.
    @ViewBuilder private func dialBox<Content: View>(@ViewBuilder _ drawing: () -> Content) -> some View {
        ZStack {
            drawing()
            numeral
        }
        .frame(width: dial, height: dial)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Everything else puts the numeral above the drawing, because a line under a figure is read as
    /// that figure's history and a line through one is read as an error.
    @ViewBuilder private func stacked<Content: View>(@ViewBuilder _ drawing: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            numeral
            drawing()
        }
    }

    private var numeral: some View {
        HStack(alignment: .firstTextBaseline, spacing: 3) {
            if let prefix = figure.prefix {
                Text(prefix).font(.system(size: affix, weight: .regular)).foregroundStyle(DeckInk.quiet)
            }
            Text(figure.value)
                .font(.system(size: isLead ? leadFigure : restFigure, weight: .light).monospacedDigit())
                .foregroundStyle(DeckInk.ink)
        }
        .lineLimit(1)
        .minimumScaleFactor(0.6)
    }

    /* One element rather than four. A ring of three arcs read out after the words "3" and "2 out of
       range" is the same sentence spoken twice; what the drawings do say that the numeral does not —
       the shape of a day, the weeks behind a total — is said here instead. */
    private var spoken: String {
        let head = "\(figure.label), \(figure.prefix ?? "")\(figure.value), \(figure.chip)"
        switch figure.shape {
        case .day(let visits, let from, let to):
            return "\(head). \(visits.count) visits between \(DeckClock.text(from)) and \(DeckClock.text(to)), \(visits.filter(\.signed).count) signed off"
        case .spark(let weeks):
            return "\(head). Drawn over the \(weeks.count) weeks before this one"
        default:
            return head
        }
    }
}

// MARK: - The deck

struct ClinicalDeck: View {
    let role: String
    let eyebrow: String
    let note: String
    let figures: [WorkspaceFigure]
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var drawn = false

    var body: some View {
        /* Already finished on the first painted frame when a reader has asked for less motion. A
           reduced entrance is not a shorter one: it is no entrance, with the complete mark there. */
        let progress: CGFloat = reduceMotion || drawn ? 1 : 0
        let lead = figures.first
        let rest = Array(figures.dropFirst())
        VStack(alignment: .leading, spacing: ThusoSpacing.space20) {
            head
            Rectangle().fill(DeckInk.edge).frame(height: 1).accessibilityHidden(true)
            if let lead {
                /* The lead is a panel and the other two are not: the night lifted six per cent, which
                   is depth by one step of the same colour rather than by a second shadow inside a
                   shadowed card. It is what makes the deck say what the screen is for before it says
                   anything else — a row of three identical cells is the composition this whole piece
                   of work exists to replace. */
                DeckInstrument(figure: lead, isLead: true, progress: progress)
                    .padding(.horizontal, ThusoSpacing.space16)
                    .padding(.vertical, ThusoSpacing.space16)
                    .background(DeckInk.leadGround, in: RoundedRectangle(cornerRadius: ThusoRadius.card, style: .continuous))
            }
            /* Two-up while two numerals and their labels fit on a line, and a column when they do
               not. The accessibility sizes are the point at which they do not: a dial beside a dial
               at three times the type is two columns of one word each. */
            if typeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: ThusoSpacing.space24) {
                    ForEach(rest) { DeckInstrument(figure: $0, isLead: false, progress: progress) }
                }
            } else {
                /* Stretched to the taller of the two rather than hugged, so the two labels sit on
                   one line whatever height the drawing above each of them takes. Three figures at
                   three heights is the one thing a row of numerals must never do. */
                HStack(alignment: .top, spacing: ThusoSpacing.space20) {
                    ForEach(rest) {
                        DeckInstrument(figure: $0, isLead: false, progress: progress)
                            .frame(maxHeight: .infinity, alignment: .topLeading)
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, ThusoSpacing.space20)
        .padding(.top, ThusoSpacing.space20)
        .padding(.bottom, ThusoSpacing.space24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(DeckInk.ground, in: RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(role) — the shape of the work below")
        .onAppear {
            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.76)) { drawn = true }
        }
    }

    private var head: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
            /* What the deck is, not which workspace it is in: the headline three lines above this
               one already frames the role, and a screen that says the same word twice at the top of
               itself has spent its most valuable line saying nothing. */
            Text(eyebrow)
                .thusoFont(ThusoType.caption, weight: .semibold)
                .tracking(1.4)
                .foregroundStyle(DeckInk.accent)
            /* Not a disclosure and not a boast: the one sentence that tells a reader what to do if a
               figure looks wrong, which is to count the rows it was counted from. */
            Text(note)
                .thusoFont(ThusoType.caption)
                .foregroundStyle(DeckInk.quiet)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}
