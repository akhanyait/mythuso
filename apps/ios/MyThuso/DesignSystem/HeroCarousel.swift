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
            .frame(height: 300)
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
            ZStack(alignment: .trailing) {
                HeroTexture(tone: position)
                Image(slide.banner).resizable().scaledToFill()
                    .frame(width: 158).clipped()
                    .mask(LinearGradient(stops: [.init(color: .clear, location: 0), .init(color: .black, location: 0.3)], startPoint: .leading, endPoint: .trailing))
                    .accessibilityHidden(true)
            }
            .clipShape(RoundedRectangle(cornerRadius: 18))
            .padding(.top, 40)
            VStack(alignment: .leading, spacing: 0) {
                Text(slide.title).font(.system(size: 24, weight: .bold)).foregroundStyle(ThusoTheme.forest).fixedSize(horizontal: false, vertical: true)
                Text(slide.body).font(.system(size: 12.5)).foregroundStyle(ThusoTheme.body).padding(.top, 8).fixedSize(horizontal: false, vertical: true)
                Button { onAction(position) } label: {
                    HStack(spacing: 9) { Text(slide.cta).font(.system(size: 14, weight: .semibold)); Image(systemName: "arrow.right").font(.system(size: 13, weight: .semibold)) }
                        .padding(.horizontal, 20).padding(.vertical, 13)
                        .background(ThusoTheme.teal, in: Capsule()).foregroundStyle(.white)
                }
                .padding(.top, 15)
                HStack(alignment: .top, spacing: 5) {
                    ForEach(Array(slide.trust.enumerated()), id: \.offset) { spot, label in
                        VStack(spacing: 6) {
                            Image(systemName: slide.symbols[spot]).font(.system(size: 14)).foregroundStyle(ThusoTheme.teal)
                                .frame(width: 32, height: 32).background(.white.opacity(0.78), in: Circle())
                            Text(label).font(.system(size: 10, weight: .semibold)).foregroundStyle(Color(red: 0.26, green: 0.40, blue: 0.36))
                                .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
                        }.frame(width: 66)
                    }
                }.padding(.top, 14)
            }
            .frame(maxWidth: 206, alignment: .leading)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.leading, 20).padding(.trailing, 8).padding(.bottom, 16).padding(.top, 54)
        }
        .frame(maxWidth: .infinity, maxHeight: 300)
        .clipped()
        .padding(.horizontal, 2)
    }
}
private struct HeroTexture: View {
    let tone: Int
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var drift = false
    private var plate: [Color] {
        switch tone {
        case 1: return [Color(red: 0.949, green: 0.976, blue: 0.976), Color(red: 0.859, green: 0.933, blue: 0.941)]
        case 2: return [Color(red: 0.957, green: 0.980, blue: 0.969), Color(red: 0.867, green: 0.937, blue: 0.902)]
        default: return [Color(red: 0.953, green: 0.980, blue: 0.973), Color(red: 0.874, green: 0.941, blue: 0.925)]
        }
    }
    private let bubbles: [(CGFloat, CGFloat, CGFloat, Double)] = [
        (0.13, 0.76, 30, 11), (0.30, 0.20, 17, 16), (0.59, 0.81, 23, 13), (0.78, 0.28, 38, 19), (0.44, 0.53, 11, 9), (0.93, 0.68, 15, 17)
    ]
    var body: some View {
        GeometryReader { geo in
            ZStack {
                LinearGradient(colors: plate, startPoint: .topLeading, endPoint: .bottomTrailing)
                ForEach(Array(bubbles.enumerated()), id: \.offset) { position, bubble in
                    Circle().fill(ThusoTheme.teal.opacity(position % 3 == 0 ? 0.07 : 0.10))
                        .frame(width: bubble.2 * 2, height: bubble.2 * 2)
                        .position(x: bubble.0 * geo.size.width, y: bubble.1 * geo.size.height)
                        .offset(x: drift ? 7 : -7, y: drift ? -11 : 11)
                        .animation(reduceMotion ? nil : .easeInOut(duration: bubble.3).repeatForever(autoreverses: true).delay(Double(position) * 0.4), value: drift)
                }
                current(geo, lift: 0.78).offset(x: drift ? 24 : -24)
                    .animation(reduceMotion ? nil : .easeInOut(duration: 14).repeatForever(autoreverses: true), value: drift)
                current(geo, lift: 0.90).offset(x: drift ? -20 : 20)
                    .animation(reduceMotion ? nil : .easeInOut(duration: 18).repeatForever(autoreverses: true), value: drift)
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
