import SwiftUI

/* Mental health and Activity — two of the ten patient pages, the two the founder asked to have on the
 * phones. Ported from apps/web/src/features/PatientPages.tsx.
 *
 * EVERY WORD IS PatientPagesData's, generated from packages/catalog/patient-pages.json, or a sentence that
 * contract names in another one: the crisis lines through CrisisLinesData, the journal's refusals through
 * WellbeingData, both by what the generator hands over. Nothing is typed here, so the phone cannot word a
 * refusal differently from the web.
 *
 * WHAT THE PHONE DOES NOT HAVE, IT DOES NOT DRAW. The web's mental-health page has four doors; two of them
 * open the health library and community support, which are web pages. The contract's drawnOn.ios names
 * them and the generator hands the list over, so those doors are simply absent here — no web view, no
 * copy of a screen the phone does not have. The catalogue button is absent for the same reason: the
 * phone's catalogue carries the first phase only, so the counselling check-in's own name and phase, as
 * services.json holds them, stand where the button would be. There is no hub on the phone, so there is no
 * way back to one; the pages are reached from More.
 *
 * THE HIERARCHY. On mental health the loud object is the crisis card, and it is the one dark card on the
 * screen: the emergency screen first, as the only filled button, then the crisis lines, then the sentence
 * that says nothing here dials them. The two refusals under it — no counsellor yet, no mood score — are
 * plain cards, because a refusal is read, not acted on. On activity the subject is what somebody wrote, so
 * the tiles are one quiet card of rows whose only figure is the count of the entries beneath it, and the
 * one primary button writes another.
 *
 * THE REVIEW NOTICE sits directly under each page's lead, never in the panel at the foot: it qualifies
 * everything on the page, and at the accessibility sizes the foot is several screens away. */

// MARK: - The frame both pages share

private struct PatientPageFrame<Content: View>: View {
    let title: String
    let symbol: String
    let eyebrow: String
    let heading: String
    let lead: String
    @ViewBuilder var content: Content
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ThusoSpacing.space24) {
                DemoBadge()
                header
                if PatientPagesData.Review.reviewedBy == nil {
                    ThusoAlert(.info, title: PatientPagesData.Aside.reviewHeading, text: PatientPagesData.Review.notice)
                }
                content
                refusals
            }
            .padding(.vertical, ThusoSpacing.space16)
        }
        .contentMargins(.horizontal, ThusoSpacing.space20, for: .scrollContent)
        .thusoGround()
        .navigationTitle(title).navigationBarTitleDisplayMode(.inline)
    }

    /* The plate is dropped at the accessibility sizes rather than shrunk, as NavPillLabel drops its
       glyph: beside three lines of wrapped heading it is a decoration taking a third of the column. */
    private var header: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            HStack(alignment: .center, spacing: ThusoSpacing.space12) {
                if !typeSize.isAccessibilitySize { TileIcon(symbol: symbol, size: 44) }
                Text(eyebrow.uppercased()).thusoFont(ThusoType.caption, weight: .semibold).tracking(1.2)
                    .foregroundStyle(ThusoRole.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text(heading).font(ThusoFont.heading).foregroundStyle(ThusoRole.foreground)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            Text(lead).font(.thuso(.subheadline)).foregroundStyle(ThusoRole.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    /* The contract's four refusals, all of them, at the foot of every page — the web's aside. */
    private var refusals: some View {
        ThusoCard(padding: .md, spacing: ThusoSpacing.space12) {
            Text(PatientPagesData.Aside.refusalsHeading).font(.thuso(.headline)).foregroundStyle(ThusoRole.foreground)
                .accessibilityAddTraits(.isHeader)
            ForEach(PatientPagesData.refusals, id: \.self) { sentence in
                HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space12) {
                    Image(systemName: "nosign").foregroundStyle(ThusoRole.mutedForeground).accessibilityHidden(true)
                    Text(sentence).font(.thuso(.subheadline)).foregroundStyle(ThusoRole.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .accessibilityElement(children: .combine)
            }
        }
    }
}

/// A row that leads somewhere: a quiet symbol, the door's two lines, and which way it goes.
private struct DoorLabel: View {
    let symbol: String
    let title: String
    let sub: String
    var trailing = "chevron.right"
    @Environment(\.dynamicTypeSize) private var typeSize
    var body: some View {
        HStack(alignment: .center, spacing: ThusoSpacing.space12) {
            if !typeSize.isAccessibilitySize {
                Image(systemName: symbol).font(.thuso(.body)).foregroundStyle(ThusoRole.foreground)
                    .frame(width: 24).accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                Text(sub).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: trailing).font(.thuso(.footnote, weight: .semibold)).foregroundStyle(ThusoRole.mutedForeground)
                .accessibilityHidden(true)
        }
        .padding(.horizontal, ThusoSpacing.space16).padding(.vertical, ThusoSpacing.space12)
        .frame(minHeight: 44)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Mental health

struct MentalHealthPageView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @AccessibilityFocusState private var crisisFocused: Bool
    private typealias Words = PatientPagesData.MentalHealth

    var body: some View {
        ScrollViewReader { proxy in
            PatientPageFrame(title: Words.opens, symbol: "lifepreserver", eyebrow: Words.eyebrow,
                             heading: Words.heading, lead: Words.lead) {
                doors(proxy)
                crisis
                session
                mood
            }
        }
    }

    /* The contract's doors less the ones drawnOn.ios leaves out. A door whose id has no case below is
       not drawn at all — scripts/check-boundaries.mjs fails the build if the contract draws a door on the
       phone that this switch does not open. */
    private func doors(_ proxy: ScrollViewProxy) -> some View {
        ThusoCard(padding: .none, spacing: 0) {
            ForEach(Array(PatientPages.doors.enumerated()), id: \.element.id) { index, door in
                if index > 0 { ThusoDivider() }
                switch door.id {
                case "journal":
                    NavigationLink { LiveWellView() } label: {
                        DoorLabel(symbol: "text.bubble", title: door.title, sub: door.sub)
                    }.buttonStyle(.plain)
                case "crisis":
                    /* The anchor: the card is on this page, so the door brings it into view and moves
                       VoiceOver to its heading, rather than opening anything. */
                    Button {
                        withAnimation(reduceMotion ? nil : ThusoMotion.soft()) { proxy.scrollTo(door.target, anchor: .top) }
                        crisisFocused = true
                    } label: {
                        DoorLabel(symbol: "cross.case", title: door.title, sub: door.sub, trailing: "arrow.down")
                    }.buttonStyle(.plain)
                default:
                    EmptyView()
                }
            }
        }
    }

    /* The emergency screen before the crisis lines, always — the card's first control is the door to
       the ambulance, and a crisis line comes after it and never instead of it. The numbers are shown
       and never dialled: there is no call action, which is the contract's own refusal printed under
       them. */
    private var crisis: some View {
        StudioNightCard {
            Label {
                Text(Words.Crisis.heading).font(.thuso(.title3, weight: .semibold)).fixedSize(horizontal: false, vertical: true)
            } icon: {
                Image(systemName: "lifepreserver").accessibilityHidden(true)
            }
            .studioNightInk()
            .accessibilityAddTraits(.isHeader)
            .accessibilityFocused($crisisFocused)
            Text(Words.Crisis.emergencyFirst).font(.thuso(.subheadline)).studioNightInk(quiet: true)
                .fixedSize(horizontal: false, vertical: true)
            NavigationLink { SosView() } label: {
                Label(Words.Crisis.action, systemImage: "arrow.right").labelStyle(TrailingIconLabelStyle())
            }
            .buttonStyle(ThusoButtonStyle(.accent, size: .lg, fullWidth: true))
            Text(Gilbert.Crisis.heading).font(.thuso(.subheadline, weight: .semibold)).studioNightInk()
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, ThusoSpacing.space8)
            VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
                ForEach(PatientPages.crisisLines) { item in crisisLine(item) }
            }
            Text(Words.Crisis.nothingDials).font(.thuso(.footnote)).studioNightInk(quiet: true)
                .fixedSize(horizontal: false, vertical: true)
        }
        .id(Words.doors.first { $0.kind == "anchor" }?.target ?? "")
    }

    /* The name and the number on one line while they fit, the number in tabular figures so two lines
       align; stacked when they do not. VoiceOver reads the number as the contract spells it aloud, digit
       by digit, rather than as a quantity. */
    private func crisisLine(_ item: PatientPages.CrisisLine) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline, spacing: ThusoSpacing.space8) {
                    Text(item.line.name).font(.thuso(.subheadline, weight: .semibold))
                    Spacer(minLength: ThusoSpacing.space8)
                    Text(item.line.number).font(.thuso(.body, weight: .semibold).monospacedDigit())
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.line.name).font(.thuso(.subheadline, weight: .semibold)).fixedSize(horizontal: false, vertical: true)
                    Text(item.line.number).font(.thuso(.body, weight: .semibold).monospacedDigit())
                }
            }
            .studioNightInk()
            if let when = item.whenToUse {
                Text(when).font(.thuso(.footnote)).studioNightInk(quiet: true)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel([item.line.name, item.line.spoken, item.whenToUse].compactMap { $0 }.joined(separator: ". "))
        .accessibilityIdentifier("pp-crisis-line")
    }

    /* No counsellor to book: the catalogue's own entry for the check-in, with its phase, where the
       export drew "Available now". Not a button — the phone has no catalogue page that carries it. */
    private var session: some View {
        ThusoCard(padding: .md, spacing: ThusoSpacing.space8) {
            refusalHeading(Words.Session.heading)
            Text(Words.Session.detail).font(.thuso(.subheadline)).foregroundStyle(ThusoRole.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
            Label(Words.Session.catalogueEntry, systemImage: "calendar")
                .font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, ThusoSpacing.space4)
        }
    }

    /* Where the export drew five faces from Great to Struggling: the wellbeing contract's refusal of a
       score, and its reason the journal asks for words rather than a scale. */
    private var mood: some View {
        ThusoCard(padding: .md, spacing: ThusoSpacing.space8) {
            refusalHeading(Words.Mood.heading)
            if let refusal = WellbeingData.refusal(Words.Mood.refusalId) {
                Text(refusal.sentence).font(.thuso(.subheadline)).foregroundStyle(ThusoRole.foreground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text(Words.Mood.why).font(.thuso(.subheadline)).foregroundStyle(ThusoRole.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func refusalHeading(_ text: String) -> some View {
        Label {
            Text(text).font(.thuso(.headline)).fixedSize(horizontal: false, vertical: true)
        } icon: {
            Image(systemName: "nosign").foregroundStyle(ThusoRole.mutedForeground).accessibilityHidden(true)
        }
        .foregroundStyle(ThusoRole.foreground)
        .accessibilityAddTraits(.isHeader)
    }
}

// MARK: - Activity

struct ActivityPageView: View {
    @EnvironmentObject private var store: PreviewStore
    @Environment(\.dynamicTypeSize) private var typeSize
    private typealias Words = PatientPagesData.Activity
    private var moving: [WellbeingEntry] { PatientPages.movingEntries(store.wellbeing) }

    var body: some View {
        PatientPageFrame(title: Words.opens, symbol: "figure.walk", eyebrow: Words.eyebrow,
                         heading: Words.heading, lead: Words.lead) {
            if let noDevice = WellbeingData.refusal(Words.noDeviceId) {
                Label(noDevice.sentence, systemImage: "nosign")
                    .font(.thuso(.subheadline)).foregroundStyle(ThusoRole.foreground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            tiles
            entries
            actions
            wearable
        }
    }

    /* The export's three figures as one card of rows, the values in a column of their own. Two say in
       words that nothing measured them; the third is the number of entries listed under the card. */
    private var tiles: some View {
        ThusoCard(padding: .none, spacing: 0) {
            ForEach(Array(Words.tiles.enumerated()), id: \.element.id) { index, tile in
                if index > 0 { ThusoDivider() }
                tileRow(tile)
            }
        }
    }

    private func tileRow(_ tile: PatientPagesData.Activity.Tile) -> some View {
        let value = PatientPages.value(of: tile, counting: moving)
        let counted = PatientPages.isCount(tile)
        let words = VStack(alignment: .leading, spacing: 2) {
            Text(tile.label).font(.thuso(.subheadline, weight: .semibold)).foregroundStyle(ThusoRole.foreground)
                .fixedSize(horizontal: false, vertical: true)
            Text(tile.detail).font(.thuso(.footnote)).foregroundStyle(ThusoRole.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
        }
        let figure = Text(value)
            .font(counted ? .thuso(.title2, weight: .semibold).monospacedDigit() : .thuso(.subheadline))
            .foregroundStyle(counted ? ThusoRole.foreground : ThusoRole.mutedForeground)
        /* The value keeps a column of its own beside the words until the reader's text size is an
           accessibility size, and goes under them only then. Chosen by the setting rather than by
           ViewThatFits, which measured the detail line unwrapped and stacked every row at the default. */
        let row = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: ThusoSpacing.space4))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: ThusoSpacing.space16))
        return row {
            words.frame(maxWidth: .infinity, alignment: .leading)
            figure.fixedSize(horizontal: !typeSize.isAccessibilitySize, vertical: true)
        }
        .padding(.horizontal, ThusoSpacing.space16).padding(.vertical, ThusoSpacing.space12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(tile.label): \(value). \(tile.detail)")
        .accessibilityIdentifier("pp-tile-\(tile.id)")
    }

    private var entries: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
            CareSectionHeader(Words.entriesHeading)
            if moving.isEmpty {
                EmptyStateCard(title: Words.emptyTitle, message: Words.emptyDetail, symbol: "figure.walk")
            } else {
                ThusoCard(padding: .none, spacing: 0) {
                    ForEach(Array(moving.enumerated()), id: \.element.id) { index, entry in
                        if index > 0 { ThusoDivider() }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(Wellbeing.day(entry.dayOffset).uppercased())
                                .thusoFont(ThusoType.caption, weight: .semibold).tracking(1.1)
                                .foregroundStyle(ThusoRole.mutedForeground)
                            Text(entry.text).font(.thuso(.subheadline)).foregroundStyle(ThusoRole.foreground)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(.horizontal, ThusoSpacing.space16).padding(.vertical, ThusoSpacing.space12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .accessibilityElement(children: .combine)
                        .accessibilityIdentifier("pp-moving-entry")
                    }
                }
            }
        }
    }

    /* The page's one primary: write another entry. Directly under the entries it adds to, rather than
       below the wearable card as the web's wide layout has room to put it. */
    private var actions: some View {
        ForEach(Words.actions, id: \.self) { action in
            switch action.target {
            case "Live well":
                NavigationLink { LiveWellView() } label: { Text(action.label) }.buttonStyle(CareButton())
            default:
                EmptyView()
            }
        }
    }

    /* In place of the export's "synced 5 minutes ago": the door to the one real action, a request to
       link Apple Health that reads nothing. The phone's connected-devices screen is the device
       permission screen the Passport opens, so that is where this goes. */
    private var wearable: some View {
        ThusoCard(padding: .md, spacing: ThusoSpacing.space8) {
            Text(Words.Wearable.heading).font(.thuso(.headline)).foregroundStyle(ThusoRole.foreground)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            Text(Words.Wearable.detail).font(.thuso(.subheadline)).foregroundStyle(ThusoRole.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
            NavigationLink { DevicePermissionView(integration: DeviceIntegration.of("apple-health")) } label: {
                Label(Words.Wearable.action, systemImage: "arrow.right").labelStyle(TrailingIconLabelStyle())
            }
            .buttonStyle(QuietButton())
            .padding(.top, ThusoSpacing.space4)
        }
    }
}
