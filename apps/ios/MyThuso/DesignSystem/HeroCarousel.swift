import SwiftUI

/// The landing banner. It rotates on its own, stops on request (WCAG 2.2.2) and never rotates at
/// all when the system asks for reduced motion. The person rises above the plate; the drifting
/// bubbles and currents behind them are decoration and are hidden from VoiceOver.
struct HeroCarousel: View {
    let onAction: (Int) -> Void
    @EnvironmentObject private var store: PreviewStore
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var index = 0
    @State private var playing = true
    private let rotate = Timer.publish(every: 6.5, on: .main, in: .common).autoconnect()
    private var slides: [HeroSlideCopy] { heroSlides(store.locale) }
    private var rotating: Bool { playing && !reduceMotion }
    var body: some View {
        VStack(spacing: 12) {
            TabView(selection: $index) {
                ForEach(Array(slides.enumerated()), id: \.element.id) { position, slide in
                    slideView(slide, position: position).tag(position)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .frame(height: 366)
            .onReceive(rotate) { _ in
                guard rotating else { return }
                withAnimation(.easeInOut(duration: 0.45)) { index = (index + 1) % slides.count }
            }
            HStack(spacing: 8) {
                ForEach(0..<slides.count, id: \.self) { position in
                    Button {
                        withAnimation(.easeInOut(duration: 0.35)) { index = position }
                        playing = false
                    } label: {
                        Capsule().fill(position == index ? ThusoTheme.teal : ThusoTheme.line)
                            .frame(width: position == index ? 24 : 8, height: 8)
                    }
                    .accessibilityLabel("Highlight \(position + 1) of \(slides.count): \(slides[position].title.replacingOccurrences(of: "\n", with: " "))")
                    .accessibilityAddTraits(position == index ? [.isSelected] : [])
                }
                Spacer()
                if !reduceMotion {
                    Button { playing.toggle() } label: {
                        Image(systemName: playing ? "pause.fill" : "play.fill").font(.system(size: 11, weight: .bold))
                            .foregroundStyle(ThusoTheme.body).frame(width: 32, height: 32)
                            .background(.white, in: Circle()).overlay(Circle().stroke(ThusoTheme.line, lineWidth: 1))
                    }
                    .accessibilityLabel(playing ? "Pause the highlights" : "Play the highlights")
                }
            }
            .padding(.horizontal, 4)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("MyThuso highlights")
    }
    private func slideView(_ slide: HeroSlideCopy, position: Int) -> some View {
        ZStack(alignment: .bottom) {
            RoundedRectangle(cornerRadius: 24)
                .fill(.white.opacity(0.66))
                .overlay(RoundedRectangle(cornerRadius: 24).stroke(.white.opacity(0.85), lineWidth: 1))
                .shadow(color: ThusoTheme.ink.opacity(0.08), radius: 22, y: 12)
                .padding(.top, 62)
            Image(slide.banner).resizable().scaledToFit()
                .frame(width: 208)
                .mask(LinearGradient(stops: [.init(color: .clear, location: 0), .init(color: .black, location: 0.13)], startPoint: .bottom, endPoint: .top))
                .shadow(color: ThusoTheme.ink.opacity(0.14), radius: 14, y: 10)
                .padding(.bottom, 118).padding(.trailing, 0)
                .frame(maxWidth: .infinity, alignment: .trailing)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 0) {
                Text(slide.title).font(.system(size: 24, weight: .bold)).foregroundStyle(ThusoTheme.forest).fixedSize(horizontal: false, vertical: true)
                Text(slide.body).font(.system(size: 12.5)).foregroundStyle(ThusoTheme.body).padding(.top, 8).fixedSize(horizontal: false, vertical: true)
                Button { onAction(position) } label: {
                    HStack(spacing: 9) { Text(slide.cta).font(.system(size: 14, weight: .semibold)); Image(systemName: "arrow.right").font(.system(size: 13, weight: .semibold)) }
                        .padding(.horizontal, 20).padding(.vertical, 13)
                        .background(ThusoTheme.teal, in: Capsule()).foregroundStyle(.white)
                }
                .padding(.top, 15)
                HStack(alignment: .top, spacing: 2) {
                    ForEach(Array(slide.trust.enumerated()), id: \.offset) { spot, label in
                        VStack(spacing: 6) {
                            Image(systemName: slide.symbols[spot]).font(.system(size: 14)).foregroundStyle(ThusoTheme.teal)
                                .frame(width: 32, height: 32).background(.white.opacity(0.78), in: Circle())
                            Text(label).font(.system(size: 10, weight: .semibold)).foregroundStyle(Color(red: 0.26, green: 0.40, blue: 0.36))
                                .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
                        }.frame(maxWidth: .infinity)
                    }
                }.padding(.top, 14)
                Text(slide.caption).font(.system(size: 11, weight: .semibold)).foregroundStyle(ThusoTheme.tealDeep)
                    .padding(.horizontal, 14).padding(.vertical, 8)
                    .background(.white.opacity(0.88), in: Capsule())
                    .padding(.top, 12)
            }
            .frame(maxWidth: 200, alignment: .leading)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.leading, 22).padding(.trailing, 14).padding(.bottom, 16).padding(.top, 78)
        }
        .frame(maxWidth: .infinity, maxHeight: 366)
        .padding(.horizontal, 2)
    }
}
struct HeroTexture: View {
    var tone: Int = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var drift = false
    private var plate: [Color] {
        switch tone {
        case 1: return [Color(red: 0.949, green: 0.976, blue: 0.976), Color(red: 0.859, green: 0.933, blue: 0.941)]
        case 2: return [Color(red: 0.957, green: 0.980, blue: 0.969), Color(red: 0.867, green: 0.937, blue: 0.902)]
        default: return [Color(red: 0.953, green: 0.980, blue: 0.973), Color(red: 0.874, green: 0.941, blue: 0.925)]
        }
    }
    // x, y and radius as a fraction of the plate, then how far and how fast each one drifts.
    private let bubbles: [(x: CGFloat, y: CGFloat, r: CGFloat, dx: CGFloat, dy: CGFloat, scale: CGFloat, seconds: Double)] = [
        (0.13, 0.76, 30, 17, -24, 1.12, 9),
        (0.30, 0.20, 17, -26, 15, 0.86, 12),
        (0.59, 0.81, 23, 14, -18, 1.10, 14),
        (0.78, 0.28, 38, 30, 12, 1.16, 16),
        (0.44, 0.53, 11, -20, -22, 0.88, 7),
        (0.93, 0.68, 15, -24, 16, 1.14, 11),
        (0.05, 0.34, 13, 22, 20, 0.90, 13),
        (0.67, 0.42, 9, -18, -26, 1.18, 8)
    ]
    var body: some View {
        GeometryReader { geo in
            ZStack {
                LinearGradient(colors: plate, startPoint: .topLeading, endPoint: .bottomTrailing)
                ForEach(Array(bubbles.enumerated()), id: \.offset) { position, bubble in
                    Circle().fill(ThusoTheme.teal.opacity(position % 3 == 0 ? 0.07 : 0.10))
                        .frame(width: bubble.r * 2, height: bubble.r * 2)
                        .scaleEffect(drift ? bubble.scale : 2 - bubble.scale)
                        .position(x: bubble.x * geo.size.width, y: bubble.y * geo.size.height)
                        .offset(x: drift ? bubble.dx : -bubble.dx, y: drift ? bubble.dy : -bubble.dy)
                        .animation(reduceMotion ? nil : .easeInOut(duration: bubble.seconds).repeatForever(autoreverses: true).delay(Double(position) * 0.35), value: drift)
                }
                current(geo, lift: 0.78).offset(x: drift ? 40 : -40)
                    .animation(reduceMotion ? nil : .easeInOut(duration: 11).repeatForever(autoreverses: true), value: drift)
                current(geo, lift: 0.90).offset(x: drift ? -38 : 38)
                    .animation(reduceMotion ? nil : .easeInOut(duration: 15).repeatForever(autoreverses: true), value: drift)
            }
        }
        .onAppear { if !reduceMotion { drift = true } }
        .accessibilityHidden(true)
    }
    private func current(_ geo: GeometryProxy, lift: CGFloat) -> some View {
        Path { path in
            let width = geo.size.width, height = geo.size.height
            path.move(to: CGPoint(x: -30, y: height * lift))
            path.addCurve(to: CGPoint(x: width + 30, y: height * (lift - 0.30)),
                          control1: CGPoint(x: width * 0.32, y: height * (lift - 0.22)),
                          control2: CGPoint(x: width * 0.62, y: height * (lift + 0.10)))
        }
        .stroke(ThusoTheme.teal.opacity(0.16), style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
    }
}
