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
 * THE GROUND IS THE WORDMARK'S INK. On 14 September the founder looked at these screens and asked
 * them to "stick to logo colors and ui": the near-black studioNight and the lime lead were the Care
 * Studio's palette, not the logo's. The wordmark (apps/web/public/brand/mythuso-logo.svg) is
 * brandInk, brandGreen, a brandOrange roof and a brandLime dot, and those four and white are what
 * the deck is drawn in now. No colour token was added.
 *
 * Flat rather than StudioNightCard's highlight, for the reason that was always true here: every
 * unlit mark is measured against one ground rather than a gradient. The lead's panel is RECESSED
 * rather than lifted — the design system's ink at 45% over brandInk — and that is arithmetic rather
 * than taste. brandGreen reads 3.55 on brandInk, falls to 2.98 on a six-per-cent white lift and 2.81
 * on eight, and rises to 4.34 on the recess. A colour that clears on the ground it was chosen against
 * and not on the one it lands on is the failure this project keeps finding.
 *
 *   on brandInk                 white 12.04   brandLime 10.47   brandMint 8.09
 *                               white at 72% 7.04 — quiet text     brandGreen 3.55 — a mark, never a word
 *                               white at 44% 3.63 — an unlit mark  brandOrange 4.24 — a fill or a glyph
 *                               white at 24% 2.06 — the groove a ring runs in; it carries nothing
 *   on the recess (ink at 45%)  white 14.71   white at 72% 8.29   white at 44% 4.03
 *                               brandGreen 4.34 — the lead's lit mark    brandLime 12.80
 *
 * AND COLOUR IS NEVER THE ONLY DIFFERENCE. A flagged arc is the green one AND the thicker one; a
 * signed visit is the filled block AND the white one. Green is spent once per deck, on the figure the
 * screen was opened for, and lime once, as the eyebrow word — the dot on the wordmark, and the one
 * pair tokens.json lets lime be read in. The flagged chip is the orange roof, filled, with the design
 * system's ink on it at 6.30: brandInk on orange is 4.24, and a 13-point word needs 4.5.
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

/* Alphas over white rather than flattened greys, for the reason ThusoOpacity's own comment gives: a
   flattened grey cannot follow the ground it sits on and an alpha has no choice but to. The ratios
   every one of these composites to are in the header above. */
enum DeckInk {
    static let ground = ThusoTheme.brandInk
    static let ink = ThusoTheme.surface
    /// The wordmark's dot. A word only on brandInk, and on the deck only the eyebrow.
    static let accent = ThusoTheme.brandLime
    /// The lead's lit mark: the wordmark's green, on the recess where it clears 3:1.
    static let lit = ThusoTheme.brandGreen
    /// The muted step is the token rather than a number retyped here: the same alpha every muted
    /// label on all three platforms is set at, and it darkens with whatever ground it lands on.
    static let quiet = ThusoTheme.surface.opacity(ThusoOpacity.charcoalMuted)
    static let mark = ThusoTheme.surface.opacity(0.44)
    /// The unlit mark on the lead's recess, 4.03 there. The same alpha as `mark`: the recess is darker
    /// than the ground, so a mark that clears on one clears on both.
    static let leadMark = ThusoTheme.surface.opacity(0.44)
    static let track = ThusoTheme.surface.opacity(0.24)
    static let edge = ThusoTheme.surface.opacity(0.14)
    static let leadGround = ThusoTheme.ink.opacity(0.45)
    /// The roof on the wordmark: the one thing that is not as it should be. A fill or a glyph.
    static let attention = ThusoTheme.brandOrange
    static let onAttention = ThusoTheme.ink
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

/* The deck's own chip, and it is not the night card's. Flagged is the wordmark's orange roof, filled —
   the one warm thing on a cool ground — standing 4.24 off brandInk, with the design system's ink on
   it at 6.30. Everything else is outlined quiet. Filled against outlined is the difference that does
   not depend on seeing orange. */
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
            .foregroundStyle(flagged ? DeckInk.onAttention : DeckInk.quiet)
            .padding(.horizontal, ThusoSpacing.space12).padding(.vertical, 3)
            .fixedSize(horizontal: false, vertical: true)
            .background(flagged ? DeckInk.attention : .clear, in: shape)
            .overlay(shape.stroke(flagged ? DeckInk.attention : DeckInk.mark, lineWidth: 1))
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

    /// The lead is the only instrument that spends the green. On the other two a lit mark is the
    /// quiet tone — still the brightest thing in its own drawing, still two channels apart from an
    /// unlit one, and not a second thing on the deck claiming to be the most important.
    private var lit: Color { isLead ? DeckInk.lit : DeckInk.quiet }
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
                /* The lead is a panel and the other two are not: the ground recessed by the design
                   system's ink, which is depth by one step of the same colour rather than by a second
                   shadow inside a shadowed card, and darker rather than lighter so its green clears. It is what makes the deck say what the screen is for before it says
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
 * THE WORDMARK'S COLOURS WHERE THE REFERENCE WAS VIOLET. The reference draws its quiet half in
 * lavender; this file drew it in indigo and spent lime on the dark, and the founder asked for the
 * logo instead. So the canvas is brandInk, the lit marks and the chosen pill brandGreen, attention
 * brandOrange, the one spark brandLime, and the pale panel a six-per-cent green wash over white,
 * composited once from the two tokens. No colour token was added.
 *
 * THE RULE THE DECK ABOVE IS BUILT ON HOLDS UNCHANGED. Nothing drawn introduces a number: every ring,
 * gauge, bar and line is counted off rows the same screen lists, so a reader who distrusts the picture
 * can count the list. And no clinical value moves. A reading's trend is the finished drawing on the
 * first frame whatever Reduce Motion says; only a count of rows draws itself in, and under Reduce
 * Motion not even that.
 *
 * MEASURED ON THE GROUND EACH PAIR ACTUALLY LANDS ON, with the sRGB formula the build runs:
 *   brandInk                  white 12.04   quiet 7.04   lime 10.47   green 3.55, a mark   orange 4.24, a glyph
 *                             `danger` is 1.83 here and is never written on the dark; a refusal on
 *                             the canvas is an orange glyph beside a white sentence.
 *   the glass, ink at 45% over brandInk
 *                             white 14.71   quiet 8.29   green 4.34   lime 12.80
 *                             an unlit mark at 44% 4.03 — the recess is darker than the ground, so
 *                             green clears on it where it failed on a white lift (2.81)
 *   a control's edge          white at 44%: 3.63 on the ground, 4.03 on the glass
 *   the chosen pill           brandGreen, 3.55 off brandInk and 3.39 off white; ink on it 5.27
 *   the flagged tag           brandOrange, 4.24 off brandInk; ink on it 6.30
 *   the panel, green at 6% over white
 *                             brandInk 11.27   brandInk at 72% 4.99   body 7.10
 *                             green 3.17 — the lit mark   brandInk at 60% 3.59 — the unlit one
 *   the badge                 a brandGreen disc, 3.55 on brandInk and 3.39 on white; its white glyph 3.39
 *   a white sheet             brandInk 12.04   body 7.58
 * And colour is never the only difference between two states: a lit arc is thicker, the longest bar
 * is taller, a chosen pill is filled and heavier, and a refusal says so in words beside its glyph. */

extension DeckInk {
    static let glass = ThusoTheme.ink.opacity(0.45)
    static let glassEdge = ThusoTheme.surface.opacity(0.16)
    /// The edge of anything pressable on the canvas. See the table above: 3.63 and 4.03.
    static let control = ThusoTheme.surface.opacity(0.44)
    /// A refusal's glyph on the dark. Orange is 4.24 there — a glyph's ratio, not a sentence's.
    static let refusal = ThusoTheme.brandOrange
    static let panel = deckWash(ThusoTheme.brandGreen, 0.06, over: ThusoTheme.surface)
    static let panelInk = ThusoTheme.brandInk
    static let panelQuiet = ThusoTheme.brandInk.opacity(ThusoOpacity.charcoalMuted)
    static let panelLit = ThusoTheme.brandGreen
    static let panelMark = ThusoTheme.brandInk.opacity(0.60)
    static let panelTrack = ThusoTheme.brandInk.opacity(0.12)
    /// Words on the white sheets these screens stand on.
    static let sheetInk = ThusoTheme.brandInk
    static let sheetQuiet = ThusoTheme.body
    static let sheetLine = ThusoTheme.line
    /// The chosen pill: the wordmark's green, with the ink the ratio above is measured for.
    static let chosen = ThusoTheme.brandGreen
    static let onChosen = ThusoTheme.ink
    /// The sheet that stands on the canvas when what it holds is a refusal: the roof mark at 8% over
    /// white. brandInk 11.08 on it, body 6.98, mangoInk comfortably above 4.5.
    static let attentionWash = deckWash(ThusoTheme.brandOrange, 0.08, over: ThusoTheme.surface)
}

/* One opaque colour composited from two tokens. The panel is read as a colour in more places than a
   background, and a translucent green would change its ratios with whatever stands behind it. Both
   ends are tokens.json's; nothing here is typed. */
private func deckWash(_ tint: Color, _ amount: Double, over ground: Color) -> Color {
    var tr: CGFloat = 0, tg: CGFloat = 0, tb: CGFloat = 0, ta: CGFloat = 0
    var gr: CGFloat = 0, gg: CGFloat = 0, gb: CGFloat = 0, ga: CGFloat = 0
    UIColor(tint).getRed(&tr, green: &tg, blue: &tb, alpha: &ta)
    UIColor(ground).getRed(&gr, green: &gg, blue: &gb, alpha: &ga)
    return Color(red: gr + (tr - gr) * amount, green: gg + (tg - gg) * amount, blue: gb + (tb - gb) * amount)
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

/* The canvas. Flat brandInk for the reason this file's header gives — every unlit mark on it is
   measured against one ground rather than a gradient — with the one raised elevation, and the
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

/// The lead's own card: the ground recessed by ink at 45%, which is depth by one step of the same
/// colour rather than by a second shadow, and darker because green only clears 3:1 on the darker one.
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
   A green wash with a dot grid of brandInk at 14%: it carries nothing, and it is
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
                                 with: .color(ThusoTheme.brandInk.opacity(0.14)))
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

/// The wordmark's green as a disc with a white glyph in it: 3.55 against brandInk and 3.39 against a
/// white card, and the glyph 3.39 on the disc — a picture held to 3:1, never a word.
struct DeckGlyph: View {
    let symbol: String
    let diameter: CGFloat
    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: diameter * 0.46, weight: .semibold))
            .foregroundStyle(ThusoTheme.surface)
            .frame(width: diameter, height: diameter)
            .background(ThusoTheme.brandGreen, in: Circle())
            .accessibilityHidden(true)
    }
}

/* The preview disclosure, on the dark. The words are DemoBadge's, unchanged; only the ground moved,
   because a cloud chip on brandInk is a pale lozenge pulling the eye off the headline. */
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

/// A refusal on the canvas: an orange glyph, and the sentence the contract wrote in white. Orange is
/// 4.24 on brandInk, which is a glyph's ratio and not a sentence's.
struct DeckRefusal: View {
    let decision: VettingDecision
    var body: some View {
        if !decision.allowed, let reason = decision.reason {
            Label {
                Text(reason).foregroundStyle(DeckInk.ink)
            } icon: {
                Image(systemName: "hand.raised").foregroundStyle(DeckInk.refusal)
            }
                .font(.footnote)
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
        case .panel: return flagged ? (ThusoTheme.surface, DeckInk.panelInk, DeckInk.panelInk)
                                    : (DeckInk.panelInk, .clear, DeckInk.panelMark)
        default: return flagged ? (DeckInk.onAttention, DeckInk.attention, DeckInk.attention)
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
                .foregroundStyle(onNight ? DeckInk.quiet : DeckInk.sheetQuiet)
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
        let ink: Color = on ? DeckInk.onChosen : (onNight ? DeckInk.ink : DeckInk.sheetInk)
        let fill: Color = on ? DeckInk.chosen : (onNight ? DeckInk.glass : ThusoTheme.surface)
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
            .foregroundStyle(onNight ? DeckInk.ground : ThusoTheme.surface)
            .frame(width: 44, height: 44)
            .background(onNight ? DeckInk.ink : DeckInk.ground, in: Circle())
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
                    Image(systemName: symbol).font(.body).foregroundStyle(DeckInk.sheetInk)
                        .frame(width: 44).accessibilityHidden(true)
                }
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(title).thusoFont(ThusoType.cardTitle, weight: .semibold).foregroundStyle(DeckInk.sheetInk)
                    .fixedSize(horizontal: false, vertical: true)
                if !subtitle.isEmpty {
                    Text(subtitle).font(.footnote).foregroundStyle(DeckInk.sheetQuiet)
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
            .stroke(raised ? .clear : DeckInk.sheetLine, lineWidth: 1))
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
                    .foregroundStyle(DeckInk.sheetQuiet)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: ThusoSpacing.space8)
                if let count {
                    Text(count).thusoFont(ThusoType.caption, weight: .semibold).monospacedDigit()
                        .foregroundStyle(DeckInk.sheetInk)
                }
            }
            Hairline()
            if !note.isEmpty {
                Text(note).font(.footnote).foregroundStyle(DeckInk.sheetQuiet)
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
    /// Green is the glass's and the panel's. On the bare ground a lit mark is the quiet tone, so the
    /// figure on the glass stays the one the screen is about.
    private var lit: Color { ground == .glass ? DeckInk.lit : ground == .panel ? DeckInk.panelLit : DeckInk.quiet }
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
                        .thusoFont(ThusoType.cardTitle, weight: .semibold).foregroundStyle(DeckInk.sheetInk)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("AI is decision support. An authorised clinician must sign off clinical decisions.")
                        .font(.footnote).foregroundStyle(DeckInk.sheetQuiet)
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
   also a table. White on the brandInk band is 12.04; body on the green wash either side 7.10. */
private struct ProtocolRangeRow: View {
    let range: ObservationRange
    private func figure(_ value: Double) -> String {
        range.step < 1 ? String(format: "%.1f", value) : String(format: "%.0f", value)
    }
    var body: some View {
        let low = figure(range.low), high = figure(range.high)
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space8) {
                Text(range.label).thusoFont(ThusoType.cardTitle, weight: .semibold).foregroundStyle(DeckInk.sheetInk)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: ThusoSpacing.space8)
                Text(range.unit).font(.footnote).foregroundStyle(DeckInk.sheetQuiet)
            }
            HStack(spacing: 0) {
                Text("Low").font(.footnote).foregroundStyle(DeckInk.sheetQuiet)
                    .frame(maxWidth: .infinity, alignment: .leading).padding(.leading, ThusoSpacing.space12)
                Text("\(low)–\(high)").thusoFont(ThusoType.minimumBody, weight: .semibold).monospacedDigit()
                    .foregroundStyle(ThusoTheme.surface)
                    .lineLimit(1).minimumScaleFactor(0.8)
                    .frame(maxWidth: .infinity, minHeight: 32)
                    .background(DeckInk.ground, in: Capsule())
                Text("High").font(.footnote).foregroundStyle(DeckInk.sheetQuiet)
                    .frame(maxWidth: .infinity, alignment: .trailing).padding(.trailing, ThusoSpacing.space12)
            }
            .frame(minHeight: 32)
            .background(DeckInk.panel, in: Capsule())
        }
        .padding(ThusoSpacing.space16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ThusoTheme.surface, in: RoundedRectangle(cornerRadius: ThusoRadius.card, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: ThusoRadius.card, style: .continuous).stroke(DeckInk.sheetLine, lineWidth: 1))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(range.label). Below \(low) \(range.unit) is flagged low, \(low) to \(high) is inside the indicative range, above \(high) is flagged high.")
    }
}
