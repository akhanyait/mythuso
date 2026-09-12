import SwiftUI

/* The rotating banner on the roadmap screen.
 *
 * It rotates on its own, stops on request (WCAG 2.2.2) and never rotates at all when the system
 * asks for reduced motion. What changed is the composition, not the behaviour.
 *
 * Each slide used to be a 200-point column of text laid over a photograph inside a 366-point box,
 * with the headline, the body, a button, three trust marks and a caption all fighting for that
 * column. It read as a poster rather than as part of an application, and at the larger text sizes
 * the fixed column and the fixed box argued until something lost. A slide is now a card: the
 * photograph is a band across the top, the words sit under it in the ordinary reading order, and
 * the card is as tall as its contents need. The page control below is the only fixed thing left. */
struct HeroCarousel: View {
    let onAction: (Int) -> Void
    @EnvironmentObject private var store: PreviewStore
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var index = 0
    @State private var playing = true
    private let rotate = Timer.publish(every: 6.5, on: .main, in: .common).autoconnect()
    private var slides: [HeroSlideCopy] { heroSlides(store.locale) }
    /* A TabView in page style needs a height, and this is the only one left in the component. It
       grows with the reader's text size, and the photograph band is dropped entirely at the
       accessibility sizes so the words get the whole card rather than two thirds of it. */
    @ScaledMetric(relativeTo: .body) private var slideHeight: CGFloat = 336
    private var showsPhoto: Bool { !typeSize.isAccessibilitySize }
    private var rotating: Bool { playing && !reduceMotion }

    var body: some View {
        VStack(alignment: .leading, spacing: ThusoSpacing.space12) {
            TabView(selection: $index) {
                ForEach(Array(slides.enumerated()), id: \.element.id) { position, slide in
                    slideView(slide, position: position).tag(position)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .frame(height: slideHeight)
            .onReceive(rotate) { _ in
                guard rotating else { return }
                withAnimation(.easeInOut(duration: 0.45)) { index = (index + 1) % slides.count }
            }
            pageControl
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("MyThuso highlights")
    }

    private var pageControl: some View {
        HStack(spacing: ThusoSpacing.space8) {
            ForEach(0..<slides.count, id: \.self) { position in
                Button {
                    withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.35)) { index = position }
                    playing = false
                } label: {
                    Capsule().fill(position == index ? ThusoTheme.studioNight : ThusoTheme.controlEdge)
                        .frame(width: position == index ? 22 : 6, height: 6)
                        .frame(width: 30, height: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Highlight \(position + 1) of \(slides.count): \(slides[position].title.replacingOccurrences(of: "\n", with: " "))")
                .accessibilityAddTraits(position == index ? [.isSelected] : [])
            }
            Spacer(minLength: 0)
            /* Reduce Motion already stops the rotation, so the control that stops it is redundant
               there and is not shown. Everywhere else it is required. */
            if !reduceMotion {
                Button { playing.toggle() } label: {
                    Image(systemName: playing ? "pause.fill" : "play.fill").font(.caption.weight(.semibold))
                        .foregroundStyle(ThusoTheme.charcoal).frame(width: 32, height: 32)
                        .background(ThusoTheme.surface, in: Circle())
                        .overlay(Circle().stroke(ThusoTheme.controlEdge, lineWidth: 1))
                        .frame(width: 44, height: 44).contentShape(Rectangle())
                }
                .accessibilityLabel(playing ? "Pause the highlights" : "Play the highlights")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func slideView(_ slide: HeroSlideCopy, position: Int) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if showsPhoto {
                /* A band, not a cut-out floating over a plate. The photograph is a masked cut-out,
                   so it stands on the palest sage in the ramp and is cropped by the
                   band rather than by a hand-placed offset. */
                ZStack(alignment: .bottom) {
                    LinearGradient(colors: [ThusoTheme.studioLilac, ThusoTheme.surface], startPoint: .top, endPoint: .bottom)
                    Image(slide.banner).resizable().scaledToFit().frame(height: 150)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                        .padding(.trailing, ThusoSpacing.space20)
                }
                .frame(height: 132).clipped()
                .accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: ThusoSpacing.space8) {
                Text(slide.title.replacingOccurrences(of: "\n", with: " "))
                    .font(.title3.weight(.bold)).foregroundStyle(ThusoTheme.charcoal)
                    .fixedSize(horizontal: false, vertical: true)
                Text(slide.body).font(.footnote).foregroundStyle(ThusoTheme.charcoal.opacity(ThusoOpacity.charcoalMuted))
                    .fixedSize(horizontal: false, vertical: true)
                trustRow(slide)
                Button { onAction(position) } label: {
                    HStack(spacing: ThusoSpacing.space8) {
                        Text(slide.cta)
                        Image(systemName: "arrow.right").font(.footnote.weight(.semibold))
                    }
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, ThusoSpacing.space16).padding(.vertical, ThusoSpacing.space12)
                    .frame(minHeight: 44)
                    .background(ThusoTheme.studioNight, in: Capsule()).foregroundStyle(ThusoTheme.studioPaper)
                }
                .padding(.top, ThusoSpacing.space4)
                Text(slide.caption).font(.caption2.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(ThusoSpacing.space16)
            .frame(maxWidth: .infinity, alignment: .leading)
            Spacer(minLength: 0)
        }
        .background(ThusoTheme.surface, in: RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous).stroke(ThusoTheme.studioLine, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: ThusoRadius.panel, style: .continuous))
        .shadow(color: ThusoTheme.lift, radius: 10, y: 3)
        .padding(.horizontal, 2)
    }

    /* Three trust marks, side by side while they fit and stacked when they do not. They used to be
       three columns of a fixed HStack, so at the larger text sizes each label wrapped to five words
       in a 60-point column. */
    private func trustRow(_ slide: HeroSlideCopy) -> some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .top, spacing: ThusoSpacing.space12) {
                ForEach(Array(slide.trust.enumerated()), id: \.offset) { spot, label in
                    trustMark(slide.symbols[spot], label).frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            VStack(alignment: .leading, spacing: ThusoSpacing.space4) {
                ForEach(Array(slide.trust.enumerated()), id: \.offset) { spot, label in
                    trustMark(slide.symbols[spot], label)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func trustMark(_ symbol: String, _ label: String) -> some View {
        Label {
            Text(label).font(.caption2.weight(.semibold)).foregroundStyle(ThusoTheme.charcoal)
                .fixedSize(horizontal: false, vertical: true)
        } icon: {
            Image(systemName: symbol).font(.caption2).foregroundStyle(ThusoTheme.tealInk)
        }
        .labelStyle(.titleAndIcon)
    }
}

/* The band of brand behind a screen's greeting.
 *
 * This was the last of the old palette left standing: a mint-green plate with eight indigo bubbles
 * drifting across it forever and two wave-shaped strokes sliding the other way. It was drawn when
 * the interface was mint and rounded, and it is the single thing that made a health record look
 * like a children's app. What a greeting needs behind it is a ground, not a scene — so it is now
 * one wash of the brand's own indigo settling into the canvas, with nothing moving on it. Removing
 * the animation also stops an infinite repeatForever running under every visit to the home screen.
 *
 * `tone` still selects a variation, so a screen can be told apart from the one before it without
 * any of them shouting. */
/* The band of light behind the greeting. It was an indigo wash fading into the old blue-grey
   canvas, which on the luminous ground is the last thing on the home still speaking the previous
   palette — and the hard stop where the wash met the canvas drew a line across the screen. It now
   fades to nothing, so it reads as more light at the top rather than as a panel with an edge. */
struct HeroTexture: View {
    var tone: Int = 0
    private var top: Color {
        switch tone {
        case 1: return ThusoTheme.tealSoft
        case 2: return ThusoTheme.mangoSoft
        default: return ThusoTheme.auroraSage
        }
    }
    var body: some View {
        LinearGradient(colors: [top, top.opacity(0)], startPoint: .top, endPoint: .bottom)
            .accessibilityHidden(true)
    }
}
