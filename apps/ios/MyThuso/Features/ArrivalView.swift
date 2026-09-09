import SwiftUI

/* Where is she now.
 *
 * The question this product could answer for a Control Tower and not for the person sitting at home
 * with the door on the latch. The coordinates, the zones and the arrival arithmetic have all been
 * in this app since the dispatch board was written; a patient saw none of it, and "arrival updates
 * will be connected in the functionality phase" was the whole of what she got.
 *
 * The composition is an argument. The largest thing on the screen is the number of minutes and the
 * chip above it says "Straight line" before the reader has got to the figure, because a figure that
 * has to be qualified underneath is a figure that will be quoted without the qualification. The map
 * draws that same straight line, dashed, through the buildings between two suburbs — the picture
 * and the caveat saying one thing, rather than the picture saying "she is coming down that road".
 *
 * And on most days there is nothing to show, which is the state this screen was designed around
 * first. A patient can open it a fortnight before her visit; what she gets then is her suburb, the
 * name of the nurse who is coming, and a sentence saying why there is no position on it. An empty
 * map with a spinner would have been easier to build and would have taught her the screen is
 * broken.
 *
 * Nothing here is connected. dispatch is one of fifteen capabilities and none of them is; no nurse
 * device is read, no position is requested from this phone, no location permission is declared by
 * this target, and every coordinate on the screen is a suburb centre out of
 * packages/catalog/geography.json. */

struct ArrivalView: View {
    let visit: BookedVisit
    var group: Arrival.Group = .upcoming

    private var state: Arrival.State { Arrival.state(for: visit, group: group) }

    var body: some View {
        let arrival = state
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space20) {
                DemoBadge()
                SurfaceHeading(eyebrow: "Your visit", title: "Where is your nurse?",
                               subtitle: subtitle)
                CapabilityNotice(of: "dispatch")
                lead(arrival)
                if case let .outsideCoverage(_, refusal, why) = arrival {
                    SurfacePanel(tone: .quiet) {
                        Label(refusal, systemImage: "mappin.slash").font(.footnote)
                            .foregroundStyle(ThusoTheme.charcoal).fixedSize(horizontal: false, vertical: true)
                        Text(why).font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .accessibilityElement(children: .combine)
                }
                if let to = arrival.destination { map(from: arrival.origin, to: to) }
                notTheseThings
                SurfacePanel(tone: .quiet) {
                    Label(Arrival.Refusal.nothingIsMeasured, systemImage: "dot.radiowaves.left.and.right")
                        .font(.footnote).foregroundStyle(ThusoTheme.charcoal)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .accessibilityElement(children: .combine)
                Text(Arrival.coverageSentence).font(.footnote)
                    .foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                    .fixedSize(horizontal: false, vertical: true)
                NavigationLink { VisitDetailView(visit: visit) } label: {
                    Text("Open this visit").frame(maxWidth: .infinity)
                }.buttonStyle(CareButton())
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle("Your nurse").navigationBarTitleDisplayMode(.inline)
    }

    private var subtitle: String {
        let when = visit.date.map(Scheduling.longDate) ?? Scheduling.Label.asapPending
        return "\(visit.service.name) for \(visit.patient) · \(when)"
    }

    // MARK: - The lead

    /* The one panel this screen is about, and the only one that takes the pale sage. What a person
       came for is one figure; everything under it is the reason that figure is allowed to be
       shown. */
    @ViewBuilder private func lead(_ arrival: Arrival.State) -> some View {
        SurfacePanel(tone: .lead, spacing: ThusoSpacing.space16) {
            HStack(alignment: .top, spacing: ThusoSpacing.space12) {
                Monogram(text: Arrival.nurse.initials, diameter: 44, background: ThusoTheme.surface)
                VStack(alignment: .leading, spacing: 2) {
                    Text(Arrival.nurse.name).thusoFont(ThusoType.cardTitle, weight: .semibold)
                        .foregroundStyle(ThusoTheme.charcoal).fixedSize(horizontal: false, vertical: true)
                    Text(Arrival.nurse.role).font(.footnote)
                        .foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                        .fixedSize(horizontal: false, vertical: true)
                }
                .accessibilityElement(children: .combine)
                Spacer(minLength: 0)
                MetricChip(text: standing(arrival), tone: arrival.isWatching ? .filled : .neutral)
            }
            ThusoMetrics { figures(arrival) }
            if let refusal = arrival.refusal {
                Label(refusal, systemImage: "clock").font(.footnote)
                    .foregroundStyle(ThusoTheme.charcoal).fixedSize(horizontal: false, vertical: true)
                    .accessibilityElement(children: .combine)
            } else if case let .onTheDay(_, _, estimate) = arrival {
                Label(Arrival.basisSentence(estimate), systemImage: "ruler").font(.footnote)
                    .foregroundStyle(ThusoTheme.charcoal).fixedSize(horizontal: false, vertical: true)
                    .accessibilityElement(children: .combine)
            }
        }
    }

    private func standing(_ arrival: Arrival.State) -> String {
        switch arrival {
        case .onTheDay: return "Coming today"
        case let .anotherDay(_, days, _): return "In \(days) \(days == 1 ? "day" : "days")"
        case .finished: return "Behind you"
        default: return "Not yet"
        }
    }

    /* Minutes first, and the chip says what they are before the reader reaches them. Where there is
       nothing to divide, the word is "Estimating" — never a dash, which reads as a number to
       nobody, and never nought, which reads as "she is at the gate". */
    @ViewBuilder private func figures(_ arrival: Arrival.State) -> some View {
        switch arrival {
        case let .onTheDay(from, to, estimate):
            if let minutes = estimate.minutes {
                ThusoMetric(value: String(minutes), unit: "min", label: "\(from.name) to \(to.name)",
                            chip: "Straight line")
            } else {
                ThusoMetric(value: "Estimating", label: to.name, chip: "No distance to measure")
            }
            if let km = estimate.km {
                ThusoMetric(value: String(format: "%.1f", km), unit: "km", label: "Distance measured",
                            chip: "Suburb centres")
            }
            window
        case let .anotherDay(to, days, _):
            ThusoMetric(value: String(days), unit: days == 1 ? "day" : "days", label: "Until the day",
                        chip: "Your visit")
            window
            ThusoMetric(value: to.name, label: "The suburb your visit is in", chip: "Where")
        default:
            window
            if let to = arrival.destination {
                ThusoMetric(value: to.name, label: "The suburb your visit is in", chip: "Where")
            }
        }
    }

    @ViewBuilder private var window: some View {
        if let start = visit.start {
            ThusoMetric(value: start, label: "Your window, until \(Scheduling.endTime(start: start, minutes: visit.service.duration))",
                        chip: "What you were told")
        }
    }

    // MARK: - The picture, and the four things it is not

    private func map(from: Geography.Zone?, to: Geography.Zone) -> some View {
        SurfacePanel(spacing: ThusoSpacing.space12) {
            PanelHead(from.map { "\($0.name) to \(to.name)" } ?? to.name,
                      note: Geography.schematicName)
            ArrivalMap(from: from, to: to, summary: mapSummary(from: from, to: to))
            VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
                if let from { key(ThusoTheme.charcoal, "\(Arrival.nurse.name) · \(from.name)") }
                key(ThusoTheme.mutedSage, "Your visit · \(to.name)")
            }
            /* Both sentences are the geography contract's: how coarse a position is, and that no
               tile server was asked for one. */
            Text(Geography.schematicSentence).font(.footnote)
                .foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                .fixedSize(horizontal: false, vertical: true)
            Text(Arrival.precisionSentence).font(.footnote)
                .foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func key(_ colour: Color, _ label: String) -> some View {
        HStack(spacing: ThusoSpacing.space8) {
            Circle().fill(colour).frame(width: 10, height: 10)
            Text(label).font(.footnote).foregroundStyle(ThusoTheme.charcoal)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }

    private func mapSummary(from: Geography.Zone?, to: Geography.Zone) -> String {
        let base = "Schematic map of \(Geography.city). Your visit is drawn at the centre of \(to.name)."
        guard let from else { return base + " No nurse is drawn, because nobody is on the way yet." }
        return base + " \(Arrival.nurse.name) is drawn at the centre of \(from.name), and a dashed straight line joins the two."
    }

    /* The four things this screen is not, at the same weight as the figure above them. Each is
       something a reader could otherwise reasonably assume the opposite of, and a tracking feature
       normally leaves all four out. */
    private var notTheseThings: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            CareSectionHeader("What this is, and what it is not")
            SurfacePanel(spacing: ThusoSpacing.space16) {
                StatedFact(term: "It is not an arrival time", statement: Arrival.Refusal.notAnArrivalTime,
                           footnote: Capabilities.blocking("dispatch").joined(separator: " "))
                Hairline()
                StatedFact(term: "Neither pin is a house", statement: Arrival.Refusal.noDoorstep,
                           footnote: Arrival.addressRule.why)
                Hairline()
                StatedFact(term: "Nowhere she has been", statement: Arrival.historyRule.statement,
                           footnote: Arrival.historyRule.why)
                Hairline()
                StatedFact(term: "You see this on the day and not before",
                           statement: Arrival.Refusal.onlyOnTheDay)
            }
        }
    }
}

/* The schematic, drawn from coordinates alone.
 *
 * No tile is fetched and no mapping provider is told anything — geography.json's own sentence for
 * why is rendered beside it. Two marks and no more: a controller's board carries five kinds because
 * a controller is choosing between people, and a patient is watching one nurse come to one address.
 * Every extra pin here would be somebody else's nurse going to somebody else's house.
 *
 * The line between them is dashed and dead straight, on purpose. It goes through the buildings, and
 * a curve suggesting a road would be the picture contradicting the sentence under it. */
struct ArrivalMap: View {
    let from: Geography.Zone?
    let to: Geography.Zone
    let summary: String
    /* The picture grows a little with the reader and then stops. A schematic is shapes rather than
       words, so tripling it only pushes everything under it off the screen — and the two sentences
       under the map, which are the part that has to be read, scale on their own. */
    @ScaledMetric(relativeTo: .body) private var side: CGFloat = 260
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        Canvas { context, size in
            let span = min(size.width, size.height)
            func at(_ point: Geography.Point) -> CGPoint {
                let projected = Geography.project(point, size: Double(span))
                return CGPoint(x: projected.x + (size.width - span) / 2, y: projected.y)
            }
            for zone in Geography.zones {
                let radius = Geography.radiusInSquare(zone.radiusKm, size: Double(span))
                let centre = at(zone.at)
                let circle = Path(ellipseIn: CGRect(x: centre.x - radius, y: centre.y - radius,
                                                    width: radius * 2, height: radius * 2))
                context.fill(circle, with: .color(ThusoTheme.softSage.opacity(0.34)))
                context.stroke(circle, with: .color(ThusoTheme.mutedSage.opacity(0.6)), lineWidth: 1)
            }
            if let from {
                var line = Path()
                line.move(to: at(from.at))
                line.addLine(to: at(to.at))
                context.stroke(line, with: .color(ThusoTheme.charcoal.opacity(0.55)),
                               style: StrokeStyle(lineWidth: 2, dash: [5, 4]))
            }
            func mark(_ point: Geography.Point, _ colour: Color) {
                let centre = at(point)
                let dot = Path(ellipseIn: CGRect(x: centre.x - 8, y: centre.y - 8, width: 16, height: 16))
                context.fill(Path(ellipseIn: CGRect(x: centre.x - 11, y: centre.y - 11, width: 22, height: 22)),
                             with: .color(ThusoTheme.surface))
                context.fill(dot, with: .color(colour))
            }
            mark(to.at, ThusoTheme.mutedSage)
            if let from { mark(from.at, ThusoTheme.charcoal) }
            /* Every circle says which suburb it is. A schematic of five unnamed blobs is a picture
               a reader has to be told about; the key names the two that carry a mark, and this
               names the rest — including the ones the coverage sentence says nobody works in. */
            /* Not at the accessibility sizes: the circles are fixed and the words are not, so five
               suburb names at three times the size land on top of one another and on the marks. The
               key below the map carries the same names as real text that reflows. */
            for zone in Geography.zones where !typeSize.isAccessibilitySize {
                let centre = at(zone.at)
                let radius = Geography.radiusInSquare(zone.radiusKm, size: Double(span))
                var label = context.resolve(Text(zone.name).font(.footnote.weight(.medium))
                    .foregroundColor(ThusoTheme.charcoal))
                label.shading = .color(ThusoTheme.charcoal)
                let size = label.measure(in: CGSize(width: span, height: span))
                context.draw(label, at: CGPoint(x: centre.x, y: centre.y + radius + size.height * 0.7),
                             anchor: .center)
            }
        }
        .frame(height: min(side, 340))
        .frame(maxWidth: .infinity)
        .background(ThusoTheme.cloud, in: RoundedRectangle(cornerRadius: ThusoRadius.control, style: .continuous))
        .accessibilityElement()
        .accessibilityLabel(summary)
    }
}
