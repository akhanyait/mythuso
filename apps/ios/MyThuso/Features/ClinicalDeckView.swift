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
    /// One column per row, oldest first; `lit` marks the rows the figure beside it adds up.
    case columns(values: [Int], lit: [Bool])
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
    var track: Color = DeckInk.track
    var body: some View {
        GeometryReader { geo in
            let side = min(geo.size.width, geo.size.height)
            let count = max(segments.count, 1)
            let step = 1.0 / Double(count)
            /* A gap wide enough to count the arcs across, and never wider than a third of an arc — a
               ring of twelve cases must not dissolve into a dotted line. */
            let gap = min(0.028, step / 3)
            ZStack {
                RingTrack().stroke(track, lineWidth: side * 0.10)
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
    var track: Color = DeckInk.track
    var body: some View {
        GeometryReader { geo in
            let side = min(geo.size.width, geo.size.height)
            let from = 0.625, sweep = 0.75
            let filled = whole > 0 ? min(1, max(0, Double(part) / Double(whole))) : 0
            ZStack {
                ArcMark(from: from, to: from + sweep)
                    .stroke(track, style: StrokeStyle(lineWidth: side * 0.10, lineCap: .round))
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
            case .columns(let values, let marks):
                stacked { DeckColumns(values: values, marks: marks, lit: lit, unlit: unlit, progress: progress).frame(height: 52) }
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

// MARK: - The deck, spent on a whole screen

/* THE SEVEN SCREENS BEHIND THE DECK, IN THE DECK'S OWN GRAMMAR.
 *
 * The founder opened the doctor's deck and then Patient file, Consultation record and Protocols, and
 * on the nurse's side Assessments, Thuso Kit, Earnings & payouts and Vetting, and said every one of
 * them was boring. The screenshots agreed: a clinician crossed from a night canvas with a ring of her
 * own rows on it into a column of white boxes at one elevation, and nothing on the way explained the
 * change of dialect. The web had the same fault and fixed it in clinical-records.css and
 * nurse-tools.css; this is the native half.
 *
 * So what follows is the deck's composition lifted off the landing and made into parts a screen is
 * built from — the composition apps/web/src/features/clinical-deck.css draws. A night canvas carrying
 * a headline with circular glyph badges set inside the sentence. The one figure the screen is about,
 * on dark glass, which is the only place lime is spent. A pale indigo panel with its chart drawn
 * BEHIND its numeral rather than beside it, and a night card crossing that panel's edge. Pill
 * clusters for the choice a design review turns on. Circular affordances. And a light sheet standing
 * on the canvas's lower edge, one elevation above it.
 *
 * INDIGO WHERE THE REFERENCE WAS VIOLET. The reference draws its quiet half in lavender; MyThuso ships
 * an indigo family, so the panel is indigoSoft and its marks are indigo. No colour token was added.
 *
 * THE RULE THE DECK ABOVE IS BUILT ON HOLDS UNCHANGED. Nothing drawn introduces a number: every ring,
 * gauge, bar and line is counted off rows the same screen lists, so a reader who distrusts the picture
 * can count the list. And no clinical value moves. A reading's trend is the finished drawing on the
 * first frame whatever Reduce Motion says; only a count of rows draws itself in, and under Reduce
 * Motion not even that.
 *
 * MEASURED ON THE GROUND EACH PAIR ACTUALLY LANDS ON, with the sRGB formula the build runs:
 *   the flat night            paper 13.59   lime 12.03   quiet 7.75   studioPeach 11.43
 *                             `danger` is 2.28 here and is never written on the dark; a refusal on
 *                             the canvas is peach and a glyph and a word.
 *   the glass, paper at 8% over night (#313933)
 *                             paper 10.78   lime 9.54   quiet 6.45   peach 9.06
 *                             an unlit mark at 44% 3.45 — 40% would be the colour that clears on the
 *                             night it was chosen against and not on the glass it lands on
 *   a control's edge          paper at 44%: 3.84 on the night, 3.45 on the glass
 *   indigoSoft                charcoal 15.24   studioInkMuted 6.19   indigoDeep 11.23
 *                             indigo 9.26 — the lit mark   indigo at 58% 3.15 — the unlit one
 *   the badge                 indigoSoft on studioNight 13.39, indigoDeep inside it 11.23
 *   the float card            studioNight against indigoSoft 13.39
 * And colour is never the only difference between two states: a lit arc is thicker, the longest bar
 * is taller, a chosen pill is filled and heavier, and a refusal says so in words beside its glyph. */

extension DeckInk {
    static let glass = ThusoTheme.studioPaper.opacity(0.08)
    static let glassEdge = ThusoTheme.studioPaper.opacity(0.16)
    /// The edge of anything pressable on the canvas. See the table above: 3.84 and 3.45.
    static let control = ThusoTheme.studioPaper.opacity(0.44)
    /// A refusal on the dark. `danger` measures 2.28 on studioNight and may not be a word there.
    static let refusal = ThusoTheme.studioPeach
    static let panel = ThusoTheme.indigoSoft
    static let panelInk = ThusoTheme.charcoal
    static let panelQuiet = ThusoTheme.studioInkMuted
    static let panelLit = ThusoTheme.indigo
    static let panelMark = ThusoTheme.indigo.opacity(0.58)
    static let panelTrack = ThusoTheme.indigo.opacity(0.18)
}

/// The one raised elevation tokens.json declares — `0 4px 16px` of ink at ten per cent — and nothing
/// stacks a second one under it.
extension View {
    func deckRaised() -> some View { shadow(color: ThusoTheme.ink.opacity(0.10), radius: 8, x: 0, y: 4) }
}

/// Which ground a figure is drawn on, because a palette belongs to a ground and not to a width.
enum DeckGround { case glass, night, panel }

// MARK: Layout

/* Wraps what it holds onto as many lines as it needs, and centres each line on its tallest member.
   The headline needs it because a badge is a view rather than a character and cannot sit inside a
   Text; a pill cluster needs it because a row of choices that scrolls sideways hides the ones a
   reviewer came to compare. */
struct DeckFlow: Layout {
    var spacing: CGFloat = ThusoSpacing.space8
    var lineSpacing: CGFloat = ThusoSpacing.space8

    private func lines(_ width: CGFloat, _ subviews: Subviews) -> [[(Int, CGSize)]] {
        var rows: [[(Int, CGSize)]] = [[]]
        var x: CGFloat = 0
        for (index, view) in subviews.enumerated() {
            let size = view.sizeThatFits(ProposedViewSize(width: width, height: nil))
            if x > 0 && x + size.width > width {
                rows.append([])
                x = 0
            }
            rows[rows.count - 1].append((index, CGSize(width: min(size.width, width), height: size.height)))
            x += size.width + spacing
        }
        return rows
    }
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        let rows = lines(width, subviews)
        let height = rows.reduce(0) { $0 + ($1.map(\.1.height).max() ?? 0) } + lineSpacing * CGFloat(max(rows.count - 1, 0))
        let widest = rows.map { row in row.reduce(0) { $0 + $1.1.width } + spacing * CGFloat(max(row.count - 1, 0)) }.max() ?? 0
        return CGSize(width: proposal.width ?? widest, height: height)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in lines(bounds.width, subviews) {
            let tallest = row.map(\.1.height).max() ?? 0
            var x = bounds.minX
            for (index, size) in row {
                subviews[index].place(at: CGPoint(x: x, y: y + (tallest - size.height) / 2),
                                      proposal: ProposedViewSize(width: size.width, height: size.height))
                x += size.width + spacing
            }
            y += tallest + lineSpacing
        }
    }
}

// MARK: The canvas and what stands on it

/* The night canvas. Flat studioNight for the reason this file's header gives — every unlit mark on it
   is measured against one ground rather than a gradient — with the one raised elevation, and the
   environment flag that tells ThusoMetric and friends they are standing on the dark. */
struct DeckCanvas<Content: View>: View {
    /// Room left at the foot for the sheet that crosses the canvas's lower edge. Given back as padding
    /// first, so what the sheet covers is empty ground and never a figure.
    var overhang: CGFloat = 0
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space20) { content }
            .padding(.horizontal, ThusoSpacing.space20)
            .padding(.top, ThusoSpacing.space20)
            .padding(.bottom, ThusoSpacing.space24 + overhang)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(DeckInk.ground, in: RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous))
            .deckRaised()
            .environment(\.onStudioNight, true)
    }
}

/* A canvas, and the light sheet that stands on its lower edge.
   The reference's panels sit at two elevations with one crossing the other's edge. On a phone that is
   the one crossing that costs nothing: the sheet is inset from the canvas's sides, so the night shows
   either side of it and reads as the ground the sheet is standing on rather than as a card that has
   slipped. `wrap` is off where the sheet's own content is already a card. */
struct DeckHero<Content: View, Sheet: View>: View {
    var wrap = true
    /// The sheet's ground. White, or mangoSoft where what stands on the edge is a refusal.
    var sheetFill: Color = ThusoTheme.surface
    @ViewBuilder var content: Content
    @ViewBuilder var sheet: Sheet
    @ScaledMetric(relativeTo: .body) private var overlap: CGFloat = 36
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            DeckCanvas(overhang: overlap) { content }
            Group {
                if wrap { DeckSheet(fill: sheetFill) { sheet } } else { sheet }
            }
            .padding(.horizontal, ThusoSpacing.space12)
            .padding(.top, -overlap)
        }
    }
}
extension DeckHero where Sheet == EmptyView {
    init(@ViewBuilder content: () -> Content) {
        self.init(wrap: false, content: content) { EmptyView() }
    }
}

/// The light card that stands on the canvas: white, the card radius, the one elevation.
struct DeckSheet<Content: View>: View {
    var padding: CGFloat = ThusoSpacing.space16
    var fill: Color = ThusoTheme.surface
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) { content }
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(fill, in: RoundedRectangle(cornerRadius: ThusoRadius.card, style: .continuous))
            .deckRaised()
            .environment(\.onStudioNight, false)
    }
}

/// The lead's own card: the night lifted eight per cent, which is depth by one step of the same colour
/// rather than by a second shadow inside a shadowed card.
struct DeckGlass<Content: View>: View {
    var padding: CGFloat = ThusoSpacing.space16
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) { content }
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(DeckInk.glass, in: RoundedRectangle(cornerRadius: ThusoRadius.card, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: ThusoRadius.card, style: .continuous).stroke(DeckInk.glassEdge, lineWidth: 1))
    }
}

/* The pale half of the deck, and the card that crosses its lower edge.
   indigoSoft with a dot grid of its own ink at a fifth of its strength: it carries nothing, and it is
   what stops a block of one pale colour reading as a hole in the canvas. The float is a night card,
   inset on the leading side, so it crosses from the panel back onto the night it came from. */
struct DeckPanel<Content: View, Crossing: View>: View {
    @ViewBuilder var content: Content
    @ViewBuilder var float: Crossing
    @ScaledMetric(relativeTo: .body) private var overlap: CGFloat = 28
    private var floats: Bool { Crossing.self != EmptyView.self }
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: ThusoSpacing.space12) { content }
                .padding(.horizontal, ThusoSpacing.space16)
                .padding(.top, ThusoSpacing.space16)
                .padding(.bottom, ThusoSpacing.space16 + (floats ? overlap : 0))
                .frame(maxWidth: .infinity, alignment: .leading)
                .background { ZStack { DeckInk.panel; DeckDots() } }
                .clipShape(RoundedRectangle(cornerRadius: ThusoRadius.card, style: .continuous))
                .environment(\.onStudioNight, false)
            if floats {
                float
                    .padding(.horizontal, ThusoSpacing.space16).padding(.vertical, ThusoSpacing.space12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(DeckInk.ground, in: RoundedRectangle(cornerRadius: ThusoRadius.card, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: ThusoRadius.card, style: .continuous).stroke(DeckInk.glassEdge, lineWidth: 1))
                    .deckRaised()
                    .padding(.leading, ThusoSpacing.space16)
                    .padding(.top, -overlap)
            }
        }
    }
}
extension DeckPanel where Crossing == EmptyView {
    init(@ViewBuilder content: () -> Content) { self.init(content: content) { EmptyView() } }
}

private struct DeckDots: View {
    var body: some View {
        Canvas { context, size in
            let step: CGFloat = 14
            var x: CGFloat = step / 2
            while x < size.width {
                var y: CGFloat = step / 2
                while y < size.height {
                    context.fill(Path(ellipseIn: CGRect(x: x - 1, y: y - 1, width: 2, height: 2)),
                                 with: .color(ThusoTheme.indigo.opacity(0.22)))
                    y += step
                }
                x += step
            }
        }
        .accessibilityHidden(true)
    }
}

// MARK: Words on the canvas

/// A word of a deck headline, or the circular badge set inside the sentence in place of one. The
/// sentence must read correctly with every badge removed, which is what lets VoiceOver skip them.
enum DeckWord {
    case text(String)
    case glyph(String)
}

/* The headline. `metric` rather than `metricLarge`: it is a sentence and not a figure, and the figure
   on the glass below it has to stay the largest thing on the screen. Past the accessibility sizes it
   drops to `screenTitle` — still scaled, so it still grows, from a smaller start — for the reason
   StudioHeadline gives: a display line one word per row has stopped being a headline. */
struct DeckHeadline: View {
    let eyebrow: String
    let words: [DeckWord]
    var tail: String = ""
    @Environment(\.dynamicTypeSize) private var typeSize
    @ScaledMetric(relativeTo: .largeTitle) private var display: CGFloat = ThusoType.metric
    @ScaledMetric(relativeTo: .largeTitle) private var compact: CGFloat = ThusoType.screenTitle
    private var size: CGFloat { typeSize.isAccessibilitySize ? compact : display }
    private var tokens: [DeckWord] {
        words.flatMap { word -> [DeckWord] in
            if case .text(let text) = word { return text.split(separator: " ").map { .text(String($0)) } }
            return [word]
        }
    }
    private var spoken: String {
        words.compactMap { if case .text(let text) = $0 { return text } else { return nil } }.joined(separator: " ")
    }
    var body: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            Text(eyebrow.uppercased())
                .thusoFont(ThusoType.caption, weight: .semibold).tracking(1.4)
                .foregroundStyle(DeckInk.accent)
                .fixedSize(horizontal: false, vertical: true)
            DeckFlow(spacing: size * 0.24, lineSpacing: size * 0.1) {
                ForEach(Array(tokens.enumerated()), id: \.offset) { _, token in
                    switch token {
                    case .text(let text):
                        Text(text).font(.system(size: size, weight: .medium)).tracking(-0.6)
                            .foregroundStyle(DeckInk.ink)
                    case .glyph(let symbol):
                        DeckGlyph(symbol: symbol, diameter: size * 0.92)
                    }
                }
            }
            if !tail.isEmpty {
                Text(tail).thusoFont(ThusoType.body).foregroundStyle(DeckInk.quiet)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(tail.isEmpty ? spoken : "\(spoken). \(tail)")
        .accessibilityAddTraits(.isHeader)
    }
}

/// Pale indigo rather than indigo: indigo on this ground measures 1.28, and a disc nobody can see is
/// not a badge.
struct DeckGlyph: View {
    let symbol: String
    let diameter: CGFloat
    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: diameter * 0.46, weight: .semibold))
            .foregroundStyle(ThusoTheme.indigoDeep)
            .frame(width: diameter, height: diameter)
            .background(ThusoTheme.indigoSoft, in: Circle())
            .accessibilityHidden(true)
    }
}

/* The preview disclosure, on the dark. The words are DemoBadge's, unchanged; only the ground moved,
   because a cloud chip on studioNight is a pale lozenge pulling the eye off the headline. */
struct DeckPreviewMark: View {
    var body: some View {
        Label("Design preview · Fictional data", systemImage: "info.circle")
            .thusoFont(ThusoType.caption, weight: .medium)
            .foregroundStyle(DeckInk.ink)
            .padding(.horizontal, ThusoSpacing.space12).padding(.vertical, ThusoSpacing.space4)
            .fixedSize(horizontal: false, vertical: true)
            .overlay(RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous).stroke(DeckInk.control, lineWidth: 1))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Design preview · Fictional data")
    }
}

/// A refusal on the canvas: peach, a glyph, and the sentence the contract wrote.
struct DeckRefusal: View {
    let decision: VettingDecision
    var body: some View {
        if !decision.allowed, let reason = decision.reason {
            Label(reason, systemImage: "hand.raised")
                .font(.footnote).foregroundStyle(DeckInk.refusal)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityLabel("Refused. \(reason)")
        }
    }
}

/// A status on any of the three grounds. Outlined in the ground's quiet ink; filled for the one thing
/// that is not as it should be, with the word on it doing the telling.
struct DeckTag: View {
    let text: String
    var flagged = false
    var ground: DeckGround = .glass
    @Environment(\.dynamicTypeSize) private var typeSize
    private var shape: AnyShape {
        typeSize.isAccessibilitySize
            ? AnyShape(RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous))
            : AnyShape(Capsule())
    }
    private var colours: (ink: Color, fill: Color, edge: Color) {
        switch ground {
        case .panel: return flagged ? (DeckInk.panel, DeckInk.panelLit, DeckInk.panelLit)
                                    : (ThusoTheme.indigoDeep, .clear, DeckInk.panelLit)
        default: return flagged ? (DeckInk.ground, DeckInk.ink, DeckInk.ink)
                                : (DeckInk.quiet, .clear, DeckInk.mark)
        }
    }
    var body: some View {
        Text(text)
            .thusoFont(ThusoType.caption, weight: .medium)
            .foregroundStyle(colours.ink)
            .padding(.horizontal, ThusoSpacing.space12).padding(.vertical, 3)
            .fixedSize(horizontal: false, vertical: true)
            .background(colours.fill, in: shape)
            .overlay(shape.stroke(colours.edge, lineWidth: 1))
    }
}

// MARK: Choices and affordances

/* A pill cluster: the choice a design review turns on — which nurse is holding the instrument, which
   viewer is reading the file — laid out so every option is visible at once. A menu hides the
   comparison the screen exists to make. Each pill is a 44-point target at the default size and grows
   with the words; past the accessibility sizes it stops being a capsule, whose ends would cut a
   wrapped label. */
struct DeckPills<Value: Hashable>: View {
    let label: String
    @Binding var selection: Value
    let options: [(value: Value, title: String)]
    var onNight = true
    @Environment(\.dynamicTypeSize) private var typeSize
    private var shape: AnyShape {
        typeSize.isAccessibilitySize
            ? AnyShape(RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous))
            : AnyShape(Capsule())
    }
    var body: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            Text(label)
                .thusoFont(ThusoType.caption, weight: .semibold)
                .foregroundStyle(onNight ? DeckInk.quiet : ThusoTheme.studioInkMuted)
                .fixedSize(horizontal: false, vertical: true)
            DeckFlow {
                ForEach(options, id: \.value) { option in pill(option) }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(label)
    }
    private func pill(_ option: (value: Value, title: String)) -> some View {
        let on = option.value == selection
        let ink: Color = on ? (onNight ? DeckInk.ground : ThusoTheme.studioPaper) : (onNight ? DeckInk.ink : ThusoTheme.charcoal)
        let fill: Color = on ? (onNight ? DeckInk.ink : ThusoTheme.studioNight) : (onNight ? DeckInk.glass : ThusoTheme.surface)
        let edge: Color = on ? .clear : (onNight ? DeckInk.control : ThusoTheme.controlEdge)
        return Button { selection = option.value } label: {
            HStack(spacing: ThusoSpacing.space4) {
                if on { Image(systemName: "checkmark").font(.footnote.weight(.bold)).accessibilityHidden(true) }
                Text(option.title).thusoFont(ThusoType.minimumBody, weight: on ? .semibold : .regular)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .foregroundStyle(ink)
            .padding(.horizontal, ThusoSpacing.space16).padding(.vertical, ThusoSpacing.space8)
            .frame(minHeight: 44)
            .background(fill, in: shape)
            .overlay(shape.stroke(edge, lineWidth: 1))
            .contentShape(shape)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
    }
}

/// The circular affordance. Filled, and inverted against its ground, so it reads as the thing that
/// moves you rather than as a decoration beside the words. Hidden from VoiceOver: the row it sits on
/// is the control and already says where it goes.
struct DeckCircle: View {
    var symbol = "arrow.up.right"
    var onNight = false
    var body: some View {
        Image(systemName: symbol)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(onNight ? DeckInk.ground : ThusoTheme.studioPaper)
            .frame(width: 44, height: 44)
            .background(onNight ? DeckInk.ink : ThusoTheme.studioNight, in: Circle())
            .accessibilityHidden(true)
    }
}

/* A destination in a section, as a card with a circle rather than a grey pill in a column of grey
   pills. The first one on a section is `raised` — it stands on the canvas — and carries the badge; the
   rest keep a hairline and a plain symbol, because a badge on every row is a colour that has stopped
   meaning anything. */
struct DeckDestination: View {
    let title: String
    var subtitle: String = ""
    let symbol: String
    var raised = false
    @Environment(\.dynamicTypeSize) private var typeSize
    var body: some View {
        HStack(alignment: .center, spacing: ThusoSpacing.space12) {
            if !typeSize.isAccessibilitySize {
                if raised {
                    DeckGlyph(symbol: symbol, diameter: 44)
                } else {
                    Image(systemName: symbol).font(.body).foregroundStyle(ThusoTheme.charcoal)
                        .frame(width: 44).accessibilityHidden(true)
                }
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(title).thusoFont(ThusoType.cardTitle, weight: .semibold).foregroundStyle(ThusoTheme.charcoal)
                    .fixedSize(horizontal: false, vertical: true)
                if !subtitle.isEmpty {
                    Text(subtitle).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            DeckCircle()
        }
        .padding(.leading, ThusoSpacing.space16).padding(.trailing, ThusoSpacing.space12)
        .padding(.vertical, ThusoSpacing.space12)
        .frame(maxWidth: .infinity, minHeight: 68, alignment: .leading)
        .background(ThusoTheme.surface, in: RoundedRectangle(cornerRadius: ThusoRadius.card, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: ThusoRadius.card, style: .continuous)
            .stroke(raised ? .clear : ThusoTheme.studioLine, lineWidth: 1))
        .modifier(DeckRaisedIf(raised: raised))
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}
private struct DeckRaisedIf: ViewModifier {
    let raised: Bool
    func body(content: Content) -> some View {
        if raised { content.deckRaised() } else { content }
    }
}

/* The head of a section on paper: a tracked eyebrow over a hairline, with the section's own count at
   the trailing edge where there is one. It replaces a bold title in a column of bold titles — the
   count is the thing a reader scanning down the screen is looking for, and the hairline is what tells
   them where one kind of record ends. */
struct DeckSectionHead: View {
    let title: String
    var count: String?
    var note: String = ""
    var body: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space8) {
                Text(title.uppercased())
                    .thusoFont(ThusoType.caption, weight: .semibold).tracking(1.2)
                    .foregroundStyle(ThusoTheme.studioInkMuted)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: ThusoSpacing.space8)
                if let count {
                    Text(count).thusoFont(ThusoType.caption, weight: .semibold).monospacedDigit()
                        .foregroundStyle(ThusoTheme.charcoal)
                }
            }
            Hairline()
            if !note.isEmpty {
                Text(note).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.top, ThusoSpacing.space8)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

// MARK: A figure on any ground

/* One figure, on glass, on the night or on the panel, with the drawing that belongs to it. A dial puts
   the numeral inside itself; a line or a set of bars is drawn BEHIND the numeral, filling the lower
   part of the figure's box, which is the reference's move and the honest one — the drawing and the
   numeral are the same arithmetic, so they belong in the same box.

   `still` is for a clinical value: a reading's trend is the finished picture on the first frame and
   never draws itself in, whatever the reader's motion setting. */
struct DeckFigure: View {
    let value: String
    var prefix: String?
    var unit: String?
    let label: String
    var chip: String?
    var flagged = false
    var shape: DeckShape?
    var ground: DeckGround = .glass
    var still = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var drawn = false
    @ScaledMetric(relativeTo: .largeTitle) private var leadFigure: CGFloat = ThusoType.metricLarge
    @ScaledMetric(relativeTo: .largeTitle) private var restFigure: CGFloat = ThusoType.metric
    @ScaledMetric(relativeTo: .footnote) private var affix: CGFloat = ThusoType.cardTitle
    @ScaledMetric(relativeTo: .largeTitle) private var dial: CGFloat = 112
    @ScaledMetric(relativeTo: .body) private var plot: CGFloat = 64

    private var ink: Color { ground == .panel ? DeckInk.panelInk : DeckInk.ink }
    private var quiet: Color { ground == .panel ? DeckInk.panelQuiet : DeckInk.quiet }
    /// Lime is the glass's alone. On the night a lit mark is the quiet tone, and on the panel indigo.
    private var lit: Color { ground == .glass ? DeckInk.accent : ground == .panel ? DeckInk.panelLit : DeckInk.quiet }
    private var unlit: Color { ground == .glass ? DeckInk.leadMark : ground == .panel ? DeckInk.panelMark : DeckInk.mark }
    private var track: Color { ground == .panel ? DeckInk.panelTrack : DeckInk.track }
    private var progress: CGFloat { still || reduceMotion || drawn ? 1 : 0 }

    var body: some View {
        Group {
            switch shape {
            case .ring, .gauge:
                let layout = typeSize.isAccessibilitySize
                    ? AnyLayout(VStackLayout(alignment: .leading, spacing: ThusoSpacing.space12))
                    : AnyLayout(HStackLayout(alignment: .center, spacing: ThusoSpacing.space20))
                layout {
                    ZStack {
                        drawing
                        numeral(size: restFigure)
                    }
                    .frame(width: dial, height: dial)
                    words
                }
            case .bars, .spark, .columns:
                VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
                    if let chip { DeckTag(text: chip, flagged: flagged, ground: ground) }
                    ZStack(alignment: .topLeading) {
                        drawing
                            .frame(height: plot)
                            .frame(maxHeight: .infinity, alignment: .bottom)
                            .opacity(ground == .panel ? 1 : 0.9)
                        numeral(size: ground == .glass ? leadFigure : restFigure)
                    }
                    /* Tall enough that the plot starts under the numeral's lower edge rather than through
                       its digits. At plot plus sixty per cent of the figure, the week line ran across
                       "598" and the panel's outlined column cut "2 841" in two. */
                    .frame(minHeight: plot + (ground == .glass ? leadFigure : restFigure) * 1.05)
                    Text(label).thusoFont(ThusoType.caption, weight: .medium).foregroundStyle(quiet)
                        .fixedSize(horizontal: false, vertical: true)
                }
            default:
                VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
                    if let chip { DeckTag(text: chip, flagged: flagged, ground: ground) }
                    numeral(size: ground == .glass ? leadFigure : restFigure)
                    Text(label).thusoFont(ThusoType.caption, weight: .medium).foregroundStyle(quiet)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label), \(prefix ?? "")\(value)\(unit.map { " \($0)" } ?? "")\(chip.map { ", \($0)" } ?? "")")
        .onAppear { withAnimation(reduceMotion || still ? nil : .easeOut(duration: 0.76)) { drawn = true } }
    }

    private var words: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            if let chip { DeckTag(text: chip, flagged: flagged, ground: ground) }
            Text(label).thusoFont(ThusoType.caption, weight: .medium).foregroundStyle(quiet)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder private var drawing: some View {
        switch shape {
        case .ring(let segments): DeckRing(segments: segments, lit: lit, unlit: unlit, progress: progress, track: track)
        case .gauge(let part, let whole): DeckGauge(part: part, whole: whole, lit: lit, progress: progress, track: track)
        case .bars(let values): DeckBars(values: values, lit: lit, unlit: unlit, progress: progress)
        case .spark(let weeks): DeckPlotLine(values: weeks, lit: lit, progress: progress)
        case .columns(let values, let marks): DeckColumns(values: values, marks: marks, lit: lit, unlit: unlit, progress: progress)
        default: EmptyView()
        }
    }

    private func numeral(size: CGFloat) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 3) {
            if let prefix {
                Text(prefix).font(.system(size: affix, weight: .regular)).foregroundStyle(quiet)
            }
            Text(value).font(.system(size: size, weight: .light).monospacedDigit()).foregroundStyle(ink)
            if let unit {
                Text(unit).font(.system(size: affix, weight: .regular)).foregroundStyle(quiet)
            }
        }
        .lineLimit(1)
        .minimumScaleFactor(0.6)
    }
}

/* A line under a numeral, drawn to the height it is given rather than to DeckSpark's fixed 52 and its
   caption. The caption is the screen's to write where it means something different from "weeks". */
private struct DeckPlotLine: View {
    let values: [Int]
    let lit: Color
    let progress: CGFloat
    var body: some View {
        GeometryReader { geo in
            let high = values.max() ?? 1, low = values.min() ?? 0
            let spread = CGFloat(max(high - low, 1))
            let x = { (index: Int) in values.count > 1 ? geo.size.width * CGFloat(index) / CGFloat(values.count - 1) : geo.size.width / 2 }
            let y = { (value: Int) in geo.size.height * (0.92 - 0.72 * CGFloat(value - low) / spread) }
            let line = Path { path in
                for (index, value) in values.enumerated() {
                    let point = CGPoint(x: x(index), y: y(value))
                    index == 0 ? path.move(to: point) : path.addLine(to: point)
                }
            }
            ZStack {
                Path { path in
                    path.addPath(line)
                    path.addLine(to: CGPoint(x: geo.size.width, y: geo.size.height))
                    path.addLine(to: CGPoint(x: 0, y: geo.size.height))
                    path.closeSubpath()
                }
                .fill(lit.opacity(0.18))
                .opacity(Double(progress))
                line.trim(from: 0, to: progress).stroke(lit, style: StrokeStyle(lineWidth: 2.5, lineJoin: .round))
            }
        }
        .accessibilityHidden(true)
    }
}

/// Columns, one per row, oldest first. A lit column is filled and an unlit one only outlined, so the
/// rows the figure adds up are told apart by fill as well as by tone.
private struct DeckColumns: View {
    let values: [Int]
    let marks: [Bool]
    let lit: Color
    let unlit: Color
    let progress: CGFloat
    var body: some View {
        GeometryReader { geo in
            let high = CGFloat(max(values.max() ?? 1, 1))
            let gap: CGFloat = 8
            let count = CGFloat(max(values.count, 1))
            let width = (geo.size.width - gap * (count - 1)) / count
            HStack(alignment: .bottom, spacing: gap) {
                ForEach(Array(values.enumerated()), id: \.offset) { index, value in
                    let shape = RoundedRectangle(cornerRadius: 4, style: .continuous)
                    /* A floor of six per cent, for DeckBars' reason: a week that paid little is still a week. */
                    let height = geo.size.height * min(1, max(0.06, CGFloat(value) / high))
                    Group {
                        if marks.indices.contains(index) && marks[index] {
                            shape.fill(lit)
                        } else {
                            shape.inset(by: 0.75).stroke(unlit, lineWidth: 1.5)
                        }
                    }
                    .frame(width: width, height: height)
                    .scaleEffect(x: 1, y: staggered(progress, index: index, count: values.count), anchor: .bottom)
                }
            }
            .frame(maxHeight: .infinity, alignment: .bottom)
        }
        .accessibilityHidden(true)
    }
}

// MARK: - Protocols

/* THE REFERENCE A CASE IS READ AGAINST.
 *
 * "Clinical protocols" was a row in the doctor's tools that opened the roadmap's placeholder. It is the
 * one screen in that workspace that needs no service behind it to be real: the indicative ranges are in
 * the record contract, generated into RecordsData.swift, and the sentence that qualifies every one of
 * them is that contract's own note on the observations section. Nothing here is new information; what
 * was missing was one place that says it, which is what a protocol is.
 *
 * WHAT IT REFUSES. The escalation ladder the web draws beside the ranges is typed into a React component
 * rather than into a contract, and a third copy of it here would be the drift this project generates
 * code to avoid, so it stays off this screen until it is contract. The "screening" capability's own
 * sentence stands on the canvas, because a reference range read on a phone is exactly what a reader
 * might take for a triage tool. And nothing here moves: a range a clinical value is judged against is
 * drawn finished, whatever Reduce Motion says. */
struct ClinicalProtocolsView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space16) {
                DeckHero {
                    DeckPreviewMark()
                    DeckHeadline(eyebrow: "Doctor workspace · protocols",
                                 words: [.text("The reference a case"), .glyph("ruler"), .text("is read against")])
                    CapabilityNotice(of: "screening")
                    DeckGlass {
                        DeckFigure(value: "\(Records.observations.count)",
                                   label: "readings, and the indicative adult range each is flagged against")
                    }
                } sheet: {
                    Text(Records.observationsNote)
                        .thusoFont(ThusoType.cardTitle, weight: .semibold).foregroundStyle(ThusoTheme.charcoal)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("AI is decision support. An authorised clinician must sign off clinical decisions.")
                        .font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                DeckSectionHead(title: "Where a reading is flagged", count: "\(Records.observations.count)")
                ForEach(Records.observations) { ProtocolRangeRow(range: $0) }
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space16, for: .scrollContent)
        .thusoGround()
        .navigationTitle("Clinical protocols").navigationBarTitleDisplayMode(.inline)
    }
}

/* One range as a ruler: the band is the indicative range and either side of it is where a reading is
   flagged. A schematic rather than a scale — seven readings in six units cannot share one axis honestly
   — so the numbers are on the band and read out in full, because a chart in this product is always
   also a table. studioPaper on studioOlive is 5.86; studioInkMuted on cloud 5.46. */
private struct ProtocolRangeRow: View {
    let range: ObservationRange
    private func figure(_ value: Double) -> String {
        range.step < 1 ? String(format: "%.1f", value) : String(format: "%.0f", value)
    }
    var body: some View {
        let low = figure(range.low), high = figure(range.high)
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space8) {
                Text(range.label).thusoFont(ThusoType.cardTitle, weight: .semibold).foregroundStyle(ThusoTheme.charcoal)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: ThusoSpacing.space8)
                Text(range.unit).font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
            }
            HStack(spacing: 0) {
                Text("Low").font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                    .frame(maxWidth: .infinity, alignment: .leading).padding(.leading, ThusoSpacing.space12)
                Text("\(low)–\(high)").thusoFont(ThusoType.minimumBody, weight: .semibold).monospacedDigit()
                    .foregroundStyle(ThusoTheme.studioPaper)
                    .lineLimit(1).minimumScaleFactor(0.8)
                    .frame(maxWidth: .infinity, minHeight: 32)
                    .background(ThusoTheme.studioOlive, in: Capsule())
                Text("High").font(.footnote).foregroundStyle(ThusoTheme.studioInkMuted)
                    .frame(maxWidth: .infinity, alignment: .trailing).padding(.trailing, ThusoSpacing.space12)
            }
            .frame(minHeight: 32)
            .background(ThusoTheme.cloud, in: Capsule())
        }
        .padding(ThusoSpacing.space16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ThusoTheme.surface, in: RoundedRectangle(cornerRadius: ThusoRadius.card, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: ThusoRadius.card, style: .continuous).stroke(ThusoTheme.studioLine, lineWidth: 1))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(range.label). Below \(low) \(range.unit) is flagged low, \(low) to \(high) is inside the indicative range, above \(high) is flagged high.")
    }
}
